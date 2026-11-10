// The core's texts that its editors read, in catalogues (ADR 0066): one per language,
// `catalogues/<language>.json`, each text by a stable name, such as `form.title`, with
// named placeholders, `{to}`. British English, `en`, is the source, and each other
// catalogue a translation of it that holds exactly its names (tests/catalogues.test.js).
// A language is added by translating en.json into a file of its own and naming it below.
//
// The editor's interface takes one of these languages, its interface language, chosen
// apart from the language of the site's content (cms/interface-language.js).
//
// This module imports nothing but its catalogues, so that the editor's code in the
// browser reads it as the intake and the build do.

import en from './catalogues/en.json' with { type: 'json' };
import sv from './catalogues/sv.json' with { type: 'json' };

// The language every text is first written in, and the one a language without a
// catalogue takes.
export const SOURCE_LANGUAGE = 'en';

export const CATALOGUES = Object.freeze({ en, sv });

// The languages the core's interface comes in, by their catalogues' names.
export const INTERFACE_LANGUAGES = Object.freeze(Object.keys(CATALOGUES));

// The catalogue for a language, a locale or a language tag (`sv`, `sv_SE`, `sv-FI`),
// by its name: its language subtag's, else British English's.
export function catalogueFor(language) {
  const subtag = typeof language === 'string' ? language.split(/[_-]/)[0].toLowerCase() : null;
  return Object.hasOwn(CATALOGUES, subtag) ? subtag : SOURCE_LANGUAGE;
}

// The language tag of an interface language, as Sveltia and the browser take it:
// the source's is British English's, en-GB.
export function interfaceLanguageTag(language) {
  return language === SOURCE_LANGUAGE ? 'en-GB' : language;
}

// A text in a language, its placeholders filled from `values`: the language's own,
// else British English's. A name the source does not have is a fault in the core,
// so it throws.
export function text(language, name, values = {}) {
  const catalogue = Object.hasOwn(CATALOGUES, language) ? CATALOGUES[language] : CATALOGUES[SOURCE_LANGUAGE];
  const found = Object.hasOwn(catalogue, name) ? catalogue[name] : CATALOGUES[SOURCE_LANGUAGE][name];
  if (typeof found !== 'string') throw new Error(`the core's catalogues have no text ${name}`);
  return found.replace(/\{(\w+)\}/g, (_, placeholder) => String(values[placeholder] ?? ''));
}

// The texts of an area, such as `site.search.`, in a language, a locale or a language tag,
// each by its name after the area, as the catalogue writes it: the caller fills its
// placeholders. Its language's catalogue's (catalogueFor()), else British English's.
export function textsOf(language, area) {
  const catalogue = CATALOGUES[catalogueFor(language)];
  return Object.fromEntries(Object.keys(CATALOGUES[SOURCE_LANGUAGE])
    .filter((name) => name.startsWith(area))
    .map((name) => [name.slice(area.length), catalogue[name] ?? CATALOGUES[SOURCE_LANGUAGE][name]]));
}

// Whether a value of the core's data is a text of the catalogues by its name, `{ text }`,
// with `values` for its placeholders where the data fills them: a setting's default that
// visitors read, or a fact of a service.
export function isCatalogueText(value) {
  return value !== null && typeof value === 'object' && typeof value.text === 'string'
    && Object.keys(value).every((key) => key === 'text' || key === 'values');
}

// A value of the core's data in a language, a locale or a language tag: a text of the
// catalogues, `{ text, values }`, in its language's catalogue (catalogueFor()), its
// placeholders filled from `values` where it gives them and left as written where it does
// not; any other value as it is. A name the source does not have throws, as text() does.
export function inCatalogue(value, language) {
  if (!isCatalogueText(value)) return value;
  if (value.values) return text(catalogueFor(language), value.text, value.values);
  const found = CATALOGUES[catalogueFor(language)][value.text] ?? CATALOGUES[SOURCE_LANGUAGE][value.text];
  if (typeof found !== 'string') throw new Error(`the core's catalogues have no text ${value.text}`);
  return found;
}

// A site's own label, as its site description gives it, in a language, a locale or a
// language tag: one text for every language, or texts by interface language, British
// English among them, of which the language's, else British English.
export function labelIn(label, language) {
  if (label === null || typeof label !== 'object') return label;
  const subtag = typeof language === 'string' ? language.split(/[_-]/)[0].toLowerCase() : null;
  return Object.hasOwn(label, subtag) ? label[subtag] : label[SOURCE_LANGUAGE];
}
