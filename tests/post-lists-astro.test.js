// Post lists on the site: Astro's static build of a small site
// whose pages hold post lists. The integration evaluates each list against
// the content collections, in the body's order, and renders it with the
// presentation the site registers for it (`konzilo({ presentations })`),
// given the posts as their entries with their addresses, the options and
// the empty text, through `<Body post={entry}><Content /></Body>`. A list
// leaves out the post it sits in and the posts the lists above showed, a
// list that matches nothing shows its text or the site's, and a build of a
// site description that declares a presentation the design does not
// register fails, naming it.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR, astroEnvironment } from './lib/astro.js';
import { settingsFile } from './lib/content.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');
const { default: konzilo } = await import('@kntnt/konzilo/astro');

const repositories = [];
after(() => {
  for (const repository of repositories) rmSync(repository, { recursive: true, force: true });
});

const site = {
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    post: {
      label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'post-list'],
      fields: { date: {}, sections: { taxonomy: 'section' }, labels: { taxonomy: 'label' } },
    },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph', 'post-list'], fields: {} },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', elements: ['paragraph'], fields: {} },
  },
  taxonomies: {
    section: { label: 'Section', plural: 'Sections', collection: 'sections' },
    label: { label: 'Label', plural: 'Labels', collection: 'labels' },
  },
  presentations: {
    list: { label: 'List', options: { date: { label: 'Date', type: 'boolean', control: 'toggle' } } },
    cards: { label: 'Cards', options: { columns: { label: 'Columns', type: 'string', control: 'select', options: ['2', '3', '4'] } } },
  },
};

// The site's presentations: each shows what it is given, the list with the
// integration's pager after it, for a list with pages.
const components = {
  'src/components/List.astro': [
    '---',
    `import Pager from ${JSON.stringify(join(core, 'src/astro/Pager.astro'))};`,
    'const { posts, options, empty, pager } = Astro.props;',
    '---',
    '{posts.length === 0 ? <p class="empty">{empty}</p> : <ul class="list" data-date={String(options.date)}>{posts.map(({ entry, url }) => <li>{url ? <a href={url}>{entry.data.title}</a> : entry.data.title}</li>)}</ul>}',
    '{pager && <Pager pager={pager} />}',
    '',
  ].join('\n'),
  'src/components/Cards.astro': [
    '---',
    'const { posts, options, empty } = Astro.props;',
    '---',
    '{posts.length === 0 ? <p class="empty">{empty}</p> : <div class="cards" data-columns={options.columns}>{posts.map(({ entry, url }) => <a class="card" href={url}>{entry.data.title}</a>)}</div>}',
    '',
  ].join('\n'),
};
const presentations = { list: './src/components/List.astro', cards: './src/components/Cards.astro' };

// A page per post of a collection, and one per later page of a list with
// pages, from a route with a rest parameter in place of the address's slug
// or path: its head through Head, its body through Body, and the posts
// `related` gives, by default the two most related to it, which the
// template asks the evaluator for.
const template = (collection, related = collection === 'articles' ? "await listedPosts({ type: 'post', order: 'related', number: 2 }, { post: entry })" : '[]') => [
  '---',
  "import { getCollection, render } from 'astro:content';",
  // As `@kntnt/konzilo/astro/post-lists`, which this site has not installed.
  `import { listedPosts, postPages, relatedPosts } from ${JSON.stringify(join(core, 'src/astro/post-lists.js'))};`,
  `import Body from ${JSON.stringify(join(core, 'src/astro/Body.astro'))};`,
  `import Head from ${JSON.stringify(join(core, 'src/astro/Head.astro'))};`,
  'export async function getStaticPaths() {',
  `  return (await postPages(await getCollection(${JSON.stringify(collection)}))).map(({ entry, page, param }) => ({ params: { slug: param }, props: { entry, page } }));`,
  '}',
  'const { entry, page } = Astro.props;',
  'const { Content } = await render(entry);',
  `const related = ${related};`,
  '---',
  '<html><head><Head entry={entry} page={page} /></head><body>',
  '<main><Body post={entry} page={page}><Content /></Body></main>',
  '<aside>{related.map(({ entry: one, url }) => `${one.data.title} ${url}`).join(", ")}</aside>',
  '</body></html>',
  '',
].join('\n');

