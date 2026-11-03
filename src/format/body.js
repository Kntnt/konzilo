// The body check: a post's body as its source file holds it, read through the
// site's reader, against the rule data, and written in the exact form of the
// content format, block by block, until the reader reads the written body as it
// read the source. It imports nothing, and is handed its reader and the rule data,
// so that the field can run this same implementation in the browser and give one
// verdict in one wording. Exact bytes are its job, not the editor's: table padding,
// bullet characters or a bare address in angle brackets make no difference.
//
// What it is handed:
//
//   reader     { tree(markdown) }: Sätteri's Markdown tree, with positions
//   rules      the rule data (rules.json)
//   elements   the names of the body elements the post's type takes
//   embedOf    (address, rules) gives the embed, or { reason } (embeds.js)
//   declared   what an attribute may name, by its `declared` key: { forms: [...] }
//   directive  (name, values) gives { reasons, warnings, values }, the site's own
//              check of a directive, its values in the order they are written;
//              optional
//   link       (id, fragment) gives { href }, { text: true, warning } or { reason }
//              for a link `konzilo:<id>#<fragment>`
//   image      (address) gives { src, warning }, or { reason }
//   adminHost  the host no link may lead to, or null
//
// A problem is { path, name, line, reason }: the block by its path, `2.1`, and its
// element's name, the line in `source`, and the reason in words an editor can act
// on. Every problem in a body is named, in the order of its blocks.

const ALNUM = /[\p{L}\p{N}]/u;
const NAME_START = /^[\p{L}\p{N}][\p{L}\p{N}_-]*/u;
const MARKS = ['strong', 'em', 's', 'sup', 'sub'];

// The words of a refusal, from the rule data. A key the rule data lacks is a fault
// in the core, so it throws, and the check fails closed.
function say(rules, key, values = {}) {
  const words = rules.refusals?.[key];
  if (typeof words !== 'string') throw new Error(`the rule data has no words for the refusal ${key}`);
  return words.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
}

const labelOf = (rules, element) => rules.elements[element]?.label ?? element;
const inlineLabel = (rules, inline) => rules.inline[inline]?.label ?? inline;

// Where a node stands, kept off the JSON that two trees are compared by.
function at(node, where) {
  Object.defineProperty(node, 'at', { value: where, enumerable: false, writable: true });
  return node;
}

// Reading: the reader's tree to the check's own model, the same for a source
// and for a written body, so that the two can be compared.

// A body as its model: { blocks, problems, warnings }, each block { node, path,
// name, line }, with its footnotes after the other blocks, numbered by the order
// of their marks.
export function readBody(source, hands) {
  const { rules } = hands;
  const scope = { ...hands, source, written: false, problems: [], warnings: [], anchors: new Map(), marks: [], definitions: [] };
  const blocks = [];
  let path = 0;
  for (const child of hands.reader.tree(source).children ?? []) {
    if (child.type === 'footnoteDefinition') {
      scope.definitions.push(child);
      continue;
    }
    path += 1;
    const read = blockOf(child, { ...scope, path: String(path), top: true });
    for (const block of read) blocks.push({ node: block, path: String(path), name: nameOf(block), line: lineOf(child) });
  }
  blocks.push(...footnotesOf(scope, rules));
  return { blocks, problems: sorted(scope.problems), warnings: sorted(scope.warnings) };
}

const lineOf = (node) => node?.position?.start?.line ?? null;

function nameOf(node) {
  if (node.type === 'directive') return node.element;
  if (node.type === 'definition') return 'footnotes';
  return node.type;
}

const pathOrder = (path) => String(path).split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : Number.MAX_SAFE_INTEGER));

function sorted(problems) {
  const before = (a, b) => {
    const [x, y] = [pathOrder(a.path), pathOrder(b.path)];
    for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
      if ((x[i] ?? -1) !== (y[i] ?? -1)) return (x[i] ?? -1) - (y[i] ?? -1);
    }
    return 0;
  };
  return problems.map((problem, index) => [problem, index]).sort(([a, i], [b, j]) => before(a, b) || i - j).map(([problem]) => problem);
}

function refuse(scope, node, name, key, values) {
  scope.problems.push({ path: scope.path, name, line: lineOf(node), reason: say(scope.rules, key, values) });
}

// The reason a block's element is not taken: its type names the elements it takes.
function taken(scope, node, element) {
  if (scope.written || scope.elements === undefined || scope.elements.includes(element)) return true;
  refuse(scope, node, element, 'element-not-taken', { element: labelOf(scope.rules, element) });
  return false;
}

// A top-level or a quoted node as its blocks, none where it is left out.
function blockOf(node, scope) {
  switch (node.type) {
    case 'paragraph': return paragraphOf(node, scope);
    case 'heading': return headingOf(node, scope);
    case 'list': return listOf(node, scope);
    case 'blockquote': return quoteOf(node, scope);
    case 'code': return codeOf(node, scope);
    case 'table': return tableOf(node, scope);
    case 'html': return htmlBlockOf(node, scope);
    case 'leafDirective':
    case 'containerDirective': return directiveOf(node, scope);
    default:
      scope.problems.push({ path: scope.path, name: node.type, line: lineOf(node), reason: constructWords(scope.rules, node.type) });
      return [];
  }
}

function constructWords(rules, type) {
  return rules.refusals?.constructs?.[type] ?? say(rules, 'construct', { type });
}

// Inline content as the model's inline nodes. `allowed` names the inline elements
// of what holds it. A raw tag is read with what follows up to its end tag.
function inlineOf(children, allowed, scope, element, inLink = false) {
  const root = [];
  const stack = [{ tag: null, children: root }];
  const push = (node) => stack.at(-1).children.push(node);
  const linked = () => inLink || stack.some(({ tag }) => tag === 'a');
  const check = (name, node) => {
    if (allowed.includes(name)) return true;
    refuse(scope, node, element, 'inline-element', { inline: inlineLabel(scope.rules, name), element: labelOf(scope.rules, element) });
    return false;
  };
  for (const node of children) {
    switch (node.type) {
      case 'text':
        push({ type: 'text', value: node.value });
        break;
      case 'strong':
        if (check('strong', node)) push({ type: 'strong', children: inlineOf(node.children, allowed, scope, element, inLink) });
        break;
      case 'emphasis':
        if (check('em', node)) push({ type: 'em', children: inlineOf(node.children, allowed, scope, element, inLink) });
        break;
      case 'delete':
        if (check('s', node)) push({ type: 's', children: inlineOf(node.children, allowed, scope, element, inLink) });
        break;
      case 'inlineCode':
        if (check('code', node)) push({ type: 'code', value: node.value.replace(/\n/g, ' ') });
        break;
      case 'break':
        if (check('br', node)) push({ type: 'break' });
        break;
      case 'footnoteReference':
        if (linked()) refuse(scope, node, element, 'footnote-place');
        else if (check('footnote', node)) {
          const mark = { type: 'footnote', n: scope.written ? Number(node.identifier) : node.identifier };
          scope.marks?.push({ mark, node, path: scope.path, element });
          push(mark);
        }
        break;
      case 'link': {
        if (linked()) {
          // GFM reads an address inside a raw link as a link of its own. In a source
          // that is the raw link's text; in a written body it is a misreading.
          if (scope.written) push({ type: 'unreadable' });
          else push(...inlineOf(node.children, allowed, scope, element, true));
          break;
        }
        if (!check('a', node)) break;
        if (node.title) refuse(scope, node, element, 'link-title');
        const address = linkProblem(node.url, scope);
        if (address) refuse(scope, node, element, address.key, address.values);
        push(at({ type: 'link', href: node.url, target: null, rel: null, children: inlineOf(node.children, allowed, scope, element, true) }, { path: scope.path, line: lineOf(node), element }));
        break;
      }
      case 'image':
        refuse(scope, node, element, 'image-alone');
        break;
      case 'textDirective': {
        const literal = literalDirective(node, scope);
        if (literal === null) {
          if (scope.written) push({ type: 'unreadable' });
          else refuse(scope, node, element, 'directive-unknown', { name: `:${node.name}` });
        } else if (scope.written) push({ type: 'unreadable' });
        else push({ type: 'text', value: literal });
        break;
      }
      case 'html':
        rawInline(node, { push, stack, check, allowed, scope, element, inLink });
        break;
      default:
        scope.problems.push({ path: scope.path, name: element, line: lineOf(node), reason: constructWords(scope.rules, node.type) });
    }
  }
  if (stack.length > 1) refuse(scope, children.at(-1), element, 'raw-unclosed', { tag: stack.at(-1).tag });
  return root;
}

// The literal text a directive with no attributes and no label was written as, or
// null for one with any: no text becomes one of those by chance.
function literalDirective(node, scope) {
  if (Object.keys(node.attributes ?? {}).length > 0 || (node.children?.length ?? 0) > 0) return null;
  const { start, end } = node.position ?? {};
  return start && end && scope.source !== undefined ? scope.source.slice(start.offset, end.offset) : `:${node.name}`;
}

