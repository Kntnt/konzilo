// A post's meta line (ADR 0062): the line between its standfirst and its body that shows
// its byline, its date and its category, written by its type's format, which an Admin
// sets per type and language in the settings group `metaLine`. A format is text with
// variables in single braces, `Published on {date} in {category} by {authors}`.
//
// A variable without a value, such as the category of an article that has none, drops out
// with the words before it, back to the variable before it or to the last punctuation mark
// between them, so that `Published on {date} in {category} by {authors}` reads `Published
// on 1 October 2026 by Ines Holm` without a category. What punctuation that leaves at the
// line's start goes, and so does a separator left at its end, a mark doubled where the
// words between dropped, and a pair of brackets left empty; spaces collapse to one, and a
// line whose first words dropped begins with a capital letter: `Av {authors}, publicerad
// den {date}` reads `Publicerad den 1 oktober 2026` without authors.
//
// This module imports only the built-in types, so that the settings' check, the intake and
// the build read it alike.

import { isArticle } from './format/built-in-types.js';

// Anything between `{` and `}` is a variable, by its name without the spaces at its ends.
const VARIABLE = /\{([^{}]*)\}/g;

// The variables a meta line may name, each with what a type must have for it: `authors`
// and `category` an article's, `date` and `modified` a type's whose posts have them.
const VARIABLES = Object.freeze({
  authors: isArticle,
  date: (type) => hasField(type, 'date'),
  modified: (type) => hasField(type, 'modified'),
  category: isArticle,
});

const hasField = (type, kind) => (type?.fields ?? []).some((field) => field.kind === kind);

// The variables a type's meta line may name, as the site description reads the type.
export function metaLineVariables(type) {
  return Object.keys(VARIABLES).filter((name) => VARIABLES[name](type));
}

// The variables a format names, each once, in the order it first names them.
export function variablesInFormat(format) {
  return [...new Set(tokensOf(format).filter((token) => token.variable !== undefined).map((token) => token.variable))];
}

// Why a format cannot be published with the variables its type knows, `variables`: one
// reason for each variable it does not know, by its name in the core's catalogues
// (refusals.js).
export function metaLineProblems(format, variables) {
  const known = new Set(variables);
  return variablesInFormat(format)
    .filter((variable) => !known.has(variable))
    .map((variable) => ({ name: 'refusal.meta-line-variable', values: { variable } }));
}

// A punctuation mark, which ends the words that belong to the variable after it: any
// punctuation, and a vertical bar, but a mark inside a word, as in `e-post` or `Kntnt's`.
const MARK = /[\p{P}|]/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

// A mark that only separates what is on either side of it, which goes where nothing
// follows it: a comma, a semicolon, a colon, a dash, a middle dot, a bullet, a bar or a
// slash.
const SEPARATOR = /[,;:\-‐–—·•|/、，；：]/u;

// A bracket or a quotation mark, which opens or closes a pair rather than separating.
const PAIRED = /[\p{Ps}\p{Pe}\p{Pi}\p{Pf}]/u;
const OPENING = /[\p{Ps}\p{Pi}]/u;

// Text of nothing but punctuation and spaces.
const ONLY_MARKS = /^[\s\p{P}|]*$/u;

// A meta line as a template draws it: its pieces in order, each { text, variable, url,
// datetime }, `variable` null for the format's own words. `values` holds each variable's
// pieces by its name, each { text, url, datetime }; a variable without pieces has no
// value. `language`: the page's language tag, in which a line whose first words dropped
// takes its capital letter.
export function writeMetaLine(format, values, language) {
  const entries = [];
  for (const token of tokensOf(format)) {
    if (token.variable === undefined) {
      entries.push({ text: token.text });
      continue;
    }
    const pieces = values[token.variable] ?? [];
    if (pieces.length > 0) {
      entries.push({ pieces: pieces.map((value) => piece(value.text, token.variable, value)) });
      continue;
    }
    const before = entries.at(-1);
    if (before?.text !== undefined) before.text = before.text.slice(0, lastMarkEnd(before.text));
    entries.push({ dropped: true });
  }
  const capital = tidy(entries);
  return linePieces(entries, capital, language);
}

const piece = (text, variable = null, { url = null, datetime = null } = {}) => ({ text, variable, url, datetime });

