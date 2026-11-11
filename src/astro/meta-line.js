// What a post's meta line shows (meta-line.js, ADR 0062): the values of its variables, as
// a template's helper hands them on, each a list of pieces, { text, url, datetime }, none
// where the post has no value.
//
// - `authors`: an article's authors, in the order its editor gave them (authors.js), each
//   linked to its page where the authors taxonomy declares an address, a comma between;
// - `date` and `modified`: the post's date and its last change, as a long date in the
//   page's language, in UTC, with the moment, the last change only where it is on a later
//   day than the date;
// - `category`: an article's category by its name, linked to its page where the category
//   taxonomy declares an address.

import { CATEGORY, isArticle } from '../format/built-in-types.js';
import { articleAuthors } from './authors.js';

// The values of a post's variables. `entry`: Astro's entry; `type`: its type as the site
// description `site` (as checked) reads it; `tag`: the page's language tag; `base`: the
// site's base, which a preview's build moves, without its last slash; `getEntries` and
// `getEntry`: Astro's own.
export async function metaLineValues(entry, type, { site, tag, base, getEntries, getEntry }) {
  const long = (date) => new Intl.DateTimeFormat(tag, { dateStyle: 'long', timeZone: 'UTC' }).format(date);
  const moment = (date) => (date instanceof Date ? [{ text: long(date), datetime: date.toISOString() }] : []);
  const authors = (await articleAuthors(entry, type, site, getEntries))
    .flatMap(({ name, path }, at) => [...(at > 0 ? [{ text: ', ' }] : []), { text: name, url: path === null ? null : `${base}${path}` }]);
  const date = moment(entry.data?.date);
  const modified = moment(entry.data?.modified);
  return {
    authors,
    date,
    // A change on the day the post was published says nothing the date does not.
    modified: modified[0]?.text === date[0]?.text ? [] : modified,
    category: await categoryOf(entry, type, site, { base, getEntries, getEntry }),
  };
}

// An article's category, by its name, with its page's address where it has one.
async function categoryOf(entry, type, site, { base, getEntries, getEntry }) {
  const references = isArticle(type) ? entry.data?.[CATEGORY] ?? [] : [];
  if (references.length === 0) return [];
  const [term] = (await getEntries(references)).filter(Boolean);
  if (!term) return [];
  const path = await pageOf(term, site.taxonomies?.[CATEGORY] ?? null, getEntry);
  return [{ text: term.data.name, url: path === null ? null : `${base}${path}` }];
}

// A term's page's address, as term-pages.js gives it: only a term at its collection's root
// has one, a term of the site's main language, at its taxonomy's address with its slug, or
// its path, its parents' slugs from the top and its own; null where the taxonomy declares
// no address, or a parent is not there.
async function pageOf(term, taxonomy, getEntry) {
  if (!taxonomy?.address || term.id.includes('/')) return null;
  const slugs = [term.id];
  for (let parent = term.data.parent; parent && slugs.length < 100;) {
    const found = await getEntry(parent);
    if (!found || slugs.includes(found.id)) return null;
    slugs.unshift(found.id);
    parent = found.data.parent;
  }
  return taxonomy.address.replace('{slug}', term.id).replace('{path}', slugs.join('/'));
}
