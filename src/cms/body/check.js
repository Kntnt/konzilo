// The early check, in the browser: the same implementation and rule data as the intake's,
// reading through Sätteri's WebAssembly build, so that the field gives the site's own
// verdict in the rule data's words. It has no list of a site's posts or originals, so it
// takes a link or an image as given; the intake remains the check that counts.

import { markdownFeatures } from '../../astro/reader-features.js';
import { checkBody, readBody } from '../../format/body.js';
import { embedOf } from '../../format/embeds.js';
import { withComponents } from '../../format/components.js';
import rules from '../../format/rules.json' with { type: 'json' };
import { siteComponents } from './components.js';

// Longer than a slow machine's first load; past it, the field goes on without the check.
const LOAD_LIMIT = 10_000;

let reader = null;

// The reader, or null if it did not load, which stays the answer until the page reloads.
export function loadReader() {
  reader ??= Promise.race([
    import('satteri').then(({ markdownToMdast }) => ({
      tree: (markdown) => markdownToMdast(markdown, { features: markdownFeatures, position: true }),
    })),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error('the reader took too long to load')), LOAD_LIMIT);
    }),
  ]).catch((error) => {
    console.warn(`The body field's early check is off: ${error.message}`);
    return null;
  });
  return reader;
}

export const handsFor = (tree, { elements, forms = [], adminHost = null }) => ({
  reader: tree,
  rules: withComponents(rules, siteComponents()),
  elements,
  embedOf,
  adminHost,
  declared: { forms },
  link: (id, fragment) => ({ href: `/${id}/${fragment === null ? '' : `#${fragment}`}` }),
  image: (address) => ({ src: address }),
});

const WRAPPERS = new Set(['strong', 'em', 's', 'sup', 'sub', 'link']);

// Inline nodes as a flat list, each with what wraps it, in one order and side by side as one.
// `**_x_**` and `_**x**_` mean the same on a page, and an editor holds marks in one order.
function flattened(nodes, around = []) {
  const out = [];
  for (const node of nodes) {
    if (WRAPPERS.has(node.type)) {
      const { children, ...mark } = node;
      out.push(...flattened(children, [...around, JSON.stringify(mark)]));
      continue;
    }
    const marks = [...around].sort();
    const last = out.at(-1);
    if (node.type === 'text' && last?.node.type === 'text' && JSON.stringify(last.marks) === JSON.stringify(marks)) {
      last.node = { ...last.node, value: last.node.value + node.value };
    } else out.push({ node, marks });
  }
  return out;
}

const isInline = (nodes) => Array.isArray(nodes) && nodes.length > 0 && nodes.every((node) => WRAPPERS.has(node?.type) || ['text', 'code', 'break', 'footnote'].includes(node?.type));

function inOneOrder(value) {
  if (Array.isArray(value)) return isInline(value) ? flattened(value) : value.map(inOneOrder);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, inOneOrder(inner)]));
}

// What a value means, as the site reads it: its blocks and what it refuses, without the
// lines they stand on, which a writer may move.
const meaningOf = (source, hands) => {
  const { blocks, problems } = readBody(source, hands);
  return {
    blocks: blocks.map(({ path, name, node }) => ({ path, name, node: JSON.stringify(inOneOrder(node)) })),
    problems: JSON.stringify(problems.map(({ path, name, reason }) => [path, name, reason])),
  };
};

// Where writing a value would change its meaning: null where it would not, or
// { path, element }, the first block that would change, or {} when none can be named.
export function changeBetween(before, after, hands) {
  const [was, is] = [meaningOf(before, hands), meaningOf(after, hands)];
  const index = was.blocks.findIndex((block, at) => block.node !== is.blocks[at]?.node);
  if (index !== -1) return { path: was.blocks[index].path, element: was.blocks[index].name };
  if (is.blocks.length !== was.blocks.length) return {};
  return was.problems === is.problems ? null : {};
}

export const refusalsOf = (source, hands) => checkBody(source, hands).problems;
