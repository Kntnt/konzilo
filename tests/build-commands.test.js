// The commands a build waits for, the intake, the site's build and its search documents, each a
// Node of its own (ADR 0031): each runs with V8's baseline compiler on its main thread, as does
// every Node it starts in turn, since Node 26.13.1 can deadlock as it exits (nodejs/node#67596);
// and one still running at the builder's time limit is stopped with every process it started.
// Each stand-in here writes down every process it is, so that none is left behind.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { astroBuild, intakeCommand } from '../src/build/build.js';
import { TookTooLong } from '../src/build/command.js';
import { searchDocumentsCommand } from '../src/build/search-index.js';

// Says whether V8's baseline compiler worked on a thread of its own in this Node, from V8's own
// trace of it, written to a file so that standard output stays this program's: `baseline`, that
// it compiled at all, and `concurrent`, that it did so beside the main thread. It writes that to
// `report.json` beside itself, or prints it with `--print`, as the intake prints its report. V8
// holds the trace's file name in 128 bytes, so it is named from the folder the probe is in.
const PROBE = `import { setFlagsFromString } from 'node:v8';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('.', import.meta.url)));
const trace = 'trace-' + process.pid + '.txt';
setFlagsFromString('--redirect-code-traces');
setFlagsFromString('--redirect-code-traces-to=' + trace);
setFlagsFromString('--trace-baseline');
let sum = 0;
for (let k = 0; k < 200; k += 1) {
  const add = new Function('n', 'let x = 0; for (let i = 0; i < n; i += 1) x += i * ' + k + '; return x;');
  for (let j = 0; j < 2000; j += 1) sum += add(10);
}
const traced = readFileSync(trace, 'utf8');
const report = JSON.stringify({ baseline: sum > 0 && traced.length > 0, concurrent: traced.includes('[Concurrent Sparkplug') });
if (process.argv.includes('--print')) process.stdout.write(report);
else writeFileSync('report.json', report);
`;

// A Node that never ends, as one caught in its exit: it heeds no signal it may ignore, writes
// some pages beside itself, starts a Node that never ends either, writes down the processes it,
// its parent and that Node are, in the first file named `….json` it is given, else in
// `processes.json` beside itself, and waits.
const NEVER = `import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => {});
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
writeFileSync(new URL('./dist/index.html', import.meta.url), 'half');
const child = spawn(process.execPath, ['-e', "for (const s of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(s, () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' });
const file = process.argv.slice(2).find((arg) => arg.endsWith('.json')) ?? new URL('./processes.json', import.meta.url);
writeFileSync(file, JSON.stringify([process.ppid, process.pid, child.pid]));
setInterval(() => {}, 1000);
`;

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
};

