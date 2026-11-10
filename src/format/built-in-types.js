// The core's own post types and taxonomies (ADR 0062): canvas, a blank page; page, a
// canvas with the site's header and footer; and article, a page with the article parts
// fixed by Kntnt's model of an article, which brings three taxonomies, authors, category
// and topics. A site uses one by naming it among its types; site-description.js reads
// it into the same form as a type of the site's own, its fields in full, with `builtIn`
// naming it, and null on a type or a taxonomy of the site's own.
//
// What a built-in type is, its fields, and which of them hold an article's authors, its
// category and its topics, are here and nowhere else. Code asks a post's type here too.
//
// This module imports nothing but the catalogues, so that the editor's code in the
// browser reads it as the intake and the build do.

import { CATALOGUES, text } from '../catalogues.js';

export const CANVAS = 'canvas';
export const PAGE = 'page';
export const ARTICLE = 'article';

// The built-in taxonomies, by name, each also the name of the article's field that
// holds its terms: `entry.data.authors`, `entry.data.category`, `entry.data.topics`.
export const AUTHORS = 'authors';
export const CATEGORY = 'category';
export const TOPICS = 'topics';

// The field of the search and sharing fields, which a built-in type has last, after any
// field of the site's own.
const SEO = 'seo';

// Each built-in type: its label and plural, by their names in the catalogues; whether
// a site may make it hierarchical; the built-in taxonomies it brings; and its fields, by
// the names its content file gives them, in the order it holds them, each as a site
// would declare it.
export const BUILT_IN_TYPES = Object.freeze({
  [CANVAS]: Object.freeze({
    label: 'form.canvas',
    plural: 'form.canvases',
    hierarchical: true,
    taxonomies: Object.freeze([]),
    fields: Object.freeze({ [SEO]: {} }),
  }),
  [PAGE]: Object.freeze({
    label: 'form.page',
    plural: 'form.pages',
    hierarchical: true,
    taxonomies: Object.freeze([]),
    fields: Object.freeze({ breadcrumb: {}, [SEO]: {} }),
  }),
  [ARTICLE]: Object.freeze({
    label: 'form.article',
    plural: 'form.articles',
    hierarchical: false,
    taxonomies: Object.freeze([AUTHORS, CATEGORY, TOPICS]),
    fields: Object.freeze({
      date: {},
      modified: {},
      image: {},
      breadcrumb: {},
      eyebrow: {},
      headline: { required: true },
      subheadline: {},
      standfirst: {},
      [AUTHORS]: { taxonomy: AUTHORS },
      [CATEGORY]: { taxonomy: CATEGORY, most: 1 },
      [TOPICS]: { taxonomy: TOPICS },
      teaser: {},
      [SEO]: {},
    }),
  }),
});

// Each built-in taxonomy: its label and plural, by their names in the catalogues, its
// collection and whether its terms have parents. An author is a term of `authors`, its
// name and its biography the term's name and description.
export const BUILT_IN_TAXONOMIES = Object.freeze({
  [AUTHORS]: Object.freeze({ label: 'form.author', plural: 'form.authors', collection: 'authors', hierarchical: false }),
  [CATEGORY]: Object.freeze({ label: 'form.category', plural: 'form.categories', collection: 'categories', hierarchical: true }),
  [TOPICS]: Object.freeze({ label: 'form.topic', plural: 'form.topics', collection: 'topics', hierarchical: false }),
});

// A built-in type's or taxonomy's label, by its name in the catalogues, as a site's own
// label by language is given: a text in each language the core's interface comes in.
export function catalogueLabel(name) {
  return Object.freeze(Object.fromEntries(Object.keys(CATALOGUES).map((language) => [language, text(language, name)])));
}

// A built-in type's fields with a site's own among them, each [name, declared]: the
// core's, the site's own in the order declared, and the search and sharing fields last.
export function fieldsWith(builtIn, own) {
  const core = Object.entries(BUILT_IN_TYPES[builtIn].fields);
  return [...core.filter(([name]) => name !== SEO), ...own, ...core.filter(([name]) => name === SEO)];
}

// The built-in type a type is, as the site description reads it, or null for a type of
// the site's own.
export function builtInOf(type) {
  return type?.builtIn ?? null;
}

// Whether a post's type is the built-in article: the answer wherever the head, the
// structured data, the summary or search ask whether a post is an article.
export function isArticle(type) {
  return builtInOf(type) === ARTICLE;
}

// Whether a post's head, its search and sharing fields in the editor, and its summary
// follow its article parts (article-parts.js): an article's do, and so do those of a
// type of the site's own that has a teaser.
export function followsParts(type) {
  return isArticle(type) || (type?.fields ?? []).some((field) => field.kind === 'teaser');
}
