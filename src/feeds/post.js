// A post made from an incoming feed's item, as its source file (ADR 0079), which the feed reader
// writes, and which only it changes: published, with the item's title, its text as the body
// elements of its type, its date and the address of the original, a slug made from its title as
// the editor makes one, and, under `feed`, the item's ID in its feed and what tells that the item
// has changed. Released, as its feed is removed, it is the same file without `feed`.

import { createHash } from 'node:crypto';
import { parseDocument } from 'yaml';

import { slugFrom } from '../format/article-parts.js';
import { FEED_ITEM, ORIGINAL_ADDRESS } from '../format/feed-post.js';
import { feedBody } from './body.js';

// What tells that an item has changed: its title, its text, its date and its link, as the feed
// gives them, and nothing else of it.
export const itemVersion = ({ title, text, date, link }) => createHash('sha256').update(JSON.stringify([title, text, date, link])).digest('hex');

// The date of an item's post: its publishing moment, or `seen`, when it was first read, where it
// gives none, or one ahead of `now`.
export const postDate = (item, { seen, now }) => (item.date && item.date <= now ? item.date : seen);

// `item`: as read.js reads it. `site`: the site description, as checked. `type`: the post's.
// `seen`: when the item was first read. `now`: the moment of this read. `slug`: the post's, where
// it has one, which a changed title keeps, so that its address stays. Gives { text, slug, date,
// version, dropped }: the source file, and what it holds of each.
export function feedPostFile(item, { site, type, seen, now, slug: kept = null }) {
  const slug = kept ?? slugFrom(item.title);
  const date = postDate(item, { seen, now });
  const version = itemVersion(item);
  const { body, dropped } = feedBody(item.text, { site, type, base: item.link ?? undefined });
  const marks = { item: item.id, version, ...(dropped.length > 0 ? { dropped } : {}) };
  const lines = [
    ['title', JSON.stringify(item.title)],
    ['slug', JSON.stringify(slug)],
    ['status', 'published'],
    ['date', date],
    // An article's main headline, which it requires: the item's title is its headline.
    ...type.fields.filter((field) => field.kind === 'headline').map((field) => [field.name, JSON.stringify(item.title)]),
    ...(item.link ? [[ORIGINAL_ADDRESS, JSON.stringify(item.link)]] : []),
    [FEED_ITEM, JSON.stringify(marks)],
  ];
  const head = lines.map(([key, value]) => `${key}: ${value}`).join('\n');
  return { text: `---\n${head}\n---\n${body === '' ? '' : `\n${body}\n`}`, slug, date, version, dropped };
}

const FRONT_MATTER = /^---[ \t]*\n([\s\S]*?\n)?---([ \t]*(?:\n[\s\S]*)?)$/;

// A post's source file without `feed`, as its feed is removed: a line of its own where the feed
// reader wrote it so, else its front matter written anew without it. A file without it is as it was.
export function releasedFile(text) {
  const found = FRONT_MATTER.exec(String(text).replace(/\r\n?/g, '\n'));
  if (!found) return text;
  const [, head = '', rest] = found;
  const lines = head.split('\n');
  const at = lines.findIndex((line) => line.startsWith(`${FEED_ITEM}:`));
  if (at === -1) return text;
  if (/^feed:[ \t]*\{.*\}[ \t]*$/.test(lines[at]) && !/^[ \t]/.test(lines[at + 1] ?? '')) {
    lines.splice(at, 1);
    return `---\n${lines.join('\n')}---${rest}`;
  }
  const document = parseDocument(head);
  document.delete(FEED_ITEM);
  return `---\n${String(document)}---${rest}`;
}
