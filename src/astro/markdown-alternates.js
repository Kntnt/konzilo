// The Markdown alternates of the public site's pages, made from the built
// pages: each page that takes part has its Markdown at its address
// without its last slash and with `.md`, `/about-us/team/` at
// `/about-us/team.md` and the start page at `/index.md`, and links it in its
// head.
//
// What takes part: each page of a published post whose type has Markdown on
// in the AI visibility settings, and the start page when its row has it on,
// the page an Admin chose for it by that row and not its type's,
// but for a post marked noindex and a page whose path an excluded pattern
// matches. A page of the site's own, the 404 page, an old address's
// redirect page, a post's later page of a list with pages, which says
// noindex, and a preview, built below a base of its own, have
// none.
// markdownAlternate() tells it of one page and markdownPages() of the whole
// site, as llms.txt and the web server's list want it.
//
// The Markdown is the page's main content, as visitors see it, converted by
// html-to-markdown.js with the page's canonical address as the base of every
// relative link and image. Before the body comes the front matter, and each
// taxonomy's terms by name under the taxonomy's collection, since terms need
// have no pages; then the page's title as a heading, unless the body begins
// with it.
//
// Konzilo's Head writes, in the head of each page that takes part, the link
// to its alternate and MARK, a comment that holds what the alternate's front
// matter says. A build then converts every page that holds the mark, writes
// each alternate beside its page, `about-us/team.md` beside
// `about-us/team/index.html`, and takes the marks away
// (writeMarkdownAlternates()). Astro's dev server answers each address by
// converting the page as it renders it now (devMarkdown()).

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { excludedPaths } from '../ai-visibility.js';
import { MAIN_MARK, pageMarkdown } from './html-to-markdown.js';
import { entryAddress, isStartEntry, startAddress } from './languages.js';
import { isPublicBuild } from './public-site.js';

export { MAIN_MARK };

// The type of an alternate, as its link and the web server give it.
export const MARKDOWN_TYPE = 'text/markdown';

// What Head.astro writes into the head of each page that takes part, until
// the build has made its alternate: a comment, which a browser passes over,
// holding what the alternate says of the page, as JSON in base64.
const MARK = /<!--konzilo:markdown ([A-Za-z0-9+/=]*)-->/g;

// The address of the Markdown alternate of the page at `path`, a path from
// the site's root that ends in a slash: the path without its last slash,
// then `.md`, and `/index.md` for the start page. A path whose last part is
// `index` keeps its slash before `index.md`, so that no page takes the start
// page's.
export function markdownAddress(path) {
  if (path === '/') return '/index.md';
  const trimmed = path.replace(/\/$/, '');
  return trimmed.endsWith('/index') ? `${trimmed}/index.md` : `${trimmed}.md`;
}

// The path of the page whose alternate is at `address`, or null for an
// address that is no alternate's.
export function pageOfMarkdown(address) {
  if (!address.startsWith('/') || !address.endsWith('.md')) return null;
  const stem = address.slice(0, -'.md'.length);
  const path = stem.endsWith('/index') ? stem.slice(0, -'index'.length) : `${stem}/`;
  return path !== '//' && markdownAddress(path) === address ? path : null;
}

// The AI visibility settings, as the site settings hold them, or the core's
// defaults, from the site description's read form, while the site has none.
export function aiSettings(settings, site) {
  if (settings?.ai) return settings.ai;
  const group = site.groups.find((found) => found.name === 'ai');
  const of = (part) => Object.fromEntries(part.settings.filter((setting) => setting.default !== undefined).map((setting) => [setting.name, setting.default]));
  return {
    home: of(group.parts.find((part) => part.name === 'home')),
    types: Object.fromEntries((group.types ?? []).map((part) => [part.type, of(part)])),
  };
}

// The page of a post at its public address, in its language on a site in
// several, or null for a type without one.
function postPath(type, entry, site) {
  return entryAddress(type, entry.id, site.languages);
}

