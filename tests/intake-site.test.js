// What the intake derives from the whole set, for one language and several: settings with
// their defaults, resolved menus and legal pages, terms, the service registry, the page for
// addresses not found, and what is an Admin's alone.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { cmsConfig } from '../src/cms/config.js';
import { demoSource, sourceFrom } from '../src/demo-source.js';
import { deletion, intake } from '../src/intake/index.js';
import { siteDescription } from '../src/site-description.js';
import { namedImages, NOW, run, sourcePost, written } from './lib/intake.js';

const site = {
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    story: {
      label: 'Article',
      plural: 'Articles',
      collection: 'articles',
      address: '/{slug}/',
      elements: ['paragraph', 'embed'],
      fields: { categories: { taxonomy: 'category' }, tags: { taxonomy: 'tag' }, image: {}, seo: {}, featured: { label: 'Featured', type: 'boolean', control: 'toggle' }, eventDay: { label: 'Day', type: 'date', control: 'date' }, rating: { label: 'Rating', type: 'number', control: 'number' } },
    },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph', 'image'] },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', elements: ['paragraph'] },
  },
  taxonomies: {
    category: { label: 'Category', plural: 'Categories', collection: 'categories', hierarchical: true, address: '/category/{path}/' },
    tag: { label: 'Tag', plural: 'Tags', collection: 'tags' },
  },
  menus: { main: { label: 'Main' }, footer: { label: 'Footer' } },
  settings: {
    footerText: { label: 'Footer', type: 'string', control: 'textarea' },
    seats: { label: 'Seats', type: 'integer', control: 'number' },
    price: { label: 'Price', type: 'number', control: 'number' },
    opening: { label: 'Opening', type: 'date', control: 'date' },
    offer: { label: 'Offer', type: 'boolean', control: 'toggle' },
    size: { label: 'Size', type: 'string', control: 'select', options: ['small', 'large'] },
    contact: { label: 'Contact', type: 'post', control: 'post' },
    heroImage: { label: 'Hero', type: 'image', control: 'image' },
  },
  forms: { contact: { label: 'Contact', fields: [{ name: 'email', label: 'Email', kind: 'email', required: true }] } },
};

const article = (fields, body = 'Text.') => sourcePost({ title: 'An article', slug: 'an-article', status: 'published', ...fields }, body);
const page = (slug, fields = {}) => sourcePost({ title: `The ${slug}`, slug, status: 'published', ...fields }, 'Text.');
const settingsOf = (result, path = 'settings.json') => JSON.parse(written(result)[path]);

describe('the site settings', () => {
  const result = run({
    'settings.json': {
      title: 'The Lantern',
      logo: { src: '/media/logo-1111111111.svg', alt: 'A lantern' },
      icon: { src: '/media/site-icon-2222222222.svg' },
      footerText: '  Open every day.  ',
      seats: 40,
      price: '12.5',
      opening: '2026-05-01',
      offer: true,
      size: 'large',
      contact: 'contactpage0',
      heroImage: { src: '/media/hero-3333333333.jpg', alt: 'The harbour' },
      search: { separator: '|', publisher: { kind: 'Person' }, types: { story: { schema: 'NewsArticle' } } },
      ai: { types: { story: { markdown: false } } },
      legalPages: { privacyPolicy: 'contactpage0', cookiePolicy: 'contactpage0' },
    },
    'pages/contactpage0.md': page('contact'),
  }, site);
  const values = settingsOf(result);

  test('holds what source holds, typed, and in the order of the format', () => {
    assert.deepEqual(result.refusals, []);
    assert.deepEqual(Object.keys(values).slice(0, 11), ['title', 'logo', 'icon', 'footerText', 'seats', 'price', 'opening', 'offer', 'size', 'contact', 'heroImage']);
    assert.equal(values.footerText, 'Open every day.');
    assert.equal(values.price, 12.5);
    assert.equal(values.opening, '2026-05-01');
    assert.deepEqual(values.logo, { src: 'media/logo-1111111111.svg', alt: 'A lantern' });
    assert.deepEqual(values.icon, { src: 'media/site-icon-2222222222.svg' });
    assert.deepEqual(values.heroImage, { src: 'media/hero-image-3333333333.webp', alt: 'The harbour' });
    assert.equal(written(result)['media/hero-image-3333333333.webp'], 'the master of media/hero-3333333333.jpg');
  });

  test('a choice of a post is its title and current address', () => {
    assert.deepEqual(values.contact, { title: 'The contact', url: '/pages/contact/' });
    assert.deepEqual(values.legalPages, { privacyPolicy: { title: 'The contact', url: '/pages/contact/' }, cookiePolicy: { title: 'The contact', url: '/pages/contact/' } });
  });

  test('takes each default, and a value that differs over it', () => {
    assert.equal(values.search.separator, '|');
    assert.equal(values.search.publisher.kind, 'Person');
    assert.equal(values.search.publisher.name, 'The Lantern', 'the site\'s title by default');
    assert.equal(values.search.types.story.schema, 'NewsArticle');
    assert.equal(values.search.types.page.schema, 'WebPage');
    assert.equal(values.search.home.title, '{{ site.title }}');
    assert.equal(values.consent.bannerAccept, 'Accept all');
    assert.equal(values.forms.contact.confirmation, 'Thank you. Your message has been sent.');
    assert.equal(values.forms.contact.retention, undefined, 'what stays out of the published files');
    assert.equal(values.ai.types.story.markdown, false);
    assert.equal(values.ai.types.page.markdown, true);
    assert.equal(values.notFound, undefined);
  });

  test('a yes-or-no that requires another is off wherever that is off', () => {
    const on = run({ 'settings.json': { ai: { types: { story: { markdown: false, llmsFull: true } } } } }, site);
    assert.equal(settingsOf(on).ai.types.story.llmsFull, false);
  });

  test('writes in two spaces with one final newline', () => {
    assert.equal(written(result)['settings.json'], `${JSON.stringify(values, null, 2)}\n`);
  });

  test('is refused whole, naming each setting by its path, and keeps its last file', () => {
    const refused = run({ 'settings.json': { seats: 'many', search: { types: { story: { title: '{{ post.nope }}' } } }, tagManager: { container: 'nope' } } }, site);
    assert.deepEqual(refused.refusals.map((one) => one.setting), ['seats', 'search.types.story.title', 'tagManager.container']);
    assert.equal(refused.refusals[0].file, 'settings.json');
    assert.equal(refused.refusals[0].reason, 'the site cannot publish "many" as a whole number');
    assert.equal(written(refused)['settings.json'], undefined);
    assert.equal(written(refused)['consent.json'], undefined, 'and with it the registry, which takes its texts from it');
  });

  test('a post with no page now is left out, with a warning', () => {
    const none = run({ 'settings.json': { contact: 'contactpage0' }, 'pages/contactpage0.md': page('contact', { status: 'draft' }) }, site);
    assert.equal(settingsOf(none).contact, undefined);
    assert.match(none.warnings[0].reason, /"The contact", which has no page now/);
  });

  test('a choice of what no page can show is refused', () => {
    const notes = run({ 'settings.json': { contact: 'notenotenote' }, 'notes/notenotenote.md': sourcePost({ title: 'N', slug: 'n', status: 'published' }) }, site);
    assert.equal(notes.refusals[0].setting, 'contact');
  });
});

