// An incoming feed read (ADR 0079): RSS 2.0 or Atom, as text, into the items a post is made of. It
// reads strictly as XML, which takes no entity a document declares and fetches nothing, and it
// tells an answer that is no feed from a feed that holds no items, since only the second says that
// the feed is empty.

import { parseFragment } from 'parse5';
import sax from 'sax';

import { canonicalAddress } from '../format/addresses.js';
import { fitLength } from '../format/article-parts.js';
import { momentOf } from '../format/moment.js';
import { MARKUP } from '../checks.js';

const ATOM = 'http://www.w3.org/2005/Atom';
const CONTENT = 'http://purl.org/rss/1.0/modules/content/';
const DUBLIN_CORE = 'http://purl.org/dc/elements/1.1/';
const XML = 'http://www.w3.org/XML/1998/namespace';

// The longest title made from the start of an item's text, where it has no title of its own.
const TITLE_FROM_TEXT = 80;

// An element's text as HTML takes it, with what a tag around it said left out, its spaces as one.
export function plainOf(html) {
  const words = [];
  const walk = (node) => {
    if (node.nodeName === '#text') words.push(node.value);
    else if (!['script', 'style', 'template'].includes(node.nodeName)) for (const child of node.childNodes ?? []) walk(child);
    if (['p', 'div', 'li', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'tr', 'blockquote'].includes(node.nodeName)) words.push(' ');
  };
  walk(parseFragment(html));
  return words.join('').replace(/\s+/g, ' ').trim();
}

// A moment as a feed gives it, RFC 822's or ISO 8601's, to the second in UTC, or null.
function momentGiven(text) {
  const given = text.trim();
  if (given === '') return null;
  const iso = momentOf(given);
  if (iso) return iso;
  const date = new Date(given);
  return Number.isNaN(date.valueOf()) ? null : momentOf(date);
}

// A whole http or https address, from one a feed gives, relative to `base`, or null.
function addressOf(given, base) {
  if (typeof given !== 'string' || given.trim() === '') return null;
  try {
    return canonicalAddress(new URL(given.trim(), base).href);
  } catch {
    return null;
  }
}

