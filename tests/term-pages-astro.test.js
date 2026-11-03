// Term pages on the site: Astro's static build of a small site
// whose categories declare an address, `/category/{slug}/`, and whose tags
// declare none. The integration puts the page of the site's design that
// `konzilo({ termPage })` names at each such taxonomy's address, and
// termPages() from `@kntnt/konzilo/astro/post-lists` gives it each term of
// the taxonomy with its posts, through the evaluator, newest first, ten a
// page, the posts of the term's children among them, as a term's
// archive has them, and the pager from page 2. Each page's head is the
// term's, a later page noindex, with the term's feed, and the sitemap lists
// each term's first page. A tag has no page, and a site whose taxonomy
// declares an address without a term page fails its build, naming it.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR, astroEnvironment } from './lib/astro.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

const repositories = [];
after(() => {
  for (const repository of repositories) rmSync(repository, { recursive: true, force: true });
});

const site = {
  language: 'en_GB',
  types: {
    post: {
      label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'],
      fields: { date: {}, categories: { taxonomy: 'category' }, tags: { taxonomy: 'tag' } },
    },
    // A second type that takes the categories , whose posts their
    // pages list too.
    note: {
      label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'],
      fields: { date: {}, categories: { taxonomy: 'category' } },
    },
  },
  taxonomies: {
    category: { label: 'Category', plural: 'Categories', collection: 'categories', hierarchical: true, address: '/category/{slug}/', feed: '/category/{slug}/feed/' },
    tag: { label: 'Tag', plural: 'Tags', collection: 'tags' },
  },
  presentations: {
    list: { label: 'List', options: { date: { label: 'Date', type: 'boolean', control: 'toggle' } } },
  },
};

const components = {
  'src/components/List.astro': [
    '---',
    `import Pager from ${JSON.stringify(join(core, 'src/astro/Pager.astro'))};`,
    'const { posts, empty, pager } = Astro.props;',
    '---',
    '{posts.length === 0 ? <p class="empty">{empty}</p> : <ul class="list">{posts.map(({ entry, url }) => <li><a href={url}>{entry.data.title}</a></li>)}</ul>}',
    '{pager && <Pager pager={pager} />}',
    '',
  ].join('\n'),
  // The term page: the term's name and description, then its posts.
  'src/components/TermPage.astro': [
    '---',
    // As `@kntnt/konzilo/astro/post-lists`, which this site has not installed.
    `import { termPages } from ${JSON.stringify(join(core, 'src/astro/post-lists.js'))};`,
    `import Head from ${JSON.stringify(join(core, 'src/astro/Head.astro'))};`,
    "import List from './List.astro';",
    'export async function getStaticPaths({ routePattern }) {',
    '  return termPages(routePattern);',
    '}',
    'const { term, page, posts, pager, empty } = Astro.props;',
    '---',
    '<html><head><Head entry={term} page={page} /></head><body>',
    '<main><h1>{term.data.name}</h1>{term.data.description && <p>{term.data.description}</p>}<List posts={posts} empty={empty} pager={pager} /></main>',
    '</body></html>',
    '',
  ].join('\n'),
  'src/pages/[...slug].astro': [
    '---',
    "import { getCollection } from 'astro:content';",
    'export async function getStaticPaths() {',
    "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
    '}',
    'const { entry } = Astro.props;',
    '---',
    '<html><body><main>{entry.data.title}</main></body></html>',
    '',
  ].join('\n'),
};
const options = { presentations: { list: './src/components/List.astro' }, termPage: './src/components/TermPage.astro' };

const article = (n, categories, tags = []) => [
  '---',
  `title: "Article ${String(n).padStart(2, '0')}"`,
  `date: 2026-01-${String(n).padStart(2, '0')}T08:00:00Z`,
  `categories: ${JSON.stringify(categories)}`,
  `tags: ${JSON.stringify(tags)}`,
  '---',
  '',
  'Text.',
  '',
].join('\n');

