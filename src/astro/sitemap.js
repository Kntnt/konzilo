// The site's sitemap, in the sitemap protocol
// (https://www.sitemaps.org/protocol.html): the start page, every
// published post of a type with an address and every term's page of a
// taxonomy with one, each at its current address on the public
// host; on a site in several languages, each language's start
// page, at its prefix, and every post at its address in its language, and
// not the root, which leads to the main language's start page. A post
// marked noindex is left out, and so is a post whose canonical address is
// not its own on the public host, which is a copy of a page elsewhere, and every
// address that redirects: a post's old and other addresses and the site's
// own rules are no page, and nor is a later page of a post list with pages
// of its own, which is noindex, nor a post below its `page/`. The
// content files hold only what the site publishes, so a post unpublished or
// erased leaves it at the next build.
//
// On a site in several languages each page carries its alternates, as
// Google reads them (https://developers.google.com/search/docs/specialty/
// international/localized-versions#sitemap), an `<xhtml:link
// rel="alternate" hreflang>` for the page in each language it is in, itself
// included, and `x-default` for the main language's, where it is in that
// one: a post the members of its translation set the build has, as its
// head links them (alternatesAmong() in languages.js), so that the two
// agree, and each language's start page every language's. A post alone
// in its set has itself alone. A post marked noindex, or canonical to
// another address, is no alternate either, and every alternate is a page
// the sitemap lists. A site in one
// language has none, and its sitemap no `xhtml` namespace.
//
// `lastmod` is a post's last change, else its date, where its type declares
// them; the start page has none. One file holds up to LIMIT addresses;
// beyond that, `/sitemap.xml` is a sitemap index of numbered files, each in
// the site's root, so that it may list any address on the site.

import { resolve } from 'node:path';
import { listPageOwners } from '../format/addresses.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE, TRANSLATION_KEY } from '../site-description.js';
import { alternatesAmong, entryAddress, indexed, startAddress } from './languages.js';
import { postListsIn } from './reader.js';
import { termsWithPages } from './term-pages.js';

// The address of the sitemap, or of its index.
export const SITEMAP = '/sitemap.xml';

// The most addresses one file of a sitemap may hold.
export const LIMIT = 50_000;

const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const XHTML = 'http://www.w3.org/1999/xhtml';

// The address of the `number`th file of a sitemap index, from 1.
export function numbered(number) {
  return `/sitemap-${number}.xml`;
}

// Whether an address is that of a numbered file of a sitemap index, which
// the site keeps for itself whether its sitemap has one or not (the rule
// data's `/sitemap-{n}.xml`).
export function isNumbered(address) {
  return /^\/sitemap-[1-9][0-9]*\.xml$/.test(address);
}

// The addresses the sitemap lists, from the site description's `types` and
// `taxonomies` and `languages` and `entries(collection)`, the entries of a
// collection as Astro's getCollection gives them, for the public host
// `origin`, which a post's canonical address is compared on: [{ path, lastmod,
// alternates }], `lastmod` a Date or undefined, the start page first, each
// language's in the languages' order, and the rest sorted by address, each
// term's page of a taxonomy with an address among them, without a lastmod.
// On a site in several languages each start page and post has
// `alternates`, [{ hreflang, path }], its page in each language, by the
// language's tag, in the languages' order, and `x-default` last.
export async function sitemapAddresses(types, entries, taxonomies = {}, languages = [], origin = null) {
  const several = languages.length > 1;
  const posts = [];
  const withPages = new Set();
  // Each term's page, its first page alone.
  for (const taxonomy of Object.values(taxonomies).filter((one) => one?.address != null)) {
    for (const { address } of termsWithPages(taxonomy, await entries(taxonomy.collection))) posts.push({ path: address });
  }
  for (const type of Object.values(types)) {
    if (type.address === null) continue;
    const kind = (wanted) => type.fields.find((field) => field.kind === wanted)?.name;
    const [modified, date] = ['modified', 'date'].map(kind);
    const all = await entries(type.collection);
    // Each translation set's members, found once for the whole collection.
    const sets = several ? Map.groupBy(all.filter((entry) => entry.data?.[TRANSLATION_KEY]), (entry) => entry.data[TRANSLATION_KEY]) : new Map();
    for (const entry of all) {
      const path = entryAddress(type, entry.id, languages);
      if (path === null) continue;
      if (postListsIn(entry.body).some((list) => list.pages === true)) withPages.add(path);
      if (!indexed(entry, type, languages, origin)) continue;
      const lastmod = (modified && entry.data[modified]) || (date && entry.data[date]) || undefined;
      if (!several) {
        posts.push({ path, lastmod });
        continue;
      }
      const members = alternatesAmong(entry, sets.get(entry.data?.[TRANSLATION_KEY]) ?? [entry], type, languages, origin);
      posts.push({ path, lastmod, alternates: members.map(({ language, address }) => ({ language, path: address })) });
    }
  }
  const listed = posts.filter(({ path }) => !listPageOwners(path).some((owner) => withPages.has(owner)));
  listed.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  if (!several) return [{ path: '/' }, ...listed];
  const starts = languages.map((language) => ({ language, path: startAddress(language, languages) }));
  const addresses = [...starts.map(({ path }) => ({ path, alternates: starts })), ...listed];
  const shown = new Set(addresses.map(({ path }) => path));
  return addresses.map(({ alternates, ...address }) => (alternates ? { ...address, alternates: hreflangs(alternates.filter(({ path }) => shown.has(path))) } : address));
}

