// Search on the site, as Konzilo's Astro integration gives it:
// the search page the site description places, the texts of the search page
// and the search box, and, locally, the route /_konzilo/search, which Astro's
// dev server answers as Caddy does online.
//
// The route takes a GET of /_konzilo/search with Typesense's own search
// parameters `q`, the query, `page`, the page of results from 1, and
// `filter_by`, a filter such as `type:=post`, and nothing else; it answers
// Typesense's own search response. The key it adds runs the site's search
// alone (searchParameters() in ../search.js): the site's collection, a page
// of results at most, each result with the documents' public fields. Every
// other method is refused with 405, and every other path below it with 404.

import { readFileSync } from 'node:fs';
import { request } from 'node:http';
import { join, resolve } from 'node:path';
import { scopedSearchKey, SEARCH_ROUTE, searchParameters } from '../search.js';
import { languageTag, readSiteDescription, SITE_DESCRIPTION_FILE } from '../site-description.js';
import { inLanguage } from '../texts.js';
import { pageLanguage } from './languages.js';

export { SEARCH_ROUTE } from '../search.js';

// What a visitor reads of search, in the core's languages (texts.js): the
// search page's title and heading, `title`, which a site's search page
// shows (pageTexts() of `@kntnt/konzilo/astro/languages`), and the rest. A
// site gives texts of its own to the components (Search.astro,
// SearchBox.astro) as `texts`, by these names. In `results`, `result` and
// `page`, {count}, {query}, {page} and {pages} are what they say.
export const SEARCH_TEXTS = Object.freeze({
  title: { en: 'Search', sv: 'Sök' },
  label: { en: 'Search', sv: 'Sök' },
  submit: { en: 'Search', sv: 'Sök' },
  result: { en: '1 result for “{query}”', sv: '1 träff för ”{query}”' },
  results: { en: '{count} results for “{query}”', sv: '{count} träffar för ”{query}”' },
  page: { en: ', page {page} of {pages}', sv: ', sida {page} av {pages}' },
  pages: { en: 'Pages of results', sv: 'Sidor med träffar' },
  previous: { en: 'Previous', sv: 'Föregående' },
  next: { en: 'Next', sv: 'Nästa' },
  nothingFound: { en: 'Nothing matched your search.', sv: 'Inget matchade din sökning.' },
  notAnswering: { en: 'Search does not answer right now. Try again in a while.', sv: 'Sökningen svarar inte just nu. Försök igen om en stund.' },
  needsJavaScript: { en: 'Search needs JavaScript, which your browser does not run.', sv: 'Sökningen behöver JavaScript, som din webbläsare inte kör.' },
  notInPreview: { en: 'Search is not in the preview.', sv: 'Sökningen finns inte i förhandsvisningen.' },
});

// The texts in the language of a site in `locale` (null for none), with
// those the site gives over them.
export function searchTexts(locale, given = {}) {
  for (const name of Object.keys(given)) {
    if (!Object.hasOwn(SEARCH_TEXTS, name)) throw new Error(`Konzilo: search has no text called ${name}; its texts are ${Object.keys(SEARCH_TEXTS).join(', ')}`);
  }
  return Object.fromEntries(Object.entries(SEARCH_TEXTS).map(([name, text]) => [name, given[name] ?? inLanguage(text, locale)]));
}

const described = new Map();

// The site's search page in the language of the page at `url`, Astro.url,
// as its components need it: { address, locale, languageTag, language }, its
// public address and its language as its locale and its language
// tag, and, on a site in several languages, `language`, the locale whose
// documents it searches alone, at its address after that
// language's prefix, else null; null for a site without search. Without a
// URL, the main language's. It reads the site's own description,
// site-description.json at the root of the site repository, once per
// process, as publicSite() does.
export function searchPage(url = null) {
  const file = resolve(SITE_DESCRIPTION_FILE);
  if (!described.has(file)) described.set(file, readSiteDescription(file));
  const site = described.get(file);
  if (site.search === null) return null;
  const { languages } = site;
  const language = url === null ? (languages[0] ?? null) : pageLanguage(url.pathname, languages, import.meta.env?.BASE_URL ?? '/');
  const locale = language?.locale ?? site.language;
  const several = languages.length > 1;
  return Object.freeze({
    address: several ? `/${language.prefix}${site.search.address}` : site.search.address,
    locale,
    languageTag: languageTag(locale),
    language: several ? locale : null,
  });
}

// The query parameters the route takes, in this order; any other is left
// out.
const TAKEN = ['q', 'page', 'filter_by'];

// What every answer of the route says beside its own: never kept, and
// JSON, as Typesense's.
const NO_STORE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

// How long the dev server waits for Typesense.
const WAIT = 10_000;

// Astro's dev server's middleware for the route, for the site repository at
// `root`: the local Typesense at `typesense` (KONZILO_TYPESENSE, such as
// http://127.0.0.1:8108), the site's collection there, `collection`
// (KONZILO_SEARCH_COLLECTION), and the file of the site's search key,
// `keyFile` (KONZILO_SEARCH_KEY_FILE), which may change at each start and the
// dev server therefore reads for each search. The site description is read
// once: restart the dev server when it changes. A site without search answers 404 there.
// When Typesense does not answer, or the dev server is given no Typesense,
// the route answers 502, which the search page says plainly.
export function searchProxy(root, { typesense = process.env.KONZILO_TYPESENSE, collection = process.env.KONZILO_SEARCH_COLLECTION, keyFile = process.env.KONZILO_SEARCH_KEY_FILE } = {}) {
  const described = readSiteDescription(join(root, SITE_DESCRIPTION_FILE));
  const parameters = described.search === null ? null : searchParameters(described);
  return (incoming, outgoing, next) => {
    const url = new URL(incoming.url, 'http://dev');
    if (url.pathname !== SEARCH_ROUTE && !url.pathname.startsWith(`${SEARCH_ROUTE}/`)) return next();
    const answer = (status, message, headers = {}) => {
      outgoing.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...NO_STORE, ...headers });
      outgoing.end(`${JSON.stringify({ message })}\n`);
    };
    if (parameters === null) return answer(404, 'This site has no search.');
    if (url.pathname !== SEARCH_ROUTE) return answer(404, 'Not found.');
    if (incoming.method !== 'GET') return answer(405, 'Search takes GET alone.', { Allow: 'GET' });
    let searchKey = '';
    try {
      searchKey = readFileSync(keyFile, 'utf8').trim();
    } catch {
      // No key: search does not answer.
    }
    if (!typesense || !collection || searchKey === '') return answer(502, 'Search does not answer.');
    const query = new URLSearchParams();
    for (const name of TAKEN) {
      const value = url.searchParams.get(name);
      if (value !== null) query.set(name, value);
    }
    const address = new URL(`/collections/${encodeURIComponent(collection)}/documents/search?${query}`, typesense);
    const headers = { 'X-TYPESENSE-API-KEY': scopedSearchKey(searchKey, parameters) };
    const forward = request(address, { method: 'GET', headers, agent: false, timeout: WAIT }, (answered) => {
      outgoing.writeHead(answered.statusCode, { 'Content-Type': answered.headers['content-type'] ?? 'application/json; charset=utf-8', ...NO_STORE });
      answered.pipe(outgoing);
    });
    forward.on('timeout', () => forward.destroy(new Error('Typesense took too long')));
    forward.on('error', () => {
      if (outgoing.headersSent) outgoing.destroy();
      else answer(502, 'Search does not answer.');
    });
    forward.end();
  };
}
