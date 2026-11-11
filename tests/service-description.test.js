// The site description the service reads (ADR 0044): read again when its file changes, also
// when the file is replaced, as Git and an editor write one, by a new file of the same size and
// moment; and a description that cannot be read leaves the last one that could in use.

import assert from 'node:assert/strict';
import { mkdtempSync, renameSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

import { liveDescription } from '../src/service/live-description.js';

let folder;
before(() => {
  folder = mkdtempSync(join(tmpdir(), 'konzilo-description-'));
});
after(() => rmSync(folder, { recursive: true, force: true }));

const type = { label: 'Note', plural: 'Notes', collection: 'notes', address: '/{slug}/', elements: ['paragraph', 'form'], fields: {} };
const withForm = (name) => JSON.stringify({ language: 'en_GB', types: { note: type }, forms: { [name]: { label: 'A form', fields: [{ name: 'note', label: 'Note', kind: 'textarea' }] } } }, null, 2);

test('reads the description again when its file is replaced by one of the same size and moment', () => {
  const file = join(folder, 'site-description.json');
  const moment = new Date('2026-11-11T10:00:00Z');
  writeFileSync(file, withForm('alpha'));
  utimesSync(file, moment, moment);
  const described = liveDescription(file);
  assert.deepEqual(Object.keys(described().forms), ['alpha']);
  const next = join(folder, 'next.json');
  writeFileSync(next, withForm('bravo'));
  utimesSync(next, moment, moment);
  assert.deepEqual([statSync(next).size, statSync(next).mtimeMs], [statSync(file).size, statSync(file).mtimeMs]);
  renameSync(next, file);
  assert.deepEqual(Object.keys(described().forms), ['bravo']);
});

test('goes on with the description it read before where the file cannot be read, and says so', () => {
  const file = join(folder, 'broken.json');
  writeFileSync(file, withForm('alpha'));
  const warned = [];
  const described = liveDescription(file, { warn: (warning) => warned.push(warning) });
  writeFileSync(file, '{ "language": ');
  assert.deepEqual(Object.keys(described().forms), ['alpha']);
  assert.equal(warned.length, 1);
  assert.match(warned[0], /goes on with the site description it read before/);
  assert.deepEqual(Object.keys(described().forms), ['alpha']);
  assert.equal(warned.length, 1, 'said once for one change');
});
