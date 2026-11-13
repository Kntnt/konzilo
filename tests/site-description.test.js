// The checker names every problem in a site description by its path, whatever
// the description holds: a value of the wrong kind is a problem to report, and
// never a crash that hides the others.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { SCHEMA_TYPES, siteDescription } from '../src/site-description.js';

for (const language of ['Swedish', 'sv-SE', '', 42, null, ['sv_SE']]) {
  test(`names a language of ${JSON.stringify(language)} as a problem, among the others`, () => {
    assert.throws(() => siteDescription({ language }), (error) => {
      assert.notEqual(error.name, 'ReferenceError', error.message);
      assert.match(error.message, new RegExp(`language: ${JSON.stringify(JSON.stringify(language)).slice(1, -1).replace(/[[\]]/g, '\\$&')} is not a locale`));
      assert.match(error.message, /types/);
      return true;
    });
  });
}

test('takes the domain the consent choice is kept on, in lowercase, never a public suffix or a shared domain, nor a name above one', () => {
  const types = { post: { label: 'Post', plural: 'Posts', collection: 'posts', address: '/{slug}/', elements: ['paragraph'] } };
  const read = (domain) => siteDescription({ language: 'en_GB', types, consent: { domain } }).consent;
  assert.deepEqual(read('example.com'), { departures: [], domain: 'example.com' });
  assert.equal(read('www.example.co.uk').domain, 'www.example.co.uk');
  assert.equal(siteDescription({ language: 'en_GB', types }).consent.domain, null);
  for (const [domain, problem] of [
    ['co.uk', /consent\.domain: co\.uk is a public suffix/],
    ['github.io', /consent\.domain: github\.io is a shared domain/],
    ['amazonaws.com', /consent\.domain: amazonaws\.com takes in s3\.amazonaws\.com, which is a shared domain/],
    ['Example.com', /consent\.domain: "Example\.com" must be a domain name in lowercase/],
    ['https://example.com', /consent\.domain: "https:\/\/example\.com" must be a domain name/],
    ['com', /consent\.domain: "com" must be a domain name/],
    [42, /consent\.domain: 42 must be a domain name/],
  ]) {
    assert.throws(() => read(domain), (error) => problem.test(error.message), JSON.stringify(domain));
  }
});

test('lets the pages show data: images unless security.dataImages is false, and refuses any other value', () => {
  const types = { post: { label: 'Post', plural: 'Posts', collection: 'posts', address: '/{slug}/', elements: ['paragraph'] } };
  const read = (security) => siteDescription({ language: 'en_GB', types, ...(security === undefined ? {} : { security }) }).security.dataImages;
  assert.equal(read(undefined), true);
  assert.equal(read({}), true);
  assert.equal(read({ dataImages: true }), true);
  assert.equal(read({ dataImages: false }), false);
  for (const given of ['false', 'no', 0, null, []]) {
    assert.throws(() => read({ dataImages: given }), /security\.dataImages: must be true or false/, JSON.stringify(given));
  }
});

test('takes the departure that counts without storage before consent with what Global Privacy Control and Do Not Track do, and no other departure with it', () => {
  const types = { post: { label: 'Post', plural: 'Posts', collection: 'posts', address: '/{slug}/', elements: ['paragraph'] } };
  const read = (departures) => siteDescription({ language: 'en_GB', types, consent: { departures } }).consent.departures;
  const departure = (privacySignals) => ({ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'Counted from the first page.', ...(privacySignals === undefined ? {} : { privacySignals }) });
  assert.deepEqual(read([departure('stop')]), [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'Counted from the first page.', privacySignals: 'stop' }]);
  assert.equal(read([departure('ignore')])[0].privacySignals, 'ignore');
  for (const given of [undefined, 'yes', true]) {
    assert.throws(() => read([departure(given)]), /consent\.departures\.1\.privacySignals: must say whether Global Privacy Control or Do Not Track stops the counting altogether, "stop", or not, "ignore"/, JSON.stringify(given));
  }
  assert.throws(() => read([{ departure: 'tagManagerBeforeConsent', reason: 'Tags wait.', privacySignals: 'stop' }]), /consent\.departures\.1\.privacySignals: is no part of this departure/);
});

