// Fill a new Forgejo: the instance's second factor and credential, an organisation with its
// three teams, a source repository holding the demo content, the site repository's own where it
// has any, else the core's (ADR 0025), the editor's OAuth client and the live preview's,
// Typesense's keys, and the local copy's people, each with a known password and a second factor,
// in the team of their role (ADR 0002, ADR 0007, ADR 0008, ADR 0053). It talks to Forgejo
// itself, behind the proxy, since the proxy refuses making a token, and there is no API for a
// second factor, so an account enrols through the forms a person uses. Each step looks first,
// so that a seed stopped half way can run again, and a copy seeded before gains what a later
// start asks for. It finds Forgejo, and the service for editors that Forgejo's webhook reaches,
// where the arrangement says (src/arrangement.js).

import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { arrangement } from '../../src/arrangement.js';
import { SIGN_IN_PATH } from '../../src/cms/preview/paths.js';
import { demoContentOf } from '../../src/demo-content.js';
import { demoSource, GIT_ATTRIBUTES } from '../../src/demo-source.js';
import { ACCOUNT_NAME, keyFileOf, passwordFilesOf, peopleOf, seat } from '../../src/people.js';
import { readSiteDescriptionWithoutTakenComponents } from '../../src/site-description.js';
import { totp } from '../../src/totp.js';

const { forgejo: FORGEJO, editors: EDITORS } = arrangement();
const STATE = '/state';
// The site repository, read-only.
const SITE = '/site';
const {
  KONZILO_SITE: site,
  KONZILO_ADMIN_ORIGIN: adminOrigin,
  KONZILO_PREVIEW_ORIGIN: previewOrigin,
} = process.env;
const REPOSITORY = 'source';
const CONTENT = 'content';
const SERVICE_HOOK = `${EDITORS}/webhook`;
// Admins and Editors write to the source, and Reviewers read it alone, so that Forgejo refuses
// whatever a Reviewer pushes (ADR 0008).
const TEAMS = { admins: 'write', editors: 'write', reviewers: 'read' };
const READER = 'preview-reader';
const READ_TOKEN = '/preview-secret/read-token';
// The live preview's own OAuth client, for a sign-in in a tab of its own (ADR 0032): apart from
// the editor's, so that each has a grant and a scope of its own.
const PREVIEW_CLIENT = '/preview-secret/oauth-client';
const PREVIEW_CLIENT_NAME = 'Konzilo live preview';
const SERVICE_READER = 'service-reader';
const SERVICE_TOKEN = '/editors-secret/read-token';
const SERVICE_ROLES_TOKEN = '/editors-secret/roles-token';
const BUILDER = 'builder';
const BUILDER_TOKEN = '/builder-secret/token';
const BUILDER_CLIENT = '/builder-secret/oauth-client';
const ROLES_TOKEN = '/builder-secret/roles-token';
const SEARCH_ADMIN_KEY = '/builder-secret/typesense-admin-key';
const SEARCH_KEY = '/builder-secret/typesense-search-key';
const TYPESENSE_CONFIG = '/typesense-secret/typesense.ini';