const RAW_MARKS = { strong: 'strong', em: 'em', del: 's', sup: 'sup', sub: 'sub' };

function rawInline(node, { push, stack, check, allowed, scope, element, inLink }) {
  const value = node.value.trim();
  if (value === '<!-- -->' || value === '<!---->') {
    push({ type: 'comment' });
    return;
  }
  const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>$/.exec(value);
  const fail = () => {
    if (scope.written) push({ type: 'unreadable' });
    else refuse(scope, node, element, 'raw-html', { tag: value });
  };
  if (!tag) return fail();
  const [, closing, rawName, rest] = tag;
  const name = rawName.toLowerCase();
  if (closing) {
    if (stack.at(-1).tag !== name) return fail();
    const { open } = stack.pop();
    push(open);
    return undefined;
  }
  if (Object.hasOwn(RAW_MARKS, name)) {
    if (rest.trim() !== '') return fail();
    if (!check(RAW_MARKS[name], node)) {
      // Keeps reading what it holds, so that each problem is named once.
      stack.push({ tag: name, children: [], open: { type: 'comment' } });
      return undefined;
    }
    const open = { type: RAW_MARKS[name], children: [] };
    stack.push({ tag: name, children: open.children, open });
    return undefined;
  }
  if (name === 'a') {
    if (inLink) return fail();
    const attributes = attributesOf(rest, scope);
    if (attributes === null) return fail();
    if (Object.keys(attributes).join() === 'id') {
      if (scope.written) push({ type: 'unreadable' });
      else refuse(scope, node, element, 'anchor-place');
      stack.push({ tag: name, children: [], open: { type: 'comment' } });
      return undefined;
    }
    if (!check('a', node)) {
      stack.push({ tag: name, children: [], open: { type: 'comment' } });
      return undefined;
    }
    const open = rawLink(attributes, node, scope, element);
    if (open === null) {
      stack.push({ tag: name, children: [], open: { type: 'comment' } });
      return undefined;
    }
    stack.push({ tag: name, children: open.children, open });
    return undefined;
  }
  return fail();
}

// A raw link's attributes against the rule data, as the model's link, or null.
function rawLink(attributes, node, scope, element) {
  const { rules } = scope;
  const { attributes: known, values } = rules.inline.a;
  for (const name of Object.keys(attributes)) {
    if (!known.includes(name)) {
      refuse(scope, node, element, 'raw-html', { tag: node.value });
      return null;
    }
  }
  if (attributes.href === undefined) {
    refuse(scope, node, element, 'raw-html', { tag: node.value });
    return null;
  }
  const { target = null, rel = null } = attributes;
  const problems = [];
  if (target !== null && !values.target.values.includes(target)) problems.push(values.target.refusal.replaceAll('{value}', target));
  if (rel !== null) {
    const words = rel.split(' ');
    if (words.some((word) => !values.rel.words.includes(word)) || new Set(words).size !== words.length) {
      problems.push(values.rel.refusal.replaceAll('{value}', rel).replaceAll('{words}', listed(values.rel.words)));
    }
  }
  for (const problem of problems) scope.problems.push({ path: scope.path, name: element, line: lineOf(node), reason: `the site cannot publish ${problem}` });
  const address = linkProblem(attributes.href, scope);
  if (address) refuse(scope, node, element, address.key, address.values);
  return at({ type: 'link', href: attributes.href, target, rel, children: [] }, { path: scope.path, line: lineOf(node), element });
}

