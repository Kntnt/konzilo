// Search on the site, as Konzilo's Astro integration
// gives it:
//
// - a static build puts the site's search page, a page of the site's design
//   that places Konzilo's Search, at the site description's address, says
//   noindex there and nowhere else, gives every page the search box the
//   site's layout places, writes no search document, and in a preview says
//   that search is not in the preview;
// - Astro's dev server, as a local site runs it, answers /_konzilo/search by
//   passing the search to Typesense, a stand-in here, with a key that runs
//   the site's search alone, and refuses everything else there;
// - the search page's script, run under jsdom on the built page, asks the
//   route and shows the results, the pages of them and its messages.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { scopedSearchKey, searchParameters } from '@kntnt/konzilo/search';
import { searchClient } from '../src/astro/search-client.js';
import { astroConfig, astroEnvironment, ORIGIN } from './lib/astro.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');
const { JSDOM } = createRequire(join(core, 'package.json'))('jsdom');

const article = { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { date: {} } };
const searching = { language: 'en_GB', search: { address: '/search/' }, types: { post: article } };

// The site's frame, as the site template's: Konzilo's Head in its head and
// the search box in its header, imported from the package.
const layout = [
  '---',
  "import Head from '@kntnt/konzilo/astro/Head.astro';",
  "import SearchBox from '@kntnt/konzilo/astro/SearchBox.astro';",
  '---',
  '<html lang="en">',
  '  <head><title>A page</title><Head /></head>',
  '  <body><header><SearchBox /></header><slot /></body>',
  '</html>',
  '',
].join('\n');

const sources = {
  'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
  'src/layouts/Layout.astro': layout,
  'src/components/SearchPage.astro': [
    '---',
    "import Search from '@kntnt/konzilo/astro/Search.astro';",
    "import Layout from '../layouts/Layout.astro';",
    '---',
    '<Layout><main><h1>Search</h1><Search /></main></Layout>',
    '',
  ].join('\n'),
  'src/pages/index.astro': "---\nimport Layout from '../layouts/Layout.astro';\n---\n<Layout><main><h1>Start</h1></main></Layout>\n",
  'src/pages/[slug].astro': [
    '---',
    "import { getCollection, render } from 'astro:content';",
    "import Layout from '../layouts/Layout.astro';",
    'export async function getStaticPaths() {',
    "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
    '}',
    'const { entry } = Astro.props;',
    'const { Content } = await render(entry);',
    '---',
    '<Layout><h1>{entry.data.title}</h1><Content /></Layout>',
    '',
  ].join('\n'),
  'content/articles/hello.md': '---\ntitle: "Hello"\ndate: 2026-10-01T08:00:00Z\n---\n\nA word only this post holds: quetzal.\n',
};

// A site repository with Astro and Konzilo's package installed as a site
// installs them, the design above and `files` over it.
function siteRepository(files) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-search-astro-'));
  mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
  for (const entry of readdirSync(join(core, 'node_modules'))) {
    if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
  }
  symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
  for (const [path, contents] of Object.entries({ ...sources, ...files })) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  }
  return repository;
}

