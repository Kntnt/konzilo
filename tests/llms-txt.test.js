// llms.txt and llms-full.txt:
// every build of the public site writes `/llms.txt`, an index of the pages
// whose row has llms.txt on, linking each page's Markdown alternate, and
// `/llms-full.txt`, the Markdown alternates of the pages whose row has
// llms-full.txt on, in one document; Astro's dev server answers both.
//
// - A small site built with `astro build` for https://www.example.com gives
//   both exactly: the start page first, the sections in order (`page`, then
//   `post`, then the rest in the site description's order), each newest
//   first, every link absolute and to a .md the release holds, an excerpt
//   of 250 characters cut to 200 code points and `…`, and a title holding
//   `[` escaped. A post marked noindex and a page an excluded pattern
//   matches are in neither.
// - A built-in type's section is named by its plural label in the content's
//   language.
// - A type and the start page with llms.txt off have no place in the index,
//   and without a page in llms-full.txt the index has no line naming it.
// - The dev server answers both as a build writes them, and follows the
//   next change of the content.
// - A file of the site's own at either address fails the build.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { paragraphs, post, writeContent } from './lib/content.js';
import { llmsTxt, typesInOrder } from '../src/astro/llms-txt.js';
import { siteDescription } from '../src/site-description.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

// Articles with a date and an excerpt; notes with a date, declared before
// the guides, without one; and pages, which have a date, declared last.
const site = {
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { date: {}, excerpt: {}, seo: {} } },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'], fields: { date: {} } },
    guide: { label: 'Guide', plural: 'Guides', collection: 'guides', address: '/guides/{slug}/', elements: ['paragraph'], fields: {} },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph'] },
  },
};

// Every page has its main content in <main>, the start page its title and
// a line, a post's page its title and its body.
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
  '    <main><slot /></main>',
  '  </body>',
  '</html>',
  '',
].join('\n');

const postPage = (collection, params, layout) => [
  '---',
  "import { getCollection, render } from 'astro:content';",
  `import Page from '${layout}';`,
  'export async function getStaticPaths() {',
  `  return (await getCollection('${collection}')).map((entry) => ({ params: { ${params}: entry.id }, props: { entry } }));`,
  '}',
  'const { entry } = Astro.props;',
  'const { Content } = await render(entry);',
  '---',
  '<Page entry={entry}><h1>{entry.data.title}</h1><Content /></Page>',
  '',
].join('\n');

const DESIGN = {
  'src/layouts/Page.astro': LAYOUT,
  'src/pages/index.astro': "---\nimport Page from '../layouts/Page.astro';\n---\n<Page><h1>The Quiet Lantern</h1><p>Light for the harbour.</p></Page>\n",
  'src/pages/404.astro': "---\nimport Page from '../layouts/Page.astro';\n---\n<Page title=\"Not found\"><h1>Not found</h1></Page>\n",
  'src/pages/[slug].astro': postPage('articles', 'slug', '../layouts/Page.astro'),
  'src/pages/notes/[slug].astro': postPage('notes', 'slug', '../../layouts/Page.astro'),
  'src/pages/guides/[slug].astro': postPage('guides', 'slug', '../../layouts/Page.astro'),
  'src/pages/pages/[...path].astro': postPage('pages', 'path', '../../layouts/Page.astro'),
};

// An excerpt of 250 characters: 199 before a space, the 200th, with two
// characters beyond the Basic Multilingual Plane among them, then 50 more.
const KEPT = 'Every night the keeper climbs the 🌊 tower, trims the wick and lights the lantern, so that the boats 🚤 coming home through the fog find the harbour mouth; she writes the hour in her log ⚓ and the tide';
const EXCERPT = `${KEPT} then she sleeps until the gulls wake her, at dawn.`;

// The posts as a build hands them out.
const posts = [
  post({ ID: 1, slug: 'harbour-lights', title: 'Harbour lights', date: '2026-10-01 08:00:00', excerpt: EXCERPT, body: paragraphs('The lantern keeps the harbour.') }),
  post({ ID: 2, slug: 'the-keepers-log', title: 'The [draft] keeper\'s `log`', date: '2026-10-03 08:00:00', body: paragraphs('Kept every night.') }),
  post({ ID: 3, slug: 'night-watch', title: 'Night watch', date: '2026-10-02 08:00:00', body: paragraphs('Not for search engines.'), meta: { seo_noindex: ['1'] } }),
  post({ ID: 11, type: 'note', slug: 'tide-table', title: 'Tide table', date: '2026-10-05 08:00:00', body: paragraphs('High water at six.') }),
  post({ ID: 12, type: 'note', slug: 'fog', title: 'Fog', date: '2026-10-06 08:00:00', body: paragraphs('Thick at dawn.') }),
  // A guide has no date, so the guides come by title, whatever their paths.
  post({ ID: 21, type: 'guide', slug: 'trimming-the-wick', title: 'Trimming the wick', body: paragraphs('Cut it straight.') }),
  post({ ID: 22, type: 'guide', slug: 'anchoring', title: 'Weighing anchor', body: paragraphs('Pull it up slowly.') }),
  // A page has a date, so the pages come newest first too.
  post({ ID: 31, type: 'page', slug: 'contact', title: 'Contact', date: '2026-10-04 08:00:00', body: '' }),
  post({ ID: 32, type: 'page', slug: 'about', title: 'About the keeper', date: '2026-10-02 08:00:00', body: paragraphs('She keeps the light.') }),
  post({ ID: 33, type: 'page', slug: 'private', title: 'Private', body: paragraphs('Kept out by a pattern.') }),
];

