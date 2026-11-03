// Redirect rules: what the public site answers at an address that no post has
// as its own.
//
// - A rule that leads to a post belongs to that post: its content file holds it
//   among its other addresses, so that it follows the post's address and goes
//   with the post.
// - Every other rule is the site's, in content/redirects.json, each
//   { from, to, status }, `to` only for a redirect.
//
// Every address on the public site is answered by the first of these that
// holds it: (1) the site's own files, (2) a published post's own
// address, (3) that post's other addresses, (4) the site's exact rules, (5)
// old addresses. Astro's build knows the pages of the site's design. A rule that
// something higher holds is left out and warned of, and so is one that cannot
// answer as it should.
//
// This module holds the forms of sources and targets, the order, and the
// matching of a request.

import { feedAt, feedName } from './addresses.js';
import { patternTargetProblem, readPattern } from './patterns.js';
import rules from './rules.json' with { type: 'json' };

// The site's rules in the content folder.
export const REDIRECTS_FILE = 'redirects.json';

// The answers a rule may give: a redirect with its status, or 404 or 410.
export const REDIRECT_STATUSES = [301, 302, 307, 308];
export const STATUSES = [...REDIRECT_STATUSES, 404, 410];

// The answer of a post's other address that shows the post there too, with
// its own address as canonical: the build writes the post's page
// again at the address, so the release holds it as a file of its own.
export const SHOW = 'show';

// The answers a post's other address may give: a redirect to the post, or
// the post shown there too.
export const OTHER_ANSWERS = [...REDIRECT_STATUSES, SHOW];

