// A built page's main content as Markdown, for its Markdown alternate.
//
// The page's main content is its one <main>, or the one element its design
// marks with `data-konzilo-main`. Inside it, dialog, nav, script, style and template
// are left out, and an embed's panel becomes the link to its address that it holds.
// The front matter comes as the build wrote it, then the page's title as a
// heading, unless the body begins with it, then the body. Every relative link
// and image is written from the page's canonical address.

import { htmlToHast } from 'satteri';

// The mark of the element that holds a page's main content.
export const MAIN_MARK = 'data-konzilo-main';

const LEFT_OUT = new Set(['dialog', 'nav', 'script', 'style', 'template']);
const HEADINGS = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5, h6: 6 };
const INLINE = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'img', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr']);

const isElement = (node) => node?.type === 'element';
const propertiesOf = (node) => node.properties ?? {};
const classesOf = (node) => {
  const { className, class: text } = propertiesOf(node);
  if (Array.isArray(className)) return className;
  return typeof (className ?? text) === 'string' ? (className ?? text).split(/\s+/) : [];
};
const isMarked = (node) => {
  const properties = propertiesOf(node);
  return Object.hasOwn(properties, 'dataKonziloMain') || Object.hasOwn(properties, MAIN_MARK);
};

function walk(node, visit) {
  for (const child of node.children ?? []) {
    if (isElement(child)) visit(child);
    walk(child, visit);
  }
}

// The element that holds the page's main content, or why none can be told.
function mainOf(tree) {
  const marked = [];
  const mains = [];
  walk(tree, (node) => {
    if (isMarked(node)) marked.push(node);
    if (node.tagName === 'main') mains.push(node);
  });
  if (marked.length > 1) return { problem: `it has ${marked.length} elements marked ${MAIN_MARK}: mark only the one that holds its main content` };
  if (marked.length === 1) return { node: marked[0] };
  if (mains.length === 0) return { problem: `it has no <main>: put its main content in one, or mark the element that holds it with ${MAIN_MARK}` };
  if (mains.length > 1) return { problem: `it has ${mains.length} <main> elements: mark the one that holds its main content with ${MAIN_MARK}` };
  return { node: mains[0] };
}

