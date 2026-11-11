// A refusal or a warning in a language (ADR 0066, ADR 0027). Each carries its reason by
// its name in the core's catalogues, `refusal.image-alt` or `warning.image-narrow`, and
// the values that fill it, and is shown by them in the language the reader takes: the
// editor in its interface language, the command line and the build log in British
// English. A reason the site gives in words of its own, such as its components' check,
// has no name, and is shown in those words.
//
// A value is given as it is, a text or a number; or as a text by name of its own,
// `{ name, values }`, in the same language; or as a label, one text or texts by language:
// `{ field }`, a field's, which names the field as the form shows it, and `{ label }`, a
// type's plural or a taxonomy's label, which describes and so starts with a small letter
// in the middle of a phrase, but in an abbreviation (ADR 0066); or as a moment,
// `{ moment }`, in the language's own form of a day and a time, in the time zone of
// whatever shows it; or as a list, `{ and: [...] }` or `{ or: [...] }`, of such values.
//
// This module imports nothing but the catalogues, so that the editor's code in the
// browser shows a refusal as the intake and the build write it.

import { interfaceLanguageTag, labelIn, labelInPhrase, SOURCE_LANGUAGE, text } from './catalogues.js';

// A moment, `1 January 2026 at 09:00 CET`, named with its time zone, since the command line
// is read on a server and the editor in a browser.
const MOMENT = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };

function valueIn(language, value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.name === 'string') return wordsIn(language, value);
  if (Object.hasOwn(value, 'field')) return labelIn(value.field, language);
  if (Object.hasOwn(value, 'label')) return labelInPhrase(value.label, language);
  if (Object.hasOwn(value, 'moment')) return new Date(value.moment).toLocaleString(interfaceLanguageTag(language), MOMENT);
  const joint = Object.hasOwn(value, 'and') ? 'and' : Object.hasOwn(value, 'or') ? 'or' : null;
  if (joint === null) return String(value);
  const items = value[joint].map((one) => String(valueIn(language, one)));
  if (items.length < 2) return items.join('');
  return text(language, `about.${joint}`, { items: items.slice(0, -1).join(', '), last: items.at(-1) });
}

// Words in a language: a text by name, `{ name, values }`, with its values filled in that
// language, or words given as they are. A name the catalogues lack is a fault in the
// core, so it throws.
export function wordsIn(language, words) {
  if (words === null || typeof words !== 'object') return words ?? '';
  const values = Object.fromEntries(Object.entries(words.values ?? {}).map(([key, value]) => [key, valueIn(language, value)]));
  return text(language, words.name, values);
}

// A refusal's or a warning's reason in a language: by its name and values, else its words.
export const reasonIn = (language, about) => (typeof about?.name === 'string' ? wordsIn(language, about) : about?.reason ?? '');

// What a refusal or a warning names within its post or file, in a language: the block, the
// field, the entry, the setting, and the line, each it has, `block 2.1 (list), line 9`. A field
// is named by its label, `{ name, label }`, as the form shows it.
export function placeIn(language, { block, field, entry, setting, line } = {}) {
  return [
    block ? text(language, 'about.block', { path: block.path, name: block.name }) : null,
    field ? text(language, 'about.field', { field: typeof field === 'object' ? labelIn(field.label ?? field.name, language) : field }) : null,
    entry ? text(language, 'about.entry', { entry }) : null,
    setting ? text(language, 'about.setting', { setting }) : null,
    line ? text(language, 'about.line', { line }) : null,
  ].filter(Boolean).join(', ');
}

// What a refusal or a warning is about, in a language: its post, by type, title and ID,
// or its file.
export function subjectIn(language, { post, file }) {
  return post ? text(language, 'about.post', { type: post.type, title: post.title, id: post.id }) : text(language, 'about.file', { file });
}

// The whole of a refusal or a warning in a language: what it is about, where, and why.
export function messageIn(language, about) {
  const place = placeIn(language, about);
  return `${subjectIn(language, about)}${place ? `, ${place}` : ''}: ${reasonIn(language, about)}`;
}

// Words in British English, as the command line and the build log write them.
export const british = (words) => wordsIn(SOURCE_LANGUAGE, words);