// The start pages' addresses: the root, or on a site in several languages
// each language's start page, at its prefix, since the root leads on.
function startPaths(site) {
  return site.languages.length > 1 ? site.languages.map((language) => startAddress(language, site.languages)) : ['/'];
}

// Whether the page passes every rule but the excluded paths: a post of a
// type whose row has Markdown on, not marked noindex, or the start page
// with its row on, the page an Admin chose for it not marked noindex.
function candidate({ entry, type, path }, ai, site) {
  const noindex = () => {
    const seo = type.fields.find((field) => field.kind === 'seo');
    return Boolean(seo && entry.data[seo.name]?.noindex === true);
  };
  if (entry === null) return startPaths(site).includes(path) && ai.home?.markdown === true;
  if (type === null) return false;
  if (isStartEntry(entry.id)) return ai.home?.markdown === true && !noindex();
  return ai.types?.[type.name]?.markdown === true && !noindex();
}

// Each page of the site that passes every rule but the excluded paths, as
// { entry, type, path, start }: the start page, `start` true, the page an
// Admin chose for it where there is one, then the posts of each type with an
// address, in Astro's order.
async function candidates(site, ai, getCollection) {
  const found = [];
  const chosen = await chosenStart(site, getCollection);
  for (const path of startPaths(site)) {
    const start = chosen ?? { entry: null, type: null, path };
    if (candidate(start, ai, site)) found.push({ ...start, start: true });
  }
  for (const type of Object.values(site.types)) {
    if (type.address === null || ai.types?.[type.name]?.markdown !== true) continue;
    for (const entry of await getCollection(type.collection)) {
      if (isStartEntry(entry.id)) continue;
      const page = { entry, type, path: postPath(type, entry, site) };
      if (page.path !== null && candidate(page, ai, site)) found.push(page);
    }
  }
  return found;
}

// The page an Admin chose as the start page, as { entry, type, path }, or null.
async function chosenStart(site, getCollection) {
  for (const type of Object.values(site.types)) {
    if (type.address === null) continue;
    const entry = (await getCollection(type.collection)).find((one) => isStartEntry(one.id));
    if (entry) return { entry, type, path: postPath(type, entry, site) };
  }
  return null;
}

// Which paths the excluded paths leave out, by the patterns' text: the
// answer for every path asked of the text so far. A path not yet asked is
// asked with every other page of the site that may take part, so that a build
// asks once and the dev server once per change.
const excludedByText = new Map();

async function isExcluded(text, path, site, ai, getCollection) {
  if (text.trim() === '') return false;
  if (!excludedByText.has(text)) excludedByText.set(text, new Map());
  const known = excludedByText.get(text);
  if (!known.has(path)) {
    const asked = [...new Set([path, ...(await candidates(site, ai, getCollection)).map((page) => page.path)])].filter((one) => !known.has(one));
    const excluded = new Set(excludedPaths(text, asked));
    for (const one of asked) known.set(one, excluded.has(one));
  }
  return known.get(path);
}

// The address of the Markdown alternate of a page, from its path on the
// site, or null when it takes part in none: the function that tells it, for
// Head.astro and for whatever else lists the pages that have one. `entry`:
// the entry the page shows, as Astro gives it, or null for a page of the
// site's own; `type`: its type, as the site description's read form `site`
// declares it, or null; `path`: the page's path from the site's root, a
// post's public address; `page`: the number of a post's page of a list
// with pages, 1 for its first; `settings`: the site settings' data,
// undefined while the site has none; `base`: the base the site is built
// below, '/' for the public site. `getCollection` is Astro's, which reads
// the site's other pages when the excluded paths are asked.
export async function markdownAlternate({ entry = null, type = null, path, page = 1, settings, site, base = '/' }, { getCollection }) {
  if (!isPublicBuild(base) || page > 1) return null;
  const ai = aiSettings(settings, site);
  if (!candidate({ entry, type, path }, ai, site)) return null;
  if (await isExcluded(ai.excludedPaths ?? '', path, site, ai, getCollection)) return null;
  return markdownAddress(path);
}