const term = (data) => `${JSON.stringify(data, null, 2)}\n`;

const note = (n, day, categories) => [
  '---',
  `title: "Note ${n}"`,
  `date: 2026-01-${String(day).padStart(2, '0')}T08:00:00Z`,
  `categories: ${JSON.stringify(categories)}`,
  '---',
  '',
  'Text.',
  '',
].join('\n');

// Twelve articles in News, the last of them in its child Local news, and
// one in Sport, filed under the tag Local too; a note in Sport, newer than
// its article, and one in Events, which no article has; and Quiet, which
// no post has.
const content = {
  'content/categories/news.json': term({ name: 'News', description: 'What happens.' }),
  'content/categories/local-news.json': term({ name: 'Local news', parent: 'news' }),
  'content/categories/sport.json': term({ name: 'Sport' }),
  'content/categories/events.json': term({ name: 'Events' }),
  'content/categories/quiet.json': term({ name: 'Quiet' }),
  'content/tags/local.json': term({ name: 'Local' }),
  ...Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`content/articles/a${String(i + 1).padStart(2, '0')}.md`, article(i + 1, ['news'])])),
  'content/articles/a12.md': article(12, ['local-news']),
  'content/articles/a13.md': article(13, ['sport'], ['local']),
  'content/notes/n1.md': note(1, 20, ['sport']),
  'content/notes/n2.md': note(2, 21, ['events']),
};

// A site repository with `files`, built; { status, output, main(path), head(path), has(path), text(path) }.
function build(files, given = options) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-term-pages-'));
  repositories.push(repository);
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  const write = (path, contents) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  };
  write('astro.config.mjs', `import konzilo from ${JSON.stringify(integration)};\n\nexport default { cacheDir: './${CACHE_DIR}', integrations: [konzilo(${JSON.stringify(given)})] };\n`);
  write('src/content.config.mjs', `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`);
  write('site-description.json', JSON.stringify(site));
  for (const [path, contents] of Object.entries({ ...components, ...content, ...files })) write(path, contents);
  const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
  const file = (path) => join(repository, 'dist', path);
  const part = (tag) => (path) => new RegExp(`<${tag}>(.*)</${tag}>`, 's').exec(readFileSync(file(join(path, 'index.html')), 'utf8'))?.[1].replaceAll('\n', '');
  return { status: built.status, output: `${built.stdout}\n${built.stderr}`, main: part('main'), head: part('head'), has: (path) => existsSync(file(path)), text: (path) => readFileSync(file(path), 'utf8') };
}

