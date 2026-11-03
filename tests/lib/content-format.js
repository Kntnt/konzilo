// Konzilo's content format document, `content-format.md`, as the suite reads it:
// its sections, the names its code spans give, and the examples it marks.
//
// The document names each thing the core knows in a code span of the section
// that describes it, and marks an example by the info string of its fenced code
// block:
//
//   ```json site-description         the site description the examples are of
//   ```json site-description=<name>  another, which an example names by site=<name>
//   ```markdown file=<path>          a content file, at its path in the content folder
//   ```markdown body                 the body of a page, pages/example.md
//   ```json file=<path>              a JSON file, at its path in the content folder
//
// A Markdown example marked `read` has, in the block after it, ```html rendered,
// what the site's reader renders of its body. The tour, `tour`, holds every body
// element in one file.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const documentFile = fileURLToPath(new URL('../../content-format.md', import.meta.url));

export function contentFormat() {
  return readDocument(readFileSync(documentFile, 'utf8'));
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*$/;

// The document as { text, sections, examples }: each section { level, title,
// line, text }, its text running from its heading to the next heading of its
// level or a higher one; each example { language, attributes, text, line,
// section }, `attributes` the words of its info string after the language, a
// word with `=` as a name and its value; `section` the title of the section
// it stands in.
export function readDocument(text) {
  const lines = text.split('\n');
  const headings = [];
  const blocks = [];
  let fence = null;
  lines.forEach((line, i) => {
    const match = FENCE.exec(line);
    if (fence) {
      if (match && match[1][0] === fence.marker[0] && match[1].length >= fence.marker.length && match[2].trim() === '') {
        blocks.push({ ...fence, text: lines.slice(fence.line, i).join('\n') });
        fence = null;
      }
      return;
    }
    if (match) {
      fence = { marker: match[1], info: match[2].trim(), line: i + 1 };
      return;
    }
    const heading = HEADING.exec(line);
    if (heading) headings.push({ level: heading[1].length, title: heading[2], line: i + 1 });
  });
  const sections = headings.map((heading, i) => {
    const next = headings.slice(i + 1).find((later) => later.level <= heading.level);
    return { ...heading, text: lines.slice(heading.line - 1, next ? next.line - 1 : lines.length).join('\n') };
  });
  const sectionAt = (line) => headings.filter((heading) => heading.line < line).at(-1)?.title ?? null;
  const examples = blocks.map(({ info, text: body, line }) => {
    const [language = '', ...words] = info.split(/\s+/).filter(Boolean);
    const attributes = Object.fromEntries(words.map((word) => {
      const at = word.indexOf('=');
      return at === -1 ? [word, true] : [word.slice(0, at), word.slice(at + 1)];
    }));
    return { language, attributes, text: body, line, section: sectionAt(line) };
  });
  return { text, sections, examples };
}

// The section of the document with this title; throws when it has none, or
// more than one.
export function section(document, title) {
  const found = document.sections.filter((one) => one.title === title);
  if (found.length !== 1) throw new Error(`the content format document has ${found.length} sections titled "${title}"`);
  return found[0];
}

// The contents of every code span of a text, outside its fenced code blocks.
export function codeSpans(text) {
  const outside = [];
  let fence = null;
  for (const line of text.split('\n')) {
    const match = FENCE.exec(line);
    if (fence) {
      if (match && match[1][0] === fence[0] && match[1].length >= fence.length && match[2].trim() === '') fence = null;
    } else if (match) {
      fence = match[1];
    } else {
      outside.push(line);
    }
  }
  const spans = new Set();
  const joined = outside.join('\n');
  const pattern = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;
  for (const [, , content] of joined.matchAll(pattern)) {
    spans.add(content.length > 2 && content.startsWith(' ') && content.endsWith(' ') ? content.slice(1, -1) : content);
  }
  return spans;
}

// What the document leaves unnamed of what the core knows, each as a sentence
// that names it and the section that should: every element, inline element and
// embed service of the rule data (`rules`), each field the core gives meaning to
// (`coreFields`), the search and sharing fields (`seoField`, with each of
// `seoKeys`), the other keys of a post's frontmatter (`frontmatterKeys`), each
// type a field of the site's own may have (`fieldTypes`) and a site setting may
// have (`settingTypes`), and the identity's keys in the site settings
// (`identity`).
export function unnamed(document, known) {
  const missing = [];
  const check = (title, names, what) => {
    const spans = codeSpans(section(document, title).text);
    for (const name of names) {
      if (!spans.has(name)) missing.push(`the section "${title}" does not name ${what} ${name}`);
    }
  };
  check('The body', Object.keys(known.rules.elements), 'the element');
  check('Inline elements', Object.keys(known.rules.inline), 'the inline element');
  check('Embeds', Object.keys(known.rules.embeds.services), 'the embed service');
  check('A post\'s file', [...Object.keys(known.coreFields), known.seoField, ...known.frontmatterKeys], 'the field');
  check('A post\'s file', known.seoKeys, 'the search and sharing field');
  check('A post\'s file', Object.keys(known.fieldTypes), 'the type of field');
  check('The site settings', Object.keys(known.settingTypes), 'the type of setting');
  check('The site settings', known.identity, 'the identity\'s setting');
  return missing;
}

// The page a body example stands for: `pages/example.md`, its frontmatter
// the title alone, then a blank line and the body.
export const BODY_PAGE = 'pages/example.md';
const BODY_HEAD = '---\ntitle: "Example"\n---\n\n';

// The content file a Markdown example or a JSON example of a file stands
// for, { path, contents }: its text with one final newline.
export function exampleFile(example) {
  if (example.attributes.body) return { path: BODY_PAGE, contents: `${BODY_HEAD}${example.text}\n` };
  return { path: example.attributes.file, contents: `${example.text}\n` };
}

const isMarkdown = (example) => ['markdown', 'md'].includes(example.language);

// The examples the document marks, as { site, sites, files, checked }: the
// site descriptions they are of, parsed, by name, the one with no name as
// `site`; the whole files of each site's exact examples, by the site's name,
// as a content folder holds them; and each example to check, a read example with
// `rendered`, the HTML the document says the site's reader renders of it.
export function markedExamples(document) {
  const { examples } = document;
  const sites = {};
  for (const example of examples.filter((one) => one.attributes['site-description'])) {
    const name = example.attributes['site-description'] === true ? MAIN_SITE : example.attributes['site-description'];
    if (Object.hasOwn(sites, name)) throw new Error(`the content format document gives two site descriptions named "${name}"`);
    sites[name] = JSON.parse(example.text);
  }
  if (!Object.hasOwn(sites, MAIN_SITE)) throw new Error('the content format document gives no site description');
  const checked = [];
  examples.forEach((example, i) => {
    if (!example.attributes.file && !example.attributes.body) return;
    if (!Object.hasOwn(sites, siteOf(example))) throw new Error(`the example at line ${example.line} is of no site description the document gives`);
    const next = examples[i + 1];
    const rendered = example.attributes.read && next?.language === 'html' && next.attributes.rendered ? next.text : undefined;
    checked.push(rendered === undefined ? example : { ...example, rendered });
  });
  const files = Object.fromEntries(Object.keys(sites).map((name) => [name, checked
    .filter((example) => siteOf(example) === name && example.attributes.file && !example.attributes.read && !example.attributes.tour)
    .map(exampleFile)]));
  return { site: sites[MAIN_SITE], sites, files, checked };
}

// The site description an example is of: the one its `site` names, or the
// document's own, which has no name.
const MAIN_SITE = '';
export function siteOf(example) {
  return typeof example.attributes.site === 'string' ? example.attributes.site : MAIN_SITE;
}

