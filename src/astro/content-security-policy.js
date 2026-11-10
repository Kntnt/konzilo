// The public site's Content Security Policy: one policy per
// release, worked out at every build from what Konzilo knows, and enforced
// as a header of the release's `_headers` (security-headers.js), never as
// Astro's <meta>, which can neither control framing nor report.
//
// - `default-src 'self'`.
// - The release's inline code, by the SHA-256 of each, collected over every
//   page as built (releaseCode()): every inline script (data blocks such as
//   JSON-LD aside, which no browser runs) in `script-src`, every inline
//   style element in `style-src`, and every distinct `style` attribute value
//   in `style-src-attr` under 'unsafe-hashes', such as a table column's
//   alignment and an embed player's size, so that the content files keep
//   them as they are.
// - The players' origins of the embed services the pages use, in
//   `frame-src`.
// - The hosts of the service registry's services, each kind of
//   request in its directive: scripts, frames, connections, images, styles
//   and fonts. A host reaches the policy only as part of a service, and
//   consent decides when each loads.
// - `data:` in `img-src`, so that a design's icons embedded in its
//   stylesheet show, unless the site description's `security.dataImages`
//   is false. An image runs no code, and `data:` reaches no other directive.
// - `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, and
//   `frame-ancestors`, the site alone or the origins its description lists.
// - Last, where the pages report a violation: the endpoint's kind for
//   violation reports, as `report-uri` for browsers without the Reporting
//   API and as `report-to` the group the header Reporting-Endpoints names
//   (reportingEndpoints()), each a path on the host the page came from. The
//   public site's pages report; a preview's and a share link's do not, so
//   that editors' previews are not logged.
//
// Never offered: 'unsafe-inline', 'unsafe-eval', `*`, a scheme alone but
// `data:` for images, or a nonce, which a static site has none of per
// request. So code no hash can allow, an inline event handler or a
// `javascript:` address, has no place: releaseCode() names each, and the
// build fails on them.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { parse, parseFragment } from 'parse5';
import { CONSENT_FILE, HOST_KINDS } from '../format/consent.js';
import { hostOf } from '../format/declared-services.js';
import rules from '../format/rules.json' with { type: 'json' };
import { RESERVED_PREFIX, siteDescription } from '../site-description.js';

// The endpoint's kind for violation reports,
// and the group of the Reporting API that names it.
export const VIOLATION_REPORTS = `${RESERVED_PREFIX}violations`;
export const REPORTING_GROUP = 'violations';

// The directive of each kind of request a service's hosts are listed by.
const DIRECTIVES = { scripts: 'script-src', frames: 'frame-src', connections: 'connect-src', images: 'img-src', styles: 'style-src', fonts: 'font-src' };

// The types of a script element a browser runs, which the policy covers:
// none, JavaScript by any of its names, a module, an import map and
// speculation rules. Any other is a data block, which no browser runs.
const RUN = /^(|module|importmap|speculationrules|(application|text)\/(x-)?(java|ecma)script|text\/(javascript1\.[0-5]|jscript|livescript))$/;

// The attributes that hold an address a browser may go to or load, where a
// `javascript:` address would run.
const ADDRESSES = new Set(['href', 'src', 'action', 'formaction', 'data', 'poster', 'background', 'cite', 'ping', 'codebase', 'longdesc', 'manifest']);

// The origins each embed service's players load from, by the rule data.
const PLAYERS = Object.fromEntries(Object.entries(rules.embeds.services)
  .map(([id, service]) => [id, [...new Set(service.addresses.map(({ player }) => new URL(player.replace(/\{[^}]+\}/g, 'x')).origin))]]));

const sha256 = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

// The inline code of the release in `dir`, Astro's output folder, as a
// browser meets it on every page (each HTML file): { code: { scripts,
// styles, attributes, players }, problems }. `scripts`, `styles` and
// `attributes` are the hashes of the inline scripts, the inline style
// elements and the distinct `style` attribute values, `players` the
// players' origins of the embed services the pages' panels show, each
// sorted, each once. A template's content counts, since the site's script
// puts it into the page, and so does a <noscript>'s, which a browser
// without scripts shows. `problems` names each inline event handler and
// `javascript:` address, with the page's address.
export function releaseCode(dir) {
  const scripts = new Set();
  const styles = new Set();
  const attributes = new Set();
  const players = new Set();
  const problems = [];
  for (const file of htmlFiles(dir)) {
    const page = addressOf(relative(dir, file));
    const visit = (node) => {
      if (node.attrs) {
        const tag = node.tagName;
        for (const { name, value } of node.attrs) {
          if (name === 'style') attributes.add(sha256(value));
          else if (/^on/i.test(name)) problems.push(`the page ${page} has <${tag} ${name}>, an inline event handler`);
          else if (ADDRESSES.has(name) && isJavaScript(value)) problems.push(`the page ${page} has <${tag} ${name}="javascript:…">, a javascript: address`);
        }
        if (tag === 'script' && !node.attrs.some(({ name }) => name === 'src') && RUN.test(typeOf(node))) scripts.add(sha256(textOf(node)));
        if (tag === 'style') styles.add(sha256(textOf(node)));
        if (tag === 'figure' && /(^|\s)konzilo-embed(\s|$)/.test(attribute(node, 'class') ?? '')) {
          for (const origin of PLAYERS[attribute(node, 'data-embed')] ?? []) players.add(origin);
        }
      }
      if (node.nodeName === 'noscript') {
        for (const child of parseFragment(textOf(node)).childNodes) visit(child);
        return;
      }
      for (const child of node.content?.childNodes ?? []) visit(child);
      for (const child of node.childNodes ?? []) visit(child);
    };
    visit(parse(readFileSync(file, 'utf8')));
  }
  const sorted = (set) => [...set].sort();
  return { code: { scripts: sorted(scripts), styles: sorted(styles), attributes: sorted(attributes), players: sorted(players) }, problems };
}

