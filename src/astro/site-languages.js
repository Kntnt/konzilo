// The languages of a site's pages, as a site's templates reach
// them, `@kntnt/konzilo/astro/languages`: everything a template needs to
// build each language's pages and link them, so that no template reads a
// path or a translation key itself.
//
//   import { entryPages, languageSwitcher, pageLanguage, startPages } from '@kntnt/konzilo/astro/languages';
//
// On a site in several languages every page sits under its language's
// prefix, the main language's too: a post at its prefix followed by its
// type's address in its language, `/sv/om-oss/`, and each language's start
// page at its prefix, `/sv/`. The site's root leads to the main language's
// start page (redirects.js). A post's translations are the posts of its set
// that the build has, and a missing translation has no page, so it is in
// neither the language switcher nor the hreflang links (Head.astro). On a
// site in one language, or none, every page is where it was before
// languages: a post at its type's address, the start page at the root. A
// translation kept from search engines (`noindex`) is in the switcher, and
// in neither the hreflang links nor the sitemap's alternates (alternates()).
//
// Each address here is a path from the site's root, as the content files
// keep them, and each `url` that path below the site's base, as a link on
// the page takes it, so that a preview's links stay in the preview.

import { getCollection } from 'astro:content';
import { textsIn } from 'virtual:konzilo/texts';
import { listPageAddress, searchPages } from '../format/addresses.js';
import {
  alternatesAmong, describedSite, entryAddress as addressOf, entryLanguage as languageOfId, languageName, pageLanguage as languageAt, siteLanguages, startAddress, translationsAmong,
} from './languages.js';
import { postPages } from './post-lists.js';

// The site's languages, each { locale, tag, prefix, main }, the main
// language first: its locale (`sv_SE`), its language tag
// (`sv-SE`), the prefix of its pages' addresses (`sv`) and whether it is
// the main language. A site in one language has that one, with no prefix
// (null); a site that declares none has none.
export function languages() {
  return siteLanguages();
}

// The language of the page at `url`, Astro.url, by its address below the
// site's base: the language of its prefix, or the main language for a page
// below none, such as the 404 page; without a URL, the main language. Null
// on a site that declares none.
export function pageLanguage(url = null) {
  const all = siteLanguages();
  return url === null ? (all[0] ?? null) : languageAt(url.pathname, all, import.meta.env.BASE_URL);
}

// The language of an entry of a post type's or a taxonomy's collection, as
// Astro's getCollection() gives one. Null on a site that declares none.
export function entryLanguage(entry) {
  return languageOfId(entry.id, siteLanguages());
}

// An entry's public address, a path from the site's root, or null for an
// entry of a type without an address, or of no type of the site's.
export function entryAddress(entry) {
  const type = typeOf(entry.collection);
  return type === null ? null : addressOf(type, entry.id, siteLanguages());
}

// An entry's address below the site's base, as a link takes it, or null.
export function entryUrl(entry) {
  const address = entryAddress(entry);
  return address === null ? null : based(address);
}

// The address of a language's start page below the site's base, as a link
// takes it: its prefix on a site in several languages, else the base itself.
// Without a language, the main language's.
export function startPage(language = pageLanguage()) {
  return based(startAddress(language, siteLanguages()));
}

// The entries of a collection in a language, by its name: those in the
// language's folder on a site in several languages, and every entry on any
// other.
export async function entriesIn(collection, language = pageLanguage()) {
  const all = siteLanguages();
  const entries = await getCollection(collection);
  return all.length > 1 ? entries.filter((entry) => languageOfId(entry.id, all) === language) : entries;
}

// What getStaticPaths() of a template gives Astro for each language's start
// page, at a route `[...<param>].astro`: on a site in several languages a
// page at each prefix, and on any other one at the root. Each page's props
// are { language }, its language, null on a site that declares none.
export function startPages(param = 'start') {
  const all = siteLanguages();
  if (all.length <= 1) return [{ params: { [param]: undefined }, props: { language: all[0] ?? null } }];
  return all.map((language) => ({ params: { [param]: language.prefix }, props: { language } }));
}

// What getStaticPaths() of a template gives Astro for each post of a
// collection, by the collection's name, at a route `[...<param>].astro`: a
// page at each post's public address, and, for a post whose post list has
// pages of its own, one at `<address>page/<n>/` for each later
// page its list fills (postPages() of post-lists.js), its props { entry,
// page }, the post's entry and the page, from 1, which the route gives Body
// and Head. A type without an address gives none.
export async function entryPages(collection, param = 'path') {
  return (await postPages(await getCollection(collection))).flatMap(({ entry, page }) => {
    const address = entryAddress(entry);
    if (address === null) return [];
    return [{ params: { [param]: listPageAddress(address, page).replace(/^\/|\/$/g, '') }, props: { entry, page } }];
  });
}

