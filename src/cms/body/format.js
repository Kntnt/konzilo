// The field's reading and writing of the content format: what Milkdown's remark takes from
// a value before it becomes a document, and how a document is written back. Exact bytes
// are the intake's (ADR 0027), so the writer's duty is the meaning, as Sätteri reads it,
// and the field opens as Markdown where it cannot keep that (see `open` in field.js).

import rules from '../../format/rules.json' with { type: 'json' };

const NAME_START = /^:{2,3}[\p{L}\p{N}]/u;
const CLOSING = /^ {0,3}:::[ \t]*$/m;
const ANCHOR_OPEN = /^<a id="([^"]*)">$/;
const INLINE_PAIRS = {
  '<sup>': ['</sup>', 'superscript'],
  '<sub>': ['</sub>', 'subscript'],
  '<strong>': ['</strong>', 'strong'],
  '<em>': ['</em>', 'emphasis'],
  '<del>': ['</del>', 'delete'],
};

const DIRECTIVES = new Set(Object.values(rules.elements).map((rule) => rule.directive?.name).filter(Boolean));

const offsets = (node) => [node.position?.start?.offset, node.position?.end?.offset];
const sliceOf = (node, source) => {
  const [start, end] = offsets(node);
  return start === undefined || end === undefined ? null : source.slice(start, end);
};

// What the type's elements call each node the parser meets at the top level.
const ELEMENT_OF = { heading: 'heading', list: 'list', blockquote: 'quote', code: 'code', table: 'table', footnoteDefinition: 'footnotes' };

const isLoneHtml = (node) => node.children?.length === 1 && node.children[0].type === 'html';

// A lone address is an embed by what the source holds: `[address](address)` is a link.
function isLoneAddress(node, source) {
  if (node.children?.length !== 1) return false;
  const [link] = node.children;
  if (link.type !== 'link' || link.children?.length !== 1 || link.children[0].value !== link.url) return false;
  return !source.slice(...offsets(node)).startsWith('[');
}

// A leaf or container directive a paragraph starts, as remark sees it: a text whose source
// begins it. A bare leaf the rule data does not register reads as the text it was written as.
function directiveStart(node, source) {
  if (node.type !== 'paragraph') return null;
  const text = sliceOf(node, source);
  if (text === null || !NAME_START.test(text)) return null;
  if (text.startsWith(':::')) return 'container';
  const [name] = /^::[\p{L}\p{N}][\p{L}\p{N}_-]*/u.exec(text);
  return DIRECTIVES.has(name.slice(2)) || text.slice(name.length).startsWith('{') ? 'leaf' : null;
}

// Why a top-level node is kept as source, or null: it is a later element, or one its type
// does not take, and the field has no form of it yet.
function keptAs(node, source, policy) {
  if (node.type === 'heading' && node.depth === 1) return 'other';
  if (node.type === 'thematicBreak') return 'other';
  if (node.type === 'html') return 'html';
  if (node.type === 'definition') return 'other';
  if (node.type !== 'paragraph') return ELEMENT_OF[node.type] && !policy.takes(ELEMENT_OF[node.type]) ? 'other' : null;
  if (isLoneHtml(node)) return 'html';
  if (node.children?.some((child) => child.type === 'image')) return 'image';
  if (isLoneAddress(node, source)) return 'embed';
  if (directiveStart(node, source)) return 'directive';
  return null;
}

// A top-level list with each later element swapped for a block holding its own bytes. A
// container directive takes everything to its closing fence.
function keepLaterElements(children, source, policy) {
  const out = [];
  for (let index = 0; index < children.length; index += 1) {
    const node = children[index];
    const kind = keptAs(node, source, policy);
    if (kind === null) {
      out.push(node);
      continue;
    }
    const [start] = offsets(node);
    let end = offsets(node)[1];
    if (directiveStart(node, source) === 'container') {
      const rest = source.slice(start);
      const closing = CLOSING.exec(rest);
      end = closing === null ? source.length : start + closing.index + closing[0].length;
      while (index + 1 < children.length && offsets(children[index + 1])[0] < end) index += 1;
    }
    out.push({ type: 'konziloKept', kind, value: source.slice(start, end) });
  }
  return out;
}

// Raw pairs of the format's own inline elements as the marks they are.
function foldInline(node) {
  if (!node.children) return;
  for (const child of node.children) foldInline(child);
  const out = [];
  const { children } = node;
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const pair = child.type === 'html' ? INLINE_PAIRS[child.value] : undefined;
    const close = pair ? closingIndex(children, index, child.value, pair[0]) : -1;
    if (close === -1) {
      out.push(child);
      continue;
    }
    const inner = { type: pair[1], children: children.slice(index + 1, close) };
    foldInline(inner);
    if (inner.children.length > 0) out.push(inner);
    index = close;
  }
  node.children = out;
}

function closingIndex(children, from, open, close) {
  let depth = 0;
  for (let index = from; index < children.length; index += 1) {
    const { type, value } = children[index];
    if (type !== 'html') continue;
    if (value === open) depth += 1;
    if (value === close && (depth -= 1) === 0) return index;
  }
  return -1;
}

// A heading's anchor, which the field shows as a badge: the empty raw `<a>` before its text.
function liftAnchors(node) {
  if (node.type === 'heading' && node.children?.[0]?.type === 'html' && node.children[1]?.value === '</a>') {
    const match = ANCHOR_OPEN.exec(node.children[0].value);
    if (match) {
      node.anchor = match[1];
      node.children = node.children.slice(2);
    }
  }
  for (const child of node.children ?? []) liftAnchors(child);
}