const SECRETS = '/run/secrets';
const secret = (name) => readFileSync(join(SECRETS, name), 'utf8').trim();
const known = (name) => (existsSync(join(STATE, name)) ? readFileSync(join(STATE, name), 'utf8').trim() : null);
const remember = (name, value) => {
  mkdirSync(dirname(join(STATE, name)), { recursive: true, mode: 0o700 });
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
  // An account given a second factor elsewhere has a key the seed never saw, and none to keep.
  if (!key) throw new Error(`no secret on the enrolment page of ${user}, who may have a second factor the seed did not enrol, whose key it cannot keep`);
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

const request = async (path, body, authorization, otp) => {
  const answer = await fetch(`${FORGEJO}/api/v1${path}`, {
    method: 'POST',
    headers: { authorization, 'x-forgejo-otp': otp, 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
  // The demo content's bodies are copied as they are, so the seed reads none.
  const description = readSiteDescriptionWithoutTakenComponents(`${SITE}/site-description.json`);
  for (const { path, content } of demoSource(description, demoContentOf(SITE))) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), content);
  }
  git('add', '--all');
  git('commit', '--quiet', '--message=Start with the demo content');
  const remote = new URL(`${FORGEJO}/${site}/${REPOSITORY}.git`);
  remote.username = 'konzilo';
  remote.password = token;
  git('remote', 'add', 'origin', remote.href);
  // Hooks cannot run from a noexec temporary folder, so LFS is pushed by name.
  git('lfs', 'push', '--all', 'origin', 'main');
  git('push', '--quiet', 'origin', 'main');
}

// A machine's account and credential, in a volume of its own, so that it holds nothing else of
// what the seed knows. Its password nobody keeps, since this token is all it is for.
async function machineAccount(call, { name, tokenFile, scopes, keyFile = `${name}-totp`, grant }) {
  if (existsSync(tokenFile)) return;
  const password = randomBytes(24).toString('base64url');
  must(`making the account ${name}`, await call('POST', '/admin/users', {
    username: name,
    email: `${name}@localhost.invalid`,
    password,
    must_change_password: false,
    send_notify: false,
    visibility: 'private',
  }), 201);
  const key = await enrol(name, password, keyFile);
  await grant();
  const { sha1 } = must(`making the token of ${name}`, await request(`/users/${name}/tokens`, { name, scopes }, basic(name, password), totp(key)), 201);
  writeFileSync(tokenFile, `${sha1}\n`, { mode: 0o600 });
}

// A team that has this one repository and no other, so that the people in it never reach the
// content repository, which only a build writes (ADR 0001).
async function teamOfTheSource(call, name, permission) {
  const teams = must('listing the teams', await call('GET', `/orgs/${site}/teams`), 200);
  const found = teams.find((one) => one.name === name);
  const team = found ?? must(`making the team ${name}`, await call('POST', `/orgs/${site}/teams`, {
    name,
    permission,
    includes_all_repositories: false,
    can_create_org_repo: false,
    units: ['repo.code'],
  }), 201);
  if (found?.includes_all_repositories) {
    // Without what it may do, Forgejo answers 200 and changes nothing, so the answer is read.
    const changed = must(`keeping the team ${name} to the source`, await call('PATCH', `/teams/${team.id}`, { name, permission, includes_all_repositories: false, units_map: { 'repo.code': permission } }), 200);
    if (changed.includes_all_repositories !== false) throw new Error(`the team ${name} still has every repository`);
  }
  must(`giving the team ${name} the source`, await call('PUT', `/teams/${team.id}/repos/${site}/${REPOSITORY}`), 204);
  must(`keeping the team ${name} from the content`, await call('DELETE', `/teams/${team.id}/repos/${site}/${CONTENT}`), 204, 404);
  return team;
}

// The live preview's OAuth client, public, with PKCE only, as the editor's (ADR 0007), whose one
// address is the preview's own, as it is at this start.
async function previewClient(call) {
  const address = `${previewOrigin}${SIGN_IN_PATH}`;
  const wanted = { name: PREVIEW_CLIENT_NAME, redirect_uris: [address], confidential_client: false };
  const clients = must('listing the OAuth clients', await call('GET', '/user/applications/oauth2?limit=50'), 200);
  const found = clients.find(({ name }) => name === PREVIEW_CLIENT_NAME);
  let client = found;
  if (!found) client = must('making the preview\'s OAuth client', await call('POST', '/user/applications/oauth2', wanted), 201);
  else if (found.confidential_client || found.redirect_uris.join('\n') !== address) {
    client = must('keeping the preview\'s OAuth client to its address', await call('PATCH', `/user/applications/oauth2/${found.id}`, wanted), 200);
  }
  writeFileSync(PREVIEW_CLIENT, `${client.client_id}\n`, { mode: 0o600 });
}

// What publishing stands on, which every start makes sure of, so that a site seeded before it
// came gets it with its next start.
async function publishing(call, instancePassword, instanceKey) {
  for (const [name, permission] of Object.entries(TEAMS)) await teamOfTheSource(call, name, permission);
  const made = await call('POST', `/orgs/${site}/repos`, { name: CONTENT, private: true, auto_init: false, default_branch: 'main' });
  must('making the content repository', made, 201, 409);
  await machineAccount(call, {
    name: BUILDER,
    tokenFile: BUILDER_TOKEN,
    scopes: ['write:repository'],
    grant: async () => {
      must('letting the builder read the source', await call('PUT', `/repos/${site}/${REPOSITORY}/collaborators/${BUILDER}`, { permission: 'read' }), 204);
      must('letting the builder write the content', await call('PUT', `/repos/${site}/${CONTENT}/collaborators/${BUILDER}`, { permission: 'write' }), 204);
    },
  });
  // Who is an Admin, and what a private account pushed, Forgejo tells only those who run it: a
  // token of the instance's account that can do nothing but read.
  if (!existsSync(ROLES_TOKEN)) {
    const { sha1 } = must('making the token that reads the roles', await request('/users/konzilo/tokens', { name: `roles-${randomBytes(4).toString('hex')}`, scopes: ['read:organization', 'read:repository'] }, basic('konzilo', instancePassword), totp(instanceKey)), 201);
    writeFileSync(ROLES_TOKEN, `${sha1}\n`, { mode: 0o600 });
  }
  await machineAccount(call, {
    name: READER,
    tokenFile: READ_TOKEN,
    keyFile: 'reader-totp',
    scopes: ['read:repository'],
    grant: async () => must('letting the preview read', await call('PUT', `/repos/${site}/${REPOSITORY}/collaborators/${READER}`, { permission: 'read' }), 204),
  });
  // Who is an Admin, which only an Admin may set the site's mail by, the service asks by a token of
  // the instance's account that can read the teams and nothing else.
  if (!existsSync(SERVICE_ROLES_TOKEN)) {
    const { sha1 } = must('making the token that reads who is an Admin', await request('/users/konzilo/tokens', { name: `service-roles-${randomBytes(4).toString('hex')}`, scopes: ['read:organization'] }, basic('konzilo', instancePassword), totp(instanceKey)), 201);
    writeFileSync(SERVICE_ROLES_TOKEN, `${sha1}\n`, { mode: 0o600 });
  }
  await previewClient(call);
  await machineAccount(call, {
    name: SERVICE_READER,
    tokenFile: SERVICE_TOKEN,
    scopes: ['read:repository'],
    grant: async () => must('letting the service read', await call('PUT', `/repos/${site}/${REPOSITORY}/collaborators/${SERVICE_READER}`, { permission: 'read' }), 204),
  });
  // Saying that something may have happened is all it does, so it holds no secret.
  const hooks = must('listing the webhooks', await call('GET', `/repos/${site}/${REPOSITORY}/hooks`), 200);
  if (!hooks.some(({ config }) => config?.url === SERVICE_HOOK)) {
    must('making the webhook', await call('POST', `/repos/${site}/${REPOSITORY}/hooks`, {
      type: 'forgejo',
      active: true,
      events: ['push'],
      branch_filter: 'main',
      config: { content_type: 'json', url: SERVICE_HOOK },
    }), 201);
  }
  writeFileSync(BUILDER_CLIENT, `${known('oauth-client')}\n`, { mode: 0o600 });
}

// Typesense's keys (ADR 0053): its admin key, which the builder indexes with, and the site's
// search key, which searches the site's collection alone and which each build makes the route's
// scoped key from. Each is made once. Typesense reads its admin key from the configuration
// written here, never from the environment (ADR 0005), and starts after the seed, so it takes
// the one written at this start.
function searchKeys() {
  for (const file of [SEARCH_ADMIN_KEY, SEARCH_KEY]) {
    if (!existsSync(file)) writeFileSync(file, `${randomBytes(24).toString('base64url')}\n`, { mode: 0o600 });
  }
  writeFileSync(TYPESENSE_CONFIG, `[server]\napi-key = ${readFileSync(SEARCH_ADMIN_KEY, 'utf8').trim()}\n`, { mode: 0o600 });
}

// The local copy's people (src/people.js), which every start makes sure of, so that a copy seeded
// before gains those added since: each person's account, with their password where it is made,
// a second factor whose key `state` keeps, and the team of their role and no other role's. The
// key of the account `KONZILO_ACCOUNT` named at the first start is `account-totp`, as it has
// always been, and `account-name` says whose it is, so that a later change of the setting never
// gives one person another's key.
async function seedPeople(call, people) {
  const account = known(ACCOUNT_NAME) ?? process.env.KONZILO_ACCOUNT;
  if (account && !known(ACCOUNT_NAME)) remember(ACCOUNT_NAME, account);
  const teams = must('listing the teams', await call('GET', `/orgs/${site}/teams`), 200);
  for (const person of people) {
    const { name } = person;
    const keyFile = keyFileOf(name, account);
    const found = await call('GET', `/users/${encodeURIComponent(name)}`);
    must(`looking for the account ${name}`, found, 200, 404);
    if (found.status === 404 || !known(keyFile)) {
      const password = passwordOf(name);
      if (found.status === 404) {
        must(`making the account ${name}`, await call('POST', '/admin/users', {
          username: name,
          email: `${name}@localhost.invalid`,
          password,
          must_change_password: false,
          send_notify: false,
          visibility: 'private',
        }), 201);
      }
      await enrol(name, password, keyFile);
    }
    await seat(call, teams, person);
  }
}

// A person's password: from a secret of their own where one is mounted, else from the one they
// share (src/people.js).
function passwordOf(name) {
  const file = passwordFilesOf(name).find((one) => existsSync(join(SECRETS, one)));
  if (!file) throw new Error(`no password for ${name}: neither ${passwordFilesOf(name).map((one) => join(SECRETS, one)).join(' nor ')} is there`);
  return secret(file);
}

async function main() {
  // The machine accounts, the instance's and the site's organisation are no one's to take.
  const people = peopleOf(process.env, { taken: ['konzilo', BUILDER, READER, SERVICE_READER, site] });
  searchKeys();
  const instancePassword = secret('instance-password');
  const instanceKey = await enrol('konzilo', instancePassword, 'instance-totp');
  const token = await instanceToken(instancePassword, instanceKey);
  const call = api(token);
  const first = !known('seeded');

  if (first) {
    must('making the organisation', await call('POST', '/orgs', {
      username: site,
      visibility: 'private',
      repo_admin_change_team_access: false,
    }), 201, 422);

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
  }

  // The teams have write access and never ownership, so that no customer reaches webhooks or
  // settings (ADR 0008), and publishing makes sure of them before anyone is put in one.
  await publishing(call, instancePassword, instanceKey);
  await seedPeople(call, people);
  if (first) remember('seeded', new Date().toISOString());
}

await main();
console.log('seed: done');
