// The texts a page shows of the core's own that a site may give its own of,
// in the page's language: the language switcher's label, the text
// of a post list that matches nothing, a form's texts, search's and the
// plain text of a page not found, which the site template's 404 page shows
// where the site settings choose no page of its own; and the site template's
// own words, its frame's, which name its menus and label the publisher's
// details, and the heading over the related posts under an article. The core
// gives each in the catalogues (ADR 0066), under `site.`, in the content's
// language, never the editor's interface language; a site gives its own per
// language in `konzilo({ texts })`, by locale:
//
//   texts: { de_DE: { languageSwitcher: 'Sprachen', emptyList: 'Noch nichts.', readMore: 'Mehr dazu', forms: { send: 'Senden' }, search: { label: 'Suche' }, notFound: { title: 'Seite nicht gefunden' }, frame: { mainMenu: 'Hauptmenü' } } }
//
// and its main language's, as before languages, in `konzilo({ emptyList,
// formTexts })`. A page takes the site's text in its language, else the
// core's; on a language the core has no catalogue for, the core's British
// English ones, which the build warns of, naming each text the site has not
// given. The core's other words, such as the consent dialog's labels and an
// embed's sentence that the site's script has not run, are the core's alone
// and come in British English there too.
//
// The integration checks the texts as konzilo() is called, and hands each
// language's to the site's pages through its module `virtual:konzilo/texts`
// (textsModule()), which the core's components read with textsIn(locale).

import { catalogueFor, SOURCE_LANGUAGE, text, textsOf } from '../catalogues.js';
import { LOCALE } from '../site-description.js';
import { FORM_TEXT_NAMES, formTexts, siteFormTexts } from './forms.js';
import { SEARCH_TEXT_NAMES, searchTexts } from './search.js';

// Whether the core has a catalogue for a site's language, its locale: British
// English's serves a site that declares none.
const hasCatalogue = (locale) => locale === null || catalogueFor(locale) === locale.split('_')[0];

// The names of the texts a site may give per language: each a text, or an
// object of texts.
const TEXT_NAMES = ['languageSwitcher', 'emptyList', 'readMore'];
const NAMES = [...TEXT_NAMES, 'forms', 'search', 'notFound', 'frame'];

// The texts of an area of the catalogues a site may give by their names in it,
// each area by the name of its object in `texts`, with what a problem calls it:
// the plain text of a page not found, its title and heading, its sentence and
// its link to the start page; and the site template's frame's.
const AREAS = {
  notFound: { prefix: 'site.notFound.', called: 'the texts of a page not found' },
  frame: { prefix: 'site.frame.', called: 'the texts of the site template\'s frame' },
};
const namesIn = (area) => Object.keys(textsOf(SOURCE_LANGUAGE, AREAS[area].prefix));

// The texts a site gives in `konzilo({ texts })`, checked as konzilo() is
// called: an object of each language's, by its locale, each an
// object of texts by the names above, `forms`, `search` and `notFound`
// objects of their texts by the keys the core gives them. Throws, naming
// what is wrong.
export function givenTexts(given = {}) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(given)) throw new Error('Konzilo: texts must be an object of each language\'s texts, by its locale, such as { de_DE: { languageSwitcher: \'Sprachen\' } }');
  const checked = {};
  for (const [locale, texts] of Object.entries(given)) {
    if (!LOCALE.test(locale)) throw new Error(`Konzilo: texts.${locale} is not a locale, such as de_DE`);
    if (!object(texts)) throw new Error(`Konzilo: texts.${locale} must be an object of the texts in ${locale}, by name`);
    for (const [name, text] of Object.entries(texts)) {
      if (!NAMES.includes(name)) throw new Error(`Konzilo: texts.${locale}.${name} is not one of the texts a site gives, which are ${NAMES.join(', ')}`);
      if (TEXT_NAMES.includes(name) && (typeof text !== 'string' || text.trim() === '')) throw new Error(`Konzilo: texts.${locale}.${name} must be a text`);
    }
    const forms = rename(() => siteFormTexts(texts.forms ?? {}), 'formTexts', `texts.${locale}.forms`);
    const search = texts.search ?? {};
    if (!object(search)) throw new Error(`Konzilo: texts.${locale}.search must be an object of search's texts by name`);
    for (const [name, text] of Object.entries(search)) {
      if (!SEARCH_TEXT_NAMES.includes(name)) throw new Error(`Konzilo: texts.${locale}.search.${name} is not one of search's texts, which are ${SEARCH_TEXT_NAMES.join(', ')}`);
      if (typeof text !== 'string' || text.trim() === '') throw new Error(`Konzilo: texts.${locale}.search.${name} must be a text`);
    }
    const areas = {};
    for (const [area, { called }] of Object.entries(AREAS)) {
      const own = texts[area] ?? {};
      if (!object(own)) throw new Error(`Konzilo: texts.${locale}.${area} must be an object of ${called} by name`);
      for (const [name, text] of Object.entries(own)) {
        if (!namesIn(area).includes(name)) throw new Error(`Konzilo: texts.${locale}.${area}.${name} is not one of ${called}, which are ${namesIn(area).join(', ')}`);
        if (typeof text !== 'string' || text.trim() === '') throw new Error(`Konzilo: texts.${locale}.${area}.${name} must be a text`);
      }
      areas[area] = { ...own };
    }
    checked[locale] = { ...texts, forms, search: { ...search }, ...areas };
  }
  return checked;
}

