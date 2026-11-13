// The site's search, reached as `@kntnt/konzilo/search`: the
// search documents a build makes from the site's content files, the schema
// of the collection that holds them, the search a visitor's query runs, and
// the indexing that puts the documents into Typesense.
//
// The documents are made from the content files alone, read as the site reads
// them, so only what the site publishes is in them: a draft or an
// unpublished post has no file. They are never written into a release or
// anywhere a web server serves; the indexing hands them to Typesense, and
// the index can always be made again from the files.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { htmlToHast } from 'satteri';
import { registryOf } from './astro/directives.js';
import { readContentFile } from './astro/reader.js';
import { ownSummary } from './astro/summary.js';
import { labelIn } from './catalogues.js';
import { publicAddress } from './format/addresses.js';
import { START_ADDRESS, startFile } from './format/start-page.js';
import { siteDescription } from './site-description.js';

export { ensureSearchKey, indexSearch, scopedSearchKey } from './typesense.js';

// The address visitors' browsers reach search at, on the site's own host
//: Caddy online, Astro's dev server locally.
export const SEARCH_ROUTE = '/_konzilo/search';

// The search documents of a site, from `content`, the path of its content
// folder, and `site`, its site description (as declared, or as checked):
// { documents, schema }. A site without search has none. Each document is
// one post of a type that takes part, a content file, the start page an
// Admin chose among them, at its address, with
//
//   id        the file's path in the content folder, without `.md`
//   title     the post's title
//   address   its public address
//   type      its post type, by name
//   label     the type's label
//   date      its date, in seconds since 1970, where its type has one
//   excerpt   its excerpt, where it has one
//   body      its body as plain text, as a reader reads the page: the
//             text, images' alt text and captions, code, tables and
//             footnotes; no markup, no embed and no address
//   terms_<taxonomy>  the names of its terms in each taxonomy its type has
//   slugs_<taxonomy>  their slugs, which a list's filter and the search
//             page narrow by, the same in every language
//   language  the post's language, its locale, where the site
//             declares one
//
// in the order of their ids. A post whose search and sharing fields keep
// it from search engines, `noindex`, has none: the site's search shows what
// search engines are told of. The schema is collectionSchema()'s.
export function searchDocuments({ site, content }) {
  const described = siteDescription(site);
  if (described.search === null) return { documents: [], schema: collectionSchema(described) };
  const several = described.languages.length > 1;
  const termNames = new Map();
  const termName = (taxonomy, reference) => {
    const file = join(content, taxonomy.collection, `${reference}.json`);
    if (!termNames.has(file)) {
      let name = null;
      try {
        name = JSON.parse(readFileSync(file, 'utf8')).name ?? null;
      } catch {
        // A term without its file has no name to find it by.
      }
      termNames.set(file, name);
    }
    return termNames.get(file);
  };
  const documents = [];
  for (const type of Object.values(described.types)) {
    if (!type.search) continue;
    const seo = type.fields.find((field) => field.kind === 'seo');
    const files = entriesOf(join(content, type.collection), type, several ? described.languages : null)
      .map(({ id, path, language }) => ({ file: `${type.collection}/${id}.md`, address: publicAddress(type, path, language), language }));
    // The page an Admin chose as the start page, on a site in one language, at the root.
    if (!several && existsSync(join(content, startFile(type)))) files.push({ file: startFile(type), address: START_ADDRESS, language: null });
    for (const { file, address, language } of files) {
      const { data, html } = readContentFile(readFileSync(join(content, file), 'utf8'), { known: registryOf(described) });
      if (seo && data[seo.name]?.noindex === true) continue;
      const locale = language?.locale ?? described.language;
      const document = {
        id: file.slice(0, -'.md'.length),
        title: data[type.fields.find((field) => field.kind === 'headline')?.name] || data.title,
        address,
        type: type.name,
        // A label the site gives by language is the post's language's, as all a visitor reads is.
        label: labelIn(type.label, locale),
      };
      for (const field of type.fields) {
        const value = data[field.name];
        if (field.kind === 'date' && value instanceof Date) document.date = Math.floor(value.valueOf() / 1000);
      }
      // What the post says of itself in a sentence: its excerpt, else its teaser's text, else
      // its standfirst, as its summary is (summary.js).
      const excerpt = ownSummary(data);
      if (excerpt !== '') document.excerpt = excerpt;
      document.body = plainText(html);
      for (const field of type.fields) {
        if (field.kind !== 'terms' || !field.taxonomy) continue;
        document[`terms_${field.taxonomy.name}`] = (data[field.name] ?? []).map((reference) => termName(field.taxonomy, reference)).filter((name) => name !== null);
        // A reference names the term's file, `sv-SE/nyheter` on a site in several languages.
        document[`slugs_${field.taxonomy.name}`] = (data[field.name] ?? []).map((reference) => reference.slice(reference.lastIndexOf('/') + 1));
      }
      if (locale !== null) document.language = locale;
      documents.push(several ? inItsLanguage(document, locale) : document);
    }
  }
  documents.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { documents, schema: collectionSchema(described) };
}

