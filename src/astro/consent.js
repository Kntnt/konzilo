// Konzilo's consent on a site it builds: what the integration's components,
// ConsentBanner.astro (the banner, the preferences dialog and the embeds'
// placeholders), ConsentControls.astro (the footer controls) and
// CookieDeclaration.astro (the cookie declaration), hand the consent's pure
// markup functions (src/consent/markup.js) from the service registry and
// the site settings, and the address the client sends records to.
//
// The components render everything a visitor reads into the page's HTML,
// in the page's language; the client (src/consent/client.js) only shows,
// hides and reads it. It is part of the integration's one script file of
// the site's own origin, and the page holds no inline code, so it works
// under a policy that allows no inline script.

import { CATEGORIES, CONSENT_GROUP, textsOf } from '../format/consent.js';
import { RESERVED_PREFIX } from '../site-description.js';

// Where a page sends the record of each choice: the kind of request of the
// site's public endpoint for consent records.
export const CONSENT_RECORDS = `${RESERVED_PREFIX}consent`;

// The input of the consent's markup functions for a page of the site.
//
// `registry`: the registry as Astro's collection `consent` hands it out.
// `settings`: the site settings, in the page's language, whose legal pages
// the banner and the footer controls link to and whose consent texts, with
// the categories' names and descriptions, the page shows; the registry's,
// the main language's, where the settings have none. `site`:
// { languageTag, base, origin }, the page's language tag, the base its
// pages are below and the origin of the public host the build is for,
// whose host an item stored on it is named by.
export function consentInput(registry, settings, { languageTag, base = '/', origin = null }) {
  const own = settings?.[CONSENT_GROUP];
  const texts = own
    ? { ...textsOf(own), categories: Object.fromEntries(CATEGORIES.map((id) => [id, { name: own[`${id}Name`], description: own[`${id}Description`] }])) }
    : registry.texts;
  const { privacyPolicy, cookiePolicy } = settings?.legalPages ?? {};
  return {
    registry,
    texts,
    legalPages: {
      privacyPolicy: privacyPolicy ? linkTo(privacyPolicy, base) : null,
      cookiePolicy: cookiePolicy ? linkTo(cookiePolicy, base) : null,
    },
    language: languageTag,
    host: origin ? new URL(origin).hostname : null,
  };
}

// A legal page of the site settings as a link, below the site's base.
export function linkTo(page, base) {
  return { title: page.title, href: `${base.replace(/\/$/, '')}${page.url}` };
}

// Whether the page at `pathname`, as Astro.url has it, is the legal page
// `page` of the site settings, below the site's base.
function isPage(pathname, page, base) {
  if (!page) return false;
  const normal = (path) => {
    try {
      return decodeURI(path).replace(/\/?$/, '/');
    } catch {
      return path;
    }
  };
  return normal(pathname) === normal(linkTo(page, base).href);
}

// Whether the page at `pathname` is the cookie policy the site settings
// choose, below the site's base.
export function isCookiePolicy(pathname, settings, base = '/') {
  return isPage(pathname, settings?.legalPages?.cookiePolicy, base);
}

// Whether the page at `pathname` is the privacy policy or the cookie policy
// the site settings choose, below the site's base: a legal page, where the
// banner stays hidden.
export function isLegalPage(pathname, settings, base = '/') {
  return isPage(pathname, settings?.legalPages?.privacyPolicy, base) || isCookiePolicy(pathname, settings, base);
}
