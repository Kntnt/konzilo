// The words of the consent's markup that the core writes itself, and the
// facts of a service in words. They are the core's catalogues' (ADR 0066),
// `src/catalogues/<language>.json`, which the caller hands in by language as
// `catalogues`, so that this folder reads them without importing them: the
// texts named `site.consent.…`, and the defaults of the texts of the right
// to object, `site.settings.consent.objection…`, for a caller whose consent
// texts are older than they are. The consent texts an Admin may change are
// not here: a caller hands them in (markup.js).
//
// This folder, src/consent/, imports nothing outside itself, so that a site
// that Konzilo does not build can copy it from a commit, with the
// catalogues, and call it.

// The language every text of the catalogues is first written in, British
// English, which a page in a language without a catalogue takes.
const SOURCE = 'en';

// The texts of the right to object, by their names in the registry's texts.
const OBJECTION = ['text', 'objected', 'title', 'appeal', 'confirm', 'cancel'];

// The cookie declaration's columns of what a service stores, in order.
const COLUMNS = ['name', 'kind', 'lifetime', 'party', 'domain'];

// A lifetime's unit, in ISO 8601 (an M after T is minutes), as Intl names it.
const UNITS = { Y: 'year', M: 'month', W: 'week', D: 'day', H: 'hour', TM: 'minute', S: 'second' };

// The locale the core formats dates, times, numbers and countries in, by
// the language of its words: British English and Swedish as Sweden writes
// it, so that the words and the formats agree, and the language itself for
// any other catalogue. A caller may give its own, by the same keys
// (formatLocale()).
export const LOCALES = Object.freeze({ en: 'en-GB', sv: 'sv-SE' });

// The core's catalogues, by language, as the caller hands them in, or an
// error that says what the markup needs.
function cataloguesOf(catalogues) {
  if (catalogues === null || typeof catalogues !== 'object' || typeof catalogues[SOURCE] !== 'object') {
    throw new Error('the consent\'s markup needs the core\'s catalogues, `catalogues`, by language, as src/catalogues/<language>.json holds them, British English\'s, en, among them');
  }
  return catalogues;
}

// The language of the core's words for a page in `language`, a language
// tag such as sv-SE: its language subtag's where `catalogues` has a
// catalogue for it, else British English.
export function wordsLanguage(language, catalogues) {
  const subtag = String(language ?? '').split(/[-_]/)[0].toLowerCase();
  return Object.hasOwn(cataloguesOf(catalogues), subtag) ? subtag : SOURCE;
}

// The texts of a catalogue directly below a name, such as `site.consent.`,
// by the rest of their names.
function below(catalogue, prefix) {
  return Object.fromEntries(Object.entries(catalogue)
    .filter(([name]) => name.startsWith(prefix) && !name.slice(prefix.length).includes('.'))
    .map(([name, value]) => [name.slice(prefix.length), value]));
}

// The core's words for a page in `language`, a language tag, from
// `catalogues`: its language's catalogue, each text it lacks British
// English's. `{…}` stands for what is put in its place. Among them,
// `serviceCount` counts a category's services, `one` and `other`;
// `placeholder` is a placeholder's sentence on what its service may store
// and where its data goes, with no provider, `alone`, with one,
// `provided`, and with one whose data may leave the EU and EEA,
// `transferred`; `on`, `thisHost`, `shared` and `unnamedDomain` say where
// an item is stored; and `objectionLinks` are the words of the link for a
// text of the right to object that marks none.
export function wordsFor(language, catalogues) {
  const given = cataloguesOf(catalogues);
  const catalogue = { ...given[SOURCE], ...given[wordsLanguage(language, given)] };
  const at = (prefix) => below(catalogue, `site.consent.${prefix}`);
  const capital = (name) => `${name[0].toUpperCase()}${name.slice(1)}`;
  return {
    ...at(''),
    serviceCount: at('serviceCount.'),
    kinds: at('kind.'),
    placeholder: at('placeholder.'),
    objection: Object.fromEntries(OBJECTION.map((name) => [name, catalogue[`site.settings.consent.objection${capital(name)}`]])),
    objectionLinks: at('objectionLink.'),
    declaration: {
      ...at('declaration.'),
      safeguards: at('declaration.safeguard.'),
      columns: COLUMNS.map((column) => catalogue[`site.consent.declaration.column.${column}`]),
      party: at('declaration.party.'),
      departure: at('declaration.departure.'),
      privacySignals: at('declaration.privacySignals.'),
    },
  };
}

// The one locale a page in `language` formats dates, times, numbers and
// countries in, the build and the browser alike: `locales`' own for the
// language of its words, by catalogue, else LOCALES', else that language.
export function formatLocale(language, catalogues, locales = {}) {
  const words = wordsLanguage(language, catalogues);
  return locales?.[words] ?? LOCALES[words] ?? words;
}

// Text with each `{name}` in `words` put in its place from `values`.
export function fill(words, values) {
  return Object.entries(values).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, value), words);
}

// The words the core writes itself of a service's facts, in the language
// of a page in `language`, a language tag, from `catalogues`, formatted in
// its locale (formatLocale(), with `locales`): `country(code)`, a country's
// name by its ISO 3166-1 alpha-2 code; `kind(kind)`, a kind of storage; and
// `lifetime(value)`, how long an item is kept, from the registry's ISO 8601
// duration, `session` or `persistent`.
export function factWords(language, catalogues, locales) {
  const words = wordsFor(language, catalogues);
  const locale = formatLocale(language, catalogues, locales);
  const regions = new Intl.DisplayNames([locale], { type: 'region' });
  return {
    country: (code) => regions.of(code),
    kind: (kind) => words.kinds[kind],
    lifetime: (value) => {
      if (value === 'session' || value === 'persistent') return words[value];
      const [, time, number, unit] = /^P(T?)(\d+)([YMWDHS])$/.exec(value);
      return new Intl.NumberFormat(locale, { style: 'unit', unit: UNITS[unit === 'M' && time ? 'TM' : unit], unitDisplay: 'long' }).format(Number(number));
    },
  };
}
