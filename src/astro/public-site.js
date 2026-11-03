// The public site a build is made for: the language the site
// description declares, and the origin of the public host, which the build's
// environment names in KONZILO_ORIGIN. A live site sets it to its public host;
// locally the site's configuration sets it to the address Astro's dev server
// answers at. A preview's build is made for the same origin as the public
// site's, so a post's address on the public host is the same in it.
//
// Content files keep paths from the site's root; only the built
// pages make them absolute, from the origin, as `new URL(path, origin)` or
// `new URL(path, Astro.site)` does.

import { resolve } from 'node:path';
import { languageTag, SITE_DESCRIPTION_FILE } from '../site-description.js';
import { describedSite, pageLanguage } from './languages.js';

// The variable of the build's environment that names the public host.
export const ORIGIN = 'KONZILO_ORIGIN';

// The origin of the public host the build is made for: `https://` and the
// host, with a port where it is not 443, or `http://localhost` with a port,
// which browsers treat as secure, for a local copy. Throws, naming what to set,
// when the environment names none, or names something else.
export function origin(environment = process.env) {
  const value = environment[ORIGIN];
  const example = 'such as https://www.example.com';
  if (value === undefined || value === '') {
    throw new Error(`Konzilo builds every page for the site's public host: set ${ORIGIN} to the origin of the public host the site is built for, ${example}`);
  }
  let url = null;
  try {
    url = new URL(value);
  } catch {
    // Not an address at all.
  }
  const local = url !== null && url.protocol === 'http:' && url.hostname === 'localhost';
  if (url === null || !(url.protocol === 'https:' || local) || url.origin !== value) {
    throw new Error(`${ORIGIN} must be the origin of the public host the site is built for, https:// and the host in lowercase with no path, ${example}, not ${JSON.stringify(value)}`);
  }
  return value;
}

// Whether a build below `base` is the public site's, which is built at the
// root, and not a preview's, which is built below a base of its own.
export function isPublicBuild(base) {
  return base === '/';
}

const made = new Map();

// What a site's templates, and the core's own components, need to know of
// the public site: `{ locale, languageTag, origin }`, the site's language as
// its locale (null when the description declares none) and as its
// language tag, and the public host's origin. Given `url`, Astro.url, the
// language is that of the page at the address: on a site in
// several languages the language of its prefix below the site's base, or
// the main language for a page below none; without one, and on a site in one
// language, the site's own. It reads the site's own description,
// site-description.json at the root of the site repository, once per
// process, as the collections do: restart Astro's dev server when the
// description changes.
export function publicSite(url = null) {
  const file = resolve(SITE_DESCRIPTION_FILE);
  const host = origin();
  const key = `${file}\n${host}`;
  if (!made.has(key)) {
    const { language, languages } = describedSite();
    made.set(key, { site: Object.freeze({ locale: language, languageTag: languageTag(language), origin: host }), languages });
  }
  const { site, languages } = made.get(key);
  if (url === null || languages.length <= 1) return site;
  // Below the base a build is made for, which Vite gives the site's pages.
  const { locale } = pageLanguage(url.pathname, languages, import.meta.env?.BASE_URL ?? '/');
  return Object.freeze({ locale, languageTag: languageTag(locale), origin: host });
}
