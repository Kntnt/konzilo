// What the core installs leaves the core free: every package in the lock is under
// a license that lets Kntnt give the core any terms (ADR 0059). A license outside
// the list fails here, so that taking one in is a decision and no accident of an
// install. And what Konzilo is built on is named: every package in THIRD-PARTY.md,
// and each direct dependency and pinned program in ACKNOWLEDGEMENTS.md.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { render } from '../scripts/third-party.js';

const text = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const read = (name) => JSON.parse(text(name));
const lock = read('package-lock.json');

// A permissive license asks for its notice, and nothing of the work around it.
const permissive = ['0BSD', 'Apache-2.0', 'BlueOak-1.0.0', 'BSD-2-Clause', 'BSD-3-Clause', 'CC0-1.0', 'ISC', 'MIT', 'MIT-0'];

// These bind the library and not the work that uses it, while the library is a
// package of its own and used as it is.
const asLibrary = ['LGPL-3.0-or-later', 'MPL-2.0'];

const allowed = new Set([...permissive, ...asLibrary]);

// An expression of the forms the lock holds: names joined by AND, where each must
// be allowed, or by OR, where one is enough, in brackets or not. Anything else is
// refused.
const fits = (expression) =>
  expression
    .replace(/^\((.*)\)$/, '$1')
    .split(' OR ')
    .some((choice) => choice.split(' AND ').every((name) => allowed.has(name)));

test('reads a license expression, and refuses what is not on the list', () => {
  assert.ok(fits('MIT'));
  assert.ok(fits('(MPL-2.0 OR Apache-2.0)'));
  assert.ok(fits('Apache-2.0 AND LGPL-3.0-or-later AND MIT'));
  assert.ok(fits('GPL-3.0-only OR MIT'));
  assert.ok(!fits('GPL-3.0-or-later'));
  assert.ok(!fits('AGPL-3.0-or-later'));
  assert.ok(!fits('MIT AND GPL-2.0-only'));
  assert.ok(!fits('(MIT OR Apache-2.0) AND GPL-3.0-only'));
  assert.ok(!fits('SEE LICENSE IN LICENSE.txt'));
});

test('every installed package is under a license that leaves the core free', () => {
  const refused = Object.entries(lock.packages)
    .filter(([path]) => path !== '')
    .filter(([, { license }]) => typeof license !== 'string' || !fits(license))
    .map(([path, { license }]) => `${path}: ${license ?? 'no license'}`);
  assert.deepEqual(refused, []);
});

test('the core names its own license, alike in the package and the lock', () => {
  assert.equal(read('package.json').license, 'AGPL-3.0-or-later');
  assert.equal(lock.packages[''].license, 'AGPL-3.0-or-later');
});

test('THIRD-PARTY.md names every package of the lock, as scripts/third-party.js writes it', () => {
  assert.equal(text('THIRD-PARTY.md'), render(lock), 'run `node scripts/third-party.js`, and commit what it writes');
});

test('ACKNOWLEDGEMENTS.md names every package the core depends on directly', () => {
  const manifest = read('package.json');
  const direct = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies, ...manifest.devDependencies });
  const acknowledgements = text('ACKNOWLEDGEMENTS.md');
  assert.deepEqual(direct.filter((name) => !acknowledgements.includes(`\`${name}\``)), []);
});

test('ACKNOWLEDGEMENTS.md names every program and list that versions.env pins', () => {
  const pins = spawnSync('sh', [fileURLToPath(new URL('../scripts/versions', import.meta.url))], { encoding: 'utf8' }).stdout;
  const names = new Set(pins.split('\n').filter(Boolean).map((line) => line.split('=')[0].replace(/_(DIGEST|RELEASE)$/, '').replaceAll('_', ' ').toLowerCase()));
  assert.ok(names.has('forgejo'));
  const acknowledgements = text('ACKNOWLEDGEMENTS.md').toLowerCase();
  assert.deepEqual([...names].filter((name) => !acknowledgements.includes(name)), []);
});