// Every page of the site that has a Markdown alternate, as { entry, type,
// path, start, markdown }, the start page first, then the posts of each type in
// Astro's order: the same pages markdownAlternate() tells of.
export async function markdownPages({ settings, site }, { getCollection }) {
  const ai = aiSettings(settings, site);
  const pages = [];
  for (const page of await candidates(site, ai, getCollection)) {
    if (!(await isExcluded(ai.excludedPaths ?? '', page.path, site, ai, getCollection))) pages.push({ ...page, markdown: markdownAddress(page.path) });
  }
  return pages;
}

// Head.astro's link to the page's alternate, as an entry of ALTERNATES in
// search-and-sharing.js.
export async function markdownLink(page, astro) {
  const address = await markdownAlternate(page, astro);
  return address === null ? [] : [{ type: MARKDOWN_TYPE, href: new URL(address, page.origin).href }];
}

// What Head.astro writes for the page's alternate where its build finds it,
// or '' for a page that takes part in none: MARK, holding the alternate's
// address, the page's canonical address, its title and the front matter.
// The page is as Head.astro has it: `entry`, the entry it shows, or null;
// `path`, its path from the site's root, which a post's public address
// stands in for; `title`, the title a page of the site's own gives its
// layout; `origin`, the public host's; `page`, `settings`, `site` and
// `base` as markdownAlternate() takes them. `getImage` and `getEntries` are Astro's:
// the featured image is made at its full size, as the site's other images
// are, and a post's terms are read by name.
export async function markdownMark({ entry = null, path: own, page = 1, origin, settings, site, base, title }, astro) {
  const type = entry === null ? null : Object.values(site.types).find((declared) => declared?.collection === entry.collection) ?? null;
  const path = (type && postPath(type, entry, site)) ?? own;
  const address = await markdownAlternate({ entry, type, path, page, settings, site, base }, astro);
  if (address === null) return '';
  const url = new URL(path, origin).href;
  const named = entry === null ? title || settings?.title || '' : entry.data.title ?? '';
  const front = await frontMatter({ entry, type, url, title: named }, origin, astro);
  const data = { markdown: address, url, title: named, front };
  return `<!--konzilo:markdown ${Buffer.from(JSON.stringify(data)).toString('base64')}-->`;
}

// The alternate's front matter, between `---` fences, each key left out when it has no value: `title`,
// `canonical_url`, `date` as YYYY-MM-DD, `featured_image` on the public
// host, and each taxonomy's terms by name under its collection's name.
async function frontMatter({ entry, type, url, title }, origin, { getImage, getEntries }) {
  const lines = [];
  if (title) lines.push(`title: ${quoted(title)}`);
  lines.push(`canonical_url: ${quoted(url)}`);
  const field = (kind) => (entry === null ? undefined : type.fields.find((found) => found.kind === kind));
  const date = field('date') && entry.data[field('date').name];
  if (date instanceof Date) lines.push(`date: ${date.toISOString().slice(0, 10)}`);
  const image = field('image') && entry.data[field('image').name];
  if (image?.src) lines.push(`featured_image: ${quoted(new URL((await getImage({ src: image.src })).src, origin).href)}`);
  for (const terms of entry === null ? [] : type.fields.filter((found) => found.kind === 'terms' && found.taxonomy)) {
    const references = entry.data[terms.name] ?? [];
    const names = references.length === 0 ? [] : (await getEntries(references)).map((term) => term.data.name);
    if (names.length > 0) lines.push(`${terms.taxonomy.collection}:`, ...names.map((name) => `  - ${quoted(name)}`));
  }
  return `---\n${lines.join('\n')}\n---\n`;
}

// A double-quoted YAML scalar.
function quoted(value) {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('\t', '\\t')}"`;
}

// The marks of a page, each what it holds.
export function marksOf(html) {
  return [...html.matchAll(MARK)].map(([, data]) => JSON.parse(Buffer.from(data, 'base64').toString('utf8')));
}

// The path of a built page from the release's root, `about/index.html` as
// `/about/`, for a message.
function pathOfFile(file) {
  return `/${file.replace(/\\/g, '/').replace(/(^|\/)index\.html$/, '$1')}`;
}

