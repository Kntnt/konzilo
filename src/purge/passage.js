// A passage purged from every old revision (ADR 0078), such as a person's name and telephone
// number: found in the text of every source file as written, in each revision, and taken out of
// every old one, and out of every content file and every save's message, in both repositories'
// histories, once no current source file holds it.
//
// A passage is found case-insensitively, any run of whitespace in it matching any run of
// whitespace, a line break as JSON writes it or Markdown's hard one among them, and any of its
// characters after the escape that Markdown, YAML or JSON may write before it: a backslash before
// ASCII punctuation, and the empty comment Markdown's fallback splits an address with
// (content-format.md, Escapes and fallbacks). What is found goes whole, escapes and all, with
// nothing in its place.

// The shortest and the longest passage, in characters.
export const PASSAGE_LEAST = 3;
export const PASSAGE_MOST = 500;
// How much of the text on each side of a place it is found is shown, in characters.
const AROUND = 60;

// A passage as given, trimmed, each run of whitespace in it one space, or null where it is none
// or too short or too long.
export function passageOf(given) {
  if (typeof given !== 'string') return null;
  const passage = given.replace(/\s+/gu, ' ').trim();
  const length = [...passage].length;
  return length >= PASSAGE_LEAST && length <= PASSAGE_MOST ? passage : null;
}

const SYNTAX = /[\\^$.*+?()[\]{}|/]/u;
const PUNCTUATION = /[!-/:-@[-`{-~]/u;
const WHITESPACE = String.raw`(?:\s|\\[nrt]|\\(?=\r?\n))+`;
const COMMENT = '(?:<!-- -->)?';

// The pattern that finds a passage.
function patternOf(passage) {
  const parts = [];
  for (const [at, character] of [...passage].entries()) {
    if (/\s/u.test(character)) {
      if (parts.at(-1) !== WHITESPACE) parts.push(WHITESPACE);
      continue;
    }
    const escaped = SYNTAX.test(character) ? `\\${character}` : character;
    parts.push(`${at > 0 ? COMMENT : ''}${PUNCTUATION.test(character) ? String.raw`\\?` : ''}${escaped}`);
  }
  return parts.join('');
}

// What a passage is found by: holds(text), whether the text holds it; without(text), the text with
// every place it is found taken out, and again where that joins it anew; and around(text), each
// place it is found, { before, match, after }, with the text before and after it up to the places
// next to it, its whitespace as one space.
export function passageMatcher(passage) {
  const source = patternOf(passageOf(passage) ?? passage);
  const pattern = () => new RegExp(source, 'giu');
  const holds = (text) => pattern().test(text);
  const shown = (text) => text.replace(/\s+/gu, ' ');
  return {
    holds,
    without(text) {
      let left = text;
      for (let round = 0; round < 100 && holds(left); round += 1) left = left.replace(pattern(), '');
      return left;
    },
    around(text) {
      const places = [...text.matchAll(pattern())].map((found) => ({ start: found.index, end: found.index + found[0].length }));
      return places.map(({ start, end }, at) => {
        const from = Math.max(at === 0 ? 0 : places[at - 1].end, start - AROUND);
        const to = Math.min(at === places.length - 1 ? text.length : places[at + 1].start, end + AROUND);
        return { before: shown(text.slice(from, start)), match: shown(text.slice(start, end)), after: shown(text.slice(end, to)) };
      });
    },
  };
}
