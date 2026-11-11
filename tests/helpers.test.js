// The helpers a site's templates call (`@kntnt/konzilo/astro/helpers`).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { authorsOf, builtInType, countOf, legalPages, longDate, metaLine, oneLine, ordered, postalAddress, summary, termPath } from '@kntnt/konzilo/astro/helpers';
import { siteDescription } from '../src/site-description.js';

test('longDate writes a date as the same long date in each language', () => {
  const dates = ['2001-02-03T04:05:06Z'];
  assert.equal(longDate(new Date(dates[0]), 'en-GB'), '3 February 2001', 'a known long date');
  assert.equal(longDate(new Date(dates[0]), 'sv-SE'), '3 februari 2001');
});

test('termPath writes a term after its parents', async () => {
  const terms = {
    food: { id: 'food', data: { name: 'Food' } },
    fruit: { id: 'fruit', data: { name: 'Fruit', parent: { id: 'food' } } },
    apples: { id: 'apples', data: { name: 'Apples & pears', parent: { id: 'fruit' } } },
    loop: { id: 'loop', data: { name: 'Loop', parent: { id: 'loop' } } },
  };
  const getEntry = async ({ id }) => terms[id];
  const shown = await Promise.all(Object.values(terms).map((term) => termPath(term, { getEntry })));
  assert.deepEqual(shown, ['Food', 'Food › Fruit', 'Food › Fruit › Apples & pears', 'Loop']);
});

test('postalAddress writes a publisher\'s address on one line from what is filled', () => {
  const publishers = [
    { street: 'Storgatan 1', postalCode: '111 22', locality: 'Stockholm', country: 'Sverige' },
    { street: 'Storgatan 1', locality: 'Stockholm' },
    { postalCode: '111 22', country: 'Sverige' },
    { street: '  ', postalCode: '', locality: ' Lund ', country: undefined },
    {},
  ];
  const shown = publishers.map((publisher) => postalAddress(publisher));
  assert.deepEqual(shown, ['Storgatan 1, 111 22 Stockholm, Sverige', 'Storgatan 1, Stockholm', '111 22, Sverige', 'Lund', '']);
});

test('oneLine writes a text of lines on one line', () => {
  const texts = ['Finansinspektionen\nBox 7821\n\n103 97 Stockholm', '  One  ', '', 'a\r\nb\rc'];
  const shown = texts.map((text) => oneLine(text));
  assert.deepEqual(shown, ['Finansinspektionen, Box 7821, 103 97 Stockholm', 'One', '', 'a, b, c']);
});

test('legalPages lists the chosen legal pages in order, each address once', () => {
  const privacy = { title: 'Privacy', url: '/pages/privacy/' };
  const cookies = { title: 'Cookies', url: '/pages/cookies/' };
  const access = { title: 'Accessibility', url: '/pages/accessibility/' };
  const chosen = [
    { privacyPolicy: privacy, cookiePolicy: cookies, accessibilityStatement: access },
    { privacyPolicy: privacy, cookiePolicy: privacy, accessibilityStatement: access },
    { cookiePolicy: cookies },
    {},
  ];
  const shown = chosen.map((pages) => legalPages({ legalPages: pages }));
  assert.deepEqual(shown[1], [privacy, access]);
  assert.deepEqual(shown[3], []);
});

test('summary writes a text\'s first words, and an ellipsis where it has more', () => {
  const texts = [['The lantern keeps the harbour and the ships that come in at night', 5], ['Short text', 5], ['  Spaced\n\tout   words  here ', 2], ['', 3], ['Ett två tre fyra', 3], ['Exactly three words', 3]];
  const shown = texts.map(([text, words]) => summary(text, words));
  assert.deepEqual(shown, ['The lantern keeps the harbour…', 'Short text', 'Spaced out…', '', 'Ett två tre…', 'Exactly three words']);
  assert.equal(summary(Array.from({ length: 40 }, (_, index) => `w${index}`).join(' ')), `${Array.from({ length: 30 }, (_, index) => `w${index}`).join(' ')}…`, 'thirty words by default');
});

