// What the builder and the live preview learn of a purge (ADR 0078), from the record of purges in
// the source repository, by its branch: whether one was made since they last took one in, and who
// pushed each save it rewrote, which the builder's role check goes by.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { purgeMarks, purgeRecordReader } from '../src/purge/mark.js';
import { recordFile } from '../src/purge/record.js';

const folder = mkdtempSync(join(tmpdir(), 'konzilo-purge-mark-'));
after(() => rmSync(folder, { recursive: true, force: true }));

// Forgejo with the record's branch at `state.head`, holding `state.record`, or no branch.
const forgejo = (state) => async (url, { headers }) => {
  assert.equal(headers.authorization, 'token a-token');
  const { pathname, searchParams } = new URL(url);
  if (pathname === '/api/v1/repos/org/source/branches/konzilo-purges') {
    return state.head ? { ok: true, status: 200, json: async () => ({ commit: { id: state.head } }) } : { ok: false, status: 404, json: async () => ({}) };
  }
  if (pathname === '/api/v1/repos/org/source/raw/purges.json' && searchParams.get('ref') === state.head) return { ok: true, status: 200, text: async () => recordFile(state.record) };
  throw new Error(`nothing to say of ${pathname}`);
};

test('takes in a purge once, and none where none was made', async () => {
  const state = { head: null, record: null };
  const reader = purgeRecordReader({ forgejo: 'http://forgejo', repository: 'org/source', token: 'a-token', get: forgejo(state) });
  const marks = purgeMarks({ reader, file: join(folder, 'mark') });
  assert.equal(await marks.take(), false, 'none was ever made');
  state.head = 'a'.repeat(40);
  state.record = { purges: [{ at: '2026-11-26T10:00:00Z', by: { login: 'anna', name: 'Anna' } }], pushes: {} };
  assert.equal(await marks.take(), true);
  assert.equal(await marks.take(), true, 'until it is said to be taken in');
  marks.done();
  assert.equal(await marks.take(), false);
  const again = purgeMarks({ reader, file: join(folder, 'mark') });
  assert.equal(await again.take(), false, 'which is kept beside the work');
  assert.equal(await purgeMarks({ reader, file: join(folder, 'other') }).take(), true, 'one that has taken in none takes in what was made');
});

test('reads who pushed each save a purge rewrote, once for each record', async () => {
  const state = { head: 'b'.repeat(40), record: { purges: [], pushes: { ['c'.repeat(40)]: { login: 'ebba', name: 'Ebba', at: '2026-11-02T08:00:00Z' } } } };
  let asked = 0;
  const get = forgejo(state);
  const reader = purgeRecordReader({ forgejo: 'http://forgejo', repository: 'org/source', token: 'a-token', get: async (url, init) => {
    if (url.includes('/raw/')) asked += 1;
    return get(url, init);
  } });
  assert.deepEqual((await reader.record()).pushes, state.record.pushes);
  await reader.record();
  assert.equal(asked, 1);
});