// The release's list of the pages that have a Markdown alternate, for the
// web server: `<page> <alternate>` a line, `/about/ /about.md`,
// in the order of the pages' addresses, each address as browsers send it.
// Every public build writes it, empty when no page takes part. The web server
// takes it as it takes `_redirects`: the public host links each page's
// alternate and answers it at the page's address to a request that prefers
// Markdown.
export const MARKDOWN_LIST = '_markdown';

// MARKDOWN_LIST's text for the alternates writeMarkdownAlternates() wrote.
export function markdownList(written) {
  const lines = written.map(({ page, markdown }) => [encodeURI(page), encodeURI(markdown)]);
  return lines.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map((line) => `${line.join(' ')}\n`).join('');
}

// Make the Markdown alternate of every page of the release `dir` (a file
// URL) that holds the mark, beside it, and take the marks away. A page whose
// main content cannot be told fails the build, naming it and what to mark.
// Gives the alternates written, each { page,
// markdown }, the page's path from the release's root and the alternate's,
// decoded.
export function writeMarkdownAlternates(dir) {
  const release = fileURLToPath(dir);
  const pages = [];
  for (const file of readdirSync(release, { recursive: true }).sort()) {
    if (!file.endsWith('.html')) continue;
    const path = join(release, file);
    const html = readFileSync(path, 'utf8');
    const marks = marksOf(html);
    if (marks.length === 0) continue;
    writeFileSync(path, html.replaceAll(MARK, ''));
    const [mark] = marks;
    pages.push({ page: pathOfFile(file), html, markdown: mark.markdown, url: mark.url, title: mark.title, front: mark.front });
  }
  if (pages.length === 0) return [];
  const answers = pages.map(({ html, url, title, front }) => pageMarkdown({ html, url, title, front }));
  const problems = pages.flatMap((page, index) => (answers[index].problem ? [`${page.page}: ${answers[index].problem}`] : []));
  if (problems.length > 0) throw new Error(`Konzilo makes a Markdown alternate of each of these pages from its main content, which it cannot tell:\n${problems.join('\n')}`);
  return pages.map((page, index) => {
    const markdown = decodeURIComponent(page.markdown);
    const file = join(release, markdown);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, answers[index].markdown);
    return { page: page.page, markdown };
  });
}

// The page at `path` as Astro's dev server renders it now, from the dev
// server itself, asked with `headers` besides: { status, html }.
export function renderedPage(server, path, headers = {}) {
  const { address, port } = server.httpServer.address();
  // The address it listens at, a wildcard's loopback in its place.
  const host = address === '0.0.0.0' || address === undefined ? '127.0.0.1' : address === '::' ? '::1' : address;
  return new Promise((resolve, reject) => {
    const asked = request({ host, port, path, method: 'GET', headers: { accept: 'text/html', ...headers } }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, html: Buffer.concat(chunks).toString('utf8') }));
      response.on('error', reject);
    });
    asked.on('error', reject);
    asked.end();
  });
}

// The most ranges and characters of an Accept header the public host weighs,
// each range against each other: a longer header gets HTML there, and so here.
export const ACCEPT_RANGES = 32;
export const ACCEPT_LENGTH = 1024;

// What trimming takes off each end.
const TRIMMED = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g;
const WEIGHT_NAME = /^q(?:[\t\n\x0B\f\r ]*=[\t\n\x0B\f\r ]*([^\n]*))?$/;
const WEIGHT = /^(?:0(?:\.[0-9]{0,3})?|1(?:\.0{0,3})?)$/;

