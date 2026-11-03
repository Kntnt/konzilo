// The core's own texts in the site's language: what visitors read
// that the core itself writes, such as the consent texts' defaults, comes in
// English and Swedish, and a site takes the one in its language. A site in
// English, or one that declares no language, takes English; one in Swedish
// takes Swedish. On a site in several languages each page takes
// the texts of its own language, and a language the core writes no texts in
// takes English, which the build warns of.
//
// A text in each language is an object of the text by language,
// { "en": "…", "sv": "…" }, in the core's data (a settings group's default,
// a service's facts) and in its code alike; inLanguage() picks the site's.

// The languages the core writes its own texts in.
export const TEXT_LANGUAGES = Object.freeze(['en', 'sv']);

// The language of the core's texts for a site's language, its locale (null for a site that declares none): Swedish for a Swedish locale,
// and English for any other.
export function textLanguage(locale) {
  return subtagOf(locale) === 'sv' ? 'sv' : 'en';
}

// Whether the core writes its own texts in a language, its locale:
// in English and Swedish, and English for a site that declares none.
export function hasCoreTexts(locale) {
  return locale === null || TEXT_LANGUAGES.includes(subtagOf(locale));
}

function subtagOf(locale) {
  return locale === null || locale === undefined ? null : locale.split('_')[0];
}

// Whether a value is a text in each language: an object of exactly the
// core's languages, each a string.
export function isTextInEachLanguage(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === TEXT_LANGUAGES.length
    && TEXT_LANGUAGES.every((language) => typeof value[language] === 'string');
}

// A text in the site's language: a text in each language gives the site's;
// any other value is the same in every language and is given as it is.
export function inLanguage(text, locale) {
  return isTextInEachLanguage(text) ? text[textLanguage(locale)] : text;
}
