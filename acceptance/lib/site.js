// A site repository in Compose, as a developer makes it, on ports free just now and
// under a project name of its own, so that several runs can go at once. It removes
// only what it made, by name (ADR 0002).

import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { totp } from '../../src/totp.js';

const core = fileURLToPath(new URL('../../', import.meta.url));

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
  probe.on('error', reject);
});

// `name`: the site's, which names its Compose project and its images, one per site at once.
export async function makeSite({ name = `accept-${process.pid}` } = {}) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-acceptance-')));
  execFileSync(join(core, 'bin/new-site'), [name], { cwd: folder, stdio: 'pipe' });
  const directory = join(folder, name);
  const ports = { site: await freePort(), admin: await freePort(), git: await freePort(), preview: await freePort() };
  const env = {
    ...process.env,
    KONZILO_PORT_SITE: String(ports.site),
    KONZILO_PORT_ADMIN: String(ports.admin),
    KONZILO_PORT_GIT: String(ports.git),
    KONZILO_PORT_PREVIEW: String(ports.preview),
  };

  const compose = (...args) => {
    const run = spawnSync('docker', ['compose', ...args], { cwd: directory, env, encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`docker compose ${args.join(' ')}: ${run.status}\n${run.stdout}\n${run.stderr}`);
    return run.stdout;
  };

  const origin = {
    site: `http://localhost:${ports.site}`,
    admin: `http://localhost:${ports.admin}`,
    git: `http://localhost:${ports.git}`,
    preview: `http://localhost:${ports.preview}`,
  };
  const state = (file) => compose('run', '--rm', '--entrypoint', 'cat', 'code', `/state/${file}`).trim();

  // An account of a person's own, `login`, with a password nobody else knows and a second factor
  // it enrols through Forgejo's forms, as a person does, put in the site's team `team` by the
  // instance's administrator, as an Admin will on the Users page (ADR 0007, ADR 0008):
  // { login, password, code(), enrolledWith }, the last the code it enrolled with, which Forgejo
  // may refuse until the next.
  const account = async (login, team) => {
    const token = state('instance-token');
    const api = (method, path, body) => fetch(`${origin.git}/api/v1${path}`, { method, headers: { authorization: `token ${token}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body) });
    const password = randomBytes(18).toString('base64url');
    const made = await api('POST', '/admin/users', { username: login, email: `${login}@localhost.invalid`, password, must_change_password: false, send_notify: false, visibility: 'private' });
    if (made.status !== 201) throw new Error(`making ${login}: ${made.status} ${await made.text()}`);
    const cookies = new Map();
    const send = async (path, fields) => {
      const answer = await fetch(`${origin.git}${path}`, {
        redirect: 'manual',
        ...(fields ? { method: 'POST', body: new URLSearchParams(fields) } : {}),
        headers: { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; '), ...(fields ? { 'content-type': 'application/x-www-form-urlencoded' } : {}) },
      });
      for (const set of answer.headers.getSetCookie()) {
        const [pair] = set.split(';');
        cookies.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
      }
      return answer;
    };
    if ((await send('/user/login', { user_name: login, password })).status !== 303) throw new Error(`signing in as ${login}`);
    const key = /Or enter the secret: ([A-Z2-7]+)/.exec(await (await send('/user/settings/security/two_factor/enroll')).text())?.[1];
    if (!key) throw new Error(`no secret on the enrolment page of ${login}`);
    const enrolledWith = totp(key);
    if ((await send('/user/settings/security/two_factor/enroll', { passcode: enrolledWith })).status !== 303) throw new Error(`enrolling ${login}`);
    const teams = await (await api('GET', `/orgs/${name}/teams`)).json();
    const joined = await api('PUT', `/teams/${teams.find((one) => one.name === team).id}/members/${login}`);
    if (joined.status !== 204) throw new Error(`putting ${login} in ${team}: ${joined.status}`);
    return { login, password, code: () => totp(key), enrolledWith };
  };

  return {
    name,
    directory,
    origin,
    compose,
    up: (...args) => compose('up', '--wait', '--wait-timeout', '600', ...args),
    code: () => compose('run', '--rm', 'code').trim().split('\n').at(-1),
    state,
    account,
    remove() {
      spawnSync('docker', ['compose', 'down', '--volumes', '--remove-orphans', '--timeout', '2'], { cwd: directory, env });
      // A site's images go by its name, and Docker's cache keeps what they are made of.
      spawnSync('docker', ['image', 'rm', `konzilo-web:${name}`, `konzilo-builder:${name}`, `konzilo-typesense:${name}`], { env });
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
