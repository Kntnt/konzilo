// The interface language in the editor's browser: the editor's own choice, made through
// Sveltia's language preference, else the site's, which Konzilo sets as Sveltia's
// preference so that Sveltia's own interface follows it too.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chosenLanguage, followSite, languageChanged } from '../src/cms/interface-language.js';

const storage = (items = {}) => ({
  items,
  getItem: (key) => items[key] ?? null,
  setItem: (key, value) => {
    items[key] = value;
  },
});
const preferences = (held) => JSON.parse(held.items['sveltia-cms.prefs']);
const choose = (held, locale) => {
  held.items['sveltia-cms.prefs'] = JSON.stringify({ ...preferences(held), locale });
};

test('an editor who has chosen nothing follows the site, whose language Sveltia is set to, keeping its other preferences', () => {
  const held = storage({ 'sveltia-cms.prefs': JSON.stringify({ closeOnSave: false }) });
  assert.equal(chosenLanguage(held), null);
  followSite('sv', held);
  assert.deepEqual(preferences(held), { closeOnSave: false, locale: 'sv' });
  assert.equal(chosenLanguage(held), null, 'what Konzilo set is no choice of the editor\'s');
  followSite('en', held);
  assert.deepEqual(preferences(held), { closeOnSave: false, locale: 'en-GB' });
  assert.equal(chosenLanguage(held), null);
});

test('Sveltia\'s Automatic, no preferences, and preferences that cannot be read are no choice', () => {
  for (const items of [{}, { 'sveltia-cms.prefs': JSON.stringify({ locale: 'auto' }) }, { 'sveltia-cms.prefs': 'not json' }, { 'sveltia-cms.prefs': '3' }]) {
    assert.equal(chosenLanguage(storage(items)), null, JSON.stringify(items));
  }
  const held = storage({ 'sveltia-cms.prefs': 'not json' });
  followSite('sv', held);
  assert.deepEqual(preferences(held), { locale: 'sv' });
});

test('a language chosen in Sveltia\'s preferences is the editor\'s, in the core\'s texts its catalogue\'s, or British English where the core has none', () => {
  const held = storage();
  followSite('sv', held);
  for (const [locale, language] of [['en-GB', 'en'], ['en-US', 'en'], ['de', 'en'], ['sv', null]]) {
    choose(held, locale);
    assert.equal(chosenLanguage(held), language, locale);
  }
  assert.equal(chosenLanguage(storage({ 'sveltia-cms.prefs': JSON.stringify({ locale: 'sv' }) })), 'sv');
});

test('the editor is loaded again when a choice in Sveltia\'s preferences would load another language, or Automatic, which is the site\'s', () => {
  const held = storage();
  followSite('sv', held);
  assert.equal(languageChanged(null, held), false);
  choose(held, 'en-GB');
  assert.equal(languageChanged(null, held), true);
  assert.equal(languageChanged('en', held), false);
  choose(held, 'en-US');
  assert.equal(languageChanged('en', held), false, 'the same catalogue');
  choose(held, 'sv');
  assert.equal(languageChanged('en', held), true, 'back to the site\'s');
  choose(held, 'auto');
  assert.equal(languageChanged(null, held), true, 'Automatic takes the site\'s again');
});
