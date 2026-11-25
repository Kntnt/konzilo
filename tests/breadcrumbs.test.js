// Breadcrumbs: the levels a page sits at, from its address
// alone: the start page, named in the site's language, each shorter address
// the page's address starts with at which a post answers, of any type, and
// the page itself, each post named by its name in breadcrumbs, else by the
// label of the menu entry that leads to it, else by its title. Every page but
// the start page carries them in its structured data as a BreadcrumbList,
// which its WebPage names, and the integration's Breadcrumbs component shows
// the same levels where a design places it, ending with the page itself by
// default for a post of a hierarchical type and for one whose name in
// breadcrumbs is filled in.
//
// A small site built with `astro build` for https://www.example.com, from
// content files the intake's command writes: articles below /news/, where
// a page of the site answers, notes below /notes/, where nothing does, a
// tree of pages three levels deep, and a page of the design's own below one
// of them. Built again below a preview's base, with menus, in Swedish, and
// in English and Swedish.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment, nodeSync } from './lib/astro.js';
import { paragraphs, post, writeContent } from './lib/content.js';

const ORIGIN = 'https://www.example.com';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');
const { JSDOM } = createRequire(join(core, 'package.json'))('jsdom');

// Articles below /news/, with a name in breadcrumbs, the built-in page at
// its path from the root, and notes below /notes/, in `language`, or in each of `languages`, with the menus
// named, in that order.
const site = (language, languages, menus) => ({
  ...(languages ? { languages } : { language }),
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/news/{slug}/', elements: ['paragraph'], fields: { breadcrumb: {} } },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/{path}/', elements: ['paragraph'] },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'] },
  },
  ...(menus.length > 0 ? { menus: Object.fromEntries(menus.map((menu) => [menu, { label: menu }])) } : {}),
});

// The design's route for every post, at its address in its language.
const route = [
  '---',
  "import { entryPages } from '@kntnt/konzilo/astro/languages';",
  "import Page from '../layouts/Page.astro';",
  'export async function getStaticPaths() {',
  "  return (await Promise.all(['articles', 'pages', 'notes'].map((collection) => entryPages(collection)))).flat();",
  '}',
  'const { entry } = Astro.props;',
  '---',
  '<Page entry={entry} />',
  '',
].join('\n');

// The layout places Head in its head and Breadcrumbs above the page's
// heading, given the entry the page shows, or the title of a page of its
// own.
const design = {
  'src/layouts/Page.astro': [
    '---',
    "import Breadcrumbs from '@kntnt/konzilo/astro/Breadcrumbs.astro';",
    "import Head from '@kntnt/konzilo/astro/Head.astro';",
    'const { entry, title } = Astro.props;',
    '---',
    '<html lang="en-GB">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <Head entry={entry} title={title} />',
    '  </head>',
    '  <body><main><Breadcrumbs entry={entry} title={title} /><h1>{entry?.data.title ?? title ?? \'Start\'}</h1></main></body>',
    '</html>',
    '',
  ].join('\n'),
  'src/pages/index.astro': "---\nimport Page from '../layouts/Page.astro';\n---\n<Page />\n",
  'src/pages/[...path].astro': route,
  'src/pages/about/map.astro': "---\nimport Page from '../../layouts/Page.astro';\n---\n<Page title=\"Map of the pier\" />\n",
};

// A page as a build hands it out, under `parent` when given.
function page(ID, slug, title, parent = null, meta = {}) {
  const ancestors = parent === null ? [] : [...parent.ancestors, (({ ID: id, type, slug, status, title }) => ({ ID: id, type, slug, status, title }))(parent)];
  return post({ ID, type: 'page', slug: slug, title: title, parent: parent?.ID ?? 0, ancestors, body: paragraphs(`${title}.`), meta });
}

function posts() {
  const about = page(3, 'about', 'About the lantern');
  const keepers = page(4, 'keepers', 'The keepers of the lantern', about, { breadcrumb: ['Keepers'] });
  return [
    post({ ID: 1, slug: 'harbour-lights', title: 'Harbour lights', body: paragraphs('The lantern keeps the harbour.') }),
    // The page at /news/, the parent level of every article.
    page(2, 'news', 'News from the harbour', null, { breadcrumb: ['News'] }),
    about,
    keepers,
    page(5, 'anna', 'Anna Berg', keepers),
    post({ ID: 6, type: 'note', slug: 'tide', title: 'Tide', body: paragraphs('The tide turns at six.') }),
  ];
}

// An article whose name in breadcrumbs is filled in, and a page at the
// root, such as a cookie policy.
function more() {
  return [
    post({ ID: 7, slug: 'night-watch', title: 'The night watch at the lantern', body: paragraphs('The lantern burns all night.'), meta: { breadcrumb: ['Night watch'] } }),
    page(8, 'cookies', 'Cookie policy'),
  ];
}

