// The interface language in the editor's browser (ADR 0066): the editor's own choice,
// made through Sveltia's own language preference, else the site's, which the
// configuration Konzilo generates names. Sveltia keeps its preferences in the browser,
// `auto` until a person chooses a language, and then takes the browser's language.
// Konzilo takes `auto` as no choice, the site's language, and sets the site's as
// Sveltia's preference, before Sveltia reads it as it loads, where the browser's
// language would not give it, with a mark of its own beside it, so that what it set is
// told apart from a choice. Where the browser's language would give it, Sveltia is left
// to take it by itself: a language set, as Sveltia starts, has it open a store of its
// own in the repository's database, which in WebKit can leave its own image previews
// unreadable.

import { catalogueFor, interfaceLanguageTag } from '../catalogues.js';

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

const subtagOf = (tag) => (typeof tag === 'string' ? tag.split(/[_-]/)[0].toLowerCase() : null);

// The interface language an editor has chosen, the catalogue of the language
// Sveltia's preference names, else British English; null where they have chosen none.
export function chosenLanguage(storage = globalThis.localStorage) {
  const { locale } = held(storage);
  if (typeof locale !== 'string' || locale === AUTOMATIC || locale === storage.getItem(SET)) return null;
  return catalogueFor(locale);
}

// Sveltia set to the site's interface language, `language`, for an editor who has chosen
// none, keeping its other preferences; or left to take the browser's, the first of
// `browser`, the browser's languages, where that is the site's.
export function followSite(language, storage = globalThis.localStorage, browser = globalThis.navigator?.languages ?? []) {
  const locale = subtagOf(browser[0]) === language ? AUTOMATIC : interfaceLanguageTag(language);
  storage.setItem(PREFERENCES, JSON.stringify({ ...held(storage), locale }));
  storage.setItem(SET, locale);
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