// A type's structured data type in the settings is one of those its type offers, its type's
// default where none is chosen.
describe('a type\'s structured data type', () => {
  const offering = {
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      article: { collection: 'articles', address: '/news/{slug}/', elements: ['paragraph'] },
      page: { collection: 'pages', address: '/{slug}/', elements: ['paragraph'] },
      event: { label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', elements: ['paragraph'], structuredDataTypes: ['BlogPosting', 'Article'] },
    },
  };

  test('is its type\'s default, the first it offers, where the settings choose none', () => {
    const result = run({ 'settings.json': {} }, offering);
    assert.deepEqual(result.refusals, []);
    const { types } = settingsOf(result).search;
    assert.deepEqual([types.article.schema, types.page.schema, types.event.schema], ['Article', 'WebPage', 'BlogPosting']);
  });

  test('takes one its type offers, and leaves out one it does not, with a warning, for its type\'s default', () => {
    const result = run({ 'settings.json': { search: { types: { article: { schema: 'WebPage' }, page: { schema: 'NewsArticle' }, event: { schema: 'ContactPage' } } } } }, offering);
    assert.deepEqual(result.refusals, []);
    const { types } = settingsOf(result).search;
    assert.deepEqual([types.article.schema, types.page.schema, types.event.schema], ['Article', 'NewsArticle', 'BlogPosting']);
    assert.deepEqual(result.warnings.filter(({ setting }) => setting?.endsWith('.schema')).map(({ setting, reason }) => [setting, reason]), [
      ['search.types.article.schema', 'articles cannot have "WebPage" as their structured data type, so it is left out and their default applies; choose one of Article, BlogPosting or NewsArticle'],
      ['search.types.event.schema', 'events cannot have "ContactPage" as their structured data type, so it is left out and their default applies; choose one of BlogPosting or Article'],
    ]);
  });

  test('is refused where the core knows no such type', () => {
    const refused = run({ 'settings.json': { search: { types: { article: { schema: 'Event' } } } } }, offering);
    assert.deepEqual(refused.refusals.map((one) => one.setting), ['search.types.article.schema']);
  });
});

// The title tag and the sharing title of a type with a teaser are what its teaser shows, so
// its templates for them would say nothing (ADR 0046).
describe('a type\'s metadata templates', () => {
  const site = {
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      article: { collection: 'articles', address: '/news/{slug}/', elements: ['paragraph'] },
      page: { collection: 'pages', address: '/{slug}/', elements: ['paragraph'] },
      canvas: { collection: 'canvases', address: '/start/{slug}/', elements: ['paragraph'] },
      story: { label: 'Story', plural: 'Stories', collection: 'stories', address: '/stories/{slug}/', elements: ['paragraph'], fields: { teaser: {}, seo: {} } },
      event: { label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', elements: ['paragraph'], fields: { seo: {} } },
    },
  };

  test('give a type with a teaser no title tag or sharing title, and every other type both', () => {
    const result = run({ 'settings.json': { search: { types: { page: { title: '{{ post.title }}' } } } } }, site);
    assert.deepEqual(result.refusals, []);
    const { types } = settingsOf(result).search;
    for (const name of ['article', 'page', 'canvas', 'story']) assert.deepEqual(Object.keys(types[name]), ['description', 'socialDescription', 'schema'], name);
    assert.deepEqual(Object.keys(types.event), ['title', 'description', 'socialTitle', 'socialDescription', 'schema']);
  });
});

describe('the meta line\'s format', () => {
  const builtIn = {
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
      page: { collection: 'pages', address: '/pages/{slug}/', elements: ['paragraph'] },
      canvas: { collection: 'canvases', address: '/start/{slug}/', elements: ['paragraph'] },
      event: { label: 'Event', plural: 'Events', collection: 'events', address: '/events/{slug}/', elements: ['paragraph'], fields: { date: {} } },
      note: { label: 'Note', plural: 'Notes', collection: 'notes', elements: ['paragraph'] },
    },
  };
  const formats = (settings, site = builtIn, path = 'settings.json') => {
    const result = run({ 'settings.json': settings }, site);
    assert.deepEqual(result.refusals, []);
    return settingsOf(result, path).metaLine.types;
  };

  // A canvas is its body alone, which no meta line goes with.
  test('is the article\'s by default, in the site\'s language, and no other type\'s, for each type with an address but the canvas', () => {
    assert.deepEqual(formats({}), { article: { format: 'Published on {date} in {category} by {authors}' }, page: {}, event: {} });
    assert.deepEqual(formats({}, { ...builtIn, language: 'sv_SE' }).article, { format: 'Av {authors}, publicerad den {date} under {category}' });
  });

  test('is what an Admin sets for a type, in each language on a site in several', () => {
    assert.deepEqual(formats({ metaLine: { types: { article: { format: 'By {authors}' }, event: { format: 'Held {date}' }, canvas: { format: 'Held {date}' } } } }), { article: { format: 'By {authors}' }, page: {}, event: { format: 'Held {date}' } }, 'a canvas\'s left as it is, unread');
    const { language: _, ...inOne } = builtIn;
    const several = { ...inOne, languages: ['sv_SE', 'en_GB'] };
    const settings = { metaLine: { types: { article: { format: { sv_SE: 'Av {authors}' } } } } };
    assert.deepEqual(formats(settings, several, 'settings/sv-SE.json').article, { format: 'Av {authors}' });
    assert.deepEqual(formats(settings, several, 'settings/en-GB.json').article, { format: 'Published on {date} in {category} by {authors}' }, 'the default in a language the Admin left');
  });

  // A page has a date and a last change, as every post of a built-in type has.
  test('takes a page\'s date and last change', () => {
    assert.deepEqual(formats({ metaLine: { types: { page: { format: 'Published {date}, updated {modified}' } } } }).page, { format: 'Published {date}, updated {modified}' });
  });

  test('is refused with a variable the type has not got, naming the setting and the variable', () => {
    const refused = run({ 'settings.json': { metaLine: { types: { article: { format: 'On {dat}' }, page: { format: 'In {category}' }, event: { format: 'Held {date}, updated {modified}' } } } } }, builtIn);
    assert.deepEqual(refused.refusals.map(({ setting, reason }) => [setting, reason]), [
      ['metaLine.types.article.format', 'the meta line has no variable {dat} for this type; use one the Site settings page lists'],
      ['metaLine.types.page.format', 'the meta line has no variable {category} for this type; use one the Site settings page lists'],
      ['metaLine.types.event.format', 'the meta line has no variable {modified} for this type; use one the Site settings page lists'],
    ]);
    assert.equal(written(refused)['settings.json'], undefined);
  });
});