describe('the interface language', () => {
  const types = { post: { label: 'Post', plural: 'Posts', collection: 'posts', address: '/{slug}/', elements: ['paragraph'] } };

  test('is the one the site declares, else its language where the core has a catalogue for it, else British English', () => {
    assert.equal(siteDescription({ language: 'sv_SE', interfaceLanguage: 'en', types }).interfaceLanguage, 'en');
    assert.equal(siteDescription({ language: 'en_GB', interfaceLanguage: 'sv', types }).interfaceLanguage, 'sv');
    assert.equal(siteDescription({ language: 'sv_SE', types }).interfaceLanguage, 'sv');
    assert.equal(siteDescription({ language: 'sv_FI', types }).interfaceLanguage, 'sv');
    assert.equal(siteDescription({ language: 'en_US', types }).interfaceLanguage, 'en');
    assert.equal(siteDescription({ language: 'fi', types }).interfaceLanguage, 'en');
    assert.equal(siteDescription({ types }).interfaceLanguage, 'en');
    assert.equal(siteDescription({ languages: ['sv_SE', 'en_GB'], types }).interfaceLanguage, 'sv');
  });

  for (const given of ['de', 'sv_SE', 'Swedish', '', 3, null]) {
    test(`refuses ${JSON.stringify(given)}, in plain words`, () => {
      assert.throws(
        () => siteDescription({ language: 'sv_SE', interfaceLanguage: given, types }),
        (error) => error.message.includes(`interfaceLanguage: ${JSON.stringify(given)} is not a language Konzilo's interface comes in, which are en (British English) and sv (Swedish)`),
      );
    });
  }
});

describe('a site\'s own label', () => {
  const declared = (label) => ({
    language: 'sv_SE',
    types: {
      story: {
        label,
        plural: { en: 'Articles', sv: 'Artiklar' },
        collection: 'articles',
        address: '/{slug}/',
        elements: ['paragraph'],
        fields: { size: { label: { en: 'Size', sv: 'Storlek' }, type: 'string', control: 'text' }, tags: { taxonomy: 'tag' } },
      },
    },
    taxonomies: { tag: { label: { en: 'Tag', sv: 'Etikett' }, plural: 'Etiketter', collection: 'tags' } },
    presentations: { list: { label: { en: 'List', sv: 'Lista' }, options: { date: { label: { en: 'Date', sv: 'Datum' }, type: 'boolean', control: 'toggle' } } } },
    menus: { main: { label: { en: 'Main menu', sv: 'Huvudmeny' } } },
    settings: { footer: { label: { en: 'Footer', sv: 'Sidfot' }, type: 'string', control: 'text' } },
    components: { card: { label: { en: 'Card', sv: 'Kort' }, form: 'container', body: 'blocks', attributes: { tone: { type: 'string', label: { en: 'Tone', sv: 'Ton' } } } } },
  });

  test('is one text for every language, or a text by interface language, British English among them', () => {
    const read = siteDescription(declared('Artikel'));
    assert.equal(read.types.story.label, 'Artikel');
    assert.deepEqual(read.types.story.plural, { en: 'Articles', sv: 'Artiklar' });
    assert.deepEqual(read.types.story.fields.find((field) => field.name === 'size').label, { en: 'Size', sv: 'Storlek' });
    assert.deepEqual(read.taxonomies.tag.label, { en: 'Tag', sv: 'Etikett' });
    assert.deepEqual(read.presentations.list.label, { en: 'List', sv: 'Lista' });
    assert.deepEqual(read.presentations.list.options[0].label, { en: 'Date', sv: 'Datum' });
    assert.deepEqual(read.menus.main.label, { en: 'Main menu', sv: 'Huvudmeny' });
    assert.deepEqual(read.settings[0].label, { en: 'Footer', sv: 'Sidfot' });
    assert.deepEqual(read.components.card.label, { en: 'Card', sv: 'Kort' });
    assert.deepEqual(read.components.card.attributes.tone.label, { en: 'Tone', sv: 'Ton' });
    assert.deepEqual(siteDescription(declared({ en: 'Article' })).types.story.label, { en: 'Article' });
  });

  for (const [label, problem] of [
    [{ sv: 'Artikel' }, 'types.story.label: gives no en, the British English a label by language needs'],
    [{ en: 'Article', de: 'Artikel' }, 'types.story.label.de: de is not a language Konzilo\'s interface comes in, which are en (British English) and sv (Swedish)'],
    [{ en: 'Article', sv: ' ' }, 'types.story.label.sv: must be a non-empty string'],
    [{}, 'types.story.label: gives no en, the British English a label by language needs'],
    [42, 'types.story.label: must be a non-empty string, or one by interface language, such as { "en": "Article", "sv": "Artikel" }'],
    [['Article'], 'types.story.label: must be a non-empty string, or one by interface language, such as { "en": "Article", "sv": "Artikel" }'],
  ]) {
    test(`refuses ${JSON.stringify(label)}, naming what is wrong`, () => {
      assert.throws(() => siteDescription(declared(label)), (error) => error.message.includes(problem));
    });
  }

  test('of a component is refused as any other, by its path', () => {
    const given = declared('Artikel');
    given.components.card.label = { sv: 'Kort' };
    given.components.card.attributes.tone.label = { en: 'Tone', fi: 'Sävy' };
    assert.throws(() => siteDescription(given), (error) => error.message.includes('components.card.label: gives no en')
      && error.message.includes('components.card.attributes.tone.label.fi: fi is not a language Konzilo\'s interface comes in'));
  });
});

