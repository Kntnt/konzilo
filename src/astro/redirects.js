// A site's redirect rules on the public site, read from
// its content files: each post's old addresses (a 301 to the post's current
// address) and other addresses (the answer each gives, to the post's
// current address, or the post's own page shown there too), its current
// address made from its type's address and the file's name, or its path in
// the collection for a hierarchical type's, and on a site in
// several languages its language's prefix and its type's address in that
// language, and the site's own rules in content/redirects.json.
// On a site in several languages the root leads to the main language's
// start page with a 301.
//
// Every address is answered by the first holder in the order of addresses:
// the site's own files (the core's reserved addresses, the pages of the
// site's design, and the addresses below `<address>page/` of a post whose
// list has pages of its own), a post's own address, its other
// addresses, the site's rules, and old addresses. A rule that a holder above
// it shadows does not answer, and is warned of. The intake writes the
// files so that none is shadowed by what it knows; here the order is kept
// whatever the files hold. Such a list's `<address>page/1/` leads to the
// post with 301, as its page 1 is the post's own address, and so does a
// term's page's, whose posts' page 1 is the term's page.
//
// They are read from the content files themselves, so that Astro's dev
// server follows each export at once, and a build writes them beside the
// pages. A 404 or a 410 shows the site's 404 page: the dev server
// renders it with the rule's status, and the web server serves the build's
// 404.html so. An other address that shows its post is a page: the
// dev server answers it with the post's own page, and a build writes that
// page again at it, as it is, with the post's own address as canonical, so
// that the web server serves it as any page; it is no rule of `_redirects`,
// and no sitemap or list holds it, since they list the posts.

import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { STATUS_CODES } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFrontmatter } from 'astro/markdown';
import { listPageOwners, publicAddress } from '../format/addresses.js';
import { PATTERNS, patternMatcher } from '../format/patterns.js';
import {
  feedHolding, feedReason, fileRuleProblem, inOrder, isSource, keyOf, location, matcher, OTHER_ANSWERS, REDIRECT_STATUSES, REDIRECTS_FILE, reservedBy, SHOW,
} from '../format/redirects.js';
import { OLD_ADDRESSES, OTHER_ADDRESSES, readSiteDescription, SITE_DESCRIPTION_FILE } from '../site-description.js';
import { contentFolder } from './collections.js';
import { startAddress } from './languages.js';
import { postListsIn } from './reader.js';
import { termsWithPages } from './term-pages.js';

