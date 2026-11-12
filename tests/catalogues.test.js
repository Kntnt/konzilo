// The core's catalogues of the texts its editors and visitors read: British English as the
// source, and every other language a translation of it that holds exactly its texts, by the same
// names, with the same placeholders. An editor never meets a text in English because a
// translation lacks it, nor a text no code asks for, and neither does a visitor: what the core's
// data gives visitors to read, a setting's default or a service's purpose, names its text here.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CATALOGUES, catalogueFor, INTERFACE_LANGUAGES, labelIn, SOURCE_LANGUAGE, text, textsOf } from '../src/catalogues.js';

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

// The editor's own code in the browser, the body field's, the image field's, the structure
// field's, the preview's, the publish status's, the Submissions page's, the Mail page's, the
// Personal data page's, the article parts' fields', the authors field's and the field groups',
// names each text whole, as `say('body.loading')`, so that a name it asks for and the source can
// be held side by side: a name the source lacks would throw in the editor, and a text no code
// names is dead.
const EDITOR_AREAS = ['body', 'image', 'structure', 'preview', 'publishing', 'submissions', 'mail', 'personalData', 'parts', 'authors', 'groups'];
const editorCode = fileURLToPath(new URL('../src/cms/', import.meta.url));
const namedInCode = () => {
  const name = new RegExp(String.raw`(['"\`])((?:${EDITOR_AREAS.join('|')})\.[a-zA-Z0-9.-]+)\1`, 'g');
  const named = new Set();
  for (const file of readdirSync(editorCode, { recursive: true }).filter((one) => one.endsWith('.js'))) {
    for (const [, , found] of readFileSync(`${editorCode}${file}`, 'utf8').matchAll(name)) named.add(found);
  }
  return named;
};

test('every text the editor\'s own code names is in the source, and every text of its areas is named there', () => {
  const named = namedInCode();
  for (const area of EDITOR_AREAS) assert.ok(Object.keys(source).some((key) => key.startsWith(`${area}.`)), `the source has the area ${area}`);
  assert.deepEqual([...named].filter((key) => !Object.hasOwn(source, key)), [], 'names the source does not have');
  assert.deepEqual(Object.keys(source).filter((key) => EDITOR_AREAS.includes(key.split('.')[0]) && !named.has(key)), [], 'texts no code names');
});

