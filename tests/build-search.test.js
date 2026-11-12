// The site's search at a build (ADR 0053), against a stand-in for Typesense: the documents of
// the content files in use go into a new collection that the site's alias leads to, and the web
// server's route to it is written whole, with the scoped key, where the web server reads it. A
// site without search asks Typesense nothing, and its route says that it has none. The
// documents come from `konzilo-search documents`, as the builder runs it in the site's own
// dependencies. Real Typesense and Caddy take it in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { searchDocumentsCommand, siteSearch } from '../src/build/search-index.js';
import { scopedSearchKey, searchDocuments, searchParameters } from '../src/search.js';
import { siteDescription } from '../src/site-description.js';
import { standInTypesense } from './lib/typesense.js';

const article = { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { date: {} } };
const program = fileURLToPath(new URL('../bin/konzilo-search.js', import.meta.url));
const declared = { language: 'en_GB', images: { smallestWidth: 400, displayWidth: 1280 }, search: { address: '/search/' }, types: { post: article } };
const searching = siteDescription(declared);

// A folder with the content files in use and the folder the web server reads the route from.
function folders() {
  const root = mkdtempSync(join(tmpdir(), 'konzilo-build-search-'));
  const content = join(root, 'content');
  mkdirSync(join(content, 'articles'), { recursive: true });
  writeFileSync(join(content, 'articles/hello.md'), '---\ntitle: "Hello"\ndate: 2026-10-01T08:00:00Z\n---\n\nA word only this post holds: quetzal.\n');
  mkdirSync(join(root, 'search'));
  writeFileSync(join(root, 'site-description.json'), JSON.stringify(declared));
  const documents = searchDocumentsCommand({ program, site: join(root, 'site-description.json'), content, environment: { PATH: process.env.PATH } });
  return { root, content, documents, route: join(root, 'search/search-route.caddy') };
}

