// The live preview's mark on each block of a body: its place among the body's blocks, counted as
// the body field holds them, so that a click on the page can find its way to the field. The
// count is taken from the body as it is read, before a site's components or the lightbox add
// anything, and a block with no element of its own, raw HTML say, still takes its number.
// Footnotes stand after the body's last block in the field, one block each, and so here.
//
// A block that holds blocks is marked within as well, each by its path below it, `2.1` for the
// first block in the third: the blocks of a directive's body, and a list's items. A design that
// renders a component of its own keeps the marks of the blocks it is given.
//
// A component the site renders is given its block's mark as the prop BLOCK_ATTRIBUTE, to place
// on its root, and where it does not, the core places it there (withBlockMark()), so that no
// wrapper stands between a component and the one around it, which a design's child selectors
// would not see past.

import { endOf, nextTag } from './directives.js';

export const BLOCK_PROPERTY = 'dataKonziloBlock';
export const BLOCK_ATTRIBUTE = 'data-konzilo-block';

// What a component renders at its top that is no part of what is shown, and holds no mark.
const UNSHOWN = new Set(['script', 'style', 'link', 'meta', 'template', 'noscript']);

// The elements at the top of `html`, as nextTag() gives each start tag, or null where it has
// text there, beside them or alone, or an end tag of nothing it opened.
function topElements(html) {
  const elements = [];
  for (let at = 0; ;) {
    const tag = nextTag(html, at);
    const between = html.slice(at, tag?.start ?? html.length).replace(/<!--[\s\S]*?(?:-->|$)/g, '');
    if (between.trim() !== '') return null;
    if (!tag) return elements;
    if (tag.closing) return null;
    elements.push(tag);
    at = tag.void ? tag.end : endOf(html, tag).end;
  }
}

// What a component rendered, `html`, with the mark of its block, `block`, on its root: as it is
// where the component placed the mark itself, on any element it rendered; else with the mark put
// on the element it rendered at its top, or on each of those it rendered there side by side. Null
// where it cannot be put there: what the component rendered has text at its top, or no element,
// or an element there marked already, a block of its body, rendered with no element around it.
export function withBlockMark(html, block) {
  for (let at = 0, tag = nextTag(html, at); tag; at = tag.end, tag = nextTag(html, at)) {
    if (!tag.closing && tag.attributes[BLOCK_ATTRIBUTE] === block) return html;
  }
  const roots = topElements(html)?.filter((tag) => !UNSHOWN.has(tag.name)) ?? [];
  if (roots.length === 0 || roots.some((tag) => Object.hasOwn(tag.attributes, BLOCK_ATTRIBUTE))) return null;
  // Last among its attributes, as a component that passed it on after its own would have it.
  let marked = html;
  for (const { end } of roots.toReversed()) {
    const at = html[end - 2] === '/' ? end - 2 : end - 1;
    marked = `${marked.slice(0, at)} ${BLOCK_ATTRIBUTE}="${block}"${marked.slice(at)}`;
  }
  return marked;
}

const isElement = (node, tagName) => node?.type === 'element' && (tagName === undefined || node.tagName === tagName);
const isBlank = (node) => node.type === 'text' && node.value.trim() === '';
const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'blockquote', 'pre', 'table', 'figure', 'div', 'hr', 'dl', 'details', 'section', 'aside', 'nav', 'form', 'iframe']);

// The blocks within `node`, marked by their paths below `path`.
function markWithin(node, path, ctx) {
  if (isElement(node, 'ul') || isElement(node, 'ol')) {
    node.children.filter((child) => isElement(child, 'li')).forEach((item, index) => {
      const at = `${path}.${index}`;
      ctx.setProperty(item, BLOCK_PROPERTY, at);
      for (const inner of item.children.filter((child) => isElement(child, 'ul') || isElement(child, 'ol'))) markWithin(inner, at, ctx);
    });
    return;
  }
  if (!isElement(node) || node.properties?.dataDirective === undefined) return;
  // A leaf's label is text, not blocks.
  if (node.children.some((child) => (child.type === 'text' && child.value.trim() !== '') || (isElement(child) && !BLOCKS.has(child.tagName)))) return;
  let index = 0;
  for (const child of node.children) {
    if (isBlank(child)) continue;
    const at = `${path}.${index}`;
    if (isElement(child)) {
      ctx.setProperty(child, BLOCK_PROPERTY, at);
      markWithin(child, at, ctx);
    }
    index += 1;
  }
}

export const blockMarks = {
  name: 'konzilo-block-marks',
  after(root, ctx) {
    let at = 0;
    for (const node of root.children) {
      if (isBlank(node)) continue;
      if (isElement(node) && node.properties?.dataFootnotes !== undefined) {
        const list = node.children.find((child) => isElement(child, 'ol'));
        for (const item of list?.children.filter((child) => isElement(child, 'li')) ?? []) {
          ctx.setProperty(item, BLOCK_PROPERTY, String(at));
          at += 1;
        }
        continue;
      }
      if (isElement(node)) {
        ctx.setProperty(node, BLOCK_PROPERTY, String(at));
        markWithin(node, String(at), ctx);
      }
      at += 1;
    }
  },
};
