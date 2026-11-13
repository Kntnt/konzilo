// The core's pinned versions: scripts/versions reads versions.env and refuses a
// malformed file; the npm package and the new-site command take the same pins.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../', import.meta.url));
const versions = (...args) => spawnSync('sh', [join(core, 'scripts/versions'), ...args], { encoding: 'utf8' });

test('prints every pin, one pin by its key, and refuses an unknown key', () => {
  assert.match(versions().stdout, /^NODE_RELEASE=\d/m);
  assert.match(versions('ASTRO').stdout.trim(), /^\d+\.\d+\.\d+$/);
  assert.equal(versions('NO_SUCH_PIN').status, 1);
});

test('refuses a file with a malformed line or a key twice', () => {
  const folder = mkdtempSync(join(tmpdir(), 'konzilo-versions-'));
  const file = join(folder, 'versions.env');
  try {
    writeFileSync(file, 'NOT A PIN\n');
    assert.equal(versions('--file', file).status, 2);
    writeFileSync(file, 'ONE=1\nONE=2\n');
    assert.equal(versions('--file', file).status, 2);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('pins Astro in package.json as in versions.env, the suffix list\'s commit in its file, and SPDX\'s release in each standard text the notices keep', () => {
  const { peerDependencies, devDependencies } = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8'));
  const astro = versions('ASTRO').stdout.trim();
  assert.equal(peerDependencies.astro, astro);
  assert.equal(devDependencies.astro, astro);
  const list = JSON.parse(readFileSync(join(core, 'src/format/public-suffixes.json'), 'utf8'));
  assert.equal(list.version, versions('PUBLIC_SUFFIX_LIST').stdout.trim());
  const spdx = `https://raw.githubusercontent.com/spdx/license-list-data/${versions('SPDX_LICENSE_LIST').stdout.trim()}/text/`;
  const standard = Object.values(JSON.parse(readFileSync(join(core, 'src/cms/notice-texts.json'), 'utf8'))).map(({ source }) => source).filter((source) => source.includes('/spdx/license-list-data/'));
  assert.ok(standard.length > 0, 'the notices keep a standard text');
  for (const source of standard) assert.ok(source.startsWith(spdx), source);
});