// A path from the site's root, as a browser sends it: segments of RFC 3986's
// path characters, each other character percent-encoded, no empty segment,
// so never `//`, which leads off the site, and no `.` or `..`, which a
// browser resolves before it sends a path.
const CHARACTER = "(?:[A-Za-z0-9\\-._~!$&'()*+,;=:@]|%[0-9A-Fa-f]{2})";
const PATH = new RegExp(`^/(?:${CHARACTER}+(?:/${CHARACTER}+)*/?)?$`);
const QUERY = /^(?:[A-Za-z0-9\-._~!$&'()*+,;=:@/?]|%[0-9A-Fa-f]{2})+$/;
const FRAGMENT = QUERY;

// A path, a query and a fragment of an address on the site, or null for
// text that is no such address. `fragment` says whether one may be given.
function siteAddress(text, { fragment = false } = {}) {
  if (typeof text !== 'string') return null;
  const hash = text.indexOf('#');
  if (hash !== -1 && !fragment) return null;
  const [before, after = null] = hash === -1 ? [text] : [text.slice(0, hash), text.slice(hash + 1)];
  const mark = before.indexOf('?');
  const path = mark === -1 ? before : before.slice(0, mark);
  const query = mark === -1 ? null : before.slice(mark + 1);
  if (!PATH.test(path) || path.split('/').some((segment) => segment === '.' || segment === '..')) return null;
  if (query !== null && (!QUERY.test(query) || query.split('&').some((parameter) => parameter === ''))) return null;
  if (after !== null && !FRAGMENT.test(after)) return null;
  return { path, query, fragment: after };
}

// Whether text is a rule's source: a root path as a browser sends it, with
// an optional query string.
export function isSource(text) {
  return siteAddress(text) !== null;
}

// Why text cannot be a redirect's target, or null when it can: a root path
// on the site, with an optional query and fragment, or an `https://` address.
export function targetProblem(text) {
  if (typeof text !== 'string' || text === '') return 'a redirect needs a target';
  if (text.startsWith('https://')) {
    if (!/^[\x21-\x7e]+$/.test(text) || /[<>"{}|\\^`]/.test(text)) return `${JSON.stringify(text)} is not an address as a browser sends it`;
    let url;
    try {
      url = new URL(text);
    } catch {
      return `${JSON.stringify(text)} is not an address`;
    }
    if (url.hostname === '' || url.username !== '' || url.password !== '') return `${JSON.stringify(text)} is not an address of a site`;
    return null;
  }
  if (siteAddress(text, { fragment: true }) === null) {
    return `${JSON.stringify(text)} is neither an address on the site, starting with a slash, nor an https:// address`;
  }
  return null;
}

// The path, query and fragment of a target on the site, or null for an
// address off it.
export function onSite(target) {
  return target.startsWith('/') ? siteAddress(target, { fragment: true }) : null;
}

// What two sources share when they answer the same request: the path
// without its final slash, and the query's parameters in order. A source
// that ends in a slash also answers without it, so `/campaign` and
// `/campaign/` are one address.
export function keyOf(source) {
  const { path, query } = siteAddress(source, { fragment: true });
  const trimmed = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return query === null ? trimmed : `${trimmed}?${query.split('&').sort().join('&')}`;
}

// The reserved address a source falls under, as the rule data lists it, or
// null. An entry ending in `/*` reserves every address below it, whatever
// its query; any other entry its own address without a query, so `/` is the
// start page alone and `/?p=12` is free. In an entry, `{n}` stands for a
// whole number from 1, as a sitemap's numbered files have it
// (`/sitemap-{n}.xml`), and such an entry gives the address it reserves.
export function reservedBy(source) {
  const { path, query } = siteAddress(source);
  const key = keyOf(path);
  for (const entry of rules.addresses.reserved) {
    if (entry.endsWith('/*')) {
      const below = entry.slice(0, -1);
      if (key === below.slice(0, -1) || path.startsWith(below)) return entry;
    } else if (entry.includes(NUMBER)) {
      if (query === null && numberedAddress(entry).test(path)) return path;
    } else if (query === null && key === keyOf(entry)) return entry;
  }
  return null;
}

// What stands for a whole number from 1 in a reserved address.
const NUMBER = '{n}';

// A reserved address with NUMBER in it, as the paths it reserves.
function numberedAddress(entry) {
  const [before, after] = entry.split(NUMBER).map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${before}[1-9][0-9]*${after}$`);
}

// The feed of `site` (its types and taxonomies, as checked) at a
// rule's source, as feedAt() gives it, or null: a feed holds its address,
// with and without its last slash, without a query.
export function feedHolding(source, site) {
  const address = siteAddress(source);
  return address === null || address.query !== null ? null : feedAt(address.path, site);
}

// Why a rule does not answer at a feed's address, in words.
export function feedReason(feed) {
  return `it is the address of ${feedName(feed)}, so the rule does not answer`;
}

// The order of addresses, from level 3 down, among the holders of levels 1
// and 2: `page(key)` names what holds the address `key` on levels 1 and 2,
// or gives null. `held` is each rule as { level, from, to, status, owner },
// in its order on its level. Returns { answering, shadowed }: the rules that
// answer, in order, and as { rule, by } each that does not, `by` being
// { page } for a holder of level 1 or 2 or { rule } for one of the rules.
export function inOrder(held, page) {
  const answering = [];
  const shadowed = [];
  const taken = new Map();
  for (const rule of [...held].sort((a, b) => a.level - b.level)) {
    const key = keyOf(rule.from);
    const holder = page(key);
    if (holder !== null) shadowed.push({ rule, by: { page: holder } });
    else if (taken.has(key)) shadowed.push({ rule, by: { rule: taken.get(key) } });
    else {
      taken.set(key, rule);
      answering.push(rule);
    }
  }
  return { answering, shadowed };
}

// The rule that answers a request among `answering` (as inOrder gives
// them): `answer(path, query)`, the request's path and its query (null for
// none), as the browser sent them, gives the rule or undefined. A source
// with a query answers a request with exactly its parameters, in any order;
// one without a query answers whatever the request's query. A source that
// ends in a slash also answers without it.
export function matcher(answering) {
  const byKey = new Map(answering.map((rule) => [keyOf(rule.from), rule]));
  const answers = (rule, path) => rule !== undefined && (rule.from.split('?')[0].endsWith('/') || rule.from.split('?')[0] === path);
  return {
    answer(path, query) {
      if (siteAddress(path) === null) return undefined;
      const trimmed = keyOf(path);
      if (query !== null && query !== '') {
        const parameters = query.split('&').filter((parameter) => parameter !== '');
        const rule = byKey.get(`${trimmed}?${parameters.sort().join('&')}`);
        if (answers(rule, path)) return rule;
      }
      const rule = byKey.get(trimmed);
      return answers(rule, path) ? rule : undefined;
    },
  };
}

// Where a redirect sends a request: the rule's target, and the request's
// query unless the source or the target has one of its own, placed before
// the target's fragment.
export function location(rule, query) {
  const { to, from } = rule;
  if (query === null || query === '' || from.includes('?')) return to;
  const hash = to.indexOf('#');
  const [before, fragment] = hash === -1 ? [to, ''] : [to.slice(0, hash), to.slice(hash)];
  return before.includes('?') ? to : `${before}?${query}${fragment}`;
}

// Why a pattern cannot answer, or null: one that
// is no pattern of the grammar, an answer that is none of a rule's, a
// redirect without a target or with one that names a group the pattern has
// not or that the pattern matches again, and a 404 or a 410 with a target.
export function patternProblem({ from, to, status }) {
  const { problem, groups } = readPattern(from);
  if (problem) return `the pattern ${from}: ${problem}`;
  if (!STATUSES.includes(status)) return `${JSON.stringify(status)} is none of the answers ${STATUSES.join(', ')}`;
  if (!REDIRECT_STATUSES.includes(status)) return to === undefined ? null : `a ${status} answers without a target`;
  if (typeof to !== 'string' || to === '') return 'a redirect needs a target';
  return patternTargetProblem(from, to, groups, { targetProblem, onSite });
}

// The words that say what a rule of content/redirects.json looks like, an
// exact rule's and a pattern's.
const RULE_SHAPE = 'the site reads a rule only as { "from", "to", "status" }, its target only for a redirect';
const PATTERN_SHAPE = 'the site reads a rule only as { "from", "to", "status" }, or a pattern as { "pattern", "to", "status" }, its target only for a redirect';

// Why a rule of content/redirects.json is not as the intake writes it, or
// null: an exact rule { from, to, status } or a pattern { pattern, to,
// status }, its target only for a redirect, its source an address on the
// site as a browser sends it, or a pattern of the grammar. Astro reads the file
// by it (astro/redirects.js).
export function fileRuleProblem(rule) {
  if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) return RULE_SHAPE;
  const source = Object.hasOwn(rule, 'pattern') ? 'pattern' : 'from';
  const keys = REDIRECT_STATUSES.includes(rule.status) ? [source, 'status', 'to'] : [source, 'status'];
  if (!STATUSES.includes(rule.status) || Object.keys(rule).sort().join() !== keys.sort().join()) return source === 'pattern' ? PATTERN_SHAPE : RULE_SHAPE;
  if (source === 'pattern') {
    return typeof rule.pattern === 'string' ? patternProblem({ from: rule.pattern, to: rule.to, status: rule.status }) : 'the pattern is no text';
  }
  if (!isSource(rule.from)) return `${JSON.stringify(rule.from)} is not an address on the site as a browser sends it`;
  return REDIRECT_STATUSES.includes(rule.status) ? targetProblem(rule.to) : null;
}