// The rules of the site in `root`, the site repository, from its site
// description and its content folder, the one the collections read (a
// preview's own in a preview build). `pages` holds the keys (keyOf) of the
// addresses the pages of the site's design have, besides the posts' own.
// Returns { answering, warnings, listPages }: each rule that answers as {
// from, to, status }, `to` only for a redirect or a post shown (status
// SHOW), in the order of addresses, the warnings for those that do not, and
// the addresses of the posts whose post list has pages of its own.
export function siteRules(root, { pages = new Set() } = {}) {
  const { types, taxonomies, languages, search } = readSiteDescription(join(root, SITE_DESCRIPTION_FILE));
  const content = resolve(root, contentFolder());
  // On a site in several languages each language's posts are in its folder
  // of the collection's, at addresses under its prefix.
  const several = languages.length > 1;
  const folders = several ? languages.map((language) => ({ language, inner: language.tag })) : [{ language: languages[0] ?? null, inner: '' }];
  const posts = [];
  for (const type of Object.values(types)) {
    if (type.address === null) continue;
    for (const { language, inner } of folders) {
      const folder = join(content, type.collection, inner);
      if (!existsSync(folder)) continue;
      for (const name of postFiles(folder, type.hierarchical)) {
        const address = publicAddress(type, name.slice(0, -'.md'.length), language);
        posts.push({ address, ...addressesIn(join(folder, name)) });
      }
    }
  }
  // Each language's start page is a page of the site's design.
  const starts = several ? languages.map((language) => keyOf(startAddress(language, languages))) : [];
  const shown = new Set(posts.map(({ address }) => keyOf(address)));
  const warnings = [];
  const { rules, patterns } = readRules(join(content, REDIRECTS_FILE), warnings);
  const held = [
    ...posts.flatMap(({ address, other }) => other.map(({ address: from, answer }) => ({ level: 3, from, to: address, status: answer }))),
    ...rules.map((rule) => ({ level: 4, ...rule })),
    ...posts.flatMap(({ address, old }) => old.map((from) => ({ level: 5, from, to: address, status: 301 }))),
  ];
  // A feed's address is the site's own too.
  const feedOf = (rule) => feedHolding(rule.from, { types, taxonomies, languages });
  const reserved = held.filter((rule) => reservedBy(rule.from) !== null || feedOf(rule) !== null);
  for (const rule of reserved) {
    warnings.push(reservedBy(rule.from) !== null
      ? `${named(rule)} does not answer, since the site keeps that address for itself`
      : `${named(rule)} does not answer, since ${feedReason(feedOf(rule)).replace(/, so the rule does not answer$/, '')}`);
  }
  // On a site in several languages the addresses of its feeds and its
  // search page without a prefix, which each language has after its own
  //, lead to the main language's, as the root leads to its start
  // page: a term's feed for each term the main language's posts have. The
  // site keeps them for itself.
  const main = (address) => `/${languages[0].prefix}${address}`;
  const mainTerms = (taxonomy) => termEntries(join(content, taxonomy.collection, languages[0].tag)).map(({ id }) => id);
  const leadingOn = !several ? [] : [
    ...Object.values(types).filter((type) => typeof type?.feed === 'string').map((type) => type.feed),
    ...Object.values(taxonomies).filter((taxonomy) => typeof taxonomy?.feed === 'string')
      .flatMap((taxonomy) => mainTerms(taxonomy).map((slug) => taxonomy.feed.replace('{slug}', slug))),
    ...(search ? [search.address] : []),
  ].map((from) => ({ from, to: main(from) }));
  const ledOn = new Set(leadingOn.map(({ from }) => keyOf(from)));
  const withPages = new Set(posts.filter((post) => post.pages).map(({ address }) => address));
  const listPage = (key) => listPageOwners(key).some((owner) => withPages.has(owner));
  const page = (key) => (shown.has(key) ? 'post' : pages.has(key) || starts.includes(key) || ledOn.has(key) ? 'page' : listPage(key) ? 'list' : null);
  const { answering, shadowed } = inOrder(held.filter((rule) => !reserved.includes(rule)), page);
  for (const { rule, by } of shadowed) {
    // An old address gives way without a word, as it always has.
    if (rule.level === 5) continue;
    const holder = { post: 'a post', page: 'a page of its own', list: 'the pages of a list' }[by.page] ?? named(by.rule);
    warnings.push(`${named(rule)} does not answer, since the site has ${holder} there`);
  }
  // On a site in several languages the root, which the site keeps for
  // itself, leads to the main language's start page, whatever language the
  // browser asks for, unless a page of the site's design is there.
  const toStart = [];
  if (several) {
    const start = startAddress(languages[0], languages);
    if (pages.has(keyOf(ROOT))) warnings.push(`the site's root, ${ROOT}, does not lead to the main language's start page, ${start}, since the site has a page of its own there`);
    else toStart.push({ from: ROOT, to: start, status: 301 });
    for (const { from, to } of leadingOn) {
      if (pages.has(keyOf(from))) warnings.push(`${from} does not lead to the main language's, ${to}, since the site has a page of its own there`);
      else toStart.push({ from, to, status: 301 });
    }
  }
  const termPages = Object.values(taxonomies).filter((taxonomy) => taxonomy?.address != null)
    .flatMap((taxonomy) => termsWithPages(taxonomy, termEntries(join(content, taxonomy.collection))).map(({ address }) => address));
  const firstPages = [...new Set([...withPages, ...termPages])].sort().map((address) => ({ from: `${address}page/1/`, to: address, status: 301 }));
  return {
    answering: [...toStart, ...firstPages, ...answering.map(({ from, to, status }) => (to === undefined ? { from, status } : { from, to, status }))],
    patterns,
    warnings,
    listPages: [...withPages].sort(),
    prefixes: several ? languages.map(({ prefix }) => prefix) : [],
  };
}

// The site's root, the start page's address on a site in one language.
const ROOT = '/';

