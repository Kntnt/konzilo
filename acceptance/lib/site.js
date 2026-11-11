// A site repository in Compose, as a developer makes it, on ports free just now and
// under a project name of its own, so that several runs can go at once. It removes
// only what it made, by name (ADR 0002).

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
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

export async function makeSite() {
  const name = `accept-${process.pid}`;
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

  return {
    name,
    directory,
    origin: {
      site: `http://localhost:${ports.site}`,
      admin: `http://localhost:${ports.admin}`,
      git: `http://localhost:${ports.git}`,
      preview: `http://localhost:${ports.preview}`,
    },
    compose,
    up: (...args) => compose('up', '--wait', '--wait-timeout', '600', ...args),
    code: () => compose('run', '--rm', 'code').trim().split('\n').at(-1),
    state: (file) => compose('run', '--rm', '--entrypoint', 'cat', 'code', `/state/${file}`).trim(),
    remove() {
      spawnSync('docker', ['compose', 'down', '--volumes', '--remove-orphans', '--timeout', '2'], { cwd: directory, env });
      // A site's images go by its name, and Docker's cache keeps what they are made of.
      spawnSync('docker', ['image', 'rm', `konzilo-web:${name}`, `konzilo-builder:${name}`, `konzilo-typesense:${name}`], { env });
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
