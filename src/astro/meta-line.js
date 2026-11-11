// What a post's meta line shows (meta-line.js, ADR 0062): the values of its variables, as
// a template's helper hands them on, each a list of pieces, { text, url, datetime }, none
// where the post has no value.
//
// - `authors`: an article's authors, in the order its editor gave them (authors.js), each
//   linked to its page where the authors taxonomy declares an address, a comma between;
// - `date` and `modified`: the post's date and its last change, as a long date in the
//   page's language, with the moment, the last change only where it is on a later day than
//   the date;
// - `category`: an article's category by its name, linked to its page where the category
//   taxonomy declares an address.

import { CATEGORY, isArticle } from '../format/built-in-types.js';
import { articleAuthors } from './authors.js';
import { termsWithPages } from './term-pages.js';

// The values of a post's variables. `entry`: Astro's entry; `type`: its type as the site
// description `site` (as checked) reads it; `base`: the site's base, which a preview's build
// moves, without its last slash; `day(date)`: a date as a long date in the page's language
// (longDate() in helpers.js); `getEntries` and `getCollection`: Astro's own.
export async function metaLineValues(entry, type, { site, base, day, getEntries, getCollection }) {
  const moment = (date) => (date instanceof Date ? [{ text: day(date), datetime: date.toISOString() }] : []);
  const authors = (await articleAuthors(entry, type, site, getEntries))
    .flatMap(({ name, path }, at) => [...(at > 0 ? [{ text: ', ' }] : []), { text: name, url: path === null ? null : `${base}${path}` }]);
  const date = moment(entry.data?.date);
  const modified = moment(entry.data?.modified);
  return {
    authors,
    date,
    // A change on the day the post was published says nothing the date does not.
    modified: modified[0]?.text === date[0]?.text ? [] : modified,
    category: await categoryOf(entry, type, site, { base, getEntries, getCollection }),
  };
}

// An article's category, by its name, with its page's address where it has one, as
// term-pages.js gives it.
async function categoryOf(entry, type, site, { base, getEntries, getCollection }) {
  const references = isArticle(type) ? entry.data?.[CATEGORY] ?? [] : [];
  if (references.length === 0) return [];
  const [term] = (await getEntries(references)).filter(Boolean);
  if (!term) return [];
  const taxonomy = site.taxonomies?.[CATEGORY] ?? null;
  const page = taxonomy?.address ? termsWithPages(taxonomy, await getCollection(taxonomy.collection)).find((one) => one.entry.id === term.id) : undefined;
  return [{ text: term.data.name, url: page ? `${base}${page.address}` : null }];
}
