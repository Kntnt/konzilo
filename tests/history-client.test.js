// What the editor asks of the service for a form's revisions (ADR 0074), against a stand-in for its
// fetch: a page at a time, each revision read through the form's own format, with a post's status.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { revisionsOf } from '../src/cms/history/client.js';

const FIELDS = [{ name: 'title', widget: 'string' }, { name: 'status', widget: 'select', options: [{ value: 'draft', label: 'Draft' }] }];
// The form's format, as a stand-in: a line `key: value` for each value.
const parse = (text) => Object.fromEntries(text.trim().split('\n').map((line) => line.split(': ')));

test('reads a page of a file\'s revisions, each through the form\'s format, with its status', async () => {
  const asked = [];
  const ask = async (address, init) => {
    asked.push({ address, authorization: init.headers.authorization, cache: init.cache });
    return { ok: true, status: 200, json: async () => ({
      revisions: [
        { commit: 'c2', moment: '2026-11-03T08:00:05Z', account: { login: 'ebba', name: 'Ebba Editor' }, text: 'title: Second\nstatus: draft\n' },
        { commit: 'c1', moment: '2026-11-02T09:00:00Z', account: null, text: null },
      ],
      more: true,
    }) };
  };
  const page = await revisionsOf({ path: 'articles/a b.md', page: 2, fields: FIELDS, parse, credential: () => 'token mine', ask });
  assert.deepEqual(asked, [{ address: '/_konzilo/revisions?path=articles%2Fa+b.md&page=2', authorization: 'token mine', cache: 'no-store' }]);
  assert.deepEqual(page, {
    revisions: [
      { commit: 'c2', moment: '2026-11-03T08:00:05Z', account: { login: 'ebba', name: 'Ebba Editor' }, values: { title: 'Second', status: 'draft' }, status: 'Draft' },
      { commit: 'c1', moment: '2026-11-02T09:00:00Z', account: null, values: null, status: null },
    ],
    more: true,
  });
});

test('throws where the service cannot be asked, or answers otherwise', async () => {
  const args = { path: 'a.md', fields: FIELDS, parse, credential: () => 'token mine' };
  await assert.rejects(revisionsOf({ ...args, ask: async () => ({ ok: false, status: 502, json: async () => ({}) }) }));
  await assert.rejects(revisionsOf({ ...args, ask: async () => { throw new Error('offline'); } }));
  await assert.rejects(revisionsOf({ ...args, credential: () => null, ask: async () => assert.fail('asked') }));
});

test('gives a revision that cannot be read through the format with no values', async () => {
  const ask = async () => ({ ok: true, status: 200, json: async () => ({ revisions: [{ commit: 'c1', moment: 'x', account: null, text: 'broken' }], more: false }) });
  const page = await revisionsOf({ path: 'a.md', fields: FIELDS, parse: () => { throw new Error('no'); }, credential: () => 't', ask });
  assert.equal(page.revisions[0].values, null);
  assert.equal(page.revisions[0].unreadable, true);
});
