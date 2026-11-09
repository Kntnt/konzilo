// The service registry's format, for anything that makes a registry from a
// catalogue of its own: its fixed lists, the consent's own storage, the
// consent revision, and where a site serves its consent script for pages
// it does not build. content-format.md, "The service registry", describes
// the format; Konzilo's intake writes it as consent.json
// (src/format/consent.js).
//
// It runs where a site is built, in Node, for the revision's hash. The
// markup functions (markup.js) and the client (client.js) do not import it.
//
// This folder imports nothing outside itself.

import { createHash } from 'node:crypto';

// The consent categories, in the order a visitor meets them. Necessary is
// always on.
export const CATEGORIES = Object.freeze(['necessary', 'functional', 'statistics', 'marketing']);

// What a service stores in the visitor's browser is one of these kinds.
export const STORAGE_KINDS = Object.freeze(['cookie', 'localStorage', 'sessionStorage', 'other']);

// The kinds of request a service's hosts are reached by, each the source
// list of a directive of the security policy: script-src, frame-src,
// connect-src, img-src, style-src and font-src.
export const HOST_KINDS = Object.freeze(['scripts', 'frames', 'connections', 'images', 'styles', 'fonts']);

// What a transfer of personal data outside the EU and EEA rests on: an
// adequacy decision of the Commission (for the US, the provider's
// certification under the EU–US Data Privacy Framework), standard
// contractual clauses, or binding corporate rules.
export const SAFEGUARDS = Object.freeze(['adequacy', 'scc', 'bcr']);

// A lifetime: until the browser session ends, without an end, or an ISO
// 8601 duration of one unit, such as P12M or PT30M.
export const LIFETIME = /^(session|persistent|P[1-9][0-9]*[YMWD]|PT[1-9][0-9]*[HMS])$/;

// The consent's own storage item: the name the client keeps the visitor's
// choice under, in local storage, or in a cookie of that name on a shared
// domain, and the months a choice holds, a refusal too. The client's own
// defaults (client.js) are the same.
export const CONSENT_STORAGE = Object.freeze({ name: 'konzilo-consent', months: 12 });

// Where a site serves its consent script, one per language, for pages it
// does not build: `<CONSENT_SCRIPTS><language>.js`, such as
// /_konzilo/consent/en.js, with its default stylesheet beside it,
// `<CONSENT_SCRIPTS>consent.css`. A page on another host loads them from
// the site's own host.
export const CONSENT_SCRIPTS = '/_konzilo/consent/';

// The stylesheet's name beside the scripts.
export const CONSENT_STYLESHEET = 'consent.css';

// How long a browser or a cache may keep the consent script, in seconds, so
// that a new consent revision reaches a page that is itself cached for days
// within minutes.
export const CONSENT_SCRIPT_LIFETIME = 300;

// The address of the consent script in `language`, its name: the
// language's prefix on a site in several, else its language subtag, such
// as en.
export function consentScriptPath(language) {
  return `${CONSENT_SCRIPTS}${language}.js`;
}

// The consent revision: a hash of what a visitor consents to, the
// categories with their services, each service's facts and the departures,
// and not of the wording, the consent texts and the categories' names and
// descriptions. The same inputs give the same revision. Sites that share a
// choice (a domain in the client's options) show the same revision, or each
// asks again about the other's.
export function registryRevision({ categories, services, departures }) {
  const consented = {
    categories: categories.map((category) => ({ id: category.id, services: category.services })),
    services,
    departures,
  };
  return createHash('sha256').update(JSON.stringify(consented)).digest('hex').slice(0, 16);
}
