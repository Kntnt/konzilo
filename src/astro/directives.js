// Directives: a component written in a content file as a
// directive the rule data registers, read by the site's reader and rendered
// with the site's own component, or with the core's plain rendering.
//
// Konzilo writes two of Sätteri's three forms:
//
//   ::name[text]{attribute="value" …}     a leaf, on a line of its own
//   :::name{attribute="value" …}          a container, around its body's
//                                         blocks, closed by as many colons
//
// The registry is the rule data's: each element whose rule has a `directive`,
// { name, form, attributes, body }, is written as that directive. This file
// reads the registry for the site's reader and the site's Body component.

import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { htmlToHast } from 'satteri';
import rules from '../format/rules.json' with { type: 'json' };

// The forms Konzilo writes, the bodies each form may have, and the types of
// an attribute. Konzilo writes no inline directive (`:name`): no element
// needs a component inside text yet.
const FORMS = Object.freeze(['leaf', 'container']);
const BODIES = Object.freeze({ leaf: ['none', 'text'], container: ['blocks'] });
const TYPES = Object.freeze(['string', 'integer', 'boolean']);

// What the site description declares that an attribute may name, by the
// key it declares it under (`declared`): a form's name.
const DECLARED = Object.freeze(['forms']);

const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ATTRIBUTE = /^[a-z][a-zA-Z0-9]*$/;
// What an attribute may not be called: the names Sätteri gives `#x` and
// `.x`, and the setting that holds a text body.
const RESERVED = new Set(['id', 'class', 'content']);

// The directives of rule data, by name: { name, element, form, attributes,
// body, optionsOf, inline, inner }, each attribute { type, required,
// default, values, pattern, refusal, declared }: `declared`, the key of
// the site description whose names the attribute takes one of, such as
// `forms`, with the `refusal` for any other (format/post-list.js,
// declaredProblem()). `optionsOf` names the attribute
// that names one of the site's presentations, whose options the directive
// takes as attributes beside its own (the post list), or is null.
// Throws, naming every problem, for a registry the reader cannot follow.
export function directiveRegistry({ elements }) {
  const registry = new Map();
  const problems = [];
  for (const [element, rule] of Object.entries(elements)) {
    if (!Object.hasOwn(rule, 'directive')) continue;
    const { name, form, attributes = {}, body, optionsOf = null } = rule.directive;
    const at = `${element}: directive`;
    if (typeof name !== 'string' || !NAME.test(name)) problems.push(`${at}: a name of lowercase letters, digits and hyphens, starting with a letter`);
    else if (registry.has(name)) problems.push(`${at}: the name ${JSON.stringify(name)} is ${registry.get(name).element}'s too`);
    if (!FORMS.includes(form)) problems.push(`${at}: a form of ${FORMS.join(' or ')}`);
    else if (!BODIES[form].includes(body)) problems.push(`${at}: a ${form}'s body is ${BODIES[form].join(' or ')}`);
    if (rule.attributes) problems.push(`${element}: a directive's settings are its attributes`);
    if (body === 'blocks' && !Array.isArray(rule.inner)) problems.push(`${element}: a body of blocks names them in inner`);
    if (body === 'text' && (rule.inline ?? []).some((tag) => tag === 'br' || tag === 'footnote')) problems.push(`${element}: a label holds no line break and no footnote`);
    for (const [attribute, setting] of Object.entries(attributes)) {
      const where = `${at}: attribute ${JSON.stringify(attribute)}`;
      if (!ATTRIBUTE.test(attribute) || RESERVED.has(attribute)) problems.push(`${where}: a name in camelCase, not id, class or content`);
      if (!TYPES.includes(setting.type)) problems.push(`${where}: a type of ${TYPES.join(', ')}`);
      if (setting.required && Object.hasOwn(setting, 'default')) problems.push(`${where}: required, or with a default`);
      if (Object.hasOwn(setting, 'default') && typeProblem(setting, setting.default)) problems.push(`${where}: a default of its type`);
      if (Object.hasOwn(setting, 'declared')) {
        if (!DECLARED.includes(setting.declared)) problems.push(`${where}: declared names ${DECLARED.join(', ')}, what the site description declares that an attribute may name`);
        else if (setting.type !== 'string') problems.push(`${where}: declared names a text`);
        else if (typeof setting.refusal !== 'string') problems.push(`${where}: declared needs the refusal for a name the site does not declare`);
      }
    }
    if (optionsOf !== null && attributes[optionsOf]?.type !== 'string') problems.push(`${at}: optionsOf names an attribute of the type string`);
    registry.set(name, { name, element, form, attributes, body, optionsOf, inline: rule.inline ?? [], inner: rule.inner ?? [] });
  }
  if (problems.length > 0) throw new Error(`the rule data's directives: ${problems.join('; ')}`);
  return registry;
}

