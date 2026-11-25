// What a read of an incoming feed does to its posts (ADR 0079): the items a feed holds at its first
// read are held, and make no posts; a later item makes one; an item whose title, text, date or link
// changes corrects its post; a known item missing from a read is withdrawn where the feed still
// holds an older item, and has fallen out where it is older than every item the feed holds; an
// empty read withdraws nothing; and an item back after a withdrawal makes its post again.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { itemVersion } from '../src/feeds/post.js';
import { reconcile } from '../src/feeds/reconcile.js';

const NOW = '2026-11-25T10:00:00Z';
const item = (id, date, more = {}) => ({ id, title: `Release ${id}`, text: { html: `<p>${id}</p>` }, date, link: `https://news.example.com/${id}`, ...more });
const live = (one, more = {}) => ({ seen: '2026-11-20T00:00:00Z', moment: one.date, path: `articles/${one.id}000000.md`, version: itemVersion(one), slug: `release-${one.id}`, state: 'live', ...more });
const held = (one) => ({ seen: '2026-11-20T00:00:00Z', moment: one.date, path: null, version: null, slug: null, state: 'held' });
const known = (entries) => new Map(entries);

const A = item('a', '2026-11-21T08:00:00Z');
const B = item('b', '2026-11-22T08:00:00Z');
const C = item('c', '2026-11-23T08:00:00Z');
const D = item('d', '2026-11-24T08:00:00Z');

const ids = (list) => list.map((one) => one.item?.id ?? one.id);

describe('the first read of a feed', () => {
  test('holds every item it gives, and makes no post', () => {
    const done = reconcile({ known: known([]), first: true, items: [B, A], now: NOW });
    assert.deepEqual(ids(done.hold), ['b', 'a']);
    assert.deepEqual([done.make, done.correct, done.restore, done.withdraw], [[], [], [], []]);
  });

  test('of an empty feed holds nothing', () => {
    assert.deepEqual(reconcile({ known: known([]), first: true, items: [], now: NOW }).hold, []);
  });
});

describe('a later read', () => {
  test('makes a post of an item the first read did not hold, and none of one it held', () => {
    const done = reconcile({ known: known([['a', held(A)]]), first: false, items: [B, A], now: NOW });
    assert.deepEqual(ids(done.make), ['b']);
    assert.deepEqual([done.hold, done.correct, done.restore, done.withdraw], [[], [], [], []]);
  });

  test('of the same feed again makes no second post', () => {
    const done = reconcile({ known: known([['a', held(A)], ['b', live(B)]]), first: false, items: [B, A], now: NOW });
    assert.deepEqual([done.make, done.correct, done.restore, done.withdraw], [[], [], [], []]);
  });

  test('corrects the post of an item whose title, text, date or link has changed, under the same ID', () => {
    for (const change of [{ title: 'Corrected' }, { text: { html: '<p>Corrected.</p>' } }, { date: '2026-11-22T09:00:00Z' }, { link: 'https://news.example.com/b2' }]) {
      const done = reconcile({ known: known([['b', live(B)]]), first: false, items: [{ ...B, ...change }], now: NOW });
      assert.deepEqual(ids(done.correct), ['b'], JSON.stringify(change));
      assert.equal(done.correct[0].known.path, 'articles/b000000.md');
    }
  });

  test('withdraws the post of an item missing while the feed holds an older one', () => {
    const done = reconcile({ known: known([['a', held(A)], ['b', live(B)], ['c', live(C)]]), first: false, items: [C, A], now: NOW });
    assert.deepEqual(done.withdraw.map(({ path }) => path), ['articles/b000000.md']);
  });

  test('leaves the post of an item that fell out of a feed of its latest items, older than every item it holds', () => {
    // The feed keeps its latest three: a fourth arrives, and the oldest falls out.
    const done = reconcile({ known: known([['a', live(A)], ['b', live(B)], ['c', live(C)]]), first: false, items: [D, C, B], now: NOW });
    assert.deepEqual(ids(done.make), ['d']);
    assert.deepEqual(done.withdraw, []);
  });

  test('withdraws nothing where the feed holds no items', () => {
    const done = reconcile({ known: known([['a', live(A)], ['b', live(B)]]), first: false, items: [], now: NOW });
    assert.deepEqual(done.withdraw, []);
  });

  test('withdraws nothing where the missing item and the oldest it holds have one moment', () => {
    const twin = item('t', B.date);
    const done = reconcile({ known: known([['b', live(B)], ['t', live(twin)]]), first: false, items: [twin], now: NOW });
    assert.deepEqual(done.withdraw, []);
  });

  test('reckons an item with no date by when it was first read', () => {
    const undated = item('u', null);
    const done = reconcile({ known: known([['u', live(undated, { moment: '2026-11-20T12:00:00Z', seen: '2026-11-20T12:00:00Z' })], ['b', live(B)]]), first: false, items: [undated], now: NOW });
    assert.deepEqual(done.withdraw.map(({ path }) => path), ['articles/b000000.md']);
  });

  test('makes the post of an item back after its withdrawal again, at its own path', () => {
    const done = reconcile({ known: known([['a', held(A)], ['b', live(B, { state: 'withdrawn' })]]), first: false, items: [B, A], now: NOW });
    assert.deepEqual(ids(done.restore), ['b']);
    assert.equal(done.restore[0].known.path, 'articles/b000000.md');
  });

  test('watches no item the first read held, for a change or a withdrawal', () => {
    const done = reconcile({ known: known([['a', held(A)], ['b', held(B)]]), first: false, items: [{ ...B, title: 'Changed' }], now: NOW });
    assert.deepEqual([done.make, done.correct, done.restore, done.withdraw], [[], [], [], []]);
  });

  test('takes an ID the feed gives twice once, the first', () => {
    const done = reconcile({ known: known([]), first: false, items: [B, { ...B, title: 'Again' }], now: NOW });
    assert.deepEqual(done.make.map(({ item: one }) => one.title), ['Release b']);
  });
});