// The AI visibility settings at their defaults, but the private page,
// excluded by a pattern: every row with Markdown and llms.txt, and the
// start page and pages with llms-full.txt.
const DEFAULTS = { excludedPaths: '^/pages/private/' };

// llms.txt off for notes and the start page, llms-full.txt off everywhere.
const NARROW = {
  excludedPaths: '^/pages/private/',
  home: { llms: '', llmsFull: '' },
  types: { note: { llms: '' }, page: { llmsFull: '' } },
};

const DESCRIPTION = 'Light for the harbour, every night.';

const LLMS = `# The Quiet Lantern

> Light for the harbour, every night.

Markdown index of The Quiet Lantern for AI agents. Full text: https://www.example.com/llms-full.txt

- [The Quiet Lantern](https://www.example.com/index.md): Light for the harbour, every night.

## Pages
- [Contact](https://www.example.com/pages/contact.md)
- [About the keeper](https://www.example.com/pages/about.md): She keeps the light.

## Articles
- [The \\[draft\\] keeper's \\\`log\\\`](https://www.example.com/the-keepers-log.md): Kept every night.
- [Harbour lights](https://www.example.com/harbour-lights.md): ${KEPT}…

## Notes
- [Fog](https://www.example.com/notes/fog.md): Thick at dawn.
- [Tide table](https://www.example.com/notes/tide-table.md): High water at six.

## Guides
- [Trimming the wick](https://www.example.com/guides/trimming-the-wick.md): Cut it straight.
- [Weighing anchor](https://www.example.com/guides/anchoring.md): Pull it up slowly.
`;

const LLMS_FULL = `# The Quiet Lantern

> Light for the harbour, every night.

---
title: "The Quiet Lantern"
canonical_url: "https://www.example.com/"
---

# The Quiet Lantern

Light for the harbour.

---
title: "Contact"
canonical_url: "https://www.example.com/pages/contact/"
date: 2026-10-04
---

# Contact

---
title: "About the keeper"
canonical_url: "https://www.example.com/pages/about/"
date: 2026-10-02
---

# About the keeper

She keeps the light.
`;

// With NARROW, and a site without a description.
const NARROW_LLMS = `# The Quiet Lantern

## Pages
- [Contact](https://www.example.com/pages/contact.md)
- [About the keeper](https://www.example.com/pages/about.md): She keeps the light.

## Articles
- [The \\[draft\\] keeper's \\\`log\\\`](https://www.example.com/the-keepers-log.md): Kept every night.
- [Harbour lights](https://www.example.com/harbour-lights.md): ${KEPT}…

## Guides
- [Trimming the wick](https://www.example.com/guides/trimming-the-wick.md): Cut it straight.
- [Weighing anchor](https://www.example.com/guides/anchoring.md): Pull it up slowly.
`;

const NARROW_LLMS_FULL = '# The Quiet Lantern\n';

const siteSettings = (ai, description) => ({
  menus: {},
  settings: { ai, ...(description ? { search: { description } } : {}) },
  identity: { title: 'The Quiet Lantern', logo: null, icon: null },
});

// A site repository of the design, with the core's npm package as a site
// installs it.
function siteRepository(design = DESIGN) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-llms-'));
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

function writeInto(repository, ai = DEFAULTS, description = DESCRIPTION) {
  writeFileSync(join(repository, 'site-settings.json'), JSON.stringify(siteSettings(ai, description)));
  const exported = writeContent(repository, posts);
  assert.equal(exported.status, 0, exported.stderr);
}

function build(repository) {
  return spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
}

test('orders the types of both files: the built-in page, then the built-in article, then the rest as declared', () => {
  const declared = siteDescription({
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      post: { label: 'Post', plural: 'Posts', collection: 'posts', address: '/posts/{slug}/', elements: ['paragraph'] },
      note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'] },
      article: { collection: 'articles', address: '/articles/{slug}/', elements: ['paragraph'] },
      page: { collection: 'pages', address: '/{slug}/', elements: ['paragraph'] },
    },
  });
  assert.deepEqual(typesInOrder(declared).map((type) => type.name), ['page', 'article', 'post', 'note']);
});