describe('the built-in types', () => {
  const site = (types, more = {}) => ({ language: 'en_GB', images: { smallestWidth: 400, displayWidth: 1280 }, types, ...more });
  const article = (more = {}) => ({ collection: 'articles', address: '/{slug}/', elements: ['paragraph'], ...more });
  const refused = (declared, problem) => assert.throws(() => siteDescription(declared), (error) => {
    assert.ok(error.message.includes(problem), `${error.message}\ndoes not say\n${problem}`);
    return true;
  });

  test('give an article named with its address and elements every article part, and the three taxonomies', () => {
    const read = siteDescription(site({ article: article() }));
    const { fields } = read.types.article;
    assert.equal(read.types.article.builtIn, 'article');
    assert.deepEqual(fields.map((field) => field.name), ['date', 'modified', 'image', 'breadcrumb', 'eyebrow', 'headline', 'subheadline', 'standfirst', 'authors', 'category', 'topics', 'teaser', 'seo']);
    assert.deepEqual(fields.filter((field) => field.required).map((field) => field.name), ['headline']);
    assert.deepEqual(fields.filter((field) => field.kind === 'terms').map((field) => [field.name, field.taxonomy.name, field.most]), [['authors', 'authors', null], ['category', 'category', 1], ['topics', 'topics', null]]);
    assert.deepEqual(Object.values(read.taxonomies).map(({ name, builtIn, collection, hierarchical, address, feed }) => ({ name, builtIn, collection, hierarchical, address, feed })), [
      { name: 'authors', builtIn: 'authors', collection: 'authors', hierarchical: false, address: null, feed: null },
      { name: 'category', builtIn: 'category', collection: 'categories', hierarchical: true, address: null, feed: null },
      { name: 'topics', builtIn: 'topics', collection: 'topics', hierarchical: false, address: null, feed: null },
    ]);
  });

  test('give a page and a canvas the date and the last change, the name in breadcrumbs, the teaser and the search and sharing fields, in the article\'s order', () => {
    const read = siteDescription(site({ page: { collection: 'pages', hierarchical: true, address: '/{path}/', elements: ['paragraph'] }, canvas: { collection: 'canvases', address: '/landing/{slug}/', elements: ['paragraph'] } }));
    assert.equal(read.types.page.builtIn, 'page');
    assert.equal(read.types.page.hierarchical, true);
    assert.deepEqual(read.types.page.fields.map((field) => field.name), ['date', 'modified', 'breadcrumb', 'teaser', 'seo']);
    assert.equal(read.types.canvas.builtIn, 'canvas');
    assert.deepEqual(read.types.canvas.fields.map((field) => field.name), ['date', 'modified', 'breadcrumb', 'teaser', 'seo']);
    assert.deepEqual(read.types.page.fields.filter((field) => field.required).map((field) => field.name), [], 'each optional to fill in');
    // A feed lists posts by their date, which a page and a canvas now have.
    const fed = siteDescription(site({ page: { collection: 'pages', address: '/pages/{slug}/', feed: '/pages/feed/', elements: ['paragraph'] }, canvas: { collection: 'canvases', address: '/landing/{slug}/', feed: '/landing/feed/', elements: ['paragraph'] } }));
    assert.deepEqual([fed.types.page.feed, fed.types.canvas.feed], ['/pages/feed/', '/landing/feed/']);
    assert.deepEqual(read.taxonomies, {}, 'the taxonomies come with the article alone');
  });

  test('keep a site\'s own types and taxonomies as its own', () => {
    const read = siteDescription(site({ event: article({ label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', fields: { date: {}, regions: { taxonomy: 'region' } } }) }, { taxonomies: { region: { label: 'Region', plural: 'Regions', collection: 'regions' } } }));
    assert.equal(read.types.event.builtIn, null);
    assert.equal(read.taxonomies.region.builtIn, null);
    assert.deepEqual(read.types.event.fields.map((field) => field.name), ['date', 'regions']);
  });

  test('take a site\'s own fields, before the search and sharing fields', () => {
    const read = siteDescription(site({
      article: article({ fields: { readingTime: { label: 'Reading time', type: 'integer', control: 'number' }, regions: { taxonomy: 'region' } } }),
      page: { collection: 'pages', address: '/pages/{slug}/', elements: ['paragraph'], fields: { lead: { label: 'Lead', type: 'string', control: 'textarea' } } },
    }, { taxonomies: { region: { label: 'Region', plural: 'Regions', collection: 'regions' } } }));
    assert.deepEqual(read.types.article.fields.map((field) => field.name).slice(-4), ['teaser', 'readingTime', 'regions', 'seo']);
    assert.equal(read.types.article.fields.find((field) => field.name === 'readingTime').kind, 'meta');
    assert.deepEqual(read.types.page.fields.map((field) => field.name), ['date', 'modified', 'breadcrumb', 'teaser', 'lead', 'seo']);
  });

  test('take their labels from the catalogues, and a site\'s own label in place of them', () => {
    const read = siteDescription(site({ article: article(), page: { collection: 'pages', address: '/pages/{slug}/', elements: ['paragraph'] }, canvas: { collection: 'canvases', address: '/landing/{slug}/', elements: ['paragraph'] } }));
    assert.deepEqual([read.types.article.label, read.types.article.plural], [{ en: 'Article', sv: 'Artikel' }, { en: 'Articles', sv: 'Artiklar' }]);
    assert.deepEqual([read.types.page.label, read.types.page.plural], [{ en: 'Page', sv: 'Sida' }, { en: 'Pages', sv: 'Sidor' }]);
    assert.deepEqual([read.types.canvas.label, read.types.canvas.plural], [{ en: 'Canvas', sv: 'Arbetsyta' }, { en: 'Canvases', sv: 'Arbetsytor' }]);
    assert.deepEqual(Object.values(read.taxonomies).map((taxonomy) => [taxonomy.label.en, taxonomy.plural.sv]), [['Author', 'Författare'], ['Category', 'Kategorier'], ['Topic', 'Ämnen']]);
    const own = siteDescription(site({ article: article({ label: 'Magazine', plural: { en: 'Magazines', sv: 'Magasin' } }) }, { taxonomies: { topics: { label: 'Tag', plural: 'Tags' } } }));
    assert.equal(own.types.article.label, 'Magazine');
    assert.deepEqual(own.types.article.plural, { en: 'Magazines', sv: 'Magasin' });
    assert.deepEqual([own.taxonomies.topics.label, own.taxonomies.topics.plural], ['Tag', 'Tags']);
    refused(site({ article: article({ label: { sv: 'Magasin' } }) }), 'types.article.label: gives no en');
  });

  test('let a site give each built-in taxonomy an address and a feed, and nothing of its shape, and leave their names to a site without the article', () => {
    const read = siteDescription(site({ article: article({ feed: '/feed/', fields: {} }) }, { taxonomies: { authors: { address: '/authors/{slug}/' }, category: { feed: '/category/{slug}/feed/' } } }));
    assert.equal(read.taxonomies.authors.address, '/authors/{slug}/');
    assert.equal(read.taxonomies.category.feed, '/category/{slug}/feed/');
    assert.equal(read.taxonomies.topics.address, null);
    refused(site({ article: article() }, { taxonomies: { category: { hierarchical: false } } }), 'taxonomies.category.hierarchical: the shape of the built-in taxonomy category is the core\'s; a site gives it an address, a feed and a label of its own, if any');
    refused(site({ article: article() }, { taxonomies: { topics: { collection: 'tags' } } }), 'taxonomies.topics.collection: the shape of the built-in taxonomy topics is the core\'s');
    const without = siteDescription(site({ event: article({ label: 'Event', plural: 'Events', fields: { date: {}, topics: { taxonomy: 'topics' } } }) }, { taxonomies: { topics: { label: 'Topic', plural: 'Topics', collection: 'subjects' } } }));
    assert.deepEqual([without.taxonomies.topics.builtIn, without.taxonomies.topics.collection], [null, 'subjects'], 'without the article, the name is the site\'s own');
  });

  test('refuse a core field redeclared or left out, in plain words', () => {
    refused(site({ article: article({ fields: { headline: { required: true } } }) }), 'types.article.fields.headline: is one of the core\'s fields of the built-in article, which has it without being declared; leave it out of fields');
    refused(site({ article: article({ fields: { category: { taxonomy: 'category' } } }) }), 'types.article.fields.category: is one of the core\'s fields of the built-in article');
    refused(site({ article: article({ fields: { subheadline: false } }) }), 'types.article.fields.subheadline: is one of the core\'s fields of the built-in article, which every article has; a site cannot leave it out');
    refused(site({ page: { collection: 'pages', address: '/{slug}/', elements: ['paragraph'], fields: { seo: null } } }), 'types.page.fields.seo: is one of the core\'s fields of the built-in page, which every page has; a site cannot leave it out');
    refused(site({ page: { collection: 'pages', address: '/{slug}/', elements: ['paragraph'], fields: { date: {} } } }), 'types.page.fields.date: is one of the core\'s fields of the built-in page, which has it without being declared; leave it out of fields');
    refused(site({ page: { collection: 'pages', address: '/{slug}/', elements: ['paragraph'], fields: { standfirst: {} } } }), 'types.page.fields.standfirst: names a field of the core\'s, which the built-in page does not take; give a field of the site\'s own another name');
    refused(site({ article: article({ fields: { excerpt: {} } }) }), 'types.article.fields.excerpt: names a field of the core\'s, which the built-in article does not take');
    refused(site({ article: article({ fields: { tags: { taxonomy: 'topics' } } }) }), 'types.article.fields.tags: a second field for the taxonomy topics');
  });

  // A type offers the structured data types its posts may have, its default first.
  test('offer an article\'s kinds of article, a page and a canvas every structured data type, and a site\'s own type what it declares, else what a page offers', () => {
    const read = siteDescription(site({
      article: article(),
      page: { collection: 'pages', address: '/pages/{slug}/', elements: ['paragraph'] },
      canvas: { collection: 'canvases', address: '/landing/{slug}/', elements: ['paragraph'] },
      event: article({ label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', structuredDataTypes: ['BlogPosting', 'Article'] }),
      place: article({ label: 'Place', plural: 'Places', collection: 'places', address: '/places/{slug}/' }),
    }));
    const every = ['WebPage', 'AboutPage', 'ContactPage', 'CollectionPage', 'Article', 'BlogPosting', 'NewsArticle'];
    assert.deepEqual(read.types.article.structuredDataTypes, ['Article', 'BlogPosting', 'NewsArticle']);
    assert.deepEqual(read.types.page.structuredDataTypes, every);
    assert.deepEqual(read.types.canvas.structuredDataTypes, every);
    assert.deepEqual(read.types.event.structuredDataTypes, ['BlogPosting', 'Article']);
    assert.deepEqual(read.types.place.structuredDataTypes, every);
    assert.deepEqual([...every].sort(), [...SCHEMA_TYPES].sort(), 'every one the rule data knows');
  });

  test('refuse a list of structured data types on a built-in type, and one that is empty, repeats a type or names one the core does not know', () => {
    refused(site({ article: article({ structuredDataTypes: ['Article'] }) }), 'types.article.structuredDataTypes: the built-in article offers the core\'s structured data types; leave it out');
    const own = (structuredDataTypes) => site({ event: article({ label: 'Event', plural: 'Events', structuredDataTypes }) });
    for (const given of [[], 'Article', ['Article', 'Article'], ['Event'], [42]]) {
      refused(own(given), 'types.event.structuredDataTypes: must list the structured data types the type offers, each once, its default first, among Article, BlogPosting, NewsArticle, WebPage, AboutPage, ContactPage and CollectionPage');
    }
  });

  test('let only a page and a canvas be hierarchical', () => {
    refused(site({ article: article({ hierarchical: true, address: '/{path}/' }) }), 'types.article.hierarchical: an article has no parent; only a page and a canvas may be hierarchical');
    assert.equal(siteDescription(site({ canvas: { collection: 'canvases', hierarchical: true, address: '/{path}/', elements: ['paragraph'] } })).types.canvas.hierarchical, true);
  });

  // The editor keeps a site's own fields on a built-in type in a group of their own, in every form
  // of a built-in type a field of that name is in, and a term is a relation, which that group cannot
  // hold. A type of the site's own has its files read apart, so its fields are its own (ADR 0071).
  test('refuse a term on a built-in type named as a field of the site\'s own on a built-in type', () => {
    const regions = { taxonomies: { region: { label: 'Region', plural: 'Regions', collection: 'regions' } } };
    const rating = { label: 'Rating', type: 'integer', control: 'number' };
    refused(site({ article: article({ fields: { rating } }), page: { collection: 'pages', address: '/pages/{slug}/', elements: ['paragraph'], fields: { rating: { taxonomy: 'region' } } } }, regions), 'types.page.fields.rating: the built-in article has a field of the site\'s own by this name, which the editor keeps among the site\'s own fields on every built-in type; give this term another name');
    const read = siteDescription(site({ article: article({ fields: { rating } }), event: article({ label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', fields: { rating: { taxonomy: 'region' } } }) }, regions));
    assert.equal(read.types.event.fields.find((field) => field.name === 'rating').kind, 'terms', 'a term of that name on a type of the site\'s own is taken');
    const value = siteDescription(site({ article: article({ fields: { rating } }), event: article({ label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', fields: { rating: { label: 'Stars', type: 'integer', control: 'number' } } }) }, regions));
    assert.equal(value.types.event.fields.find((field) => field.name === 'rating').label, 'Stars', 'and so is a value');
  });
});

// A type's structured data type in the settings offers each type its own, so its declaration
// lists every one the core knows, and has its default from the type.
test('refuses a structured data type in the settings groups declared elsewhere than by type, with a default of its own, or without every type the core knows', () => {
  const site = { language: 'en_GB', types: { post: { label: 'Post', plural: 'Posts', collection: 'posts', address: '/{slug}/', elements: ['paragraph'] } } };
  const schema = { type: 'string', control: 'select', options: ['Article', 'BlogPosting', 'NewsArticle', 'WebPage', 'AboutPage', 'ContactPage', 'CollectionPage'], structuredDataTypes: true };
  const refused = (settings, problem) => assert.throws(() => siteDescription(site, { search: settings }), (error) => error.message.includes(problem) || assert.fail(error.message));
  assert.equal(siteDescription(site, { search: { types: { settings: { schema } } } }).groups[0].types[0].settings[0].default, 'WebPage');
  refused({ types: { settings: { schema: { ...schema, default: 'Article' } } } }, 'search.types.settings.schema.structuredDataTypes: a type\'s structured data type has its type\'s default, the first it offers, and declares none');
  refused({ types: { settings: { schema: { ...schema, options: ['Article', 'WebPage'] } } } }, 'search.types.settings.schema.structuredDataTypes: only a select of every structured data type the core knows is a type\'s structured data type');
  refused({ settings: { schema } }, 'search.settings.schema.structuredDataTypes: only a setting of a part per post type is its type\'s structured data type');
});

describe('the settings groups\' texts', () => {
  const types = { post: { label: 'Post', plural: 'Posts', collection: 'posts', address: '/{slug}/', elements: ['paragraph'] } };
  const site = { language: 'en_GB', types };
  const feeds = { settings: { posts: { type: 'integer', control: 'number', min: 1, default: 10 } } };

  test('are the catalogues\', by where each is declared, so that a setting needs nothing else to show', () => {
    const [group] = siteDescription(site, { feeds }).groups;
    assert.deepEqual(group.label, { en: 'Feeds', sv: 'Flöden' });
    assert.deepEqual(group.settings[0].label, { en: 'Posts in each feed', sv: 'Inlägg i varje flöde' });
    assert.equal(group.settings[0].help, undefined);
  });

  test('refuses a setting whose texts the catalogues lack, naming the text it needs', () => {
    const halfLife = { type: 'integer', control: 'number', min: 1, default: 90 };
    assert.throws(
      () => siteDescription(site, { feeds: { settings: { ...feeds.settings, halfLife } } }),
      (error) => error.message.includes('feeds.settings.halfLife: the core\'s catalogues have no text settings.feeds.halfLife.label, which each must give'),
    );
  });

  test('refuses a text written into the declaration, naming where in the catalogues it belongs', () => {
    assert.throws(
      () => siteDescription(site, { feeds: { ...feeds, label: 'Feeds' } }),
      (error) => error.message.includes('feeds.label: is a text an editor reads, which the core\'s catalogues hold, as settings.feeds.label'),
    );
    assert.throws(
      () => siteDescription(site, { feeds: { settings: { posts: { ...feeds.settings.posts, help: 'How many.' } } } }),
      (error) => error.message.includes('feeds.settings.posts.help: is a text an editor reads, which the core\'s catalogues hold, as settings.feeds.posts.help'),
    );
  });
});

describe('a form\'s button text and what an editor may change', () => {
  const types = { post: { label: 'Post', plural: 'Posts', collection: 'posts', address: '/{slug}/', elements: ['paragraph', 'form'] } };
  const fields = [{ name: 'email', label: 'Email', kind: 'email', required: true }];
  const one = (form) => siteDescription({ language: 'en_GB', types, forms: { contact: { label: 'Contact us', fields, ...form } } }).forms.contact;
  const several = (form) => siteDescription({ languages: ['sv_SE', 'en_GB'], types, forms: { contact: { label: 'Contact us', fields, ...form } } }).forms.contact;

  test('has no text of its own and lets an editor change nothing where it declares neither', () => {
    const { button, editable } = one({});
    assert.deepEqual([button, editable], [null, []]);
  });

  test('takes one text for its button, or on a site in several languages one by locale, and the texts an editor may change, its button\'s', () => {
    assert.deepEqual([one({ button: 'Book the assessment', editable: ['button'] }).button, one({ button: 'Book the assessment', editable: ['button'] }).editable], ['Book the assessment', ['button']]);
    assert.equal(several({ button: 'Boka' }).button, 'Boka');
    assert.deepEqual(several({ button: { sv_SE: 'Boka bedömningen', en_GB: 'Book the assessment' } }).button, { sv_SE: 'Boka bedömningen', en_GB: 'Book the assessment' });
    assert.deepEqual(one({ editable: ['button'] }).editable, ['button']);
  });

  test('refuses a button text that is no text, one by locale on a site in one language or short of a language, and an editor\'s text that is not yet the editor\'s', () => {
    for (const [build, form, problem] of [
      [one, { button: '' }, /forms\.contact\.button: must be a non-empty string/],
      [one, { button: 42 }, /forms\.contact\.button: must be a non-empty string/],
      [one, { button: { en_GB: 'Send' } }, /forms\.contact\.button: only a site with several languages gives a form's button a text in each language; give it one text/],
      [several, { button: { sv_SE: 'Boka' } }, /forms\.contact\.button: must give a text in each of the site's languages, and gives none in en_GB/],
      [several, { button: { sv_SE: 'Boka', en_GB: 'Book', de_DE: 'Buchen' } }, /forms\.contact\.button\.de_DE: is not one of the site's languages/],
      [several, { button: { sv_SE: 'Boka', en_GB: '' } }, /forms\.contact\.button\.en_GB: must be a non-empty string/],
      [one, { editable: 'button' }, /forms\.contact\.editable: must list the texts an editor may change where the form is placed, of button/],
      [one, { editable: ['button', 'button'] }, /forms\.contact\.editable: must list the texts an editor may change where the form is placed, of button, each once/],
      [one, { editable: ['placeholder'] }, /forms\.contact\.editable: "placeholder" is no text an editor may change where the form is placed; an editor may change its button/],
      [one, { editable: ['label'] }, /forms\.contact\.editable: "label" is no text an editor may change/],
    ]) {
      assert.throws(() => build(form), (error) => problem.test(error.message), JSON.stringify(form));
    }
  });
});

describe('a form field\'s label', () => {
  const types = { post: { label: 'Post', plural: 'Posts', collection: 'posts', address: '/{slug}/', elements: ['paragraph', 'form'] } };
  const read = (fields) => siteDescription({ language: 'en_GB', types, forms: { contact: { label: 'Contact us', fields } } }).forms.contact.fields;

  test('may hold links, written as Markdown links, and gives its words without them and its parts with them', () => {
    const [privacy, reach, name] = read([
      { name: 'privacy', label: 'I have read the [privacy policy](/privacy-policy/) and the [terms](https://example.com/terms)', kind: 'acceptance' },
      { name: 'reach', label: 'Reach me [by mail](mailto:hello@example.com) or [phone](tel:+4612345)', kind: 'radio', options: ['Email', 'Phone'] },
      { name: 'name', label: 'Your *name* [here]', kind: 'text' },
    ]);
    assert.equal(privacy.label, 'I have read the privacy policy and the terms');
    assert.deepEqual(privacy.labelParts, [
      'I have read the ',
      { href: '/privacy-policy/', text: 'privacy policy' },
      ' and the ',
      { href: 'https://example.com/terms', text: 'terms' },
    ]);
    assert.equal(reach.label, 'Reach me by mail or phone');
    assert.deepEqual(reach.labelParts, ['Reach me ', { href: 'mailto:hello@example.com', text: 'by mail' }, ' or ', { href: 'tel:+4612345', text: 'phone' }]);
    // Nothing else of Markdown: the rest is words as written.
    assert.equal(name.label, 'Your *name* [here]');
    assert.deepEqual(name.labelParts, ['Your *name* [here]']);
  });

  test('refuses a link to an address a menu\'s entry may not have, and a link without words', () => {
    for (const [label, problem] of [
      ['I accept the [policy](javascript:void)', /forms\.contact\.fields\.1\.label: links to "javascript:void", which is no address a link in a label may have: a path of the site's own, such as \/privacy-policy\/, or one that starts with https:\/\/, http:\/\/, mailto: or tel:/],
      ['I accept the [policy](//elsewhere.example/policy/)', /forms\.contact\.fields\.1\.label: links to "\/\/elsewhere\.example\/policy\/"/],
      ['I accept the [policy](privacy-policy)', /forms\.contact\.fields\.1\.label: links to "privacy-policy"/],
      ['I accept the [policy](/privacy policy/)', /forms\.contact\.fields\.1\.label: links to "\/privacy policy\/"/],
      ['I accept the [policy]()', /forms\.contact\.fields\.1\.label: links to ""/],
      ['I accept the [ ](/privacy-policy/)', /forms\.contact\.fields\.1\.label: links to \/privacy-policy\/ with no words/],
    ]) {
      assert.throws(() => read([{ name: 'privacy', label, kind: 'acceptance' }]), (error) => problem.test(error.message), label);
    }
  });
});