function listed(words) {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

// A raw tag's attributes by name, decoded, or null for what is no such list.
function attributesOf(text, scope) {
  const found = {};
  const pattern = /\s+([a-zA-Z_:][-\w:.]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
  let end = 0;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    // In a pipe table's cell the reader keeps the backslash of `\|` inside raw HTML.
    found[match[1].toLowerCase()] = decode(scope.cell ? value.replaceAll('\\|', '|') : value, scope);
    end = pattern.lastIndex;
  }
  return text.slice(end).trim() === '' ? found : null;
}

const BASIC_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// HTML's character references in a raw value, by the reader's own table for a name
// the check does not know.
function decode(text, scope) {
  if (!text.includes('&')) return text;
  return text.replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (whole, name) => {
    if (name.startsWith('#')) {
      const code = /^#[xX]/.test(name) ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    if (Object.hasOwn(BASIC_ENTITIES, name)) return BASIC_ENTITIES[name];
    return readsAsReference(whole, scope) ?? whole;
  });
}

// What the reader reads a character reference as, or null when it reads it as text.
function readsAsReference(reference, scope) {
  const read = scope.reader.tree(reference).children?.[0]?.children?.[0];
  return read?.type === 'text' && read.value !== reference ? read.value : null;
}

// Why a link's address cannot be published, or null: `http://`, `https://`,
// `mailto:`, `tel:`, a path on the site or a reference by ID, and never the admin
// host. A fragment alone would land on the site's root in a feed or an alternate.
function linkProblem(href, scope) {
  if (scope.written) return null;
  if (href.startsWith('konzilo:')) return null;
  if (href.startsWith('#')) return { key: 'link-fragment', values: { address: href } };
  const { schemes, paths } = scope.rules.links;
  if (paths && href.startsWith('/') && !href.startsWith('//')) return null;
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href)?.[1]?.toLowerCase();
  if (!scheme || !schemes.includes(scheme)) return { key: 'link-address', values: { address: href, schemes: listed(schemes.map((one) => `${one}:`)) } };
  if (scope.adminHost && (scheme === 'http' || scheme === 'https')) {
    const host = /^[a-zA-Z]+:\/\/([^/?#:]*)/.exec(href)?.[1]?.toLowerCase();
    if (host === scope.adminHost.toLowerCase()) return { key: 'link-admin', values: { address: href } };
  }
  return null;
}

// The tidying a page cannot tell from the source: comments and empty runs go, spaces
// at the edges of bold and italic move out of them, since a run cannot open or close
// beside a space; a strikethrough keeps them, or the page would lose the line through
// them. Runs of one kind side by side become one.
function tidy(nodes) {
  const moved = [];
  for (const node of nodes) {
    if (node.type === 'comment') continue;
    if (node.children) node.children = tidy(node.children);
    if (node.children && node.children.length === 0) continue;
    if (node.type === 'text' && node.value === '') continue;
    if (node.type === 'strong' || node.type === 'em') {
      const [first] = node.children;
      const last = node.children.at(-1);
      const lead = first.type === 'text' ? /^[ \t ]*/.exec(first.value)[0] : '';
      if (lead) first.value = first.value.slice(lead.length);
      const trail = last.type === 'text' ? /[ \t ]*$/.exec(last.value)[0] : '';
      if (trail) last.value = last.value.slice(0, last.value.length - trail.length);
      node.children = node.children.filter((child) => child.type !== 'text' || child.value !== '');
      if (lead) moved.push({ type: 'text', value: lead });
      if (node.children.length > 0) moved.push(node);
      if (trail) moved.push({ type: 'text', value: trail });
      continue;
    }
    moved.push(node);
  }
  const merged = [];
  for (const node of moved) {
    const previous = merged.at(-1);
    if (previous && node.type === 'text' && previous.type === 'text') previous.value += node.value;
    else if (previous && MARKS.includes(node.type) && previous.type === node.type) previous.children = tidy([...previous.children, ...node.children]);
    else if (previous && node.type === 'link' && previous.type === 'link' && previous.href === node.href && previous.target === node.target && previous.rel === node.rel) {
      previous.children = tidy([...previous.children, ...node.children]);
    } else merged.push(node);
  }
  return merged;
}

// A block's text without what a page does not show at its edges: spaces and tabs at
// its ends, a non-breaking space staying, and a line break with nothing after it.
function trimmed(nodes) {
  const out = [...nodes];
  while (out.length > 0 && out[0].type === 'text') {
    out[0] = { ...out[0], value: out[0].value.replace(/^[ \t]+/, '') };
    if (out[0].value !== '') break;
    out.shift();
  }
  while (out.length > 0) {
    const last = out.at(-1);
    if (last.type === 'break') out.pop();
    else if (last.type === 'text') {
      const value = last.value.replace(/[ \t]+$/, '');
      if (value === '') out.pop();
      else {
        out[out.length - 1] = { ...last, value };
        break;
      }
    } else break;
  }
  return out;
}

const textOf = (nodes, allowed, scope, element, node) => {
  const read = trimmed(tidy(inlineOf(nodes, allowed, scope, element)));
  if (!scope.written && holdsSoftBreak(read)) refuse(scope, node, element, 'soft-break');
  return read;
};

const holdsSoftBreak = (nodes) => nodes.some((node) => (node.type === 'text' && node.value.includes('\n')) || (node.children && holdsSoftBreak(node.children)));

// A paragraph: an image or a gallery, an embed, a bare directive read as its text,
// or text. An empty one is left out, as a page shows nothing of it.
function paragraphOf(node, scope) {
  const element = 'paragraph';
  const visible = node.children.filter((child) => !isComment(child));
  if (visible.some((child) => child.type === 'image')) return figureOf(node, visible, scope);
  const address = loneAddress(node, visible, scope);
  if (address !== null) return embedAt(node, address, scope);
  const caption = captionedAddress(visible, scope);
  if (caption !== null) {
    refuse(scope, node, 'embed', 'embed-caption', { address: caption });
    return [];
  }
  if (!scope.written && !taken(scope, node, element)) return [];
  const children = textOf(node.children, scope.rules.elements[element].inline, scope, element, node);
  return children.length === 0 ? [] : [{ type: 'paragraph', children }];
}

const isComment = (node) => node.type === 'html' && ['<!-- -->', '<!---->'].includes(node.value.trim());

// The address a paragraph holds and nothing else, by the reader's own test of a lone
// address: a link whose text is its own address. A written link with such a text that
// is not split by a comment is what the site shows as an embed, whatever its brackets
// say, and a source's `[address](address)` stays the link it says it is.
function loneAddress(node, visible, scope) {
  const [link, ...rest] = visible;
  if (rest.length > 0 || link?.type !== 'link' || link.title) return null;
  const inner = link.children.filter((child) => !isComment(child));
  if (inner.length !== 1 || inner[0].type !== 'text' || inner[0].value !== link.url) return null;
  if (inner.length !== link.children.length) return null;
  if (!scope.written && scope.source?.slice(link.position?.start?.offset, link.position?.end?.offset).startsWith('[')) return null;
  return link.url;
}

// A paragraph that opens with an address of a service the site embeds, and goes on
// after a line break: an embed with a caption, which the site cannot show.
function captionedAddress(visible, scope) {
  if (scope.written || visible.length < 2 || visible[1].type !== 'break') return null;
  const [link] = visible;
  if (link.type !== 'link' || link.children.length !== 1 || link.children[0].value !== link.url) return null;
  return scope.embedOf(link.url, scope.rules).reason ? null : link.url;
}

function embedAt(node, address, scope) {
  if (scope.written) return [{ type: 'embed', address }];
  if (!scope.top) {
    refuse(scope, node, 'embed', 'embed-place');
    return [];
  }
  if (!taken(scope, node, 'embed')) return [];
  const embed = scope.embedOf(address, scope.rules);
  if (embed.reason) {
    scope.problems.push({ path: scope.path, name: 'embed', line: lineOf(node), reason: embed.reason });
    return [];
  }
  return [{ type: 'embed', address }];
}

// The lines of a paragraph with an image, as the reader's own plugin finds them.
function linesOf(children) {
  const lines = [{ after: null, nodes: [] }];
  for (const node of children) {
    if (node.type === 'break') lines.push({ after: 'hard', nodes: [] });
    else if (node.type === 'text') {
      node.value.split('\n').forEach((part, index) => {
        if (index > 0) lines.push({ after: 'soft', nodes: [] });
        if (part !== '') lines.at(-1).nodes.push({ ...node, value: part });
      });
    } else lines.at(-1).nodes.push(node);
  }
  return lines;
}

// An image alone in a paragraph with its caption, or a gallery of two or more with
// their captions and its own. Anything else with an image in it is refused.
function figureOf(node, visible, scope) {
  const items = [];
  let captionNodes = null;
  const alone = () => {
    refuse(scope, node, 'image', 'image-alone');
    return [];
  };
  if (!scope.written && !scope.top) {
    refuse(scope, node, 'image', 'image-place');
    return [];
  }
  for (const { after, nodes } of linesOf(visible)) {
    const image = nodes.length === 1 && nodes[0].type === 'image' ? nodes[0] : null;
    if (nodes.length === 0 || captionNodes !== null || (!image && nodes.some((one) => one.type === 'image'))) return alone();
    if (after === 'hard') {
      const last = items.at(-1);
      if (!last || last.captionNodes || image) return alone();
      last.captionNodes = nodes;
    } else if (image) items.push({ image, captionNodes: null });
    else if (items.length > 1) captionNodes = nodes;
    else return alone();
  }
  const element = items.length > 1 ? 'gallery' : 'image';
  if (!scope.written && !(taken(scope, node, element) && (element === 'image' || taken(scope, node, 'image')))) return [];
  const allowed = scope.rules.elements[element].inline;
  const captionOf = (nodes) => {
    if (!nodes) return null;
    const read = trimmed(tidy(inlineOf(nodes, allowed, scope, element)));
    return read.length === 0 ? null : read;
  };
  const images = items.map(({ image, captionNodes: own }) => {
    const alt = image.alt.trim();
    if (!scope.written) {
      if (image.title) refuse(scope, image, element, 'image-title');
      if (alt === '') refuse(scope, image, element, 'image-alt');
      else if (alt.includes('\n')) refuse(scope, image, element, 'image-alt-lines');
    }
    return at({ type: 'image', alt, src: image.url, caption: captionOf(own) }, { path: scope.path, line: lineOf(image), element });
  });
  return [element === 'image' ? images[0] : { type: 'gallery', images, caption: captionOf(captionNodes) }];
}

// A heading at levels 2 to 6, with its anchor, an empty raw <a> before its text.
function headingOf(node, scope) {
  const element = 'heading';
  if (!taken(scope, node, element)) return [];
  const rule = scope.rules.elements[element];
  if (!scope.written && !rule.levels.includes(node.depth)) {
    refuse(scope, node, element, 'heading-level', { level: node.depth, levels: `${rule.levels[0]} to ${rule.levels.at(-1)}` });
    return [];
  }
  let { children } = node;
  let anchor = null;
  const [open, close] = children;
  const opened = open?.type === 'html' ? /^<a\s+id\s*=\s*(?:"([^"]*)"|'([^']*)')\s*>$/.exec(open.value.trim()) : null;
  if (opened && close?.type === 'html' && close.value.trim().toLowerCase() === '</a>') {
    anchor = opened[1] ?? opened[2];
    children = children.slice(2);
    if (!scope.written) anchor = anchorOf(anchor, node, scope, rule);
    if (anchor === '') anchor = null;
  }
  const read = textOf(children, rule.inline, scope, element, node);
  if (!scope.written && read.length === 0) {
    refuse(scope, node, element, 'heading-empty');
    return [];
  }
  return [{ type: 'heading', level: node.depth, anchor, children: read }];
}

// An anchor against the rule data, and against every other id on its page: two
// headings with one anchor send every link to the first, and the footnotes' ids are
// the reader's own.
function anchorOf(anchor, node, scope, rule) {
  if (anchor === '') return anchor;
  if (!new RegExp(rule.anchor).test(anchor)) {
    refuse(scope, node, 'heading', 'anchor-form', { anchor });
    return null;
  }
  if (/^(?:user-content-fn(?:ref)?-|footnote-label$)/.test(anchor)) {
    refuse(scope, node, 'heading', 'anchor-taken', { anchor });
    return null;
  }
  if (scope.anchors.has(anchor)) {
    refuse(scope, node, 'heading', 'anchor-twice', { anchor, block: scope.anchors.get(anchor) });
    return null;
  }
  scope.anchors.set(anchor, scope.path);
  return anchor;
}

// A list: tight, each item one paragraph and at most one nested list after it, a
// numbered list starting at 1.
function listOf(node, scope) {
  const element = 'list';
  if (!taken(scope, node, element)) return [];
  if (!scope.written) {
    if (node.ordered && node.start !== 1 && node.start !== null) refuse(scope, node, element, 'list-start', { start: node.start });
    if (node.spread) refuse(scope, node, element, 'list-loose');
  }
  const allowed = scope.rules.elements[element].inline;
  const items = node.children.map((item, index) => {
    const inner = { ...scope, path: `${scope.path}.${index + 1}`, top: false };
    if (!scope.written) {
      if (item.checked !== null && item.checked !== undefined) refuse(inner, item, element, 'list-task');
    }
    const [first, second, ...rest] = item.children;
    if (first?.type !== 'paragraph') {
      if (scope.written) return { unreadable: true };
      refuse(inner, item, element, first ? 'list-item-blocks' : 'list-item-empty');
      return null;
    }
    if (rest.length > 0 || (second && second.type !== 'list')) {
      if (scope.written) return { unreadable: true };
      refuse(inner, item, element, 'list-item-blocks');
      return null;
    }
    if (!scope.written && item.spread) refuse(inner, item, element, 'list-loose');
    const children = textOf(first.children, allowed, inner, element, first);
    if (children.length === 0 && !scope.written) {
      refuse(inner, item, element, 'list-item-empty');
      return null;
    }
    const nested = second ? listOf(second, inner)[0] ?? null : null;
    return { children, list: nested };
  });
  return [{ type: 'list', ordered: node.ordered === true, items: items.filter(Boolean) }];
}

// A quote: its blocks, each one the rule data lets a quote hold, and its citation,
// the last paragraph wrapped whole in raw <cite>.
function quoteOf(node, scope) {
  const element = 'quote';
  if (!taken(scope, node, element)) return [];
  const rule = scope.rules.elements[element];
  const children = [];
  let citation = null;
  let count = 0;
  node.children.forEach((child, index) => {
    count += 1;
    const inner = { ...scope, path: `${scope.path}.${count}`, top: false };
    const wrapped = child.type === 'paragraph' ? citationIn(child, index === node.children.length - 1, inner) : null;
    if (wrapped !== null) {
      if (wrapped.length > 0) citation = wrapped;
      return;
    }
    const name = { paragraph: 'paragraph', heading: 'heading', list: 'list', blockquote: 'quote' }[child.type];
    if (!name || !rule.inner.includes(name)) {
      if (scope.written) children.push({ type: 'unreadable' });
      else refuse(inner, child, element, 'quote-block', { block: labelOfNode(child, scope.rules) });
      return;
    }
    children.push(...blockOf(child, inner));
  });
  if (!scope.written && node.children.length === 0) {
    refuse(scope, node, element, 'quote-empty');
    return [];
  }
  return [{ type: 'quote', children, citation }];
}

function labelOfNode(node, rules) {
  const names = { code: 'code', table: 'table', html: 'table', leafDirective: 'post-list', containerDirective: 'post-list', footnoteDefinition: 'footnotes' };
  return labelOf(rules, names[node.type] ?? node.type);
}

// A citation's text, or null for a paragraph that is none. A <cite> anywhere else
// is refused, and an empty one goes.
function citationIn(paragraph, last, scope) {
  const { children } = paragraph;
  const opens = (node) => node?.type === 'html' && node.value.trim().toLowerCase() === '<cite>';
  const closes = (node) => node?.type === 'html' && node.value.trim().toLowerCase() === '</cite>';
  if (!children.some((node) => opens(node) || closes(node))) return null;
  if (!last || !opens(children[0]) || !closes(children.at(-1)) || children.slice(1, -1).some((node) => opens(node) || closes(node))) {
    if (!scope.written) refuse(scope, paragraph, 'quote', 'citation-place');
    return scope.written ? [{ type: 'unreadable' }] : [];
  }
  return textOf(children.slice(1, -1), scope.rules.elements.quote.citation, scope, 'quote', paragraph);
}

// A code block, which a quote cannot hold and a list's item neither: never empty, its
// lines without spaces at their ends. A code block has no language, so one goes, with a
// warning.
function codeOf(node, scope) {
  const element = 'code';
  if (!taken(scope, node, element)) return [];
  const value = node.value.replace(/[ \t]+$/gm, '');
  if (!scope.written && value.trim() === '') {
    refuse(scope, node, element, 'code-empty');
    return [];
  }
  if (!scope.written && node.lang) scope.warnings.push({ path: scope.path, name: element, line: lineOf(node), reason: say(scope.rules, 'code-language', { language: node.lang }) });
  return [{ type: 'code', value }];
}

// A pipe table, as the model of a table of either form.
function tableOf(node, scope) {
  const element = 'table';
  if (!taken(scope, node, element)) return [];
  const allowed = scope.rules.elements[element].inline;
  const columns = node.align.length;
  const cellOf = (cell, row, column) => ({
    children: trimmed(tidy(inlineOf(cell.children, allowed, { ...scope, path: `${scope.path}.${row + 1}.${column + 1}`, cell: true, marks: null }, element))),
  });
  const rows = node.children.map((row, index) => {
    const cells = row.children.map((cell, column) => cellOf(cell, index, column));
    if (!scope.written && cells.length > columns) refuse(scope, row, element, 'table-row', { row: index + 1, cells: cells.length, columns });
    while (cells.length < columns) cells.push({ children: [] });
    return cells;
  });
  if (!scope.written && rows[0].every((cell) => cell.children.length === 0)) refuse(scope, node, element, 'table-no-header');
  return [{ type: 'table', caption: null, align: node.align.map((one) => one ?? null), head: rows[0], body: rows.slice(1), foot: [] }];
}

// Raw HTML as a block: a structured table of its one fixed shape, an empty comment
// that shows nothing, and nothing else: an editor's own raw HTML never reaches the site.
function htmlBlockOf(node, scope) {
  const value = node.value.trim();
  if (value === '<!-- -->' || value === '<!---->') return [];
  if (/^<table[\s>]/i.test(value)) return structuredOf(node, value, scope);
  if (scope.written) return [{ type: 'unreadable' }];
  refuse(scope, node, 'paragraph', 'raw-html', { tag: firstTag(value) });
  return [];
}

const firstTag = (value) => /^<[^>\n]*>?/.exec(value)?.[0] ?? value.split('\n')[0];

// The HTML of a structured table as tokens: { open, close, name, attributes } or
// { text }, a `<` that opens no tag being text.
function htmlTokens(html, scope) {
  const tokens = [];
  const tag = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[a-zA-Z_:][-\w:.]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>|<!--.*?-->/gsy;
  let text = '';
  for (let i = 0; i < html.length;) {
    tag.lastIndex = i;
    const match = html[i] === '<' ? tag.exec(html) : null;
    if (!match) {
      text += html[i];
      i += 1;
      continue;
    }
    if (text !== '') tokens.push({ text: decode(text, scope) });
    text = '';
    i = tag.lastIndex;
    if (match[0].startsWith('<!--')) continue;
    tokens.push({ open: match[1] === '', close: match[1] === '/', name: match[2].toLowerCase(), raw: match[0], attributes: attributesOf(match[3], scope) ?? {} });
  }
  if (text !== '') tokens.push({ text: decode(text, scope) });
  return tokens;
}

const CELL_MARKS = { strong: 'strong', em: 'em', del: 's', sup: 'sup', sub: 'sub' };

// A structured table: the one fixed shape, read whatever its spacing, and held to
// the format's rules. A table that needs none of its forms is written as a pipe table.
function structuredOf(node, html, scope) {
  const element = 'table';
  if (!scope.written && !taken(scope, node, element)) return [];
  const bad = (key, values) => {
    if (scope.written) return [{ type: 'unreadable' }];
    refuse(scope, node, element, key, values);
    return [];
  };
  const allowed = scope.rules.elements[element].inline;
  const table = { caption: null, sections: { thead: [], tbody: [], tfoot: [] } };
  const tokens = htmlTokens(html, scope);
  let i = 0;
  // The tokens of a cell or a caption, up to its end tag, as the model's inline nodes.
  const inlineUntil = (name, from) => {
    const root = [];
    const stack = [{ tag: name, children: root }];
    for (let next = from; next < tokens.length; next += 1) {
      const token = tokens[next];
      if (token.text !== undefined) {
        stack.at(-1).children.push(stack.at(-1).tag === 'code' ? { type: 'code', value: token.text } : { type: 'text', value: token.text.replace(/\s*\n\s*/g, ' ') });
        continue;
      }
      if (token.close) {
        if (token.name !== stack.at(-1).tag) return { problem: token.raw };
        const { open } = stack.pop();
        if (stack.length === 0) return { nodes: root, next: next + 1 };
        stack.at(-1).children.push(open);
        continue;
      }
      const inner = token.name === 'a' ? 'a' : token.name === 'code' ? 'code' : CELL_MARKS[token.name];
      if (!inner || !allowed.includes(inner) || stack.at(-1).tag === 'code') return { problem: token.raw };
      if (token.name === 'code') {
        const open = { type: 'code', value: '' };
        stack.push({ tag: 'code', children: { push: (child) => { open.value += child.value; } }, open });
      } else if (token.name === 'a') {
        const link = rawLink(token.attributes, { value: token.raw, position: node.position }, scope, element);
        if (link === null) return { problem: null };
        stack.push({ tag: 'a', children: link.children, open: link });
      } else {
        const open = { type: CELL_MARKS[token.name], children: [] };
        stack.push({ tag: token.name, children: open.children, open });
      }
    }
    return { problem: `<${name}>` };
  };
  // Moves past what only separates the tags of the table's frame.
  const skip = (from) => {
    let j = from;
    while (tokens[j]?.text !== undefined && tokens[j].text.trim() === '') j += 1;
    return j;
  };
  const frame = (name, close = false) => {
    i = skip(i);
    const token = tokens[i];
    return token?.name === name && token.close === close;
  };
  if (!frame('table')) return bad('table-shape');
  i += 1;
  if (frame('caption')) {
    const read = inlineUntil('caption', i + 1);
    if (read.problem !== undefined) return bad('table-shape', { tag: read.problem });
    i = read.next;
    const caption = trimmed(tidy(read.nodes));
    table.caption = caption.length === 0 ? null : caption;
  }
  for (;;) {
    i = skip(i);
    const token = tokens[i];
    if (!token) return bad('table-shape');
    if (token.name === 'table' && token.close) {
      i += 1;
      break;
    }
    if (token.close || !Object.hasOwn(table.sections, token.name ?? '')) return bad('table-shape');
    const section = token.name;
    i += 1;
    for (;;) {
      if (frame(section, true)) {
        i += 1;
        break;
      }
      if (!frame('tr')) return bad('table-shape');
      i += 1;
      const row = [];
      for (;;) {
        if (frame('tr', true)) {
          i += 1;
          break;
        }
        i = skip(i);
        const cell = tokens[i];
        if (!cell || cell.close || !['td', 'th'].includes(cell.name)) return bad('table-shape');
        const known = ['colspan', 'rowspan', 'style'];
        if (Object.keys(cell.attributes).some((name) => !known.includes(name))) return bad('table-cell-attribute', { tag: cell.raw });
        const aligned = cell.attributes.style === undefined ? null : /^text-align:\s*(left|center|right);?$/.exec(cell.attributes.style.trim())?.[1];
        if (aligned === undefined) return bad('table-cell-attribute', { tag: cell.raw });
        const span = (name) => {
          const value = cell.attributes[name];
          return value === undefined ? 1 : /^[1-9][0-9]*$/.test(value) ? Number(value) : null;
        };
        const [colspan, rowspan] = [span('colspan'), span('rowspan')];
        if (colspan === null || rowspan === null) return bad('table-cell-attribute', { tag: cell.raw });
        const read = inlineUntil(cell.name, i + 1);
        if (read.problem !== undefined) return bad('table-shape', { tag: read.problem });
        i = read.next;
        row.push({ header: cell.name === 'th', children: trimmed(tidy(read.nodes)), colspan, rowspan, align: aligned });
      }
      table.sections[section].push(row);
    }
  }
  if (skip(i) !== tokens.length) return bad('table-shape');
  const shaped = tableShape(table);
  if (shaped.key) return bad(shaped.key, shaped.values);
  const clean = (row) => row.map(({ children, colspan, rowspan }) => ({ children, ...(colspan > 1 ? { colspan } : {}), ...(rowspan > 1 ? { rowspan } : {}) }));
  return [{ type: 'table', caption: table.caption, align: shaped.align, head: clean(table.sections.thead[0]), body: table.sections.tbody.map(clean), foot: table.sections.tfoot.map(clean) }];
}

// Counts a table by its spans: one header row of header cells, a plain cell
// everywhere else, every row of each section covering each column once, and a
// column's alignment that of the cells that start in it. { align } or { key, values }.
function tableShape({ sections }) {
  const { thead, tbody, tfoot } = sections;
  if (thead.length === 0) return { key: 'table-no-header' };
  if (thead.length > 1) return { key: 'table-header-rows' };
  if (thead[0].length === 0) return { key: 'table-empty' };
  if (thead[0].some((cell) => !cell.header)) return { key: 'table-header-plain' };
  if ([...tbody, ...tfoot].some((row) => row.some((cell) => cell.header))) return { key: 'table-header-outside' };
  const columns = thead[0].reduce((sum, cell) => sum + cell.colspan, 0);
  const align = Array.from({ length: columns }, () => undefined);
  for (const rows of [thead, tbody, tfoot]) {
    const below = Array.from({ length: columns }, () => 0);
    for (const [index, row] of rows.entries()) {
      let column = 0;
      for (const cell of row) {
        while (below[column] > 0) column += 1;
        if (column + cell.colspan > columns) return { key: 'table-spans', values: { row: index + 1 } };
        for (let c = column; c < column + cell.colspan; c += 1) {
          if (below[c] > 0) return { key: 'table-spans', values: { row: index + 1 } };
          below[c] = cell.rowspan;
        }
        if (index + cell.rowspan > rows.length) return { key: 'table-spans', values: { row: index + 1 } };
        if (align[column] !== undefined && align[column] !== cell.align) return { key: 'table-align', values: { column: column + 1 } };
        align[column] = cell.align;
        column += cell.colspan;
      }
      if (below.some((left) => left === 0)) return { key: 'table-spans', values: { row: index + 1 } };
      for (let c = 0; c < columns; c += 1) below[c] -= 1;
    }
  }
  return { align: align.map((one) => one ?? null) };
}

// A directive the rule data registers; a bare leaf it has not got reads as the text
// it was written as, and anything else is refused.
function directiveOf(node, scope) {
  const { rules } = scope;
  const found = Object.entries(rules.elements).find(([, rule]) => rule.directive?.name === node.name);
  const mark = node.type === 'leafDirective' ? '::' : ':::';
  if (!found) {
    if (scope.written) return [{ type: 'unreadable' }];
    const literal = node.type === 'leafDirective' ? literalDirective(node, scope) : null;
    if (literal === null) {
      refuse(scope, node, 'paragraph', 'directive-unknown', { name: `${mark}${node.name}` });
      return [];
    }
    return [{ type: 'paragraph', children: [{ type: 'text', value: literal }] }];
  }
  const [element, { directive }] = found;
  const form = node.type === 'leafDirective' ? 'leaf' : 'container';
  if (scope.written) {
    if (form !== directive.form || (node.children?.length ?? 0) > 0) return [{ type: 'unreadable' }];
    return [{ type: 'directive', element, name: node.name, attributes: mapValues(node.attributes ?? {}, (text) => decode(text ?? '', scope)) }];
  }
  if (form !== directive.form) {
    refuse(scope, node, element, 'directive-form', { name: node.name, form: directive.form === 'leaf' ? `::${node.name}, on a line of its own` : `:::${node.name}, around its body` });
    return [];
  }
  if (!taken(scope, node, element)) return [];
  if ((node.children?.length ?? 0) > 0 && directive.body !== 'text') refuse(scope, node, element, 'directive-label', { name: node.name });
  const values = attributesFrom(node, directive, element, scope);
  if (values === null) return [];
  const checked = scope.directive?.(node.name, values, directive) ?? { reasons: [], warnings: [], values };
  for (const reason of checked.reasons ?? []) scope.problems.push({ path: scope.path, name: element, line: lineOf(node), reason });
  for (const reason of checked.warnings ?? []) scope.warnings.push({ path: scope.path, name: element, line: lineOf(node), reason });
  if ((checked.reasons ?? []).length > 0) return [];
  return [{ type: 'directive', element, name: node.name, attributes: writtenAttributes(checked.values ?? values, directive) }];
}

const mapValues = (object, map) => Object.fromEntries(Object.entries(object).map(([key, value]) => [key, map(value)]));

// A directive's attributes against its rule, typed; null after a problem.
function attributesFrom(node, directive, element, scope) {
  const { rules } = scope;
  const given = node.attributes ?? {};
  const values = {};
  let wrong = false;
  const fail = (key, words) => {
    refuse(scope, node, element, key, words);
    wrong = true;
  };
  for (const [name, text] of Object.entries(given)) {
    const setting = directive.attributes[name];
    const value = decode(text ?? '', scope);
    if (!setting) {
      if (directive.optionsOf) values[name] = value;
      else fail('directive-attribute', { name: node.name, attribute: name });
      continue;
    }
    const typed = typedValue(setting.type, value);
    const allowed = typed !== undefined && (!setting.values || setting.values.includes(typed)) && (!setting.pattern || new RegExp(setting.pattern).test(String(typed)));
    if (!allowed) {
      if (setting.refusal && !setting.declared) {
        scope.problems.push({ path: scope.path, name: element, line: lineOf(node), reason: setting.refusal.replaceAll('{value}', value) });
        wrong = true;
      } else fail('directive-value', { attribute: name, value });
      continue;
    }
    if (setting.declared && !(scope.declared?.[setting.declared] ?? []).includes(typed)) {
      const names = scope.declared?.[setting.declared] ?? [];
      scope.problems.push({ path: scope.path, name: element, line: lineOf(node), reason: setting.refusal.replaceAll('{value}', value).replaceAll('{declared}', names.length === 0 ? 'none' : listed(names)) });
      wrong = true;
      continue;
    }
    values[name] = typed;
  }
  for (const [name, setting] of Object.entries(directive.attributes)) {
    if (setting.required && !Object.hasOwn(given, name)) fail('directive-required', { name: node.name, attribute: name, label: labelOf(rules, element) });
  }
  return wrong ? null : values;
}

function typedValue(type, text) {
  if (type === 'string') return text;
  if (type === 'integer') return /^-?(?:0|[1-9][0-9]*)$/.test(text) ? Number(text) : undefined;
  return text === 'true' ? true : text === 'false' ? false : undefined;
}

// A directive's attributes as a file writes them: in the registry's order, each off
// its default, then the options of its presentation, in the order they are given.
function writtenAttributes(values, directive) {
  const out = {};
  for (const [name, setting] of Object.entries(directive.attributes)) {
    if (!Object.hasOwn(values, name)) continue;
    if (Object.hasOwn(setting, 'default') && setting.default === values[name]) continue;
    out[name] = String(values[name]);
  }
  for (const [name, value] of Object.entries(values)) {
    if (!Object.hasOwn(directive.attributes, name)) out[name] = String(value);
  }
  return out;
}

// The body's footnotes as blocks, numbered by the order of their marks through the
// post, each named by its place among the marks. A footnote marked twice, an empty
// one, and one with no mark are refused, never mended: the reader reads a mark
// without a text as the text it is.
function footnotesOf(scope, rules) {
  const inner = (label) => ({ ...scope, path: `footnote ${label}`, marks: null });
  const { marks, definitions } = scope;
  const taken2 = scope.elements === undefined || scope.elements.includes('footnotes');
  const numbers = new Map();
  for (const { mark, node, path, element } of marks) {
    const label = String(mark.n);
    if (numbers.has(label)) {
      scope.problems.push({ path, name: element, line: lineOf(node), reason: say(rules, 'footnote-twice', { label }) });
      continue;
    }
    numbers.set(label, numbers.size + 1);
    mark.n = numbers.get(label);
  }
  if (marks.length > 0 && !taken2) scope.problems.push({ path: marks[0].path, name: 'footnotes', line: lineOf(marks[0].node), reason: say(rules, 'element-not-taken', { element: labelOf(rules, 'footnotes') }) });
  const blocks = [];
  for (const definition of definitions) {
    const label = definition.identifier;
    const here = inner(label);
    const number = numbers.get(label);
    if (number === undefined) {
      refuse(here, definition, 'footnotes', 'footnote-unmarked', { label });
      continue;
    }
    const [first, ...rest] = definition.children;
    if (first?.type !== 'paragraph' || rest.length > 0) {
      refuse(here, definition, 'footnotes', first ? 'footnote-blocks' : 'footnote-empty', { label });
      continue;
    }
    const children = textOf(first.children, rules.elements.footnotes.inline, here, 'footnotes', first);
    if (children.length === 0) {
      refuse(here, definition, 'footnotes', 'footnote-empty', { label });
      continue;
    }
    blocks.push({ node: { type: 'definition', n: number, children }, path: here.path, name: 'footnotes', line: lineOf(definition) });
  }
  return blocks.sort((a, b) => a.node.n - b.node.n);
}

// Resolving: the source's model with its references followed and its image paths
// replaced, as the written body must read.

function resolved(nodes, scope) {
  const out = [];
  for (const node of nodes) {
    if (node.children) node.children = resolved(node.children, scope);
    if (node.type !== 'link' || !node.href.startsWith('konzilo:')) {
      out.push(node);
      continue;
    }
    const [id, ...fragment] = node.href.slice('konzilo:'.length).split('#');
    const where = node.at ?? {};
    const target = scope.link(id, fragment.join('#') || null);
    const entry = { path: where.path, name: where.element, line: where.line };
    if (target.reason) scope.problems.push({ ...entry, reason: target.reason });
    if (target.warning) scope.warnings.push({ ...entry, reason: target.warning.replaceAll('{text}', plainText(node.children)) });
    if (target.href) {
      node.href = target.href;
      out.push(node);
    } else out.push(...node.children);
  }
  return tidy(out);
}

const plainText = (nodes) => nodes.map((node) => node.value ?? plainText(node.children ?? [])).join('');

function resolveBlock(node, scope, path) {
  const inner = (index) => `${path}.${index + 1}`;
  switch (node.type) {
    case 'paragraph':
    case 'heading':
    case 'definition':
      node.children = resolved(node.children, scope);
      break;
    case 'list':
      node.items.forEach((item, index) => {
        item.children = resolved(item.children, scope);
        if (item.list) resolveBlock(item.list, scope, inner(index));
      });
      break;
    case 'quote':
      node.children.forEach((child, index) => resolveBlock(child, scope, inner(index)));
      if (node.citation) node.citation = resolved(node.citation, scope);
      break;
    case 'table':
      if (node.caption) node.caption = resolved(node.caption, scope);
      for (const row of [node.head, ...node.body, ...node.foot]) for (const cell of row) cell.children = resolved(cell.children, scope);
      break;
    case 'image': {
      if (node.caption) node.caption = resolved(node.caption, scope);
      const given = scope.image(node.src);
      const where = node.at ?? {};
      const entry = { path: where.path ?? path, name: where.element ?? 'image', line: where.line };
      if (given.reason) scope.problems.push({ ...entry, reason: given.reason });
      else {
        node.src = given.src;
        if (given.warning) scope.warnings.push({ ...entry, reason: given.warning });
      }
      break;
    }
    case 'gallery':
      for (const image of node.images) resolveBlock(image, scope, path);
      if (node.caption) node.caption = resolved(node.caption, scope);
      break;
    default:
  }
}

// Writing: the model in the exact form, at the level a block has come to. Every block
// is first written in its minimal form; each level adds to those below: 1 splits what
// GFM would make a link of with an empty comment, 2 escapes strictly, 3 writes bold,
// italic and strikethrough as raw HTML.

const COMMENT = '<!-- -->';

function escapedText(value, context) {
  const { level, cell } = context;
  let out = '';
  const chars = [...value];
  const atStart = context.lineStart;
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i];
    const before = i > 0 ? chars[i - 1] : context.before;
    const after = i + 1 < chars.length ? chars[i + 1] : context.after;
    const rest = () => chars.slice(i + 1).join('');
    if (c === '\\' || c === '*' || c === '`') out += `\\${c}`;
    else if (c === '_') out += ALNUM.test(before ?? '') && ALNUM.test(after ?? '') ? c : `\\${c}`;
    else if (c === '&') out += readsAsEntity(`${c}${rest()}`, context) ? `\\${c}` : c;
    else if (c === '<') out += readsAsTag(rest(), atStart && i === 0) ? `\\${c}` : c;
    else if (c === ':') out += beginsDirective(rest(), before, atStart && i === 0, level) || (context.afterMark && i === 0) ? `\\${c}` : c;
    else if (c === '|' && (cell || level >= 2)) out += `\\${c}`;
    else if (level >= 2 && (c === '[' || c === ']' || c === '!' || c === '~')) out += `\\${c}`;
    else if (atStart && i === 0 && startsLine(c, rest(), level)) out += `\\${c}`;
    else if (atStart && /^\d$/.test(c) && i < 9 && /^[.)]$/.test(after ?? '') && chars.slice(0, i + 1).every((one) => /^\d$/.test(one)) && /^(?:[ \t]|$)/.test(chars.slice(i + 2).join(''))) {
      out += `${c}\\${after}`;
      i += 1;
    } else out += c;
  }
  if (level >= 1 && (!context.inLink || context.loneSelf)) out = splitAutolinks(out);
  return out;
}

