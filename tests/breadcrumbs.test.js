// Breadcrumbs: the levels a page sits at, from its address
// alone: the start page, named in the site's language, each shorter address
// the page's address starts with at which a post answers, of any type, and
// the page itself, each post named by its name in breadcrumbs, else its
// title. Every page but the start page carries them in its structured data
// as a BreadcrumbList, which its WebPage names, and the integration's
// Breadcrumbs component shows the same levels where a design places it.
//
// A small site built with `astro build` for https://www.example.com, from
// content files the intake's command writes: articles below /news/, where
// a page of the site answers, notes below /notes/, where nothing does, a
// tree of pages three levels deep, and a page of the design's own below one
// of them. Built again below a preview's base, and again in Swedish.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { paragraphs, post, writeContent } from './lib/content.js';

const ORIGIN = 'https://www.example.com';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');
const { JSDOM } = createRequire(join(core, 'package.json'))('jsdom');

// Articles below /news/, pages at their paths from the root, and notes
// below /notes/, in `language`.
const site = (language) => ({
  language,
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/news/{slug}/', elements: ['paragraph'] },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/{path}/', elements: ['paragraph'] },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'] },
  },
});

// A route of the design for a collection's entries, at `parameter`.
const route = (collection, layout, parameter = 'slug') => [
  '---',
  "import { getCollection } from 'astro:content';",
  `import Page from '${layout}';`,
  'export async function getStaticPaths() {',
  `  return (await getCollection('${collection}')).map((entry) => ({ params: { ${parameter}: entry.id }, props: { entry } }));`,
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
  'src/pages/news/[slug].astro': route('articles', '../../layouts/Page.astro'),
  'src/pages/notes/[slug].astro': route('notes', '../../layouts/Page.astro'),
  'src/pages/[...path].astro': route('pages', '../layouts/Page.astro', 'path'),
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

let repository;

function write(path, contents) {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), contents);
}

// Export the posts for a site in `language` and build it, below `base` if
// given, and give each page's document by its path.
// Each type's breadcrumbs end with the page itself unless `current` is false.
function build(language, base, current = true) {
  write('site-description.json', JSON.stringify(site(language)));
  const ending = { types: Object.fromEntries(['post', 'page', 'note'].map((type) => [type, { current }])) };
  write('site-settings.json', JSON.stringify({ menus: {}, settings: { breadcrumbs: ending }, redirects: [], identity: { title: 'The Quiet Lantern', logo: null, icon: null } }));
  const exported = writeContent(repository, posts());
  assert.equal(exported.status, 0, exported.stderr);
  const built = spawnSync(process.execPath, [astro, 'build', ...(base ? ['--base', base] : [])], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  return (path) => new JSDOM(readFileSync(join(repository, 'dist', path, 'index.html'), 'utf8')).window.document;
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
    const pageAt = build('en_GB');

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

  test('in a preview, below its base, the links keep the base and the graph the public host', () => {
    const anna = build('en_GB', '/preview/')('about/keepers/anna');

    assert.deepEqual([...anna.querySelectorAll('nav a')].map((link) => link.getAttribute('href')), ['/preview/', '/preview/about/', '/preview/about/keepers/']);
    assert.deepEqual(breadcrumbsOf(anna).list.itemListElement.map(({ item }) => item), [`${ORIGIN}/`, `${ORIGIN}/about/`, `${ORIGIN}/about/keepers/`, `${ORIGIN}/about/keepers/anna/`]);
  });

  test("by default ends a page's breadcrumbs above the page itself, which its graph still holds, and shows none right under the start page", () => {
    const pageAt = build('en_GB', undefined, false);
    const anna = pageAt('about/keepers/anna');
    assert.deepEqual(breadcrumbsOf(anna).list, breadcrumbList('/about/keepers/anna/', [
      ['Home', '/'], ['About the lantern', '/about/'], ['Keepers', '/about/keepers/'], ['Anna Berg', '/about/keepers/anna/'],
    ]));
    assert.equal(anna.querySelector('main').firstElementChild.outerHTML, [
      '<nav aria-label="Breadcrumbs"><ol>',
      '<li><a href="/">Home</a></li>',
      '<li><a href="/about/">About the lantern</a></li>',
      '<li><a href="/about/keepers/">Keepers</a></li>',
      '</ol></nav>',
    ].join(''));
    const about = pageAt('about');
    assert.deepEqual(breadcrumbsOf(about).list, breadcrumbList('/about/', [['Home', '/'], ['About the lantern', '/about/']]));
    assert.equal(about.querySelector('nav'), null);
  });

  test('a site in Swedish names the start page Startsida and the navigation Brödsmulor', () => {
    const tide = build('sv_SE')('notes/tide');

    assert.deepEqual(breadcrumbsOf(tide).list, breadcrumbList('/notes/tide/', [['Startsida', '/'], ['Tide', '/notes/tide/']]));
    assert.equal(tide.querySelector('nav').getAttribute('aria-label'), 'Brödsmulor');
    assert.equal(tide.querySelector('nav li').textContent, 'Startsida');
  });
});
