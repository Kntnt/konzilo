// An article's parts: the core's fields for the name in breadcrumbs, the headline in its
// three parts, the standfirst and the teaser, what each falls back to when left empty
// (article-parts.js), the source's three groups of search, sharing and structured data,
// a taxonomy field that takes at most `most` terms, and the head, the summary and search,
// which follow the parts in the built-in article and in a type of the site's own that has
// a teaser.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { headTags } from '../src/astro/search-and-sharing.js';
import { ownSummary, summary } from '../src/astro/summary.js';
import { fitLength, fitWidth, SEARCH_DESCRIPTION, SEARCH_TITLE, searchDescriptionOf, searchTitleOf, slugFrom, socialDescriptionOf, socialTitleOf, teaserHeadlineOf, teaserImageOf, teaserTextOf, textWidth } from '../src/format/article-parts.js';
import { siteDescription } from '../src/site-description.js';
import { run, sourcePost, written } from './lib/intake.js';

const declared = {
  language: 'sv_SE',
  images: { smallestWidth: 1, displayWidth: 1 },
  types: {
    // The built-in article, which has every part and the taxonomies of its own.
    article: { label: 'Artikel', plural: 'Artiklar', collection: 'articles', address: '/magasin/{slug}/', elements: ['paragraph'] },
    page: { label: 'Sida', plural: 'Sidor', collection: 'pages', address: '/{slug}/', elements: ['paragraph'] },
    // A type of the site's own that has a teaser.
    story: { label: 'Reportage', plural: 'Reportage', collection: 'stories', address: '/reportage/{slug}/', elements: ['paragraph'], fields: { date: {}, headline: {}, eyebrow: {}, standfirst: {}, teaser: {}, seo: {} } },
  },
};
const site = siteDescription(declared);
const terms = {
  'categories/aaaaaaaaaaaa.json': { name: 'Brf', slug: 'brf' },
  'categories/bbbbbbbbbbbb.json': { name: 'Handel', slug: 'handel' },
  'topics/cccccccccccc.json': { name: 'Kameror', slug: 'kameror' },
  'authors/dddddddddddd.json': { name: 'Signe Lind', slug: 'signe-lind', description: 'Skriver om teknik.' },
};
const article = (fields, body = 'Brödtext.') => run({ 'articles/111111111111.md': sourcePost({ title: 'Arbetsnamn', slug: 'en-artikel', status: 'published', headline: 'Smarta kameror', ...fields }, body), ...terms }, site);
const fileOf = (result) => written(result)['articles/en-artikel.md'];
const reasons = (result) => result.refusals.map((one) => one.message);

describe('what each part falls back to', () => {
  const data = { title: 'Arbetsnamn', headline: 'Smarta kameror fixar integriteten', eyebrow: 'Analys', standfirst: 'Kameran ser, men den behöver inte se allt.', image: { src: 'main.webp', alt: 'En kamera' } };

  test('the teaser falls back to the eyebrow and the main headline, the standfirst and the main image', () => {
    assert.equal(teaserHeadlineOf(data), 'Analys: Smarta kameror fixar integriteten');
    assert.equal(teaserHeadlineOf({ title: 'Arbetsnamn' }), 'Arbetsnamn');
    assert.equal(teaserTextOf(data), data.standfirst);
    assert.deepEqual(teaserImageOf(data), data.image);
    const own = { ...data, teaser: { headline: 'Egen', text: 'Egen text', image: { src: 'own.webp', alt: 'Egen' } } };
    assert.equal(teaserHeadlineOf(own), 'Egen');
    assert.equal(teaserTextOf(own), 'Egen text');
    assert.deepEqual(teaserImageOf(own), own.teaser.image);
  });

  test('the title tag is the teaser\'s headline cut at a word so that it, the separator and the site\'s name fit a search result', () => {
    const long = { headline: 'Så skapar säkerhetssystem affärsnytta utöver trygghet för företag och fastighetsägare i hela landet' };
    const tag = searchTitleOf(long, 'Lyktan');
    assert.match(tag, /^Så skapar .*… \| Lyktan$/);
    assert.ok(textWidth(tag, SEARCH_TITLE) <= SEARCH_TITLE.width, `${textWidth(tag, SEARCH_TITLE)} px`);
    assert.equal(searchTitleOf({ headline: 'Kort' }, 'Lyktan'), 'Kort | Lyktan');
  });

  test('the meta description and the sharing texts are the teaser\'s, cut to what is shown', () => {
    const text = 'Ord '.repeat(80).trim();
    assert.ok(textWidth(searchDescriptionOf({ standfirst: text }), SEARCH_DESCRIPTION) <= SEARCH_DESCRIPTION.width);
    assert.ok([...socialTitleOf({ headline: text })].length <= 55);
    assert.ok([...socialDescriptionOf({ standfirst: text })].length <= 100);
    assert.equal(fitLength('En kort text', 55), 'En kort text');
    assert.equal(fitWidth('Ordet', 1, SEARCH_TITLE), '…');
  });

  test('a slug is made as WordPress makes one', () => {
    assert.equal(slugFrom('Smarta kameror – fixar integriteten!'), 'smarta-kameror-fixar-integriteten');
    assert.equal(slugFrom('Åre, Ærø & Straße'), 'are-aero-strasse');
  });
});