describe('a command a build waits for', () => {
  let folder;
  let count = 0;
  // Every process a stand-in wrote down, stopped at the end whatever a test found.
  const started = [];

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-build-commands-'));
  });
  after(() => {
    for (const pid of started) if (alive(pid)) process.kill(pid, 'SIGKILL');
    rmSync(folder, { recursive: true, force: true });
  });

  // A site's folder whose build, `npm run build`, runs `script`.
  const newSite = (files, script) => {
    const root = join(folder, `site-${(count += 1)}`);
    mkdirSync(root);
    for (const [name, text] of Object.entries(files)) writeFileSync(join(root, name), text);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'a-site', private: true, type: 'module', scripts: { build: script } }));
    return root;
  };
  const environment = (root) => ({ PATH: process.env.PATH, HOME: root });

  // The processes a stand-in wrote down in `file`, each stopped at the end, but this test's own,
  // whose child the stand-in is where the builder starts it itself.
  const processesIn = (file) => {
    const pids = JSON.parse(readFileSync(file, 'utf8')).filter((pid) => pid !== process.pid);
    started.push(...pids);
    return pids;
  };
  // Waits a moment for a process stopped outright to be gone, as the system takes it away.
  const gone = async (pids) => {
    for (let tries = 0; tries < 50 && pids.some(alive); tries += 1) await new Promise((go) => setTimeout(go, 100));
    return pids.filter(alive);
  };

  test('can tell V8\'s baseline compiler on a thread of its own from one on the main thread', () => {
    const root = newSite({ 'probe.mjs': PROBE }, 'node probe.mjs');
    const run = (args) => JSON.parse(spawnSync(process.execPath, [...args, join(root, 'probe.mjs'), '--print'], { env: environment(root), encoding: 'utf8' }).stdout);
    assert.deepEqual(run([]), { baseline: true, concurrent: true });
    assert.deepEqual(run(['--no-concurrent-sparkplug']), { baseline: true, concurrent: false });
  });

  test('runs the site\'s build, and every Node it starts, with V8\'s baseline compiler on the main thread', async () => {
    const root = newSite({ 'probe.mjs': PROBE }, 'mkdir -p dist && node probe.mjs');
    const built = await astroBuild({ folder: root, environment: environment(root), limit: 60_000 })();
    assert.equal(built, join(root, 'dist'));
    assert.deepEqual(JSON.parse(readFileSync(join(root, 'report.json'), 'utf8')), { baseline: true, concurrent: false });
  });

  test('runs the intake with V8\'s baseline compiler on the main thread', async () => {
    const root = newSite({ 'probe.mjs': PROBE }, 'true');
    const intake = intakeCommand({ program: join(root, 'probe.mjs'), siteFolder: root, contentFolder: root, environment: environment(root), limit: 60_000 });
    // The intake's own arguments follow the program; the stand-in prints at any of them.
    const ran = await intake('--print', { admins: 'a', reviewers: 'r', pushers: 'p' }, null);
    assert.deepEqual(ran, { status: 0, report: { baseline: true, concurrent: false } });
  });

  test('runs the search documents with V8\'s baseline compiler on the main thread', async () => {
    const root = newSite({ 'probe.mjs': PROBE }, 'true');
    const documents = searchDocumentsCommand({ program: join(root, 'probe.mjs'), site: '--print', content: root, environment: environment(root), limit: 60_000 });
    assert.deepEqual(await documents(), { baseline: true, concurrent: false });
  });

  test('stops a site\'s build still running at the limit, with every process it started, and says so', async () => {
    const root = newSite({ 'never.mjs': NEVER }, 'node never.mjs');
    const at = Date.now();
    await assert.rejects(astroBuild({ folder: root, environment: environment(root), limit: 3_000 })(), (error) => {
      assert.ok(error instanceof TookTooLong, error.message);
      assert.equal(error.message, 'npm run build --silent had not ended after 3 seconds, and was stopped with every process it started');
      return true;
    });
    assert.ok(Date.now() - at >= 3_000);
    const pids = processesIn(join(root, 'processes.json'));
    assert.equal(pids.length, 3, 'what npm runs the build in, the build, and the Node the build started');
    assert.deepEqual(await gone(pids), [], 'no process is left');
  });

  test('takes nothing a stopped build left behind for a build of its own', async () => {
    const root = newSite({ 'never.mjs': NEVER }, 'node never.mjs');
    await assert.rejects(astroBuild({ folder: root, environment: environment(root), limit: 3_000 })(), TookTooLong);
    processesIn(join(root, 'processes.json'));
    assert.ok(existsSync(join(root, 'dist/index.html')), 'the stopped build wrote some of its pages');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'a-site', private: true, scripts: { build: 'true' } }));
    await assert.rejects(astroBuild({ folder: root, environment: environment(root), limit: 60_000 })(), /no pages in/);
  });

  test('stops an intake still running at the limit, with every process it started', async () => {
    const root = newSite({ 'never.mjs': NEVER }, 'true');
    const processes = join(root, 'intake-processes.json');
    const intake = intakeCommand({ program: join(root, 'never.mjs'), siteFolder: root, contentFolder: root, environment: environment(root), limit: 2_000 });
    await assert.rejects(intake(processes, { admins: 'a', reviewers: 'r', pushers: 'p' }, null), (error) => {
      assert.ok(error instanceof TookTooLong, error.message);
      assert.match(error.message, /never\.mjs .* had not ended after 2 seconds, and was stopped with every process it started$/);
      return true;
    });
    const pids = processesIn(processes);
    assert.equal(pids.length, 2, 'the intake and the Node it started');
    assert.deepEqual(await gone(pids), [], 'no process is left');
    assert.ok(alive(process.pid), 'and the builder goes on');
  });

  test('stops the search documents still being made at the limit, saying so', async () => {
    const root = newSite({ 'never.mjs': NEVER }, 'true');
    const processes = join(root, 'search-processes.json');
    const documents = searchDocumentsCommand({ program: join(root, 'never.mjs'), site: processes, content: root, environment: environment(root), limit: 2_000 });
    await assert.rejects(documents(), /^Error: the search documents could not be made: .*never\.mjs .* had not ended after 2 seconds, and was stopped with every process it started$/);
    assert.deepEqual(await gone(processesIn(processes)), []);
  });
});
