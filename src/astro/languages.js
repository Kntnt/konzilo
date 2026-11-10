// The languages of a site's pages: the language a page is in, by
// its address, the language of an entry and its public address, the start
// page of each language, an entry's translations among its collection's
// entries, and the entries of the collections `settings` and `menus` that
// hold the settings and the menus of a language. On a site in several
// languages every page sits under its language's prefix, each post's entry
// is `<tag>/<slug>`, or `<tag>/<path>` in a hierarchical type, each
// language has a settings entry by its tag and a menu entry `<tag>/<menu>`
// for each menu (collections.js); on a site in one language, or none, an
// entry's id is its slug or path, the settings' one entry is `site` and a
// menu's entry its name, as before. It also gives the address of a type's
// posts in a language.
//
// Free of Astro's own modules, so that the integration and the tests read it
// too; site-settings.js and site-languages.js read the entries with Astro's
// own functions.

import { resolve } from 'node:path';
import { publicAddress } from '../format/addresses.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE, TRANSLATION_KEY } from '../site-description.js';

// The settings' one entry on a site in one language, or none.
export const SETTINGS_ENTRY = 'site';

const read = new Map();

// The site's description, as checked: its own, site-description.json at the
// root of the site repository, read once per process, as the collections
// do; restart Astro's dev server when it changes.
export function describedSite() {
  const file = resolve(SITE_DESCRIPTION_FILE);
  if (!read.has(file)) read.set(file, readSiteDescription(file));
  return read.get(file);
}

// The site's languages, as the site description reads them, each
// { locale, tag, prefix, main }, the main language first: one with no
// prefix on a site in one language, and none on a site that declares none.
export function siteLanguages() {
  return describedSite().languages;
}

// The language of the page at `path`, an address's path, below the site's
// `base`, `/` or a preview's, among the site's `languages`: on a site in
// several, the language whose prefix is the first segment below the base,
// or the main language for a page below none, such as the site's root; on a
// site in one language, that one; null on a site that declares none.
export function pageLanguage(path, languages, base = '/') {
  if (languages.length === 0) return null;
  const root = base.endsWith('/') ? base : `${base}/`;
  const below = path.startsWith(root) ? path.slice(root.length) : path.replace(/^\/+/, '');
  const first = below.split('/')[0].toLowerCase();
  return languages.find((language) => language.prefix !== null && language.prefix === first) ?? languages[0];
}

// The address a type's posts have on the site's pages, as the site
// description declares it (`type`, as checked), or null for a type without
// one: on a site in several languages, the address in `language`, the main
// language's locale.
export function typeAddress(type, language) {
  return type.address !== null && typeof type.address === 'object' ? type.address[language] ?? null : type.address;
}

// The entry of the collection `settings` that holds the settings of
// `language`, one of the site's `languages`, or null on a site that
// declares none.
export function settingsEntry(language, languages) {
  return languages.length > 1 ? language.tag : SETTINGS_ENTRY;
}

// The entry of the collection `menus` that holds the menu `menu`, by its
// name, in `language`.
export function menuEntry(menu, language, languages) {
  return languages.length > 1 ? `${language.tag}/${menu}` : menu;
}

// The language of an entry of a post type's or a taxonomy's collection, by
// its id, among the site's `languages`: on a site in several, the language
// whose tag is the folder the entry's file is in, or null for a folder of no
// language of the site's; on a site in one language, that one; null on a
// site that declares none.
export function entryLanguage(id, languages) {
  if (languages.length <= 1) return languages[0] ?? null;
  const tag = id.split('/')[0];
  return languages.find((language) => language.tag === tag) ?? null;
}

// An entry's slug, or its path in a hierarchical type, within its
// language's folder: its id without the folder on a site in several
// languages, and its id on any other.
export function entryName(id, languages) {
  return languages.length > 1 ? id.slice(id.indexOf('/') + 1) : id;
}

// An entry's public address, a path from the site's root, from its type
// (the site description's, as checked) and its id: its language's prefix
// and its type's address in that language, with its slug or path; null for a type without an address, or an entry in a folder of no
// language of the site's.
export function entryAddress(type, id, languages) {
  if (type.address === null) return null;
  const language = entryLanguage(id, languages);
  if (languages.length > 1 && language === null) return null;
  return publicAddress(type, entryName(id, languages), language);
}

// The address of a language's start page, a path from the site's root: its
// prefix on a site in several languages, and the root on any other.
export function startAddress(language, languages) {
  return languages.length > 1 && language ? `/${language.prefix}/` : '/';
}

// The members of an entry's translation set among `entries`, the entries of
// its collection the build has, in the order of the site's `languages`, the
// entry itself among them: those with its translation key, each in a
// language of the site's. An entry without a key, as on a site in one
// language, is alone.
export function translationsAmong(entry, entries, languages) {
  const key = entry.data?.[TRANSLATION_KEY];
  if (languages.length <= 1 || !key) return [entry];
  const order = (one) => languages.indexOf(entryLanguage(one.id, languages));
  return entries.filter((one) => one.data?.[TRANSLATION_KEY] === key && order(one) !== -1).sort((a, b) => order(a) - order(b));
}

// Whether search engines are told of an entry's page: unless the entry of a
// type (the site description's, as checked) asks in its search and sharing
// fields to be kept from them, `noindex`, or names a canonical address other
// than its page's own, its address in `languages` on the public host
// `origin`: its page is then a copy of the page at that address.
export function indexed(entry, type, languages, origin) {
  const seo = type.fields.find((field) => field.kind === 'seo');
  const own = seo ? entry.data?.[seo.name] : undefined;
  if (own?.noindex === true) return false;
  if (!own?.canonical) return true;
  const address = entryAddress(type, entry.id, languages);
  return Boolean(origin) && address !== null && own.canonical === new URL(address, origin).href;
}

// The pages in each language that search engines are told an entry's page
// is in, which its head links with `hreflang` and the sitemap
// gives it as its alternates, so that the two agree: the members of its
// translation set among `entries`, the entries of its collection the build
// has, of its type `type`, as translationsAmong() gives them, the entry
// itself among them, each { language, entry, address }, but a member
// without an address and one kept from search engines (indexed(), on the
// public host `origin`). None on a site in one language, or for an entry
// kept from them itself; an entry without a translation has itself alone.
export function alternatesAmong(entry, entries, type, languages, origin) {
  if (languages.length <= 1 || !indexed(entry, type, languages, origin)) return [];
  return translationsAmong(entry, entries, languages)
    .filter((member) => indexed(member, type, languages, origin))
    .map((member) => ({ language: entryLanguage(member.id, languages), entry: member, address: entryAddress(type, member.id, languages) }))
    .filter(({ address }) => address !== null);
}

// A language's own name, in itself, as a language switcher shows it: the
// name of its language subtag (`Svenska`), or of its whole tag where the
// site has two variants of the language and its prefix is the tag (`British
// English`), with a capital first letter, as a label stands alone.
export function languageName(language) {
  const code = language.prefix?.includes('-') ? language.tag : language.tag.split('-')[0];
  const name = new Intl.DisplayNames([language.tag], { type: 'language' }).of(code) ?? language.tag;
  return name.charAt(0).toLocaleUpperCase(language.tag) + name.slice(1);
}