const escapedText = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapedValue = (text) => escapedText(text).replace(/"/g, '&quot;');

// A title as a post's: plain, without markup, which a post's title never holds.
function titleOf(given, isHtml) {
  const text = (isHtml ? plainOf(given) : given).replace(/\s+/g, ' ').trim();
  return MARKUP.test(text) ? plainOf(text) : text;
}

// The text of an item as a feed gives it: { html } or { plain }.
const textOf = (part) => (part.kind === 'plain' ? { plain: part.value.trim() } : { html: part.value.trim() });

// `text`: the feed's answer, decoded. `address`: where it was read, which relative links lead from.
// Gives { items }, each { id, title, text, date, link }, in the feed's order: `id` its ID in the
// feed, RSS's `guid` or Atom's `id`, else its link; `text` its full content where it has one, else
// its summary, as { html } or { plain }; `date` its publishing moment, or null; `link` the address
// of the original, or null. An item with neither ID nor link, or neither title nor text, is left
// out. An answer that is no RSS 2.0 or Atom feed gives { problem: 'not-a-feed' }.
export function readFeed(text, address) {
  const parser = sax.parser(true, { xmlns: true, position: false, trim: false });
  const stack = [];
  const items = [];
  let kind = null;
  let base = address;
  let item = null;
  // The part being read, { name, value, kind, depth }, and the XHTML inside an Atom content.
  let part = null;
  let failed = false;

  const inItem = () => item !== null;
  // A feed that names an entity of HTML's, as many do, is read all the same.
  Object.assign(parser.ENTITIES, sax.ENTITIES);
  parser.onerror = (error) => {
    failed = true;
    throw error;
  };
  parser.onopentag = (node) => {
    const { local, uri, attributes } = node;
    const depth = stack.length;
    stack.push(node);
    if (depth === 0) {
      if (local === 'rss' && uri === '') kind = 'rss';
      else if (local === 'feed' && uri === ATOM) kind = 'atom';
      else failed = true;
    }
    const xmlBase = attributes['xml:base']?.value ?? Object.values(attributes).find((one) => one.uri === XML && one.local === 'base')?.value;
    if (xmlBase && !inItem()) base = new URL(xmlBase, base).href;
    if (part?.xhtml) {
      if (depth > part.depth + 1) {
        const own = Object.values(attributes).filter((one) => one.prefix !== 'xmlns' && one.name !== 'xmlns').map((one) => ` ${one.local}="${escapedValue(one.value)}"`).join('');
        part.value += `<${local}${own}>`;
      }
      return;
    }
    if (part) return;
    if (kind === 'rss' && local === 'item' && uri === '' && stack[depth - 1]?.local === 'channel') {
      item = { base, parts: {} };
      return;
    }
    if (kind === 'atom' && local === 'entry' && uri === ATOM && depth === 1) {
      item = { base: xmlBase ? new URL(xmlBase, base).href : base, parts: {} };
      return;
    }
    if (!inItem() || depth !== stack.findIndex((one) => one.local === (kind === 'rss' ? 'item' : 'entry')) + 1) return;
    const name = kind === 'rss'
      ? (uri === '' && ['title', 'link', 'guid', 'pubDate', 'description'].includes(local) ? local : uri === CONTENT && local === 'encoded' ? 'content' : uri === DUBLIN_CORE && local === 'date' ? 'dcDate' : null)
      : (uri === ATOM && ['title', 'id', 'published', 'updated', 'summary', 'content'].includes(local) ? local : uri === ATOM && local === 'link' ? 'link' : null);
    if (name === null) return;
    if (kind === 'atom' && name === 'link') {
      const rel = attributes.rel?.value ?? 'alternate';
      if (rel === 'alternate' && item.parts.link === undefined && attributes.href) item.parts.link = { value: attributes.href.value };
      return;
    }
    const type = kind === 'atom' ? (attributes.type?.value ?? 'text') : 'html';
    if (kind === 'atom' && attributes.src) return;
    part = { name, value: '', depth, kind: type === 'xhtml' ? 'html' : type === 'html' || type === 'text/html' ? 'html' : kind === 'rss' ? 'html' : 'plain', xhtml: type === 'xhtml' };
    if (kind === 'rss' && ['title', 'link', 'guid', 'pubDate', 'dcDate'].includes(name)) part.kind = 'plain';
  };
  const takeText = (value) => {
    if (!part) return;
    part.value += part.xhtml ? escapedText(value) : value;
  };
  parser.ontext = takeText;
  parser.oncdata = takeText;
  parser.onclosetag = () => {
    const node = stack.pop();
    const depth = stack.length;
    if (part?.xhtml && depth > part.depth + 1) {
      part.value += `</${node.local}>`;
      return;
    }
    if (part && depth === part.depth) {
      if (item.parts[part.name] === undefined) item.parts[part.name] = part;
      part = null;
      return;
    }
    if (item && ((kind === 'rss' && node.local === 'item') || (kind === 'atom' && node.local === 'entry' && depth === 1))) {
      const made = itemOf(item, kind);
      if (made) items.push(made);
      item = null;
    }
  };

  try {
    parser.write(text).close();
  } catch {
    failed = true;
  }
  if (failed || kind === null || stack.length > 0) return { problem: 'not-a-feed' };
  return { items };
}

function itemOf({ base, parts }, kind) {
  const plain = (name) => (parts[name] ? parts[name].value.trim() : '');
  const link = addressOf(parts.link?.value, base);
  const id = (kind === 'rss' ? plain('guid') : plain('id')) || link;
  if (!id) return null;
  const full = parts.content ?? parts.description ?? parts.summary;
  const text = full ? textOf(full) : { html: '' };
  const titlePart = parts.title;
  let title = titlePart ? titleOf(titlePart.value, titlePart.kind === 'html' && kind === 'atom') : '';
  if (title === '') {
    const words = text.html === undefined ? text.plain.replace(/\s+/g, ' ').trim() : plainOf(text.html);
    title = words === '' ? '' : fitLength(words, TITLE_FROM_TEXT);
  }
  if (title === '') return null;
  const dated = kind === 'rss' ? plain('pubDate') || plain('dcDate') : plain('published') || plain('updated');
  // An RSS title is text, but may hold markup all the same, which a post's title never does.
  if (kind === 'rss' && MARKUP.test(title)) title = plainOf(title);
  return { id, title, text, date: momentGiven(dated), link };
}