function splitAutolinks(text) {
  return text
    .replace(/(?<![\p{L}\p{N}])www\./giu, (found) => `${found.slice(0, 3)}${COMMENT}.`)
    .replace(/(?<![\p{L}\p{N}])(https?|ftp):\/\//giu, (_, scheme) => `${scheme}${COMMENT}://`)
    .replace(/([\p{L}\p{N}._+-]+)@(?=[\p{L}\p{N}-]+\.[\p{L}\p{N}.-]*[\p{L}\p{N}])/gu, `$1${COMMENT}@`);
}

// What Markdown reads as more at the start of a line.
function startsLine(c, rest, level) {
  if (c === '#') return /^#{0,5}(?:[ \t]|$)/.test(rest);
  if (c === '>') return true;
  if (c === '-' || c === '+') return /^(?:[ \t]|$)/.test(rest) || (level >= 2 && c === '-');
  return level >= 2 && c === '=';
}

// Whether a colon begins a directive: before a name no colon follows, unless a colon
// comes right before it, and at a line's start before more colons. Strictly, every
// colon before a letter or a digit.
function beginsDirective(rest, before, lineStart, level) {
  if (lineStart && rest.startsWith(':')) return true;
  const name = NAME_START.exec(rest)?.[0];
  if (!name) return false;
  if (level >= 2) return true;
  if (before === ':') return false;
  return rest[name.length] !== ':';
}

function readsAsEntity(text, context) {
  const match = /^&(#\d{1,7};|#[xX][0-9a-fA-F]{1,6};|[a-zA-Z][a-zA-Z0-9]*;)/.exec(text);
  if (!match) return false;
  if (match[1].startsWith('#')) return true;
  return readsAsReference(`&${match[1]}`, context.scope) !== null;
}

// Whether a `<` opens what the reader reads as a tag, a comment, or a bare address; at
// a line's start, what could open an HTML block at all.
function readsAsTag(rest, lineStart) {
  if (lineStart && /^[a-zA-Z/!?]/.test(rest)) return true;
  return /^(?:[a-zA-Z][a-zA-Z0-9-]*(?:\s+[a-zA-Z_:][-\w:.]*(?:\s*=\s*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*\s*\/?>|\/[a-zA-Z][a-zA-Z0-9-]*\s*>|!--.*?-->|\?.*?\?>|![a-zA-Z][^>]*>|!\[CDATA\[.*?\]\]>|[a-zA-Z][a-zA-Z0-9+.-]{1,31}:[^\s<>]*>|[^\s<>@]+@[^\s<>]+>)/s.test(rest);
}

const firstChar = (node) => {
  if (node === undefined) return undefined;
  return node.type === 'text' ? [...node.value][0] : '*';
};

// Inline nodes in the exact form. `context` holds the block's level, whether a line
// starts here, and what stands around.
function inlineText(nodes, context) {
  let out = '';
  nodes.forEach((node, index) => {
    const before = out === '' ? context.before : [...out].at(-1);
    const after = firstChar(nodes[index + 1]) ?? context.after;
    const lineStart = context.state.lineStart;
    const afterMark = nodes[index - 1]?.type === 'footnote' && context.state.markAtStart;
    context.state.markAtStart = false;
    if (node.type !== 'text' && node.type !== 'break') context.state.lineStart = false;
    switch (node.type) {
      case 'text':
        out += escapedText(node.value, { ...context, before, after, lineStart, afterMark });
        context.state.lineStart = false;
        break;
      case 'break':
        out += '\\\n';
        context.state.lineStart = true;
        break;
      case 'code':
        out += inlineCode(node.value, context);
        break;
      case 'footnote':
        out += `[^${node.n}]`;
        context.state.markAtStart = lineStart;
        break;
      case 'strong':
        out += wrapped(node.children, context, context.level >= 3 ? ['<strong>', '</strong>'] : ['**', '**'], before, after);
        break;
      case 'em': {
        const mark = ALNUM.test(before ?? '') || ALNUM.test(after ?? '') ? '*' : '_';
        out += wrapped(node.children, context, context.level >= 3 ? ['<em>', '</em>'] : [mark, mark], before, after);
        break;
      }
      case 's':
        out += wrapped(node.children, context, context.level >= 3 ? ['<del>', '</del>'] : ['~~', '~~'], before, after);
        break;
      case 'sup':
        out += wrapped(node.children, context, ['<sup>', '</sup>'], before, after);
        break;
      case 'sub':
        out += wrapped(node.children, context, ['<sub>', '</sub>'], before, after);
        break;
      case 'link':
        out += linkText(node, context);
        break;
      default:
        throw new Error(`the body check cannot write an inline ${node.type}`);
    }
  });
  return out;
}

const wrapped = (children, context, [open, close], before, after) => `${open}${inlineText(children, { ...context, before: [...open].at(-1) ?? before, after: close[0] ?? after })}${close}`;

function linkText(node, context) {
  if (node.target !== null || node.rel !== null) {
    const attributes = [`href="${attributeValue(node.href, context)}"`];
    if (node.target !== null) attributes.push(`target="${attributeValue(node.target, context)}"`);
    if (node.rel !== null) attributes.push(`rel="${attributeValue(node.rel, context)}"`);
    return `<a ${attributes.join(' ')}>${inlineText(node.children, { ...context, inLink: false, before: '>', after: '<' })}</a>`;
  }
  const inner = inlineText(node.children, { ...context, inLink: true, before: '[', after: ']' });
  return `[${inner}](${linkAddress(node.href, context)})`;
}

const attributeValue = (value, context) => {
  const text = value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  return context.cell ? text.replaceAll('|', '&#124;') : text;
};

function linkAddress(url, context) {
  let text = url.replaceAll('\\', '\\\\');
  if (context.cell) text = text.replaceAll('|', '\\|');
  if (/[ ()]/.test(url)) return `<${text.replaceAll('<', '\\<').replaceAll('>', '\\>')}>`;
  return text;
}

// A code span between the shortest run of backticks the code does not hold, with a
// space inside each delimiter where the code starts or ends with a backtick, or both
// starts and ends with a space.
function inlineCode(value, context) {
  const runs = new Set((value.match(/`+/g) ?? []).map((run) => run.length));
  let length = 1;
  while (runs.has(length)) length += 1;
  const fence = '`'.repeat(length);
  const pad = value.startsWith('`') || value.endsWith('`') || (value.startsWith(' ') && value.endsWith(' ') && value.trim() !== '');
  const text = context.cell ? value.replaceAll('|', '\\|') : value;
  return pad ? `${fence} ${text} ${fence}` : `${fence}${text}${fence}`;
}

const inlineContext = (level, scope, { lineStart = true, cell = false } = {}) => ({ level, scope, cell, before: undefined, after: undefined, state: { lineStart, markAtStart: false } });

const indented = (text, by) => text.split('\n').map((line, index) => (index === 0 || line === '' ? line : `${by}${line}`)).join('\n');

function headingText(node, level, scope) {
  let text = inlineText(node.children, inlineContext(level, scope, { lineStart: false }));
  if (level >= 2) text = text.replace(/(^|[ \t])(#+)$/, (_, space, hashes) => `${space}${hashes.replaceAll('#', '\\#')}`);
  const anchor = node.anchor === null ? '' : `<a id="${node.anchor}"></a>`;
  return `${'#'.repeat(node.level)} ${anchor}${text}`;
}

// A list's marker, the other one for a list right after a list of its kind, so that
// the two stay apart.
function listText(node, level, scope, second = false) {
  const items = node.items.map((item, index) => {
    const marker = node.ordered ? `${index + 1}${second ? ')' : '.'} ` : `${second ? '*' : '-'} `;
    const pad = ' '.repeat(marker.length);
    const text = inlineText(item.children, inlineContext(level, scope));
    const nested = item.list ? `\n${pad}${indented(listText(item.list, level, scope), pad)}` : '';
    return `${marker}${indented(text, pad)}${nested}`;
  });
  return items.join('\n');
}

// A sequence of sibling blocks, each with the marker the list before it leaves it.
function siblingsText(nodes, level, scope) {
  let previous = null;
  return nodes.map((node) => {
    const second = node.type === 'list' && previous?.type === 'list' && previous.ordered === node.ordered && !previous.second;
    previous = { type: node.type, ordered: node.ordered, second };
    return blockText(node, level, scope, second);
  });
}

function quoteText(node, level, scope) {
  const parts = siblingsText(node.children, level, scope);
  if (node.citation) parts.push(`<cite>${inlineText(node.citation, { ...inlineContext(level, scope, { lineStart: false }), before: '>', after: '<' })}</cite>`);
  return parts.join('\n\n').split('\n').map((line) => (line === '' ? '>' : `> ${line}`)).join('\n');
}

function codeText(value) {
  const longest = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}\n${value}\n${fence}`;
}

const DELIMITERS = { left: ':---', center: ':---:', right: '---:' };

function tableText(node, level, scope) {
  const structured = node.caption !== null || node.foot.length > 0 || [node.head, ...node.body].some((row) => row.some((cell) => cell.colspan > 1 || cell.rowspan > 1));
  return structured ? structuredText(node) : pipeText(node, level, scope);
}

function pipeText(node, level, scope) {
  const row = (cells) => `| ${cells.map((cell) => inlineText(cell.children, inlineContext(level, scope, { lineStart: false, cell: true }))).join(' | ')} |`;
  const lines = [row(node.head), `| ${node.align.map((one) => DELIMITERS[one] ?? '---').join(' | ')} |`, ...node.body.map(row)];
  return lines.join('\n');
}

const htmlEscaped = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;');

function htmlInline(nodes) {
  return nodes.map((node) => {
    switch (node.type) {
      case 'text': return htmlEscaped(node.value);
      case 'code': return `<code>${htmlEscaped(node.value)}</code>`;
      case 'strong': return `<strong>${htmlInline(node.children)}</strong>`;
      case 'em': return `<em>${htmlInline(node.children)}</em>`;
      case 's': return `<del>${htmlInline(node.children)}</del>`;
      case 'sup': return `<sup>${htmlInline(node.children)}</sup>`;
      case 'sub': return `<sub>${htmlInline(node.children)}</sub>`;
      case 'link': {
        const attributes = [`href="${attributeValue(node.href, {})}"`];
        if (node.target !== null) attributes.push(`target="${attributeValue(node.target, {})}"`);
        if (node.rel !== null) attributes.push(`rel="${attributeValue(node.rel, {})}"`);
        return `<a ${attributes.join(' ')}>${htmlInline(node.children)}</a>`;
      }
      default: throw new Error(`the body check cannot write an inline ${node.type} in a table`);
    }
  }).join('');
}

function structuredText(node) {
  const section = (name, rows, tag) => (rows.length === 0 ? [] : [`<${name}>`, ...spannedRows(rows, node.align, tag), `</${name}>`]);
  return [
    '<table>',
    ...(node.caption ? [`<caption>${htmlInline(node.caption)}</caption>`] : []),
    ...section('thead', [node.head], 'th'),
    ...section('tbody', node.body, 'td'),
    ...section('tfoot', node.foot, 'td'),
    '</table>',
  ].join('\n');
}

// A section's rows. A column taken by a cell from the row above starts no cell of
// this one, so each cell's alignment is its starting column's.
function spannedRows(rows, align, tag) {
  const below = align.map(() => 0);
  return rows.map((cells) => {
    let column = 0;
    const written = cells.map((cell) => {
      while (below[column] > 0) column += 1;
      const [colspan, rowspan] = [cell.colspan ?? 1, cell.rowspan ?? 1];
      const attributes = [];
      if (colspan > 1) attributes.push(`colspan="${colspan}"`);
      if (rowspan > 1) attributes.push(`rowspan="${rowspan}"`);
      if (align[column]) attributes.push(`style="text-align: ${align[column]}"`);
      for (let c = column; c < column + colspan; c += 1) below[c] = rowspan;
      column += colspan;
      return `<${tag}${attributes.length > 0 ? ` ${attributes.join(' ')}` : ''}>${htmlInline(cell.children)}</${tag}>`;
    });
    for (let c = 0; c < below.length; c += 1) below[c] = Math.max(0, below[c] - 1);
    return `<tr>${written.join('')}</tr>`;
  });
}

// An image's alt text: `\`, `*`, `` ` ``, `[` and `]` always escaped, since it reads as
// inline text; the rest as in a paragraph.
function altText(alt, level, scope) {
  const chars = [...alt];
  let out = '';
  for (let i = 0; i < chars.length; i += 1) {
    const c = chars[i];
    const rest = () => chars.slice(i + 1).join('');
    if ('\\*`[]'.includes(c)) out += `\\${c}`;
    else if (c === '_') out += ALNUM.test(chars[i - 1] ?? '') && ALNUM.test(chars[i + 1] ?? '') ? c : `\\${c}`;
    else if (c === '&') out += readsAsEntity(`${c}${rest()}`, { scope }) ? `\\${c}` : c;
    else if (c === '<') out += readsAsTag(rest(), false) ? `\\${c}` : c;
    else if (c === ':') out += beginsDirective(rest(), chars[i - 1], false, level) ? `\\${c}` : c;
    else if (level >= 2 && (c === '!' || c === '~')) out += `\\${c}`;
    else out += c;
  }
  return level >= 1 ? splitAutolinks(out) : out;
}

function imageText(node, level, scope) {
  const image = `![${altText(node.alt, level, scope)}](${linkAddress(node.src, {})})`;
  return node.caption ? `${image}\\\n${inlineText(node.caption, inlineContext(level, scope))}` : image;
}

function directiveText(node) {
  const written = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('}', '&#125;').replaceAll('\n', '&#10;').replaceAll('\r', '&#13;');
  const attributes = Object.entries(node.attributes).map(([name, value]) => `${name}="${written(value)}"`);
  return `::${node.name}${attributes.length > 0 ? `{${attributes.join(' ')}}` : ''}`;
}

// A link alone in a paragraph whose text is its own address, which the site would
// show as an embed: the first fallback splits its text too.
function isSelfLink([link, ...rest]) {
  if (rest.length > 0 || link?.type !== 'link' || link.target !== null || link.rel !== null) return false;
  return link.children.length === 1 && link.children[0].type === 'text' && link.children[0].value === link.href;
}

function blockText(node, level, scope, second = false) {
  switch (node.type) {
    case 'paragraph': return inlineText(node.children, { ...inlineContext(level, scope), loneSelf: isSelfLink(node.children) });
    case 'heading': return headingText(node, level, scope);
    case 'list': return listText(node, level, scope, second);
    case 'quote': return quoteText(node, level, scope);
    case 'code': return codeText(node.value);
    case 'table': return tableText(node, level, scope);
    // A bare address GFM would end early reads back whole in angle brackets.
    case 'embed': return level >= 1 ? `<${node.address}>` : node.address;
    case 'image': return imageText(node, level, scope);
    case 'gallery': {
      const lines = node.images.map((image) => imageText(image, level, scope));
      if (node.caption) lines.push(inlineText(node.caption, inlineContext(level, scope)));
      return lines.join('\n');
    }
    case 'directive': return directiveText(node);
    case 'definition': return `[^${node.n}]: ${indented(inlineText(node.children, inlineContext(level, scope)), '    ')}`;
    default: throw new Error(`the body check cannot write a block ${node.type}`);
  }
}

// The written body, with each block's first line.
function bodyText(blocks, levels, scope) {
  let previous = null;
  const parts = blocks.map(({ node }, index) => {
    const second = node.type === 'list' && previous?.type === 'list' && previous.ordered === node.ordered && !previous.second;
    previous = { type: node.type, ordered: node.ordered, second };
    return blockText(node, levels[index], scope, second);
  });
  const lines = [];
  let line = 1;
  for (const part of parts) {
    lines.push(line);
    line += part.split('\n').length + 1;
  }
  return { lines, text: parts.join('\n\n') };
}

// A top-level node of the written body as the model's block, for comparing.
function readWritten(nodes, text, scope) {
  const inner = { ...scope, source: text, written: true, problems: [], warnings: [], marks: null, anchors: new Map(), top: true, elements: undefined, path: '0' };
  const read = [];
  for (const node of nodes) {
    if (node.type === 'footnoteDefinition') {
      const [first, ...rest] = node.children;
      if (first?.type !== 'paragraph' || rest.length > 0) read.push({ type: 'unreadable' });
      else read.push({ type: 'definition', n: Number(node.identifier), children: textOf(first.children, inner.rules.elements.footnotes.inline, inner, 'footnotes', first) });
    } else read.push(...blockOf(node, inner));
  }
  return inner.problems.length > 0 ? [{ type: 'unreadable' }] : read;
}

const MOST = 3;

// The model written, each block at the first level the reader reads back as the
// source. A block still read wrong at the last level is refused. One block's level is
// raised at a time, the first read wrong, as what one block is taken for can change
// how a later one reads.
export function writeBody(model, hands) {
  const scope = { ...hands, problems: [], warnings: [] };
  const { blocks } = model;
  for (const block of blocks) resolveBlock(block.node, scope, block.path);
  if (scope.problems.length > 0) return { body: null, problems: sorted(scope.problems), warnings: sorted(scope.warnings), embeds: [] };
  const expected = blocks.map(({ node }) => JSON.stringify([node]));
  const levels = blocks.map(() => 0);
  const failed = new Set();
  for (;;) {
    const { lines, text } = bodyText(blocks, levels, scope);
    const tree = hands.reader.tree(text);
    const groups = blocks.map(() => []);
    for (const node of tree.children ?? []) {
      const start = node.position.start.line;
      let index = lines.findIndex((line, i) => start >= line && (i + 1 === lines.length || start < lines[i + 1]));
      if (index === -1) index = 0;
      groups[index]?.push(node);
    }
    const wrong = blocks.findIndex((_, index) => !failed.has(index) && JSON.stringify(readWritten(groups[index], text, scope)) !== expected[index]);
    if (wrong === -1) {
      const body = failed.size > 0 ? null : text;
      return { body, problems: sorted(scope.problems), warnings: sorted(scope.warnings), embeds: embedsOf(blocks, hands) };
    }
    if (levels[wrong] === MOST) {
      failed.add(wrong);
      const { path, name, line } = blocks[wrong];
      scope.problems.push({ path, name, line, reason: say(hands.rules, 'read-back', { element: labelOf(hands.rules, name) }) });
      continue;
    }
    // A level that writes the same bytes as the one below reads no better.
    const was = blockText(blocks[wrong].node, levels[wrong], scope);
    do levels[wrong] += 1;
    while (levels[wrong] < MOST && blockText(blocks[wrong].node, levels[wrong], scope) === was);
  }
}

function embedsOf(blocks, hands) {
  const found = new Set();
  for (const { node } of blocks) if (node.type === 'embed') found.add(hands.embedOf(node.address, hands.rules).service);
  return [...found];
}

// The check whole: { body, problems, warnings, embeds }, `body` null where a problem
// refuses it.
export function checkBody(source, hands) {
  const model = readBody(source, hands);
  if (model.problems.length > 0) return { body: null, problems: model.problems, warnings: model.warnings, embeds: [] };
  const written = writeBody(model, hands);
  return { ...written, warnings: [...model.warnings, ...written.warnings] };
}
