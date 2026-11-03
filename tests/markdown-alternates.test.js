// The Markdown alternates of the public site's pages, made from the built pages:
// what takes part, what each gives, and how the dev server answers them.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { postFile, settingsFile, writeFiles } from './lib/content.js';
import { plainImage, sharp } from './lib/images.js';
import { markdownAddress, markdownAlternate, pageOfMarkdown, prefersMarkdown } from '../src/astro/markdown-alternates.js';
import { siteDescription } from '../src/site-description.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

// Articles with a date, categories, tags, a featured image and the search
// fields, which take every element the test shows; pages, whose address
// follows their parents; and notes, whose Markdown the Admin turns off.
const site = {
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    post: {
      label: 'Article',
      plural: 'Articles',
      collection: 'articles',
      address: '/{slug}/',
      elements: ['paragraph', 'heading', 'list', 'table', 'footnotes', 'embed', 'image'],
      fields: { date: {}, categories: { taxonomy: 'category' }, tags: { taxonomy: 'tag' }, image: {}, seo: {} },
    },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph'], fields: { seo: {} } },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'], fields: {} },
  },
  taxonomies: {
    category: { label: 'Category', plural: 'Categories', collection: 'categories', hierarchical: true },
    tag: { label: 'Tag', plural: 'Tags', collection: 'tags' },
  },
};

test('a page\'s address gives its alternate\'s, the start page /index.md and a page at /index/ /index/index.md, and back', () => {
  const table = [['/about-us/team/', '/about-us/team.md'], ['/', '/index.md'], ['/index/', '/index/index.md'], ['/a/index/', '/a/index/index.md'], ['/öppettider/', '/öppettider.md']];
  for (const [path, address] of table) {
    assert.equal(markdownAddress(path), address, path);
    assert.equal(pageOfMarkdown(address), path, address);
  }
  // An address no page gives.
  for (const address of ['/a/index.md', '/index/index/index.md/', '/a.txt', '/.md']) assert.equal(pageOfMarkdown(address), null, address);
});

// Accept headers, and a browser's own, each with whether it gets Markdown.
const NEGOTIATION = [
  ['text/markdown', true],
  ['text/html;q=0.8, text/markdown;q=0.9', true],
  ['text/html, text/markdown;q=0.9', false],
  ['text/html, text/markdown', false],
  ['*/*', false],
  ['text/markdown;q=0', false],
  ['text/*;q=0.5, text/markdown;q=0.6', true],
  ['text/markdown;q=1.5', false],
  ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', false],
];

test('a request prefers Markdown only by a positive weight above HTML\'s, and malformed weights weigh nothing', () => {
  for (const [accept, markdown] of NEGOTIATION) assert.equal(prefersMarkdown(accept), markdown, accept);
  const more = [
    // Case, spaces and the other Markdown type; an explicit zero for HTML
    // is kept, and application/xhtml+xml weighs as much as text/html.
    ['TEXT/Markdown ; Q = 0.5, text/html;q=0.4', true],
    ['text/x-markdown', true],
    ['text/html;q=0, text/markdown;q=0.001', true],
    ['text/html;q=0.5, application/xhtml+xml, text/markdown;q=0.9', false],
    ['application/*;q=0.2, text/*;q=0.2, text/markdown;q=0.3', true],
    ['*/*;q=0.3, text/markdown;q=0.3', false],
    // A repeated, malformed or out-of-range weight weighs nothing, and the
    // range's best weight counts.
    ['text/markdown;q=0.9;q=0.9', false],
    ['text/markdown;q=.9', false],
    ['text/markdown;q=0.1234', false],
    ['text/markdown;q', false],
    ['text/markdown;q=0.2, text/markdown;q=0.9, text/html;q=0.8', true],
    ['text/markdown;level=1;q=0.9, text/html;q=0.8', true],
    // Wildcards alone never give Markdown, nor does no header.
    ['text/*', false],
    ['', false],
  ];
  for (const [accept, markdown] of more) assert.equal(prefersMarkdown(accept), markdown, accept);
});

