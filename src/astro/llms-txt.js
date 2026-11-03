// llms.txt and llms-full.txt, the public site's two files for AI
// agents, made from the pages that have a
// Markdown alternate (markdown-alternates.js): every build of the public
// site writes both, Astro's dev server answers both, and a preview, below a
// base of its own, has neither. Both are text/plain, and their bytes follow
// the content and the settings alone.
//
// `/llms.txt` is an index: the site's title as a heading, its description
// as a quote, a line naming llms-full.txt while it holds a page, the start
// page while its row has llms.txt on, and a section per post type whose row
// has it on and that has a page, named by the type's plural label: `page`
// first, then `post`, then the rest in the site description's order. Each
// page is an item that links its alternate, with the post's title and its
// summary (summary.js) on one line, cut to 200 code points
// cuts it. A type's posts come newest first, by its date; a type without
// one, by title.
//
// `/llms-full.txt` is the same heading and quote, then the alternate of
// each page whose row has llms-full.txt on, front matter and all, in the
// index's order, a blank line between them. A build makes it from the
// alternates it writes, not by converting a page again: the route writes
// where each goes (llmsFullPlan()), and once the alternates are written,
// writeLlmsFull() puts each in place. Astro's dev server converts the pages
// as it renders them now (devLlmsFull()).
//
// Both hold a page only where it has its alternate: one whose
// template renders no Konzilo Head has none, so llms.txt leaves it out as
// llms-full.txt does, and a section left without a page with it, and names
// llms-full.txt only while that holds a page. Its route writes each item,
// and that line, with a mark (llmsTxt()), which writeLlms() in a build, and
// devLlms() in the dev server, takes away with the line where it must go.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { languageTag } from '../site-description.js';
import { pageMarkdown } from './html-to-markdown.js';
import { aiSettings, markdownPages, marksOf, pageOfMarkdown, renderedPage } from './markdown-alternates.js';
import { summary } from './summary.js';

// The two files' addresses, and their type.
export const LLMS = '/llms.txt';
export const LLMS_FULL = '/llms-full.txt';
export const LLMS_CONTENT_TYPE = 'text/plain; charset=utf-8';

// The most code points of a description in llms.txt, before `…`.
export const DESCRIPTION_LENGTH = 200;

// Text on one line: each run of spaces and line breaks one space.
function oneLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// A description in llms.txt: on one line and whole
// up to DESCRIPTION_LENGTH code points; a longer one cut there, the spaces
// it then ends in taken away, and `…` added.
function described(text) {
  const characters = [...oneLine(text)];
  if (characters.length <= DESCRIPTION_LENGTH) return characters.join('');
  return `${characters.slice(0, DESCRIPTION_LENGTH).join('').trimEnd()}…`;
}