test('countOf counts a list\'s items', () => {
  const lists = [[], ['a'], [{ name: 'Food' }, { name: 'Fruit' }, { name: 'Apples' }]];
  const shown = lists.map((list) => countOf(list));
  assert.deepEqual(shown, [0, 1, 3]);
  assert.equal(countOf(null), 0);
});

test('ordered orders a list by a text of each item in the page\'s language, ties as they came', () => {
  const terms = [{ name: 'Äpplen' }, { name: 'apelsiner' }, { name: 'Bananer' }, { name: 'Zucchini' }, { name: 'bananer' }, { name: 'Örter' }];
  assert.deepEqual(ordered(terms, 'name', { language: 'sv-SE' }).map((term) => term.name), ['apelsiner', 'bananer', 'Bananer', 'Zucchini', 'Äpplen', 'Örter'], 'Swedish puts å, ä and ö last, and lowercase first');
  assert.deepEqual(ordered(terms, 'name', { language: 'en-GB' }).map((term) => term.name).slice(0, 2), ['apelsiner', 'Äpplen'], 'English among the a\'s');
  assert.throws(() => ordered(terms, 'name'), /language/);
});

test('builtInType tells a template which of the core\'s types a post is, and nothing of a type of the site\'s own', () => {
  const site = siteDescription({
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
      page: { collection: 'pages', address: '/pages/{slug}/', elements: ['paragraph'] },
      canvas: { collection: 'landings', address: '/landing/{slug}/', elements: ['paragraph'] },
      event: { label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', elements: ['paragraph'] },
    },
  });
  const typeOf = (collection) => builtInType({ id: 'one', collection, data: {} }, { site });
  assert.deepEqual(['articles', 'pages', 'landings', 'events', 'categories'].map(typeOf), ['article', 'page', 'canvas', null, null]);
  assert.equal(builtInType(null, { site }), null, 'a page of the site\'s own, which shows no entry');
  assert.equal(builtInType(undefined, { site }), null);
});

test('authorsOf gives a template an article\'s authors in the order its editor gave them, each with its page where the authors have pages', async () => {
  const declared = {
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
      event: { label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', elements: ['paragraph'], fields: { hosts: { taxonomy: 'hosts' } } },
    },
    taxonomies: { hosts: { label: 'Host', plural: 'Hosts', collection: 'hosts' } },
  };
  const terms = {
    'authors/ines-holm': { id: 'ines-holm', collection: 'authors', data: { name: 'Ines Holm', description: 'Writes of the northern harbours.' } },
    'authors/rafael-berg': { id: 'rafael-berg', collection: 'authors', data: { name: 'Rafael Berg' } },
    'hosts/rafael-berg': { id: 'rafael-berg', collection: 'hosts', data: { name: 'Rafael Berg' } },
  };
  const getEntries = async (references) => references.map(({ collection, id }) => terms[`${collection}/${id}`]);
  const article = { id: 'hidden-meadows', collection: 'articles', data: { authors: [{ collection: 'authors', id: 'rafael-berg' }, { collection: 'authors', id: 'ines-holm' }] } };
  const shown = async (site, entry = article) => (await authorsOf(entry, { site, getEntries })).map(({ name, url }) => ({ name, url }));

  assert.deepEqual(await shown(siteDescription(declared)), [{ name: 'Rafael Berg', url: null }, { name: 'Ines Holm', url: null }]);
  const paged = siteDescription({ ...declared, taxonomies: { ...declared.taxonomies, authors: { address: '/authors/{slug}/' } } });
  assert.deepEqual(await shown(paged), [{ name: 'Rafael Berg', url: '/authors/rafael-berg/' }, { name: 'Ines Holm', url: '/authors/ines-holm/' }]);
  assert.equal((await authorsOf(article, { site: paged, getEntries }))[1].entry.data.description, 'Writes of the northern harbours.', 'with its term, its biography among its data');
  assert.deepEqual(await shown(paged, { id: 'spring-fair', collection: 'events', data: { hosts: [{ collection: 'hosts', id: 'rafael-berg' }] } }), [], 'a type of the site\'s own has no authors');
  assert.deepEqual(await shown(paged, { ...article, data: { authors: [] } }), []);
});