test('a header of more ranges or characters than the public host weighs gets HTML there, and so here', () => {
  const ranges = (count) => [...Array.from({ length: count - 1 }, () => 'text/plain;q=0.1'), 'text/markdown'].join(',');
  assert.equal(prefersMarkdown(ranges(32)), true);
  assert.equal(prefersMarkdown(ranges(33)), false);
  assert.equal(prefersMarkdown(`text/markdown;foo=${'a'.repeat(1024 - 'text/markdown;foo='.length)}`), true);
  assert.equal(prefersMarkdown(`text/markdown;foo=${'a'.repeat(1025 - 'text/markdown;foo='.length)}`), false);
});

test('a post\'s first page has its alternate, but neither its later page of a list with pages, which says noindex, nor a preview', async () => {
  const read = siteDescription(site);
  const entry = { id: 'harbour-lights', collection: 'articles', data: { title: 'Harbour lights' } };
  const page = { entry, type: read.types.post, path: '/harbour-lights/', settings: undefined, site: read };
  const astro = { getCollection: async () => assert.fail('no excluded paths to ask') };
  assert.equal(await markdownAlternate(page, astro), '/harbour-lights.md');
  assert.equal(await markdownAlternate({ ...page, page: 1 }, astro), '/harbour-lights.md');
  assert.equal(await markdownAlternate({ ...page, path: '/harbour-lights/page/2/', page: 2 }, astro), null);
  assert.equal(await markdownAlternate({ ...page, base: '/preview/' }, astro), null);
});

// The site's design. Every page has its main content in <main>, beside a
// trail of links in a <nav>, which stays out of the Markdown, as do a
// script, a style and a template in it; a page of the type `page` marks a
// part of its main content as the main content with the integration's mark.
const LAYOUT = [
  '---',
  "import Head from '@kntnt/konzilo/astro/Head.astro';",
  'const { entry, title } = Astro.props;',
  '---',
  '<html lang="en-GB">',
  '  <head>',
  '    <meta charset="utf-8" />',
  '    <Head entry={entry} title={title} />',
  '  </head>',
  '  <body>',
  '    <header><a href="/">The Quiet Lantern</a></header>',
  '    <main>',
  '      <nav aria-label="Breadcrumbs"><a href="/">Home</a></nav>',
  '      <slot />',
  '      <script>console.log("kept out");</script>',
  '      <style>main { color: black; }</style>',
  '      <template><p>Kept out.</p></template>',
  '    </main>',
  '    <footer>The footer.</footer>',
  '  </body>',
  '</html>',
  '',
].join('\n');

const page = (collection, params, inner) => [
  '---',
  "import { getCollection, render } from 'astro:content';",
  "import Page from '../../layouts/Page.astro';",
  'export async function getStaticPaths() {',
  `  return (await getCollection('${collection}')).map((entry) => ({ params: { ${params}: entry.id }, props: { entry } }));`,
  '}',
  'const { entry } = Astro.props;',
  'const { Content } = await render(entry);',
  '---',
  inner,
  '',
].join('\n');

const DESIGN = {
  'src/layouts/Page.astro': LAYOUT,
  'src/pages/index.astro': [
    '---',
    "import { getCollection } from 'astro:content';",
    "import Page from '../layouts/Page.astro';",
    "const articles = (await getCollection('articles')).sort((a, b) => a.id.localeCompare(b.id));",
    '---',
    '<Page><h1>The Quiet Lantern</h1><p>Light for the harbour.</p><ul>{articles.map((article) => <li><a href={`/${article.id}/`}>{article.data.title}</a></li>)}</ul></Page>',
    '',
  ].join('\n'),
  'src/pages/contact.astro': "---\nimport Page from '../layouts/Page.astro';\n---\n<Page title=\"Contact\"><h1>Contact</h1><p>Write to the keeper.</p></Page>\n",
  'src/pages/404.astro': "---\nimport Page from '../layouts/Page.astro';\n---\n<Page title=\"Not found\"><h1>Not found</h1></Page>\n",
  'src/pages/[slug].astro': page('articles', 'slug', '<Page entry={entry}><article><h1>{entry.data.title}</h1><Content /></article></Page>')
    .replace("'../../layouts/Page.astro'", "'../layouts/Page.astro'"),
  'src/pages/pages/[...path].astro': page('pages', 'path', '<Page entry={entry}><aside>Related: nothing.</aside><div data-konzilo-main><h1>{entry.data.title}</h1><Content /></div></Page>'),
  'src/pages/notes/[slug].astro': page('notes', 'slug', '<Page entry={entry}><h1>{entry.data.title}</h1><Content /></Page>'),
};

