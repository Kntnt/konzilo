// A scheduled post's triggers (ADR 0076): what it waits for before it goes out. A trigger is a
// moment, which has happened once it has passed, or the publishing of another post that meets
// the conditions an Editor gives, which has happened once such a post is published. Triggers
// stand in rows: those on one row are alternatives, combined by or, and the rows are combined by
// and. A post-published trigger's conditions stand in rows the same way, every one of them about
// the same post. A post scheduled for a moment alone holds it in `date`, as it always has; one
// with other triggers holds them all in `triggers`, and no `date`.
//
// In a source file, `triggers` is a list of rows, each a list of triggers:
//   { "moment": "<moment>" }
//   { "published": [[<condition>, …], …], "since": "<moment>" }
// `since` is when the trigger was last changed, which the form writes: only a post published from
// then on counts. A condition is one of:
//   { "type": "<type>" }               the post is of the type, by its name in the site description
//   { "words": "<words>" }             its title holds each word, whole and whatever its case
//   { "term": "<ID>" }                 it has the term, of any taxonomy, or one below it
//   { "from": "<moment>", "to": "<moment>" }   it is published within the window, either end left
//                                      out where it has none, and never before `since`
//
// This module reads them and reckons with them, and holds no input or output of its own, so that
// the intake, the preview and the editor reckon alike.

import { momentOf } from './moment.js';

// The source file's key, and each kind of trigger by its key.
export const TRIGGERS = 'triggers';
export const MOMENT = 'moment';
export const PUBLISHED = 'published';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const keysAre = (object, allowed) => Object.keys(object).length > 0 && Object.keys(object).every((key) => allowed.includes(key));
const rowsOf = (value) => Array.isArray(value) && value.length > 0 && value.every((row) => Array.isArray(row) && row.length > 0);

// A problem with what a source file holds, by its kind, `shape`, `moment`, `since`, `type` or
// `window`, and the value it is about, where it has one.
const problem = (kind, value = null) => ({ problem: kind, value });

function readCondition(given, types) {
  if (!isObject(given)) return problem('shape');
  if (keysAre(given, ['type'])) {
    if (typeof given.type !== 'string' || given.type.trim() === '') return problem('shape');
    if (types && !types.includes(given.type)) return problem('type', given.type);
    return { condition: { type: given.type } };
  }
  if (keysAre(given, ['words'])) {
    const words = typeof given.words === 'string' ? given.words.trim().split(/\s+/).join(' ') : '';
    return words === '' ? problem('shape') : { condition: { words } };
  }
  if (keysAre(given, ['term'])) {
    return typeof given.term === 'string' && given.term.trim() !== '' ? { condition: { term: given.term.trim() } } : problem('shape');
  }
  if (keysAre(given, ['from', 'to'])) {
    const window = {};
    for (const end of ['from', 'to']) {
      if (given[end] === undefined) continue;
      const moment = momentOf(given[end]);
      if (moment === null) return problem('moment', String(given[end]));
      window[end] = moment;
    }
    if (window.from && window.to && window.from > window.to) return problem('window');
    return { condition: window };
  }
  return problem('shape');
}

function readTrigger(given, types) {
  if (!isObject(given)) return problem('shape');
  if (keysAre(given, [MOMENT])) {
    const moment = momentOf(given.moment);
    return moment === null ? problem('moment', String(given.moment)) : { trigger: { moment } };
  }
  if (!Object.hasOwn(given, PUBLISHED) || !keysAre(given, [PUBLISHED, 'since'])) return problem('shape');
  if (!rowsOf(given.published)) return problem('shape');
  const since = momentOf(given.since);
  if (since === null) return problem('since');
  const rows = [];
  for (const row of given.published) {
    const read = [];
    for (const one of row) {
      const made = readCondition(one, types);
      if (made.problem) return made;
      read.push(made.condition);
    }
    rows.push(read);
  }
  return { trigger: { published: rows, since } };
}

/**
 * What a source file's `triggers` hold, read: { rows } or { problem, value }.
 * @param {unknown} given the value of `triggers`
 * @param {{ types?: string[] }} [site] the names of the site's types, to check a type condition by
 */
export function readTriggers(given, { types } = {}) {
  if (!rowsOf(given)) return problem('shape');
  const rows = [];
  for (const row of given) {
    const read = [];
    for (const one of row) {
      const made = readTrigger(one, types);
      if (made.problem) return made;
      read.push(made.trigger);
    }
    rows.push(read);
  }
  return { rows };
}

// Whether `triggers` is given at all: a list of rows with something in it.
export const triggersGiven = (value) => value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0) && value !== '';

// The moment of triggers that are one moment alone, or null.
export const momentAlone = (rows) => (rows.length === 1 && rows[0].length === 1 && typeof rows[0][0].moment === 'string' ? rows[0][0].moment : null);

// Each moment among the triggers, and the latest of them, or null where there is none.
export const momentsIn = (rows) => rows.flat().filter((trigger) => typeof trigger.moment === 'string').map(({ moment }) => moment);
export const latestMoment = (rows) => momentsIn(rows).sort().at(-1) ?? null;

// The words of a text, whole, whatever their case.
const wordsOf = (text) => String(text ?? '').normalize('NFC').toLocaleLowerCase('und').match(/[\p{L}\p{N}]+/gu) ?? [];

// Whether a title holds each of the words, each as a word of its own, whatever its case.
export function titleHolds(title, words) {
  const held = new Set(wordsOf(title));
  return wordsOf(words).every((word) => held.has(word));
}

/**
 * Whether a post meets a post-published trigger's conditions: on every row, at least one.
 * @param {object[][]} conditions the trigger's rows of conditions
 * @param {{ type: string, title: string, terms: Iterable<string>, at: string | null }} post its type's
 *   name, its title, the IDs of its terms with those above them, and the moment it is published,
 *   or null to ask of what the post is, whenever it is published
 * @param {string | null} since when the trigger was saved, before which nothing counts
 */
export function meets(conditions, post, since = null) {
  const terms = new Set(post.terms ?? []);
  const holds = (condition) => {
    if (Object.hasOwn(condition, 'type')) return post.type === condition.type;
    if (Object.hasOwn(condition, 'words')) return titleHolds(post.title, condition.words);
    if (Object.hasOwn(condition, 'term')) return terms.has(condition.term);
    if (post.at === null) return true;
    const start = [condition.from, since].filter(Boolean).sort().at(-1);
    return (!start || post.at >= start) && (!condition.to || post.at <= condition.to);
  };
  return conditions.every((row) => row.some(holds));
}

/**
 * The moment rows of triggers came to hold, or come to: the latest, over the rows, of the
 * earliest moment at which a trigger on the row happens; null where a row has none.
 * @param {object[][]} rows
 * @param {(trigger: object) => string | null} happened the moment a trigger happens, or null
 */
export function holdsAt(rows, happened) {
  let latest = null;
  for (const row of rows) {
    const earliest = row.map(happened).filter(Boolean).sort()[0] ?? null;
    if (earliest === null) return null;
    if (latest === null || earliest > latest) latest = earliest;
  }
  return latest;
}