// A link's text on one line, with what would end it or open a code span
// escaped, a backslash first.
function label(text) {
  return oneLine(text).replace(/[\\`[\]]/g, (character) => `\\${character}`);
}

// The site's types in the files' order: `page`, `post`, then the others in
// the site description's order.
function inOrder(site) {
  const types = Object.values(site.types);
  const first = ['page', 'post'].map((name) => types.find((type) => type.name === name)).filter(Boolean);
  return [...first, ...types.filter((type) => !first.includes(type))];
}

// The order of a type's posts: newest first by its date, else by title in
// the site's language; then by path.
function order(type, language) {
  const date = type.fields.find((field) => field.kind === 'date')?.name;
  const titles = new Intl.Collator(languageTag(language ?? null));
  const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (date) return (a, b) => (b.entry.data[date]?.valueOf() ?? 0) - (a.entry.data[date]?.valueOf() ?? 0) || byPath(a, b);
  return (a, b) => titles.compare(a.entry.data.title ?? '', b.entry.data.title ?? '') || byPath(a, b);
}

// The pages of the two files, each as markdownPages() gives it: `home`, the
// start page, or null; `sections`, each type with its pages in order,
// [{ type, pages }], every type with a page in either file; and the rows'
// choices, `ai`, as the settings hold them or the core's defaults.
async function filePages({ settings, site }, { getCollection }) {
  const ai = aiSettings(settings, site);
  const pages = await markdownPages({ settings, site }, { getCollection });
  const home = pages.find((page) => page.entry === null) ?? null;
  const sections = inOrder(site)
    .map((type) => ({ type, pages: pages.filter((page) => page.type?.name === type.name).sort(order(type, site.language)) }))
    .filter((section) => section.pages.length > 0);
  return { home, sections, ai };
}

// The pages llms-full.txt holds, in the index's order, each as
// markdownPages() gives it.
function fullPages({ home, sections, ai }) {
  return [
    ...(home && ai.home?.llmsFull === true ? [home] : []),
    ...sections.filter(({ type }) => ai.types?.[type.name]?.llmsFull === true).flatMap((section) => section.pages),
  ];
}

// The heading both files begin with: the site's title, then its
// description as a quote, where it has one.
function heading(title, description) {
  return [`# ${title}`, ...(description ? [`> ${description}`] : [])];
}

// llms.txt for the public host `origin`, as its route writes it, from the
// site settings `settings` (the main language's, undefined while the site
// has none) and the site description as checked, `site`; `getCollection`
// is Astro's. Each item, and the line naming llms-full.txt, starts with its
// mark, which llmsTxtOf() takes away.
export async function llmsTxt({ settings, site, origin }, { getCollection }) {
  const pages = await filePages({ settings, site }, { getCollection });
  const { home, sections, ai } = pages;
  const title = oneLine(settings?.title ?? '');
  const description = oneLine(settings?.search?.description ?? '');
  const item = (text, markdown, said) => {
    const about = described(said);
    return `${itemMark(markdown)}- [${label(text)}](${new URL(markdown, origin).href})${about ? `: ${about}` : ''}`;
  };
  const blocks = heading(title, description);
  if (fullPages(pages).length > 0) blocks.push(`${FULL_TEXT}Markdown index of ${title} for AI agents. Full text: ${origin}${LLMS_FULL}`);
  if (home && ai.home?.llms === true) blocks.push(item(title, home.markdown, description));
  for (const { type, pages: listed } of sections) {
    if (ai.types?.[type.name]?.llms !== true) continue;
    blocks.push([`## ${type.plural}`, ...listed.map(({ entry, markdown }) => item(entry.data.title ?? '', markdown, summary(entry)))].join('\n'));
  }
  return `${blocks.join('\n\n')}\n`;
}

// The marks llms.txt's route writes: an item's, before its line, with its
// alternate's address encoded as in a URL, and the line naming
// llms-full.txt's.
const ITEM = /^<!--konzilo:llms (\S+)-->/;
const itemMark = (markdown) => `<!--konzilo:llms ${encodeURI(markdown)}-->`;
const FULL_TEXT = '<!--konzilo:llms-full-text-->';

// The addresses of the alternates llms.txt's route names, in order, decoded.
function itemsIn(plan) {
  return plan.split('\n').flatMap((line) => {
    const found = ITEM.exec(line);
    return found ? [decodeURI(found[1])] : [];
  });
}

// llms.txt from what its route writes, { text, missing }: each item whose
// alternate `has(address)` says is there, a section with none left out
// with its heading, and the line naming llms-full.txt only where `full`,
// whether that holds a page; `missing` names the alternates left out.
function llmsTxtOf(plan, has, { full }) {
  const missing = [];
  const blocks = plan.replace(/\n$/, '').split('\n\n').flatMap((block) => {
    if (block.startsWith(FULL_TEXT)) return full ? [block.slice(FULL_TEXT.length)] : [];
    const lines = block.split('\n');
    if (!lines.some((line) => ITEM.test(line))) return [block];
    const kept = lines.filter((line) => {
      const found = ITEM.exec(line);
      if (!found || has(decodeURI(found[1]))) return true;
      missing.push(decodeURI(found[1]));
      return false;
    }).map((line) => line.replace(ITEM, ''));
    return kept.some((line) => line.startsWith('- ')) ? [kept.join('\n')] : [];
  });
  return { text: `${blocks.join('\n\n')}\n`, missing };
}

// Where llms-full.txt holds a page's alternate, until it is put in place: a
// line of its own, the alternate's address encoded as in a URL.
const PLACE = /^<!--konzilo:llms-full (\S+)-->$/gm;

const place = (markdown) => `<!--konzilo:llms-full ${encodeURI(markdown)}-->`;

// What the route of llms-full.txt writes, from the site settings and the
// site description, as llmsTxt() takes them: its heading, then a place for
// each page's alternate, which the build or the dev server fills
// (llmsFull()).
export async function llmsFullPlan({ settings, site }, { getCollection }) {
  const pages = fullPages(await filePages({ settings, site }, { getCollection }));
  const blocks = heading(oneLine(settings?.title ?? ''), oneLine(settings?.search?.description ?? ''));
  return `${[...blocks, ...pages.map(({ markdown }) => place(markdown))].join('\n\n')}\n`;
}

// The addresses of the alternates the plan of llms-full.txt has places for,
// in order, decoded.
function placesIn(plan) {
  return [...plan.matchAll(PLACE)].map(([, address]) => decodeURI(address));
}

// llms-full.txt from its plan, { text, missing }: its heading, then each
// alternate that `markdownOf(address)` gives, without the line breaks it
// ends in, a blank line between them; those it gives null for are left
// out, and `missing` names them, each a warning() takes.
function llmsFull(plan, markdownOf) {
  const parts = [plan.replace(PLACE, '').trimEnd()];
  const missing = [];
  for (const address of placesIn(plan)) {
    const markdown = markdownOf(address);
    if (markdown === null) missing.push(address);
    else parts.push(markdown.replace(/\n+$/, ''));
  }
  return { text: `${parts.join('\n\n')}\n`, missing };
}

// The one warning of the alternates a file, LLMS or LLMS_FULL, left out,
// naming the first 20 pages, or null for none.
function warning(missing, file = LLMS_FULL) {
  if (missing.length === 0) return null;
  const named = missing.slice(0, 20).map((address) => `- ${pageOfMarkdown(address) ?? address}`);
  if (missing.length > 20) named.push(`- and ${missing.length - 20} more`);
  return `${file.slice(1)} leaves out these pages, which have no Markdown alternate, since their templates render no Konzilo Head:\n${named.join('\n')}`;
}

// Put each page's alternate in place in the llms-full.txt the build wrote
// into the release `dir` (a file URL), from the alternates written beside
// the pages. Those the release has not got, of pages whose templates render
// no Konzilo Head, are left out, and `warn` is told once. Returns how many
// pages it holds, or null for a release without llms-full.txt, a
// preview's, which is left as it is.
export function writeLlmsFull(dir, warn) {
  const release = fileURLToPath(dir);
  const file = join(release, LLMS_FULL);
  if (!existsSync(file)) return null;
  const plan = readFileSync(file, 'utf8');
  const { text, missing } = llmsFull(plan, (address) => {
    const alternate = join(release, address);
    return existsSync(alternate) ? readFileSync(alternate, 'utf8') : null;
  });
  writeFileSync(file, text);
  if (missing.length > 0) warn(warning(missing));
  return placesIn(plan).length - missing.length;
}

// Leave out of the llms.txt the build wrote into the release `dir` (a file
// URL) each page whose alternate the release has not got, as
// writeLlmsFull() leaves it out, and the line naming llms-full.txt unless
// `full`, whether that holds a page; `warn` is told once of the pages left
// out. A release without llms.txt, a preview's, is left as it is.
export function writeLlms(dir, warn, { full }) {
  const release = fileURLToPath(dir);
  const file = join(release, LLMS);
  if (!existsSync(file)) return;
  const { text, missing } = llmsTxtOf(readFileSync(file, 'utf8'), (address) => existsSync(join(release, address)), { full });
  writeFileSync(file, text);
  if (missing.length > 0) warn(warning(missing, LLMS));
}

// The header that asks Astro's dev server for what the route of llms.txt or
// llms-full.txt writes, past devLlms() and devLlmsFull().
const PLAN = 'x-konzilo-llms-full';

// Astro's dev server's answer at /llms.txt: what its route writes, each item
// kept where the page as the dev server renders it now has the mark of its
// alternate, as a build keeps it, and the line naming llms-full.txt where a
// page llms-full.txt's route names has its. `server` is Vite's dev server;
// `logger` Astro's.
export function devLlms({ server, logger }) {
  return async (req, res, next) => {
    const asked = new URL(req.url, 'http://localhost').pathname;
    if (asked !== LLMS || !['GET', 'HEAD'].includes(req.method) || req.headers[PLAN] !== undefined) return next();
    try {
      const plan = await renderedPage(server, LLMS, { [PLAN]: '1' });
      if (plan.status !== 200) return next();
      const full = await renderedPage(server, LLMS_FULL, { [PLAN]: '1' });
      const known = new Map();
      const has = async (address) => {
        if (!known.has(address)) {
          const { status, html } = await renderedPage(server, encodeURI(pageOfMarkdown(address)));
          known.set(address, status === 200 && marksOf(html).some((mark) => mark.markdown === address));
        }
        return known.get(address);
      };
      for (const address of itemsIn(plan.html)) await has(address);
      let holds = false;
      for (const address of full.status === 200 ? placesIn(full.html) : []) {
        if (await has(address)) {
          holds = true;
          break;
        }
      }
      const { text, missing } = llmsTxtOf(plan.html, (address) => known.get(address), { full: holds });
      if (missing.length > 0) logger.warn(warning(missing, LLMS));
      const body = Buffer.from(text);
      res.writeHead(200, { 'Content-Type': LLMS_CONTENT_TYPE, 'Content-Length': body.length });
      return res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      return next(error);
    }
  };
}

// Astro's dev server's answer at /llms-full.txt: the plan its route writes,
// with each page's alternate in place, made from the page as the dev server
// renders it now, as a build writes it. `root` is
// the site repository; `server` Vite's dev server; `logger` Astro's. A page
// whose main content cannot be told is answered 500, saying why, and the log
// names it; one whose page holds no mark is left out, and the log says so.
export function devLlmsFull({ server, logger }) {
  return async (req, res, next) => {
    const asked = new URL(req.url, 'http://localhost').pathname;
    if (asked !== LLMS_FULL || !['GET', 'HEAD'].includes(req.method) || req.headers[PLAN] !== undefined) return next();
    try {
      const plan = await renderedPage(server, LLMS_FULL, { [PLAN]: '1' });
      if (plan.status !== 200) return next();
      const pages = [];
      for (const address of placesIn(plan.html)) {
        const { status, html } = await renderedPage(server, encodeURI(pageOfMarkdown(address)));
        const [mark] = status === 200 ? marksOf(html) : [];
        if (mark?.markdown === address) pages.push({ address, html, url: mark.url, title: mark.title, front: mark.front });
      }
      const answers = pages.map(({ html, url, title, front }) => pageMarkdown({ html, url, title, front }));
      const problems = pages.flatMap((page, index) => (answers[index].problem ? [`${pageOfMarkdown(page.address)}: ${answers[index].problem}`] : []));
      if (problems.length > 0) {
        for (const problem of problems) logger.error(problem);
        res.writeHead(500, { 'Content-Type': LLMS_CONTENT_TYPE });
        return res.end(`Konzilo makes llms-full.txt from each page's Markdown, made from its main content, which it cannot tell:\n${problems.join('\n')}\n`);
      }
      const made = new Map(pages.map((page, index) => [page.address, answers[index].markdown]));
      const { text, missing } = llmsFull(plan.html, (address) => made.get(address) ?? null);
      if (missing.length > 0) logger.warn(warning(missing));
      const body = Buffer.from(text);
      res.writeHead(200, { 'Content-Type': LLMS_CONTENT_TYPE, 'Content-Length': body.length });
      return res.end(req.method === 'HEAD' ? undefined : body);
    } catch (error) {
      return next(error);
    }
  };
}