const AI = { types: { note: { markdown: false } }, excludedPaths: '^/pages/private/' };

// The site's content files, as the intake writes them.
const BODY = [
  'The lantern keeps the harbour[^1].',
  '## At dusk',
  '- Trim the wick\n- Light the **lantern**',
  '| Item | Price |\n| --- | --- |\n| Oil | 12 |',
  '![The lantern at dusk](../media/lantern.webp)',
  'Read [about the keeper](/pages/about/).',
  'https://www.youtube.com/watch?v=Kz3pQ8vXw1A',
  "[^1]: The keeper's log.",
].join('\n\n');

function contentFiles(ai = AI) {
  return {
    'articles/harbour-lights.md': postFile({
      title: 'Harbour lights & the keeper',
      date: new Date('2026-10-01T08:00:00Z'),
      categories: ['news'],
      tags: ['fishing', 'harbours'],
      image: { src: '../media/tower.webp', alt: 'The tower' },
      body: BODY,
    }),
    'articles/index.md': postFile({ title: 'An index', date: new Date('2026-10-02T08:00:00Z'), categories: [], tags: [], body: 'Every light on the coast.' }),
    'articles/night-watch.md': postFile({ title: 'Night watch', date: new Date('2026-10-03T08:00:00Z'), categories: [], tags: [], seo: { noindex: true }, body: 'Not for search engines.' }),
    'pages/about.md': postFile({ title: 'About the keeper', body: 'She keeps the light.' }),
    'pages/private.md': postFile({ title: 'Private', body: 'Kept out by a pattern.' }),
    'notes/jotting.md': postFile({ title: 'A jotting', body: 'Notes have no Markdown.' }),
    'categories/news.json': `${JSON.stringify({ name: 'News' }, null, 2)}\n`,
    'tags/harbours.json': `${JSON.stringify({ name: 'Harbours' }, null, 2)}\n`,
    'tags/fishing.json': `${JSON.stringify({ name: 'Fishing' }, null, 2)}\n`,
    'settings.json': settingsFile(site, { identity: { title: 'The Quiet Lantern' }, groups: { ai } }),
  };
}

// A site repository of the design, with the core's npm package as a site
// installs it.
function siteRepository(design = DESIGN) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-markdown-'));
  mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
  for (const entry of readdirSync(join(core, 'node_modules'))) {
    if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
  }
  symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
  const files = {
    'astro.config.mjs': astroConfig(integration),
    'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify(site),
    ...design,
  };
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  }
  return repository;
}

function writeInto(repository, disk, ai = AI) {
  writeFiles(join(repository, 'content'), contentFiles(ai));
  mkdirSync(join(repository, 'content/media'), { recursive: true });
  cpSync(disk, join(repository, 'content/media'), { recursive: true });
}

function build(repository) {
  return spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
}

// Every .md file of a release, by its path from the release's root.
function alternates(dist) {
  return Object.fromEntries(readdirSync(dist, { recursive: true }).filter((path) => path.endsWith('.md')).sort().map((path) => [path, readFileSync(join(dist, path), 'utf8')]));
}

// The Markdown alternates a page's head links, by their addresses.
function linked(html) {
  return [...html.matchAll(/<link rel="alternate" type="text\/markdown" href="([^"]+)">/g)].map(([, href]) => href);
}

let disk;