const article = (title, day, sections, labels = [], body = 'Text.') => [
  '---',
  `title: ${JSON.stringify(title)}`,
  `date: 2026-${day}T08:00:00Z`,
  `sections: ${JSON.stringify(sections)}`,
  `labels: ${JSON.stringify(labels)}`,
  '---',
  '',
  body,
  '',
].join('\n');

const term = (name) => `${JSON.stringify({ name }, null, 2)}\n`;

const content = {
  'content/sections/news.json': term('News'),
  'content/sections/business.json': term('Business'),
  'content/sections/culture.json': term('Culture'),
  'content/labels/local.json': term('Local'),
  'content/labels/sport.json': term('Sport'),
  'content/articles/alpha.md': article('Alpha', '01-01', ['news'], ['local'], '::post-list{type="post" order="related" presentation="list"}'),
  'content/articles/bravo.md': article('Bravo', '02-01', ['news'], ['sport']),
  'content/articles/charlie.md': article('Charlie', '03-01', ['news']),
  'content/articles/delta.md': article('Delta', '04-01', ['news']),
  'content/articles/echo.md': article('Echo', '05-01', ['business'], ['local']),
  'content/notes/first.md': '---\ntitle: "First note"\n---\n\nA note.\n',
  'content/pages/start.md': [
    '---',
    'title: "Start"',
    '---',
    '',
    'Intro',
    '',
    '::post-list{type="post" include="section:news" exclude="label:sport" order="title" presentation="cards" columns="3"}',
    '',
    '::post-list{type="post" include="section:news" order="title" number="2" presentation="list"}',
    '',
    '::post-list{type="post" include="section:news" order="title" number="2" leaveOutShown="false" presentation="list" date="true"}',
    '',
    '::post-list{type="post" include="section:culture" presentation="list" empty="No culture yet."}',
    '',
    '::post-list{type="post" include="section:culture" presentation="list"}',
    '',
    '::post-list{type="note" presentation="list"}',
    '',
  ].join('\n'),
};

// A site repository with `files`, built, its content `base` with `files` over
// it, in the environment `env` adds to the suite's; { status, output,
// main(path) }.
function build(files, options, { base = content, env = {} } = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-post-lists-'));
  repositories.push(repository);
  // The core's dependencies, each on its own, for a package of the site's to stand among them.
  mkdirSync(join(repository, 'node_modules'));
  for (const entry of readdirSync(join(core, 'node_modules'))) {
    if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
  }
  const write = (path, contents) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  };
  write('astro.config.mjs', `import konzilo from ${JSON.stringify(integration)};\n\nexport default { cacheDir: './${CACHE_DIR}', vite: { cacheDir: './${CACHE_DIR}/vite' }, integrations: [konzilo(${JSON.stringify(options)})] };\n`);
  write('src/content.config.mjs', `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`);
  write('site-description.json', JSON.stringify(site));
  write('src/pages/[...slug].astro', template('articles'));
  write('src/pages/pages/[...slug].astro', template('pages'));
  for (const [path, contents] of Object.entries({ ...components, ...base, ...files })) write(path, contents);
  const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: { ...astroEnvironment, ...env } });
  const file = (path) => join(repository, 'dist', path);
  const part = (tag) => (path) => new RegExp(`<${tag}>(.*)</${tag}>`, 's').exec(readFileSync(file(join(path, 'index.html')), 'utf8'))?.[1].replaceAll('\n', '');
  const has = (path) => existsSync(file(path));
  const text = (path) => readFileSync(file(path), 'utf8');
  return { status: built.status, output: `${built.stdout}\n${built.stderr}`, main: part('main'), aside: part('aside'), head: part('head'), has, text };
}

