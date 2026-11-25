// A scheduled post's triggers as its form holds them (ADR 0076), with no React: a moment alone in
// the date, as a scheduled post always had it, and any other triggers in `triggers`, with no date;
// what each change of the form makes of them; and the checks at Save. The triggers' shape is the
// source file's (format/triggers.js), each moment to the second in UTC.

import { momentOf } from '../../format/moment.js';
import { kindOf, meets, momentAlone } from '../../format/triggers.js';

const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

// The triggers in rows, from the status group's `date` and `triggers`.
export function rowsIn({ date, triggers }) {
  if (Array.isArray(triggers) && triggers.length > 0) return triggers;
  const moment = momentOf(date ?? '');
  return moment ? [[{ moment }]] : [];
}

// What the status group holds for triggers in rows: a moment alone as the date, and others as
// `triggers`, with the date empty, as the source file holds them.
export function writtenFrom(rows) {
  const kept = rows.filter((row) => row.length > 0);
  const alone = kept.length > 0 ? momentAlone(kept) : null;
  if (alone) return { date: alone, triggers: '' };
  return kept.length === 0 ? { date: '', triggers: '' } : { date: '', triggers: kept };
}

const replaced = (list, at, value) => list.map((one, index) => (index === at ? value : one));
const without = (list, at) => list.filter((_, index) => index !== at);

// A trigger added as an alternative on row `row`, or on a row of its own where `row` is null.
export const addTrigger = (rows, row, trigger) => (row === null || row >= rows.length ? [...rows, [trigger]] : replaced(rows, row, [...rows[row], trigger]));

// A trigger taken away, and its row where nothing is left on it.
export const removeTrigger = (rows, row, at) => replaced(rows, row, without(rows[row], at)).filter((one) => one.length > 0);

export const changeTrigger = (rows, row, at, trigger) => replaced(rows, row, replaced(rows[row], at, trigger));

// A post-published trigger with its conditions changed, a new one, which counts from the save that
// writes it (stampedAtSave()): only a post published after it was saved releases anything.
const withConditions = (published) => ({ published });

export const addCondition = (trigger, row, condition) => withConditions(addTrigger(trigger.published, row, condition));
export const changeCondition = (trigger, row, at, condition) => withConditions(changeTrigger(trigger.published, row, at, condition));
export const removeCondition = (trigger, row, at) => withConditions(removeTrigger(trigger.published, row, at));

/**
 * The triggers as a save writes them: each post-published trigger new or changed since the last
 * save, which has no `since` yet, counting from `now`, the moment of the save, and the rest from
 * the save that wrote them. The rows themselves where nothing is new.
 * @param {object[][]} rows
 * @param {string} now
 */
export function stampedAtSave(rows, now) {
  const unsaved = (trigger) => kindOf(trigger) === 'published' && !trigger.since;
  if (!rows.flat().some(unsaved)) return rows;
  return rows.map((row) => row.map((trigger) => (unsaved(trigger) ? { ...trigger, since: now } : trigger)));
}

// Whether a condition is filled in: a type, words, a term, or a window with an end.
const filled = (condition) => !isEmpty(condition?.type) || (typeof condition?.words === 'string' && condition.words.trim() !== '') || !isEmpty(condition?.term) || Boolean(momentOf(condition?.from ?? '') || momentOf(condition?.to ?? ''));

/**
 * What stops a save of a scheduled post with these triggers, by name, or null: `momentAhead`, a
 * moment that is not ahead, or none to wait for, as a scheduled post's date always was;
 * `windowPassed`, a window whose end has passed; `incomplete`, a trigger or a condition left empty.
 * @param {object[][]} rows
 * @param {string} now the moment of the save
 */
export function problemAtSave(rows, now) {
  if (rows.length === 0) return 'momentAhead';
  for (const trigger of rows.flat()) {
    if (kindOf(trigger) === 'moment') {
      const moment = momentOf(trigger.moment ?? '');
      if (!moment) return 'incomplete';
      if (moment <= now) return 'momentAhead';
      continue;
    }
    const conditions = trigger.published ?? [];
    if (conditions.length === 0 || !conditions.every((row) => row.length > 0 && row.every(filled))) return 'incomplete';
    for (const condition of conditions.flat()) if (condition.to && momentOf(condition.to) <= now) return 'windowPassed';
  }
  return null;
}

// The posts a post waits for, of `others`: on a row of its triggers with no moment on it, which
// time alone cannot make hold, each post that meets one of the row's post-published triggers.
const waitsFor = (rows, others, self) => others.filter((other) => other.file !== self && rows.some((row) => !row.some((trigger) => kindOf(trigger) === 'moment')
  && row.some((trigger) => trigger.published && meets(trigger.published, { type: other.type, title: other.title ?? '', terms: other.terms ?? [], at: null }))));

// A post's terms and every term above them, by `parents`, each term's parent by its ID, as the
// intake counts a post's terms (intake/triggers.js).
function withTermsAbove(terms, parents) {
  const found = new Set(terms);
  for (const term of terms) {
    for (let above = parents.get(term); above !== undefined && !found.has(above); above = parents.get(above)) found.add(above);
  }
  return [...found];
}

/**
 * The title of the post a cycle of waiting runs through, from the post in the form back to it, or
 * null where there is none.
 * @param {{ file: string | null, type: string, title: string, terms: string[], rows: object[][] }} own
 *   the post in the form, as the form holds it, with its own terms, to which those above them are
 *   added
 * @param {{ file: string, type: string, title: string, terms: string[], triggers: object[][] }[]} others
 *   the scheduled posts that wait for triggers, as the last build read them, the terms above their
 *   own among their terms
 * @param {Map<string, string>} parents each term's parent, by the term's ID
 */
export function cycleThrough(own, others, parents = new Map()) {
  const posts = [{ ...own, terms: withTermsAbove(own.terms ?? [], parents), triggers: own.rows }, ...others.filter((other) => other.file !== own.file)];
  const seen = new Set();
  // A walk from each post the form's waits for, back to the form's.
  const leadsBack = (post) => {
    if (seen.has(post.file)) return false;
    seen.add(post.file);
    return waitsFor(post.triggers, posts, post.file).some((next) => next === posts[0] || leadsBack(next));
  };
  return waitsFor(own.rows, posts, own.file).find((first) => first !== posts[0] && leadsBack(first))?.title ?? null;
}