// A quote's citation: its last paragraph, wrapped whole in raw `<cite>`.
function liftCitations(node) {
  for (const child of node.children ?? []) liftCitations(child);
  if (node.type !== 'blockquote' || node.children.length < 2) return;
  const last = node.children.at(-1);
  if (last.type !== 'paragraph' || last.children?.length < 2) return;
  const [open, close] = [last.children[0], last.children.at(-1)];
  if (open.type === 'html' && open.value === '<cite>' && close.type === 'html' && close.value === '</cite>') {
    node.children[node.children.length - 1] = { type: 'konziloCitation', children: last.children.slice(1, -1) };
  }
}

// What pasted Markdown is reduced to, in place of what a value keeps as source: a pasted
// element the field does not admit is reduced or dropped.
function reducePasted(children, policy) {
  const out = [];
  for (const node of children) {
    if (node.type === 'heading' && node.depth === 1) out.push({ ...node, depth: 2 });
    else if (node.type === 'paragraph' && node.children?.some((child) => child.type === 'image')) {
      const rest = node.children.filter((child) => child.type !== 'image');
      if (rest.length > 0) out.push({ ...node, children: rest });
    } else if (node.type === 'thematicBreak' || node.type === 'html' || node.type === 'definition' || (node.type === 'paragraph' && isLoneHtml(node))) continue;
    else if (ELEMENT_OF[node.type] && !policy.takes(ELEMENT_OF[node.type])) out.push(...plainBlocks(node));
    else out.push(node);
  }
  return out;
}

const plainBlocks = (node) => {
  if (node.type === 'code') return [{ type: 'paragraph', children: [{ type: 'text', value: node.value }] }];
  if (node.type === 'heading') return [{ type: 'paragraph', children: node.children }];
  if (node.type === 'paragraph') return [node];
  if (node.type === 'tableCell') return [{ type: 'paragraph', children: node.children }];
  return (node.children ?? []).flatMap(plainBlocks);
};

// The transform of a value, or of a paste, after Milkdown's own plugins.
export const readFormat = (policy) => () => (tree, file) => {
  const source = String(file);
  tree.children = policy.pasting ? reducePasted(tree.children, policy) : keepLaterElements(tree.children, source, policy);
  liftAnchors(tree);
  liftCitations(tree);
  foldInline(tree);
};

const ALNUM = /[\p{L}\p{N}]/u;
const PUNCTUATION = /[\p{P}\p{S}]/u;
const SPACE = /\s/u;

const opens = (before, first) => first !== undefined && !SPACE.test(first) && (!PUNCTUATION.test(first) || before === undefined || SPACE.test(before) || PUNCTUATION.test(before));
const closes = (last, after) => last !== undefined && !SPACE.test(last) && (!PUNCTUATION.test(last) || after === undefined || SPACE.test(after) || PUNCTUATION.test(after));
const present = (character) => (character === '' || character === '\n' ? undefined : character);

// A run in its Markdown form, or as raw HTML where the reader would not take its delimiters:
// a run beside a letter that starts with a quotation mark, say. `delimiters` gives the
// delimiter by what stands either side.
function run(tag, type, delimiters) {
  return (node, _, state, info) => {
    const before = present(info.before);
    const after = present(info.after);
    const delimiter = delimiters(before, after);
    const exit = state.enter(type);
    const written = state.containerPhrasing(node, { before: delimiter.at(-1), after: delimiter[0] });
    exit();
    if (opens(before, written[0]) && closes(written.at(-1), after)) return `${delimiter}${written}${delimiter}`;
    const exitRaw = state.enter(type);
    const raw = state.containerPhrasing(node, { before: '>', after: '<' });
    exitRaw();
    return `<${tag}>${raw}</${tag}>`;
  };
}

const rawRun = (tag, type) => (node, _, state) => {
  const exit = state.enter(type);
  const written = state.containerPhrasing(node, { before: '>', after: '<' });
  exit();
  return `<${tag}>${written}</${tag}>`;
};

// Text as Markdown, with what remark does not know of Sätteri's: a colon that would begin a
// directive, and one right after a footnote's mark, which would read as its text.
function text(node, _, state, info) {
  const written = state.safe(node.value, { ...info, encode: [] }).replace(/:(?=[\p{L}\p{N}])/gu, '\\:');
  return info.before === ']' && written.startsWith(':') ? `\\${written}` : written;
}

const isEmpty = (node) => node.type === 'paragraph' && (node.children ?? []).length === 0;

// The tree before it is written: an empty paragraph goes, a list is always tight.
function tidy(node) {
  if (node.type === 'list' || node.type === 'listItem') node.spread = false;
  if (!node.children) return;
  const kept = node.children.filter((child) => !isEmpty(child) || node.type === 'listItem');
  node.children = kept;
  for (const child of kept) tidy(child);
  node.children = kept.filter((child) => child.type !== 'blockquote' || child.children.length > 0);
}

export const writerOptions = (options) => ({
  ...options,
  bullet: '-',
  bulletOther: '*',
  bulletOrdered: '.',
  emphasis: '_',
  strong: '*',
  fence: '`',
  fences: true,
  incrementListMarker: true,
  listItemIndent: 'one',
  resourceLink: true,
  rule: '-',
  handlers: {
    ...options.handlers,
    text,
    root(node, _, state, info) {
      tidy(node);
      return state.containerFlow(node, info);
    },
    strong: run('strong', 'strong', () => '**'),
    emphasis: run('em', 'emphasis', (before, after) => (ALNUM.test(before ?? '') || ALNUM.test(after ?? '') ? '*' : '_')),
    delete: run('del', 'delete', () => '~~'),
    superscript: rawRun('sup', 'superscript'),
    subscript: rawRun('sub', 'subscript'),
  },
});