before(async () => {
  disk = mkdtempSync(join(tmpdir(), 'konzilo-uploads-'));
  writeFileSync(join(disk, 'lantern.webp'), await plainImage(sharp, { width: 900, height: 600, format: 'webp' }));
  writeFileSync(join(disk, 'tower.webp'), await plainImage(sharp, { width: 800, height: 1000, format: 'webp' }));
});

after(() => rmSync(disk, { recursive: true, force: true }));

describe('a site built with astro build for https://www.example.com', () => {
  let repository;
  let built;
  let files;

  before(() => {
    repository = siteRepository();
    writeInto(repository, disk);
    built = build(repository);
    files = built.status === 0 ? alternates(join(repository, 'dist')) : {};
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  const html = (path) => readFileSync(join(repository, 'dist', path), 'utf8');

  test('writes a .md beside each page that takes part, and none for the others', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.deepEqual(Object.keys(files), ['harbour-lights.md', 'index.md', 'index/index.md', 'pages/about.md']);
  });

  test('an article gives exactly its front matter, its title once and its main content, every address absolute on the public host', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    const page = html('harbour-lights/index.html');
    const image = /<img alt="The lantern at dusk"[^>]*\bsrc="(\/_astro\/[^"]+)"/.exec(page)?.[1];
    const featured = /^featured_image: "(https:\/\/www\.example\.com\/_astro\/[^"]+)"$/m.exec(files['harbour-lights.md'])?.[1];
    assert.ok(image, page);
    assert.ok(featured, files['harbour-lights.md']);
    assert.equal(files['harbour-lights.md'], `---
title: "Harbour lights & the keeper"
canonical_url: "https://www.example.com/harbour-lights/"
date: 2026-10-01
featured_image: "${featured}"
categories:
  - "News"
tags:
  - "Fishing"
  - "Harbours"
---

# Harbour lights & the keeper

The lantern keeps the harbour[1](https://www.example.com/harbour-lights/#user-content-fn-1).

## At dusk

- Trim the wick
- Light the **lantern**

| Item | Price |
|------|-------|
| Oil  | 12    |

![The lantern at dusk](https://www.example.com${image})

Read [about the keeper](https://www.example.com/pages/about/).

[https://www.youtube.com/watch?v=Kz3pQ8vXw1A](https://www.youtube.com/watch?v=Kz3pQ8vXw1A)

## Footnotes

1. The keeper's log. [↩](https://www.example.com/harbour-lights/#user-content-fnref-1)
`);
  });

  test('the start page gives /index.md and a page at /index/ /index/index.md, and a marked element is the main content', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.equal(files['index.md'], `---
title: "The Quiet Lantern"
canonical_url: "https://www.example.com/"
---

# The Quiet Lantern

Light for the harbour.

- [Harbour lights & the keeper](https://www.example.com/harbour-lights/)
- [An index](https://www.example.com/index/)
- [Night watch](https://www.example.com/night-watch/)
`);
    assert.equal(files['index/index.md'], `---
title: "An index"
canonical_url: "https://www.example.com/index/"
date: 2026-10-02
---

# An index

Every light on the coast.
`);
    assert.equal(files['pages/about.md'], `---
title: "About the keeper"
canonical_url: "https://www.example.com/pages/about/"
---

# About the keeper

She keeps the light.
`);
  });

  test('each page that takes part links its alternate in its head, and no other page links one', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    const heads = {
      'index.html': ['https://www.example.com/index.md'],
      'harbour-lights/index.html': ['https://www.example.com/harbour-lights.md'],
      'index/index.html': ['https://www.example.com/index/index.md'],
      'pages/about/index.html': ['https://www.example.com/pages/about.md'],
      'night-watch/index.html': [],
      'pages/private/index.html': [],
      'notes/jotting/index.html': [],
      'contact/index.html': [],
      '404.html': [],
    };
    for (const [path, links] of Object.entries(heads)) assert.deepEqual(linked(html(path)), links, path);
  });

  test('lists each page that has an alternate, and its alternate, in _markdown for the web server, as browsers send the addresses', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.equal(html('_markdown'), '/ /index.md\n/harbour-lights/ /harbour-lights.md\n/index/ /index/index.md\n/pages/about/ /pages/about.md\n');
  });

  test('no page keeps the mark its build made the alternate from', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    for (const path of readdirSync(join(repository, 'dist'), { recursive: true }).filter((file) => file.endsWith('.html'))) {
      assert.doesNotMatch(html(path), /konzilo:markdown/, path);
    }
  });
});

