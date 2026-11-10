// What the editor's own code says, the body field's, the image field's, the structure field's,
// the preview's, the publish status's and the article parts' fields', in the interface language
// (ADR 0066): each text by its whole name in the catalogues, such as `body.loading`, so that
// tests/catalogues.test.js can hold the names asked for here against the source. The editor
// names the language once it has fetched its configuration, before anything is drawn; until
// then, and in a test, it is British English. A refusal or a warning is shown by its own name
// and values, in the same language (cms/refusals.js).

import { interfaceLanguageTag, SOURCE_LANGUAGE, text } from '../../catalogues.js';

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

const ELEMENTS = {
  paragraph: 'body.element.paragraph',
  heading: 'body.element.heading',
  list: 'body.element.list',
  quote: 'body.element.quote',
  code: 'body.element.code',
  table: 'body.element.table',
  footnotes: 'body.element.footnotes',
  embed: 'body.element.embed',
  image: 'body.element.image',
  gallery: 'body.element.gallery',
  'post-list': 'body.element.post-list',
  form: 'body.element.form',
};

// An element of the rule data by name, as it stands in a sentence: "a paragraph".
export const elementName = (element) => say(Object.hasOwn(ELEMENTS, element) ? ELEMENTS[element] : ELEMENTS.paragraph);
