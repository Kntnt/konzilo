// A site whose types' addresses hold a post's date and its term, built with `astro build` from
// content files: each post's page is at the address its values give, its date's day in UTC and
// its term's whole path in a hierarchical taxonomy, read from the term's files; the sitemap,
// a link to it, its old address's redirect and its breadcrumbs all name that address, and a
// shorter address is a level of its breadcrumbs only where a post answers there.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroEnvironment, CACHE_DIR, nodeSync } from './lib/astro.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');
const { JSDOM } = createRequire(join(core, 'package.json'))('jsdom');

const site = {
  language: 'en_GB',
  types: {
    story: {
      label: 'Story', plural: 'Stories', collection: 'stories', address: '/stories/{category}/{slug}/', elements: ['paragraph', 'post-list'],
      fields: { date: {}, category: { taxonomy: 'category', most: 1, required: true } },
    },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/{year}/{month}/{day}/{slug}/', elements: ['paragraph'], fields: { date: {} } },
    section: { label: 'Section', plural: 'Sections', collection: 'pages', hierarchical: true, address: '/{path}/', elements: ['paragraph', 'post-list'], fields: { date: {} } },
  },
  taxonomies: { category: { label: 'Category', plural: 'Categories', collection: 'categories', hierarchical: true } },
  presentations: { list: { label: 'List', options: {} } },
};

const file = (fields, body = 'Text.') => `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join('\n')}\n---\n\n${body}\n`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const files = {
  'astro.config.mjs': `import konzilo from ${JSON.stringify(integration)};\n\nexport default { cacheDir: './${CACHE_DIR}', vite: { cacheDir: './${CACHE_DIR}/vite' }, integrations: [konzilo({ presentations: { list: './src/components/List.astro' } })] };\n`,
  'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
  'site-description.json': JSON.stringify(site),
  'src/components/List.astro': "---\nconst { posts } = Astro.props;\n---\n<ul class=\"list\">{posts.map(({ entry, url }) => <li><a href={url}>{entry.data.title}</a></li>)}</ul>\n",
  'src/pages/[...path].astro': [
    '---',
    `import { entryPages } from ${JSON.stringify(join(core, 'src/astro/site-languages.js'))};`,
    `import Body from ${JSON.stringify(join(core, 'src/astro/Body.astro'))};`,
    `import Breadcrumbs from ${JSON.stringify(join(core, 'src/astro/Breadcrumbs.astro'))};`,
    `import Head from ${JSON.stringify(join(core, 'src/astro/Head.astro'))};`,
    'export async function getStaticPaths() {',
    "  return (await Promise.all(['stories', 'notes', 'pages'].map((collection) => entryPages(collection)))).flat();",
    '}',
    "import { render } from 'astro:content';",
    'const { entry, page } = Astro.props;',
    'const { Content } = await render(entry);',
    '---',
    '<html lang="en-GB"><head><meta charset="utf-8" /><Head entry={entry} page={page} /></head>',
    '<body><Breadcrumbs entry={entry} /><main><h1>{entry.data.title}</h1><Body post={entry} page={page}><Content /></Body></main></body></html>',
    '',
  ].join('\n'),
  'content/categories/health.json': json({ name: 'Health' }),
  'content/categories/ptsd.json': json({ name: 'PTSD', parent: 'health' }),
  'content/stories/lanterns.md': file({ title: '"Lanterns"', date: '2026-03-07T23:30:00Z', category: '["ptsd"]', oldAddresses: '["/stories/health/lanterns/"]' }),
  'content/notes/tide.md': file({ title: '"Tide"', date: '2026-03-07T23:30:00Z' }),
  // A page at /stories/, the level above every story, which lists them.
  'content/pages/stories.md': file({ title: '"All stories"', date: '2026-01-01T08:00:00Z' }, '::post-list{type="story" presentation="list"}'),
  // A page at /2026/, which a note's address starts with.
  'content/pages/2026.md': file({ title: '"The year"', date: '2026-01-01T08:00:00Z' }),
};

describe('a site whose addresses hold a post\'s date and term', () => {
  let repository;
  let built;
  const output = (path) => readFileSync(join(repository, 'dist', path), 'utf8');
  const document = (path) => new JSDOM(output(join(path, 'index.html'))).window.document;
  const levels = (path) => [...document(path).querySelectorAll('nav li')].map((item) => item.querySelector('a')?.getAttribute('href') ?? item.textContent);

  before(() => {
    repository = mkdtempSync(join(tmpdir(), 'konzilo-address-values-'));
    symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), contents);
    }
    built = nodeSync([astro, 'build'], { cwd: repository, encoding: 'utf8', env: { ...astroEnvironment, KONZILO_CONTENT: '' } });
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('builds each post at the address its date, in UTC, and its term\'s whole path give', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.equal(document('stories/health/ptsd/lanterns').querySelector('h1').textContent, 'Lanterns');
    assert.equal(document('2026/03/07/tide').querySelector('h1').textContent, 'Tide');
    assert.equal(existsSync(join(repository, 'dist/stories/lanterns')), false);
  });

  test('names that address in the sitemap, the canonical link and a list\'s link', () => {
    const sitemap = output('sitemap.xml');
    for (const path of ['/stories/health/ptsd/lanterns/', '/2026/03/07/tide/']) assert.ok(sitemap.includes(`<loc>https://www.example.com${path}</loc>`), `${path} in\n${sitemap}`);
    assert.equal(document('stories/health/ptsd/lanterns').querySelector('link[rel="canonical"]').getAttribute('href'), 'https://www.example.com/stories/health/ptsd/lanterns/');
    assert.equal(document('stories').querySelector('.list a').getAttribute('href'), '/stories/health/ptsd/lanterns/');
  });

  test('leads its old address to it', () => {
    assert.match(output('_redirects'), /^\/stories\/health\/lanterns\/ \/stories\/health\/ptsd\/lanterns\/ 301$/m);
  });

  test('gives it the breadcrumbs of its address, each level a post that answers there', () => {
    assert.deepEqual(levels('stories/health/ptsd/lanterns'), ['/', '/stories/']);
    assert.deepEqual(levels('2026/03/07/tide'), ['/', '/2026/']);
  });
});