// The core's registry, from its rule data.
export const registry = directiveRegistry(rules);

function typeProblem({ type }, value) {
  const fits = type === 'string' ? typeof value === 'string' : type === 'integer' ? Number.isInteger(value) : typeof value === 'boolean';
  return !fits;
}

// An attribute's value as the file holds it, from its text: a whole number
// in decimal, `true` or `false`; undefined for text of another type.
function typed(type, text) {
  if (type === 'string') return text;
  if (type === 'integer') return /^-?(?:0|[1-9][0-9]*)$/.test(text) ? Number(text) : undefined;
  return text === 'true' ? true : text === 'false' ? false : undefined;
}

// An attribute's value as a directive writes it, between double quotes: `&`,
// `"`, `}` and line breaks as HTML's character references, since Sätteri
// 0.10.5 reads every character of a value as it is and ends the value at a
// `}`. The reader decodes them (decoded()).
export function written(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('}', '&#125;')
    .replaceAll('\n', '&#10;')
    .replaceAll('\r', '&#13;');
}

// An attribute's value as the reader gives it, with HTML's character
// references decoded, as in an HTML attribute.
export function decoded(text) {
  if (!text.includes('&')) return text;
  const [element] = htmlToHast(`<i title="${text.replaceAll('"', '&quot;')}"></i>`, { fragment: true }).children;
  return element.properties.title;
}

const settingOf = (attribute, value) => `the setting ${JSON.stringify(attribute)}${value === undefined ? '' : ` with the value ${JSON.stringify(value)}`}`;

// Why the site cannot publish an attribute with this value, or null.
export function valueProblem(attribute, setting, value) {
  const allowed = !setting.values || setting.values.includes(value);
  if (allowed && (!setting.pattern || new RegExp(setting.pattern).test(String(value)))) return null;
  return setting.refusal ? setting.refusal.replaceAll('{value}', String(value)) : `the site cannot publish ${settingOf(attribute, value)}`;
}

const marks = { leafDirective: '::', containerDirective: ':::', textDirective: ':' };

// A directive of a content file, as the reader's Markdown tree has it,
// against the registry: { entry, values, problems }, the registry's entry
// (null for a name it has not got in this form), the attributes given,
// decoded and typed, and the reasons the site cannot publish it. `checks`:
// the site's own checks of a directive's values, by its name, each giving
// the reasons the site cannot publish them; they run once the registry's
// checks find none (the post list's against the site description).
export function readDirective(node, known = registry, checks = {}) {
  const entry = known.get(node.name);
  const mark = marks[node.type];
  const form = { leafDirective: 'leaf', containerDirective: 'container' }[node.type];
  if (!entry) return { entry: null, values: {}, problems: [`the site has no directive ${mark}${node.name}`] };
  if (entry.form !== form) {
    const how = entry.form === 'leaf' ? `::${entry.name}, on a line of its own` : `:::${entry.name}, around its body`;
    return { entry: null, values: {}, problems: [`the site writes the directive ${entry.name} as ${how}`] };
  }
  const problems = [];
  const values = {};
  for (const [attribute, text] of Object.entries(node.attributes ?? {})) {
    const setting = entry.attributes[attribute];
    if (!setting && entry.optionsOf !== null && ATTRIBUTE.test(attribute) && !RESERVED.has(attribute)) {
      // An option of a presentation, which the site description declares:
      // its text, which the site's own check reads (`checks`).
      values[attribute] = decoded(text ?? '');
      continue;
    }
    if (!setting) {
      problems.push(`the site cannot publish ${settingOf(attribute)} on the directive ${entry.name}`);
      continue;
    }
    const value = typed(setting.type, decoded(text ?? ''));
    const reason = value === undefined ? `the site cannot publish ${settingOf(attribute, decoded(text ?? ''))}` : valueProblem(attribute, setting, value);
    if (reason) problems.push(reason);
    else values[attribute] = value;
  }
  for (const [attribute, setting] of Object.entries(entry.attributes)) {
    if (setting.required && !Object.hasOwn(node.attributes ?? {}, attribute)) problems.push(`the site cannot publish the directive ${entry.name} without ${settingOf(attribute)}`);
  }
  const label = node.type === 'containerDirective' ? node.children[0]?.data?.directiveLabel === true : node.children.length > 0;
  if (label && entry.body !== 'text') problems.push(`the site cannot publish the directive ${entry.name} with a label`);
  if (problems.length === 0 && Object.hasOwn(checks, entry.name)) problems.push(...checks[entry.name](values));
  return { entry, values, problems };
}