// Whether a request's Accept header prefers a page's Markdown to its HTML: only
// when an explicit text/markdown or text/x-markdown range has a positive
// weight strictly above the effective weight of both text/html and
// application/xhtml+xml, each the weight of its most specific range, the
// exact type, then text/* or application/*, then */*, or 0. The header is
// read in ASCII lowercase, split at each comma, and each range at each
// semicolon, trimmed; an omitted weight is 1, and one outside
// RFC 9110's grammar, missing, or repeated is 0. Equal weights keep HTML,
// and wildcards alone never give Markdown. A header of more than
// ACCEPT_RANGES ranges or ACCEPT_LENGTH characters gets HTML, as on the
// public host.
export function prefersMarkdown(accept = '') {
  const header = String(accept);
  const ranges = header.replace(/[A-Z]+/g, (letters) => letters.toLowerCase()).split(',');
  if (header.length > ACCEPT_LENGTH || ranges.length > ACCEPT_RANGES) return false;
  const weights = new Map();
  for (const range of ranges) {
    const [type, ...parameters] = range.split(';').map((part) => part.replace(TRIMMED, ''));
    let weight = 1;
    let weighed = false;
    for (const parameter of parameters) {
      const named = WEIGHT_NAME.exec(parameter);
      if (named === null) continue;
      if (weighed) {
        weight = 0;
        break;
      }
      weighed = true;
      const value = named[1] ?? '';
      weight = WEIGHT.test(value) ? Number(value) : 0;
    }
    weights.set(type, Math.max(weights.get(type) ?? 0, weight));
  }
  const effective = (...types) => weights.get(types.find((type) => weights.has(type))) ?? 0;
  const markdown = Math.max(weights.get('text/markdown') ?? 0, weights.get('text/x-markdown') ?? 0);
  const html = Math.max(effective('text/html', 'text/*', '*/*'), effective('application/xhtml+xml', 'application/*', '*/*'));
  return markdown > 0 && markdown > html;
}

// A Link header's value.
const link = (href, rel, type) => `<${href}>; rel="${rel}"${type ? `; type="${type}"` : ''}`;

// The page's Markdown, made from the page at `path` (as a browser sends it)
// as the dev server renders it now, as a build writes it, answered with the
// alternate's headers and `headers` besides; false, answering nothing, where
// the page has no alternate at `address`, decoded. A page whose main
// content cannot be told is answered 500, saying why, and the log names it.
async function answerMarkdown({ server, logger }, req, res, { path, address, headers = {} }) {
  const { status, html } = await renderedPage(server, path);
  const [mark] = status === 200 ? marksOf(html) : [];
  if (mark === undefined || mark.markdown !== address) return false;
  const answer = pageMarkdown({ html, url: mark.url, title: mark.title, front: mark.front });
  if (answer.problem) {
    logger.error(`${path}: ${answer.problem}`);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Konzilo makes this page's Markdown from its main content, which it cannot tell: ${answer.problem}\n`);
    return true;
  }
  const body = Buffer.from(answer.markdown);
  res.writeHead(200, { 'Content-Type': `${MARKDOWN_TYPE}; charset=utf-8`, 'Content-Length': body.length, Link: link(mark.url, 'canonical'), ...headers });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}

// Astro's dev server's answer to each address of a Markdown alternate:
// the page's Markdown, made from the page as the dev server renders it now,
// as a build writes it, naming the page in a Link header, or nothing, so
// that the dev server answers 404, where the page has none. `server` is Vite's
// dev server; `logger` Astro's.
export function devMarkdown({ server, logger }) {
  return async (req, res, next) => {
    const asked = new URL(req.url, 'http://localhost').pathname;
    if (!['GET', 'HEAD'].includes(req.method) || !asked.endsWith('.md')) return next();
    let address;
    try {
      address = decodeURIComponent(asked);
    } catch {
      return next();
    }
    if (pageOfMarkdown(address) === null) return next();
    try {
      return (await answerMarkdown({ server, logger }, req, res, { path: pageOfMarkdown(asked), address })) || next();
    } catch (error) {
      return next(error);
    }
  };
}

