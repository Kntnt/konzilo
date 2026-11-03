// Fill a new Forgejo: the instance's second factor and credential, an account with a
// known password and a second factor, an organisation with its two teams, a source
// repository holding the demo content, and the editor's OAuth client (ADR 0002,
// ADR 0007, ADR 0008). It talks to Forgejo itself, behind the proxy, since the proxy
// refuses making a token, and there is no API for a second factor, so an account
// enrols through the forms a person uses. Each step looks first, so that a seed
// stopped half way can run again.

import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { demoSource, GIT_ATTRIBUTES } from '../../src/demo-source.js';
import { readSiteDescription } from '../../src/site-description.js';
import { totp } from '../../src/totp.js';

const FORGEJO = 'http://forgejo:3000';
const STATE = '/state';
const {
  KONZILO_SITE: site,
  KONZILO_ACCOUNT: account,
  KONZILO_ADMIN_ORIGIN: adminOrigin,
} = process.env;
const REPOSITORY = 'source';

const secret = (name) => readFileSync(`/run/secrets/${name}`, 'utf8').trim();
const known = (name) => (existsSync(join(STATE, name)) ? readFileSync(join(STATE, name), 'utf8').trim() : null);
const remember = (name, value) => {
  writeFileSync(join(STATE, name), `${value}\n`);
  chmodSync(join(STATE, name), 0o600);
};

// A browser's visit, with its cookies, following no redirect by itself.
function visitor() {
  const cookies = new Map();
  const send = async (path, init = {}) => {
    const answer = await fetch(`${FORGEJO}${path}`, {
      redirect: 'manual',
      ...init,
      headers: { ...init.headers, cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
    });
    for (const cookie of answer.headers.getSetCookie()) {
      const [pair] = cookie.split(';');
      const at = pair.indexOf('=');
      cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return answer;
  };
  const form = (path, fields) => send(path, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(fields),
  });
  return { send, form };
}

// A second factor, through the forms, since there is no API for it. Forgejo makes the
// key and shows it once; remembering it here is what gives a local account a code a
// command can print.
async function enrol(user, password, keyFile) {
  const already = known(keyFile);
  if (already) return already;
  const { send, form } = visitor();
  const signedIn = await form('/user/login', { user_name: user, password });
  if (signedIn.status !== 303) throw new Error(`signing in as ${user}: ${signedIn.status}`);
  const page = await (await send('/user/settings/security/two_factor/enroll')).text();
  const key = /Or enter the secret: ([A-Z2-7]+)/.exec(page)?.[1];
  if (!key) throw new Error(`no secret on the enrolment page of ${user}`);
  const enrolled = await form('/user/settings/security/two_factor/enroll', { passcode: totp(key) });
  if (enrolled.status !== 303) throw new Error(`enrolling ${user}: ${enrolled.status}`);
  remember(keyFile, key);
  return key;
}

const basic = (user, password) => `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;

// The instance's credential. A password alone gets nothing once there is a second
// factor; with the code it makes a token that needs none from then on (ADR 0007).
async function instanceToken(password, key) {
  const already = known('instance-token');
  if (already) return already;
  const answer = await fetch(`${FORGEJO}/api/v1/users/konzilo/tokens`, {
    method: 'POST',
    headers: { authorization: basic('konzilo', password), 'x-forgejo-otp': totp(key), 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'konzilo', scopes: ['write:admin', 'write:organization', 'write:repository', 'write:user'] }),
  });
  if (answer.status !== 201) throw new Error(`making the instance's token: ${answer.status} ${await answer.text()}`);
  const { sha1 } = await answer.json();
  remember('instance-token', sha1);
  return sha1;
}

const api = (token) => async (method, path, body) => {
  const answer = await fetch(`${FORGEJO}/api/v1${path}`, {
    method,
    headers: { authorization: `token ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await answer.text();
  return { status: answer.status, body: text && answer.headers.get('content-type')?.includes('json') ? JSON.parse(text) : text };
};

const must = (what, { status, body }, ...expected) => {
  if (!expected.includes(status)) throw new Error(`${what}: ${status} ${JSON.stringify(body)}`);
  return body;
};

async function pushDemoContent(token) {
  const folder = mkdtempSync(join(tmpdir(), 'source-'));
  const git = (...args) => execFileSync('git', args, {
    cwd: folder,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, HOME: folder, GIT_TERMINAL_PROMPT: '0' },
  });
  git('init', '--quiet', '--initial-branch=main');
  git('config', 'advice.ignoredHook', 'false');
  git('config', 'user.name', 'Konzilo');
  git('config', 'user.email', 'konzilo@localhost.invalid');
  git('lfs', 'install', '--local', '--skip-repo');
  writeFileSync(join(folder, '.gitattributes'), GIT_ATTRIBUTES);
  const description = readSiteDescription('/site/site-description.json');
  for (const { path, content } of demoSource(description, '/konzilo/site-template/demo-content')) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  git('add', '--all');
  git('commit', '--quiet', '--message=Start with the demo content');
  git('remote', 'add', 'origin', `http://konzilo:${token}@forgejo:3000/${site}/${REPOSITORY}.git`);
  // Hooks cannot run from a noexec temporary folder, so LFS is pushed by name.
  git('lfs', 'push', '--all', 'origin', 'main');
  git('push', '--quiet', 'origin', 'main');
}

async function main() {
  if (known('seeded')) return;

  const instancePassword = secret('instance-password');
  const accountPassword = secret('account-password');
  const instanceKey = await enrol('konzilo', instancePassword, 'instance-totp');
  const token = await instanceToken(instancePassword, instanceKey);
  const call = api(token);

  must('making the account', await call('POST', '/admin/users', {
    username: account,
    email: `${account}@localhost.invalid`,
    password: accountPassword,
    must_change_password: false,
    send_notify: false,
    visibility: 'private',
  }), 201, 422);
  await enrol(account, accountPassword, 'account-totp');

  must('making the organisation', await call('POST', '/orgs', {
    username: site,
    visibility: 'private',
    repo_admin_change_team_access: false,
  }), 201, 422);

  // Write access and never ownership, so that no customer reaches webhooks or
  // settings (ADR 0008).
  const teams = must('listing the teams', await call('GET', `/orgs/${site}/teams`), 200);
  const team = async (name) => teams.find((one) => one.name === name) ?? must(`making the team ${name}`, await call('POST', `/orgs/${site}/teams`, {
    name,
    permission: 'write',
    includes_all_repositories: true,
    can_create_org_repo: false,
    units: ['repo.code'],
  }), 201);
  const admins = await team('admins');
  await team('editors');
  must('adding the account to its team', await call('PUT', `/teams/${admins.id}/members/${account}`), 204);

  const made = await call('POST', `/orgs/${site}/repos`, { name: REPOSITORY, private: true, auto_init: false, default_branch: 'main' });
  must('making the repository', made, 201, 409);
  const branches = must('listing the branches', await call('GET', `/repos/${site}/${REPOSITORY}/branches`), 200);
  if (branches.length === 0) await pushDemoContent(token);

  // One OAuth client per Forgejo, public, with PKCE only (ADR 0007).
  if (!known('oauth-client')) {
    const client = must('making the OAuth client', await call('POST', '/user/applications/oauth2', {
      name: 'Konzilo',
      redirect_uris: [`${adminOrigin}/`],
      confidential_client: false,
    }), 201);
    remember('oauth-client', client.client_id);
  }

  remember('seeded', new Date().toISOString());
}

await main();
console.log('seed: done');