describe('metaLine writes a post\'s meta line by its type\'s format in the page\'s language', () => {
  const declared = {
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
      event: { label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', elements: ['paragraph'], fields: { date: {} } },
    },
  };
  const terms = {
    'authors/ines-holm': { id: 'ines-holm', collection: 'authors', data: { name: 'Ines Holm' } },
    'authors/rafael-berg': { id: 'rafael-berg', collection: 'authors', data: { name: 'Rafael Berg' } },
    'categories/news': { id: 'news', collection: 'categories', data: { name: 'News' } },
    'categories/local': { id: 'local', collection: 'categories', data: { name: 'Local news', parent: { collection: 'categories', id: 'news' } } },
  };
  const getEntry = async ({ collection, id }) => terms[`${collection}/${id}`];
  const getEntries = async (references) => Promise.all(references.map(getEntry));
  const getCollection = async (collection) => Object.values(terms).filter((term) => term.collection === collection);
  const article = (data = {}) => ({
    id: 'harbour-lights',
    collection: 'articles',
    data: {
      date: new Date('2026-10-01T08:00:00Z'),
      modified: new Date('2026-10-02T09:00:00Z'),
      authors: [{ collection: 'authors', id: 'rafael-berg' }, { collection: 'authors', id: 'ines-holm' }],
      category: [{ collection: 'categories', id: 'local' }],
      topics: [],
      ...data,
    },
  });
  const formats = (article, event) => ({ metaLine: { types: { article: { format: article }, ...(event ? { event: { format: event } } : {}) } } });
  // The line as a visitor reads it, each link and each moment marked.
  const read = (pieces) => pieces.map(({ text, url, datetime }) => (url ? `[${text}](${url})` : datetime ? `<${text}|${datetime}>` : text)).join('');
  const line = async (format, { entry = article(), site = siteDescription(declared), language = 'en-GB', event } = {}) => read(await metaLine(entry, language, { site, settings: formats(format, event), getEntries, getEntry, getCollection }));

  test('gives the format\'s words, the date in the page\'s language, the category\'s name and the authors after each other, by a comma', async () => {
    assert.equal(await line('Published on {date} in {category} by {authors}'), 'Published on <1 October 2026|2026-10-01T08:00:00.000Z> in Local news by Rafael Berg, Ines Holm');
    assert.equal(await line('Av {authors}, publicerad den {date} under {category}', { language: 'sv-SE' }), 'Av Rafael Berg, Ines Holm, publicerad den <1 oktober 2026|2026-10-01T08:00:00.000Z> under Local news');
  });

  test('links each author and the category to its page where its taxonomy declares an address, the category by its path', async () => {
    const site = siteDescription({ ...declared, taxonomies: { authors: { address: '/authors/{slug}/' }, category: { address: '/category/{path}/' } } });
    assert.equal(await line('{category}: {authors}', { site }), '[Local news](/category/news/local/): [Rafael Berg](/authors/rafael-berg/), [Ines Holm](/authors/ines-holm/)');
    const bySlug = siteDescription({ ...declared, taxonomies: { category: { address: '/topic/{slug}/' } } });
    assert.equal(await line('{category}', { site: bySlug }), '[Local news](/topic/local/)');
  });

  // An article without a category, without authors, or without both.
  const without = { category: article({ category: [] }), authors: article({ authors: [] }), both: article({ category: [], authors: [] }) };
  const date = '<1 October 2026|2026-10-01T08:00:00.000Z>';
  const datum = '<1 oktober 2026|2026-10-01T08:00:00.000Z>';

  test('drops a variable without a value with the words before it, back to the variable or the punctuation mark before them', async () => {
    const english = 'Published on {date} in {category} by {authors}';
    assert.equal(await line(english, { entry: without.category }), `Published on ${date} by Rafael Berg, Ines Holm`);
    assert.equal(await line(english, { entry: without.authors }), `Published on ${date} in Local news`);
    assert.equal(await line(english, { entry: without.both }), `Published on ${date}`);
    const swedish = 'Av {authors}, publicerad den {date} under {category}';
    assert.equal(await line(swedish, { entry: without.category, language: 'sv-SE' }), `Av Rafael Berg, Ines Holm, publicerad den ${datum}`);
    assert.equal(await line('Written by {authors}. Published {date} in {category}.', { entry: without.category }), `Written by Rafael Berg, Ines Holm. Published ${date}.`);
  });

  test('drops what punctuation is left at the start or the end of the line, or doubled, and begins a line whose start dropped with a capital', async () => {
    assert.equal(await line('Av {authors}, publicerad den {date} under {category}', { entry: without.authors, language: 'sv-SE' }), `Publicerad den ${datum} under Local news`);
    assert.equal(await line('Written by {authors}. Published {date} in {category}.', { entry: without.authors }), `Published ${date} in Local news.`);
    assert.equal(await line('{authors} · {date} · {category}', { entry: without.both }), date);
    assert.equal(await line('{date} · {authors} · {category}', { entry: without.authors }), `${date} · Local news`);
    assert.equal(await line('{date} · {authors} · {category}', { entry: without.category }), `${date} · Rafael Berg, Ines Holm`);
    assert.equal(await line('Published {date}, in {category}, by {authors}', { entry: without.category }), `Published ${date}, by Rafael Berg, Ines Holm`);
    assert.equal(await line('Published {date} ({category}).', { entry: without.category }), `Published ${date}.`);
    assert.equal(await line('{category}: {authors}', { entry: without.both }), '');
    assert.deepEqual(await metaLine(without.both, 'en-GB', { site: siteDescription(declared), settings: formats('By {authors}'), getEntries, getEntry, getCollection }), [], 'nothing to draw');
  });

  // A site's settings are by language, each language's entry by its tag on a site in several.
  test('reads the settings of the language it is given by its tag, and of the main language for a tag of no language of the site\'s', async () => {
    const { language: _, ...inOne } = declared;
    const several = siteDescription({ ...inOne, languages: ['en_GB', 'sv_SE'] });
    const settings = { 'settings/en-GB': { data: formats('By {authors}') }, 'settings/sv-SE': { data: formats('Av {authors}') }, 'settings/site': { data: formats('Written by {authors}') } };
    const reading = async ({ collection, id }) => settings[`${collection}/${id}`] ?? getEntry({ collection, id });
    const shown = async (site, language) => read(await metaLine(article(), language, { site, getEntries, getEntry: reading, getCollection }));
    assert.equal(await shown(several, 'sv-SE'), 'Av Rafael Berg, Ines Holm');
    assert.equal(await shown(several, 'en-GB'), 'By Rafael Berg, Ines Holm');
    assert.equal(await shown(several, 'de-DE'), 'By Rafael Berg, Ines Holm', 'the main language\'s');
    assert.equal(await shown(siteDescription(declared), 'sv-SE'), 'Written by Rafael Berg, Ines Holm', 'the one entry of a site in one language');
  });

  test('says what it takes for the page\'s language, naming itself, when it is given none', async () => {
    await assert.rejects(metaLine(article(), undefined, { site: siteDescription(declared), settings: formats('By {authors}'), getEntries, getEntry, getCollection }), /metaLine\(\) take/);
    assert.throws(() => longDate(new Date(), undefined), /longDate\(\), ordered\(\) and metaLine\(\) take the page's language/);
  });

  test('gives the last change only where it is on a later day than the date', async () => {
    const format = 'Published {date}, updated {modified}';
    assert.equal(await line(format), `Published ${date}, updated <2 October 2026|2026-10-02T09:00:00.000Z>`);
    assert.equal(await line(format, { entry: article({ modified: new Date('2026-10-01T17:00:00Z') }) }), `Published ${date}`);
  });
});
