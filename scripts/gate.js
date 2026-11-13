#!/usr/bin/env node
// The checks a commit must pass before it joins main, as thoroughly as a CI run
// would make them: from a fresh clone, so nothing depends on what lies around in
// this checkout; in a Linux container on the pinned Node as well, since this
// machine's Node and its file system's handling of case can differ from a server's;
// and in a real Compose project, with real browsers.
//
//   gate          check the current commit; the working tree must be clean
//   gate --here   run the checks where it stands, which is what a CI job would call
//
// Docker is required: a gate that skipped a step when a tool was missing would
// report a pass it never earned.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));

const run = (command, args, cwd) => {
  const { status } = spawnSync(command, args, { cwd, stdio: 'inherit' });
  return status === 0;
};

const read = (command, args, cwd) => spawnSync(command, args, { cwd, encoding: 'utf8' });

const stop = (message) => {
  console.error(`gate: ${message}`);
  process.exit(1);
};

// Exactly one copy of the Markdown reader, since two could read a file differently
// (ADR 0016).
const oneReader = (cwd) => {
  const { stdout } = read('npm', ['ls', 'satteri', '--all', '--json'], cwd);
  const versions = new Set();
  const walk = (node) => {
    for (const [name, child] of Object.entries(node.dependencies ?? {})) {
      if (name === 'satteri') versions.add(child.version);
      walk(child);
    }
  };
  walk(JSON.parse(stdout));
  if (versions.size !== 1) console.error(`gate: Sätteri in ${versions.size} versions: ${[...versions].join(', ')}`);
  return versions.size === 1;
};

const here = (cwd) => {
  if (!run('npm', ['ci', '--no-fund'], cwd)) stop('npm ci failed');
  if (!run('npm', ['audit', '--audit-level=high'], cwd)) stop('a known vulnerability');
  if (!oneReader(cwd)) stop('more than one copy of the Markdown reader');
  if (!run('npm', ['test'], cwd)) stop('the tests failed');
};

if (process.argv[2] === '--here') {
  here(process.cwd());
  process.exit(0);
}

if (read('git', ['status', '--porcelain'], root).stdout !== '') stop('commit first: the gate checks commits, not a working tree');
if (!run('docker', ['info', '--format', 'Docker {{.ServerVersion}}'], root)) stop('Docker is not running');

const commit = read('git', ['rev-parse', '--short', 'HEAD'], root).stdout.trim();
const node = read('sh', [join(root, 'scripts/versions'), 'NODE_RELEASE'], root).stdout.trim();
const folder = mkdtempSync(join(realpathSync(tmpdir()), 'konzilo-gate-'));
const clean = () => rmSync(folder, { recursive: true, force: true });
process.on('exit', clean);

const clone = (name) => {
  const target = join(folder, name);
  if (!run('git', ['clone', '--quiet', '--no-local', root, target], root)) stop('the clone failed');
  return target;
};

console.log(`\n=== ${commit} on this machine, Node ${process.version}\n`);
const first = clone('here');
here(first);

console.log(`\n=== ${commit} in Linux, Node ${node}\n`);
const inside = [
  'set -e',
  // What a CI runner has and the slim image lacks: git, and curl, which new-site fetches a
  // release's package with.
  'apt-get update -qq && apt-get install -qq --no-install-recommends git ca-certificates curl >/dev/null',
  'cp -a /source /home/node/konzilo && chown -R node:node /home/node/konzilo',
  // A CI runner is no root either, and a test of a refusal on permissions would pass as root.
  'su node -s /bin/sh -c "cd /home/node/konzilo && node scripts/gate.js --here"',
].join('\n');
const container = `konzilo-gate-${process.pid}`;
const linux = run('docker', ['run', '--rm', '--name', container, '--volume', `${clone('linux')}:/source:ro`, `node:${node}-bookworm-slim`, 'sh', '-c', inside], root);
if (!linux) stop('the checks failed in Linux');

// Compose and real browsers, which only this machine can run: a container here has no
// Docker of its own.
console.log(`\n=== ${commit} in Compose and three browser engines\n`);
if (!run('npx', ['playwright-core', 'install', 'chromium', 'firefox', 'webkit'], first)) stop('the browsers did not install');
if (!run('npm', ['run', 'acceptance'], first)) stop('the acceptance suite failed');

console.log(`\ngate passed: ${commit}, on this machine, in Linux, and in Compose with three browser engines`);
