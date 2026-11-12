// Small checks the npm package's readers share: the site description's
// checker (site-description.js), the settings groups' (settings-groups.js)
// and the other readers. Each checker names a problem
// by its path in what it reads and gathers every problem at once.

import { INTERFACE_LANGUAGES, interfaceLanguageTag, SOURCE_LANGUAGE } from './catalogues.js';

// Whether a value is a plain object: not null, not an array.
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// A problem for each key of `object` that `allowed` does not hold, named by
// its path and as no part of `whole`.
export function onlyKeys(object, allowed, path, problems, whole) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) problems.push(`${path ? `${path}.` : ''}${key}: is not part of ${whole}`);
  }
}

// A value that must be a non-empty string, with a problem if it is not.
export function text(value, path, problems) {
  if (typeof value !== 'string' || value.trim() === '') problems.push(`${path}: must be a non-empty string`);
  return value;
}

// Whether `url` is an address a link of a site's own may lead to, a menu's entry's or one in a
// form field's label: a path of the site's, from its root, or an address that starts with
// https://, http://, mailto: or tel:, and no white space in it.
export function isLinkAddress(url) {
  return typeof url === 'string' && (/^(?:https?:\/\/|mailto:|tel:)/.test(url) || (url.startsWith('/') && !url.startsWith('//'))) && !/\s/.test(url);
}

// The languages Konzilo's interface comes in, each by its catalogue's name and
// what it is in British English: `en (British English) and sv (Swedish)`.
export function interfaceLanguagesNamed() {
  const names = new Intl.DisplayNames(['en-GB'], { type: 'language' });
  const each = INTERFACE_LANGUAGES.map((language) => `${language} (${names.of(interfaceLanguageTag(language))})`);
  return each.length === 1 ? each[0] : `${each.slice(0, -1).join(', ')} and ${each.at(-1)}`;
}

// A label of a site's own, which an editor reads: a non-empty string for every
// interface language, or an object of one by interface language, British
// English among them, with a problem if it is neither.
export function label(value, path, problems) {
  if (typeof value === 'string') return text(value, path, problems);
  if (!isObject(value)) {
    problems.push(`${path}: must be a non-empty string, or one by interface language, such as { "en": "Article", "sv": "Artikel" }`);
    return value;
  }
  if (!Object.hasOwn(value, SOURCE_LANGUAGE)) problems.push(`${path}: gives no ${SOURCE_LANGUAGE}, the British English a label by language needs`);
  for (const [language, one] of Object.entries(value)) {
    if (!INTERFACE_LANGUAGES.includes(language)) problems.push(`${path}.${language}: ${language} is not a language Konzilo's interface comes in, which are ${interfaceLanguagesNamed()}`);
    else text(one, `${path}.${language}`, problems);
  }
  return value;
}

// A value frozen through and through, and returned.
export function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const inner of Object.values(value)) freeze(inner);
    Object.freeze(value);
  }
  return value;
}