// Every attribute of a directive that has a value, given or by default, in
// the registry's order, and then the options of its presentation as given.
export function withDefaults(entry, values) {
  const all = {};
  for (const [attribute, setting] of Object.entries(entry.attributes)) {
    if (Object.hasOwn(values, attribute)) all[attribute] = values[attribute];
    else if (Object.hasOwn(setting, 'default')) all[attribute] = setting.default;
  }
  for (const [attribute, value] of Object.entries(values)) {
    if (!Object.hasOwn(entry.attributes, attribute)) all[attribute] = value;
  }
  return all;
}

// The hast property of an attribute on the plain rendering: `data-` and the
// name, `maxCount` as `data-max-count`.
const property = (attribute) => `data${attribute[0].toUpperCase()}${attribute.slice(1)}`;

// The properties of a directive's plain rendering: its name as
// `data-directive`, and each attribute with a value as `data-<attribute>`.
export function plainProperties(entry, values) {
  const properties = { dataDirective: entry.name };
  for (const [attribute, value] of Object.entries(withDefaults(entry, values))) properties[property(attribute)] = String(value);
  return properties;
}

// The core's plain rendering of a directive, as a hast element: a <div>
// carrying its name and attributes, holding its body, where the site's Body
// component finds them.
export function plainElement(name, values, children) {
  const entry = registry.get(name);
  return { type: 'element', tagName: 'div', properties: plainProperties(entry, values), children };
}

// The line of the file a node of the body starts on. Astro gives the reader
// the body alone, trimmed; the file tells how many lines come before it.
function fileLine(node, ctx) {
  const line = node.position?.start.line ?? 0;
  if (!ctx.fileURL) return line;
  try {
    const text = readFileSync(ctx.fileURL, 'utf8').trimEnd();
    const before = text.endsWith(ctx.source) ? text.slice(0, text.length - ctx.source.length) : '';
    return line + before.split('\n').length - 1;
  } catch {
    return line;
  }
}

// The text a node was written as.
const sourceOf = (node, ctx) => ctx.source.slice(node.position.start.offset, node.position.end.offset);

// Sätteri's Markdown tree plugin that reads directives as the site does:
//
// - a directive the registry has is checked against it and rendered as its
//   plain rendering;
// - one it has not got reads as the text it was written as: `:30` in
//   `10:30` stays `:30`, and a container keeps its body between its fences.
//
// A registered directive against its rule, and a container or a directive
// with a label or attributes the registry has not got, which no text
// becomes by chance, is a problem, handed to `problem({ file, line, reason
// })`: the integration throws, which fails the build, naming the file, the
// line and the reason; readContentFile keeps it. `checks`, by a
// directive's name, as readDirective() takes them.
//
// `leaveOut`, by a directive's name, gives the reasons a directive the
// registry takes is left out of the page, with a warning handed to
// `warn({ file, line, reason })`, rather than failing the build: a form the
// site description no longer declares, which the post that places it still
// names.
export function directiveReader(problem, { checks, leaveOut = {}, warn = () => {} } = {}) {
  const where = (node, ctx) => ({ file: ctx.fileURL ? relative(process.cwd(), fileURLToPath(ctx.fileURL)) : null, line: fileLine(node, ctx) });
  const report = (node, ctx, reason) => problem({ ...where(node, ctx), reason });
  const literal = (node, ctx) => {
    const text = sourceOf(node, ctx);
    if (node.type === 'textDirective') return ctx.replaceNode(node, { type: 'text', value: text });
    if (node.type === 'leafDirective') return ctx.replaceNode(node, { type: 'paragraph', children: [{ type: 'text', value: text }] });
    // A container: its opening line, its body, and its closing fence, if
    // any, each as a paragraph of its text.
    const lines = text.split('\n');
    const fence = /^ {0,3}:{3,}\s*$/.test(lines.at(-1)) && lines.length > 1 ? [{ type: 'paragraph', children: [{ type: 'text', value: lines.at(-1).trim() }] }] : [];
    return ctx.replaceNode(node, [{ type: 'paragraph', children: [{ type: 'text', value: lines[0] }] }, ...node.children, ...fence]);
  };
  const visit = (node, ctx) => {
    // No inline directive is registered: each reads as its text.
    const { entry, values, problems } = node.type === 'textDirective' ? { entry: null, problems: [`the site has no directive :${node.name}`] } : readDirective(node, registry, checks);
    const bare = node.type !== 'containerDirective' && sourceOf(node, ctx).trim() === `${marks[node.type]}${node.name}`;
    if (!entry && bare) return literal(node, ctx);
    for (const reason of problems) report(node, ctx, reason);
    if (!entry) return literal(node, ctx);
    const left = problems.length === 0 && Object.hasOwn(leaveOut, entry.name) ? leaveOut[entry.name](values) : [];
    if (left.length > 0) {
      for (const reason of left) warn({ ...where(node, ctx), reason });
      return ctx.removeNode(node);
    }
    ctx.setProperty(node, 'data', { hName: 'div', hProperties: plainProperties(entry, values) });
  };
  return { name: 'konzilo-directives', options: { position: true }, textDirective: visit, leafDirective: visit, containerDirective: visit };
}