describe('the intake', () => {
  test('writes every part of the built-in article in its order, the teaser with its image as a master, and its terms', () => {
    const result = article({
      date: '2026-10-01T08:00:00Z',
      image: { src: '/media/huvud.png', alt: 'En kamera' },
      breadcrumb: 'Kameror',
      eyebrow: 'Analys',
      subheadline: 'Och gör det bra',
      standfirst: 'Kameran ser.',
      authors: ['dddddddddddd'],
      category: 'aaaaaaaaaaaa',
      topics: ['cccccccccccc'],
      teaser: { image: { src: '/media/puff.png', alt: 'En puff' }, headline: 'Puffens rubrik', text: '' },
      search: { title: 'Egen titel' },
    });
    assert.deepEqual(reasons(result), []);
    assert.match(fileOf(result), /^---\ntitle: "Arbetsnamn"\ndate: 2026-10-01T08:00:00Z\nmodified: 2026-10-01T08:00:00Z\nimage: \{"src":"\.\.\/media\/en-artikel-[0-9a-f]{10}\.webp","alt":"En kamera"\}\nbreadcrumb: "Kameror"\neyebrow: "Analys"\nheadline: "Smarta kameror"\nsubheadline: "Och gör det bra"\nstandfirst: "Kameran ser\."\nauthors: \["signe-lind"\]\ncategory: \["brf"\]\ntopics: \["kameror"\]\nteaser: \{"image":\{"src":"\.\.\/media\/en-artikel-[0-9a-f]{10}\.webp","alt":"En puff"\},"headline":"Puffens rubrik"\}\nseo: \{"title":"Egen titel"\}\n---\n/);
    assert.equal(written(result)['authors/signe-lind.json'], '{\n  "name": "Signe Lind",\n  "description": "Skriver om teknik."\n}\n');
    assert.ok(written(result)['categories/brf.json']);
    assert.ok(written(result)['topics/kameror.json']);
  });

  test('refuses a main headline left empty, a part holding HTML and a teaser image without its alt text', () => {
    assert.ok(reasons(article({ headline: '' })).some((one) => /without its main headline/.test(one)));
    assert.ok(reasons(article({ eyebrow: 'An <em>eyebrow</em>' })).some((one) => /eyebrow holding HTML/.test(one)));
    assert.ok(reasons(article({ teaser: { image: { src: '/media/puff.png' } } })).some((one) => /without alt text/.test(one)));
  });

  test('takes a category of one term as a text or a list, and refuses more than the field takes', () => {
    assert.match(fileOf(article({ category: 'bbbbbbbbbbbb' })), /^category: \["handel"\]$/m);
    assert.match(fileOf(article({ category: ['bbbbbbbbbbbb'] })), /^category: \["handel"\]$/m);
    assert.ok(reasons(article({ category: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'] })).some((one) => /takes at most 1 of its categories/.test(one)));
  });

  test('writes search, sharing and structured data from the source\'s three groups into one map', () => {
    const result = article({
      search: { title: 'Egen titel', noindex: true },
      sharing: { image: { src: '/media/del.png', alt: 'Delad' }, description: 'Delas så' },
      structured: { schema: 'NewsArticle' },
    });
    assert.deepEqual(reasons(result), []);
    assert.match(fileOf(result), /^seo: \{"title":"Egen titel","socialDescription":"Delas så","socialImage":"\.\.\/media\/en-artikel-[0-9a-f]{10}\.webp","socialImageAlt":"Delad","schema":"NewsArticle","noindex":true\}$/m);
  });

  test('refuses the single map the groups replaced', () => {
    assert.ok(reasons(article({ seo: { search: { title: 'Gammal' } } })).some((one) => /cannot read the search and sharing fields/.test(one)));
  });

  test('refuses a site\'s own field named as one of the groups', () => {
    assert.throws(() => siteDescription({ ...declared, types: { page: { ...declared.types.page, fields: { search: { label: 'Sök', type: 'string', control: 'text' } } } } }), /keeps a group of the search and sharing fields under this name/);
    assert.throws(() => siteDescription({ ...declared, types: { page: { ...declared.types.page, fields: { category: { taxonomy: 'category', most: 0 } } } } }), /most: must be a whole number from 1/);
  });
});

describe('what shows an article, and a post of the site\'s own type that has a teaser', () => {
  const entry = {
    id: 'en-artikel',
    collection: 'articles',
    body: 'Brödtext som inte syns.',
    data: { title: 'Arbetsnamn', date: new Date('2026-10-01T08:00:00Z'), headline: 'Smarta kameror', eyebrow: 'Analys', standfirst: 'Kameran ser, men inte allt.' },
  };
  const tagsOf = (one, seo = {}) => headTags(
    { entry: { ...one, data: { ...one.data, seo } }, path: '/magasin/en-artikel/', settings: { title: 'Lyktan', search: { separator: '–', types: { article: { title: '{{ post.title }} {{ sep }} {{ site.title }}', description: 'Mallen', schema: 'Article' } } } }, site, origin: 'https://www.example.com', locale: 'sv_SE', languageTag: 'sv-SE' },
    { getImage: () => assert.fail('no image to make'), getEntries: async () => [] },
  );
  const value = (tags, name) => {
    const found = tags.find(({ tag, attributes }) => (name === 'title' ? tag === 'title' : Object.values(attributes ?? {}).includes(name)));
    return name === 'title' ? found?.text : found?.attributes.content ?? found?.attributes.href;
  };

  test('says in its head what its teaser shows, before the type\'s templates, and its own where it gives them', async () => {
    const tags = await tagsOf(entry);
    assert.equal(value(tags, 'title'), 'Analys: Smarta kameror | Lyktan');
    assert.equal(value(tags, 'description'), 'Kameran ser, men inte allt.');
    assert.equal(value(tags, 'og:title'), 'Analys: Smarta kameror');
    assert.equal(value(tags, 'canonical'), 'https://www.example.com/magasin/en-artikel/');
    const graph = JSON.parse(tags.at(-1).text)['@graph'];
    assert.equal(graph.find((node) => node['@type'] === 'Article').headline, 'Smarta kameror');
    const own = await tagsOf(entry, { title: 'Egen' });
    assert.equal(value(own, 'title'), 'Egen');
  });

  test('says the same in the head of a post of the site\'s own type that has a teaser', async () => {
    const story = { ...entry, id: 'ett-reportage', collection: 'stories' };
    const tags = await headTags(
      { entry: story, path: '/reportage/ett-reportage/', settings: { title: 'Lyktan', search: { separator: '–', types: { story: { title: 'Mallen', description: 'Mallen' } } } }, site, origin: 'https://www.example.com', locale: 'sv_SE', languageTag: 'sv-SE' },
      { getImage: () => assert.fail('no image to make'), getEntries: async () => [] },
    );
    assert.equal(value(tags, 'title'), 'Analys: Smarta kameror | Lyktan');
    assert.equal(value(tags, 'description'), 'Kameran ser, men inte allt.');
    assert.equal(value(tags, 'canonical'), 'https://www.example.com/reportage/ett-reportage/');
  });

  test('summarises it by its excerpt, else its teaser\'s text, else its standfirst', () => {
    assert.equal(summary(entry), 'Kameran ser, men inte allt.');
    assert.equal(ownSummary({ ...entry.data, teaser: { text: 'Puffen' } }), 'Puffen');
    assert.equal(ownSummary({ excerpt: 'Utdraget', teaser: { text: 'Puffen' } }), 'Utdraget');
    assert.equal(ownSummary({}), '');
  });
});