describe('a menu', () => {
  const files = {
    'pages/contactpage0.md': page('contact'),
    'pages/childchild00.md': page('team', { parent: 'contactpage0' }),
    'pages/draftdraft00.md': page('draft', { status: 'draft' }),
    'categories/newsnewsnews.json': { name: 'News', slug: 'news' },
    'articles/aaaaaaaaaaaa.md': article({ categories: ['newsnewsnews'] }),
    'menus/main.json': {
      items: [
        { title: 'Home', url: '/' },
        { post: 'contactpage0', items: [{ title: 'Our team', post: 'childchild00' }] },
        { title: 'Elsewhere', items: [{ title: 'Shop', url: 'https://shop.example.com/' }] },
        { post: 'draftdraft00', items: [{ title: 'Under the draft', url: '/x/' }] },
        { post: 'newsnewsnews' },
      ],
    },
  };
  const result = run(files, site);

  test('leads each entry to its post\'s current address, labelled with its title unless it has its own', () => {
    assert.deepEqual(result.refusals, []);
    assert.deepEqual(JSON.parse(written(result)['menus/main.json']).items, [
      { title: 'Home', url: '/' },
      { title: 'The contact', url: '/pages/contact/', items: [{ title: 'Our team', url: '/pages/contact/team/' }] },
      { title: 'Elsewhere', items: [{ title: 'Shop', url: 'https://shop.example.com/' }] },
      { title: 'News', url: '/category/news/' },
    ]);
  });

  test('leaves out an entry whose post has no page now, with the entries under it, and warns', () => {
    assert.deepEqual(result.warnings.filter(({ entry }) => entry).map(({ file, entry }) => [file, entry]), [['menus/main.json', '4']]);
  });

  test('writes a declared menu with no file as a place without entries', () => {
    assert.equal(written(result)['menus/footer.json'], '{\n  "items": []\n}\n');
  });

  test('is refused whole, naming each entry by its place, and keeps its last file', () => {
    const bad = run({ 'menus/main.json': { items: [{ title: 'Fine', url: '/', items: [{ title: 'Bad', url: 'ftp://x/' }, { title: 'Worse', post: 'notenotenote' }] }] }, 'notes/notenotenote.md': sourcePost({ title: 'N', slug: 'n', status: 'published' }) }, site);
    assert.deepEqual(bad.refusals.map((one) => [one.file, one.entry]), [['menus/main.json', '1.1'], ['menus/main.json', '1.2']]);
    assert.equal(written(bad)['menus/main.json'], undefined);
    assert.ok(written(bad)['menus/footer.json']);
  });
});

describe('a term', () => {
  const result = run({
    'categories/newsnewsnews.json': { name: 'News', description: 'What happened.', slug: 'news' },
    'categories/locallocal00.json': { name: 'Local news', slug: 'local', parent: 'newsnewsnews' },
    'categories/unusedunused.json': { name: 'Unused', slug: 'unused' },
    'tags/harbourharbo.json': { name: 'Harbours' },
    'articles/aaaaaaaaaaaa.md': article({ categories: ['locallocal00'], tags: ['harbourharbo'] }),
  }, site);

  test('a file for each term a published post names, and each term above it', () => {
    assert.deepEqual(result.refusals, []);
    assert.equal(written(result)['categories/news.json'], '{\n  "name": "News",\n  "description": "What happened."\n}\n');
    assert.equal(written(result)['categories/local.json'], '{\n  "name": "Local news",\n  "parent": "news"\n}\n');
    assert.equal(written(result)['tags/harbours.json'], '{\n  "name": "Harbours"\n}\n', 'its slug made from its name');
    assert.equal(written(result)['categories/unused.json'], undefined);
    assert.match(written(result)['articles/an-article.md'], /\ncategories: \["local"\]\ntags: \["harbours"\]\n/);
  });
});

describe('a post\'s fields', () => {
  const result = run({
    'articles/aaaaaaaaaaaa.md': article({
      image: { src: '/media/barn-aaaaaaaaaa.jpg', alt: ' A barn ' },
      search: { title: 'A title', description: '', noindex: true, unknown: 'left' },
      sharing: { image: { src: '/media/share-bbbbbbbbbb.jpg', alt: 'Shared' } },
      featured: true,
      eventDay: '2026-11-05',
      rating: 4.5,
      otherAddresses: [{ address: '/z/', answer: '302' }, { address: '/a/', answer: 'show' }],
    }),
  }, site);

  test('are written in the order declared, each by its type', () => {
    assert.deepEqual(result.refusals, []);
    assert.equal(written(result)['articles/an-article.md'], `---
title: "An article"
categories: []
tags: []
image: {"src":"../media/an-article-aaaaaaaaaa.webp","alt":"A barn"}
seo: {"title":"A title","socialImage":"../media/an-article-bbbbbbbbbb.webp","socialImageAlt":"Shared","noindex":true}
featured: true
eventDay: 2026-11-05
rating: 4.5
otherAddresses: [{"address":"/a/","answer":"show"},{"address":"/z/","answer":302}]
---

Text.
`);
  });

  test('a canonical address under search is written among the search and sharing fields, as a browser sends it', () => {
    const given = run({ 'articles/aaaaaaaaaaaa.md': article({ search: { title: 'A title', canonical: ' https://Elsewhere.example.org/the-original?from=lantern ' } }) }, site);
    assert.deepEqual(given.refusals, []);
    assert.match(written(given)['articles/an-article.md'], /\nseo: \{"title":"A title","canonical":"https:\/\/elsewhere\.example\.org\/the-original\?from=lantern"\}\n/);
  });

  test('a yes-or-no is always there, and a value that is empty is left out', () => {
    const bare = written(run({ 'articles/aaaaaaaaaaaa.md': article({ rating: '', eventDay: null }) }, site))['articles/an-article.md'];
    assert.match(bare, /\nfeatured: false\n/);
    assert.doesNotMatch(bare, /rating|eventDay/);
  });

  test('a wrong value says so, naming the field', () => {
    const { refusals } = run({ 'articles/aaaaaaaaaaaa.md': article({ rating: 'high', eventDay: '2026-13-45' }) }, site);
    assert.deepEqual(refusals.map(({ field, reason }) => [field.name, reason]), [
      ['eventDay', 'the site cannot publish "2026-13-45" as a date'],
      ['rating', 'the site cannot publish "high" as a number'],
    ]);
  });
});

describe('the page for addresses not found', () => {
  const files = {
    'settings.json': { notFound: { page: 'notfoundpage' } },
    'pages/notfoundpage.md': sourcePost({ title: 'Lost', slug: 'lost', status: 'published', otherAddresses: [{ address: '/x/' }] }, 'Nothing here.\n\n![A map](/media/map-aaaaaaaaaa.jpg)'),
    'articles/aaaaaaaaaaaa.md': article({}, 'A [link](konzilo:notfoundpage).'),
    'menus/main.json': { items: [{ post: 'notfoundpage' }] },
  };
  const result = run(files, site);

  test('is its title and body alone, its images named from the content folder\'s root', () => {
    assert.deepEqual(result.refusals, []);
    assert.equal(written(result)['not-found.md'], '---\ntitle: "Lost"\n---\n\nNothing here.\n\n![A map](media/lost-aaaaaaaaaa.webp)\n');
  });

  test('has no address of its own: nothing leads to it', () => {
    assert.equal(written(result)['pages/lost.md'], undefined);
    assert.match(written(result)['articles/an-article.md'], /A link\./);
    assert.deepEqual(JSON.parse(written(result)['menus/main.json']).items, []);
    assert.equal(settingsOf(result).notFound, undefined);
    assert.equal(result.ledger.posts.notfoundpage.path, 'not-found.md');
  });

  test('a refused one keeps no version published before', () => {
    const refused = run({ ...files, 'pages/notfoundpage.md': sourcePost({ title: 'Lost', slug: 'lost', status: 'published' }, '# Not allowed') }, site, { ledger: result.ledger });
    assert.equal(refused.refusals.length, 1);
    assert.equal(written(refused)['not-found.md'], undefined);
    assert.deepEqual(refused.keep, []);
  });

  test('warns when none serves', () => {
    const none = run({ 'settings.json': { notFound: { page: 'notfoundpage' } }, 'pages/notfoundpage.md': page('lost', { status: 'draft' }) }, site);
    assert.equal(none.warnings[0].setting, 'notFound.page');
  });
});

