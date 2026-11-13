// A site repository in Compose, as a developer makes it, on ports free just now and
// under a project name of its own, so that several runs can go at once. It removes
// only what it made, by name (ADR 0002).

import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../../', import.meta.url));

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
  probe.on('error', reject);
});

// `name`: the site's, which names its Compose project and its images, one per site at once.
// `people`: the site's people, as its `.env` lists them in `KONZILO_PEOPLE`, else the one Admin.
export async function makeSite({ name = `accept-${process.pid}`, people } = {}) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-acceptance-')));
  execFileSync(join(core, 'bin/new-site'), [name], { cwd: folder, stdio: 'pipe' });
  const directory = join(folder, name);
  // A setting in the site's `.env`, as a developer writes one, which the next start takes.
  const set = (setting, value) => appendFileSync(join(directory, '.env'), `${setting}=${value}\n`);
  if (people) set('KONZILO_PEOPLE', people);
  const ports = { site: await freePort(), admin: await freePort(), git: await freePort(), preview: await freePort() };
  const env = {
    ...process.env,
    KONZILO_PORT_SITE: String(ports.site),
    KONZILO_PORT_ADMIN: String(ports.admin),
    KONZILO_PORT_GIT: String(ports.git),
    KONZILO_PORT_PREVIEW: String(ports.preview),
  };
  // The shell's would go before the site's own.
  delete env.KONZILO_PEOPLE;
  delete env.KONZILO_ACCOUNT;

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

  return {
    name,
    directory,
    origin,
    compose,
    up: (...args) => compose('up', '--wait', '--wait-timeout', '600', ...args),
    // A person's current code, by `konzilo-code <login>`, or the account's without a login.
    code: (login) => compose('run', '--rm', 'code', ...(login ? [login] : [])).trim().split('\n').at(-1),
    state,
    set,
    remove() {
      spawnSync('docker', ['compose', 'down', '--volumes', '--remove-orphans', '--timeout', '2'], { cwd: directory, env });
      // A site's images go by its name, and Docker's cache keeps what they are made of.
      spawnSync('docker', ['image', 'rm', `konzilo-web:${name}`, `konzilo-builder:${name}`, `konzilo-typesense:${name}`], { env });
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