// A page's alternates as the sitemap writes them, from its page in each
// language, [{ language, path }]: [{ hreflang, path }], each by its
// language's tag, and `x-default` for the main language's, where it is
// among them.
function hreflangs(pages) {
  const main = pages.find(({ language }) => language.main);
  return [...pages.map(({ language, path }) => ({ hreflang: language.tag, path })), ...(main ? [{ hreflang: 'x-default', path: main.path }] : [])];
}

// The files of the sitemap of `addresses` on the public host `origin`, by
// their addresses: SITEMAP alone, or, for more than `limit` addresses,
// SITEMAP as the index of the numbered files that hold them, `limit` each.
export function sitemapFiles(addresses, origin, limit = LIMIT) {
  if (addresses.length <= limit) return new Map([[SITEMAP, urlset(addresses, origin)]]);
  const files = new Map();
  const parts = [];
  for (let start = 0; start < addresses.length; start += limit) parts.push(addresses.slice(start, start + limit));
  files.set(SITEMAP, document('sitemapindex', parts.map((_, index) => ['  <sitemap>', `    <loc>${xml(origin + numbered(index + 1))}</loc>`, '  </sitemap>'])));
  parts.forEach((part, index) => files.set(numbered(index + 1), urlset(part, origin)));
  return files;
}

// The files of the site's own sitemap, for the public host `origin`, as
// Astro's getCollection gives each collection's entries. It reads the site
// description, site-description.json at the root of the site repository, as
// the collections do.
export async function siteSitemap(getCollection, origin) {
  const { types, taxonomies, languages } = readSiteDescription(resolve(SITE_DESCRIPTION_FILE));
  return sitemapFiles(await sitemapAddresses(types, (collection) => getCollection(collection), taxonomies, languages, origin), origin);
}

function urlset(addresses, origin) {
  const linked = addresses.some(({ alternates }) => alternates?.length > 0);
  return document('urlset', addresses.map(({ path, lastmod, alternates = [] }) => [
    '  <url>',
    `    <loc>${xml(origin + path)}</loc>`,
    ...(lastmod === undefined ? [] : [`    <lastmod>${moment(lastmod)}</lastmod>`]),
    ...alternates.map(({ hreflang, path: at }) => `    <xhtml:link rel="alternate" hreflang="${xml(hreflang)}" href="${xml(origin + at)}"/>`),
    '  </url>',
  ]), linked ? ` xmlns:xhtml="${XHTML}"` : '');
}

function document(root, entries, namespaces = '') {
  return ['<?xml version="1.0" encoding="UTF-8"?>', `<${root} xmlns="${NAMESPACE}"${namespaces}>`, ...entries.flat(), `</${root}>`, ''].join('\n');
}

// A moment as the W3C's datetime gives it, to the second in UTC, as the
// content files write it.
function moment(date) {
  return date.toISOString().replace(/\.000Z$/, 'Z');
}

function xml(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
