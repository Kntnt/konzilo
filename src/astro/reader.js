// The site's own reader of content files, as Astro reads them: Astro splits
// off the frontmatter, and Sätteri reads the body with the features and the
// HTML tree plugins below. The Astro integration sets both on the site.

import { parseFrontmatter } from 'astro/markdown';
import { htmlToHast, markdownToHtml, markdownToMdast } from 'satteri';
import { directiveReader, readDirective, withDefaults } from './directives.js';
import { embedsIn } from './embeds.js';
import { figures } from './figures.js';
import { markdownFeatures } from './reader-features.js';

export { markdownFeatures };

const headingTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

// A heading's anchor is written as an empty raw <a> with its id, before the
// heading's text; the heading takes that id as its own. Astro then keeps the
// id and gives a heading without one an id of its text.
const headingAnchors = {
  name: 'konzilo-heading-anchors',
  element: {
    filter: headingTags,
    visit(node, ctx) {
      const [first] = node.children;
      const anchor = first?.type === 'element' && first.tagName === 'a' && first.children.length === 0
        && Object.keys(first.properties).join() === 'id' && typeof first.properties.id === 'string';
      if (!anchor || node.properties.id !== undefined) return;
      ctx.setProperty(node, 'id', first.properties.id);
      ctx.removeChildAt(node, 0);
    },
  },
};

// Sätteri's HTML tree plugins, in the order they run, for a site in
// `locale` (null for none), or, on a site in several,
// its main language's, with its `languages`. A paragraph holding only the
// address of content the site embeds becomes its embed, whose
// sentence for a visitor whose browser does not run the site's script is in
// the site's language, the language of the post on a site in several, and one
// holding only an image, with its caption, if any, a figure.
export function markdownHastPluginsIn(locale, languages = []) {
  return [headingAnchors, embedsIn(locale, languages), figures];
}

// The plugins for a site in English: a panel's sentence is all the site's
// language changes.
export const markdownHastPlugins = Object.freeze(markdownHastPluginsIn(null));

// Sätteri's Markdown tree plugins, for the site: its directives,
// each one the registry refuses failing the build, naming the file, the line
// and the reason. `known`: the registry of the site's directives, the core's
// and its components (directives.js). `checks`: the site's own checks of a directive, by its
// name, as directiveReader() takes them: the integration checks each post
// list against the site description. `leaveOut`: the site's
// reasons to leave a directive out of the page, by its name, each handed to
// `warn(message)`, naming the file and the line, rather than failing the
// build.
export function markdownMdastPlugins({ checks, leaveOut, warn = () => {}, known } = {}) {
  return [directiveReader(({ file, line, reason }) => {
    throw new Error(`${file ?? 'a content file'}: line ${line}: ${reason}`);
  }, { checks, leaveOut, known, warn: ({ file, line, reason }) => warn(`${file ?? 'a content file'}: line ${line}: ${reason}`) })];
}

// A content file as the site reads it: its frontmatter, its body as a
// Markdown tree (mdast, without positions), its body as the HTML the site
// renders, and the problems its directives have, by the line of the body,
// as { line, reason }, which would fail the site's build. `known`: the registry
// of the site's directives, by default that of the site description at the root.
export function readContentFile(text, { known } = {}) {
  const { frontmatter, content } = parseFrontmatter(text);
  // Astro trims the body of a Markdown entry before it renders it.
  const body = content.trim();
  const problems = [];
  const reader = directiveReader(({ line, reason }) => problems.push({ line, reason }), { known });
  return {
    data: frontmatter,
    tree: markdownToMdast(body, { features: markdownFeatures, position: false }),
    html: markdownToHtml(body, { features: markdownFeatures, mdastPlugins: [reader], hastPlugins: [...markdownHastPlugins] }).html,
    problems,
  };
}

// The ids of the embed services a content file shows, as the site renders it: each
// embed's panel names its service.
export function embedsInFile(contents, found = new Set()) {
  const walk = (node) => {
    if (node.type === 'element' && node.tagName === 'figure' && typeof node.properties?.dataEmbed === 'string') found.add(node.properties.dataEmbed);
    for (const child of node.children ?? []) walk(child);
  };
  walk(htmlToHast(readContentFile(contents).html, { fragment: true }));
  return found;
}

// The post lists of a content file's body, in order, each as
// its attributes, typed, those not given at their defaults, and then the
// options of its presentation as their text, as Body.astro gives a list
// them: what a build needs to know of a post's lists before it renders the
// post, such as which has pages of its own. A list the registry refuses is
// left out; the site's reader fails the build for it.
export function postListsIn(body) {
  if (typeof body !== 'string' || !body.includes('::post-list')) return [];
  const lists = [];
  const visit = (node) => {
    if (node.type === 'leafDirective' && node.name === 'post-list') {
      const { entry, values, problems } = readDirective(node);
      if (entry && problems.length === 0) lists.push(withDefaults(entry, values));
      return;
    }
    for (const child of node.children ?? []) visit(child);
  };
  visit(markdownToMdast(body, { features: markdownFeatures, position: false }));
  return lists;
}