// A format's words and variables in order: { text } or { variable }.
function tokensOf(format) {
  const given = String(format ?? '');
  const tokens = [];
  let at = 0;
  for (const match of given.matchAll(VARIABLE)) {
    if (match.index > at) tokens.push({ text: given.slice(at, match.index) });
    tokens.push({ variable: match[1].trim() });
    at = match.index + match[0].length;
  }
  if (at < given.length) tokens.push({ text: given.slice(at) });
  return tokens;
}

// Where the words before a variable begin in the text before it: right after its last
// punctuation mark, or at its start where it has none.
function lastMarkEnd(text) {
  for (let at = text.length - 1; at >= 0; at -= 1) {
    if (isMark(text, at)) return at + 1;
  }
  return 0;
}

function isMark(text, at) {
  if (!MARK.test(text[at])) return false;
  return !(LETTER_OR_DIGIT.test(text[at - 1] ?? '') && LETTER_OR_DIGIT.test(text[at + 1] ?? ''));
}

// What punctuation each dropped variable leaves, tidied in place, from the first to the
// last; whether the line's first words dropped.
function tidy(entries) {
  let capital = false;
  for (let at = 0; at < entries.length; at += 1) {
    if (!entries[at].dropped) continue;
    const before = entries[at - 1]?.text === undefined ? null : entries[at - 1];
    const after = entries[at + 1]?.text === undefined ? null : entries[at + 1];
    if (before && after) emptyPair(before, after);
    const marksAlone = (entry) => entry.dropped || (entry.text !== undefined && ONLY_MARKS.test(entry.text));
    if (entries.slice(0, at).every(marksAlone)) {
      for (const entry of entries.slice(0, at)) if (entry.text !== undefined) entry.text = '';
      if (after) after.text = after.text.replace(/^(?:\s|(?![\p{Ps}\p{Pi}])[\p{P}|])+/u, '');
      capital = true;
    } else if (entries.slice(at + 1).every(marksAlone)) {
      if (before) before.text = withoutTrailing(before.text);
    } else if (before && after) {
      doubled(before, after);
    }
  }
  return capital;
}

// A pair of brackets or quotation marks left with nothing between them goes, with the
// space before it.
function emptyPair(before, after) {
  const open = before.text.trimEnd();
  const close = after.text.trimStart();
  if (open === '' || close === '' || !OPENING.test(open.at(-1)) || !PAIRED.test(close[0]) || OPENING.test(close[0])) return;
  before.text = open.slice(0, -1).trimEnd();
  after.text = close.slice(1);
}

// Spaces and separators at the end of a text.
function withoutTrailing(text) {
  let end = text.length;
  while (end > 0 && (/\s/u.test(text[end - 1]) || SEPARATOR.test(text[end - 1]))) end -= 1;
  return text.slice(0, end);
}

// Two marks that meet where the words between them dropped: the separator of the two goes,
// so that a sentence's full stop stays, else the first.
function doubled(before, after) {
  const left = before.text.trimEnd();
  const right = after.text.trimStart();
  const last = left.at(-1) ?? '';
  const first = right[0] ?? '';
  const mark = (character) => MARK.test(character) && !PAIRED.test(character);
  if (!mark(last) || !mark(first)) return;
  if (!SEPARATOR.test(last) && SEPARATOR.test(first)) after.text = right.slice(1);
  else before.text = left.slice(0, -1);
}

// The line's pieces: the format's words with their spaces collapsed to one, without
// spaces at the line's ends, and each value's pieces.
function linePieces(entries, capital, language) {
  const merged = [];
  for (const entry of entries) {
    if (entry.dropped) continue;
    if (entry.text === undefined) merged.push(...entry.pieces);
    else if (merged.at(-1)?.variable === null) merged.at(-1).text += entry.text;
    else merged.push(piece(entry.text));
  }
  for (const one of merged) if (one.variable === null) one.text = one.text.replace(/\s+/gu, ' ');
  if (merged[0]?.variable === null) merged[0].text = merged[0].text.trimStart();
  if (merged.at(-1)?.variable === null) merged.at(-1).text = merged.at(-1).text.trimEnd();
  const line = merged.filter((one) => one.text !== '');
  if (capital && line[0]?.variable === null) line[0].text = line[0].text.replace(/\p{L}/u, (letter) => letter.toLocaleUpperCase(language));
  return line;
}
