// The incoming feeds an Admin adds, changes and removes on the *Feeds* page (ADR 0079), kept in the
// service's data and in no file, as the mail settings are: each feed's address, the type its items
// become, the language of its posts on a site in several, and how many minutes apart it is read.
// What the page is shown, and what it may save.

import { canonicalAddress } from '../format/addresses.js';
import { feedTypes } from '../feeds/types.js';

// How many minutes apart a feed is read, unless an Admin says otherwise, and the fewest and the
// most an Admin may say.
export const FEED_EVERY = 5;
export const FEED_EVERY_LEAST = 1;
export const FEED_EVERY_MOST = 1440;
// The longest address a feed may have.
const ADDRESS_AT_MOST = 2048;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const textOf = (value) => (typeof value === 'string' ? value.trim() : '');
const wholeOf = (value) => {
  if (Number.isInteger(value)) return value;
  return typeof value === 'string' && /^[0-9]{1,5}$/.test(value.trim()) ? Number(value) : null;
};

// What the page is shown: each feed, with its last failure, { at, kind, status }, or null; each
// type of the site, by its name and label, with whether a feed may become it; and on a site in
// several languages the tags of its languages, else null.
export function feedsShown({ store, site }) {
  const several = site.languages.length > 1;
  const posts = store.feedPosts();
  return {
    feeds: store.feeds().map(({ id, address, type, language, every, readAt, failure }) => ({ id, address, type, language, every, readAt, failure, posts: posts.filter((post) => post.feed === id).length })),
    types: feedTypes(site),
    languages: several ? site.languages.map(({ tag }) => tag) : null,
  };
}

// What an Admin saves of a feed, `given`, checked: { problems }, by the setting's name, or { feed },
// { address, type, language, every }. `id`: the feed changed, whose address stays, or null for a
// new one, whose address no other feed may have.
export function checkFeed(given, { store, site, id = null }) {
  if (!isObject(given)) return { problems: { '': 'malformed' } };
  const problems = {};
  const kept = id === null ? null : store.feeds().find((one) => one.id === id) ?? null;
  let address = kept?.address ?? null;
  if (id === null) {
    const written = textOf(given.address);
    address = written.length > ADDRESS_AT_MOST ? null : canonicalAddress(written);
    if (written === '') problems.address = 'missing';
    else if (address === null) problems.address = 'not-address';
    else if (store.feeds().some((one) => one.address === address)) problems.address = 'taken';
  }
  const type = textOf(given.type);
  const chosen = feedTypes(site).find((one) => one.name === type);
  if (type === '') problems.type = 'missing';
  else if (!chosen) problems.type = 'unknown';
  else if (!chosen.choosable) problems.type = 'not-choosable';
  let language = null;
  if (site.languages.length > 1) {
    language = textOf(given.language);
    if (language === '') problems.language = 'missing';
    else if (!site.languages.some(({ tag }) => tag === language)) problems.language = 'unknown';
  }
  const every = given.every === undefined || given.every === null || given.every === '' ? FEED_EVERY : wholeOf(given.every);
  if (every === null || every < FEED_EVERY_LEAST || every > FEED_EVERY_MOST) problems.every = 'not-minutes';
  if (Object.keys(problems).length > 0) return { problems };
  return { feed: { address, type, language, every } };
}