let repository;

function write(path, contents) {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), contents);
}

// Every type's breadcrumbs ending with the page itself, or none.
const always = (current) => ({ types: Object.fromEntries(['post', 'page', 'note'].map((type) => [type, { current }])) });

// Export `given` for a site in `language`, or in each of `languages`, and
// build it, below `base` if given, and give each page's document by its
// path. `ending`: the settings group `breadcrumbs`, its defaults where none
// is given. `menus`: each menu's entries, by its name, in the order the site
// description declares them, and `translated` each other language's, by its
// locale.
function build(language, { base, ending, menus = {}, languages, translated = {}, given = posts() } = {}) {
  write('site-description.json', JSON.stringify(site(language, languages, Object.keys(menus))));
  const settings = ending === undefined ? {} : { breadcrumbs: ending };
  const others = Object.fromEntries(Object.entries(translated).map(([locale, own]) => [locale, { menus: own }]));
  write('site-settings.json', JSON.stringify({ menus, settings, redirects: [], identity: { title: 'The Quiet Lantern', logo: null, icon: null }, languages: others }));
  const exported = writeContent(repository, given);
  assert.equal(exported.status, 0, exported.stderr);
  const built = nodeSync([astro, 'build', ...(base ? ['--base', base] : [])], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  return (path) => new JSDOM(readFileSync(join(repository, 'dist', path, 'index.html'), 'utf8')).window.document;
}

// The levels a page's breadcrumbs show on screen, each [name, link], the
// link null for the page itself, marked as the current page; none where it
// shows none.
function shownOf(document) {
  return [...document.querySelectorAll('nav li')].map((item) => (item.getAttribute('aria-current') === 'page' ? [item.textContent, null] : [item.textContent, item.querySelector('a').getAttribute('href')]));
}

// The page's graph, read from its one JSON-LD script.
function graphOf(document) {
  return JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent)['@graph'];
}

// The page's BreadcrumbList, with the WebPage's name of it, or what the
// graph has instead.
function breadcrumbsOf(document) {
  const graph = graphOf(document);
  const webpage = graph.find((node) => node['@id']?.endsWith('#webpage'));
  return { named: webpage.breadcrumb, list: graph.find((node) => node['@type'] === 'BreadcrumbList') };
}

// A BreadcrumbList at the address `path`, of `levels`, each [name, path].
function breadcrumbList(path, levels) {
  return {
    '@type': 'BreadcrumbList',
    '@id': `${ORIGIN}${path}#breadcrumb`,
    itemListElement: levels.map(([name, at], index) => ({ '@type': 'ListItem', position: index + 1, name, item: `${ORIGIN}${at}` })),
  };
}

