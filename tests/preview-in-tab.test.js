// The button in a post's form that opens its page in a tab of its own (ADR 0032): the page the
// preview shows for the form open, wherever the preview stands, and the address the tab opens at,
// at the moment the post goes out.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pageShown, tabAddress } from '../src/cms/preview/in-tab.js';

test('opens a post\'s page at the moment it goes out, and at now where it is out already or has none', () => {
  assert.equal(tabAddress({ origin: 'https://preview.example.test', address: '/en/a-post/', moment: '2099-03-01T08:00:00Z' }), 'https://preview.example.test/en/a-post/?konzilo-moment=2099-03-01T08%3A00%3A00Z');
  assert.equal(tabAddress({ origin: 'https://preview.example.test', address: '/en/a-post/', moment: null }), 'https://preview.example.test/en/a-post/?konzilo-moment=now');
});

test('tells whoever watches the page the preview shows for a form, and of a form with none', () => {
  const told = [];
  const stop = pageShown.watch(() => told.push(pageShown.get()));
  pageShown.set({ form: 'articles/aaaaaaaaaaaa', address: '/en/a-post/', moment: null });
  pageShown.set(null);
  stop();
  pageShown.set({ form: 'articles/bbbbbbbbbbbb', address: '/en/b/', moment: null });
  assert.deepEqual(told, [{ form: 'articles/aaaaaaaaaaaa', address: '/en/a-post/', moment: null }, null]);
  assert.equal(pageShown.shownFor('articles/bbbbbbbbbbbb')?.address, '/en/b/');
  assert.equal(pageShown.shownFor('articles/aaaaaaaaaaaa'), null);
});
