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

const reduceNode = (node) => {
  if (node.isText) {
    const marks = node.marks.filter((mark) => mark.type.name !== 'link' || linkIsAllowed(mark.attrs.href));
    return marks.length === node.marks.length ? node : node.mark(marks);
  }
  if (node.type.name === 'html') return String(node.attrs.value).startsWith('<!--') ? node : null;
  if (node.type.name === 'konzilo_kept') return null;
  const attrs = node.type.name === 'list_item' && node.attrs.checked !== null ? { ...node.attrs, checked: null } : node.attrs;
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