describe('Astro', () => {
  const built = build({}, { presentations, emptyList: 'Nothing here yet.' });

  test('renders each list with its presentation, in the body\'s order, leaving out the posts the lists above showed unless told not to', () => {
    assert.equal(built.status, 0, built.output);
    assert.equal(built.main('pages/start'), [
      '<p>Intro</p>',
      '<div class="cards" data-columns="3"><a class="card" href="/alpha/">Alpha</a><a class="card" href="/charlie/">Charlie</a><a class="card" href="/delta/">Delta</a></div>',
      '<ul class="list" data-date="false"><li><a href="/bravo/">Bravo</a></li></ul>',
      '<ul class="list" data-date="true"><li><a href="/alpha/">Alpha</a></li><li><a href="/bravo/">Bravo</a></li></ul>',
      '<p class="empty">No culture yet.</p>',
      '<p class="empty">Nothing here yet.</p>',
      '<ul class="list" data-date="false"><li>First note</li></ul>',
    ].join(''));
  });

  test('ranks the posts related to the post a list sits in, leaving it out', () => {
    assert.equal(built.status, 0, built.output);
    // Each shares one term with Alpha: News, or Echo's Local.
    assert.equal(built.main('alpha'), '<ul class="list" data-date="false"><li><a href="/echo/">Echo</a></li><li><a href="/delta/">Delta</a></li><li><a href="/charlie/">Charlie</a></li><li><a href="/bravo/">Bravo</a></li></ul>');
  });

  test("gives a site's template the posts a list's settings name, the related posts of an article among them", () => {
    assert.equal(built.status, 0, built.output);
    assert.equal(built.aside('alpha'), 'Echo /echo/, Delta /delta/');
  });

  test('says what is wrong with a refused site description, and not that a presentation is undeclared', () => {
    const failed = build({ 'site-description.json': JSON.stringify({ ...site, language: 'not a language' }) }, { presentations });
    assert.notEqual(failed.status, 0);
    assert.doesNotMatch(failed.output, /presentation/);
    assert.match(failed.output, /language/);
  });

  test('takes a presentation from a package, by the package\'s name', () => {
    const fromPackage = build({
      'node_modules/@acme/design/package.json': JSON.stringify({ name: '@acme/design', version: '1.0.0', type: 'module', exports: { './*.astro': './*.astro' }, peerDependencies: { astro: '*' } }),
      'node_modules/@acme/design/Cards.astro': components['src/components/Cards.astro'],
      'package.json': JSON.stringify({ name: 'a-site', dependencies: { '@acme/design': '1.0.0' } }),
    }, { presentations: { list: presentations.list, cards: '@acme/design/Cards.astro' }, emptyList: 'Nothing here yet.' });
    assert.equal(fromPackage.status, 0, fromPackage.output);
    assert.equal(fromPackage.main('pages/start'), built.main('pages/start'));
  });

  test('fails the build of a site description that declares a presentation the design does not register, naming it', () => {
    const failed = build({}, { presentations: { list: presentations.list } });
    assert.notEqual(failed.status, 0);
    assert.match(failed.output, /the site description declares the presentation cards, which the site's design does not register in konzilo\(\{ presentations \}\)/);
  });

  test('fails the build of a content file with a list the site cannot publish, naming the file, the line and the reason', () => {
    const failed = build({ 'content/pages/other.md': '---\ntitle: "Other"\n---\n\n::post-list{type="post" presentation="slides"}\n' }, { presentations });
    assert.notEqual(failed.status, 0);
    assert.match(failed.output, /content\/pages\/other\.md: line 5: the site has no presentation "slides" for a list; it has list and cards/);
  });
});

// "Read more" and a list ordered as related, on a site with the built-in
// article: fictional articles related to Lantern, which has the topics
// harbour and light, the category stories and the author Ines. Each article's
// template shows what relatedPosts() gives it, and Lantern's body holds a list
// ordered as related, which shows them all.
describe('related posts of an article', () => {
  const described = {
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'post-list'] },
      page: { collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph'] },
    },
    presentations: site.presentations,
  };
  const piece = (title, day, { topics = [], category = [], authors = [] }, body = 'Text.') => [
    '---',
    `title: ${JSON.stringify(title)}`,
    `date: ${day}T08:00:00Z`,
    `modified: ${day}T08:00:00Z`,
    `headline: ${JSON.stringify(title)}`,
    `authors: ${JSON.stringify(authors)}`,
    `category: ${JSON.stringify(category)}`,
    `topics: ${JSON.stringify(topics)}`,
    '---',
    '',
    body,
    '',
  ].join('\n');
  const files = {
    'site-description.json': JSON.stringify(described),
    'src/pages/[...slug].astro': template('articles', 'await relatedPosts(entry)'),
    'content/authors/ines.json': term('Ines Holm'),
    'content/categories/stories.json': term('Stories'),
    'content/categories/essays.json': term('Essays'),
    'content/categories/travel.json': term('Travel'),
    ...Object.fromEntries(['harbour', 'light', 'sand', 'ice'].map((slug) => [`content/topics/${slug}.json`, term(slug)])),
    'content/articles/lantern.md': piece('Lantern', '2026-10-15', { topics: ['harbour', 'light'], category: ['stories'], authors: ['ines'] }, '::post-list{type="article" order="related" presentation="list"}'),
    // Scored by hand: a point for each topic shared, half a point for the
    // same category, and none for an author.
    'content/articles/anchor.md': piece('Anchor', '2025-01-01', { topics: ['harbour', 'light'], category: ['stories'] }), // 2.5
    'content/articles/beacon.md': piece('Beacon', '2026-09-01', { topics: ['harbour'], category: ['stories'] }), // 1.5
    'content/articles/cove.md': piece('Cove', '2026-06-01', { topics: ['harbour', 'light'], category: ['essays'] }), // 2
    'content/articles/dune.md': piece('Dune', '2026-10-01', { topics: ['sand'], category: ['stories'] }), // 0.5
    'content/articles/ember.md': piece('Ember', '2026-10-10', { topics: ['sand'], category: ['essays'], authors: ['ines'] }), // 0
    'content/articles/fjord.md': piece('Fjord', '2026-10-12', { topics: ['ice'], category: ['travel'] }), // 0
  };
  const settings = (related) => ({ 'content/settings.json': settingsFile(described, { groups: { related } }) });
  const listed = (...titles) => `<ul class="list" data-date="false">${titles.map((title) => `<li><a href="/${title.toLowerCase()}/">${title}</a></li>`).join('')}</ul>`;
  const read = (...titles) => titles.map((title) => `${title} /${title.toLowerCase()}/`).join(', ');

  // By hand, each score times 2^(-days before Dune / half-life), Dune's day as
  // good as any, since every article ages alike: at 90 days Beacon 1.19, Cove
  // 0.78, Dune 0.5, Anchor 0.02; at 365 days Cove 1.59, Beacon 1.42, Anchor
  // 0.74, Dune 0.5.
  test('gives a template the three most related, and ranks a list ordered as related the same, with freshness halving every 90 days by default', () => {
    const built = build(files, { presentations }, { base: {} });
    assert.equal(built.status, 0, built.output);
    assert.equal(built.main('lantern'), listed('Beacon', 'Cove', 'Dune', 'Anchor'));
    assert.equal(built.aside('lantern'), read('Beacon', 'Cove', 'Dune'));
    // Fewer than three where fewer share a topic or the category, and none
    // where none does.
    assert.equal(built.aside('ember'), read('Dune', 'Cove'));
    assert.equal(built.aside('fjord'), '');
  });

  test('ranks the same at a build ten years later', () => {
    // The build's clock, set ten years ahead.
    const later = `data:text/javascript,${encodeURIComponent('const now = Date.now; Date.now = () => now() + 3652 * 86400000;')}`;
    const built = build(files, { presentations }, { base: {}, env: { NODE_OPTIONS: `--import=${later}` } });
    assert.equal(built.status, 0, built.output);
    assert.equal(built.main('lantern'), listed('Beacon', 'Cove', 'Dune', 'Anchor'));
    assert.equal(built.aside('lantern'), read('Beacon', 'Cove', 'Dune'));
  });

  test('takes the half-life from the settings, and with freshness switched off lets only the score, then the date, decide', () => {
    const slower = build({ ...files, ...settings({ halfLife: 365 }) }, { presentations }, { base: {} });
    assert.equal(slower.status, 0, slower.output);
    assert.equal(slower.main('lantern'), listed('Cove', 'Beacon', 'Anchor', 'Dune'));
    assert.equal(slower.aside('lantern'), read('Cove', 'Beacon', 'Anchor'));
    const off = build({ ...files, ...settings({ freshness: false }) }, { presentations }, { base: {} });
    assert.equal(off.status, 0, off.output);
    assert.equal(off.main('lantern'), listed('Anchor', 'Cove', 'Beacon', 'Dune'));
    assert.equal(off.aside('lantern'), read('Anchor', 'Cove', 'Beacon'));
  });
});