// A document of a site in several languages, its texts searched
// in its language, `locale`: the title, the excerpt, the body and the terms
// each in the field of its language's analysis, `title_sv`, `terms_topic_sv`
// (analysisOf()), and the title and the excerpt kept as they are too, which
// a result shows.
function inItsLanguage(document, locale) {
  const code = analysisOf(locale).code;
  const own = {};
  for (const [name, value] of Object.entries(document)) {
    if (['title', 'excerpt', 'body'].includes(name) || name.startsWith('terms_')) own[`${name}_${code}`] = value;
    if (name !== 'body' && !name.startsWith('terms_')) own[name] = value;
  }
  return own;
}

// The content files of a type's collection in `folder`, as the site reads
// them: { id, path, language }, the file's id in the collection, the post's
// path, its slug or, in a hierarchical type, its ancestors' slugs and its
// own, and its language. On a site in several languages
// (`languages`, the site description's), each file is in the folder of its
// language's tag; on any other, `language` is null.
function entriesOf(folder, type, languages) {
  // A hierarchical type's files are in folders by path; any other's are
  // the files of its folder alone.
  const paths = (directory, prefix = '') => {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = `${prefix}${entry.name}`;
      if (entry.isDirectory()) return type.hierarchical ? paths(join(directory, entry.name), `${path}/`) : [];
      return entry.isFile() && entry.name.endsWith('.md') ? [path.slice(0, -'.md'.length)] : [];
    });
  };
  if (languages === null) return paths(folder).map((id) => ({ id, path: id, language: null }));
  return languages.flatMap((language) => paths(join(folder, language.tag)).map((path) => ({ id: `${language.tag}/${path}`, path, language })));
}

// What a reader reads of a body the site renders: its text, an image's alt
// text and the text of every element, in order, but for what is no text of
// the post's: an embed's panel, a <template>, the core's own words for
// footnotes and the marks that lead to and from them.
const BLOCKS = new Set(['p', 'div', 'li', 'ul', 'ol', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figure', 'figcaption', 'blockquote', 'pre', 'table', 'tr', 'td', 'th', 'section', 'br', 'hr', 'dt', 'dd']);

function plainText(html) {
  const parts = [];
  const skipped = ({ tagName, properties }) => {
    const classes = properties.className ?? [];
    return ['template', 'script', 'style'].includes(tagName)
      || classes.includes('konzilo-embed') || classes.includes('sr-only') || classes.includes('fn')
      || properties.dataFootnoteBackref !== undefined;
  };
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'text') parts.push(node.value);
      if (node.type !== 'element' || skipped(node)) continue;
      const block = BLOCKS.has(node.tagName);
      if (block) parts.push(' ');
      if (node.tagName === 'img' && typeof node.properties.alt === 'string') parts.push(` ${node.properties.alt} `);
      walk(node.children ?? []);
      if (block) parts.push(' ');
    }
  };
  walk(htmlToHast(html, { fragment: true }).children);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

// The languages Typesense 30.2 stems, by their ISO 639-1 codes: those of
// the Snowball stemmer it takes the language from the field's `locale` for.
// A collection with `stem` on a field of any other locale is refused (tried
// on Typesense 30.2: `nb`, `cs` and `ja` among them), so a site in another
// language is tokenised in it, unstemmed. Norwegian is `no` to the stemmer,
// whether a site writes Bokmål or Nynorsk.
const STEMMED = new Set(['ar', 'hy', 'eu', 'ca', 'da', 'nl', 'en', 'eo', 'et', 'fi', 'fr', 'de', 'el', 'hi', 'hu', 'id', 'ga', 'it', 'lt', 'ne', 'no', 'pl', 'pt', 'ro', 'ru', 'sr', 'es', 'sv', 'ta', 'tr', 'yi']);
const STEMMER_LANGUAGE = { nb: 'no', nn: 'no' };

