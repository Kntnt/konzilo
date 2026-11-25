// A scheduled post's triggers in the intake (ADR 0076): read from its source file, and the
// moment each post's triggers came to hold, or come to, reckoned over every post at once, since
// a post that waits for another's publishing goes out in the build that publishes it, a chain of
// them in one build, each after the one it waited for.
//
// What has happened counts however late it is seen: a trigger is a state, a moment passed or a
// matching post published, and not something a build must have been running to see. A post that
// went out stays out, by the ledger's `released`, whatever becomes of what released it later.

import { holdsAt, latestMoment, meets, momentAlone, readTriggers, TRIGGERS } from '../format/triggers.js';
import { momentOf } from '../format/moment.js';
import { refuse } from './run.js';
import { sha256 } from './source.js';
import { say } from './words.js';

const PROBLEMS = Object.freeze({
  shape: () => say('refusal.triggers-shape'),
  moment: (value) => say('refusal.trigger-moment', { value }),
  since: () => say('refusal.trigger-since'),
  type: (value) => say('refusal.trigger-type', { type: value }),
  window: () => say('refusal.trigger-window'),
});

const given = (value) => value !== undefined && value !== null && value !== '';

/**
 * A scheduled post's triggers from its source file, which gives them: { moment } for a moment
 * alone, which is a scheduled post as it always was; { rows, key } for others, `key` naming them
 * in the ledger; or { refused: true }, the post refused here.
 */
export function scheduleOf(post, run) {
  if (given(post.fields.date)) {
    refuse(run, post, { field: TRIGGERS, reason: say('refusal.triggers-date') });
    return { refused: true };
  }
  const read = readTriggers(post.fields[TRIGGERS], { types: Object.keys(run.site.types) });
  if (read.problem) {
    refuse(run, post, { field: TRIGGERS, reason: PROBLEMS[read.problem](read.value) });
    return { refused: true };
  }
  const alone = momentAlone(read.rows);
  if (alone) return { moment: alone };
  return { rows: read.rows, key: sha256(JSON.stringify(read.rows)) };
}

// The IDs of the terms a post's fields name, and of those above them.
function termsOf(post, run) {
  const found = new Set();
  for (const field of post.type.fields) {
    if (field.kind !== 'terms' || !field.taxonomy) continue;
    const value = post.fields[field.name];
    for (const id of given(value) ? (Array.isArray(value) ? value : [value]) : []) {
      found.add(String(id));
      for (const one of run.terms.get(`${field.taxonomy.collection}/${id}`)?.chain ?? []) found.add(one.id);
    }
  }
  return found;
}

// The moment a post on the site's way by its own is published: its own date, else the one the
// intake first took it at, else now.
const ownMoment = (post, run) => post.dated ?? momentOf(post.fields.date ?? '') ?? run.ledger.posts[post.key]?.taken ?? run.nowText;

/**
 * The moment each scheduled post's triggers came, or come, to hold, by every post's publishing as
 * it stands at `run.now`, with what is still to come: `holdsAt` on each post with `triggers`, null
 * where nothing known will make them hold; `out`, the moment it went out at by the ledger, where it
 * has; `by`, for each post-published trigger, the post that made it happen first; and `assumed`,
 * where a live preview took a trigger it knows nothing of as happening on time. A post that is
 * refused, or `run.excluded` names, publishes nothing that counts.
 */
export function reckonTriggers(run) {
  const waiting = run.source.posts.filter((post) => post.triggers);
  if (waiting.length === 0) return;
  const counts = (post) => !post.gone && !run.excluded.has(post.key) && !run.refused.has(post.key);
  const moments = new Map();
  for (const post of run.source.posts) {
    if (post.triggers || !counts(post)) continue;
    const moment = post.on ? ownMoment(post, run) : post.waiting ?? null;
    if (moment) moments.set(post.key, moment);
  }
  for (const post of waiting) {
    const held = run.ledger.released?.[post.key];
    if (held?.triggers === post.triggersKey && momentOf(held.at ?? '') === held.at) post.out = held.at;
    moments.set(post.key, post.out ?? null);
  }
  const candidates = run.source.posts.filter(counts).map((post) => ({ post, terms: termsOf(post, run) }));
  const assumeAfter = run.assume ? momentOf(run.assume) : null;

  // The moment a trigger of `post` happens, or null, and what made it happen.
  const happening = (post, trigger) => {
    if (typeof trigger.moment === 'string') return { at: trigger.moment };
    let first = null;
    for (const { post: other, terms } of candidates) {
      if (other.id === post.id) continue;
      const at = moments.get(other.key) ?? null;
      if (at === null || at < trigger.since) continue;
      if (!meets(trigger.published, { type: other.type.name, title: other.title ?? '', terms, at }, trigger.since)) continue;
      if (first === null || at < first.at) first = { at, by: other };
    }
    if (first) return first;
    // In a live preview, what the timeline knows nothing of is taken to happen on time: by the
    // latest of the post's own moments, where that is still to come.
    const latest = assumeAfter ? latestMoment(post.triggers) : null;
    return latest && latest > assumeAfter ? { at: latest, assumed: true } : { at: null };
  };

  // Round on round, as a post that waits for another learns when that one goes out, until
  // nothing changes; a cycle never comes to hold by itself.
  for (let round = 0; round <= waiting.length; round += 1) {
    let changed = false;
    for (const post of waiting) {
      if (post.out) continue;
      const at = holdsAt(post.triggers, (trigger) => happening(post, trigger).at);
      if (at !== moments.get(post.key)) {
        moments.set(post.key, at);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const post of waiting) {
    post.holdsAt = moments.get(post.key);
    post.happened = post.triggers.map((row) => row.map((trigger) => happening(post, trigger)));
    post.assumed = !post.out && post.holdsAt !== null && post.happened.flat().some(({ at, assumed }) => assumed && at === post.holdsAt);
  }
}

/**
 * A post's triggers as its publish status shows them, in their rows: a moment, { moment,
 * happened }, or another post's publishing, { published, since, happened, by }, its conditions in
 * their rows, a term's with its `name`, and `by` the title of the post whose publishing made it
 * happen; `happened` whether it has, as the site stands at `run.now`.
 */
export function shownTriggers(post, run) {
  const now = run.nowText;
  return post.triggers.map((row, r) => row.map((trigger, t) => {
    const { at, by = null } = post.happened?.[r]?.[t] ?? { at: null };
    const happened = at !== null && at <= now && !post.happened[r][t].assumed;
    if (typeof trigger.moment === 'string') return { moment: trigger.moment, happened };
    const published = trigger.published.map((conditions) => conditions.map((condition) => (Object.hasOwn(condition, 'term') ? { ...condition, name: run.termsById.get(condition.term)?.label ?? condition.term } : condition)));
    return { published, since: trigger.since, happened, ...(happened && by ? { by: by.title ?? by.id } : {}) };
  }));
}

// A post's terms by ID, for the editor's check that no posts wait for each other in a cycle.
export const termIdsOf = (post, run) => [...termsOf(post, run)].sort();