describe('redirect rules', () => {
  const files = {
    'pages/targettarget.md': page('target'),
    'articles/aaaaaaaaaaaa.md': article({ otherAddresses: [{ address: '/mine/' }] }),
    'tags/tagtagtagtag.json': { name: 'A tag' },
    'categories/newsnewsnews.json': { name: 'News', slug: 'news' },
    'articles/bbbbbbbbbbbb.md': article({ title: 'B', slug: 'b', categories: ['newsnewsnews'] }),
    'redirects.json': {
      rules: [
        { from: '/gone/', status: 410 },
        { from: '/old-shop/', to: 'https://shop.example.com/', status: 301 },
        { from: '/by-id/', post: 'targettarget', status: 302 },
        { from: '/typed/', to: '/pages/target/', status: 301 },
        { from: '/to-term/', term: 'newsnewsnews', status: 301 },
        { from: '^/blog/(.*)$', to: '/$1', status: 301 },
      ],
    },
  };
  const result = run(files, site);

  test('a rule that leads to a post goes into its file, by ID or by its typed address', () => {
    assert.deepEqual(result.refusals, []);
    assert.match(written(result)['pages/target.md'], /\notherAddresses: \[\{"address":"\/by-id\/","answer":302\},\{"address":"\/typed\/","answer":301\}\]\n/);
  });

  test('the rest are the site\'s, exact rules sorted, then patterns in their order', () => {
    assert.deepEqual(JSON.parse(written(result)['redirects.json']).rules, [
      { from: '/gone/', status: 410 },
      { from: '/old-shop/', to: 'https://shop.example.com/', status: 301 },
      { from: '/to-term/', to: '/category/news/', status: 301 },
      { pattern: '^/blog/(.*)$', to: '/$1', status: 301 },
    ]);
  });

  test('a site with none has `{ "rules": [] }`', () => {
    assert.equal(written(run({}, site))['redirects.json'], '{\n  "rules": []\n}\n');
  });

  test('a term\'s page answers its old address, with its current one', () => {
    const before = run({ 'categories/newsnewsnews.json': { name: 'News', slug: 'old-news' }, 'articles/aaaaaaaaaaaa.md': article({ categories: ['newsnewsnews'] }) }, site);
    const after = run({ 'categories/newsnewsnews.json': { name: 'News', slug: 'news' }, 'articles/aaaaaaaaaaaa.md': article({ categories: ['newsnewsnews'] }) }, site, { ledger: before.ledger });
    assert.deepEqual(JSON.parse(written(after)['redirects.json']).rules, [{ from: '/category/old-news/', to: '/category/news/', status: 301 }]);
  });
});