describe('a site whose categories have pages', () => {
  const built = build({});
  const listed = (...numbers) => `<ul class="list">${numbers.map((n) => `<li><a href="/a${String(n).padStart(2, '0')}/">Article ${String(n).padStart(2, '0')}</a></li>`).join('')}</ul>`;

  test('builds each category\'s page at its address, its name, its description and its posts newest first, those of its children among them, ten a page', () => {
    assert.equal(built.status, 0, built.output);
    const first = built.main('category/news');
    assert.ok(first.startsWith(`<h1>News</h1><p>What happens.</p>${listed(12, 11, 10, 9, 8, 7, 6, 5, 4, 3)}<nav class="konzilo-pager" aria-label="Pages">`), first);
    assert.match(first, /<a href="\/category\/news\/page\/2\/" rel="next">Next page<\/a>/);
    assert.ok(built.main('category/news/page/2').startsWith(`<h1>News</h1><p>What happens.</p>${listed(2, 1)}<nav`));
    assert.equal(built.has('category/news/page/3/index.html'), false);
    assert.equal(built.main('category/local-news'), `<h1>Local news</h1>${listed(12)}`);
    assert.equal(built.main('category/sport'), `<h1>Sport</h1><ul class="list"><li><a href="/notes/n1/">Note 1</a></li>${listed(13).slice('<ul class="list">'.length)}`);
  });

  // Several types may take one taxonomy, and a term's feed holds the
  // posts of each; so does its page , in one list, newest first.
  test('lists the posts of every type that takes the taxonomy, and says the core\'s text in the site\'s language where a term has none', () => {
    assert.equal(built.status, 0, built.output);
    assert.equal(built.main('category/events'), '<h1>Events</h1><ul class="list"><li><a href="/notes/n2/">Note 2</a></li></ul>');
    assert.equal(built.main('category/quiet'), '<h1>Quiet</h1><p class="empty">Nothing to show yet.</p>');
  });

  test('gives a tag, whose taxonomy declares no address, no page', () => {
    assert.equal(built.status, 0, built.output);
    assert.equal(built.has('tag'), false);
    assert.equal(built.has('local/index.html'), false);
  });

  test('makes a term\'s page canonical to itself, its later pages noindex and out of the sitemap, and links its feed', () => {
    assert.equal(built.status, 0, built.output);
    const canonical = (path) => /<link rel="canonical" href="([^"]*)"/.exec(built.head(path))?.[1];
    const robots = (path) => /<meta name="robots" content="([^"]*)"/.exec(built.head(path))?.[1];
    assert.equal(canonical('category/news'), 'https://www.example.com/category/news/');
    assert.equal(robots('category/news'), undefined);
    assert.match(built.head('category/news'), /<title>News[^<]*<\/title>/);
    assert.match(built.head('category/news'), /<meta name="description" content="What happens\."/);
    assert.equal(canonical('category/news/page/2'), 'https://www.example.com/category/news/page/2/');
    assert.equal(robots('category/news/page/2'), 'noindex');
    assert.match(built.head('category/news'), /<link rel="alternate" type="application\/rss\+xml" href="https:\/\/www\.example\.com\/category\/news\/feed\/" title="News"/);
    const sitemap = built.text('sitemap.xml');
    for (const path of ['/category/news/', '/category/local-news/', '/category/sport/']) assert.ok(sitemap.includes(`<loc>https://www.example.com${path}</loc>`), path);
    assert.doesNotMatch(sitemap, /\/page\/\d/);
  });

  // Page 1 of a term's posts is the term's own page (#138, #139).
  test('leads each term\'s page/1/ to its page with 301, as a post list\'s', () => {
    assert.equal(built.status, 0, built.output);
    const lines = built.text('_redirects').split('\n');
    for (const path of ['/category/news/', '/category/local-news/', '/category/sport/']) assert.ok(lines.includes(`${path}page/1/ ${path} 301`), path);
    assert.match(built.text('category/news/page/1/index.html'), /<meta http-equiv="refresh" content="0;url=\/category\/news\/">/);
    assert.ok(!lines.some((line) => line.startsWith('/tag/')));
  });

  // Every page but the start page has breadcrumbs : a term's page
  // has the start page and the term, named by its name, as its levels, its
  // later pages too, as a post's later pages have the post's.
  test('gives each term\'s page, and its later pages, breadcrumbs of the start page and the term, by its name', () => {
    assert.equal(built.status, 0, built.output);
    const levels = (path) => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(built.head(path))[1])['@graph']
      .find((node) => node['@type'] === 'BreadcrumbList')?.itemListElement.map(({ name, item }) => [name, item]);
    const home = ['Home', 'https://www.example.com/'];
    assert.deepEqual(levels('category/news'), [home, ['News', 'https://www.example.com/category/news/']]);
    assert.deepEqual(levels('category/news/page/2'), [home, ['News', 'https://www.example.com/category/news/']]);
    assert.deepEqual(levels('category/local-news'), [home, ['Local news', 'https://www.example.com/category/local-news/']]);
  });

  test('fails the build of a site whose taxonomy declares an address the site\'s design gives no term page for, naming it', () => {
    const failed = build({}, { presentations: options.presentations });
    assert.notEqual(failed.status, 0);
    assert.match(failed.output, /the site description gives the terms of category pages at \/category\/\{slug\}\/, which the site's design does not give in konzilo\(\{ termPage \}\)/);
  });
});