// Astro's build of a site of `site` with the integration's `options`, below
// `base` if given: { status, log, page(path), files }, each page as a jsdom
// document and every file of the build by its path.
function build(site, options, base) {
  const repository = siteRepository({ 'site-description.json': JSON.stringify(site), 'astro.config.mjs': astroConfig(integration, options) });
  try {
    const args = [astro, 'build', ...(base ? ['--base', base] : [])];
    const built = spawnSync(process.execPath, args, { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    const dist = join(repository, 'dist');
    const files = {};
    const walk = (folder, prefix) => {
      for (const entry of readdirSync(folder, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(join(folder, entry.name), `${prefix}${entry.name}/`);
        else files[`${prefix}${entry.name}`] = readFileSync(join(folder, entry.name));
      }
    };
    if (built.status === 0) walk(dist, '');
    const html = (path) => files[`${path.replace(/^\//, '')}index.html`]?.toString();
    return {
      status: built.status,
      log: `${built.stdout}\n${built.stderr}`,
      files,
      html,
      page: (path) => new JSDOM(html(path), { url: `${ORIGIN}${path}` }),
    };
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

const searchPage = { searchPage: './src/components/SearchPage.astro' };

describe('a site with search, built', () => {
  let built;

  before(() => {
    built = build(searching, searchPage);
  });

  test('has its search page at the site description\'s address, with a form that asks with q, results announced to screen readers and a message without JavaScript', () => {
    assert.equal(built.status, 0, built.log);
    const { document } = built.page('/search/').window;

    assert.equal(document.querySelector('h1').textContent, 'Search');
    const form = document.querySelector('[data-konzilo-search] form[role="search"]');
    assert.equal(form.getAttribute('method'), 'get');
    assert.equal(form.getAttribute('action'), '/search/');
    assert.equal(form.querySelector('input[type="search"]').getAttribute('name'), 'q');
    assert.equal(document.querySelector('[data-konzilo-search] [role="status"]').textContent, '');
    assert.equal(document.querySelector('[data-konzilo-search] noscript').textContent.trim(), 'Search needs JavaScript, which your browser does not run.');
  });

  test('runs the search page\'s script from a file of the release on that page alone', () => {
    const scripts = (path) => [...built.page(path).window.document.querySelectorAll('script')].map((script) => script.getAttribute('src'));
    const own = scripts('/search/').filter((src) => !scripts('/hello/').includes(src));

    assert.equal(own.length, 1);
    assert.match(own[0], /^\/_astro\/search-client\.[\w-]+\.js$/);
    assert.match(built.files[own[0].slice(1)].toString(), /\/_konzilo\/search|konziloSearch/);
  });

  test('says noindex on the search page alone, which is not in the sitemap', () => {
    const robots = (path) => built.page(path).window.document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null;

    assert.equal(robots('/search/'), 'noindex');
    assert.equal(robots('/hello/'), null);
    assert.equal(robots('/'), null);
    assert.doesNotMatch(built.files['sitemap.xml'].toString(), /search/);
  });

  test('gives every page the search box the layout places: a plain form that takes the visitor to the search page with the query in q', () => {
    const box = built.page('/hello/').window.document.querySelector('header form[role="search"]');

    assert.equal(box.getAttribute('method'), 'get');
    assert.equal(box.getAttribute('action'), '/search/');
    assert.equal(box.querySelector('input').getAttribute('name'), 'q');
    assert.equal(box.querySelector('label').textContent, 'Search');
    assert.equal(box.querySelector('label').getAttribute('for'), box.querySelector('input').id);
  });

  test('writes no search document into the release', () => {
    // The post's page holds its body, and llms.txt, for AI agents, its
    // summary.
    const holding = Object.entries(built.files).filter(([path, bytes]) => !['hello/index.html', 'llms.txt'].includes(path) && bytes.toString().includes('quetzal'));

    assert.deepEqual(holding.map(([path]) => path), []);
  });
});

test('a site without search has no search page and no search box, and gives no search page a component', () => {
  const built = build({ ...searching, search: undefined }, searchPage);

  assert.equal(built.status, 0, built.log);
  assert.equal(built.html('/search/'), undefined);
  assert.equal(built.page('/hello/').window.document.querySelector('form'), null);
});

test('a site in Swedish says it in Swedish, and a site gives texts of its own to the components', () => {
  const site = { ...searching, language: 'sv_SE', search: { address: '/sok/' } };
  const built = build(site, searchPage);

  assert.equal(built.status, 0, built.log);
  const { document } = built.page('/sok/').window;
  assert.equal(document.querySelector('noscript').textContent.trim(), 'Sökningen behöver JavaScript, som din webbläsare inte kör.');
  assert.equal(document.querySelector('header label').textContent, 'Sök');
  assert.equal(document.querySelector('header form').getAttribute('action'), '/sok/');
  assert.equal(JSON.parse(document.querySelector('[data-konzilo-search]').dataset.texts).nothingFound, 'Inget matchade din sökning.');
});

test('a site that declares search and gives its design no search page fails the build, naming what to give', () => {
  const built = build(searching, {});

  assert.notEqual(built.status, 0);
  assert.match(built.log, /the site description declares a search page at \/search\/, which the site's design does not give in konzilo\(\{ searchPage \}\)/);
});

test('in a preview, the search page says that search is not in the preview, and asks nothing', () => {
  const built = build(searching, searchPage, '/preview/');

  assert.equal(built.status, 0, built.log);
  const { document } = built.page('/search/').window;
  assert.equal(document.querySelector('[data-konzilo-search]'), null);
  assert.equal(document.querySelector('.konzilo-search-preview').textContent, 'Search is not in the preview.');
  assert.equal(built.page('/hello/').window.document.querySelector('header form').getAttribute('action'), '/preview/search/');
});

// The search page's script, run on the built search page at `query`, with
// `answer` standing in for the route: a function of the address asked for
// to a fetch answer, or an Error, which the fetch then throws.
async function searched(page, query, answer) {
  const window = new JSDOM(page, { url: `${ORIGIN}/search/${query}` }).window;
  const asked = [];
  await searchClient(window, {
    fetch: async (address) => {
      asked.push(address);
      const given = answer(address);
      if (given instanceof Error) throw given;
      return { ok: given.status === 200, status: given.status, json: async () => given.body };
    },
  });
  const { document } = window;
  const texts = (selector) => [...document.querySelectorAll(selector)].map((element) => element.textContent.trim().replace(/\s+/g, ' '));
  return { window, document, asked, texts, status: document.querySelector('[role="status"]').textContent };
}

// Typesense's answer to a search, as 30.2 gives it, with `hits`.
function found(hits, { found: count = hits.length, page = 1 } = {}) {
  return { status: 200, body: { facet_counts: [], found: count, hits, out_of: count, page, request_params: { collection_name: 'site-1', first_q: 'x', per_page: 10, q: 'x' }, search_cutoff: false, search_time_ms: 0 } };
}

describe('the search page\'s script', () => {
  let page;

  before(() => {
    const built = build(searching, searchPage);
    assert.equal(built.status, 0, built.log);
    page = built.html('/search/');
  });

  test('asks the route with the query and the page, and shows each result\'s title linked to its address, its type, its date and its snippet with the matched words marked', async () => {
    const hit = {
      document: { address: '/hello/', title: 'Hello', type: 'post', label: 'Article', date: Date.parse('2026-10-01T08:00:00Z') / 1000 },
      highlights: [{ field: 'body', matched_tokens: ['quetzal'], snippet: 'A word only this post holds: <mark>quetzal</mark>.' }],
    };
    const other = { document: { address: '/pages/about/', title: 'About <us>', type: 'page', label: 'Page', excerpt: 'Who we are.' }, highlights: [] };

    const { asked, document, texts, status } = await searched(page, '?q=quetzal%20bird', () => found([hit, other]));

    assert.deepEqual(asked, ['/_konzilo/search?q=quetzal+bird&page=1']);
    assert.equal(document.querySelector('[data-konzilo-search] input[name="q"]').value, 'quetzal bird');
    assert.equal(status, '2 results for “quetzal bird”');
    const links = [...document.querySelectorAll('.konzilo-search-results li a')];
    assert.deepEqual(links.map((link) => [link.textContent, link.getAttribute('href')]), [['Hello', '/hello/'], ['About <us>', '/pages/about/']]);
    assert.deepEqual(texts('.konzilo-search-results .konzilo-search-type'), ['Article', 'Page']);
    assert.deepEqual(texts('.konzilo-search-results time'), ['1 October 2026']);
    assert.equal(document.querySelector('.konzilo-search-results time').getAttribute('datetime'), '2026-10-01T08:00:00.000Z');
    assert.deepEqual(texts('.konzilo-search-results .konzilo-search-snippet'), ['A word only this post holds: quetzal.', 'Who we are.']);
    assert.deepEqual(texts('.konzilo-search-results mark'), ['quetzal']);
    assert.equal(document.querySelector('.konzilo-search-pages').hidden, true);
  });

  test('passes a filter by type on to the route, and leads to the other pages of results', async () => {
    const hits = Array.from({ length: 10 }, (_, index) => ({ document: { address: `/p${index}/`, title: `P${index}`, type: 'post', label: 'Article' }, highlights: [] }));

    const { asked, document, status } = await searched(page, '?q=p&page=2&type=post', () => found(hits, { found: 25, page: 2 }));

    assert.deepEqual(asked, ['/_konzilo/search?q=p&page=2&filter_by=type%3A%3Dpost']);
    assert.equal(status, '25 results for “p”, page 2 of 3');
    const pages = document.querySelector('.konzilo-search-pages');
    assert.equal(pages.hidden, false);
    assert.equal(pages.getAttribute('aria-label'), 'Pages of results');
    assert.deepEqual([...pages.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href'), link.getAttribute('rel')]), [
      ['Previous', '?q=p&type=post&page=1', 'prev'],
      ['Next', '?q=p&type=post&page=3', 'next'],
    ]);
  });

  // A language's search page searches that language alone.
  test('on a page that names its language, asks for that language\'s documents alone, beside a filter by type, and shows a snippet of the language\'s body', async () => {
    const swedish = page.replace('data-konzilo-search=', 'data-language="sv_SE" data-konzilo-search=');
    const hit = { document: { address: '/sv/hej/', title: 'Hej', type: 'post', label: 'Article' }, highlights: [{ field: 'body_sv', matched_tokens: ['hej'], snippet: '<mark>Hej</mark> på dig.' }] };

    const { asked, texts } = await searched(swedish, '?q=hej&type=post', () => found([hit]));

    assert.deepEqual(asked, ['/_konzilo/search?q=hej&page=1&filter_by=language%3A%3Dsv_SE+%26%26+type%3A%3Dpost']);
    assert.deepEqual(texts('.konzilo-search-results .konzilo-search-snippet'), ['Hej på dig.']);
  });

  test('says plainly when nothing matched, and when search does not answer', async () => {
    const nothing = await searched(page, '?q=nothing', () => found([]));
    const down = await searched(page, '?q=down', () => ({ status: 502, body: { message: 'Search does not answer.' } }));
    const away = await searched(page, '?q=away', () => new Error('Failed to fetch'));

    assert.equal(nothing.status, 'Nothing matched your search.');
    assert.equal(down.status, 'Search does not answer right now. Try again in a while.');
    assert.equal(away.status, 'Search does not answer right now. Try again in a while.');
    for (const { document } of [nothing, down, away]) assert.equal(document.querySelectorAll('.konzilo-search-results li').length, 0);
  });

  test('asks nothing without a query', async () => {
    const { asked, status } = await searched(page, '', () => found([]));
    const blank = await searched(page, '?q=%20%20', () => found([]));

    assert.deepEqual([asked, blank.asked], [[], []]);
    assert.equal(status, '');
  });
});

// Typesense, stood in for: it records each search it gets and answers it
// as Typesense 30.2 answers one, or with `answer` when that is set.
function standInSearch() {
  const requests = [];
  const state = { answer: null };
  const server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, headers: request.headers });
    const [status, body] = state.answer ?? [200, found([]).body];
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }).end(JSON.stringify(body));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, state, url: `http://127.0.0.1:${server.address().port}` })));
}

