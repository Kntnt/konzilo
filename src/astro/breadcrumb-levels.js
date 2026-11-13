// The breadcrumbs of a page: the levels it sits at, from its
// address alone, which its structured data holds as a BreadcrumbList
// (structured-data.js) and Breadcrumbs.astro shows on screen:
//
// 1. the start page, named in the page's language (breadcrumbTexts()), or,
//    where an Admin chose a page as the start page, by that page's name in
//    breadcrumbs where it has one;
// 2. each shorter address the page's address starts with, `/a/` and
//    `/a/b/` for `/a/b/c/`, at which a post of the build answers, of any
//    type, named by its name in breadcrumbs (`breadcrumb`), else its
//    title;
// 3. the page itself, named the same way, or, a term's page, by
//    the term's name, or, a page of the site's own, by the title it is
//    given.
//
// An address at which no post answers is left out: a type's prefix, a term
// or a list has no level of its own. On a site in several languages, the levels stay within the page's language: the first is the
// language's start page, the language's prefix is no level of its own, and
// each level above is a post in the page's language. So a page an editor makes at `/news/`
// is the level above every post below `/news/`, with no setting. The start
// page has no breadcrumbs, and nor has a page of the site's own that gives
// no title.
//
// Free of Astro's own modules, so that Head's search-and-sharing.js and the
// tests read it too: it finds a post by its entry through the `getEntry` it
// is given, Astro's from astro:content in a build (breadcrumbs.js).

import { SOURCE_LANGUAGE, textsOf } from '../catalogues.js';
import { START_ENTRY } from '../format/start-page.js';
import { entryAddress as addressIn, pageLanguage, startAddress, typeAddress } from './languages.js';
import { taxonomyWithPages } from './term-pages.js';

// What a visitor reads of breadcrumbs, in the catalogues (ADR 0066) under
// `site.breadcrumbs.`: the start page's name, `home`, and the label of the
// navigation that holds them, `label`. A site gives texts of its own, by these
// names, to Breadcrumbs.astro as `texts` and to Head.astro as `breadcrumbTexts`.
const BREADCRUMB_TEXTS = 'site.breadcrumbs.';
const NAMES = Object.keys(textsOf(SOURCE_LANGUAGE, BREADCRUMB_TEXTS));

// The texts in the language of a site in `locale` (null for none), with
// those the site gives over them.
export function breadcrumbTexts(locale, given = {}) {
  for (const name of Object.keys(given)) {
    if (!NAMES.includes(name)) throw new Error(`Konzilo: breadcrumbs have no text called ${name}; their texts are ${NAMES.join(' and ')}`);
  }
  return Object.fromEntries(Object.entries(textsOf(locale, BREADCRUMB_TEXTS)).map(([name, text]) => [name, given[name] ?? text]));
}

// The levels of a page, from the start page to the page itself, each
// { name, path }, its name and its address from the site's root; none for
// the start page. `entry`: the entry the page shows, as Astro hands a
// template one, at its public address, a term at its page's, or null for a
// page of the site's own, at `path`, its path from the site's root, named
// `title`; a post's or a term's later page of a list has the
// levels of its first. `site`: the site description, as checked; `texts`:
// breadcrumbTexts() of the site; `getEntry`: Astro's, from astro:content.
export async function breadcrumbLevels({ entry = null, path, title }, { site, texts, getEntry }) {
  const own = entry === null ? { name: title, path } : { name: nameOf(entry), path: (await entryAddress(entry, site, getEntry)) ?? path };
  const languages = site.languages ?? [];
  const language = pageLanguage(own.path, languages);
  const home = startAddress(language, languages);
  if (own.path === '/' || own.path === home || !own.name) return [];
  const segments = own.path.split('/').filter(Boolean);
  const above = [];
  // Below a language's prefix, which is no level of its own.
  const first = languages.length > 1 && home !== '/' && own.path.startsWith(home) ? 2 : 1;
  for (let count = first; count < segments.length; count += 1) {
    const address = `/${segments.slice(0, count).join('/')}/`;
    const found = await postAt(address, site, getEntry, language);
    if (found) above.push({ name: nameOf(found), path: address });
  }
  const chosen = languages.length > 1 ? null : await startEntryOf(site, getEntry);
  return [{ name: chosen?.data.breadcrumb || texts.home, path: home }, ...above, own];
}

// The page an Admin chose as the start page, its entry, or null.
async function startEntryOf(site, getEntry) {
  for (const type of Object.values(site.types)) {
    if (type?.address == null) continue;
    const found = await getEntry(type.collection, START_ENTRY);
    if (found) return found;
  }
  return null;
}

// A post's name in breadcrumbs: its own, else its title; a term's, its
// name.
function nameOf(entry) {
  return entry.data.breadcrumb || entry.data.title || entry.data.name;
}

// The public address of the post an entry holds, in its language, or of
// the page of the term it holds, in a taxonomy with an address, its
// parents' slugs from `getEntry` for `{path}`; null for a type or a
// taxonomy without one.
async function entryAddress(entry, site, getEntry) {
  const type = Object.values(site.types).find((declared) => declared?.collection === entry.collection);
  if (type) return addressIn(type, entry.id, site.languages ?? []);
  const taxonomy = taxonomyWithPages(site, entry);
  if (taxonomy === null) return null;
  const slugs = [entry.id];
  for (let next = entry; taxonomy.address.includes('{path}') && next?.data.parent && slugs.length < 100;) {
    next = await getEntry(taxonomy.collection, next.data.parent.id ?? next.data.parent);
    if (next) slugs.unshift(next.id);
  }
  return taxonomy.address.replace('{slug}', entry.id).replace('{path}', slugs.join('/'));
}

// The entry of the post that answers at `address`, of the first type, in the
// site description's order, whose address it fits, or null; on a site in
// several languages, a post in `language`, at its prefix.
async function postAt(address, site, getEntry, language) {
  const several = (site.languages ?? []).length > 1;
  for (const type of Object.values(site.types)) {
    const inLanguage = type ? typeAddress(type, several ? language.locale : site.language) : null;
    const declared = inLanguage === null ? null : several ? `/${language.prefix}${inLanguage}` : inLanguage;
    const name = declared === null ? null : nameAt(address, declared);
    const found = name === null ? undefined : await getEntry(type.collection, several ? `${language.tag}/${name}` : name);
    if (found) return found;
  }
  return null;
}

// The slug or path, the entry's ID, of the post a type's address `declared`
// gives `address`, or null where it gives none: a slug is one segment, a
// path one or more.
function nameAt(address, declared) {
  const [, prefix, kind, suffix] = declared.match(/^(.*)\{(slug|path)\}(.*)$/) ?? [];
  if (kind === undefined || address.length <= prefix.length + suffix.length || !address.startsWith(prefix) || !address.endsWith(suffix)) return null;
  const name = address.slice(prefix.length, address.length - suffix.length);
  const segments = name.split('/');
  return segments.includes('') || (kind === 'slug' && segments.length > 1) ? null : name;
}
