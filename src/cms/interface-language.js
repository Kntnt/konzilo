// The interface language in the editor's browser (ADR 0066): the editor's own choice,
// made through Sveltia's own language preference, else the site's, which the
// configuration Konzilo generates names. Sveltia keeps its preferences in the browser,
// `auto` until a person chooses a language, and then takes the browser's language.
// Konzilo takes `auto` as no choice, the site's language, and sets the site's as
// Sveltia's preference where the browser's language would not give it, with a mark of
// its own beside it, so that what it set is told apart from a choice.
//
// Sveltia reads its preferences as it loads, which is before the configuration has said
// what the site's language is: startLanguage() sets it as the last load found it, and a
// load that finds it new to the browser, or changed, loads again (followSite()).
//
// Once loaded, the editor holds its interface language here, and everything the editor's
// own code says, the body field's, the image field's, the structure field's, the preview's,
// the publish status's, the article parts' fields' and the field groups', is in it (say()):
// each text by its whole name in the catalogues, such as `body.loading`, so that
// tests/catalogues.test.js can hold the names asked for against the source. The editor names
// the language once it has fetched its configuration, before anything is drawn; until then,
// and in a test, it is British English. A refusal or a warning is shown by its own name and
// values, in the same language (cms/refusals.js).

import { catalogueFor, interfaceLanguageTag, languageSubtag, SOURCE_LANGUAGE, text } from '../catalogues.js';

let language = SOURCE_LANGUAGE;

// The interface language the editor was loaded in, which every text takes from then on.
export function useInterfaceLanguage(next) {
  language = next;
}

export const say = (name, values = {}) => text(language, name, values);

// The interface language the editor was loaded in, by its catalogue's name.
export const interfaceLanguage = () => language;

// The interface language's tag, for what the browser writes in a language of its own, such as
// a moment.
export const languageTag = () => interfaceLanguageTag(language);

const PREFERENCES = 'sveltia-cms.prefs';
const SET = 'konzilo.interface-language';
const AUTOMATIC = 'auto';

const held = (storage) => {
  try {
    const preferences = JSON.parse(storage.getItem(PREFERENCES));
    return preferences !== null && typeof preferences === 'object' && !Array.isArray(preferences) ? preferences : {};
  } catch {
    return {};
  }
};


// The interface language an editor has chosen, the catalogue of the language
// Sveltia's preference names, else British English; null where they have chosen none.
export function chosenLanguage(storage = globalThis.localStorage) {
  const { locale } = held(storage);
  if (typeof locale !== 'string' || locale === AUTOMATIC || locale === storage.getItem(SET)) return null;
  return catalogueFor(locale);
}

// Sveltia's preference, before Sveltia loads, in the site's language as the last load
// found it, for an editor who has chosen none: after Automatic too.
export function startLanguage(storage = globalThis.localStorage) {
  const known = storage.getItem(SET);
  if (known === null || chosenLanguage(storage) !== null) return;
  try {
    storage.setItem(PREFERENCES, JSON.stringify({ ...held(storage), locale: known }));
  } catch {
    // Sveltia then takes the browser's language, and followSite() keeps the editor from loading again.
  }
}

// Sveltia set to the site's interface language, `language`, for an editor who has chosen
// none, keeping its other preferences; or left to take the browser's, the first of
// `browser`, the browser's languages, where that is the site's. Whether Sveltia has
// loaded in another language, so that the editor must load again: never where the
// browser keeps nothing, which would load it again and again.
export function followSite(language, storage = globalThis.localStorage, browser = globalThis.navigator?.languages ?? []) {
  const before = held(storage).locale ?? AUTOMATIC;
  const locale = languageSubtag(browser[0]) === language ? AUTOMATIC : interfaceLanguageTag(language);
  try {
    storage.setItem(PREFERENCES, JSON.stringify({ ...held(storage), locale }));
    storage.setItem(SET, locale);
  } catch {
    return false;
  }
  return before !== locale && held(storage).locale === locale;
}

// What the editor was loaded with: the editor's choice, `chosen`, and Sveltia's
// preference as it then stood.
export function loadedWith(chosen, storage = globalThis.localStorage) {
  return { chosen, locale: held(storage).locale };
}

// Whether the editor must load again for its own texts to follow a language chosen in
// Sveltia's preferences: when the preference has changed since the editor was loaded
// with `loaded` (loadedWith()), to a choice of another language, or to Automatic, which
// a new load takes as the site's.
export function languageChanged(loaded, storage = globalThis.localStorage) {
  const { locale } = held(storage);
  return locale !== loaded.locale && (locale === AUTOMATIC || chosenLanguage(storage) !== loaded.chosen);
}
