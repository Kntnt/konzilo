// A pasted element the schema does not admit is reduced or dropped (ADR 0030). The schema
// itself turns away what it has no node for, a script or a pasted `<img>` among them. What is
// left here is what the schema holds for a value's sake and must not take from outside: raw
// HTML, a kept block, a task item, a link to an address the site cannot publish. A block
// moved within the field, or copied from it, is its own and comes through whole.

import { Fragment, Slice } from '@milkdown/kit/prose/model';

import rules from '../../format/rules.json' with { type: 'json' };

const SCHEMES = new Set(rules.links.schemes);

const linkIsAllowed = (href) => {
  if (typeof href !== 'string' || href === '') return false;
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href)?.[1]?.toLowerCase();
  return scheme !== undefined && (SCHEMES.has(scheme) || scheme === 'konzilo');
};

const CELLS = new Set(['table_cell', 'table_header']);
const NOT_FROM_OUTSIDE = new Set(['konzilo_kept', 'konzilo_image', 'konzilo_gallery', 'konzilo_gallery_caption']);

const reduceNode = (node) => {
  if (node.isText) {
    const marks = node.marks.filter((mark) => mark.type.name !== 'link' || linkIsAllowed(mark.attrs.href));
    return marks.length === node.marks.length ? node : node.mark(marks);
  }
  if (node.type.name === 'html') return String(node.attrs.value).startsWith('<!--') ? node : null;
  if (NOT_FROM_OUTSIDE.has(node.type.name)) return null;
  let { attrs } = node;
  if (node.type.name === 'list_item' && attrs.checked !== null) attrs = { ...attrs, checked: null };
  // A numbered list starts at 1 or the site cannot publish it, and the editor has no way to say so.
  if (node.type.name === 'ordered_list' && attrs.order !== 1) attrs = { ...attrs, order: 1 };
  if (node.isLeaf) return node;
  return node.type.create(attrs, reduceFragment(node.content), node.marks);
};

function reduceFragment(fragment) {
  const out = [];
  fragment.forEach((node) => {
    const reduced = reduceNode(node);
    if (reduced) out.push(reduced);
  });
  return Fragment.fromArray(out);
}

// A slice with what may not be pasted gone.
export const reducePasted = (slice) => new Slice(reduceFragment(slice.content), slice.openStart, slice.openEnd);

// Plain text read as Markdown. `maxOpen` lets a lone paragraph join the block it lands in.
export const reducedText = (doc) => Slice.maxOpen(reduceFragment(doc.content));

// Whether the selection is in a table's cell.
export function inCell({ selection: { $from } }) {
  for (let depth = $from.depth; depth > 0; depth -= 1) if (CELLS.has($from.node(depth).type.name)) return true;
  return false;
}

// What a cell takes of a slice: one line of text with its marks. A cell holds one paragraph
// without a line break, and Milkdown's writer would drop any other, and the replace that
// fits blocks in would carry them out of the table and break it in two.
export function oneLine(slice, schema) {
  const inline = [];
  const add = (node) => {
    if (node.isInline) inline.push(node.type.name === 'hardbreak' ? schema.text(' ', node.marks) : node);
    else if (node.isTextblock) {
      if (inline.length > 0) inline.push(schema.text(' '));
      node.forEach(add);
    } else if (!node.isLeaf) node.forEach(add);
  };
  slice.content.forEach(add);
  return new Slice(Fragment.fromArray(inline), 0, 0);
}

// What a caption takes of a slice: one line of its text, with the formats a caption has.
export function captionLine(slice, { schema, selection: { $from: { parent } } }) {
  const text = [];
  oneLine(slice, schema).content.forEach((node) => {
    if (node.isText) text.push(node.mark(node.marks.filter(({ type }) => parent.type.allowsMarkType(type))));
  });
  return new Slice(Fragment.fromArray(text), 0, 0);
}
