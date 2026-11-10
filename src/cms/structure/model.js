// The structure field's model: a body's Markdown with directives as a tree, and back. The form is
// the one the intake writes (content-format.md): blocks a blank line apart, and fences a colon
// longer than the longest inside. Whatever is no directive stays as its text. It is read line by
// line on that exact form, which keeps the field small and synchronous; the field says so where a
// value is written otherwise, and the intake remains the check that counts.

const OPEN = /^(:{3,})([a-z][a-z0-9-]*)(\{.*\})?\s*$/;
const LEAF = /^::([a-z][a-z0-9-]*)(?:\[(.*)\])?(\{.*\})?\s*$/;
const ATTRIBUTE = /([a-zA-Z][a-zA-Z0-9]*)="([^"]*)"/g;

const decode = (text) => text.replaceAll('&#10;', '\n').replaceAll('&#13;', '\r').replaceAll('&#125;', '}').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
const encode = (text) => String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('}', '&#125;').replaceAll('\n', '&#10;').replaceAll('\r', '&#13;');

function attributesOf(text) {
  const attrs = {};
  for (const [, name, value] of (text ?? '').matchAll(ATTRIBUTE)) attrs[name] = decode(value);
  return attrs;
}

const attributesText = (attrs) => {
  const parts = Object.entries(attrs ?? {}).filter(([, value]) => value !== '' && value !== undefined && value !== null);
  return parts.length === 0 ? '' : `{${parts.map(([name, value]) => `${name}="${encode(value)}"`).join(' ')}}`;
};

let counter = 0;
const made = (fields) => ({ id: `n${(counter += 1)}`, ...fields });

// A block of text, by its first line.
function blockOf(lines) {
  const first = lines[0];
  const heading = /^(#{2,6}) (.*)$/.exec(first);
  if (heading && lines.length === 1) return made({ kind: 'heading', level: heading[1].length, text: heading[2] });
  const picture = /^!\[(.*)\]\(([^)\s]+)\)$/.exec(first);
  if (picture && lines.length === 1) return made({ kind: 'image', alt: picture[1], src: picture[2] });
  if (/^- /.test(first) || /^\d+\. /.test(first)) {
    const ordered = /^\d/.test(first);
    const items = [];
    for (const line of lines) {
      const item = /^(?:- |\d+\. )(.*)$/.exec(line);
      if (item) items.push(made({ kind: 'item', text: item[1] }));
      else if (items.length > 0) items.at(-1).text += `\n${line}`;
    }
    return made({ kind: 'list', ordered, children: items });
  }
  if (/^> ?/.test(first)) return made({ kind: 'quote', text: lines.join('\n') });
  if (/^!\[.*\]\([^)\s]+\)\\?$/.test(first) && lines.filter((line) => /^!\[.*\]\([^)\s]+\)\\?$/.test(line)).length >= 2) return made({ kind: 'gallery', text: lines.join('\n') });
  if (lines.length === 1 && /^<?https?:\/\/\S+>?$/.test(first)) return made({ kind: 'embed', text: first });
  if (/^[|<]/.test(first)) return made({ kind: 'other', text: lines.join('\n') });
  return made({ kind: 'paragraph', text: lines.join('\n') });
}

