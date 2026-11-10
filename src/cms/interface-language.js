// The interface language in the editor's browser (ADR 0066): the editor's own choice,
// made through Sveltia's own language preference, else the site's, which the
// configuration Konzilo generates names. Konzilo sets the site's as Sveltia's preference,
// before Sveltia reads it as it loads, so that Sveltia's own interface follows it too,
// with a mark of its own beside it, so that what it set is told apart from a choice.
//
// Sveltia keeps its preferences in the browser, `auto` until a person chooses a language,
// which it then takes as the browser's language. Konzilo takes `auto` as no choice, the
// site's language.

import { interfaceLanguageFor, interfaceLanguageTag } from '../catalogues.js';

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
  return interfaceLanguageFor(locale);
}

// Sveltia set to the site's interface language, `language`, for an editor who has chosen
// none, keeping its other preferences.
export function followSite(language, storage = globalThis.localStorage) {
  const tag = interfaceLanguageTag(language);
  storage.setItem(PREFERENCES, JSON.stringify({ ...held(storage), locale: tag }));
  storage.setItem(SET, tag);
}

// Whether the editor must load again for its own texts to follow a language chosen in
// Sveltia's preferences: when the choice, `chosen` as the editor was loaded with it, has
// changed to another language, or to Automatic, which a new load takes as the site's.
export function languageChanged(chosen, storage = globalThis.localStorage) {
  return held(storage).locale === AUTOMATIC || chosenLanguage(storage) !== chosen;
}