// The service registry the content folder holds (consent.json),
// as the intake wrote it, or null when it holds none.
export function readRegistry(folder) {
  const file = join(folder, CONSENT_FILE);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

// The policy, as data: each directive by name, in the order the header
// gives them, with its sources. `code` is releaseCode()'s, `registry` the
// service registry or null, `description` the site description, as
// declared or as siteDescription() gives it, and `reports` whether the
// pages report a violation to the endpoint, as the public site's do. A
// registry host that is no host a policy may name throws, naming the
// service and the kind.
export function contentSecurityPolicy({ code, registry, description, reports = false }) {
  const { security } = siteDescription(description);
  const hosts = Object.fromEntries(Object.values(DIRECTIVES).map((directive) => [directive, new Set()]));
  for (const service of registry?.services ?? []) {
    for (const kind of HOST_KINDS) {
      for (const host of service.hosts?.[kind] ?? []) {
        if (typeof host !== 'string' || hostOf(host).host !== host) {
          throw new Error(`Konzilo: the service registry's service ${service.id} lists ${JSON.stringify(host)} among its ${kind}, which is no host a Content Security Policy may name`);
        }
        hosts[DIRECTIVES[kind]].add(`https://${host}`);
      }
    }
  }
  for (const origin of code.players) hosts['frame-src'].add(origin);
  const own = (directive, ...sources) => ["'self'", ...sources, ...[...hosts[directive]].sort()];
  return {
    'default-src': ["'self'"],
    'script-src': own('script-src', ...code.scripts),
    'style-src': own('style-src', ...code.styles),
    'style-src-attr': code.attributes.length > 0 ? ["'unsafe-hashes'", ...code.attributes] : ["'none'"],
    'img-src': own('img-src', ...(security.dataImages ? ['data:'] : [])),
    'font-src': own('font-src'),
    'connect-src': own('connect-src'),
    'media-src': ["'self'"],
    'frame-src': own('frame-src'),
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'form-action': ["'self'"],
    'frame-ancestors': framing(security),
    ...(reports ? { 'report-uri': [VIOLATION_REPORTS], 'report-to': [REPORTING_GROUP] } : {}),
  };
}

// The value of the header Reporting-Endpoints that a policy which reports
// needs, naming its group's endpoint, or null for one that reports nothing.
export function reportingEndpoints(policy) {
  return policy['report-to'] ? `${REPORTING_GROUP}="${VIOLATION_REPORTS}"` : null;
}

// The framing part alone, which Astro's dev server sends, since its own
// code is inline: the site, and the origins its description lists.
export function framingPolicy(description) {
  return { 'frame-ancestors': framing(siteDescription(description).security) };
}

function framing(security) {
  return ["'self'", ...security.frameAncestors];
}

// The policy as the header's value.
export function policyText(policy) {
  return Object.entries(policy).map(([directive, sources]) => [directive, ...sources].join(' ')).join('; ');
}

// Every HTML file below `dir`.
function htmlFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.html'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

// A page's address on the site, from its file's path in the release.
function addressOf(path) {
  const parts = path.split(sep);
  return parts.at(-1) === 'index.html' ? `/${parts.slice(0, -1).map((part) => `${part}/`).join('')}` : `/${parts.join('/')}`;
}

function attribute(node, name) {
  return node.attrs.find((found) => found.name === name)?.value;
}

// A script element's type, as a browser compares it: trimmed, in lowercase.
function typeOf(node) {
  return (attribute(node, 'type') ?? '').trim().toLowerCase();
}

// An element's child text, as a browser hashes it.
function textOf(node) {
  return node.childNodes.filter((child) => child.nodeName === '#text').map((child) => child.value).join('');
}

// Whether an address runs code as a browser reads it: its scheme after the
// spaces and controls at its edges, and without tabs and line breaks.
function isJavaScript(value) {
  return /^javascript:/i.test(value.replace(/^[\0-\x20]+/, '').replace(/[\t\n\r]/g, ''));
}
