// The public site's security headers, one set for every answer,
// made from the site description and the rule data. A build writes them into
// its release as `_headers`, beside `_redirects`, for the web server of every
// host that serves the release, and Astro's dev server sends them locally
// (devHeaders()).
//
// - HSTS for a year, for the site's host alone unless the site opts in to
//   every subdomain of it, which would force HTTPS on the customer's every
//   other subdomain, and never `preload`.
// - `nosniff`, and the referrer policy that gives other sites the origin
//   alone.
// - Framing by the site alone, said both as a CSP of `frame-ancestors` and
//   as X-Frame-Options; a site that lists origins that may frame it has them
//   in the CSP, and no X-Frame-Options, which cannot name them.
// - The release's Content Security Policy, worked out from the built
//   release, the service registry and the site description
//   (content-security-policy.js), as one header with the framing in it. The
//   dev server sends the framing part alone, since its own code is inline.
// - Reporting-Endpoints, naming the endpoint's kind for violation reports,
//   when the policy reports to it, as the public site's does.
// - A permissions policy that turns off what no page of the site asks for,
//   and gives each feature an embed's player is given to the site and to the
//   players' origins of the services whose players are given it, so that
//   players keep working.
// - The opener policy `same-origin`.

import { join } from 'node:path';
import { readSiteDescription, SITE_DESCRIPTION_FILE, siteDescription } from '../site-description.js';
import { framingPolicy, policyText, reportingEndpoints } from './content-security-policy.js';
import { playerPermissions } from './embeds.js';

// The file in the build's output, never served.
export const HEADERS_FILE = '_headers';

// The most characters of a header's value a web server is asked to take: room
// for about 1,200 hashes in the Content Security Policy.
export const HEADER_LIMIT = 65536;

// A year, in seconds.
const YEAR = 31_536_000;

// The features the permissions policy turns off, unless a player is given one.
const TURNED_OFF = ['camera', 'microphone', 'geolocation', 'payment', 'usb', 'serial', 'hid', 'bluetooth'];

// The headers of the site the description declares (as declared, or as
// siteDescription() gives it): [name, value] in a fixed order. `policy` is
// the release's Content Security Policy, as contentSecurityPolicy() gives
// it; without one, the CSP is the framing part alone.
export function securityHeaders(description, policy = framingPolicy(description)) {
  const { security } = siteDescription(description);
  const framing = security.frameAncestors.length === 0;
  const reporting = reportingEndpoints(policy);
  return [
    ['Strict-Transport-Security', `max-age=${YEAR}${security.includeSubDomains ? '; includeSubDomains' : ''}`],
    ['X-Content-Type-Options', 'nosniff'],
    ['Referrer-Policy', 'strict-origin-when-cross-origin'],
    ['Content-Security-Policy', policyText(policy)],
    ...(reporting === null ? [] : [['Reporting-Endpoints', reporting]]),
    ...(framing ? [['X-Frame-Options', 'SAMEORIGIN']] : []),
    ['Permissions-Policy', permissionsPolicy(playerPermissions())],
    ['Cross-Origin-Opener-Policy', 'same-origin'],
  ];
}

// The permissions policy: each feature turned off, then each feature the
// players are given, by name, with the site and the players' origins, sorted.
function permissionsPolicy(players) {
  const given = new Map();
  for (const { origins, features } of players) {
    for (const feature of features) {
      if (!given.has(feature)) given.set(feature, new Set());
      for (const origin of origins) given.get(feature).add(origin);
    }
  }
  const off = TURNED_OFF.filter((feature) => !given.has(feature)).map((feature) => `${feature}=()`);
  const on = [...given.keys()].sort().map((feature) => `${feature}=(self ${[...given.get(feature)].sort().map((origin) => `"${origin}"`).join(' ')})`);
  return [...off, ...on].join(', ');
}

// The headers as `_headers` holds them, the form static hosts read: `/*`,
// every page, then one indented `Name: value` per header; then each of
// `sections`, { path, headers }, the headers of the files below a path of
// its own, such as the consent scripts' Cache-Control.
export function headersFile(headers, sections = []) {
  const section = (path, given) => [path, ...given.map(([name, value]) => `  ${name}: ${value}`)];
  return [...section('/*', headers), ...sections.flatMap(({ path, headers: own }) => section(path, own)), ''].join('\n');
}

// Astro's dev server: the headers of the site in `root`, the site
// repository, on every answer, its pages, its files, its redirects and its
// own answers to an address it has not, the CSP the framing part alone,
// since the dev server's own code is inline. Set before any other middleware
// answers, so that one that sets a header of its own replaces the value and
// none is sent twice. The description is read once: restart the dev server when
// it changes.
export function devHeaders(root) {
  const headers = securityHeaders(readSiteDescription(join(root, SITE_DESCRIPTION_FILE)));
  return (_request, response, next) => {
    for (const [name, value] of headers) response.setHeader(name, value);
    next();
  };
}
