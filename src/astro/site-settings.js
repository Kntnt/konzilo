// The site settings and the menus a page shows, in the page's language, reached as `@kntnt/konzilo/astro/site-settings`. A site's layout
// reads them with the page's address, so that a page under a language's
// prefix shows that language's settings and menus, and every other page the
// main language's:
//
//   import { siteMenu, siteSettings } from '@kntnt/konzilo/astro/site-settings';
//   const settings = (await siteSettings(Astro.url)) ?? {};
//   const main = (await siteMenu('main', Astro.url)) ?? [];
//
// On a site in one language they are the settings' one entry, `site`, and
// the menu's entry by its name, as getEntry() gives them. The 404 page reads
// the page an Admin chose for it in its language the same way:
//
//   const chosen = await notFoundPage(Astro.url);

import { getCollection, getEntry } from 'astro:content';
import { menuEntry, pageLanguage, settingsEntry, siteLanguages } from './languages.js';

// The language of the page at `url`, Astro.url, as the site description
// reads it, below the site's base, which a preview's build moves; the main
// language without a URL, and null on a site that declares none.
export function languageOf(url = null) {
  const languages = siteLanguages();
  return url === null ? (languages[0] ?? null) : pageLanguage(url.pathname, languages, import.meta.env.BASE_URL);
}

// The site settings in the language of the page at `url`, as the
// collection `settings` types them: the site's identity, its own settings
// and Konzilo's groups; without a URL, the main language's, which hold the
// settings every language shares as well. Undefined before the first build
// has written them.
export async function siteSettings(url = null) {
  return (await getEntry('settings', settingsEntry(languageOf(url), siteLanguages())))?.data;
}

// The entries of the menu `menu`, by its name, in the language of the page
// at `url`, each with its `title`, its `url` unless it only holds others, its
// `description` where it has one, and the entries under it, `items`;
// undefined while the site has no file of it.
export async function siteMenu(menu, url = null) {
  return (await getEntry('menus', menuEntry(menu, languageOf(url), siteLanguages())))?.data.items;
}

// The 404 page's entry of the collection `notFound` in the language of the
// page at `url`, Astro.url: the page an Admin chose, in
// the main language and below no prefix, and its translation, by the
// language's tag, in any other; undefined where none serves, as in a
// language the chosen page has no translation in, which then shows the
// site's plain text in that language, never another language's page.
export async function notFoundPage(url = null) {
  const language = languageOf(url);
  const id = siteLanguages().length <= 1 || language === null || language.main ? 'page' : language.tag;
  // Astro's getEntry() warns of every entry it does not find.
  return (await getCollection('notFound')).find((entry) => entry.id === id);
}
