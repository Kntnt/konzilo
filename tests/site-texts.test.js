// The core's texts a site may give its own of, in each of its languages
//: the language switcher's label, a post list's text where it
// matches nothing, a form's texts and search's. The core gives each in
// English and Swedish; a site gives its own per language in
// `konzilo({ texts })`, and its main language's in `emptyList` and
// `formTexts`; a language the core writes no texts in takes English, which
// the build warns of, naming each text the site has not given.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { givenTexts, siteTexts } from '../src/astro/site-texts.js';

const language = (locale, main = false) => ({ locale, tag: locale.replace('_', '-'), prefix: locale.slice(0, 2), main });
const swedishAndEnglish = [language('sv_SE', true), language('en_GB')];

test('each language takes the core\'s texts in it, the main language the site\'s own in emptyList and formTexts, and any the site gives per language over them', () => {
  const given = givenTexts({ en_GB: { languageSwitcher: 'Other languages', forms: { send: 'Send it' }, search: { label: 'Find' } } });
  const { texts, warnings } = siteTexts(swedishAndEnglish, given, { emptyList: 'Inget här.', forms: { send: 'Skicka in' } });

  assert.deepEqual(warnings, []);
  assert.deepEqual(Object.keys(texts), ['sv_SE', 'en_GB']);
  assert.equal(texts.sv_SE.languageSwitcher, 'Språk');
  assert.equal(texts.sv_SE.emptyList, 'Inget här.');
  assert.equal(texts.sv_SE.forms.send, 'Skicka in');
  assert.equal(texts.sv_SE.search.label, 'Sök');
  assert.equal(texts.en_GB.languageSwitcher, 'Other languages');
  assert.equal(texts.en_GB.emptyList, 'Nothing to show yet.');
  assert.equal(texts.en_GB.forms.send, 'Send it');
  assert.equal(texts.en_GB.search.label, 'Find');
  assert.equal(texts.en_GB.search.submit, 'Search');
});

test('a site in one language, or none, takes the core\'s texts in it, or English', () => {
  assert.equal(siteTexts([{ locale: 'sv_SE', tag: 'sv-SE', prefix: null, main: true }]).texts.sv_SE.emptyList, 'Inget att visa ännu.');
  assert.deepEqual(Object.keys(siteTexts([]).texts), ['']);
  assert.equal(siteTexts([]).texts[''].languageSwitcher, 'Languages');
});

test('a language the core writes no texts in takes English, and the warning names each text the site has not given in it', () => {
  const given = givenTexts({ de_DE: { languageSwitcher: 'Sprachen', search: { label: 'Suche' } } });
  const { texts, warnings } = siteTexts([language('sv_SE', true), language('de_DE')], given);

  assert.equal(texts.de_DE.languageSwitcher, 'Sprachen');
  assert.equal(texts.de_DE.emptyList, 'Nothing to show yet.');
  assert.equal(texts.de_DE.search.label, 'Suche');
  assert.equal(texts.de_DE.search.submit, 'Search');
  assert.equal(warnings.length, 1);
  const [warning] = warnings;
  assert.match(warning, /^Konzilo writes no texts of its own in de_DE, so the pages in de_DE show its own words in English/);
  assert.match(warning, /konzilo\(\{ texts: \{ de_DE: \{ … \} \} \}\)/);
  assert.match(warning, /astro\.config\.mjs: emptyList, forms\.required, /);
  assert.match(warning, /forms\.send, /);
  assert.match(warning, /search\.submit/);
  assert.doesNotMatch(warning, /languageSwitcher|search\.label\b/);
});

test('a text the core has not got, or one that is no text, fails at once, naming it', () => {
  assert.throws(() => givenTexts({ de_DE: { switcher: 'Sprachen' } }), /texts\.de_DE\.switcher is not one of the texts a site gives, which are languageSwitcher, emptyList, forms, search/);
  assert.throws(() => givenTexts({ de_DE: { emptyList: '' } }), /texts\.de_DE\.emptyList must be a text/);
  assert.throws(() => givenTexts({ de_DE: { forms: { submit: 'Go' } } }), /texts\.de_DE\.forms\.submit is not one of the form's texts/);
  assert.throws(() => givenTexts({ de_DE: { search: { find: 'Suche' } } }), /texts\.de_DE\.search\.find is not one of search's texts/);
  assert.throws(() => givenTexts({ German: {} }), /texts\.German is not a locale/);
});