describe('the service registry', () => {
  test('holds the embed services the published posts use, and those an Admin declares', () => {
    const service = { id: 'pixel', name: 'Pixel', category: 'marketing', provider: { name: 'P Inc', country: 'IE', privacyPolicy: 'https://p.example.com/privacy' }, purpose: 'Counts.', storage: [], hosts: { images: ['https://pixel.example.com'] }, transfers: [] };
    const result = run({ 'articles/aaaaaaaaaaaa.md': article({}, 'https://vimeo.com/76979871'), 'services.json': { services: [service] } }, site);
    assert.deepEqual(result.refusals, []);
    const registry = JSON.parse(written(result)['consent.json']);
    assert.deepEqual(registry.services.map((one) => one.id), ['consent', 'pixel', 'vimeo']);
    assert.equal(registry.revised, '2026-11-03');
    assert.deepEqual(result.ledger.consent, { revision: registry.revision, revised: '2026-11-03' });
  });

  test('names the domain of each stored item: null, the host of the page, for one of the site\'s own, and the host a third party\'s service shows in or loads from', () => {
    const service = { id: 'pixel', name: 'Pixel', category: 'marketing', provider: { name: 'P Inc', country: 'IE', privacyPolicy: 'https://p.example.com/privacy' }, purpose: 'Counts.', storage: [{ name: 'own', kind: 'cookie', lifetime: 'P1D', party: 'first' }, { name: 'theirs', kind: 'cookie', lifetime: 'P1D', party: 'third' }], hosts: { scripts: ['https://*.cdn.example.com'], images: ['https://pixel.example.com'] }, transfers: [] };
    const result = run({ 'articles/aaaaaaaaaaaa.md': article({}, 'https://vimeo.com/76979871'), 'services.json': { services: [service] } }, site);
    const registry = JSON.parse(written(result)['consent.json']);
    const domains = Object.fromEntries(registry.services.map((one) => [one.id, one.storage.map(({ name, domain }) => [name, domain])]));
    assert.deepEqual(domains.consent, [['konzilo-consent', null]]);
    assert.deepEqual(domains.pixel, [['own', null], ['theirs', 'cdn.example.com']]);
    assert.ok(domains.vimeo.every(([, domain]) => domain === 'player.vimeo.com'));
  });

  test('on a Swedish site whose editors work in English, holds what visitors read in Swedish, as the settings\' defaults are', () => {
    const swedish = { ...site, language: 'sv_SE', interfaceLanguage: 'en', consent: { domain: 'example.com' } };
    const result = run({ 'articles/aaaaaaaaaaaa.md': article({}, 'https://vimeo.com/76979871') }, swedish);
    const registry = JSON.parse(written(result)['consent.json']);
    const service = (id) => registry.services.find((one) => one.id === id);
    assert.equal(service('consent').name, 'Samtycke');
    assert.equal(service('consent').purpose, 'Kommer ihåg vilka kategorier och tjänster du har tillåtit, och när, så att den här webbplatsen och varje annan webbplats under example.com respekterar ditt val.');
    assert.equal(service('consent').necessity, 'Utan den kunde webbplatsen inte hålla sig till ditt val, och skulle fråga dig på varje sida.');
    assert.equal(service('vimeo').purpose, 'Spelar upp videor från Vimeo på sidan.');
    assert.equal(registry.texts.banner.title, 'Din integritet');
    assert.equal(registry.categories.find((one) => one.id === 'necessary').name, 'Nödvändiga');
    const settings = settingsOf(result);
    assert.equal(settings.consent.bannerTitle, 'Din integritet');
    assert.equal(settings.forms.contact.confirmation, 'Tack! Ditt meddelande är skickat.');
    const english = JSON.parse(written(run({ 'articles/aaaaaaaaaaaa.md': article({}, 'https://vimeo.com/76979871') }, { ...site, interfaceLanguage: 'sv' }))['consent.json']);
    assert.equal(english.services.find((one) => one.id === 'vimeo').purpose, 'Plays videos from Vimeo in the page.');
    assert.equal(english.texts.banner.title, 'Your privacy');
  });

  test('on a site that keeps the choice on a domain, declares the consent\'s cookie on it, and the local storage item the records wait in', () => {
    const shared = { ...site, consent: { domain: 'example.com' } };
    const registry = JSON.parse(written(run({}, shared))['consent.json']);
    const consent = registry.services.find((one) => one.id === 'consent');
    assert.deepEqual(consent.storage, [
      { name: 'konzilo-consent', kind: 'cookie', lifetime: 'P12M', party: 'first', domain: 'example.com' },
      { name: 'konzilo-consent', kind: 'localStorage', lifetime: 'P12M', party: 'first', domain: null },
    ]);
    assert.match(consent.purpose, /every other site below example\.com/);
    assert.notEqual(registry.revision, JSON.parse(written(run({}, site))['consent.json']).revision);
  });

  test('a site that counts without storage before consent describes statistics as so, and is warned while it loads no tracker of Matomo\'s own', () => {
    const counting = { ...site, consent: { departures: [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'Every visit counts.', privacySignals: 'ignore' }] } };
    const tracker = { tagManager: { manager: 'Matomo', address: 'https://matomo.example.com/', site: 3 } };
    const result = run({ 'settings.json': tracker }, counting);
    const departures = (one) => one.warnings.filter((warning) => warning.file === 'site-description.json').map(({ setting }) => setting);
    assert.deepEqual(departures(result), []);
    const registry = JSON.parse(written(result)['consent.json']);
    assert.match(registry.categories.find((category) => category.id === 'statistics').description, /Each visit is counted from the first page, without storing anything in your browser or reading your device's properties\./);
    assert.deepEqual(registry.departures, [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'Every visit counts.', privacySignals: 'ignore' }]);
    const without = run({}, counting);
    assert.deepEqual(departures(without), ['consent.departures.1']);
  });

  test('keeps the day it last changed, while what a visitor consents to stays', () => {
    const first = run({}, site);
    const later = run({}, site, { ledger: first.ledger, now: new Date('2027-01-01T00:00:00Z') });
    assert.equal(JSON.parse(written(later)['consent.json']).revised, '2026-11-03');
    const changed = run({ 'articles/aaaaaaaaaaaa.md': article({}, 'https://vimeo.com/76979871') }, site, { ledger: first.ledger, now: new Date('2027-01-01T00:00:00Z') });
    assert.equal(JSON.parse(written(changed)['consent.json']).revised, '2027-01-01');
  });

  test('a refused post\'s kept file counts, by what the ledger says it names', () => {
    const files = { 'articles/aaaaaaaaaaaa.md': article({}, 'https://vimeo.com/76979871') };
    const first = run(files, site);
    assert.deepEqual(first.ledger.posts.aaaaaaaaaaaa.names, { embeds: ['vimeo'] });
    const second = run({ 'articles/aaaaaaaaaaaa.md': article({ title: '<b>Refused</b>' }) }, site, { ledger: first.ledger });
    assert.ok(JSON.parse(written(second)['consent.json']).services.some((one) => one.id === 'vimeo'));
  });

  test('a service the site cannot publish keeps the last registry, naming it', () => {
    const result = run({ 'services.json': { services: [{ id: 'pixel', name: 'Pixel' }] } }, site);
    assert.equal(result.refusals[0].file, 'services.json');
    assert.match(result.refusals[0].setting, /^pixel\./);
    assert.equal(written(result)['consent.json'], undefined);
  });
});