test('puts the posts in use into the site\'s collection, and writes the route with the scoped key', async () => {
  const typesense = await standInTypesense();
  const { root, content, documents, route } = folders();
  try {
    const search = siteSearch({ typesense: typesense.url, key: typesense.key, searchKey: 'the-search-key', collection: 'a-site', site: searching, documents, route });
    await search();
    assert.deepEqual(Object.keys(typesense.documentsOf('a-site')), ['articles/hello']);
    assert.deepEqual(typesense.keys.map(({ value, actions, collections }) => ({ value, actions, collections })), [{ value: 'the-search-key', actions: ['documents:search'], collections: ['a-site'] }]);
    const written = readFileSync(route, 'utf8');
    assert.ok(written.includes(scopedSearchKey('the-search-key', searchParameters(searching))), 'the key that runs the site\'s search alone');
    assert.match(written, /rewrite \* \/collections\/a-site\/documents\/search\?/);
    assert.ok(written.includes(`\treverse_proxy ${typesense.url} {\n`), 'to the Typesense it indexed in');
    assert.doesNotMatch(written, /the-search-key|the-admin-key/, 'neither key it is made from');

    writeFileSync(join(content, 'articles/later.md'), '---\ntitle: "Later"\ndate: 2026-10-02T08:00:00Z\n---\n\nAnother word.\n');
    await search();
    assert.deepEqual(Object.keys(typesense.documentsOf('a-site')).sort(), ['articles/hello', 'articles/later']);
    assert.equal(typesense.collections.size, 1, 'the collection before goes');
    assert.equal(typesense.keys.length, 1, 'the search key is kept');
    assert.deepEqual(readdirSync(join(root, 'search')), ['search-route.caddy'], 'and nothing half written beside it');
  } finally {
    await typesense.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test('asks Typesense nothing on a site without search, and writes a route that says so', async () => {
  const { root, route } = folders();
  try {
    const asked = () => assert.fail('no documents are made');
    await siteSearch({ typesense: 'http://127.0.0.1:9', key: 'unused', searchKey: 'unused', collection: 'a-site', site: siteDescription({ ...declared, search: undefined }), documents: asked, route })();
    const written = readFileSync(route, 'utf8');
    assert.match(written, /This site has no search\./);
    assert.doesNotMatch(written, /reverse_proxy|unused/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('says why when Typesense does not answer or the documents cannot be made, and leaves the route as it was', async () => {
  const { root, documents, route } = folders();
  try {
    writeFileSync(route, 'the route before\n');
    const search = siteSearch({ typesense: 'http://127.0.0.1:9', key: 'a-key', searchKey: 'a-search-key', collection: 'a-site', site: searching, documents, route });
    await assert.rejects(search(), /Typesense does not answer at http:\/\/127\.0\.0\.1:9/);
    assert.equal(readFileSync(route, 'utf8'), 'the route before\n');
    assert.deepEqual(readdirSync(join(root, 'search')), ['search-route.caddy']);
    const broken = siteSearch({ typesense: 'http://127.0.0.1:9', key: 'a-key', searchKey: 'a-search-key', collection: 'a-site', site: searching, documents: searchDocumentsCommand({ program, site: join(root, 'no-such-file.json'), content: root, environment: { PATH: process.env.PATH } }), route });
    await assert.rejects(broken(), /^Error: the search documents could not be made: konzilo-search: the site description cannot be read/);
    assert.equal(readFileSync(route, 'utf8'), 'the route before\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// A site with the article, whose terms a list's filter sends by their slugs (ADR 0053).
function articleSite(declaredSite, files) {
  const content = mkdtempSync(join(tmpdir(), 'konzilo-search-terms-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(content, path, '..'), { recursive: true });
    writeFileSync(join(content, path), text);
  }
  return { content, ...searchDocuments({ site: declaredSite, content }) };
}

const withArticles = { language: 'en_GB', images: { smallestWidth: 400, displayWidth: 1280 }, search: { address: '/search/' }, types: { article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } } };

test('holds each taxonomy\'s terms by their slugs beside their names, in a field the search filters by and never matches a query against', () => {
  const { content, documents, schema } = articleSite(withArticles, {
    'articles/lanterns.md': '---\ntitle: "Lanterns"\ndate: 2026-10-01T08:00:00Z\nheadline: "Lanterns"\nauthors: ["ada-lind"]\ncategory: ["harbour-news"]\ntopics: ["lights","rivers"]\n---\n\nThe lantern keeps the harbour.\n',
    'articles/untagged.md': '---\ntitle: "Untagged"\ndate: 2026-10-02T08:00:00Z\nheadline: "Untagged"\nauthors: []\ncategory: []\ntopics: []\n---\n\nNo terms.\n',
    'authors/ada-lind.json': '{ "name": "Ada Lind" }',
    'categories/harbour-news.json': '{ "name": "Harbour news" }',
    'topics/lights.json': '{ "name": "Lights" }',
    'topics/rivers.json': '{ "name": "Rivers" }',
  });
  try {
    const [lanterns, untagged] = documents;
    assert.deepEqual(lanterns.terms_topics, ['Lights', 'Rivers']);
    assert.deepEqual([lanterns.slugs_authors, lanterns.slugs_category, lanterns.slugs_topics], [['ada-lind'], ['harbour-news'], ['lights', 'rivers']]);
    assert.deepEqual([untagged.slugs_authors, untagged.slugs_category, untagged.slugs_topics], [[], [], []]);
    const slugs = schema.fields.filter((field) => field.name.startsWith('slugs_'));
    assert.deepEqual(slugs, ['authors', 'category', 'topics'].map((name) => ({ name: `slugs_${name}`, type: 'string[]', optional: true, facet: true })));
    assert.doesNotMatch(searchParameters(withArticles).query_by, /slugs_/);
  } finally {
    rmSync(content, { recursive: true, force: true });
  }
});

test('on a site in several languages, holds a term by its slug alone, which every language shares, in one field', () => {
  const several = { ...withArticles, language: undefined, languages: ['sv_SE', 'en_GB'] };
  const { content, documents, schema } = articleSite(several, {
    'articles/sv-SE/om-lyktorna.md': '---\ntitle: "Om lyktorna"\ndate: 2026-10-20T08:00:00Z\nheadline: "Om lyktorna"\nauthors: []\ncategory: ["sv-SE/nyheter"]\ntopics: []\ntranslationKey: "3a1dace55ce438b2"\n---\n\nLyktan vaktar hamnen.\n',
    'articles/en-GB/about-the-lanterns.md': '---\ntitle: "About the lanterns"\ndate: 2026-10-20T08:00:00Z\nheadline: "About the lanterns"\nauthors: []\ncategory: ["en-GB/nyheter"]\ntopics: []\ntranslationKey: "3a1dace55ce438b2"\n---\n\nThe lantern keeps the harbour.\n',
    'categories/sv-SE/nyheter.json': '{ "name": "Nyheter" }',
    'categories/en-GB/nyheter.json': '{ "name": "News" }',
  });
  try {
    assert.deepEqual(documents.map((document) => [document.terms_category_sv ?? document.terms_category_en, document.slugs_category]), [[['News'], ['nyheter']], [['Nyheter'], ['nyheter']]]);
    assert.deepEqual(schema.fields.filter((field) => field.name.startsWith('slugs_')).map((field) => field.name), ['slugs_authors', 'slugs_category', 'slugs_topics']);
  } finally {
    rmSync(content, { recursive: true, force: true });
  }
});

// The page an Admin chose as the start page is in the index as any post of its type, at /,
// by its file (ADR 0053).
test('holds the article an Admin chose as the start page at /, by its file at the content folder\'s root', () => {
  const { content, documents } = articleSite(withArticles, {
    'start.article.md': '---\ntitle: "Welcome"\ndate: 2026-10-01T08:00:00Z\nheadline: "Welcome to the harbour"\nauthors: []\ncategory: []\ntopics: []\noldAddresses: ["/welcome/"]\n---\n\nThe lantern keeps the harbour.\n',
    'articles/untagged.md': '---\ntitle: "Untagged"\ndate: 2026-10-02T08:00:00Z\nheadline: "Untagged"\nauthors: []\ncategory: []\ntopics: []\n---\n\nNo terms.\n',
  });
  try {
    assert.deepEqual(documents.map(({ id, title, address, type, body }) => ({ id, title, address, type, body })), [
      { id: 'articles/untagged', title: 'Untagged', address: '/untagged/', type: 'article', body: 'No terms.' },
      { id: 'start.article', title: 'Welcome to the harbour', address: '/', type: 'article', body: 'The lantern keeps the harbour.' },
    ]);
  } finally {
    rmSync(content, { recursive: true, force: true });
  }
});