// An entry's translations: the members of its translation set the build
// has, in the order of the site's languages, the entry itself among them,
// each { language, entry, address, url }, `address` and `url` null for a
// type without an address. An entry without a translation has itself
// alone.
export async function translations(entry) {
  const all = siteLanguages();
  const members = translationsAmong(entry, all.length > 1 ? await getCollection(entry.collection) : [entry], all);
  return members.map((member) => {
    const address = entryAddress(member);
    return { language: languageOfId(member.id, all), entry: member, address, url: address === null ? null : based(address) };
  });
}

// The page at `url`, Astro.url, in each of the site's languages it is in,
// in the order of the languages, the page itself among them, each
// { language, address, url, current }: a post's, `entry`, its translations,
// a language's start page, every language's start page, and a language's
// search page, every language's search page. Nothing on a site in
// one language, nor for a page in its own language alone, nor for a page
// that is none of these, such as the 404 page.
export async function counterparts(url, entry = null) {
  const all = siteLanguages();
  if (all.length <= 1) return [];
  if (entry !== null && entry !== undefined) {
    const members = (await translations(entry)).filter((member) => member.address !== null);
    if (members.length <= 1) return [];
    return members.map(({ language, address, url: link, entry: member }) => ({ language, address, url: link, current: member.id === entry.id }));
  }
  const here = languageAt(url.pathname, all, import.meta.env.BASE_URL);
  const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
  const searches = searchPages(describedSite());
  const addressOfIn = based(startAddress(here, all)) === path ? (language) => startAddress(language, all)
    : searches.length > 0 && based(searches[all.indexOf(here)]) === path ? (language) => searches[all.indexOf(language)]
      : null;
  if (addressOfIn === null) return [];
  return all.map((language) => {
    const address = addressOfIn(language);
    return { language, address, url: based(address), current: language === here };
  });
}

// The page at `url`, Astro.url, in each language search engines are told
// it is in, as Head links them with `hreflang` and the sitemap gives them
// as its alternates (sitemap.js), each as counterparts() gives it: a post's
// translations, but one kept from search engines (`noindex`), as
// alternatesAmong() of languages.js gives them, and a language's start
// page every language's. Nothing where counterparts() gives nothing, nor
// for a post kept from search engines itself, nor for one whose
// translations all are, which a language switcher still links to, nor for
// the search page, which is kept from them.
export async function alternates(url, entry = null) {
  const all = siteLanguages();
  if (all.length <= 1) return [];
  if (entry === null || entry === undefined) {
    const path = url.pathname.endsWith('/') ? url.pathname : `${url.pathname}/`;
    return searchPages(describedSite()).some((address) => based(address) === path) ? [] : counterparts(url);
  }
  const type = typeOf(entry.collection);
  if (type === null) return [];
  const members = alternatesAmong(entry, await getCollection(entry.collection), type, all);
  if (members.length <= 1) return [];
  return members.map(({ language, address, entry: member }) => ({ language, address, url: based(address), current: member.id === entry.id }));
}

// The core's texts a site may give its own of (site-texts.js), in the
// language of the page at `url`, Astro.url, as the core's components show
// them: { languageSwitcher, emptyList, forms, search }, the site's own over
// the core's, such as `search.title`, a search page's title and heading.
export function pageTexts(url = null) {
  return textsIn(pageLanguage(url)?.locale ?? null);
}

// What a language switcher shows on the page at `url`, Astro.url, of the
// entry `entry` it shows, if any: { label, links }, its label in the page's
// language (site-texts.js), and each language the page is in
// (counterparts()), { language, name, url, current }, by the language's own
// name. Null where the page is in one language alone, which a switcher then
// leaves out.
export async function languageSwitcher(url, entry = null) {
  const links = await counterparts(url, entry);
  if (links.length === 0) return null;
  const language = links.find((link) => link.current)?.language ?? pageLanguage(url);
  return {
    label: textsIn(language?.locale ?? null).languageSwitcher,
    links: links.map(({ language: one, url: link, current }) => ({ language: one, name: languageName(one), url: link, current })),
  };
}

// The site description's type whose collection is `collection`, or null.
function typeOf(collection) {
  return Object.values(describedSite().types).find((type) => type?.collection === collection) ?? null;
}

// A path from the site's root below the site's base.
function based(address) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}${address}`;
}
