// An incoming feed's item's text as a post's body (ADR 0079): its HTML, or its plain text, turned
// into the body elements of the content format that the post's type takes, as Markdown the intake
// reads back as the item's text. What the type does not take is left out and named, so that the
// build warns of it: a heading, a list, a quote or a code block becomes paragraphs of its text, and
// a table, or a table that is no simple table, goes whole. An item's images and media, which come
// without alt text (ADR 0022), its frames, scripts and forms are never taken, and never named.
//
// The body is checked as the intake checks it; one that the intake would refuse all the same is
// made again of the text's paragraphs alone.

import { parseFragment } from 'parse5';

import { canonicalAddress } from '../format/addresses.js';
import { checkBody } from '../format/body.js';
import { reader } from '../intake/reader.js';
import { bodyHands } from '../intake/post-file.js';

// What is never taken, with all it holds.
const NEVER = new Set(['img', 'picture', 'video', 'audio', 'source', 'track', 'iframe', 'embed', 'object', 'svg', 'canvas', 'math', 'script', 'style', 'template', 'noscript', 'form', 'input', 'button', 'select', 'textarea', 'option', 'label', 'map', 'area', 'head', 'title', 'meta', 'link', 'base', 'frame', 'frameset', 'dialog', 'hr']);
// What stands in a block's text.
const INLINE = new Set(['#text', 'a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'font', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'tt', 'u', 'var', 'wbr', 'img', 'picture', 'svg', 'math', 'input', 'button', 'select', 'textarea', 'label']);
const HEADINGS = { h1: 2, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
const LISTS = new Set(['ul', 'ol']);
// Elements a paragraph of their own is made of, their text the paragraph's.
const PARAGRAPHS = new Set(['p', 'dt', 'dd', 'figcaption', 'caption', 'summary', 'address', 'li']);

const isText = (node) => node.nodeName === '#text';
const childrenOf = (node) => (node.nodeName === 'template' ? [] : node.childNodes ?? []);
const attribute = (node, name) => node.attrs?.find((one) => one.name === name)?.value ?? null;
const isInline = (node) => INLINE.has(node.nodeName) || node.nodeName === '#comment';

// Text as Markdown reads it as text: each character that could begin more escaped.
const escaped = (text) => text
  .replace(/\\/g, '\\\\')
  .replace(/[*_`[\]<~$|]|:(?=[\p{L}\p{N}:])/gu, (character) => `\\${character}`)
  .replace(/&(?=#?[A-Za-z0-9]+;)/g, '\\&');

// A line of a block's text, with what would begin another block at its start escaped.
const lineStart = (line) => line
  .replace(/^([#>+=-])/, '\\$1')
  .replace(/^(\d+)([.)])/, '$1\\$2');

// The raw text an element holds.
const rawText = (node) => (isText(node) ? node.value : childrenOf(node).map(rawText).join(''));

// Inline code, between the shortest run of backticks the code does not hold.
function codeSpan(text) {
  const code = text.replace(/\s+/g, ' ');
  if (code.trim() === '') return '';
  const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map(([run]) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = code.startsWith('`') || code.endsWith('`') || (code.startsWith(' ') && code.endsWith(' ')) ? ' ' : '';
  return `${fence}${pad}${code}${pad}${fence}`;
}

// A link's address as a page may lead to it: a whole http or https address, from `base`, or
// `mailto:` or `tel:`; else null, and the link's text stands alone.
function linkAddress(href, base) {
  if (typeof href !== 'string' || href.trim() === '') return null;
  const given = href.trim();
  if (/^(?:mailto|tel):[^\s<>]+$/i.test(given)) return given;
  try {
    return canonicalAddress(new URL(given, base).href);
  } catch {
    return null;
  }
}
const destination = (address) => (/[\s()<>]/.test(address) ? `<${address.replace(/</g, '%3C').replace(/>/g, '%3E')}>` : address);

// Emphasis is marked while a block's text is made, and written once it is whole: `_` around it,
// or `*` where a letter or a digit touches it, which `_` does not mark.
const OPEN = '\u0001';
const CLOSE = '\u0002';
function withEmphasis(text) {
  const characters = [...text];
  const opened = [];
  const marks = new Map();
  const word = (at) => /[\p{L}\p{N}]/u.test(characters[at] ?? '');
  characters.forEach((character, at) => {
    if (character === OPEN) opened.push(at);
    if (character === CLOSE) {
      const from = opened.pop();
      const mark = word(from - 1) || word(at + 1) ? '*' : '_';
      marks.set(from, mark);
      marks.set(at, mark);
    }
  });
  return characters.map((character, at) => (marks.has(at) ? marks.get(at) : character)).join('');
}

// A run of a block's text as Markdown. `breaks`: whether a line break is one, as in a paragraph,
// or a space, as in a heading or a table's cell.
function inline(nodes, context, { breaks }) {
  let made = '';
  for (const node of nodes) made += inlineOf(node, context, { breaks });
  return made;
}

// Bold, italic or struck text: the marks around the text, its spaces outside them.
function wrapped(inner, open, close = open) {
  const [, before, text, after] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner);
  return text === '' ? inner : `${before}${open}${text}${close}${after}`;
}

function inlineOf(node, context, options) {
  if (isText(node)) return escaped(node.value.replace(/\s+/g, ' '));
  if (node.nodeName === '#comment' || NEVER.has(node.nodeName)) return '';
  const inner = () => inline(childrenOf(node), context, options);
  switch (node.nodeName) {
    case 'br':
      return options.breaks ? '\\\n' : ' ';
    case 'b':
    case 'strong':
      return wrapped(inner(), '**');
    case 'i':
    case 'em':
    case 'cite':
    case 'dfn':
    case 'var':
      return wrapped(inner(), OPEN, CLOSE);
    case 's':
    case 'del':
    case 'strike':
      return wrapped(inner(), '~~');
    case 'sub':
    case 'sup':
      return wrapped(escaped(rawText(node).replace(/\s+/g, ' ')), `<${node.nodeName}>`, `</${node.nodeName}>`);
    case 'code':
    case 'kbd':
    case 'samp':
    case 'tt':
      return codeSpan(rawText(node));
    case 'q':
      return `"${inner()}"`;
    case 'a': {
      const text = inline(childrenOf(node), context, { breaks: false });
      const address = linkAddress(attribute(node, 'href'), context.base);
      if (address === null || text.trim() === '') return text;
      return wrapped(text, '[', `](${destination(address)})`);
    }
    default:
      return isInline(node) ? inner() : ` ${inner()} `;
  }
}

// A block's text, its spaces as one, its lines each started safely, or '' where it holds none.
function textOf(nodes, context, { breaks = true } = {}) {
  const made = withEmphasis(inline(nodes, context, { breaks }))
    .split('\\\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line !== '');
  return made.map(lineStart).join('\\\n');
}

// The plain lines of preformatted text, as a paragraph holds them.
const preformattedText = (node) => rawText(node).replace(/\n$/, '').split('\n').map((line) => lineStart(escaped(line.replace(/\s+/g, ' ').trim()))).filter((line) => line !== '').join('\\\n');

// A body's blocks from `nodes`: each a block's Markdown, with `kind` for a list, which one of its
// kind right after it keeps apart from it. `context`: { allowed, dropped, base, within }, `within`
// whether these blocks stand in a quote or a list, where no code block or table does.
function blocks(nodes, context) {
  const made = [];
  let run = [];
  const flush = () => {
    const text = textOf(run, context);
    if (text !== '') made.push({ text });
    run = [];
  };
  for (const node of nodes) {
    if (isInline(node)) {
      run.push(node);
      continue;
    }
    flush();
    made.push(...block(node, context, made.at(-1)));
  }
  flush();
  return made;
}

const drop = (context, element) => context.dropped.add(element);
const paragraphsOf = (node, context) => blocks(childrenOf(node), context);

function block(node, context, previous) {
  const name = node.nodeName;
  if (NEVER.has(name)) return [];
  if (Object.hasOwn(HEADINGS, name)) {
    const text = textOf(childrenOf(node), context, { breaks: false });
    if (text === '') return [];
    if (!context.allowed.has('heading')) {
      drop(context, 'heading');
      return [{ text }];
    }
    return [{ text: `${'#'.repeat(HEADINGS[name])} ${text.replace(/^\\?#/, '\\#').replace(/#/g, (mark, at, all) => (all[at - 1] === '\\' ? mark : '\\#'))}` }];
  }
  if (LISTS.has(name)) {
    if (!context.allowed.has('list')) {
      drop(context, 'list');
      return listItems(node).flatMap((item) => listParagraphs(item, context));
    }
    const lines = listLines(node, context, previous?.kind === name && previous.marker === 'first');
    return lines.length === 0 ? [] : [{ text: lines.join('\n'), kind: name, marker: previous?.kind === name && previous.marker === 'first' ? 'other' : 'first' }];
  }
  if (name === 'blockquote') {
    if (!context.allowed.has('quote')) {
      drop(context, 'quote');
      return paragraphsOf(node, context);
    }
    const inner = blocks(childrenOf(node), { ...context, within: true });
    if (inner.length === 0) return [];
    return [{ text: inner.map(({ text }) => text.split('\n').map((line) => `> ${line}`).join('\n')).join('\n>\n') }];
  }
  if (name === 'pre') {
    if (!context.allowed.has('code')) drop(context, 'code');
    if (!context.allowed.has('code') || context.within) {
      const text = preformattedText(node);
      return text === '' ? [] : [{ text }];
    }
    const code = rawText(node).replace(/\n$/, '').split('\n').map((line) => line.replace(/\s+$/, '')).join('\n');
    if (code.trim() === '') return [];
    const longest = Math.max(0, ...[...code.matchAll(/`+/g)].map(([found]) => found.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    return [{ text: `${fence}\n${code}\n${fence}` }];
  }
  if (name === 'table') {
    const table = context.allowed.has('table') && !context.within ? simpleTable(node, context) : null;
    if (table === null) {
      drop(context, 'table');
      return [];
    }
    return [{ text: table }];
  }
  if (PARAGRAPHS.has(name)) return paragraphsOf(node, context);
  return paragraphsOf(node, context);
}

// A list's items, those of a list in an item left in it.
const listItems = (node) => childrenOf(node).filter((child) => child.nodeName === 'li');

// An item's paragraphs where lists are not taken: its text, then each item of a list in it.
function listParagraphs(item, context) {
  const own = childrenOf(item).filter((child) => !LISTS.has(child.nodeName));
  const nested = childrenOf(item).filter((child) => LISTS.has(child.nodeName));
  return [...blocks(own, { ...context, within: true }), ...nested.flatMap((list) => listItems(list).flatMap((one) => listParagraphs(one, context)))];
}

// A list's lines: each item's marker and its text, its paragraphs apart by a line break, and a list
// in it below it, indented by the width of the item's marker. An item with no text of its own gives
// its list's items in its place. `other`: whether it takes the other marker of its kind.
function listLines(node, context, other) {
  const ordered = node.nodeName === 'ol';
  const lines = [];
  let number = 0;
  for (const item of listItems(node)) {
    const own = childrenOf(item).filter((child) => !LISTS.has(child.nodeName));
    const nested = childrenOf(item).filter((child) => LISTS.has(child.nodeName));
    const text = blocks(own, { ...context, within: true }).map((one) => one.text.replace(/\n/g, ' ')).join('\\\n');
    if (text === '') {
      for (const list of nested) lines.push(...listLines(list, context, other));
      continue;
    }
    number += 1;
    const marker = ordered ? `${number}${other ? ')' : '.'} ` : other ? '* ' : '- ';
    const indent = ' '.repeat(marker.length);
    lines.push(`${marker}${text.split('\\\n').join(`\\\n${indent}`)}`);
    for (const list of nested) for (const line of listLines(list, context, false)) lines.push(`${indent}${line}`);
  }
  return lines;
}

// A table as a pipe table, where it is one: one header row, its first, and rows of as many cells,
// none merged and none holding a block. Else null.
function simpleTable(node, context) {
  const rows = [];
  const walk = (one) => {
    for (const child of childrenOf(one)) {
      if (child.nodeName === 'tr') rows.push(child);
      else if (['thead', 'tbody', 'tfoot'].includes(child.nodeName)) walk(child);
      else if (child.nodeName === 'caption') return false;
    }
    return true;
  };
  if (!walk(node) || rows.length === 0) return null;
  const cells = rows.map((row) => childrenOf(row).filter((child) => child.nodeName === 'td' || child.nodeName === 'th'));
  const width = cells[0].length;
  if (width === 0 || cells.some((row) => row.length !== width)) return null;
  const merged = (cell) => Number(attribute(cell, 'colspan') ?? 1) > 1 || Number(attribute(cell, 'rowspan') ?? 1) > 1;
  const holdsBlock = (cell) => childrenOf(cell).some((child) => !isInline(child) && child.nodeName !== 'p');
  if (cells.flat().some((cell) => merged(cell) || holdsBlock(cell))) return null;
  const row = (list) => `| ${list.map((cell) => textOf(childrenOf(cell), context, { breaks: false })).join(' | ')} |`.replace(/\| {2}\|/g, '|  |');
  return [row(cells[0]), `| ${Array.from({ length: width }, () => '---').join(' | ')} |`, ...cells.slice(1).map(row)].join('\n');
}

// A plain text's paragraphs, by its blank lines, with a line break for each line within one.
const plainBody = (plain) => plain.split(/\n\s*\n/).map((paragraph) => paragraph.split('\n').map((line) => lineStart(escaped(line.replace(/\s+/g, ' ').trim()))).filter((line) => line !== '').join('\\\n')).filter((paragraph) => paragraph !== '').join('\n\n');

// Whether the intake publishes `body` in a post of `type`.
function publishes(body, { site, type }) {
  const hands = bodyHands(site, { type }, { reader, adminHost: null, listTerms: (value) => value, link: () => ({ reason: 'none' }), image: () => ({ reason: 'none' }) });
  return checkBody(body, hands).problems.length === 0;
}

// `text`: an item's, { html } or { plain }. `site`: the site description, as checked. `type`: the
// post's, as the site description reads it. `base`: the address its relative links lead from.
// Gives { body, dropped }: the body's Markdown, and the names of the body elements it held that the
// type does not take, in the order they came.
export function feedBody(text, { site, type, base }) {
  const allowed = new Set(type.elements);
  if (text.plain !== undefined) return { body: plainBody(text.plain), dropped: [] };
  const context = { allowed, dropped: new Set(), base, within: false };
  const body = blocks(childrenOf(parseFragment(text.html ?? '')), context).map(({ text: one }) => one).join('\n\n');
  if (body === '' || publishes(body, { site, type })) return { body, dropped: [...context.dropped] };
  // What the intake would refuse all the same is the text's paragraphs alone.
  const plain = blocks(childrenOf(parseFragment(text.html ?? '')), { allowed: new Set(['paragraph']), dropped: new Set(), base, within: false }).map(({ text: one }) => one).join('\n\n');
  return { body: plain, dropped: [...context.dropped] };
}
