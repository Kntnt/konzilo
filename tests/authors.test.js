// An article's authors, in the order its editor gave them: the intake keeps the order the
// source holds, each author once, while every other terms field stays sorted; and the
// article's structured data names them in that order, each a Person with a stable @id and
// its page's address where the authors have pages, or the publisher where it has none.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { headTags } from '../src/astro/search-and-sharing.js';
import { siteDescription } from '../src/site-description.js';
import { run, sourcePost, written } from './lib/intake.js';

const declared = {
  language: 'en_GB',
  images: { smallestWidth: 1, displayWidth: 1 },
  types: {
    article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
  },
};
const site = siteDescription(declared);

// Two authors, Ada Lind and Ben Holm, and two topics.
const terms = {
  'authors/adaadaadaada.json': { name: 'Ada Lind', slug: 'ada-lind', description: 'Keeps the harbour\'s history.' },
  'authors/benbenbenben.json': { name: 'Ben Holm', slug: 'ben-holm' },
  'topics/harbourharbo.json': { name: 'Harbours', slug: 'harbours' },
  'topics/lanternlante.json': { name: 'Lanterns', slug: 'lanterns' },
};
const article = (fields) => run({ 'articles/111111111111.md': sourcePost({ title: 'Harbour lights', slug: 'harbour-lights', status: 'published', headline: 'Harbour lights', ...fields }, 'Text.'), ...terms }, site);
const fileOf = (result) => written(result)['articles/harbour-lights.md'];

describe('the intake', () => {
  test('writes an article\'s authors in the order the source gives them, each once, and its topics sorted', () => {
    const result = article({ authors: ['benbenbenben', 'adaadaadaada', 'benbenbenben'], topics: ['lanternlante', 'harbourharbo'] });
    assert.deepEqual(result.refusals, []);
    assert.match(fileOf(result), /\nauthors: \["ben-holm","ada-lind"\]\n/);
    assert.match(fileOf(result), /\ntopics: \["harbours","lanterns"\]\n/);
    const other = article({ authors: ['adaadaadaada', 'benbenbenben'], topics: ['harbourharbo', 'lanternlante'] });
    assert.match(fileOf(other), /\nauthors: \["ada-lind","ben-holm"\]\n/);
    assert.match(fileOf(other), /\ntopics: \["harbours","lanterns"\]\n/);
  });
});

// An article as Astro hands a template one, its authors as references, in the order its
// file holds them.
const ORIGIN = 'https://www.example.com';
const PUBLISHER = { '@id': `${ORIGIN}/#publisher` };
const entry = (authors) => ({
  id: 'harbour-lights',
  collection: 'articles',
  body: 'The lantern keeps the harbour.',
  data: { title: 'Harbour lights', date: new Date('2026-10-20T08:00:00Z'), modified: new Date('2026-10-21T09:30:00Z'), headline: 'Why the harbour keeps its lanterns lit', authors: authors.map((id) => ({ collection: 'authors', id })), category: [], topics: [] },
});
// The terms of the authors' collection, by their IDs, as Astro's getEntries() gives them.
const authorEntries = {
  'ada-lind': { id: 'ada-lind', collection: 'authors', data: { name: 'Ada Lind', description: 'Keeps the harbour\'s history.' } },
  'ben-holm': { id: 'ben-holm', collection: 'authors', data: { name: 'Ben Holm' } },
  'en-GB/ben-holm': { id: 'en-GB/ben-holm', collection: 'authors', data: { name: 'Ben Holm' } },
};
const getEntries = async (references) => references.map(({ collection, id }) => (collection === 'authors' ? authorEntries[id] : undefined));

// The article node of an article's graph and the nodes it names as its authors, in order,
// on the site `of`.
async function authorsInGraph(authors, of = site) {
  const tags = await headTags(
    { entry: entry(authors), path: '/harbour-lights/', settings: { title: 'The Quiet Lantern', search: { separator: '–', types: { article: { schema: 'Article' } } } }, site: of, origin: ORIGIN, locale: 'en_GB', languageTag: 'en-GB' },
    { getImage: () => assert.fail('no image to make'), getEntries },
  );
  const nodes = JSON.parse(tags.at(-1).text)['@graph'];
  const article = nodes.find((node) => node['@type'] === 'Article');
  const named = [article.author].flat().map(({ '@id': id }) => nodes.find((node) => node['@id'] === id));
  return { article, named };
}

describe('the structured data', () => {
  test('names an article\'s authors as its author, in the order its file holds them, each a Person by a stable @id', async () => {
    const { article, named } = await authorsInGraph(['ben-holm', 'ada-lind']);
    assert.deepEqual(article.author, [{ '@id': `${ORIGIN}/#author-ben-holm` }, { '@id': `${ORIGIN}/#author-ada-lind` }]);
    assert.deepEqual(named, [
      { '@type': 'Person', '@id': `${ORIGIN}/#author-ben-holm`, name: 'Ben Holm' },
      { '@type': 'Person', '@id': `${ORIGIN}/#author-ada-lind`, name: 'Ada Lind' },
    ]);
    assert.deepEqual(article.publisher, PUBLISHER);
  });

  test('gives each author its page\'s address where the authors have pages, by the same @id', async () => {
    const paged = siteDescription({ ...declared, taxonomies: { authors: { address: '/authors/{slug}/' } } });
    const { named } = await authorsInGraph(['ben-holm', 'ada-lind'], paged);
    assert.deepEqual(named, [
      { '@type': 'Person', '@id': `${ORIGIN}/#author-ben-holm`, name: 'Ben Holm', url: `${ORIGIN}/authors/ben-holm/` },
      { '@type': 'Person', '@id': `${ORIGIN}/#author-ada-lind`, name: 'Ada Lind', url: `${ORIGIN}/authors/ada-lind/` },
    ]);
  });

  test('names an author in a language\'s folder by the slug every language shares, without a page, which only the main language\'s terms have', async () => {
    const paged = siteDescription({ ...declared, taxonomies: { authors: { address: '/authors/{slug}/' } } });
    const { named } = await authorsInGraph(['en-GB/ben-holm'], paged);
    assert.deepEqual(named, [{ '@type': 'Person', '@id': `${ORIGIN}/#author-ben-holm`, name: 'Ben Holm' }]);
  });

  test('names the publisher as the author of an article without authors', async () => {
    const { article, named } = await authorsInGraph([]);
    assert.deepEqual(article.author, PUBLISHER);
    assert.equal(named[0]['@id'], PUBLISHER['@id']);
  });
});
