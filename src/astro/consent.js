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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUES } from '../catalogues.js';
import { CONSENT_SCRIPT_LIFETIME, CONSENT_SCRIPTS, CONSENT_STYLESHEET, consentScriptPath } from '../consent/registry.js';
import { consentScript } from '../consent/script.js';
import { CATEGORIES, categoryDescription, CONSENT_FILE, CONSENT_GROUP, textsOf } from '../format/consent.js';
import { RESERVED_PREFIX } from '../site-description.js';
import { isPublicBuild, origin } from './public-site.js';
import { LAUNCHED } from './tag-manager.js';

// Where a page sends the record of each choice: the kind of request of the
// site's public endpoint for consent records.
export const CONSENT_RECORDS = `${RESERVED_PREFIX}consent`;

// The domain the client keeps the choice on, for every site below it, on a
// page of this build: the site description's `consent.domain` on a release
// built for the launched origin alone (KONZILO_LAUNCHED=1), whose host is
// at or below it; null on any other build, the pre-launch address, a
// preview and a local run, which keep a choice of their own. `command` is
// Astro's, `base` the build's, `domain` the description's. Returns
// { domain, warning }, the warning where the release's host is not at or
// below the domain.
export function consentDomain({ command, base, domain, environment = process.env }) {
  if (domain === null || command !== 'build' || !isPublicBuild(base, environment) || environment[LAUNCHED] !== '1') return { domain: null, warning: null };
  const host = new URL(origin(environment)).hostname;
  if (host === domain || host.endsWith(`.${domain}`)) return { domain, warning: null };
  return { domain: null, warning: `the site description keeps the consent choice on ${domain}, which the public host ${host} is neither at nor below, so this release keeps it on its own host` };
}

// The input of the consent's markup functions for a page of the site.
//
// `registry`: the registry as Astro's collection `consent` hands it out.
// `settings`: the site settings, in the page's language, whose legal pages
// the banner and the footer controls link to and whose consent texts, with
// the categories' names and descriptions, the page shows; the registry's,
// the main language's, where the settings have none. `site`:
// { languageTag, base, origin }, the page's language tag, the base its
// pages are below and the origin of the public host the build is for,
// whose host an item stored on it is named by. The core's own words come
// from its catalogues, in the page's language (ADR 0066).
export function consentInput(registry, settings, { languageTag, base = '/', origin = null }) {
  const own = settings?.[CONSENT_GROUP];
  const texts = own
    ? { ...textsOf(own), categories: Object.fromEntries(CATEGORIES.map((id) => [id, { name: own[`${id}Name`], description: categoryDescription(id, own, registry.departures) }])) }
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
    catalogues: CATALOGUES,
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

// The consent's default stylesheet, served beside the scripts.
const STYLESHEET = fileURLToPath(new URL('../consent/consent.css', import.meta.url));

// The consent scripts of the site for pages it does not build, one per
// language, and their default stylesheet, by their addresses on the site
// (src/consent/script.js): /_konzilo/consent/<language>.js, the language's
// prefix on a site in several, else its language subtag, and
// /_konzilo/consent/consent.css; none while the content folder holds no
// registry. `folder` is the content folder the build reads, `languages`
// the site's, `origin` the public host's, which the legal pages are linked
// on, and `domain` the shared domain the choice is kept on, or null. The
// pages are another system's, so they send no records: the site's endpoint
// takes a record only from its own pages.
export function consentScriptFiles({ folder, languages = [], origin: host, domain = null }) {
  const read = (path) => {
    const file = join(folder, path);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  };
  const registry = read(CONSENT_FILE);
  if (registry === null) return new Map();
  const several = languages.length > 1;
  const absolute = (page) => page && { ...page, href: new URL(page.href, host).href };
  const files = new Map();
  for (const language of languages.length > 0 ? languages : [{ tag: 'en', prefix: null }]) {
    const name = several ? language.prefix : language.tag.split('-')[0].toLowerCase();
    const input = consentInput(registry, read(several ? `settings/${language.tag}.json` : 'settings.json'), { languageTag: language.tag });
    const legalPages = { privacyPolicy: absolute(input.legalPages.privacyPolicy), cookiePolicy: absolute(input.legalPages.cookiePolicy) };
    files.set(consentScriptPath(name), consentScript({ ...input, legalPages, host: null }, { domain }));
  }
  files.set(`${CONSENT_SCRIPTS}${CONSENT_STYLESHEET}`, readFileSync(STYLESHEET, 'utf8'));
  return files;
}

// Write the consent scripts and their stylesheet into the release at
// `dir`, as consentScriptFiles() gives them; returns their addresses.
export function writeConsentScripts(dir, given) {
  const files = consentScriptFiles(given);
  for (const [address, contents] of files) {
    const file = join(fileURLToPath(dir), address);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, contents);
  }
  return [...files.keys()];
}

// The headers the consent scripts and their stylesheet are served with, as
// a section of the release's `_headers` (security-headers.js): a short
// lifetime in every cache, so that a new consent revision reaches a page
// that is itself cached for days within minutes.
export const CONSENT_SCRIPT_HEADERS = Object.freeze({ path: `${CONSENT_SCRIPTS}*`, headers: [['Cache-Control', `public, max-age=${CONSENT_SCRIPT_LIFETIME}`]] });

// Astro's dev server: each consent script and the stylesheet, made from the
// content folder at each request, as the public host serves them.
export function devConsentScripts(given) {
  return (incoming, outgoing, next) => {
    const address = new URL(incoming.url, 'http://dev').pathname;
    if (!address.startsWith(CONSENT_SCRIPTS) || incoming.method !== 'GET') return next();
    const contents = consentScriptFiles(given()).get(address);
    if (contents === undefined) return next();
    outgoing.writeHead(200, { 'Content-Type': `${address.endsWith('.css') ? 'text/css' : 'text/javascript'}; charset=utf-8`, [CONSENT_SCRIPT_HEADERS.headers[0][0]]: CONSENT_SCRIPT_HEADERS.headers[0][1] });
    outgoing.end(contents);
  };
}