describe('what is an Admin\'s alone', () => {
  const editor = { by: 'editor@example.com', admin: false };
  const admin = { by: 'admin@example.com', admin: true };

  for (const [path, contents, published] of [
    ['settings.json', { title: 'Mine' }, 'settings.json'],
    ['menus/main.json', { items: [] }, 'menus/main.json'],
    ['redirects.json', { rules: [] }, 'redirects.json'],
    ['services.json', { services: [] }, 'consent.json'],
  ]) {
    test(`${path}: a non-Admin's change is refused, and the last file stays`, () => {
      const result = run({ [path]: contents }, site, { changes: { [path]: editor } });
      assert.equal(result.refusals[0].file, path);
      assert.match(result.refusals[0].reason, /^editor@example\.com is no Admin/);
      assert.equal(written(result)[published], undefined);
    });

    test(`${path}: an Admin's change goes through, and a file back at what was accepted is no change`, () => {
      const accepted = run({ [path]: contents }, site, { changes: { [path]: admin } });
      assert.deepEqual(accepted.refusals, []);
      assert.ok(written(accepted)[published]);
      const later = run({ [path]: contents }, site, { changes: { [path]: editor }, ledger: accepted.ledger });
      assert.deepEqual(later.refusals, []);
    });
  }

  test('a non-Admin cannot take a file away either', () => {
    const accepted = run({ 'settings.json': { title: 'Mine' } }, site);
    const gone = run({}, site, { changes: { 'settings.json': editor }, ledger: accepted.ledger });
    assert.equal(gone.refusals[0].file, 'settings.json');
    assert.equal(written(gone)['settings.json'], undefined);
  });

  test('a settings file that is refused keeps the images its last version names', () => {
    const settings = { logo: { src: '/media/logo.svg', alt: 'A logo' } };
    const first = run({ 'settings.json': settings }, site);
    const master = Object.keys(written(first)).find((path) => path.startsWith('media/'));
    assert.ok(master);
    const broken = run({ 'settings.json': '{ not json' }, site, { ledger: first.ledger });
    assert.deepEqual(broken.keep, [master]);
    const held = run({ 'settings.json': { title: 'Mine' } }, site, { ledger: broken.ledger, changes: { 'settings.json': editor } });
    assert.deepEqual(held.keep, [master], 'and goes on keeping them');
    const replaced = run({ 'settings.json': { title: 'Mine' } }, site, { ledger: held.ledger, changes: { 'settings.json': admin } });
    assert.deepEqual(replaced.keep, [], 'until an Admin\'s next version names none');
    assert.deepEqual(replaced.ledger.settingsMedia, []);
  });

  const legal = { 'settings.json': { legalPages: { privacyPolicy: 'legallegal00' } }, 'pages/legallegal00.md': page('privacy') };

  test('a non-Admin\'s change to a post chosen as a legal page keeps its last version', () => {
    const first = run(legal, site);
    const changed = { ...legal, 'pages/legallegal00.md': sourcePost({ title: 'Changed', slug: 'privacy', status: 'published' }, 'Changed.') };
    const second = run(changed, site, { ledger: first.ledger, changes: { 'pages/legallegal00.md': editor } });
    assert.equal(second.refusals[0].post.id, 'legallegal00');
    assert.match(second.refusals[0].reason, /^editor@example\.com is no Admin, and only an Admin may change a post chosen as a legal page/);
    assert.equal(written(second)['pages/privacy.md'], undefined);
    assert.deepEqual(second.keep, ['pages/privacy.md']);
    const third = run(changed, site, { ledger: second.ledger, changes: { 'pages/legallegal00.md': admin } });
    assert.deepEqual(third.refusals, []);
    assert.match(written(third)['pages/privacy.md'], /Changed\./);
  });

  test('a non-Admin cannot free a legal page by changing the settings too', () => {
    const first = run(legal, site);
    const second = run({
      'settings.json': { legalPages: {} },
      'pages/legallegal00.md': sourcePost({ title: 'Changed', slug: 'privacy', status: 'published' }, 'Changed.'),
    }, site, { ledger: first.ledger, changes: { 'settings.json': editor, 'pages/legallegal00.md': editor } });
    assert.deepEqual(second.refusals.map((one) => one.file), ['settings.json', 'pages/legallegal00.md']);
  });

  // What would take a legal page off the site is a change as well.
  for (const [what, fields] of [
    ['a draft', { title: 'Privacy', slug: 'privacy', status: 'draft' }],
    ['a date ahead', { title: 'Privacy', slug: 'privacy', status: 'published', date: '2099-01-01T00:00:00Z' }],
    ['a status it does not know', { title: 'Privacy', slug: 'privacy', status: 'gone' }],
  ]) {
    test(`a non-Admin cannot take a legal page off the site with ${what}`, () => {
      const first = run(legal, site);
      const second = run({ ...legal, 'pages/legallegal00.md': sourcePost(fields, 'Text.') }, site, { ledger: first.ledger, changes: { 'pages/legallegal00.md': editor } });
      assert.match(second.refusals[0].reason, /^editor@example\.com is no Admin/);
      assert.deepEqual(second.keep, ['pages/privacy.md']);
      assert.ok(second.ledger.posts.legallegal00.path, 'the ledger holds on to its file');
      assert.ok(written(second)['settings.json'].includes('/privacy/'), 'the settings still lead to it');
      assert.equal(second.next, null);
    });
  }

  test('a non-Admin cannot take a legal page off the site by deleting it', () => {
    const first = run(legal, site);
    const { 'pages/legallegal00.md': _, ...without } = legal;
    const second = run(without, site, { ledger: first.ledger, changes: { 'pages/legallegal00.md': editor } });
    assert.equal(second.refusals.length, 1);
    assert.equal(second.refusals[0].post.id, 'legallegal00');
    assert.match(second.refusals[0].reason, /^editor@example\.com is no Admin, and only an Admin may take/);
    assert.deepEqual(second.keep, ['pages/privacy.md']);
    assert.ok(second.ledger.posts.legallegal00.path);
    assert.ok(written(second)['settings.json'].includes('/privacy/'));
    assert.equal(deletion(['pages/privacy.md'], second).paths.length, 0);
    // Another post cannot take the address it still holds.
    const third = run({ ...without, 'pages/bbbbbbbbbbbb.md': page('privacy') }, site, { ledger: second.ledger, changes: { 'pages/legallegal00.md': editor } });
    assert.ok(third.refusals.some((one) => one.post?.id === 'bbbbbbbbbbbb'));
    assert.deepEqual(third.keep, ['pages/privacy.md']);
  });

  test('a legal page an Admin takes off goes, by draft, by deletion, and once it is no longer chosen', () => {
    const first = run(legal, site);
    const drafted = run({ ...legal, 'pages/legallegal00.md': sourcePost({ title: 'Privacy', slug: 'privacy', status: 'draft' }, 'Text.') }, site, { ledger: first.ledger, changes: { 'pages/legallegal00.md': admin } });
    assert.deepEqual(drafted.refusals, []);
    assert.deepEqual(drafted.keep, []);
    const { 'pages/legallegal00.md': _, ...without } = legal;
    const deleted = run(without, site, { ledger: first.ledger, changes: { 'pages/legallegal00.md': admin } });
    assert.deepEqual(deleted.refusals, []);
    assert.deepEqual(deleted.keep, []);
    // An Editor deleted it, and an Admin then chooses another page: the deletion stands.
    const unchosen = run({ ...without, 'settings.json': { legalPages: {} } }, site, { ledger: first.ledger, changes: { 'pages/legallegal00.md': editor, 'settings.json': admin } });
    assert.deepEqual(unchosen.refusals, []);
    assert.deepEqual(unchosen.keep, []);
  });

  test('a legal page not yet on the site is its editor\'s to draft, and an Admin\'s to publish', () => {
    const draft = sourcePost({ title: 'Privacy', slug: 'privacy', status: 'draft' }, 'A draft.');
    const first = run({ ...legal, 'pages/legallegal00.md': draft }, site, { changes: { 'pages/legallegal00.md': editor } });
    assert.deepEqual(first.refusals, []);
    const published = run(legal, site, { ledger: first.ledger, changes: { 'pages/legallegal00.md': editor } });
    assert.match(published.refusals[0].reason, /^editor@example\.com is no Admin/);
    assert.equal(written(published)['pages/privacy.md'], undefined);
  });

  test('holds a legal page in the language an Editor took it away in, and in that alone', () => {
    const inTwo = {
      languages: ['sv_SE', 'en_GB'],
      images: { smallestWidth: 400, displayWidth: 1280 },
      types: { page: { label: 'P', plural: 'Ps', collection: 'pages', address: { sv_SE: '/sidor/{slug}/', en_GB: '/pages/{slug}/' }, elements: ['paragraph'] } },
    };
    const source = {
      'settings.json': { legalPages: { privacyPolicy: 'legallegal00' } },
      'pages/sv-SE/legallegal00.md': sourcePost({ title: 'Integritet', slug: 'integritet', status: 'published' }, 'Text.'),
      'pages/en-GB/legallegal00.md': sourcePost({ title: 'Privacy', slug: 'privacy', status: 'published' }, 'Text.'),
    };
    const first = run(source, inTwo);
    assert.deepEqual(first.refusals, []);
    const { 'pages/en-GB/legallegal00.md': _, ...without } = source;
    const second = run(without, inTwo, { ledger: first.ledger, changes: { 'pages/en-GB/legallegal00.md': editor } });
    assert.deepEqual(second.refusals.map((one) => one.file), ['pages/en-GB/legallegal00.md']);
    assert.deepEqual(second.keep, ['pages/en-GB/privacy.md']);
    assert.ok(written(second)['pages/sv-SE/integritet.md']);
  });

  test('a post an Editor last touched before it was chosen stands, until its version changes', () => {
    const before = run({ 'pages/legallegal00.md': page('privacy') }, site);
    const chosen = run(legal, site, { ledger: before.ledger, changes: { 'pages/legallegal00.md': editor } });
    assert.deepEqual(chosen.refusals, []);
  });
});