// A list with pages: 25 articles in the section Paged, Article
// 01 to Article 25, listed by title in the page News, ten a page after the
// very first, below a list of the first two and above a list of one.
describe('a list with pages', () => {
  const articles = Object.fromEntries(Array.from({ length: 25 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return [`content/articles/a${n}.md`, article(`Article ${n}`, `01-${n}`, ['paged'])];
  }));
  const news = [
    '---',
    'title: "News"',
    '---',
    '',
    '::post-list{type="post" include="section:paged" order="title" number="2" presentation="cards"}',
    '',
    '::post-list{type="post" include="section:paged" order="title" offset="1" pages="true" presentation="list"}',
    '',
    '::post-list{type="post" include="section:paged" order="title" number="1" presentation="list" date="true"}',
    '',
  ].join('\n');
  const built = build({ 'content/sections/paged.json': term('Paged'), 'content/pages/news.md': news, ...articles }, { presentations });
  const numbers = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => String(from + i).padStart(2, '0'));
  const listed = (from, to) => `<ul class="list" data-date="false">${numbers(from, to).map((n) => `<li><a href="/a${n}/">Article ${n}</a></li>`).join('')}</ul>`;
  const above = '<div class="cards"><a class="card" href="/a01/">Article 01</a><a class="card" href="/a02/">Article 02</a></div>';
  const below = '<ul class="list" data-date="true"><li><a href="/a03/">Article 03</a></li></ul>';
  // The pager, written by hand: each page linked, the current one marked,
  // and the pages before and after it.
  const pagers = {
    1: '<nav class="konzilo-pager" aria-label="Pages"><ul>'
      + '<li><a href="/pages/news/" aria-label="Page 1" aria-current="page">1</a></li>'
      + '<li><a href="/pages/news/page/2/" aria-label="Page 2">2</a></li>'
      + '<li><a href="/pages/news/page/3/" aria-label="Page 3">3</a></li>'
      + '<li class="konzilo-pager-next"><a href="/pages/news/page/2/" rel="next">Next page</a></li>'
      + '</ul></nav>',
    2: '<nav class="konzilo-pager" aria-label="Pages"><ul>'
      + '<li class="konzilo-pager-previous"><a href="/pages/news/" rel="prev">Previous page</a></li>'
      + '<li><a href="/pages/news/" aria-label="Page 1">1</a></li>'
      + '<li><a href="/pages/news/page/2/" aria-label="Page 2" aria-current="page">2</a></li>'
      + '<li><a href="/pages/news/page/3/" aria-label="Page 3">3</a></li>'
      + '<li class="konzilo-pager-next"><a href="/pages/news/page/3/" rel="next">Next page</a></li>'
      + '</ul></nav>',
    3: '<nav class="konzilo-pager" aria-label="Pages"><ul>'
      + '<li class="konzilo-pager-previous"><a href="/pages/news/page/2/" rel="prev">Previous page</a></li>'
      + '<li><a href="/pages/news/" aria-label="Page 1">1</a></li>'
      + '<li><a href="/pages/news/page/2/" aria-label="Page 2">2</a></li>'
      + '<li><a href="/pages/news/page/3/" aria-label="Page 3" aria-current="page">3</a></li>'
      + '</ul></nav>',
  };

  test("builds each page at the post's address and below its page/, the list's slice in place and the other lists on their first slice", () => {
    assert.equal(built.status, 0, built.output);
    assert.equal(built.main('pages/news'), `${above}${listed(4, 13)}${pagers[1]}${below}`);
    assert.equal(built.main('pages/news/page/2'), `${above}${listed(14, 23)}${pagers[2]}${below}`);
    assert.equal(built.main('pages/news/page/3'), `${above}${listed(24, 25)}${pagers[3]}${below}`);
    assert.equal(built.has('pages/news/page/4/index.html'), false);
  });

  test('leads page/1/ to the post with 301', () => {
    assert.equal(built.status, 0, built.output);
    assert.match(built.text('_redirects'), /^\/pages\/news\/page\/1\/ \/pages\/news\/ 301$/m);
  });

  test('makes each page canonical to itself, and from page 2 noindex and out of the sitemap', () => {
    assert.equal(built.status, 0, built.output);
    const canonical = (path) => /<link rel="canonical" href="([^"]*)"/.exec(built.head(path))?.[1];
    const robots = (path) => /<meta name="robots" content="([^"]*)"/.exec(built.head(path))?.[1];
    assert.equal(canonical('pages/news'), 'https://www.example.com/pages/news/');
    assert.equal(robots('pages/news'), undefined);
    assert.equal(canonical('pages/news/page/2'), 'https://www.example.com/pages/news/page/2/');
    assert.equal(robots('pages/news/page/2'), 'noindex');
    const sitemap = built.text('sitemap.xml');
    assert.match(sitemap, /<loc>https:\/\/www\.example\.com\/pages\/news\/<\/loc>/);
    assert.doesNotMatch(sitemap, /\/page\/\d/);
  });

  test('builds the pages below a base of its own, as the preview is, the pager and page/1/ leading below it', () => {
    const config = `import konzilo from ${JSON.stringify(integration)};\n\nexport default { base: '/preview/abc/', cacheDir: './${CACHE_DIR}', vite: { cacheDir: './${CACHE_DIR}/vite' }, integrations: [konzilo(${JSON.stringify({ presentations })})] };\n`;
    const preview = build({ 'content/sections/paged.json': term('Paged'), 'content/pages/news.md': news, ...articles, 'astro.config.mjs': config }, { presentations });
    assert.equal(preview.status, 0, preview.output);
    assert.match(preview.main('pages/news/page/2'), /<a href="\/preview\/abc\/pages\/news\/page\/2\/" aria-label="Page 2" aria-current="page">2<\/a>/);
    assert.match(preview.main('pages/news/page/2'), /<a href="\/preview\/abc\/pages\/news\/" rel="prev">Previous page<\/a>/);
    assert.equal(preview.has('pages/news/page/3/index.html'), true);
    assert.match(preview.text('_redirects'), /^\/preview\/abc\/pages\/news\/page\/1\/ \/preview\/abc\/pages\/news\/ 301$/m);
  });

  test("warns, building, of a list with pages whose type's route builds no later page, as a site's route from before them", () => {
    const before = template('pages')
      .replace('postPages(await getCollection("pages"))', '(await getCollection("pages")).map((entry) => ({ entry, page: 1, param: entry.id }))');
    assert.notEqual(before, template('pages'));
    const old = build({ 'content/sections/paged.json': term('Paged'), 'content/pages/news.md': news, ...articles, 'src/pages/pages/[...slug].astro': before }, { presentations });
    assert.equal(old.status, 0, old.output);
    assert.equal(old.has('pages/news/page/2/index.html'), false);
    assert.match(old.output, /the list with pages in the post at \/pages\/news\/ has no page 2, since the site's route for its type builds no later page: build them with postPages\(\) from @kntnt\/konzilo\/astro\/post-lists/);
    assert.doesNotMatch(built.output, /has no page 2/);
  });

  test('fails the build of a post with a second list with pages, naming it', () => {
    const twice = '::post-list{type="post" pages="true" presentation="list"}\n\n::post-list{type="post" pages="true" presentation="list"}\n';
    const failed = build({ 'content/pages/twice.md': `---\ntitle: "Twice"\n---\n\n${twice}` }, { presentations });
    assert.notEqual(failed.status, 0);
    assert.match(failed.output, /a post list in pages\/twice: the site cannot publish a second list with pages of its own; turn off Pages in one of them/);
  });
});

test('the integration refuses a component of its own for the post list, which it renders through the presentations', () => {
  assert.throws(() => konzilo({ directives: { 'post-list': './src/components/List.astro' } }), /renders the directive post-list itself, through the presentations the site registers/);
});