describe('a page whose main content cannot be told', () => {
  let repository;

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('fails the build, naming each page and what to mark: one without <main>, and one with two', () => {
    repository = siteRepository({
      ...DESIGN,
      'src/layouts/Page.astro': LAYOUT.replace('<main>', '<div>').replace('</main>', '</div>'),
      'src/pages/pages/[...path].astro': page('pages', 'path', '<Page entry={entry}><main><h1>{entry.data.title}</h1></main><main><Content /></main></Page>'),
    });
    writeInto(repository, disk);
    const built = build(repository);
    const output = `${built.stdout}\n${built.stderr}`;
    assert.notEqual(built.status, 0, output);
    assert.match(output, /Konzilo makes a Markdown alternate of each of these pages from its main content, which it cannot tell:/);
    assert.match(output, /^\/harbour-lights\/: it has no <main>: put its main content in one, or mark the element that holds it with data-konzilo-main$/m);
    assert.match(output, /^\/: it has no <main>/m);
    assert.match(output, /^\/pages\/about\/: it has 2 <main> elements: mark the one that holds its main content with data-konzilo-main$/m);
  });
});

describe('two builds of the same content', () => {
  let repository;

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('give the same bytes', () => {
    repository = siteRepository();
    writeInto(repository, disk);
    const once = build(repository);
    assert.equal(once.status, 0, `${once.stdout}\n${once.stderr}`);
    const first = alternates(join(repository, 'dist'));
    rmSync(join(repository, 'dist'), { recursive: true, force: true });
    const again = build(repository);
    assert.equal(again.status, 0, `${again.stdout}\n${again.stderr}`);
    assert.deepEqual(alternates(join(repository, 'dist')), first);
    assert.equal(Object.keys(first).length, 4);
  });
});