// The site's Body component (Body.astro): a body's HTML, as Astro renders a
// post's Content, split at each directive's plain rendering whose name is in
// `names`, the directives the site gives a component of its own. Returns
// the parts in order: HTML as a text, and each such directive as { name,
// attributes, body }, its attributes typed, with their defaults, and its
// body's HTML, null for a directive without a body. HTML without such a
// directive is one part, as it is.
//
// The HTML is Astro's own rendering of Sätteri's, so a scan of its tags is
// enough: comments and the text of raw text elements are skipped, a void
// element has no end, and an element ends where the end tag of its name
// that matches it is.
export function bodyParts(html, names) {
  if (names.length === 0 || !html.includes('data-directive=')) return [html];
  const parts = [];
  let from = 0;
  let at = 0;
  for (;;) {
    const tag = nextTag(html, at);
    if (!tag) break;
    at = tag.end;
    const name = tag.closing ? undefined : tag.attributes['data-directive'];
    if (name === undefined || !names.includes(name) || !registry.has(name) || tag.void) continue;
    const close = endOf(html, tag);
    const entry = registry.get(name);
    if (tag.start > from) parts.push(html.slice(from, tag.start));
    parts.push({ name, attributes: attributesOf(entry, tag.attributes), body: entry.body === 'none' ? null : html.slice(tag.end, close.start) });
    from = at = close.end;
  }
  if (from < html.length) parts.push(html.slice(from));
  return parts;
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);

// The next tag from `at`: { start, end, name, closing, void, attributes },
// its attributes by name with their values decoded; null after the last.
function nextTag(html, at) {
  for (let i = html.indexOf('<', at); i !== -1; i = html.indexOf('<', i + 1)) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      if (end === -1) return null;
      i = end + 2;
      continue;
    }
    const head = /^<(\/?)([a-zA-Z][^\s/>]*)/.exec(html.slice(i, i + 64));
    if (!head) continue;
    const [, closing, tagName] = head;
    const name = tagName.toLowerCase();
    const attributes = {};
    let j = i + head[0].length;
    for (;;) {
      while (/\s/.test(html[j] ?? '')) j += 1;
      if (j >= html.length) return null;
      if (html[j] === '>') break;
      if (html.startsWith('/>', j)) {
        j += 1;
        break;
      }
      const attribute = /^[^\s"'>/=]+/.exec(html.slice(j))?.[0] ?? html[j];
      j += attribute.length;
      while (/\s/.test(html[j] ?? '')) j += 1;
      let value = '';
      if (html[j] === '=') {
        j += 1;
        while (/\s/.test(html[j] ?? '')) j += 1;
        const quote = html[j] === '"' || html[j] === "'" ? html[j] : null;
        const stop = quote ? html.indexOf(quote, j + 1) : j + (/^[^\s>]*/.exec(html.slice(j))[0].length);
        value = html.slice(quote ? j + 1 : j, stop === -1 ? html.length : stop);
        j = quote ? stop + 1 : stop;
      }
      attributes[attribute.toLowerCase()] = decoded(value);
    }
    const tag = { start: i, end: j + 1, name, closing: closing === '/', void: VOID.has(name) || html[j - 1] === '/', attributes };
    if (!tag.closing && RAW.has(name)) {
      const end = html.toLowerCase().indexOf(`</${name}`, tag.end);
      return { ...tag, end: end === -1 ? html.length : end };
    }
    return tag;
  }
  return null;
}

// Where the element a start tag opens ends: { start, end } of its end tag.
function endOf(html, open) {
  let depth = 1;
  let at = open.end;
  for (;;) {
    const tag = nextTag(html, at);
    if (!tag) return { start: html.length, end: html.length };
    at = tag.end;
    if (tag.name !== open.name || tag.void) continue;
    depth += tag.closing ? -1 : 1;
    if (depth === 0) return { start: tag.start, end: tag.end };
  }
}

// A directive's attributes from its plain rendering's `data-*`, typed, each
// attribute with a value, given or by default; for one that takes the
// options of a presentation, each other `data-*` too, as its text.
function attributesOf(entry, attributes) {
  const values = {};
  const own = new Set(['data-directive']);
  for (const [attribute, setting] of Object.entries(entry.attributes)) {
    const name = `data-${attribute.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
    own.add(name);
    const text = attributes[name];
    const value = text === undefined ? undefined : typed(setting.type, text);
    if (value !== undefined) values[attribute] = value;
  }
  if (entry.optionsOf !== null) {
    for (const [name, text] of Object.entries(attributes)) {
      if (own.has(name) || !/^data-[a-z][a-z0-9-]*$/.test(name)) continue;
      values[name.slice('data-'.length).replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())] = text;
    }
  }
  return withDefaults(entry, values);
}
