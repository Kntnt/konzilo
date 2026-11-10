// A post's summary: what search results, sharing cards, feeds
// and llms.txt show of a post. It is the post's excerpt, or,
// without one, the start of its body as plain text, cut at a word to at most
// SUMMARY_LENGTH characters, `…` included, when it is longer. The metadata
// templates name it as {{ post.auto_description }}.
//
// The body's text is what a reader reads of the page the site renders from
// it, through the site's own reader (reader.js): its paragraphs, headings,
// lists, quotes and tables, each block's text apart from the next. Footnote
// marks and the footnotes, code blocks, images, galleries and embeds are no
// part of it.

import { htmlToHast, markdownToHtml } from 'satteri';
import { directiveReader } from './directives.js';
import { markdownFeatures, markdownHastPlugins } from './reader.js';

// The most characters a summary of a body holds, as search results show a
// description.
export const SUMMARY_LENGTH = 160;

// Elements whose text is no part of the summary: a figure is an image, a
// gallery or an embed, `pre` a code block, and the footnotes' section and
// each mark of one are the footnotes.
const LEFT_OUT = new Set(['figure', 'pre', 'template', 'script', 'style', 'img']);

// Elements whose text stands apart from the text around them.
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'table', 'tr', 'td', 'th', 'div', 'section', 'br', 'hr', 'dt', 'dd']);

// The summary of an entry as Astro hands a template one: what the post says
// of itself, ownSummary(), when it says anything, else its `body`, the
// content file's Markdown. Spaces, line breaks included, collapse to one.
export function summary({ data = {}, body = '' }) {
  const own = ownSummary(data);
  if (own !== '') return own;
  return cut(plainText(body), SUMMARY_LENGTH);
}

// What a post says of itself in a sentence, by its frontmatter `data`: its
// excerpt, else its teaser's text, else its standfirst, its spaces collapsed;
// nothing when it says none of them.
export function ownSummary(data = {}) {
  const found = [data.excerpt, data.teaser?.text, data.standfirst].find((one) => typeof one === 'string' && one.trim() !== '');
  return collapse(found ?? '');
}

// A body's plain text, as the site renders it, a space between blocks.
export function plainText(body) {
  if (body.trim() === '') return '';
  const reader = directiveReader(() => {});
  const { html } = markdownToHtml(body, { features: markdownFeatures, mdastPlugins: [reader], hastPlugins: [...markdownHastPlugins] });
  const parts = [];
  textOf(htmlToHast(html), parts);
  return collapse(parts.join(''));
}

function textOf(node, parts) {
  if (node.type === 'text') {
    parts.push(node.value);
    return;
  }
  if (node.type === 'element') {
    if (LEFT_OUT.has(node.tagName) || isFootnotes(node)) return;
    if (BLOCKS.has(node.tagName)) parts.push(' ');
  }
  for (const child of node.children ?? []) textOf(child, parts);
  if (node.type === 'element' && BLOCKS.has(node.tagName)) parts.push(' ');
}

// The footnotes' section, and a footnote's mark, `<sup>` around its link.
function isFootnotes(node) {
  const { properties } = node;
  if (node.tagName === 'section' && properties.dataFootnotes !== undefined) return true;
  if (node.tagName === 'a' && properties.dataFootnoteRef !== undefined) return true;
  return node.tagName === 'sup' && node.children.some((child) => child.type === 'element' && isFootnotes(child));
}

function collapse(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// `text` cut at a word to at most `limit` characters, `…` included, and
// whole when it is no longer. A word longer than the room is cut in it.
function cut(text, limit) {
  const characters = [...text];
  if (characters.length <= limit) return text;
  const room = characters.slice(0, limit);
  const space = room.findLastIndex((character) => /\s/.test(character));
  const kept = room.slice(0, space > 0 ? space : limit - 1).join('').replace(/[\s,;:.–—-]+$/u, '');
  return `${kept}…`;
}
