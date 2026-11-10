// The core's catalogues of the texts its editors read: British English as the source, and
// every other language a translation of it that holds exactly its texts, by the same names, with
// the same placeholders. An editor never meets a text in English because a translation lacks it,
// nor a text no code asks for.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CATALOGUES, INTERFACE_LANGUAGES, interfaceLanguageFor, labelIn, SOURCE_LANGUAGE, text } from '../src/catalogues.js';

const folder = fileURLToPath(new URL('../src/catalogues/', import.meta.url));
const files = readdirSync(folder).filter((name) => name.endsWith('.json')).sort();
const read = (name) => JSON.parse(readFileSync(`${folder}${name}`, 'utf8'));
const source = read(`${SOURCE_LANGUAGE}.json`);
const placeholders = (value) => [...new Set([...value.matchAll(/\{(\w+)\}/g)].map(([, name]) => name))].sort();

test('British English is the source, and Swedish its first translation', () => {
  assert.equal(SOURCE_LANGUAGE, 'en');
  assert.deepEqual(files, ['en.json', 'sv.json']);
});

test('each catalogue in the folder is one the core reads', () => {
  assert.deepEqual([...INTERFACE_LANGUAGES].sort(), files.map((name) => name.replace(/\.json$/, '')));
  for (const language of INTERFACE_LANGUAGES) assert.deepEqual(CATALOGUES[language], read(`${language}.json`), language);
});

test('every text of the source is a text, by a stable name', () => {
  assert.ok(Object.keys(source).length > 0);
  for (const [name, value] of Object.entries(source)) {
    assert.match(name, /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9-]*)+$/, name);
    assert.equal(typeof value, 'string', name);
    assert.notEqual(value.trim(), '', name);
  }
});

for (const name of files.filter((one) => one !== `${SOURCE_LANGUAGE}.json`)) {
  test(`${name} holds every text the source has, and none it does not`, () => {
    const catalogue = read(name);
    assert.deepEqual(Object.keys(source).filter((key) => !Object.hasOwn(catalogue, key)), [], 'texts the translation lacks');
    assert.deepEqual(Object.keys(catalogue).filter((key) => !Object.hasOwn(source, key)), [], 'texts the source does not have');
  });

  test(`${name} names the same placeholders in each text as the source`, () => {
    const catalogue = read(name);
    for (const [key, value] of Object.entries(catalogue)) {
      assert.equal(typeof value, 'string', key);
      assert.notEqual(value.trim(), '', key);
      assert.deepEqual(placeholders(value), placeholders(source[key] ?? ''), key);
    }
  });
}

test('the source is written in British English, not American', () => {
  const american = /\b(?:colors?|centers?|behaviors?|favorites?|gray|catalogs?|canceled|canceling|organizations?|organize[ds]?|recognize[ds]?|customize[ds]?|optimize[ds]?|analyze[ds]?|labeled|labeling|modeled|traveled)\b/i;
  for (const [name, value] of Object.entries(source)) assert.doesNotMatch(value, american, name);
});

test('gives a text in a language, with its placeholders filled, and British English for a language without a catalogue', () => {
  const name = Object.keys(source).find((key) => placeholders(source[key]).length === 0);
  assert.equal(text('en', name), source[name]);
  assert.equal(text('sv', name), CATALOGUES.sv[name]);
  assert.equal(text('de', name), source[name]);
  const filled = Object.keys(source).find((key) => placeholders(source[key]).length > 0);
  const values = Object.fromEntries(placeholders(source[filled]).map((one) => [one, `<${one}>`]));
  assert.equal(text('en', filled, values), source[filled].replace(/\{(\w+)\}/g, (_, one) => `<${one}>`));
  assert.throws(() => text('en', 'no.such.text'), /no\.such\.text/);
});

test('takes the interface language of a language or a locale, British English where there is no catalogue', () => {
  assert.equal(interfaceLanguageFor('sv'), 'sv');
  assert.equal(interfaceLanguageFor('sv_SE'), 'sv');
  assert.equal(interfaceLanguageFor('sv-FI'), 'sv');
  assert.equal(interfaceLanguageFor('en-US'), 'en');
  assert.equal(interfaceLanguageFor('de_DE'), 'en');
  assert.equal(interfaceLanguageFor(null), 'en');
});

test('gives a site\'s own label in a language: one text in every language, else the language\'s, else British English', () => {
  assert.equal(labelIn('Artikel', 'en'), 'Artikel');
  assert.equal(labelIn('Artikel', 'sv'), 'Artikel');
  const label = { en: 'Article', sv: 'Artikel' };
  assert.equal(labelIn(label, 'sv'), 'Artikel');
  assert.equal(labelIn(label, 'en'), 'Article');
  assert.equal(labelIn({ en: 'Article' }, 'sv'), 'Article');
  assert.equal(labelIn(label, 'sv_SE'), 'Artikel');
  assert.equal(labelIn(label, 'de_DE'), 'Article');
});
