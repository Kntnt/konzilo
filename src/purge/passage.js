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
import { blobsOf, BRANCH, purgeHistories, PurgeRefusal } from './histories.js';
import { passageOf } from './passage-text.js';

export { PASSAGE_LEAST, PASSAGE_MOST, passageOf } from './passage-text.js';

// How much of the text on each side of a place it is found is shown, in characters.
const AROUND = 60;

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

const MEDIA = `${MEDIA_FOLDER}/`;
const LFS = 'version https://git-lfs.github.com/spec/';
// A search lists this many revisions of a file at most, this many files and this many saves whose
// message names the passage, and this many places in each.
const REVISIONS_SHOWN = 20;
const FILES_SHOWN = 100;
const MESSAGES_SHOWN = 20;
const PLACES_SHOWN = 3;

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
  return { versions, head: await headOn(git, branch) };
}

// The branch's head's files a passage is looked for in, path to blob.
async function headOn(git, branch) {
  const head = new Map();
  for (const entry of (await git(['-c', 'core.quotePath=false', 'ls-tree', '-r', '-z', branch])).toString('utf8').split('\0').filter(Boolean)) {
    const [about, path] = entry.split('\t');
    const [, kind, blob] = about.split(' ');
    if (kind === 'blob' && searched(path)) head.set(path, blob);
  }
  return head;
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

// The files of a branch's head that hold a passage, as of the content repository, whose head a
// purge refuses to change.
export async function headHolding(git, passage, { branch = BRANCH } = {}) {
  const head = await headOn(git, branch);
  const holding = await textsHolding(git, [...head.values()], passageMatcher(passage).holds);
  return [...head].filter(([, blob]) => holding.has(blob)).map(([path]) => path);
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

// The rules a history is rewritten by to take a passage from it, as rewriteHistory() takes them:
// every version of a file `holding` names loses it, and every message that holds it, and every
// save stays, though it changes nothing once the passage is gone from what it changed.
function rulesWithout({ matcher, holding }) {
  const without = (text) => matcher.without(text);
  return {
    reads: (path, blob) => holding.has(blob),
    change: (path, bytes) => {
      const text = textOf(bytes);
      return text === null || !matcher.holds(text) ? null : without(text);
    },
    // Each line of a message is left without the space taking it out leaves at its end.
    message: (text) => (matcher.holds(text) ? without(text).replace(/[ \t]+$/gmu, '') : null),
    keepEmpty: true,
  };
}

// Purges `passage` from every old revision of both repositories, as `by`, { login, name }, at `at`,
// as purgeHistories() does, `source`, `content` and `pushedBy` as it takes them: every version of
// every file of the source but an image's that holds it, and every message, and every content file
// of an old revision and every message of the content repository, since each is built from the
// source; never a file of either head, as an editor's save changes the published text first. Gives what purgeHistories() gives, which takes `tries`, `sleep` and `noted`, with
// `changed`, in `outcome` and beside it, { files, revisions, messages }, how many files of the
// source, revisions of them and saves' messages it was taken from.
// Throws a PurgeRefusal: `current`, with the `paths` of the files of the source as it stands that
// hold it, which an Admin saves without it first; `published`, with the `paths` of the files of the
// content repository's head that do, which a build makes again from such a save, or which a post
// the build refused keeps until one of it is published; or `not-found`, where neither history
// holds it.
export async function purgePassage({ source, content, passage, by, at, pushedBy, tries, sleep, noted }) {
  const result = await purgeHistories({
    source,
    content,
    by,
    at,
    pushedBy,
    tries,
    sleep,
    noted,
    plan: async ({ before }) => {
      const found = await passageIn(source.git, passage);
      if (found.current.length > 0) throw new PurgeRefusal('current', { paths: found.current });
      const published = before.content === null ? null : await passageIn(content.git, passage);
      if (published?.current.length > 0) throw new PurgeRefusal('published', { paths: published.current });
      return {
        source: rulesWithout(found),
        content: () => rulesWithout(published),
        outcome: { changed: { files: new Set(found.versions.map(({ path }) => path)).size, revisions: found.versions.length, messages: found.messages.length } },
      };
    },
  });
  return { ...result, ...result.outcome };
}