// The terms of a taxonomy's collection in `folder`, as termsWithPages()
// takes the entries of Astro's collection: each file at its root, by its
// slug, with its parent's. A file the site cannot read has none here;
// Astro's own reading of it says what is wrong.
function termEntries(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.startsWith('.'))
    .flatMap((entry) => {
      try {
        const { parent } = JSON.parse(readFileSync(join(folder, entry.name), 'utf8'));
        return [{ id: entry.name.slice(0, -'.json'.length), data: typeof parent === 'string' ? { parent } : {} }];
      } catch {
        return [];
      }
    })
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// The posts' files in a collection's folder, by their paths in it, sorted:
// in folders below it too for a hierarchical type. A file or folder named
// with a leading dot is none.
function postFiles(folder, deep, inner = '') {
  return readdirSync(join(folder, inner), { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('.')) return [];
    const name = inner === '' ? entry.name : `${inner}/${entry.name}`;
    if (entry.isDirectory()) return deep ? postFiles(folder, deep, name) : [];
    return entry.isFile() && entry.name.endsWith('.md') ? [name] : [];
  }).sort();
}

// A rule, in words: `the redirect from /a/`, `the 410 from /a/`, or `the
// post shown at /a/`.
function named({ from, status }) {
  if (status === SHOW) return `the post shown at ${from}`;
  return `the ${REDIRECT_STATUSES.includes(status) ? 'redirect' : status} from ${from}`;
}

// The old and other addresses a content file lists, those the site reads,
// a post shown at a path alone, and whether its body holds a post list with
// pages of its own. A file the site cannot read has none here; Astro's own
// reading of it says what is wrong.
function addressesIn(file) {
  let data;
  let pages;
  try {
    const { frontmatter, content } = parseFrontmatter(readFileSync(file, 'utf8'));
    data = frontmatter;
    pages = postListsIn(content).some((list) => list.pages === true);
  } catch {
    return { old: [], other: [], pages: false };
  }
  const old = data[OLD_ADDRESSES];
  const other = data[OTHER_ADDRESSES];
  return {
    pages,
    old: Array.isArray(old) ? old.filter(isSource) : [],
    other: Array.isArray(other)
      ? other.filter((entry) => isSource(entry?.address) && OTHER_ANSWERS.includes(entry?.answer) && !(entry.answer === SHOW && entry.address.includes('?')))
      : [],
  };
}

// The site's rules in content/redirects.json, each one the site can answer,
// as { rules, patterns }: the exact rules as { from, to, status } and the
// patterns as { pattern, to, status }, in the file's order, the first
// PATTERNS of them. A rule the site cannot answer is left out and warned
// of. No file, no rules.
function readRules(file, warnings) {
  const none = { rules: [], patterns: [] };
  if (!existsSync(file)) return none;
  let rules;
  try {
    ({ rules } = JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    warnings.push(`the site's rules do not answer until ${REDIRECTS_FILE} can be read: ${error.message}`);
    return none;
  }
  if (!Array.isArray(rules)) {
    warnings.push(`the site's rules do not answer until ${REDIRECTS_FILE} holds a list of them`);
    return none;
  }
  const unread = (rule) => warnings.push(`a rule of ${REDIRECTS_FILE} does not answer, since the site cannot read it: ${JSON.stringify(rule)}`);
  const exact = [];
  const patterns = [];
  for (const rule of rules) {
    if (fileRuleProblem(rule)) unread(rule);
    else if (!Object.hasOwn(rule, 'pattern')) exact.push({ from: rule.from, to: rule.to, status: rule.status });
    else if (patterns.length < PATTERNS) patterns.push({ pattern: rule.pattern, to: rule.to, status: rule.status });
    else warnings.push(`the pattern ${rule.pattern} does not answer, since the site answers the first ${PATTERNS} patterns alone`);
  }
  return { rules: exact, patterns };
}

// `_redirects`, the rules for the web server in the build's output, a form
// static hosts read: one `<source> <target> <status>` per redirect and
// `<source> <status>` per 404 or 410, sorted by source, then each pattern,
// `^...`, in the same form, in the list's order.
export function redirectsList(rules, patterns = []) {
  const line = (source, to, status) => (to === undefined ? `${source} ${status}\n` : `${source} ${to} ${status}\n`);
  return [
    ...[...rules].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)).map(({ from, to, status }) => line(from, to, status)),
    ...patterns.map(({ pattern, to, status }) => line(pattern, to, status)),
  ].join('');
}

// A rule's address below a base of its own, as a preview's is: a path on
// the site gets the base before it, an address off it stays as it is, and
// a pattern matches the path below the base.
export function belowBase(base) {
  const prefix = base.replace(/\/$/, '');
  const based = (address) => (address.startsWith('/') ? `${prefix}${address}` : address);
  const pattern = (text) => (prefix === '' ? text : `^${prefix}(?:${text.slice(1)})`);
  return ({ from, pattern: given, to, status }) => {
    const source = given === undefined ? { from: based(from) } : { pattern: pattern(given) };
    return to === undefined ? { ...source, status } : { ...source, to: based(to), status };
  };
}