describe('a site built with astro build for https://www.example.com', () => {
  before(() => {
    repository = mkdtempSync(join(tmpdir(), 'konzilo-breadcrumbs-'));
    // The core's dependencies, and the core itself as a site installs it.
    mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
    for (const entry of readdirSync(join(core, 'node_modules'))) {
      if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
    }
    symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
    write('astro.config.mjs', astroConfig(integration));
    write('src/content.config.mjs', `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`);
    for (const [path, contents] of Object.entries(design)) write(path, contents);
  });

  after(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  test('gives each page the levels of its address where a post answers, named by its name in breadcrumbs or its title, in its graph and on screen', () => {
    const pageAt = build('en_GB', { ending: always(true) });

    // An article below the page at /news/, of another type, named by its
    // name in breadcrumbs.
    const article = pageAt('news/harbour-lights');
    assert.deepEqual(breadcrumbsOf(article), {
      named: { '@id': `${ORIGIN}/news/harbour-lights/#breadcrumb` },
      list: breadcrumbList('/news/harbour-lights/', [['Home', '/'], ['News', '/news/'], ['Harbour lights', '/news/harbour-lights/']]),
    });

    // A note below /notes/, where nothing answers: no level of its own.
    assert.deepEqual(breadcrumbsOf(pageAt('notes/tide')).list, breadcrumbList('/notes/tide/', [['Home', '/'], ['Tide', '/notes/tide/']]));

    // A page three levels down, named by their names in breadcrumbs or their titles.
    const anna = pageAt('about/keepers/anna');
    assert.deepEqual(breadcrumbsOf(anna).list, breadcrumbList('/about/keepers/anna/', [
      ['Home', '/'], ['About the lantern', '/about/'], ['Keepers', '/about/keepers/'], ['Anna Berg', '/about/keepers/anna/'],
    ]));
    assert.equal(anna.querySelector('main').firstElementChild.outerHTML, [
      '<nav aria-label="Breadcrumbs"><ol>',
      '<li><a href="/">Home</a></li>',
      '<li><a href="/about/">About the lantern</a></li>',
      '<li><a href="/about/keepers/">Keepers</a></li>',
      '<li aria-current="page">Anna Berg</li>',
      '</ol></nav>',
    ].join(''));

    // The page at /news/ itself, a level of its own above the start page alone.
    assert.deepEqual(breadcrumbsOf(pageAt('news')).list, breadcrumbList('/news/', [['Home', '/'], ['News', '/news/']]));

    // A page of the design's own, by the title it gives.
    assert.deepEqual(breadcrumbsOf(pageAt('about/map')).list, breadcrumbList('/about/map/', [['Home', '/'], ['About the lantern', '/about/'], ['Map of the pier', '/about/map/']]));

    // The start page has none, in its graph or on screen.
    const start = pageAt('');
    assert.deepEqual(breadcrumbsOf(start), { named: undefined, list: undefined });
    assert.equal(start.querySelector('nav'), null);
  });

  test('names a level without a name in breadcrumbs by the label of the menu entry that leads to it, the first menu\'s, and its first, in its graph and on screen', () => {
    const pageAt = build('en_GB', {
      ending: always(true),
      menus: {
        // Declared first, though its name comes after the footer's.
        main: [
          { title: 'Newsroom', post: 'newsnewsnews', url: '/news/' },
          // A link to a post's address leads to no post, so it names none.
          { title: 'Who we are', url: '/about/' },
          { title: 'The lantern', post: 'aboutaboutab', url: '/about/' },
          { title: 'Our keepers', post: 'keeperskeepe', url: '/about/keepers/' },
          { title: 'Anna', post: 'annaannaanna', url: '/about/keepers/anna/' },
          { title: 'Ms Berg', post: 'annaannaanna', url: '/about/keepers/anna/' },
          { title: 'Lights', url: '/news/harbour-lights/' },
        ],
        footer: [{ title: 'About us', post: 'aboutaboutab', url: '/about/' }, { title: 'Tides', post: 'tidetidetide', url: '/notes/tide/' }],
      },
    });

    // A name in breadcrumbs before a menu's label, the first menu's label
    // before another's, the first entry's before a later one's, and an entry
    // that leads to the post before a link to its address.
    const anna = pageAt('about/keepers/anna');
    assert.deepEqual(breadcrumbsOf(anna).list, breadcrumbList('/about/keepers/anna/', [
      ['Home', '/'], ['The lantern', '/about/'], ['Keepers', '/about/keepers/'], ['Anna', '/about/keepers/anna/'],
    ]));
    assert.deepEqual(shownOf(anna), [['Home', '/'], ['The lantern', '/about/'], ['Keepers', '/about/keepers/'], ['Anna', null]]);
    // A later menu's label where no earlier menu leads to the post.
    assert.deepEqual(breadcrumbsOf(pageAt('notes/tide')).list, breadcrumbList('/notes/tide/', [['Home', '/'], ['Tides', '/notes/tide/']]));
    // A post that has neither, by its title, though a link leads to its address.
    assert.deepEqual(breadcrumbsOf(pageAt('news/harbour-lights')).list, breadcrumbList('/news/harbour-lights/', [['Home', '/'], ['News', '/news/'], ['Harbour lights', '/news/harbour-lights/']]));
  });

  test('in a preview, below its base, the links keep the base and the graph the public host', () => {
    const anna = build('en_GB', { base: '/preview/', ending: always(true) })('about/keepers/anna');

    assert.deepEqual([...anna.querySelectorAll('nav a')].map((link) => link.getAttribute('href')), ['/preview/', '/preview/about/', '/preview/about/keepers/']);
    assert.deepEqual(breadcrumbsOf(anna).list.itemListElement.map(({ item }) => item), [`${ORIGIN}/`, `${ORIGIN}/about/`, `${ORIGIN}/about/keepers/`, `${ORIGIN}/about/keepers/anna/`]);
  });

  test('by default ends the breadcrumbs of a hierarchical type\'s post with the post itself, and of another type\'s only where its name in breadcrumbs is filled in, its graph holding every level', () => {
    const pageAt = build('en_GB', { given: [...posts(), ...more()] });

    // A page, of a hierarchical type, at the root and below others.
    assert.deepEqual(shownOf(pageAt('cookies')), [['Home', '/'], ['Cookie policy', null]]);
    assert.deepEqual(shownOf(pageAt('about/keepers/anna')), [['Home', '/'], ['About the lantern', '/about/'], ['Keepers', '/about/keepers/'], ['Anna Berg', null]]);
    // An article ends above itself, and its graph still holds it.
    const article = pageAt('news/harbour-lights');
    assert.deepEqual(shownOf(article), [['Home', '/'], ['News', '/news/']]);
    assert.deepEqual(breadcrumbsOf(article).list, breadcrumbList('/news/harbour-lights/', [['Home', '/'], ['News', '/news/'], ['Harbour lights', '/news/harbour-lights/']]));
    // One whose name in breadcrumbs is filled in ends with that name.
    assert.deepEqual(shownOf(pageAt('news/night-watch')), [['Home', '/'], ['News', '/news/'], ['Night watch', null]]);
    // A note right under the start page shows none, but in its graph.
    const tide = pageAt('notes/tide');
    assert.equal(tide.querySelector('nav'), null);
    assert.deepEqual(breadcrumbsOf(tide).list, breadcrumbList('/notes/tide/', [['Home', '/'], ['Tide', '/notes/tide/']]));
  });

  test('ends a type\'s breadcrumbs with the post itself as its setting says, but for a post whose name in breadcrumbs is filled in, which always does', () => {
    const pageAt = build('en_GB', { ending: { types: { post: { current: true }, page: { current: false }, note: { current: false } } }, given: [...posts(), ...more()] });

    assert.deepEqual(shownOf(pageAt('news/harbour-lights')), [['Home', '/'], ['News', '/news/'], ['Harbour lights', null]]);
    const anna = pageAt('about/keepers/anna');
    assert.deepEqual(shownOf(anna), [['Home', '/'], ['About the lantern', '/about/'], ['Keepers', '/about/keepers/']]);
    assert.deepEqual(breadcrumbsOf(anna).list, breadcrumbList('/about/keepers/anna/', [
      ['Home', '/'], ['About the lantern', '/about/'], ['Keepers', '/about/keepers/'], ['Anna Berg', '/about/keepers/anna/'],
    ]));
    assert.deepEqual(shownOf(pageAt('about/keepers')), [['Home', '/'], ['About the lantern', '/about/'], ['Keepers', null]]);
    // A page right under the start page that ends above itself shows none.
    assert.equal(pageAt('about').querySelector('nav'), null);
    assert.equal(pageAt('cookies').querySelector('nav'), null);
  });

  test('a site in Swedish names the start page Startsida and the navigation Brödsmulor', () => {
    const tide = build('sv_SE', { ending: always(true) })('notes/tide');

    assert.deepEqual(breadcrumbsOf(tide).list, breadcrumbList('/notes/tide/', [['Startsida', '/'], ['Tide', '/notes/tide/']]));
    assert.equal(tide.querySelector('nav').getAttribute('aria-label'), 'Brödsmulor');
    assert.equal(tide.querySelector('nav li').textContent, 'Startsida');
  });
  test('in a site in two languages, names a level by the label of the menu entry in the page\'s own language that leads to it', () => {
    // Pages about the lantern, English and Swedish, each with one below it.
    const translation = (one, locale, set) => ({ ...one, meta: { ...one.meta, _locale: [locale], ...(set ? { _original_post: [set] } : {}) } });
    const about = translation(page(3, 'about', 'About the lantern'), 'en_GB', 'lantern');
    const om = translation(page(13, 'om', 'Om lyktan'), 'sv_SE', 'lantern');
    const pageAt = build(undefined, {
      languages: ['en_GB', 'sv_SE'],
      // The English menu leads to the Swedish page too, which the Swedish one names otherwise.
      menus: { main: [{ title: 'The Swedish pages', post: 'lanternlante', url: '/sv/om/' }, { title: 'About us', post: 'lanternlante', url: '/en/about/' }] },
      translated: { sv_SE: { main: [{ title: 'Om oss', post: 'lanternlante', url: '/sv/om/' }] } },
      given: [about, translation(page(4, 'team', 'The team', about), 'en_GB'), om, translation(page(14, 'laget', 'Laget', om), 'sv_SE')],
    });

    const team = pageAt('en/about/team');
    assert.deepEqual(breadcrumbsOf(team).list, breadcrumbList('/en/about/team/', [['Home', '/en/'], ['About us', '/en/about/'], ['The team', '/en/about/team/']]));
    assert.deepEqual(shownOf(team), [['Home', '/en/'], ['About us', '/en/about/'], ['The team', null]]);
    const laget = pageAt('sv/om/laget');
    assert.deepEqual(breadcrumbsOf(laget).list, breadcrumbList('/sv/om/laget/', [['Startsida', '/sv/'], ['Om oss', '/sv/om/'], ['Laget', '/sv/om/laget/']]));
    assert.deepEqual(shownOf(laget), [['Startsida', '/sv/'], ['Om oss', '/sv/om/'], ['Laget', null]]);
  });
});