// Astro's dev server, as a local site runs it, follows every change of the content.
describe('the dev server', () => {
  let repository;
  let built;
  let server;
  let origin;

  before(async () => {
    repository = siteRepository();
    writeInto(repository, disk);
    const once = build(repository);
    assert.equal(once.status, 0, `${once.stdout}\n${once.stderr}`);
    built = alternates(join(repository, 'dist'));
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // In the foreground, which Astro leaves for the background when it finds
    // itself run by an agent, unless told to ignore its lock file.
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: astroEnvironment, stdio: 'ignore', detached: true });
    // Once its content is read: the start page lists the articles. A
    // minute, since the suite starts other builds and dev servers at once.
    await until(async () => (await (await fetch(`${origin}/`)).text()).includes('Harbour lights'), 90_000);
  });

  after(() => {
    // The dev server and what it started, as one process group.
    try {
      process.kill(-server.pid);
    } catch {
      // It has ended already.
    }
    rmSync(repository, { recursive: true, force: true });
  });

  const answer = async (path, method = 'GET') => {
    const response = await fetch(`${origin}${path}`, { method });
    return { status: response.status, type: response.headers.get('content-type'), text: await response.text() };
  };

  test('answers each address as a build writes it, with its type, and links it in the page\'s head', async () => {
    for (const path of ['/index.md', '/index/index.md', '/pages/about.md']) {
      assert.deepEqual(await answer(path), { status: 200, type: 'text/markdown; charset=utf-8', text: built[path.slice(1)] }, path);
    }
    assert.deepEqual(await answer('/pages/about.md', 'HEAD'), { status: 200, type: 'text/markdown; charset=utf-8', text: '' });
    assert.deepEqual(linked(await (await fetch(`${origin}/pages/about/`)).text()), ['https://www.example.com/pages/about.md']);
    // The article's images are the dev server's own, not the build's.
    const article = await answer('/harbour-lights.md');
    assert.equal(article.status, 200);
    assert.match(article.text, /^# Harbour lights & the keeper\n\nThe lantern keeps the harbour/m);
  });

  // An answer's Link headers, each a value, and the fields it varies by.
  const discovery = async (path, { accept, method = 'GET' } = {}) => {
    const response = await fetch(`${origin}${path}`, { method, headers: accept === undefined ? {} : { accept } });
    const links = response.headers.get('link')?.split(/, (?=<)/) ?? [];
    const varies = response.headers.get('vary')?.split(/,\s*/) ?? [];
    return { status: response.status, type: response.headers.get('content-type'), links, varies, text: await response.text() };
  };
  const RELATED = ['<https://www.example.com/llms.txt>; rel="related"; type="text/plain"', '<https://www.example.com/llms-full.txt>; rel="related"; type="text/plain"'];

  test('answers a page\'s own address with its Markdown where the request prefers it , with the alternate\'s headers, and varies by Accept', async () => {
    for (const [accept, markdown] of NEGOTIATION) {
      const seen = await discovery('/pages/about/', { accept });
      assert.equal(seen.status, 200, accept);
      assert.equal(seen.type, markdown ? 'text/markdown; charset=utf-8' : 'text/html', accept);
      if (markdown) assert.equal(seen.text, built['pages/about.md'], accept);
      if (markdown) assert.deepEqual(seen.links, ['<https://www.example.com/pages/about/>; rel="canonical"'], accept);
      assert.ok(seen.varies.includes('Accept'), accept);
    }
    const start = await discovery('/', { accept: 'text/markdown' });
    assert.deepEqual([start.type, start.text], ['text/markdown; charset=utf-8', built['index.md']]);
    const head = await discovery('/pages/about/', { accept: 'text/markdown', method: 'HEAD' });
    assert.deepEqual([head.status, head.type, head.text], [200, 'text/markdown; charset=utf-8', '']);
    // A page without an alternate is HTML, whatever the request prefers.
    const contact = await discovery('/contact/', { accept: 'text/markdown' });
    assert.equal(contact.type, 'text/html');
    assert.ok(!contact.varies.includes('Accept'));
  });

  test('links llms.txt and llms-full.txt from every page, and its alternate from a page with one, and each alternate names its page', async () => {
    assert.deepEqual((await discovery('/pages/about/')).links, ['<https://www.example.com/pages/about.md>; rel="alternate"; type="text/markdown"', ...RELATED]);
    assert.deepEqual((await discovery('/')).links, ['<https://www.example.com/index.md>; rel="alternate"; type="text/markdown"', ...RELATED]);
    assert.deepEqual((await discovery('/contact/')).links, RELATED);
    const missing = await discovery('/missing/');
    assert.deepEqual([missing.status, missing.links], [404, []]);
    assert.deepEqual((await discovery('/pages/about.md')).links, ['<https://www.example.com/pages/about/>; rel="canonical"']);
    assert.deepEqual((await discovery('/llms.txt')).links, []);
  });

  test('answers 404 where a page has none, and at any other address ending in .md', async () => {
    for (const path of ['/night-watch.md', '/pages/private.md', '/notes/jotting.md', '/contact.md', '/missing.md', '/harbour-lights/index.md', '/index/index/index.md']) {
      assert.equal((await answer(path)).status, 404, path);
    }
  });

  test('follows the next change of the content: with Markdown off for pages, a page\'s address answers 404 and its head links none', async () => {
    writeInto(repository, disk, { ...AI, types: { ...AI.types, page: { markdown: false } } });
    await until(async () => (await answer('/pages/about.md')).status === 404);
    assert.deepEqual(linked(await (await fetch(`${origin}/pages/about/`)).text()), []);
    assert.equal((await answer('/index/index.md')).status, 200);
  });
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

async function until(check, timeout = 90_000) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // Not answering yet.
    }
    if (Date.now() > end) throw new Error(`still not so after ${timeout / 1000} seconds`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