// A built-in type's plural is a label by language, which llms.txt writes in
// the content's: a site in Swedish names its sections in Swedish.
test('names each built-in type\'s section by its plural label in the content\'s language', async () => {
  const declared = siteDescription({
    language: 'sv_SE',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
      page: { collection: 'pages', address: '/sidor/{slug}/', elements: ['paragraph'] },
      canvas: { collection: 'canvases', address: '/ytor/{slug}/', elements: ['paragraph'] },
    },
  });
  const on = { markdown: true, llms: true, llmsFull: false };
  const settings = { title: 'Lyktan', ai: { home: { markdown: false }, types: { article: on, page: on, canvas: on } } };
  const entries = {
    articles: [{ id: 'hamnljus', collection: 'articles', data: { title: 'Hamnljus' }, body: '' }],
    pages: [{ id: 'om', collection: 'pages', data: { title: 'Om oss' }, body: '' }],
    canvases: [{ id: 'kampanj', collection: 'canvases', data: { title: 'Kampanj' }, body: '' }],
  };
  const text = await llmsTxt({ settings, site: declared, origin: 'https://www.example.com' }, { getCollection: async (collection) => entries[collection] ?? [] });
  assert.deepEqual(text.split('\n').filter((line) => line.startsWith('## ')), ['## Sidor', '## Artiklar', '## Arbetsytor']);
});

describe('a site built with astro build for https://www.example.com', () => {
  let repository;
  let built;

  before(() => {
    repository = siteRepository();
    writeInto(repository);
    built = build(repository);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  const output = (path) => readFileSync(join(repository, 'dist', path), 'utf8');

  test('writes llms.txt: the start page first, a section per type in order, each newest first, an excerpt cut to 200 code points and a title escaped', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.equal(output('llms.txt'), LLMS);
  });

  test('links every page of llms.txt at its Markdown alternate in the release', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    const links = [...output('llms.txt').matchAll(/\]\((https:\/\/www\.example\.com\/[^)]+)\)/g)].map(([, href]) => new URL(href).pathname);
    assert.equal(links.length, 9);
    for (const link of links.filter((path) => path.endsWith('.md'))) assert.ok(existsSync(join(repository, 'dist', link)), link);
  });

  test('writes llms-full.txt: the Markdown alternates of the start page and the pages, in the index\'s order, and of no article', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.equal(output('llms-full.txt'), LLMS_FULL);
  });
});

describe('a site with llms.txt off for a type and the start page, no page in llms-full.txt and no description', () => {
  let repository;
  let built;

  before(() => {
    repository = siteRepository();
    writeInto(repository, NARROW, '');
    built = build(repository);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  const output = (path) => readFileSync(join(repository, 'dist', path), 'utf8');

  test('lists neither the type nor the start page, nor names llms-full.txt', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.equal(output('llms.txt'), NARROW_LLMS);
  });

  test('gives llms-full.txt the site\'s title alone', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.equal(output('llms-full.txt'), NARROW_LLMS_FULL);
  });
});

// The pages of a template that renders no Konzilo Head have no Markdown
// alternate, so neither file holds them.
const BARE_PAGES = postPage('pages', 'path', '../../layouts/Page.astro')
  .replace("import Page from '../../layouts/Page.astro';", '')
  .replace('<Page entry={entry}><h1>{entry.data.title}</h1><Content /></Page>', '<html lang="en-GB"><head><meta charset="utf-8" /></head><body><main><h1>{entry.data.title}</h1><Content /></main></body></html>');

