// The breadcrumbs of a page, as Head.astro writes them into the
// page's structured data, Breadcrumbs.astro shows them, and a site's
// template reaches them, `@kntnt/konzilo/astro/breadcrumbs`, for a design
// that writes its own:
//
//   import { breadcrumbs } from '@kntnt/konzilo/astro/breadcrumbs';
//   const levels = await breadcrumbs(entry, Astro.url);
//   const own = await breadcrumbs(null, Astro.url, { title: 'Search' });
//
// breadcrumb-levels.js says what the levels are.

import { getCollection } from 'astro:content';
import { breadcrumbLevels, breadcrumbTexts } from './breadcrumb-levels.js';
import { publicSite } from './public-site.js';
import { describedSite } from './languages.js';

// The levels of the page at `url`, Astro.url, that shows `entry`, as
// Astro hands a template one, or of a page of the site's own, null, named
// `title`: each { name, path, href }, its name, its address from the site's
// root and its link below the site's base, which a preview's build moves
//; none for the start page. `texts`: the site's own texts over
// the core's (BREADCRUMB_TEXTS).
export async function breadcrumbs(entry, url, { title, texts = {} } = {}) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const { pathname } = url;
  const path = base !== '' && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
  const read = import.meta.env.DEV ? new Map() : built;
  const getEntry = async (collection, id) => (await entriesOf(collection, read)).get(id);
  const levels = await breadcrumbLevels({ entry, path, title }, { site: describedSite(), texts: breadcrumbTexts(publicSite(url).locale, texts), getEntry });
  return levels.map((level) => ({ ...level, href: `${base}${level.path}` }));
}

// Each collection's entries by ID, as a promise, read once in a build,
// whose content does not change while it runs; Astro's dev server, whose
// content does, reads them for each page. Astro's own getEntry() warns of
// every ID it does not find, and most addresses above a page have no post.
const built = new Map();

function entriesOf(collection, read) {
  if (!read.has(collection)) read.set(collection, getCollection(collection).then((entries) => new Map(entries.map((entry) => [entry.id, entry]))));
  return read.get(collection);
}