// A Reviewer reads the site and changes nothing in it (ADR 0008): Forgejo refuses their push,
// and whatever reaches the source by them all the same is refused, file by file, whatever its kind.
describe('what a Reviewer changes', () => {
  const reviewer = { by: 'reviewer@example.com', admin: false, reviewer: true };
  const editor = { by: 'editor@example.com', admin: false };
  const one = { 'articles/aaaaaaaaaaaa.md': article() };
  const theirs = (result) => result.refusals.filter((refusal) => refusal.name === 'refusal.reviewer');

  test('a post a Reviewer changed keeps its last published version, until an Editor changes it', () => {
    const first = run(one, site);
    const changed = { 'articles/aaaaaaaaaaaa.md': article({}, 'Changed.') };
    const second = run(changed, site, { ledger: first.ledger, changes: { 'articles/aaaaaaaaaaaa.md': reviewer } });
    assert.equal(second.refusals.length, 1);
    assert.equal(theirs(second)[0].post.id, 'aaaaaaaaaaaa');
    assert.equal(theirs(second)[0].reason, 'reviewer@example.com is a Reviewer, who reads the site and changes nothing in it, so nothing of the change to articles/aaaaaaaaaaaa.md is published; ask an Editor or an Admin to make it');
    assert.equal(written(second)['articles/an-article.md'], undefined);
    assert.deepEqual(second.keep, ['articles/an-article.md']);
    const third = run(changed, site, { ledger: second.ledger, changes: { 'articles/aaaaaaaaaaaa.md': editor } });
    assert.deepEqual(third.refusals, []);
    assert.match(written(third)['articles/an-article.md'], /Changed\./);
  });

  test('a post a Reviewer left as it was published is no change', () => {
    const first = run(one, site);
    assert.deepEqual(run(one, site, { ledger: first.ledger, changes: { 'articles/aaaaaaaaaaaa.md': reviewer } }).refusals, []);
  });

  test('a post a Reviewer set to draft, or deleted, stays on the site', () => {
    const first = run(one, site);
    const drafted = run({ 'articles/aaaaaaaaaaaa.md': article({ status: 'draft' }) }, site, { ledger: first.ledger, changes: { 'articles/aaaaaaaaaaaa.md': reviewer } });
    assert.equal(theirs(drafted).length, 1);
    assert.deepEqual(drafted.keep, ['articles/an-article.md']);
    const deleted = run({}, site, { ledger: first.ledger, changes: { 'articles/aaaaaaaaaaaa.md': reviewer } });
    assert.equal(theirs(deleted)[0]?.post.id, 'aaaaaaaaaaaa');
    assert.deepEqual(deleted.keep, ['articles/an-article.md']);
    assert.ok(deleted.ledger.posts.aaaaaaaaaaaa.path, 'the ledger holds on to its file');
    assert.equal(deletion(['articles/an-article.md'], deleted).paths.length, 0);
  });

  test('a post a Reviewer wrote is not published, nor a draft of theirs taken', () => {
    const result = run({
      ...one,
      'articles/bbbbbbbbbbbb.md': article({ slug: 'theirs' }),
      'articles/cccccccccccc.md': article({ slug: 'a-draft', status: 'draft' }),
    }, site, { changes: { 'articles/bbbbbbbbbbbb.md': reviewer, 'articles/cccccccccccc.md': reviewer } });
    assert.deepEqual(theirs(result).map((refusal) => refusal.post.id), ['bbbbbbbbbbbb', 'cccccccccccc']);
    assert.equal(written(result)['articles/theirs.md'], undefined);
    assert.ok(written(result)['articles/an-article.md'], 'and everyone else\'s goes');
  });

  test('a term a Reviewer changed holds back the posts that use it', () => {
    const files = { 'articles/aaaaaaaaaaaa.md': article({ tags: ['tagtagtagtag'] }), 'tags/tagtagtagtag.json': { name: 'A tag' } };
    const first = run(files, site);
    const second = run({ ...files, 'tags/tagtagtagtag.json': { name: 'Renamed' } }, site, { ledger: first.ledger, changes: { 'tags/tagtagtagtag.json': reviewer } });
    assert.equal(theirs(second)[0]?.post.id, 'aaaaaaaaaaaa');
    assert.match(theirs(second)[0].reason, /the change to tags\/tagtagtagtag\.json/);
    assert.equal(written(second)['tags/renamed.json'], undefined);
    assert.deepEqual(second.keep.sort(), ['articles/an-article.md', 'tags/a-tag.json']);
  });

  test('an image a Reviewer changed holds back the posts that show it', () => {
    const files = { 'articles/aaaaaaaaaaaa.md': article({ image: { src: '/media/photo-1234567890.jpg', alt: 'A photo' } }) };
    const first = run(files, site);
    const second = run(files, site, { ledger: first.ledger, changes: { 'media/photo-1234567890.jpg': reviewer } });
    assert.equal(theirs(second)[0]?.post.id, 'aaaaaaaaaaaa');
    assert.match(theirs(second)[0].reason, /the change to media\/photo-1234567890\.jpg/);
    assert.equal(written(second)['articles/an-article.md'], undefined);
  });

  for (const [path, contents] of [
    ['settings.json', { title: 'Mine' }],
    ['menus/main.json', { items: [] }],
    ['redirects.json', { rules: [] }],
    ['services.json', { services: [] }],
  ]) {
    test(`${path}: a Reviewer's change is refused in a Reviewer's words, whatever else their account is`, () => {
      const result = run({ [path]: contents }, site, { changes: { [path]: { ...reviewer, admin: true } } });
      assert.equal(result.refusals[0].file, path);
      assert.equal(result.refusals[0].name, 'refusal.reviewer');
    });
  }
});

