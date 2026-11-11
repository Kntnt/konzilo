// The core's own post types and taxonomies (ADR 0062): canvas, a blank page; page, a
// canvas with the site's header and footer; and article, a page with the article parts
// fixed by Kntnt's model of an article, which brings three taxonomies, authors, category
// and topics. Every post is published at a moment, its date, which an editor may change,
// so each of the three has the date and the last change, the name in breadcrumbs and the
// teaser, in the article's order. A site uses one by naming it among its types;
// site-description.js reads it into the same form as a type of the site's own, its fields
// in full, with `builtIn` naming it, and null on a type or a taxonomy of the site's own.
//
// What a built-in type is, its fields, and which of them hold an article's authors, its
// category and its topics, are here and nowhere else. Code asks a post's type here too.
//
// This module imports nothing but the catalogues and the rule data, so that the editor's
// code in the browser reads it as the intake and the build do.

import { CATALOGUES, text } from '../catalogues.js';
import rules from './rules.json' with { type: 'json' };

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

// The structured data types the core knows are the rule data's `structuredDataTypes`, each
// a kind of article or else a kind of web page.

// The structured data types that are kinds of article, as an article offers them, Article
// its default.
const ARTICLE_KINDS = Object.freeze(['Article', 'BlogPosting', 'NewsArticle']);

// The rest of the rule data's, the kinds of web page, in its order.
const WEB_PAGE_KINDS = Object.freeze(rules.structuredDataTypes.filter((one) => !ARTICLE_KINDS.includes(one)));

// Every structured data type the core knows, as a page offers them: the kinds of web page,
// WebPage its default, then the kinds of article. A page and a canvas may be any of them, an
// about page, a press release or a one-off post, and so may a type of the site's own that
// declares none of its own.
export const EVERY_STRUCTURED_DATA_TYPE = Object.freeze([...WEB_PAGE_KINDS, ...ARTICLE_KINDS]);

// Each built-in type: its label and plural, by their names in the catalogues; whether
// a site may make it hierarchical; the built-in taxonomies it brings; the structured data
// types its posts may have, its default first; and its fields, by the names its content
// file gives them, in the order it holds them, each as a site would declare it.
export const BUILT_IN_TYPES = Object.freeze({
  [CANVAS]: Object.freeze({
    label: 'form.canvas',
    plural: 'form.canvases',
    hierarchical: true,
    taxonomies: Object.freeze([]),
    structuredDataTypes: EVERY_STRUCTURED_DATA_TYPE,
    fields: Object.freeze({ date: {}, modified: {}, breadcrumb: {}, teaser: {}, [SEO]: {} }),
  }),
  [PAGE]: Object.freeze({
    label: 'form.page',
    plural: 'form.pages',
    hierarchical: true,
    taxonomies: Object.freeze([]),
    structuredDataTypes: EVERY_STRUCTURED_DATA_TYPE,
    fields: Object.freeze({ date: {}, modified: {}, breadcrumb: {}, teaser: {}, [SEO]: {} }),
  }),
  [ARTICLE]: Object.freeze({
    label: 'form.article',
    plural: 'form.articles',
    hierarchical: false,
    taxonomies: Object.freeze([AUTHORS, CATEGORY, TOPICS]),
    structuredDataTypes: ARTICLE_KINDS,
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
// collection, whether its terms have parents, whether a post keeps its terms in the order
// the editor gives them, and the label of a term's description, by its name in the
// catalogues. An author is a term of `authors`, its name and its biography the term's
// name and description, and an article's authors keep their order, which says who wrote
// it first; a post's other terms are sorted.
export const BUILT_IN_TAXONOMIES = Object.freeze({
  [AUTHORS]: Object.freeze({ label: 'form.author', plural: 'form.authors', collection: 'authors', hierarchical: false, ordered: true, description: 'form.biography' }),
  [CATEGORY]: Object.freeze({ label: 'form.category', plural: 'form.categories', collection: 'categories', hierarchical: true, ordered: false, description: 'form.description' }),
  [TOPICS]: Object.freeze({ label: 'form.topic', plural: 'form.topics', collection: 'topics', hierarchical: false, ordered: false, description: 'form.description' }),
});

// Whether a post keeps a taxonomy's terms in the order the editor gives them, as the
// site description reads the taxonomy: a built-in one's, as it says; a site's own's are sorted.
export const keepsOrder = (taxonomy) => Object.hasOwn(BUILT_IN_TAXONOMIES, taxonomy?.builtIn ?? '') && BUILT_IN_TAXONOMIES[taxonomy.builtIn].ordered;

// The label of a term's description, by its name in the catalogues: a built-in taxonomy's
// own, else a description's.
export const descriptionLabel = (taxonomy) => (Object.hasOwn(BUILT_IN_TAXONOMIES, taxonomy?.builtIn ?? '') ? BUILT_IN_TAXONOMIES[taxonomy.builtIn].description : 'form.description');

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

// Whether a post's type is the built-in article: the answer wherever a post's fields are
// asked for an article's, its authors, its category and its topics. Whether a post is an
// article to search engines and social networks is its structured data type's to say
// (isKindOfArticle()).
export function isArticle(type) {
  return type?.builtIn === ARTICLE;
}

// Whether a structured data type is a kind of article, which makes a post that has it an
// article, in its head's og:type and its structured data's article node, whatever its type.
export const isKindOfArticle = (schema) => ARTICLE_KINDS.includes(schema);

// Whether a structured data type is a kind of web page, which a page's own node in its
// structured data takes.
export const isKindOfWebPage = (schema) => WEB_PAGE_KINDS.includes(schema);

// The structured data type a post of the type `type` has, among those its type offers: the
// post's own choice, `own`, else its type's from the settings, `chosen`, else its type's
// default, the first it offers. A choice its type does not offer is passed over, wherever it
// was made.
export function structuredDataTypeOf(type, own, chosen) {
  const offered = type.structuredDataTypes;
  return [own, chosen].find((one) => offered.includes(one)) ?? offered[0];
}

// The type a choice of one post is among, where the site must have one: the built-in page
// among the types with an address, else the first type with one; null where none has one.
export function pageTypeOf(types) {
  const withPages = Object.values(types).filter((type) => type.address !== null);
  return withPages.find((type) => type.builtIn === PAGE) ?? withPages[0] ?? null;
}

// What a term an article shares with another scores, by taxonomy, where related posts
// are ranked (post-lists.js): a point for each topic, half a point for the same category,
// and nothing for an author.
const RELATED_POINTS = Object.freeze({ [TOPICS]: 1, [CATEGORY]: 0.5 });

// What a term a post of a type shares with another scores, by taxonomy, where related
// posts are ranked: an article's by RELATED_POINTS, and null for a type of the site's own,
// whose every shared term, of any taxonomy, scores a point.
export function relatedPoints(type) {
  return isArticle(type) ? RELATED_POINTS : null;
}

// Whether a post's head, its search and sharing fields in the editor, and its summary
// follow its article parts (article-parts.js): those of a type with a teaser do, every
// built-in type and a type of the site's own that declares one. A teaser falls back to
// what its type has, a page's and a canvas's to the title alone.
export function followsParts(type) {
  return (type?.fields ?? []).some((field) => field.kind === 'teaser');
}
