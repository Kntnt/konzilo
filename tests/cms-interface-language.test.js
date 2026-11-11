// The interface language in the editor's browser: the editor's own choice, made through
// Sveltia's language preference, else the site's, which Konzilo sets as Sveltia's
// preference where the browser's language would not give it, so that Sveltia's own
// interface follows it too: before Sveltia loads, as the last load found it, and once
// more, by loading again, where a load finds it new or changed.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chosenLanguage, followSite, languageChanged, loadedWith, startLanguage } from '../src/cms/interface-language.js';

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
  followSite('sv', held, ['en-US', 'en']);
  assert.deepEqual(preferences(held), { closeOnSave: false, locale: 'sv' });
  assert.equal(chosenLanguage(held), null, 'what Konzilo set is no choice of the editor\'s');
  followSite('en', held, ['de-DE']);
  assert.deepEqual(preferences(held), { closeOnSave: false, locale: 'en-GB' });
  assert.equal(chosenLanguage(held), null);
});

test('where the browser\'s language is the site\'s, Sveltia is left to take it by itself', () => {
  const held = storage();
  followSite('sv', held, ['en-US']);
  followSite('en', held, ['en-GB', 'sv']);
  assert.deepEqual(preferences(held), { locale: 'auto' });
  followSite('sv', held, ['sv-SE']);
  assert.deepEqual(preferences(held), { locale: 'auto' });
  assert.equal(chosenLanguage(held), null);
});

test('Sveltia\'s Automatic, no preferences, and preferences that cannot be read are no choice', () => {
  for (const items of [{}, { 'sveltia-cms.prefs': JSON.stringify({ locale: 'auto' }) }, { 'sveltia-cms.prefs': 'not json' }, { 'sveltia-cms.prefs': '3' }]) {
    assert.equal(chosenLanguage(storage(items)), null, JSON.stringify(items));
  }
  const held = storage({ 'sveltia-cms.prefs': 'not json' });
  followSite('sv', held, ['en-GB']);
  assert.deepEqual(preferences(held), { locale: 'sv' });
});

test('a language chosen in Sveltia\'s preferences is the editor\'s, in the core\'s texts its catalogue\'s, or British English where the core has none', () => {
  const held = storage();
  followSite('sv', held, ['en-GB']);
  for (const [locale, language] of [['en-GB', 'en'], ['en-US', 'en'], ['de', 'en'], ['sv', null]]) {
    choose(held, locale);
    assert.equal(chosenLanguage(held), language, locale);
  }
  assert.equal(chosenLanguage(storage({ 'sveltia-cms.prefs': JSON.stringify({ locale: 'sv' }) })), 'sv');
});

test('the editor is loaded again when Sveltia\'s preference changes to a choice of another language, or to Automatic, which is the site\'s', () => {
  const held = storage();
  followSite('sv', held, ['en-GB']);
  const site = loadedWith(null, held);
  assert.equal(languageChanged(site, held), false);
  choose(held, 'en-GB');
  assert.equal(languageChanged(site, held), true);
  const english = loadedWith('en', held);
  assert.equal(languageChanged(english, held), false);
  choose(held, 'en-US');
  assert.equal(languageChanged(english, held), false, 'the same catalogue');
  choose(held, 'sv');
  assert.equal(languageChanged(english, held), true, 'back to the site\'s');
  choose(held, 'auto');
  assert.equal(languageChanged(english, held), true, 'Automatic takes the site\'s again');
});

test('Sveltia left to take the browser\'s language loads nothing again until a person chooses', () => {
  const held = storage();
  followSite('en', held, ['en-GB']);
  const site = loadedWith(null, held);
  assert.equal(languageChanged(site, held), false);
  choose(held, 'sv');
  assert.equal(languageChanged(site, held), true);
});

test('says whether Sveltia, started in another language, must start again in the site\'s', () => {
  const held = storage();
  assert.equal(followSite('en', held, ['en-GB']), false, 'Sveltia takes the browser\'s by itself');
  assert.equal(followSite('sv', held, ['en-GB']), true, 'the site\'s is new');
  assert.equal(followSite('sv', held, ['en-GB']), false, 'and then known');
  assert.equal(followSite('en', held, ['en-GB']), true, 'the site\'s has changed');
  const refusing = { getItem: () => null, setItem: () => { throw new Error('no storage'); } };
  assert.equal(followSite('sv', refusing, ['en-GB']), false, 'a browser that keeps nothing is never loaded again for it');
  const forgetting = { getItem: () => null, setItem: () => {} };
  assert.equal(followSite('sv', forgetting, ['en-GB']), false);
});

test('before Sveltia loads, sets its preference to the site\'s language as the last load found it, unless the editor has chosen one', () => {
  const fresh = storage();
  startLanguage(fresh);
  assert.deepEqual(fresh.items, {}, 'nothing is known in a browser new to the site');
  const held = storage();
  followSite('sv', held, ['en-GB']);
  choose(held, 'auto');
  startLanguage(held);
  assert.equal(preferences(held).locale, 'sv', 'Automatic is the site\'s');
  assert.equal(followSite('sv', held, ['en-GB']), false);
  choose(held, 'en-US');
  startLanguage(held);
  assert.equal(preferences(held).locale, 'en-US', 'the editor\'s choice stays');
});
