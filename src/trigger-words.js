// A scheduled post's triggers in words (ADR 0076), in a language of the catalogues, as the publish
// status, the Publishing page and the live preview's toolbar say them: each trigger alone, so that
// each can be ticked where it has happened, and the alternatives on a row joined by or.

import { labelInPhrase, text } from './catalogues.js';

const MOMENT = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };

// A moment in a language's own form, `1 January 2026 at 09:00 CET`, in the reader's time zone,
// which it names, as a moment in a refusal is.
export const momentInZone = (language) => (at) => new Date(at).toLocaleString(language, MOMENT);

// The same in UTC, where nothing knows the reader's zone.
export const momentInUtc = (language) => (at) => new Date(at).toLocaleString(language, { ...MOMENT, timeZone: 'UTC' });

/**
 * One trigger in words, as the intake tells of it: a moment, or another post's publishing, its
 * conditions in their rows, a type's with its `label` and a term's with its `name`.
 * @param {object} trigger
 * @param {string} language an interface language
 * @param {(at: string) => string} moment a moment in words
 */
export function triggerWords(trigger, language, moment) {
  const say = (name, values) => text(language, name, values);
  if (typeof trigger.moment === 'string') return say('trigger.moment', { moment: moment(trigger.moment) });
  const condition = (one) => {
    if (Object.hasOwn(one, 'type')) return say('trigger.type', { type: labelInPhrase(one.label ?? one.type, language) });
    if (Object.hasOwn(one, 'words')) return say('trigger.words', { words: one.words });
    if (Object.hasOwn(one, 'term')) return say('trigger.term', { term: one.name ?? one.term });
    if (one.from && one.to) return say('trigger.window', { from: moment(one.from), to: moment(one.to) });
    return one.from ? say('trigger.windowFrom', { from: moment(one.from) }) : say('trigger.windowTo', { to: moment(one.to) });
  };
  const rows = trigger.published.map((row) => alternatives(row.map(condition), language));
  return say('trigger.published', { conditions: rows.reduce((one, other) => say('trigger.both', { one, other })) });
}

// Alternatives in words, each after the first joined by or.
export const alternatives = (words, language) => words.reduce((one, other) => text(language, 'trigger.either', { one, other }));

/**
 * What a post still waits for, in words: on each row with nothing on it that has happened, its
 * triggers as alternatives, and the rows joined, as the live preview's toolbar lists a post that is
 * not on the timeline.
 * @param {object[][]} rows the triggers in their rows, each with whether it has `happened`
 */
export function waitedFor(rows, language, moment) {
  const open = rows.filter((row) => !row.some(({ happened }) => happened));
  return open.map((row) => alternatives(row.map((trigger) => triggerWords(trigger, language, moment)), language)).reduce((one, other) => text(language, 'trigger.both', { one, other }));
}