// A text as Markdown reads it back: what would begin a mark is escaped.
function escapedText(text) {
  return text.replace(/\\/g, '\\\\').replace(/([*_`[\]])/g, '\\$1').replace(/</g, '\\<');
}

const absolute = (address, base) => {
  if (typeof address !== 'string' || address === '') return address ?? '';
  try {
    return new URL(address, base).href;
  } catch {
    return address;
  }
};

const destination = (address) => (/[\s()<>]/.test(address) ? `<${address.replace(/>/g, '%3E')}>` : address);
const titled = (title) => (typeof title === 'string' && title !== '' ? ` "${title.replace(/"/g, '\\"')}"` : '');

function codeSpan(text) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map(([run]) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

const plainText = (node) => (node.type === 'text' ? node.value : (node.children ?? []).map(plainText).join(''));

// Inline nodes as Markdown, without a line break at either end.
function inline(nodes, base) {
  return nodes.map((node) => inlineNode(node, base)).join('');
}

function wrapped(mark, text) {
  const inner = text.trim();
  if (inner === '') return text;
  const [before] = /^\s*/.exec(text);
  const [after] = /\s*$/.exec(text);
  return `${before}${mark}${inner}${mark}${after}`;
}

function inlineNode(node, base) {
  if (node.type === 'text') return escapedText(node.value.replace(/\s+/g, ' '));
  if (!isElement(node) || LEFT_OUT.has(node.tagName)) return '';
  const inner = () => inline(node.children ?? [], base);
  switch (node.tagName) {
    case 'strong':
    case 'b':
      return wrapped('**', inner());
    case 'em':
    case 'i':
      return wrapped('*', inner());
    case 'del':
    case 's':
    case 'strike':
      return wrapped('~~', inner());
    case 'code':
      return codeSpan(plainText(node));
    case 'br':
      return '  \n';
    case 'img': {
      const { src, alt, title } = propertiesOf(node);
      return `![${escapedText(alt ?? '')}](${destination(absolute(src, base))}${titled(title)})`;
    }
    case 'a': {
      const { href, title } = propertiesOf(node);
      const text = inner();
      return href === undefined ? text : `[${text}](${destination(absolute(href, base))}${titled(title)})`;
    }
    default:
      return inner();
  }
}

// A table as a pipe table: its header row, then the others. A table with no
// header row takes its first row as one, since a pipe table must have one.
function pipeTable(node, base) {
  const rows = [];
  let caption = '';
  const collect = (parent) => {
    for (const child of parent.children ?? []) {
      if (!isElement(child)) continue;
      if (child.tagName === 'caption') caption = inline(child.children ?? [], base).trim();
      else if (child.tagName === 'tr') rows.push(child);
      else collect(child);
    }
  };
  collect(node);
  if (rows.length === 0) return caption;
  const cellsOf = (row) => (row.children ?? []).filter((cell) => isElement(cell) && ['th', 'td'].includes(cell.tagName));
  const textOf = (cell) => inline(cell.children ?? [], base).trim().replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  const table = rows.map((row) => cellsOf(row).map(textOf));
  const width = Math.max(...table.map((cells) => cells.length));
  const sizes = Array.from({ length: width }, (_, i) => Math.max(3, ...table.map((cells) => [...(cells[i] ?? '')].length)));
  const padded = (cells) => `| ${sizes.map((size, i) => (cells[i] ?? '').padEnd(size + (cells[i] ?? '').length - [...(cells[i] ?? '')].length)).join(' | ')} |`;
  const alignment = (cell) => /text-align:\s*(left|center|right)/.exec(String(propertiesOf(cell).style ?? ''))?.[1];
  const rule = sizes.map((size, i) => {
    const align = alignment(cellsOf(rows[0])[i] ?? {});
    const dashes = '-'.repeat(size + 2);
    return align === 'left' ? `:${dashes.slice(1)}` : align === 'right' ? `${dashes.slice(1)}:` : align === 'center' ? `:${dashes.slice(2)}:` : dashes;
  });
  const lines = [padded(table[0]), `|${rule.join('|')}|`, ...table.slice(1).map(padded)];
  return [...(caption ? [caption] : []), lines.join('\n')].join('\n\n');
}

function languageOf(pre) {
  const code = (pre.children ?? []).find((child) => isElement(child) && child.tagName === 'code');
  const named = propertiesOf(pre).dataLanguage ?? (code && propertiesOf(code).dataLanguage);
  if (typeof named === 'string' && named !== 'plaintext') return named;
  const className = [...classesOf(pre), ...(code ? classesOf(code) : [])].find((name) => name.startsWith('language-'));
  return className ? className.slice('language-'.length) : '';
}

function codeBlock(pre) {
  const text = plainText(pre).replace(/\n$/, '');
  const longest = Math.max(2, ...[...text.matchAll(/^`+/gm)].map(([run]) => run.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${languageOf(pre)}\n${text}\n${fence}`;
}

const indented = (text, first, rest) => text.split('\n').map((line, index) => (index === 0 ? `${first}${line}` : line === '' ? '' : `${rest}${line}`)).join('\n');

// A list item's task box, `[ ] ` or `[x] `, from the checkbox the reader renders first in
// a task's item, and what follows it; no box for an item that is no task.
function taskOf(children) {
  const [first, next, ...rest] = children;
  if (!isElement(first) || first.tagName !== 'input' || propertiesOf(first).type !== 'checkbox') return { box: '', children };
  const after = next?.type === 'text' ? [{ ...next, value: next.value.replace(/^ /, '') }] : next === undefined ? [] : [next];
  return { box: propertiesOf(first).checked ? '[x] ' : '[ ] ', children: [...after, ...rest] };
}

function list(node, base) {
  const ordered = node.tagName === 'ol';
  const items = (node.children ?? []).filter((child) => isElement(child) && child.tagName === 'li');
  const parts = items.map((item, index) => {
    const marker = ordered ? `${index + 1}. ` : '- ';
    const { box, children } = taskOf(item.children ?? []);
    return indented(`${box}${blocks(children, base).join('\n\n')}`, marker, ' '.repeat(marker.length));
  });
  const loose = items.some((item) => (item.children ?? []).some((child) => isElement(child) && child.tagName === 'p'));
  return parts.join(loose ? '\n\n' : '\n');
}

const quoted = (text) => text.split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n');

// An embed's panel as the link to its address that it holds, or nothing.
function embedLink(panel, base) {
  const link = (panel.children ?? []).find((child) => isElement(child) && child.tagName === 'a' && propertiesOf(child).href !== undefined);
  return link ? inline([link], base) : null;
}

// Block nodes as Markdown, each block a text.
function blocks(nodes, base) {
  const out = [];
  let run = [];
  const flush = () => {
    const text = inline(run, base).trim();
    if (text !== '') out.push(text);
    run = [];
  };
  for (const node of nodes) {
    if (node.type === 'text' || (isElement(node) && INLINE.has(node.tagName))) {
      run.push(node);
      continue;
    }
    flush();
    if (!isElement(node) || LEFT_OUT.has(node.tagName)) continue;
    const { tagName } = node;
    if (Object.hasOwn(HEADINGS, tagName)) {
      const text = inline(node.children ?? [], base).trim();
      if (text !== '') out.push(`${'#'.repeat(HEADINGS[tagName])} ${text}`);
    } else if (tagName === 'p') {
      const text = inline(node.children ?? [], base).trim();
      if (text !== '') out.push(text);
    } else if (tagName === 'ul' || tagName === 'ol') {
      const text = list(node, base);
      if (text !== '') out.push(text);
    } else if (tagName === 'blockquote') {
      out.push(quoted(blocks(node.children ?? [], base).join('\n\n')));
    } else if (tagName === 'pre') {
      out.push(codeBlock(node));
    } else if (tagName === 'table') {
      const text = pipeTable(node, base);
      if (text !== '') out.push(text);
    } else if (tagName === 'hr') {
      out.push('---');
    } else if (tagName === 'figure' && classesOf(node).includes('konzilo-embed')) {
      const link = embedLink(node, base);
      if (link) out.push(link);
    } else {
      out.push(...blocks(node.children ?? [], base));
    }
  }
  flush();
  return out;
}

// A page's Markdown: { markdown }, or { problem }, why it has none. `html` is
// the whole page; `url`, its canonical address; `title`, its title, which heads
// the body unless the body begins with it; `front`, the front matter as the
// build wrote it.
export function pageMarkdown({ html, url, title = '', front = '' }) {
  const { node, problem } = mainOf(htmlToHast(html));
  if (problem) return { problem };
  const body = blocks(node.children ?? [], url).join('\n\n').trim();
  const heading = title === '' ? '' : `# ${escapedText(title)}`;
  const whole = heading !== '' && body !== heading && !body.startsWith(`${heading}\n`) ? (body === '' ? heading : `${heading}\n\n${body}`) : body;
  return { markdown: `${front}\n${whole === '' ? '' : `${whole}\n`}` };
}