describe('pages whose template renders no Konzilo Head', () => {
  let repository;
  let built;

  before(() => {
    repository = siteRepository({ ...DESIGN, 'src/pages/pages/[...path].astro': BARE_PAGES });
    writeInto(repository);
    built = build(repository);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('leave them out of llms-full.txt, and the build\'s log names them once', () => {
    const log = `${built.stdout}\n${built.stderr}`;
    assert.equal(built.status, 0, log);
    assert.equal(readFileSync(join(repository, 'dist', 'llms-full.txt'), 'utf8'), LLMS_FULL.split('\n---\ntitle: "Contact"')[0]);
    assert.match(log, /llms-full\.txt leaves out these pages, which have no Markdown alternate, since their templates render no Konzilo Head:\n- \/pages\/contact\/\n- \/pages\/about\/\n/);
    assert.equal(log.match(/llms-full\.txt leaves out/g).length, 1);
  });

  test('leave them out of llms.txt too, a section left without a page with them, and the build\'s log names them once', () => {
    const log = `${built.stdout}\n${built.stderr}`;
    assert.equal(built.status, 0, log);
    assert.equal(readFileSync(join(repository, 'dist', 'llms.txt'), 'utf8'), LLMS.replace(/## Pages\n[^#]*/, ''));
    assert.match(log, /llms\.txt leaves out these pages, which have no Markdown alternate, since their templates render no Konzilo Head:\n- \/pages\/contact\/\n- \/pages\/about\/\n/);
    assert.equal(log.match(/(?<!-full)\.txt leaves out/g).length, 1);
  });
});

describe('a start page and pages whose templates render no Konzilo Head', () => {
  let repository;
  let built;

  before(() => {
    const index = '<html lang="en-GB"><head><meta charset="utf-8" /></head><body><main><h1>The Quiet Lantern</h1></main></body></html>\n';
    repository = siteRepository({ ...DESIGN, 'src/pages/index.astro': index, 'src/pages/pages/[...path].astro': BARE_PAGES });
    writeInto(repository);
    built = build(repository);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('give llms.txt no line naming llms-full.txt, which then holds no page', () => {
    const log = `${built.stdout}\n${built.stderr}`;
    assert.equal(built.status, 0, log);
    assert.equal(readFileSync(join(repository, 'dist', 'llms-full.txt'), 'utf8'), '# The Quiet Lantern\n\n> Light for the harbour, every night.\n');
    const index = readFileSync(join(repository, 'dist', 'llms.txt'), 'utf8');
    assert.equal(index, LLMS.replace(/## Pages\n[^#]*/, '').replace(/Markdown index of [^\n]*\n\n/, '').replace(/- \[The Quiet Lantern\][^\n]*\n\n/, ''));
  });
});

describe('a file of the site\'s own at either address', () => {
  let repository;

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('fails the build, naming it', () => {
    repository = siteRepository({ ...DESIGN, 'public/llms.txt': '# Our own\n', 'src/pages/llms-full.txt.js': 'export const GET = () => new Response("Our own");\n' });
    writeInto(repository);
    const built = build(repository);
    const output = `${built.stdout}\n${built.stderr}`;
    assert.notEqual(built.status, 0, output);
    assert.match(output, /Konzilo writes the site's \/llms\.txt itself, so the site may not have one of its own: remove public\/llms\.txt/);
    rmSync(join(repository, 'public'), { recursive: true });
    const again = build(repository);
    const said = `${again.stdout}\n${again.stderr}`;
    assert.notEqual(again.status, 0, said);
    assert.match(said, /Konzilo writes the site's \/llms-full\.txt itself, so the site may not have one of its own: remove src\/pages\/llms-full\.txt\.js/);
  });
});

// Astro's dev server of a site whose pages render no Konzilo Head lists
// them in neither file, as a build does.
describe('the dev server of a site whose pages render no Konzilo Head', () => {
  let repository;
  let server;
  let origin;

  before(async () => {
    repository = siteRepository({ ...DESIGN, 'src/pages/pages/[...path].astro': BARE_PAGES });
    writeInto(repository);
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: astroEnvironment, stdio: 'ignore', detached: true });
    await until(async () => (await (await fetch(`${origin}/llms.txt`)).text()).includes('Harbour lights'), 90_000);
  });

  after(() => {
    try {
      process.kill(-server.pid);
    } catch {
      // It has ended already.
    }
    rmSync(repository, { recursive: true, force: true });
  });

  test('answers llms.txt without them, as a build writes it', async () => {
    const response = await fetch(`${origin}/llms.txt`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), LLMS.replace(/## Pages\n[^#]*/, ''));
  });
});

// Astro's dev server, as a local site runs it, follows every change of the content.
describe('the dev server', () => {
  let repository;
  let server;
  let origin;

  before(async () => {
    repository = siteRepository();
    writeInto(repository);
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // In the foreground, which Astro leaves for the background when it finds
    // itself run by an agent, unless told to ignore its lock file.
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: astroEnvironment, stdio: 'ignore', detached: true });
    // Once its content is read. A minute, since the suite starts other
    // builds and dev servers at once.
    await until(async () => (await (await fetch(`${origin}/llms.txt`)).text()).includes('Harbour lights'), 90_000);
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

  test('answers both as a build writes them, as text', async () => {
    assert.deepEqual(await answer('/llms.txt'), { status: 200, type: 'text/plain; charset=utf-8', text: LLMS });
    assert.deepEqual(await answer('/llms-full.txt'), { status: 200, type: 'text/plain; charset=utf-8', text: LLMS_FULL });
    assert.deepEqual(await answer('/llms-full.txt', 'HEAD'), { status: 200, type: 'text/plain; charset=utf-8', text: '' });
  });

  test('follows the next change of the content', async () => {
    writeInto(repository, NARROW, '');
    await until(async () => (await answer('/llms.txt')).text === NARROW_LLMS);
    assert.deepEqual(await answer('/llms-full.txt'), { status: 200, type: 'text/plain; charset=utf-8', text: NARROW_LLMS_FULL });
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
