// What Konzilo sets of Sveltia's preferences in a browser.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setPreferences } from '../src/cms/preferences.js';

const storage = (items = {}) => ({
  items,
  getItem: (key) => items[key] ?? null,
  setItem: (key, value) => {
    items[key] = value;
  },
});

test('leaves an entry open at a save, in a browser new to it, keeping the rest', () => {
  const held = storage({ 'sveltia-cms.prefs': JSON.stringify({ closeOnSave: true, locale: 'sv' }) });
  setPreferences(held);
  assert.deepEqual(JSON.parse(held.items['sveltia-cms.prefs']), { closeOnSave: false, locale: 'sv' });
});

test('starts from nothing, and from what cannot be read', () => {
  for (const items of [{}, { 'sveltia-cms.prefs': 'not json' }, { 'sveltia-cms.prefs': '3' }]) {
    const held = storage(items);
    setPreferences(held);
    assert.deepEqual(JSON.parse(held.items['sveltia-cms.prefs']), { closeOnSave: false });
  }
});

test('leaves what a person has chosen since alone', () => {
  const held = storage();
  setPreferences(held);
  held.items['sveltia-cms.prefs'] = JSON.stringify({ closeOnSave: true });
  setPreferences(held);
  assert.deepEqual(JSON.parse(held.items['sveltia-cms.prefs']), { closeOnSave: true });
});