// The file in the build's output folder `dir` (a URL) at the path of a
// rule's source, or null for a source no file can be at: a redirect page is
// `index.html` in the folder of a path, or the path itself for one that ends
// in `.html`.
function fileAt(dir, from) {
  if (from.includes('?')) return null;
  let segments;
  try {
    segments = from.split('/').slice(1).map((segment) => decodeURIComponent(segment));
  } catch {
    return null;
  }
  if (segments.some((segment) => segment.includes('/') || segment === '.' || segment === '..')) return null;
  const last = segments.at(-1);
  if (last === '' || !last.includes('.')) return join(fileURLToPath(dir), ...segments, 'index.html');
  return /\.html?$/.test(last) ? join(fileURLToPath(dir), ...segments) : null;
}

// What `astro build` leaves for the rules, once its pages are written into
// `dir`: each rule whose source a file of the release has is left out, each
// redirect from a path gets a page that sends a browser on, its meta
// refresh at once, `noindex` and the target as canonical, and each other
// address that shows its post gets the post's page, a copy of the file the
// build wrote at the post's own address. `based` places the rules below the
// build's base. Returns { list, warnings }: `_redirects`, which holds no
// post shown, since the web server serves its page as any, and the warnings
// for the rules left out, and for each post list with pages whose post's
// page links its page 2 where the build wrote none, as a site's route from
// before list pages leaves it.
export function buildRedirects(root, { dir, pages, based }) {
  const built = new Set(pages.map(({ pathname }) => keyOf(`/${pathname}`)));
  const { answering, patterns, warnings, listPages } = siteRules(root, { pages: built });
  for (const address of listPages) {
    const first = fileAt(dir, address);
    const second = fileAt(dir, `${address}page/2/`);
    if (first === null || !existsSync(first) || existsSync(second)) continue;
    if (!readFileSync(first, 'utf8').includes(`href="${based({ from: `${address}page/2/`, status: 404 }).from}"`)) continue;
    warnings.push(`the list with pages in the post at ${address} has no page 2, since the site's route for its type builds no later page: build them with postPages() from @kntnt/konzilo/astro/post-lists`);
  }
  const answers = [];
  for (const rule of answering) {
    const file = fileAt(dir, rule.from);
    if (file !== null && existsSync(file)) {
      warnings.push(`${named(rule)} does not answer, since the site has a file of its own there`);
      continue;
    }
    if (rule.status === SHOW) {
      const page = fileAt(dir, rule.to);
      if (file === null) warnings.push(`${named(rule)} does not answer, since no page of the release can be at that address`);
      else if (page === null || !existsSync(page)) warnings.push(`${named(rule)} does not answer, since the site's design builds no page at the post's address, ${rule.to}`);
      else {
        mkdirSync(dirname(file), { recursive: true });
        copyFileSync(page, file);
      }
      continue;
    }
    const shown = based(rule);
    answers.push(shown);
    if (file !== null && shown.to !== undefined) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, redirectPage(shown));
    }
  }
  // A pattern answers where no file of the release does, which the web
  // server tells at each request; it has no page of its own.
  return { list: redirectsList(answers, patterns.map(based)), warnings };
}

function redirectPage({ from, to }) {
  const html = (text) => text.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return [
    '<!doctype html>',
    `<title>Redirecting to: ${html(to)}</title>`,
    `<meta http-equiv="refresh" content="0;url=${html(to)}">`,
    '<meta name="robots" content="noindex">',
    `<link rel="canonical" href="${html(to)}">`,
    `<body><a href="${html(to)}">Redirecting from <code>${html(from)}</code> to <code>${html(to)}</code></a></body>`,
    '',
  ].join('\n');
}

