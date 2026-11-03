// The texts a page shows of the core's own that a site may give its own of,
// in the page's language: the language switcher's label, the text
// of a post list that matches nothing, a form's texts and search's. The core
// gives each in English and Swedish (texts.js); a site gives its own per
// language in `konzilo({ texts })`, by locale:
//
//   texts: { de_DE: { languageSwitcher: 'Sprachen', emptyList: 'Noch nichts.', forms: { send: 'Senden' }, search: { label: 'Suche' } } }
//
// and its main language's, as before languages, in `konzilo({ emptyList,
// formTexts })`. A page takes the site's text in its language, else the
// core's; on a language the core writes no texts in, the core's English
// ones, which the build warns of, naming each text the site has not given.
// The core's other words, such as the consent dialog's labels and an
// embed's sentence that the site's script has not run, are the core's alone
// and come in English there too.
//
// The integration checks the texts as konzilo() is called, and hands each
// language's to the site's pages through its module `virtual:konzilo/texts`
// (textsModule()), which the core's components read with textsIn(locale).

import { LOCALE } from '../site-description.js';
import { hasCoreTexts, inLanguage, textLanguage } from '../texts.js';
import { FORM_TEXTS, siteFormTexts } from './forms.js';
import { SEARCH_TEXTS } from './search.js';

// The language switcher's label, which names the list of the page's
// languages for a screen reader.
export const LANGUAGE_SWITCHER = Object.freeze({ en: 'Languages', sv: 'Språk' });

// What a post list that matches nothing says, where the list gives no text
// of its own.
export const EMPTY_LIST = Object.freeze({ en: 'Nothing to show yet.', sv: 'Inget att visa ännu.' });

// The names of the texts a site may give per language.
const NAMES = ['languageSwitcher', 'emptyList', 'forms', 'search'];

// The texts a site gives in `konzilo({ texts })`, checked as konzilo() is
// called: an object of each language's, by its locale, each an
// object of texts by the names above, `forms` and `search` objects of their
// texts by the keys the core gives them. Throws, naming what is wrong.
export function givenTexts(given = {}) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (!object(given)) throw new Error('Konzilo: texts must be an object of each language\'s texts, by its locale, such as { de_DE: { languageSwitcher: \'Sprachen\' } }');
  const checked = {};
  for (const [locale, texts] of Object.entries(given)) {
    if (!LOCALE.test(locale)) throw new Error(`Konzilo: texts.${locale} is not a locale, such as de_DE`);
    if (!object(texts)) throw new Error(`Konzilo: texts.${locale} must be an object of the texts in ${locale}, by name`);
    for (const [name, text] of Object.entries(texts)) {
      if (!NAMES.includes(name)) throw new Error(`Konzilo: texts.${locale}.${name} is not one of the texts a site gives, which are ${NAMES.join(', ')}`);
      if (['languageSwitcher', 'emptyList'].includes(name) && (typeof text !== 'string' || text.trim() === '')) throw new Error(`Konzilo: texts.${locale}.${name} must be a text`);
    }
    const forms = rename(() => siteFormTexts(texts.forms ?? {}), 'formTexts', `texts.${locale}.forms`);
    const search = texts.search ?? {};
    if (!object(search)) throw new Error(`Konzilo: texts.${locale}.search must be an object of search's texts by name`);
    for (const [name, text] of Object.entries(search)) {
      if (!Object.hasOwn(SEARCH_TEXTS, name)) throw new Error(`Konzilo: texts.${locale}.search.${name} is not one of search's texts, which are ${Object.keys(SEARCH_TEXTS).join(', ')}`);
      if (typeof text !== 'string' || text.trim() === '') throw new Error(`Konzilo: texts.${locale}.search.${name} must be a text`);
    }
    checked[locale] = { ...texts, forms, search: { ...search } };
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
// { languageSwitcher, emptyList, forms, search }, and a warning for each
// language the core writes no texts in, naming the texts the site has not
// given in it.
export function siteTexts(languages, given = {}, main = {}) {
  const locales = languages.length === 0 ? [null] : languages.map((language) => language.locale);
  const texts = {};
  const warnings = [];
  for (const locale of locales) {
    const own = (locale !== null && given[locale]) || {};
    const mains = locale === locales[0] ? main : {};
    texts[locale ?? ''] = {
      languageSwitcher: own.languageSwitcher ?? inLanguage(LANGUAGE_SWITCHER, locale),
      emptyList: own.emptyList ?? mains.emptyList ?? inLanguage(EMPTY_LIST, locale),
      forms: { ...FORM_TEXTS[textLanguage(locale)], ...mains.forms, ...own.forms },
      search: Object.fromEntries(Object.entries(SEARCH_TEXTS).map(([name, text]) => [name, own.search?.[name] ?? inLanguage(text, locale)])),
    };
    if (hasCoreTexts(locale)) continue;
    const missing = [
      ...['languageSwitcher', 'emptyList'].filter((name) => own[name] === undefined && mains[name] === undefined),
      ...Object.keys(FORM_TEXTS.en).filter((key) => own.forms?.[key] === undefined && mains.forms?.[key] === undefined).map((key) => `forms.${key}`),
      ...Object.keys(SEARCH_TEXTS).filter((name) => own.search?.[name] === undefined).map((name) => `search.${name}`),
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
