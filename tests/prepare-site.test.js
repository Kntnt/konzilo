// How the builder and the live preview prepare a site's code at a start (ADR 0031, ADR 0032):
// prepare-site.sh, run in the site's folder, copies the code into the program's work folder and
// installs its dependencies only when what they are installed from has changed. A stand-in for
// npm on the PATH counts the installs.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../compose/builder/prepare-site.sh', import.meta.url));

// A stand-in for npm that records each call, with whether the copy had its lock then, and makes a
// node_modules as an install would, or fails half way, leaving a node_modules behind, where the
// file `fail` beside it exists.
const NPM = `#!/bin/sh
if [ -f package-lock.json ]; then lock=with-lock; else lock=without-lock; fi
echo "$* $lock" >> "$(dirname "$0")/calls"
mkdir -p node_modules/@kntnt/konzilo
if [ -f "$(dirname "$0")/fail" ]; then exit 1; fi
echo installed > node_modules/@kntnt/konzilo/package.json
`;

// A site with a package.json and a lock, a core beside it, a work folder and the stand-in.
function fixture({ pin = 'file:CORE' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'prepare-site-'));
  const site = join(root, 'site');
  const core = join(root, 'core');
  const work = join(root, 'work');
  const bin = join(root, 'bin');
  for (const folder of [site, join(site, 'src'), join(core, 'src'), work, bin]) mkdirSync(folder, { recursive: true });
  const manifest = (version = '1.0.0', given = pin) => JSON.stringify({ name: 'a-site', dependencies: { '@kntnt/konzilo': given.replace('CORE', core), astro: version } }, null, 2);
  writeFileSync(join(site, 'package.json'), manifest());
  writeFileSync(join(site, 'package-lock.json'), '{"lockfileVersion":3}');
  writeFileSync(join(site, 'src/page.astro'), '<p>One</p>');
  writeFileSync(join(core, 'package.json'), '{"name":"@kntnt/konzilo","version":"0.0.0"}');
  writeFileSync(join(core, 'src/index.js'), 'export default 1;');
  writeFileSync(join(bin, 'npm'), NPM);
  chmodSync(join(bin, 'npm'), 0o755);
  let said = '';
  const prepare = () => {
    const result = spawnSync('sh', [SCRIPT, work, '--exclude=./content'], { cwd: site, encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    said = result.stderr;
    return result.status;
  };
  // What the last preparation wrote to its standard error.
  const stderr = () => said;
  // Every run of npm, each of which here is an install, and whether the copy had its lock then.
  const calls = () => (existsSync(join(bin, 'calls')) ? readFileSync(join(bin, 'calls'), 'utf8').split('\n').filter(Boolean) : []);
  const installs = () => {
    for (const call of calls()) assert.match(call, /^install\b/);
    return calls().length;
  };
  const locks = () => calls().map((call) => call.endsWith(' with-lock'));
  return { site, core, work, bin, manifest, prepare, installs, locks, stderr };
}

test('installs at the first preparation, and not at the next when nothing has changed', () => {
  const { prepare, installs } = fixture();
  assert.equal(prepare(), 0);
  assert.equal(installs(), 1);
  assert.equal(prepare(), 0);
  assert.equal(installs(), 1);
});

test('installs again after the site\'s package.json or its lock changes, once each', () => {
  const { site, manifest, prepare, installs } = fixture();
  prepare();
  writeFileSync(join(site, 'package.json'), manifest('1.0.1'));
  prepare();
  assert.equal(installs(), 2);
  prepare();
  assert.equal(installs(), 2);
  writeFileSync(join(site, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}');
  prepare();
  prepare();
  assert.equal(installs(), 3);
});

test('installs again after the core\'s files change under a path pin, and not for what its own node_modules holds', () => {
  const { core, prepare, installs } = fixture();
  prepare();
  writeFileSync(join(core, 'src/index.js'), 'export default 2;');
  prepare();
  prepare();
  assert.equal(installs(), 2);
  mkdirSync(join(core, 'node_modules/a-dependency'), { recursive: true });
  writeFileSync(join(core, 'node_modules/a-dependency/index.js'), '');
  prepare();
  assert.equal(installs(), 2);
});

// A checkout holds more than its package ships: a test's or a build's output, notes, files its
// user cannot read. Only what the package ships counts, where its package.json names it.
test('installs again after a change to what a package pinned by a folder ships, and not for what is left beside it', () => {
  const { core, prepare, installs } = fixture();
  writeFileSync(join(core, 'package.json'), '{"name":"@kntnt/konzilo","version":"0.0.0","files":["src","content-format.md"]}');
  writeFileSync(join(core, 'content-format.md'), 'One');
  prepare();
  mkdirSync(join(core, 'coverage'));
  writeFileSync(join(core, 'coverage/report.txt'), 'a report');
  writeFileSync(join(core, 'notes.txt'), 'a note');
  writeFileSync(join(core, 'unread.txt'), 'no one may read this');
  chmodSync(join(core, 'unread.txt'), 0o000);
  assert.equal(prepare(), 0);
  assert.equal(installs(), 1);
  writeFileSync(join(core, 'content-format.md'), 'Two');
  prepare();
  writeFileSync(join(core, 'src/index.js'), 'export default 2;');
  prepare();
  writeFileSync(join(core, 'package.json'), '{"name":"@kntnt/konzilo","version":"0.0.1","files":["src","content-format.md"]}');
  prepare();
  assert.equal(installs(), 4);
  chmodSync(join(core, 'unread.txt'), 0o644);
});

test('names a file the package ships that it cannot read, and installs nothing', () => {
  const { core, prepare, installs, stderr } = fixture();
  writeFileSync(join(core, 'src/unread.js'), 'export default 0;');
  chmodSync(join(core, 'src/unread.js'), 0o000);
  try {
    assert.notEqual(prepare(), 0);
    assert.match(stderr(), /cannot read .*\/core\/src\/unread\.js/);
    assert.equal(installs(), 0);
  } finally {
    chmodSync(join(core, 'src/unread.js'), 0o644);
  }
});

// A core pinned by a checkout's path has no version to tell npm it has changed, so its lock goes.
test('installs a core pinned by a checkout\'s path without the site\'s lock', () => {
  const { prepare, locks } = fixture();
  prepare();
  assert.deepEqual(locks(), [false]);
});

// A site pinned by a release keeps the release's package in its own vendor/ (ADR 0011), named by
// its version, and installs from its lock, whose integrity holds the package's bytes.
test('installs a tarball pinned in the site\'s vendor/ from the site\'s lock, once', () => {
  const { site, prepare, installs, locks } = fixture({ pin: 'file:vendor/kntnt-konzilo-1.0.0.tgz' });
  mkdirSync(join(site, 'vendor'));
  writeFileSync(join(site, 'vendor/kntnt-konzilo-1.0.0.tgz'), 'one');
  prepare();
  prepare();
  assert.equal(installs(), 1);
  assert.deepEqual(locks(), [true]);
});

test('installs again once the tarball pinned in the site\'s vendor/ is replaced by another release', () => {
  const { site, manifest, prepare, installs, locks } = fixture({ pin: 'file:vendor/kntnt-konzilo-1.0.0.tgz' });
  mkdirSync(join(site, 'vendor'));
  writeFileSync(join(site, 'vendor/kntnt-konzilo-1.0.0.tgz'), 'one');
  prepare();
  rmSync(join(site, 'vendor/kntnt-konzilo-1.0.0.tgz'));
  writeFileSync(join(site, 'vendor/kntnt-konzilo-1.1.0.tgz'), 'two');
  writeFileSync(join(site, 'package.json'), manifest('1.0.0', 'file:vendor/kntnt-konzilo-1.1.0.tgz'));
  writeFileSync(join(site, 'package-lock.json'), '{"lockfileVersion":3,"release":"1.1.0"}');
  prepare();
  prepare();
  assert.equal(installs(), 2);
  assert.deepEqual(locks(), [true, true]);
});

// Should the lock not hold its bytes, the tarball itself counts.
test('installs again after the bytes of a tarball pinned in the site\'s vendor/ change', () => {
  const { site, prepare, installs } = fixture({ pin: 'file:vendor/kntnt-konzilo-1.0.0.tgz' });
  mkdirSync(join(site, 'vendor'));
  writeFileSync(join(site, 'vendor/kntnt-konzilo-1.0.0.tgz'), 'one');
  prepare();
  writeFileSync(join(site, 'vendor/kntnt-konzilo-1.0.0.tgz'), 'two');
  prepare();
  assert.equal(installs(), 2);
});

test('installs again at the next start after an install that failed', () => {
  const { bin, prepare, installs } = fixture();
  writeFileSync(join(bin, 'fail'), '');
  assert.notEqual(prepare(), 0);
  assert.equal(installs(), 1);
  rmSync(join(bin, 'fail'));
  assert.equal(prepare(), 0);
  assert.equal(installs(), 2);
  prepare();
  assert.equal(installs(), 2);
});

test('copies the site\'s code as it now is at every start, without what it is told to leave out', () => {
  const { site, work, prepare, installs } = fixture();
  mkdirSync(join(site, 'content'));
  writeFileSync(join(site, 'content/post.md'), 'A local copy\'s post');
  prepare();
  writeFileSync(join(site, 'src/page.astro'), '<p>Two</p>');
  prepare();
  assert.equal(installs(), 1);
  assert.equal(readFileSync(join(work, 'site/src/page.astro'), 'utf8'), '<p>Two</p>');
  assert.equal(existsSync(join(work, 'site/content')), false);
  assert.equal(readFileSync(join(work, 'site/node_modules/@kntnt/konzilo/package.json'), 'utf8'), 'installed\n');
});

// The builder's image holds the script where the builder and the preview run it, so what it runs
// beside it must be there too.
test('is copied into the builder\'s image with what it runs beside it', () => {
  const dockerfile = readFileSync(fileURLToPath(new URL('../compose/builder/Dockerfile', import.meta.url)), 'utf8');
  for (const file of ['prepare-site.sh', 'installed-from.js']) assert.match(dockerfile, new RegExp(`^COPY compose/builder/${file} compose/builder/${file}$`, 'm'), file);
});
