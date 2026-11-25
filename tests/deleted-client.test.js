// What the *Deleted* page asks of the service (ADR 0077), against a stand-in for its fetch: the
// deleted entries a page at a time, newest deletion first, of one type where it is chosen, each
// named as its last revision named it.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deletedPages, entryTitle } from '../src/cms/deleted/client.js';

const row = (path, commit) => ({ path, collection: path.split('/')[0], commit, moment: '2026-11-04T08:00:05Z', account: null, last: { commit: `${commit}-1`, text: '' }, along: [] });

test('reads the deleted entries a page at a time, of one type where it is chosen, with what Sveltia signed in with', async () => {
  const asked = [];
  const pages = { 1: { deleted: [row('articles/a.md', 'c9'), row('articles/b.md', 'c8')], more: true }, 2: { deleted: [row('articles/c.md', 'c7')], more: false } };
  const ask = async (address, init) => {
    asked.push({ address, authorization: init.headers.authorization, cache: init.cache });
    return { ok: true, status: 200, json: async () => pages[new URL(address, 'http://x').searchParams.get('page')] };
  };
  const reading = deletedPages({ collection: 'articles', credential: () => 'token mine', ask });
  const first = await reading.first();
  assert.deepEqual(first.deleted.map(({ path }) => path), ['articles/a.md', 'articles/b.md']);
  assert.equal(first.more, true);
  // Two quick clicks ask once.
  const [older] = await Promise.all([reading.older(), reading.older()]);
  assert.deepEqual(older.deleted.map(({ path }) => path), ['articles/a.md', 'articles/b.md', 'articles/c.md']);
  assert.equal(older.more, false);
  assert.equal(await reading.older(), null);
  assert.deepEqual(asked, [
    { address: '/_konzilo/deleted?page=1&collection=articles', authorization: 'token mine', cache: 'no-store' },
    { address: '/_konzilo/deleted?page=2&collection=articles', authorization: 'token mine', cache: 'no-store' },
  ]);

  const every = deletedPages({ credential: () => 'token mine', ask });
  await every.first();
  assert.equal(asked.at(-1).address, '/_konzilo/deleted?page=1');
});

test('throws where the service cannot be asked, or answers otherwise', async () => {
  await assert.rejects(deletedPages({ credential: () => 'token mine', ask: async () => ({ ok: false, status: 502, json: async () => ({}) }) }).first());
  await assert.rejects(deletedPages({ credential: () => null, ask: async () => assert.fail('asked') }).first());
});

test('names an entry as its form names it, by its collection\'s field, else by its ID', () => {
  assert.equal(entryTitle({ values: { 'group-name.title': 'The meadow' }, collection: { identifier_field: 'group-name.title' }, path: 'articles/aaaaaaaaaaaa.md' }), 'The meadow');
  assert.equal(entryTitle({ values: { name: 'Meadows' }, collection: { identifier_field: 'name' }, path: 'topics/sv-SE/bbbbbbbbbbbb.json' }), 'Meadows');
  assert.equal(entryTitle({ values: { alt: '' }, collection: { identifier_field: 'alt' }, path: 'image-library/cccccccccccc.json' }), 'cccccccccccc');
  assert.equal(entryTitle({ values: null, collection: undefined, path: 'articles/dddddddddddd.md' }), 'dddddddddddd');
});