// Astro's dev server: each rule with its status, from the content files as
// they are now. They are read again after any change to the content folder
// or the site description. `pages()` gives the keys of the addresses the
// pages of the site's design have. A 404 or a 410 shows the site's 404
// page, the route src/pages/404.astro has below `base`, with the rule's
// status, as the dev server shows it at an address nothing holds; a site
// without one gets Astro's own. An other address that shows its post gets
// the post's own page, as the page at the post's address answers.
export function devRedirects(root, { watcher, logger, pages = () => new Set(), base = '/' }) {
  const content = join(root, 'content');
  const description = join(root, SITE_DESCRIPTION_FILE);
  let rules = null;
  let patterns = null;
  let prefixes = [];
  watcher.on('all', (_event, file) => {
    if (file === description || file.startsWith(`${content}/`)) rules = null;
  });
  const middleware = (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return next();
    if (rules === null) {
      try {
        const { answering, patterns: listed, warnings, prefixes: given } = siteRules(root, { pages: pages() });
        for (const warning of warnings) logger.warn(warning);
        prefixes = given;
        rules = matcher(answering);
        patterns = patternMatcher(listed, { isPath: isSource });
      } catch (error) {
        logger.error(`the redirect rules do not answer until this is fixed: ${error.message}`);
        rules = matcher([]);
        patterns = patternMatcher([], { isPath: isSource });
      }
    }
    const mark = request.url.indexOf('?');
    const path = mark === -1 ? request.url : request.url.slice(0, mark);
    const query = mark === -1 ? null : request.url.slice(mark + 1);
    const rule = rules.answer(path, query);
    if (rule !== undefined) {
      if (rule.status === SHOW) {
        request.url = `${base.replace(/\/$/, '')}${rule.to}${query === null ? '' : `?${query}`}`;
        return next();
      }
      if (rule.to !== undefined) return redirect(response, rule.status, location(rule, query));
      answerWith(response, rule.status);
      request.url = `${base.replace(/\/$/, '')}${notFoundAt(path, prefixes, base)}`;
      return next();
    }
    // A pattern answers only where Astro finds no page: in place of its 404,
    // which shows the site's 404 page, as a pattern's 404 or 410 does, with
    // the pattern's status.
    const found = patterns.answer(path, query);
    if (found?.location === null) answerWith(response, found.rule.status, { instead: 404 });
    else if (found !== undefined) instead404(response, (raw) => redirect(raw, found.rule.status, found.location));
    return next();
  };
  // The pages of the site's design changed: read the rules again.
  middleware.forget = () => {
    rules = null;
  };
  return middleware;
}

// Where the dev server renders the 404 page for a path below `base`: below
// a language's prefix, of `prefixes`, on a site in several languages, at
// that language's, and else at the root's.
function notFoundAt(path, prefixes, base) {
  const root = base.endsWith('/') ? base : `${base}/`;
  const first = (path.startsWith(root) ? path.slice(root.length) : path.replace(/^\/+/, '')).split('/')[0].toLowerCase();
  return prefixes.includes(first) ? `/${first}/404` : '/404';
}

function redirect(response, status, to) {
  response.writeHead(status, { Location: to, 'Content-Length': '0' });
  return response.end();
}

// Has `answer(response)` answer in place of the 404 that what comes after
// would send, through `response`, and lets every other answer through. Astro
// writes a 404 with writeHead, or by its status before its first write or
// its end; what it writes after is dropped, and the headers it set before
// are cleared.
function instead404(response, answer) {
  const { writeHead, write, end } = response;
  let replaced = false;
  const replace = () => {
    replaced = true;
    Object.assign(response, { writeHead, write, end });
    for (const name of response.getHeaderNames()) response.removeHeader(name);
    answer(response);
    // What Astro writes of its own 404 page after this goes nowhere.
    response.write = () => true;
    response.end = (...args) => {
      args.find((one) => typeof one === 'function')?.();
      return response;
    };
  };
  const notFound = () => !replaced && !response.headersSent && response.statusCode === 404;
  response.writeHead = function writeHeadUnless404(status, ...rest) {
    if (!replaced && status === 404) {
      replace();
      return this;
    }
    return writeHead.call(this, status, ...rest);
  };
  response.write = function writeUnless404(...args) {
    if (notFound()) {
      replace();
      return true;
    }
    return write.apply(this, args);
  };
  response.end = function endUnless404(...args) {
    if (notFound()) {
      replace();
      args.find((one) => typeof one === 'function')?.();
      return this;
    }
    return end.apply(this, args);
  };
}

// Whatever status the dev server writes the answer with, `status` goes out,
// with its own words; with `instead`, only in place of that status.
function answerWith(response, status, { instead = null } = {}) {
  const writeHead = response.writeHead.bind(response);
  response.writeHead = (code, ...rest) => {
    if (instead !== null && code !== instead) return writeHead(code, ...rest);
    response.statusMessage = STATUS_CODES[status];
    return writeHead(status, ...(typeof rest[0] === 'string' ? [STATUS_CODES[status], ...rest.slice(1)] : rest));
  };
}
