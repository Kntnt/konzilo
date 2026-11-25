// What a read of an incoming feed does to its posts (ADR 0079), from what is known of its items
// and what the read gives, with nothing read or written here.
//
// The items a feed holds at its first read are held: they make no posts, and are watched for
// nothing. A later item makes a post, and a known item whose title, text, date or link has changed
// corrects its post. A known item missing from a read is withdrawn where the feed still holds an
// item older than it, and has fallen out, its post left as it is, where it is older than every item
// the feed holds, which a feed that keeps only its latest items does to its oldest; so a read of no
// items withdraws nothing, and an item withdrawn while it was the oldest stays, the safe side. An
// item is older by its moment, the date its post has: its own, or when it was first read where it
// gives none or one ahead. An item back after its withdrawal makes its post again, at its own path.

import { itemVersion, postDate } from './post.js';

// `known`: a Map of what is known of each item by its ID, { seen, moment, path, version, slug,
// state }, `state` `held`, `live` or `withdrawn`. `first`: whether this is the feed's first read.
// `items`: what it gives, as read.js reads them. `now`: its moment.
//
// Gives { hold, make, correct, restore, withdraw }: the items to hold, each item; those to make a
// post of, each { item }; those whose post to correct and those whose post to make again, each
// { item, known }; and the posts to withdraw, each as `known` has it, with its `id`.
export function reconcile({ known, first, items, now }) {
  const once = [];
  const taken = new Set();
  for (const item of items) {
    if (taken.has(item.id)) continue;
    taken.add(item.id);
    once.push(item);
  }
  const done = { hold: [], make: [], correct: [], restore: [], withdraw: [] };
  if (first) {
    done.hold = once;
    return done;
  }
  for (const item of once) {
    const held = known.get(item.id);
    if (!held) done.make.push({ item });
    else if (held.state === 'withdrawn') done.restore.push({ item, known: held });
    else if (held.state === 'live' && itemVersion(item) !== held.version) done.correct.push({ item, known: held });
  }
  const moments = once.map((item) => postDate(item, { seen: known.get(item.id)?.seen ?? now, now }));
  const oldest = moments.length === 0 ? null : moments.reduce((one, other) => (other < one ? other : one));
  if (oldest === null) return done;
  for (const [id, held] of known) {
    if (held.state !== 'live' || taken.has(id)) continue;
    if (oldest < held.moment) done.withdraw.push({ id, ...held });
  }
  return done;
}