// Astro's dev server's Link headers and negotiation, as the public host's
// every HTML page it answers with 2xx links
// `related`, the addresses of llms.txt and llms-full.txt, on `origin`, the
// public host's, and a page with an alternate links that first; such a
// page varies by Accept, and its own address answers a GET or a HEAD with
// its Markdown, as devMarkdown() does, where the request prefers Markdown
// (prefersMarkdown()). It holds each HTML answer until it ends, to read
// the page's mark.
export function devDiscovery({ server, logger, origin, related }) {
  const site = related.map((address) => link(new URL(address, origin).href, 'related', 'text/plain'));
  return async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return next();
    const asked = new URL(req.url, 'http://localhost').pathname;
    if (asked.endsWith('/') && prefersMarkdown(req.headers.accept)) {
      let address = null;
      try {
        address = markdownAddress(decodeURIComponent(asked));
      } catch {
        // No address a page has.
      }
      try {
        if (address !== null && (await answerMarkdown({ server, logger }, req, res, { path: asked, address, headers: { Vary: 'Accept' } }))) return undefined;
      } catch (error) {
        return next(error);
      }
    }
    holdHtml(res, (html) => {
      const [mark] = marksOf(html);
      const own = mark === undefined ? [] : [link(new URL(mark.markdown, origin).href, 'alternate', MARKDOWN_TYPE)];
      return { links: [...own, ...site], vary: mark !== undefined };
    });
    return next();
  };
}

// Hold an answer of `res` that is an HTML page with 2xx until it ends, then
// give it the Link headers and Vary that `headersOf(html)` gives, { links,
// vary }, and send it whole. Any other answer goes as it comes.
function holdHtml(res, headersOf) {
  const own = { writeHead: res.writeHead, write: res.write, end: res.end };
  let held = null;
  const chunks = [];
  const restore = () => Object.assign(res, own);
  const valueOf = (headers, name) => {
    const found = headers.find(([key]) => key.toLowerCase() === name);
    return found === undefined ? res.getHeader(name) : found[1];
  };
  const pairs = (given) => (Array.isArray(given) ? given.reduce((all, value, index) => (index % 2 ? all : [...all, [value, given[index + 1]]]), []) : Object.entries(given ?? {}));
  res.writeHead = function writeHead(status, ...rest) {
    const given = rest.find((one) => one !== null && typeof one === 'object');
    const type = String(valueOf(pairs(given), 'content-type') ?? '');
    if (status >= 200 && status < 300 && type.startsWith('text/html')) {
      held = { status, message: typeof rest[0] === 'string' ? rest[0] : undefined, headers: pairs(given) };
      return res;
    }
    restore();
    return own.writeHead.call(res, status, ...rest);
  };
  const chunk = (data, encoding) => (typeof data === 'string' ? Buffer.from(data, typeof encoding === 'string' ? encoding : 'utf8') : Buffer.from(data));
  res.write = function write(data, encoding, done) {
    if (held === null && !res.headersSent) res.writeHead(res.statusCode);
    if (held === null) return own.write.call(res, data, encoding, done);
    if (data !== undefined && data !== null) chunks.push(chunk(data, encoding));
    (typeof encoding === 'function' ? encoding : done)?.();
    return true;
  };
  res.end = function end(data, encoding, done) {
    if (held === null && !res.headersSent) res.writeHead(res.statusCode);
    if (held === null) return own.end.call(res, data, encoding, done);
    if (data !== undefined && data !== null && typeof data !== 'function') chunks.push(chunk(data, encoding));
    const body = Buffer.concat(chunks);
    const { links, vary } = headersOf(body.toString('utf8'));
    const headers = held.headers.filter(([key]) => !['link', 'vary'].includes(key.toLowerCase()));
    const varied = [valueOf(held.headers, 'vary'), vary ? 'Accept' : null].flat().filter(Boolean);
    const before = [valueOf(held.headers, 'link')].flat().filter(Boolean);
    if (before.length + links.length > 0) headers.push(['Link', [...before, ...links]]);
    if (varied.length > 0) headers.push(['Vary', varied.join(', ')]);
    restore();
    if (held.message === undefined) own.writeHead.call(res, held.status, Object.fromEntries(headers));
    else own.writeHead.call(res, held.status, held.message, Object.fromEntries(headers));
    const callback = [data, encoding, done].find((one) => typeof one === 'function');
    return own.end.call(res, body, callback);
  };
}