describe('a site in several languages', () => {
  const several = {
    languages: ['sv_SE', 'en_GB'],
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      story: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { categories: { taxonomy: 'category' } } },
      page: { label: 'P', plural: 'Ps', collection: 'pages', hierarchical: true, address: { sv_SE: '/sidor/{path}/', en_GB: '/pages/{path}/' }, elements: ['paragraph'] },
    },
    taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories', hierarchical: true } },
    menus: { main: { label: 'Main' } },
    settings: { footerText: { label: 'F', type: 'string', control: 'textarea', translated: true }, contact: { label: 'C', type: 'post', control: 'post' } },
  };
  const post = (fields, body = 'Text.') => sourcePost({ status: 'published', ...fields }, body);
  const files = {
    'articles/sv-SE/lantern00000.md': post({ title: 'Om lyktorna', slug: 'om-lyktorna', categories: ['newsnewsnews'] }, 'Se [sidan](konzilo:aboutabout00).'),
    'articles/en-GB/lantern00000.md': post({ title: 'About the lanterns', slug: 'about-the-lanterns', categories: ['newsnewsnews'] }, 'See [the page](konzilo:aboutabout00).'),
    'articles/en-GB/english00000.md': post({ title: 'English alone', slug: 'english-alone' }),
    'pages/sv-SE/aboutabout00.md': post({ title: 'Om oss', slug: 'om-oss' }),
    'pages/en-GB/aboutabout00.md': post({ title: 'About us', slug: 'about-us' }),
    'categories/sv-SE/newsnewsnews.json': { name: 'Nyheter', slug: 'nyheter' },
    'categories/en-GB/newsnewsnews.json': { name: 'News', slug: 'nyheter' },
    'menus/sv-SE/main.json': { items: [{ post: 'aboutabout00' }] },
    'menus/en-GB/main.json': { items: [{ post: 'aboutabout00' }] },
    'settings.json': { title: { sv_SE: 'Lyktan', en_GB: 'The Lantern' }, footerText: { sv_SE: 'Öppet', en_GB: 'Open' }, contact: 'aboutabout00', consent: { bannerTitle: { sv_SE: 'Din', en_GB: 'Your' } } },
  };
  const result = intakeSeveral();

  function intakeSeveral() {
    return run(files, several);
  }

  test('writes each language in its folder, with the set\'s key only where the release holds another', () => {
    assert.deepEqual(result.refusals, []);
    const key = /translationKey: "([0-9a-f]{16})"/.exec(written(result)['articles/sv-SE/om-lyktorna.md'])[1];
    assert.equal(/translationKey: "([0-9a-f]{16})"/.exec(written(result)['articles/en-GB/about-the-lanterns.md'])[1], key);
    assert.doesNotMatch(written(result)['articles/en-GB/english-alone.md'], /translationKey/);
  });

  test('a main-language post keeps its address without the prefix as an old address', () => {
    assert.match(written(result)['articles/sv-SE/om-lyktorna.md'], /\noldAddresses: \["\/om-lyktorna\/"\]\n/);
    assert.doesNotMatch(written(result)['articles/en-GB/about-the-lanterns.md'], /oldAddresses/);
    assert.match(written(result)['pages/sv-SE/om-oss.md'], /\noldAddresses: \["\/sidor\/om-oss\/"\]\n/);
  });

  test('links, menus and terms lead within the language', () => {
    assert.match(written(result)['articles/sv-SE/om-lyktorna.md'], /\[sidan\]\(\/sv\/sidor\/om-oss\/\)/);
    assert.match(written(result)['articles/en-GB/about-the-lanterns.md'], /\[the page\]\(\/en\/pages\/about-us\/\)/);
    assert.match(written(result)['articles/sv-SE/om-lyktorna.md'], /\ncategories: \["sv-SE\/nyheter"\]\n/);
    assert.deepEqual(JSON.parse(written(result)['menus/en-GB/main.json']).items, [{ title: 'About us', url: '/en/pages/about-us/' }]);
    assert.equal(written(result)['categories/en-GB/nyheter.json'], '{\n  "name": "News"\n}\n');
    assert.equal(written(result)['categories/sv-SE/nyheter.json'], '{\n  "name": "Nyheter"\n}\n');
  });

  test('each language\'s settings hold its texts, its own defaults and its translation of a chosen page', () => {
    const swedish = settingsOf(result, 'settings/sv-SE.json');
    const english = settingsOf(result, 'settings/en-GB.json');
    assert.equal(swedish.title, 'Lyktan');
    assert.equal(english.title, 'The Lantern');
    assert.equal(swedish.footerText, 'Öppet');
    assert.equal(english.footerText, 'Open');
    assert.equal(swedish.consent.bannerTitle, 'Din');
    assert.equal(english.consent.bannerTitle, 'Your');
    assert.equal(swedish.consent.bannerAccept, 'Acceptera alla');
    assert.equal(english.consent.bannerAccept, 'Accept all');
    assert.deepEqual(swedish.contact, { title: 'Om oss', url: '/sv/sidor/om-oss/' });
    assert.deepEqual(english.contact, { title: 'About us', url: '/en/pages/about-us/' });
    assert.equal(written(result)['settings.json'], undefined);
  });

  test('a post\'s key in its language: one ledger entry for each translation', () => {
    assert.equal(result.ledger.posts['sv-SE/lantern00000'].path, 'articles/sv-SE/om-lyktorna.md');
    assert.equal(result.ledger.posts['en-GB/lantern00000'].path, 'articles/en-GB/about-the-lanterns.md');
  });

  test('a post in a language the site does not declare keeps no file, and takes nothing with it', () => {
    const first = run({ 'articles/sv-SE/aaaaaaaaaaaa.md': post({ title: 'En', slug: 'en' }) }, several);
    const removed = run({ 'articles/de-DE/aaaaaaaaaaaa.md': post({ title: 'En', slug: 'en' }) }, several, { ledger: first.ledger });
    assert.equal(removed.refusals.length, 1);
    assert.deepEqual(removed.keep, []);
  });
});

describe('source files as the editing tool writes them', () => {
  const demo = fileURLToPath(new URL('../site-template/demo-content', import.meta.url));
  const description = siteDescription(JSON.parse(readFileSync(fileURLToPath(new URL('../site-template/files/site-description.json', import.meta.url)), 'utf8')));
  const source = demoSource(description, demo);
  const text = (path) => source.find((one) => one.path === path).content;

  test('hold a menu\'s entries by their posts\' IDs, and no label that says what the title does', () => {
    const { items } = JSON.parse(text('menus/main.json'));
    assert.match(items[0].post, /^[0-9a-f]{12}$/);
    assert.equal(items[0].title, undefined);
    assert.match(items[0].items[0].post, /^[0-9a-f]{12}$/);
  });

  test('hold only the settings that differ from a default, and a chosen post by its ID', () => {
    const settings = JSON.parse(text('settings.json'));
    assert.equal(settings.search.separator, undefined);
    assert.equal(settings.search.home, undefined);
    assert.equal(settings.search.publisher.name, 'Northern Valley AB');
    assert.equal(settings.consent.bannerTitle, 'Your privacy on this demo site');
    assert.equal(settings.consent.bannerAccept, undefined);
    assert.match(settings.legalPages.privacyPolicy, /^[0-9a-f]{12}$/);
    assert.equal(settings.logo.src.startsWith('/media/logo-'), true);
  });

  test('hold a body\'s links and images by ID and place', () => {
    const body = source.find((one) => one.path.startsWith('articles/') && one.content.includes('Every element of body text')).content;
    assert.match(body, /\[a page of the site\]\(konzilo:[0-9a-f]{12}\)/);
    assert.match(body, /!\[A landscape with a low sun\]\(\/media\/every-element-[0-9a-f]{10}\.webp\)/);
  });

  test('come back from what the intake writes, as the same source', () => {
    const files = source.map(({ path, content }) => ({ path, contents: content }));
    const result = intake({ files, site: description, now: NOW, images: namedImages() });
    const published = result.files.filter(({ path }) => path !== '.post-ids.json' && path !== 'consent.json').map(({ path, contents }) => ({ path, content: contents }));
    const again = sourceFrom(description, published);
    const texts = (list) => list.filter(({ path }) => !path.startsWith('media/')).map(({ path, content }) => [path, content]);
    assert.deepEqual(texts(again), texts(source));
  });

  test('the form an editor saves in keeps a group\'s part per type under `types`, as the settings file does', () => {
    const config = cmsConfig(description, { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
    const settings = config.collections.find((one) => one.name === 'settings').files[0];
    const search = settings.fields.find((one) => one.name === 'search');
    const types = search.fields.find((one) => one.name === 'types');
    assert.deepEqual(types.fields.map((one) => one.name), ['article', 'page', 'canvas']);
    const articles = config.collections.find((one) => one.name === 'articles');
    const other = articles.fields.find((one) => one.name === 'otherAddresses');
    assert.deepEqual(other.fields.map((one) => one.name), ['address', 'answer']);
    assert.equal(config.collections.find((one) => one.name === 'categories').fields.some((one) => one.name === 'otherAddresses'), false);
  });
});