// A check's error, with the name it says the texts by replaced.
function rename(check, from, to) {
  try {
    return check();
  } catch (error) {
    throw new Error(error.message.replaceAll(from, to));
  }
}

// The texts of each of the site's `languages` (the site description's, as
// checked), by locale, '' for a site that declares none: `given`, the
// site's per language, as givenTexts() checked them, over `main`, the
// site's in its main language, { emptyList, forms }, over the core's in
// each language. Returns { texts, warnings }: the texts, each language's
// { languageSwitcher, emptyList, readMore, forms, search, notFound, frame },
// and a warning
// for each language the core has no catalogue for, naming the texts the
// site has not given in it.
export function siteTexts(languages, given = {}, main = {}) {
  const locales = languages.length === 0 ? [null] : languages.map((language) => language.locale);
  const texts = {};
  const warnings = [];
  for (const locale of locales) {
    const own = (locale !== null && given[locale]) || {};
    const mains = locale === locales[0] ? main : {};
    texts[locale ?? ''] = {
      languageSwitcher: own.languageSwitcher ?? text(catalogueFor(locale), 'site.languageSwitcher'),
      emptyList: own.emptyList ?? mains.emptyList ?? text(catalogueFor(locale), 'site.emptyList'),
      readMore: own.readMore ?? text(catalogueFor(locale), 'site.readMore'),
      forms: formTexts(locale, { ...mains.forms, ...own.forms }),
      search: searchTexts(locale, own.search),
      ...Object.fromEntries(Object.entries(AREAS).map(([area, { prefix }]) => [area, { ...textsOf(locale, prefix), ...own[area] }])),
    };
    if (hasCatalogue(locale)) continue;
    const missing = [
      ...TEXT_NAMES.filter((name) => own[name] === undefined && mains[name] === undefined),
      ...FORM_TEXT_NAMES.filter((key) => own.forms?.[key] === undefined && mains.forms?.[key] === undefined).map((key) => `forms.${key}`),
      ...SEARCH_TEXT_NAMES.filter((name) => own.search?.[name] === undefined).map((name) => `search.${name}`),
      ...Object.keys(AREAS).flatMap((area) => namesIn(area).filter((name) => own[area]?.[name] === undefined).map((name) => `${area}.${name}`)),
    ];
    const these = missing.length === 0 ? '' : `, and these the site may give in konzilo({ texts: { ${locale}: { … } } }) in astro.config.mjs: ${missing.join(', ')}`;
    warnings.push(`Konzilo writes no texts of its own in ${locale}, so the pages in ${locale} show its own words in English: the consent dialog's and the cookie declaration's labels, an embed's sentence that the site's script has not run${these}`);
  }
  return { texts, warnings };
}

// The module the core's components take each language's texts from, as
// siteTexts() gives them: textsIn(locale), a page's language's
// locale, null for a site that declares none, gives that language's, or the
// main language's for a locale the site does not declare.
export const TEXTS_MODULE = 'virtual:konzilo/texts';

export function textsModule(texts) {
  const code = [
    `const texts = ${JSON.stringify(texts)};`,
    'export function textsIn(locale) {',
    '  return texts[locale ?? \'\'] ?? Object.values(texts)[0];',
    '}',
    '',
  ].join('\n');
  return {
    name: 'konzilo-texts',
    resolveId: (id) => (id === TEXTS_MODULE ? `\0${TEXTS_MODULE}` : undefined),
    load: (id) => (id === `\0${TEXTS_MODULE}` ? code : undefined),
  };
}