function send(origin, method, path) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(new URL(path, origin), { method }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject);
    request.end();
  });
}

describe('the dev server', () => {
  let repository;
  let server;
  let origin;
  let typesense;
  const searchKey = 'the-local-search-key';

  before(async () => {
    typesense = await standInSearch();
    repository = siteRepository({
      'site-description.json': JSON.stringify(searching),
      'astro.config.mjs': astroConfig(integration, searchPage),
      'search-key': `${searchKey}\n`,
    });
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    const env = { ...astroEnvironment, KONZILO_TYPESENSE: typesense.url, KONZILO_SEARCH_COLLECTION: 'site', KONZILO_SEARCH_KEY_FILE: join(repository, 'search-key') };
    server = spawn(process.execPath, [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], { cwd: repository, env, stdio: 'ignore', detached: true });
    await until(async () => (await send(origin, 'GET', '/hello/')).status === 200);
  });

  after(() => {
    try {
      process.kill(-server.pid);
    } catch {
      // It has ended already.
    }
    typesense.server.close();
    rmSync(repository, { recursive: true, force: true });
  });

  test('passes a search to the site\'s collection with the query, the page and a filter by type alone, and a key that runs the site\'s search', async () => {
    typesense.state.answer = [200, found([{ document: { title: 'Hello' }, highlights: [] }]).body];

    const answer = await send(origin, 'GET', '/_konzilo/search?q=hello&page=2&filter_by=type:=post&per_page=250&include_fields=body&x-typesense-api-key=other&query_by=address');

    assert.equal(answer.status, 200);
    assert.equal(JSON.parse(answer.body).hits[0].document.title, 'Hello');
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.equal(answer.headers['x-content-type-options'], 'nosniff');
    assert.match(answer.headers['content-type'], /^application\/json/);
    const got = typesense.requests.at(-1);
    assert.equal(got.method, 'GET');
    assert.equal(got.url, '/collections/site/documents/search?q=hello&page=2&filter_by=type%3A%3Dpost');
    assert.equal(got.headers['x-typesense-api-key'], scopedSearchKey(searchKey, searchParameters(searching)));
  });

  test('refuses every other method, and every path below /_konzilo/search, without asking Typesense', async () => {
    const before = typesense.requests.length;

    const posted = await send(origin, 'POST', '/_konzilo/search?q=hello');
    const below = await send(origin, 'GET', '/_konzilo/search/collections?q=hello');
    const slash = await send(origin, 'GET', '/_konzilo/search/?q=hello');

    assert.equal(posted.status, 405);
    assert.equal(posted.headers.allow, 'GET');
    assert.equal(below.status, 404);
    assert.equal(slash.status, 404);
    for (const answer of [posted, below, slash]) assert.equal(answer.headers['cache-control'], 'no-store');
    assert.equal(typesense.requests.length, before);
  });

  test('answers the search page, which says noindex, and its script', async () => {
    const answer = await send(origin, 'GET', '/search/');

    assert.equal(answer.status, 200);
    assert.match(answer.body, /<meta name="robots" content="noindex">/);
    const [, src] = answer.body.match(/<script type="module" src="([^"]*search-client[^"]*)"/);
    const script = await send(origin, 'GET', src.replaceAll('&amp;', '&'));
    assert.equal(script.status, 200, src);
    assert.match(script.body, /searchClient/);
  });

  test('answers 502 when Typesense does not answer, and the site\'s pages go on', async () => {
    await new Promise((resolve) => typesense.server.close(resolve));

    const answer = await send(origin, 'GET', '/_konzilo/search?q=hello');

    assert.equal(answer.status, 502);
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.equal((await send(origin, 'GET', '/hello/')).status, 200);
  });
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createNetServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

async function until(check, timeout = 30_000) {
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
