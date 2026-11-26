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

import { MEDIA_FOLDER } from '../format/masters.js';

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

const BRANCH = 'main';
const MEDIA = `${MEDIA_FOLDER}/`;
const LFS = 'version https://git-lfs.github.com/spec/';
// A search lists this many revisions of a file at most, this many files and this many saves whose
// message names the passage, and this many places in each.
const REVISIONS_SHOWN = 20;
const FILES_SHOWN = 100;
const MESSAGES_SHOWN = 20;
const PLACES_SHOWN = 3;
// Blobs are read this many at a time.
const BATCH = 500;

const decoder = new TextDecoder('utf-8', { fatal: true });

// A file's text, or null where it is no text a passage is looked for in: an image's original, which
// LFS holds, or anything that is not UTF-8 or holds a NUL.
export function textOf(bytes) {
  let text;
  try {
    text = decoder.decode(bytes);
  } catch {
    return null;
  }
  return text.includes('\0') || text.startsWith(LFS) ? null : text;
}

// Whether a path is one a passage is looked for in: any file but an image's, below `media/`.
export const searched = (path) => !path.startsWith(MEDIA);

// The bytes of each blob, read by `cat-file --batch` a share at a time.
export async function blobsOf(git, shas) {
  const found = new Map();
  for (let from = 0; from < shas.length; from += BATCH) {
    const out = await git(['cat-file', '--batch'], { input: `${shas.slice(from, from + BATCH).join('\n')}\n` });
    let at = 0;
    while (at < out.length) {
      const end = out.indexOf(10, at);
      const [sha, kind, size] = out.subarray(at, end).toString('utf8').split(' ');
      at = end + 1;
      if (kind === 'missing') continue;
      found.set(sha, out.subarray(at, at + Number(size)));
      at += Number(size) + 1;
    }
  }
  return found;
}

// Each version of a file the branch's commits wrote, newest commit first, { commit, moment, path,
// blob }, of each file a passage is looked for in; and the branch's head's files, path to blob.
async function versionsOn(git, branch) {
  const tokens = (await git(['-c', 'core.quotePath=false', 'log', '-z', '--raw', '--no-abbrev', '--no-renames', '--format=%x01%H %cI', branch])).toString('utf8').split('\0');
  const versions = [];
  let commit = null;
  let moment = null;
  for (let at = 0; at < tokens.length; at += 1) {
    const token = tokens[at].replace(/^\n/, '');
    if (token.startsWith('\x01')) {
      const [sha, date] = token.slice(1).split(' ');
      commit = sha;
      moment = new Date(date).toISOString();
    } else if (token.startsWith(':')) {
      const path = tokens[at + 1];
      at += 1;
      const blob = token.split(' ')[3];
      if (!/^0+$/.test(blob) && searched(path)) versions.push({ commit, moment, path, blob });
    }
  }
  const head = new Map();
  for (const entry of (await git(['-c', 'core.quotePath=false', 'ls-tree', '-r', '-z', branch])).toString('utf8').split('\0').filter(Boolean)) {
    const [about, path] = entry.split('\t');
    const [, kind, blob] = about.split(' ');
    if (kind === 'blob' && searched(path)) head.set(path, blob);
  }
  return { versions, head };
}

// Of the blobs given, the text of each that holds the passage.
async function textsHolding(git, shas, holds) {
  const found = new Map();
  for (const [sha, bytes] of await blobsOf(git, [...new Set(shas)])) {
    const text = textOf(bytes);
    if (text !== null && holds(text)) found.set(sha, text);
  }
  return found;
}

// Each save on the branch whose message holds the passage, newest first: { commit, moment, message }.
async function messagesHolding(git, branch, holds) {
  const records = (await git(['log', '-z', '--format=%H %cI%n%B', branch])).toString('utf8').split('\0').filter(Boolean);
  return records.map((record) => {
    const [first, ...rest] = record.replace(/^\n/, '').split('\n');
    const [commit, date] = first.split(' ');
    return { commit, moment: new Date(date).toISOString(), message: rest.join('\n') };
  }).filter(({ message }) => holds(message));
}

// What of a branch holds a passage: the versions of files that do, `holding`, blob to text; the
// files of its head that do, `current`; and the saves whose message does, `messages`.
export async function passageIn(git, passage, { branch = BRANCH } = {}) {
  const matcher = passageMatcher(passage);
  const { versions, head } = await versionsOn(git, branch);
  const holding = await textsHolding(git, [...versions.map(({ blob }) => blob), ...head.values()], matcher.holds);
  return {
    matcher,
    versions: versions.filter(({ blob }) => holding.has(blob)),
    holding,
    current: [...head].filter(([, blob]) => holding.has(blob)).map(([path]) => path),
    head,
    messages: await messagesHolding(git, branch, matcher.holds),
  };
}

// Every file and revision on the source's branch that holds a passage, as an Admin is shown them
// before a purge: { files, messages, counted }. `files`, those whose current version holds it
// first, then by their newest revision that does, each { path, current, revisions, more }, its
// revisions newest first, each { commit, moment, current, count, around }, `count` the places
// it is found in that version and `around` the text around the first of them, and `more` how many
// more revisions than those listed hold it; `messages`, the saves whose message holds it, each
// { commit, moment, around }; and `counted`, how many files, revisions and messages hold it.
export async function findPassage({ git, passage, branch = BRANCH }) {
  const { matcher, versions, holding, current, head, messages } = await passageIn(git, passage, { branch });
  const files = new Map();
  for (const [order, { commit, moment, path, blob }] of versions.entries()) {
    if (!files.has(path)) files.set(path, { path, current: current.includes(path), order, revisions: [] });
    const file = files.get(path);
    const places = matcher.around(holding.get(blob));
    file.revisions.push({ commit, moment, current: file.current && file.revisions.length === 0 && head.get(path) === blob, count: places.length, around: places.slice(0, PLACES_SHOWN) });
  }
  const listed = [...files.values()].sort((a, b) => Number(b.current) - Number(a.current) || a.order - b.order);
  return {
    files: listed.slice(0, FILES_SHOWN).map(({ path, current: now, revisions }) => ({ path, current: now, revisions: revisions.slice(0, REVISIONS_SHOWN), more: Math.max(0, revisions.length - REVISIONS_SHOWN) })),
    messages: messages.slice(0, MESSAGES_SHOWN).map(({ commit, moment, message }) => ({ commit, moment, around: matcher.around(message.trim()).slice(0, PLACES_SHOWN) })),
    counted: { files: files.size, revisions: versions.length, messages: messages.length },
  };
}