// What a text field takes of a language, by its locale: `code`,
// the language's code, by which Typesense splits the text into words, as the
// field's `locale`, and stemming in it where Typesense has a stemmer for it,
// so that an inflected form finds the others ("tjänsten" finds "tjänster";
// tried on 30.2), as `text`, the field's own settings. A site that declares
// no language, none.
function analysisOf(locale) {
  if (locale === null) return { code: null, text: {} };
  const language = STEMMER_LANGUAGE[locale.split('_')[0]] ?? locale.split('_')[0];
  return { code: language, text: STEMMED.has(language) ? { locale: language, stem: true } : { locale: language } };
}

// The analyses of a site's languages, each { code, text } as analysisOf()
// gives it, once for each code, in the languages' order: on a site in
// several languages each language's texts are searched in
// fields of their own, by the code, `title_sv`, with that language's
// analysis; on any other there is one, the site's language's, in the
// fields themselves.
function analysesOf(described) {
  if (described.languages.length <= 1) return [analysisOf(described.language)];
  const seen = new Map();
  for (const { locale } of described.languages) {
    const analysis = analysisOf(locale);
    if (!seen.has(analysis.code)) seen.set(analysis.code, analysis);
  }
  return [...seen.values()];
}

// The taxonomies whose terms are in the documents: those of the types that
// take part, in the order the site description declares the types and
// their fields.
function searchedTaxonomies(described) {
  const taxonomies = [];
  for (const type of Object.values(described.types)) {
    if (!type.search) continue;
    for (const field of type.fields) {
      if (field.kind === 'terms' && field.taxonomy && !taxonomies.includes(field.taxonomy.name)) taxonomies.push(field.taxonomy.name);
    }
  }
  return taxonomies;
}

// The search page's own parameters, which no taxonomy's can be.
const SEARCH_PAGE_PARAMETERS = Object.freeze(['q', 'page', 'type']);

// The taxonomies the search page narrows by, by their names, which are their
// parameters on the search page, as a list's filter sends them: each
// taxonomy whose terms are in the documents (searchedTaxonomies()), in that
// order, but one named as a parameter of the search page's own, `q`, `page`
// or `type`.
export function searchTaxonomies(site) {
  return searchedTaxonomies(siteDescription(site)).filter((name) => !SEARCH_PAGE_PARAMETERS.includes(name));
}

// The fields a query is matched against, in the order of their weight, each
// { name, text, infix, weight }: the title, each taxonomy's terms, the
// excerpt and the body, on a site in several languages each in every
// language's analysis (analysesOf()).
function searchedFields(described) {
  const analyses = analysesOf(described);
  const several = described.languages.length > 1;
  const named = (name, code) => (several ? `${name}_${code}` : name);
  const each = (name, weight, infix) => analyses.map(({ code, text }) => ({ name: named(name, code), text, infix, weight }));
  return [
    ...each('title', 4, true),
    ...searchedTaxonomies(described).flatMap((taxonomy) => each(`terms_${taxonomy}`, 3, false)),
    ...each('excerpt', 2, false),
    ...each('body', 1, true),
  ];
}

