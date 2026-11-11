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

// The head of an article on the site `of`, its type's structured data type `schema`.
const headOf = (authors, of = site, schema = 'Article') => headTags(
  { entry: entry(authors), path: '/harbour-lights/', settings: { title: 'The Quiet Lantern', search: { separator: '–', types: { article: { schema } } } }, site: of, origin: ORIGIN, locale: 'en_GB', languageTag: 'en-GB' },
  { getImage: () => assert.fail('no image to make'), getEntries },
);

// The article node of an article's graph and the nodes it names as its authors, in order,
// on the site `of`.
async function authorsInGraph(authors, of = site, schema = 'Article') {
  const nodes = JSON.parse((await headOf(authors, of, schema)).at(-1).text)['@graph'];
  const article = nodes.find((node) => node['@id'] === `${ORIGIN}/harbour-lights/#article`);
  const named = [article.author].flat().map(({ '@id': id }) => nodes.find((node) => node['@id'] === id));
  return { article, named, nodes };
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

  // Whether a post is an article is whether its type is the built-in article, whatever its
  // structured data type, which names the kind of its article node, or of its page's.
  test('keeps an article\'s article node and its authors when its type is given a kind of web page, and its og:type', async () => {
    const { article, named, nodes } = await authorsInGraph(['ben-holm'], site, 'WebPage');
    assert.equal(article['@type'], 'Article');
    assert.deepEqual(named, [{ '@type': 'Person', '@id': `${ORIGIN}/#author-ben-holm`, name: 'Ben Holm' }]);
    assert.equal(nodes.find((node) => node['@id'] === `${ORIGIN}/harbour-lights/#webpage`)['@type'], 'WebPage');
    assert.equal((await authorsInGraph(['ben-holm'], site, 'NewsArticle')).article['@type'], 'NewsArticle');
    const tags = Object.fromEntries((await headOf(['ben-holm'], site, 'WebPage')).filter(({ attributes }) => attributes?.property).map(({ attributes }) => [attributes.property, attributes.content]));
    assert.equal(tags['og:type'], 'article');
    assert.equal(tags['article:published_time'], '2026-10-20T08:00:00Z');
  });

  test('gives a type of the site\'s own with a date no article node and og:type website, unless an Admin gives it a kind of article, with the publisher as its author', async () => {
    const own = siteDescription({ ...declared, types: { story: { label: 'Story', plural: 'Stories', collection: 'stories', address: '/stories/{slug}/', elements: ['paragraph'], fields: { date: {}, seo: {} } } } });
    const story = { id: 'night-watch', collection: 'stories', body: 'The keeper watches.', data: { title: 'Night watch', date: new Date('2026-10-02T20:00:00Z') } };
    const head = (types) => headTags(
      { entry: story, path: '/stories/night-watch/', settings: { title: 'The Quiet Lantern', search: { separator: '–', types } }, site: own, origin: ORIGIN, locale: 'en_GB', languageTag: 'en-GB' },
      { getImage: () => assert.fail('no image to make'), getEntries },
    );
    const typed = (tags) => tags.find(({ attributes }) => attributes?.property === 'og:type').attributes.content;
    const graph = (tags) => JSON.parse(tags.at(-1).text)['@graph'];
    const plain = await head({ story: { schema: 'WebPage' } });
    assert.equal(typed(plain), 'website');
    assert.equal(graph(plain).some((node) => node['@id'].endsWith('#article')), false);
    const chosen = await head({ story: { schema: 'BlogPosting' } });
    assert.equal(typed(chosen), 'website');
    assert.deepEqual(graph(chosen).find((node) => node['@id'].endsWith('#article')).author, PUBLISHER);
  });
});