// The live preview's own pages in a tab of its own, which its gate shows in place of the site's,
// name their texts whole in the gate's code, as the editor's code does.
test('every text the preview\'s own pages name is in the source, and every text of their area is named there', () => {
  const gateCode = fileURLToPath(new URL('../src/preview/', import.meta.url));
  const named = new Set();
  for (const file of readdirSync(gateCode).filter((one) => one.endsWith('.js'))) {
    for (const [, found] of readFileSync(`${gateCode}${file}`, 'utf8').matchAll(/['"`](previewTab\.[a-zA-Z0-9.-]+)['"`]/g)) named.add(found);
  }
  assert.ok(named.size > 0);
  assert.deepEqual([...named].filter((key) => !Object.hasOwn(source, key)), [], 'names the source does not have');
  assert.deepEqual(Object.keys(source).filter((key) => key.startsWith('previewTab.') && !named.has(key)), [], 'texts no code names');
});

// The mail a form's submission is sent in, which the service writes in the page's language, names
// its texts whole in the service's code, as the editor's code does.
test('every text of a submission\'s mail is named in the service\'s code, and every name it asks for is in the source', () => {
  const serviceCode = fileURLToPath(new URL('../src/service/', import.meta.url));
  const named = new Set();
  for (const file of readdirSync(serviceCode).filter((one) => one.endsWith('.js'))) {
    for (const [, found] of readFileSync(`${serviceCode}${file}`, 'utf8').matchAll(/['"`](notification\.[a-zA-Z0-9.-]+)['"`]/g)) named.add(found);
  }
  assert.ok(named.size > 0);
  assert.deepEqual([...named].filter((key) => !Object.hasOwn(source, key)), [], 'names the source does not have');
  assert.deepEqual(Object.keys(source).filter((key) => key.startsWith('notification.') && !named.has(key)), [], 'texts no code names');
});

test('the source is written in British English, not American', () => {
  const american = /\b(?:colors?|centers?|behaviors?|favorites?|gray|catalogs?|canceled|canceling|organizations?|organize[ds]?|recognize[ds]?|customize[ds]?|optimize[ds]?|analyze[ds]?|labeled|labeling|modeled|traveled)\b/i;
  for (const [name, value] of Object.entries(source)) assert.doesNotMatch(value, american, name);
});

test('the defaults of the core\'s settings groups that visitors read are texts of the catalogues, by name', () => {
  const groups = JSON.parse(readFileSync(fileURLToPath(new URL('../src/format/settings-groups.json', import.meta.url)), 'utf8'));
  const settings = Object.entries(groups).flatMap(([group, { settings: own = {}, parts = {}, types }]) => [
    ...Object.entries(own).map(([name, setting]) => [`${group}.${name}`, setting]),
    ...Object.entries(parts).flatMap(([part, { settings: inPart = {} }]) => Object.entries(inPart).map(([name, setting]) => [`${group}.${part}.${name}`, setting])),
    ...Object.entries(types?.settings ?? {}).map(([name, setting]) => [`${group}.types.${name}`, setting]),
  ]);
  // A default for the types of one kind, as an article's meta line, too.
  const defaults = settings.flatMap(([path, setting]) => [[path, setting.default], ...Object.entries(setting.defaultFor ?? {}).map(([kind, value]) => [`${path}.defaultFor.${kind}`, value])]);
  const named = defaults.filter(([, value]) => value !== null && typeof value === 'object' && !Object.hasOwn(value, 'identity'));
  assert.ok(named.some(([path]) => path.includes('.defaultFor.')));
  for (const [path, value] of named) {
    assert.deepEqual(Object.keys(value), ['text'], path);
    assert.ok(Object.hasOwn(source, value.text), `${path}: ${value.text}`);
    assert.match(value.text, /^site\./, path);
  }
});

test('the purposes of the core\'s services, which visitors read in the consent, are texts of the catalogues, by name', () => {
  const data = (name) => JSON.parse(readFileSync(fileURLToPath(new URL(`../src/format/${name}`, import.meta.url)), 'utf8'));
  const purposes = [
    ...Object.entries(data('services.json')).map(([id, facts]) => [id, facts.purpose]),
    ...Object.entries(data('tag-managers.json')).flatMap(([id, facts]) => [[id, facts.purpose], [`${id} tracker`, facts.tracker.purpose]]),
  ];
  for (const [id, purpose] of purposes) {
    assert.deepEqual(Object.keys(purpose), ['text'], id);
    assert.ok(Object.hasOwn(source, purpose.text), `${id}: ${purpose.text}`);
    assert.match(purpose.text, /^site\.service\./, id);
  }
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

test('gives the texts of an area in a language or a locale, by their names after it, their placeholders left for the caller', () => {
  assert.deepEqual(textsOf('sv', 'site.pager.'), { label: 'Sidor', page: 'Sida {n}', previous: 'Föregående sida', next: 'Nästa sida' });
  assert.deepEqual(textsOf('sv_SE', 'site.pager.'), textsOf('sv', 'site.pager.'));
  assert.deepEqual(textsOf('de_DE', 'site.pager.'), { label: 'Pages', page: 'Page {n}', previous: 'Previous page', next: 'Next page' });
  assert.deepEqual(textsOf('en', 'no.such.'), {});
});

test('takes the catalogue of a language or a locale, British English\'s where there is none', () => {
  assert.equal(catalogueFor('sv'), 'sv');
  assert.equal(catalogueFor('sv_SE'), 'sv');
  assert.equal(catalogueFor('sv-FI'), 'sv');
  assert.equal(catalogueFor('en-US'), 'en');
  assert.equal(catalogueFor('de_DE'), 'en');
  assert.equal(catalogueFor(null), 'en');
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
