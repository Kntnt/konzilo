// The helpers, reached as `@kntnt/konzilo/astro/helpers`: the common ways a
// site's templates work on their data.
//
//   import { longDate, termPath, postalAddress, oneLine, legalPages, summary, ordered, countOf, builtInType, authorsOf } from '@kntnt/konzilo/astro/helpers';
//   <time datetime={article.data.date.toISOString()}>{longDate(article.data.date, Astro.url)}</time>
//   const authors = await authorsOf(article);
//   {authors.map((author) => <li>{author.url ? <a href={author.url}>{author.name}</a> : author.name}</li>)}
//   {builtInType(entry) !== 'canvas' && <header>…</header>}
//   <p>{summary(article.data.excerpt, 20)}</p>
//   <p>{countOf(categories)} categories</p>
//   {ordered(categories, (category) => category.data.name, { language: Astro.url, descending: true }).map(...)}
//
// A date's ISO form, `date.toISOString()`, is its data put in place, and
// needs no helper.

import { builtInOf } from '../format/built-in-types.js';
import { articleAuthors } from './authors.js';
import { describedSite } from './languages.js';
import { publicSite } from './public-site.js';

// The separator between a term's parents' names and its own in termPath().
export const TERM_SEPARATOR = ' › ';

// A date as a long date in a language, as Intl's `dateStyle: 'long'`
// writes it in UTC: `3 February 2001` in British English, `3 februari 2001`
// in Swedish, `February 3, 2001` in American English. `language`: the
// page's address, Astro.url, whose language it takes, or a
// language tag such as `sv-SE`.
export function longDate(date, language) {
  return new Intl.DateTimeFormat(tagOf(language), { dateStyle: 'long', timeZone: 'UTC' }).format(date);
}

function tagOf(language) {
  if (language instanceof URL) return publicSite(language).languageTag;
  if (typeof language === 'string' && language !== '') return language;
  throw new Error('longDate() and ordered() take the page\'s language as its address, Astro.url, or a language tag, such as sv-SE');
}

// A term's name after its parents' names, the topmost first, each after
// TERM_SEPARATOR: `Food › Fruit` for Fruit below Food; a term without a
// parent by its name alone. `term`: an entry of a taxonomy's collection, as
// Astro's getEntries() gives one. `getEntry`: Astro's own from
// astro:content, by default; a parent the build has not got ends the path.
export async function termPath(term, { getEntry } = {}) {
  const lookUp = getEntry ?? (await import('astro:content')).getEntry;
  const names = [term.data.name];
  const seen = new Set([term.id]);
  for (let parent = term.data.parent; parent;) {
    const found = await lookUp(parent);
    if (!found || seen.has(found.id)) break;
    seen.add(found.id);
    names.unshift(found.data.name);
    parent = found.data.parent;
  }
  return names.join(TERM_SEPARATOR);
}

// A publisher's postal address on one line: its street, its
// postal code and locality, and its country, each that is filled, the
// postal code and locality with a space between, the parts with a comma.
// `publisher`: the publisher of the Search and sharing settings, as the
// site settings hold it.
export function postalAddress(publisher = {}) {
  const filled = (value) => (typeof value === 'string' ? value.trim() : '') !== '';
  const text = (value) => (filled(value) ? value.trim() : '');
  const locality = [text(publisher.postalCode), text(publisher.locality)].filter(Boolean).join(' ');
  return [text(publisher.street), locality, text(publisher.country)].filter(Boolean).join(', ');
}

// A text of lines on one line: each line trimmed, the empty ones left out,
// the rest after a comma and a space.
export function oneLine(text) {
  return String(text ?? '').split(/\r\n|\r|\n/).map((line) => line.trim()).filter(Boolean).join(', ');
}

// The legal pages a page links to: the privacy policy, the
// cookie policy and the accessibility statement the site settings choose,
// each { title, url }, in that order, each address once, since the cookie
// policy may be the privacy policy itself; one that is not chosen, or not
// published, is not there. `settings`: the site settings, as the
// collection `settings` types them.
export function legalPages(settings = {}) {
  const { privacyPolicy, cookiePolicy, accessibilityStatement } = settings?.legalPages ?? {};
  const pages = [];
  for (const page of [privacyPolicy, cookiePolicy, accessibilityStatement]) {
    if (!page || typeof page.url !== 'string' || page.url === '' || pages.some((shown) => shown.url === page.url)) continue;
    pages.push({ title: page.title, url: page.url });
  }
  return pages;
}

// How many words a summary shows by default.
export const SUMMARY_WORDS = 30;

// A text's first words, `words` of them, thirty by default, each after one
// space, and `…` after the last where the text has more; the text's words as
// they are where it has no more. A word is what lies between HTML's spaces
// (space, tab, line feed, form feed and carriage return).
export function summary(text, words = SUMMARY_WORDS) {
  const all = String(text ?? '').split(/[ \t\n\f\r]+/).filter(Boolean);
  return all.length > words ? `${all.slice(0, words).join(' ')}…` : all.join(' ');
}

// How many items a list holds, such as a post's categories or a menu's
// entries; none for no list.
export function countOf(list) {
  return [...(list ?? [])].length;
}

// A list's items in the order of a text of each, `by`, a function of an item
// or the name of its property, as the page's language orders text (Intl's
// Collator), the last first with `descending`; items whose texts are the
// same keep their order. `language`: the page's address, Astro.url, whose
// language it takes, or a language tag such as `sv-SE`.
export function ordered(items, by, { language, descending = false } = {}) {
  const collator = new Intl.Collator(tagOf(language));
  const textOf = typeof by === 'function' ? by : (item) => item?.[by];
  const sign = descending ? -1 : 1;
  return [...(items ?? [])].map((item, index) => ({ item, index, text: String(textOf(item) ?? '') }))
    .sort((one, other) => sign * collator.compare(one.text, other.text) || one.index - other.index)
    .map(({ item }) => item);
}

// The core's built-in type a post is (format/built-in-types.js), `canvas`, `page` or
// `article`, so that a layout can draw a canvas without the site's header and footer:
// null for a post of a type of the site's own, and for no post, as on a page of the
// site's own. `entry`: an entry of a type's collection, as Astro hands a template one.
// `site`: the site description as checked, the site's own by default.
export function builtInType(entry, { site = describedSite() } = {}) {
  if (!entry) return null;
  return builtInOf(Object.values(site.types).find((type) => type?.collection === entry.collection));
}

// An article's authors, for its byline, in the order its editor gave them, the first
// author first (authors.js): each { name, url, slug, entry }, its name, its page's address
// below the site's base, which a preview's build moves, where the authors taxonomy
// declares one, else null, its slug, and its term's entry, which holds its biography as
// `data.description`. None for a post of a type of the site's own. `entry`: an entry of a
// type's collection, as Astro hands a template one. `site`: the site description as
// checked, the site's own by default; `getEntries`: Astro's own from astro:content, by
// default.
export async function authorsOf(entry, { site = describedSite(), getEntries } = {}) {
  const type = Object.values(site.types).find((declared) => declared?.collection === entry?.collection);
  const read = getEntries ?? (await import('astro:content')).getEntries;
  const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/$/, '');
  return (await articleAuthors(entry, type, site, read)).map(({ name, path, slug, entry: term }) => ({ name, url: path === null ? null : `${base}${path}`, slug, entry: term }));
}