// The schema of the collection that holds a site's search documents
// (searchDocuments()), as Typesense takes it, but its name, which the
// indexing gives it. Checked against Typesense 30.2's documentation of a
// collection's fields and tried on it:
//
// - every text the visitor's query is matched against, the title, the
//   excerpt, the body and the terms, takes the site's language
//   (analysisOf()); on a site in several languages each
//   language's texts are in fields of their own, `title_sv`, which take that
//   language's, and the title and the excerpt are kept as they are too, for
//   the result alone (`index: false`);
// - the title and the body are infix-searchable (`infix`), so that a word is
//   found inside a compound, "rapport" in "delårsrapport", which stemming
//   and prefixes alone never find; it costs memory, so the excerpt and the
//   terms, which are short and match whole, are not;
// - the address and the type's label are stored for the result alone and
//   never matched (`index: false`);
// - the type, the terms and the language can filter a search and count
//   its results by value (`facet`), as a site's lists and a language's search
//   page do; so can each taxonomy's slugs, `slugs_<taxonomy>`, which a query
//   is never matched against and which are the same in every language, so
//   one field holds them; the date is a number, which Typesense can always
//   filter and sort by.
export function collectionSchema(site) {
  const described = siteDescription(site);
  const several = described.languages.length > 1;
  const field = ({ name, text, infix }) => {
    const terms = name.startsWith('terms_');
    const optional = several || terms || name.startsWith('excerpt');
    return { name, type: terms ? 'string[]' : 'string', ...(optional ? { optional: true } : {}), ...(terms ? { facet: true } : {}), ...text, ...(infix ? { infix: true } : {}) };
  };
  const searched = searchedFields(described).map(field);
  const slugs = searchedTaxonomies(described).map((taxonomy) => ({ name: `slugs_${taxonomy}`, type: 'string[]', optional: true, facet: true }));
  if (several) {
    return {
      fields: [
        { name: 'title', type: 'string', index: false },
        { name: 'address', type: 'string', index: false },
        { name: 'type', type: 'string', facet: true },
        { name: 'label', type: 'string', index: false },
        { name: 'date', type: 'int64', optional: true },
        { name: 'excerpt', type: 'string', optional: true, index: false },
        ...searched,
        ...slugs,
        { name: 'language', type: 'string', optional: true, facet: true },
      ],
    };
  }
  const named = (name) => searched.filter((one) => one.name === name);
  return {
    fields: [
      ...named('title'),
      { name: 'address', type: 'string', index: false },
      { name: 'type', type: 'string', facet: true },
      { name: 'label', type: 'string', index: false },
      { name: 'date', type: 'int64', optional: true },
      ...named('excerpt'),
      ...named('body'),
      ...searched.filter((one) => one.name.startsWith('terms_')),
      ...slugs,
      { name: 'language', type: 'string', optional: true, facet: true },
    ],
  };
}

// The most results one search answers: a page of results.
export const PAGE_SIZE = 10;

// The fields of a document a result holds: what the search page shows of
// each, never the body, whose words a result shows in its snippet.
export const RESULT_FIELDS = Object.freeze(['title', 'address', 'type', 'label', 'date', 'excerpt']);

// The search every query runs, as Typesense's search parameters, which the
// route's key holds, so that no visitor can change them (scopedSearchKey()):
//
// - `query_by` with `query_by_weights`: the title weighs most, then each
//   taxonomy's terms, then the excerpt, then the body; on a site in several
//   languages each in every language's field, so that the query
//   is matched against a document in the analysis of its language, and a
//   language's search page asks for that language's documents alone with
//   `filter_by`, which the route takes from the page (search-client.js);
// - `infix`: a word is found inside a word of the title and the body
//   always, not only when nothing else matches (`fallback`), so that
//   "rapport" finds "delårsrapport" beside a post that says "rapport";
// - `num_typos`: up to two typos in a word, Typesense's default, said here
//   so that it holds;
// - `per_page` and `include_fields`: a page of PAGE_SIZE results at most,
//   each with RESULT_FIELDS alone;
// - the highlights: the matched words marked in the title, the excerpt and
//   the body, a snippet of eight words on each side of them, the title whole,
//   and never the whole body.
export function searchParameters(site) {
  const described = siteDescription(site);
  const fields = searchedFields(described);
  const of = (...names) => fields.map(({ name }) => name).filter((name) => names.some((one) => name === one || name.startsWith(`${one}_`)) && !name.startsWith('terms_')).join(',');
  return {
    query_by: fields.map(({ name }) => name).join(','),
    query_by_weights: fields.map(({ weight }) => weight).join(','),
    infix: fields.map(({ infix }) => (infix ? 'always' : 'off')).join(','),
    num_typos: 2,
    per_page: PAGE_SIZE,
    include_fields: RESULT_FIELDS.join(','),
    highlight_fields: of('title', 'excerpt', 'body'),
    highlight_full_fields: of('title'),
    highlight_affix_num_tokens: 8,
  };
}