function parseLines(lines) {
  const nodes = [];
  let at = 0;
  while (at < lines.length) {
    const line = lines[at];
    if (line.trim() === '') { at += 1; continue; }
    const open = OPEN.exec(line);
    if (open) {
      const fence = open[1];
      let end = at + 1;
      while (end < lines.length && lines[end].trim() !== fence) end += 1;
      if (end === lines.length) throw new Error(`the fence on line ${at + 1} is never closed`);
      nodes.push(made({ kind: 'container', name: open[2], attrs: attributesOf(open[3]), children: parseLines(lines.slice(at + 1, end)) }));
      at = end + 1;
      continue;
    }
    const leaf = LEAF.exec(line);
    if (leaf) {
      nodes.push(made({ kind: 'leaf', name: leaf[1], label: leaf[2] ?? null, attrs: attributesOf(leaf[3]) }));
      at += 1;
      continue;
    }
    // A code block may hold blank lines, so it runs to its fence.
    const code = /^(`{3,}|~{3,})/.exec(line);
    if (code) {
      let close = at + 1;
      while (close < lines.length && !lines[close].startsWith(code[1])) close += 1;
      nodes.push(made({ kind: 'other', text: lines.slice(at, close + 1).join('\n') }));
      at = close + 1;
      continue;
    }
    let end = at;
    while (end < lines.length && lines[end].trim() !== '') end += 1;
    nodes.push(blockOf(lines.slice(at, end)));
    at = end;
  }
  return nodes;
}

export const parseBody = (markdown) => made({ kind: 'root', children: parseLines((markdown ?? '').split('\n')) });

function blockText(node) {
  switch (node.kind) {
    case 'heading': return `${'#'.repeat(node.level)} ${node.text}`;
    case 'image': return `![${node.alt}](${node.src})`;
    case 'list': return node.children.map((item, index) => `${node.ordered ? `${index + 1}.` : '-'} ${item.text}`).join('\n');
    case 'leaf': return `::${node.name}${node.label === null ? '' : `[${node.label}]`}${attributesText(node.attrs)}`;
    case 'container': {
      const inner = node.children.map(blockText).join('\n\n');
      const longest = Math.max(2, ...[...inner.matchAll(/^(:{3,})/gm)].map(([, fence]) => fence.length));
      const fence = ':'.repeat(longest + 1);
      return inner === '' ? `${fence}${node.name}${attributesText(node.attrs)}\n\n${fence}` : `${fence}${node.name}${attributesText(node.attrs)}\n\n${inner}\n\n${fence}`;
    }
    default: return node.text;
  }
}

export const writeBody = (root) => root.children.map(blockText).join('\n\n');

// The path to a node as indexes from the root, as the live preview marks its blocks
// (block-marks.js).
export function pathTo(root, wanted) {
  const search = (node, path) => {
    if (node === wanted) return path;
    for (const [index, child] of (node.children ?? []).entries()) {
      const found = search(child, [...path, index]);
      if (found) return found;
    }
    return null;
  };
  return search(root, []);
}

export function nodeAt(root, path) {
  let node = root;
  for (const index of path) node = node?.children?.[index];
  return node ?? null;
}

export function parentOf(root, wanted) {
  for (const child of root.children ?? []) {
    if (child === wanted) return root;
    const found = parentOf(child, wanted);
    if (found) return found;
  }
  return null;
}

export function* everyNode(node) {
  for (const child of node.children ?? []) {
    yield child;
    yield* everyNode(child);
  }
}

// Text without its Markdown, to show in the tree.
export const plain = (text) => (text ?? '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '').replace(/\\(.)/g, '$1').replace(/[*_`>]/g, '').replace(/\s+/g, ' ').trim();

// What says what a node is about: its own text, else the first text within it, else, for a
// form of items, its items' headings. `count(kind, n)` words a number of images or items.
export function summaryOf(node, count = (kind, n) => `${n} ${kind}`) {
  switch (node.kind) {
    case 'heading': case 'paragraph': case 'item': case 'quote': case 'other': return plain(node.text);
    case 'image': return plain(node.alt) || node.src;
    case 'gallery': return count('images', node.text.split('\n').filter((line) => line.startsWith('![')).length);
    case 'embed': return node.text.replace(/^<|>$/g, '');
    case 'leaf': {
      if (node.label) return plain(node.label);
      return node.attrs?.name ?? '';
    }
    case 'list': return count('items', node.children.length);
    case 'container': {
      // A form of items is its items' headings.
      const heading = node.children.find((child) => child.kind === 'heading');
      if (heading) return node.children.filter((child) => child.kind === 'heading' && child.level === heading.level).map((child) => plain(child.text)).join(', ');
      for (const child of node.children) {
        const text = ['image', 'gallery', 'embed', 'list'].includes(child.kind) ? '' : summaryOf(child, count);
        if (text) return text;
      }
      return '';
    }
    default: return '';
  }
}
