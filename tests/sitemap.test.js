// The sitemap and robots.txt, as Konzilo's Astro integration makes
// them in a site repository from the content files, without a file of the
// site's own: `/sitemap.xml` lists the start page and every published post
// of a type with an address, at its current address on the public host,
// leaving out a post marked noindex and every redirect, with the post's last
// change, else its date, as `lastmod`; `/robots.txt` lets every crawler in
// and names the sitemap.
//
// - The static build, as a build on the shared server runs it, writes both
//   for the public host it is built for.
// - Astro's dev server, as a local site runs it, answers both with their
//   types, and follows each change of the content at once.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { GROUP, robotsTxt } from '../src/astro/robots.js';
import { LIMIT, sitemapAddresses, sitemapFiles } from '../src/astro/sitemap.js';
import { siteDescription } from '../src/site-description.js';
import { astroConfig, astroEnvironment, ORIGIN } from './lib/astro.js';
import { paragraphs, post, writeContent } from './lib/content.js';

// The npm package, which a site installs beside Astro, and its command.
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = JSON.stringify(join(core, 'src/astro/index.js'));

// Articles with a date, their last change and the search and sharing fields,
// news with a date alone, pages with the search and sharing fields alone,
// and snippets, which have no page.
const site = {
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { date: {}, modified: {}, seo: {} } },
    news: { label: 'News item', plural: 'News', collection: 'news', address: '/news/{slug}/', elements: ['paragraph'], fields: { date: {} } },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph'], fields: { seo: {} } },
    snippet: { label: 'Snippet', plural: 'Snippets', collection: 'snippets', elements: ['paragraph'] },
  },
};

const article = (fields) => post({ body: paragraphs('Body.'), date: '2026-10-01 08:00:00', ...fields });

const posts = [
  // Renamed once, so its old address redirects, and led to by a rule of its own.
  article({ ID: 1, slug: 'renamed', title: 'Renamed', modified: '2026-10-20 14:05:09', meta: { old_slug: ['first-name'] }, rules: [{ id: 20, address: '/campaign/', answer: 302 }] }),
  article({ ID: 2, slug: 'thank-you', title: 'Thank you', modified: '2026-10-21 09:00:00', meta: { seo_noindex: ['1'], seo_title: ['Thanks'] } }),
  article({ ID: 3, slug: 'tips', title: 'Tips', modified: '2026-10-22 16:30:00', meta: { seo_nofollow: ['1'] } }),
  article({ ID: 4, status: 'draft', slug: 'unfinished', title: 'Unfinished', modified: '2026-10-23 10:00:00' }),
  post({ ID: 5, type: 'news', slug: 'opening', title: 'Opening', date: '2026-10-05 09:30:00', body: paragraphs('News.') }),
  post({ ID: 6, type: 'page', slug: 'who-we-are', title: 'Who we are', body: paragraphs('Us.'), meta: { old_slug: ['about-us'] } }),
  post({ ID: 7, type: 'snippet', slug: 'footer', title: 'Footer', body: paragraphs('Small print.') }),
];

// The site's own rules, as a build hands them out.
const siteRules = [
  { id: 30, from: '/winter/', to: '/tips/', status: 301 },
  { id: 31, from: '/gone/', status: 410 },
];

// Each type's page, as a site's design serves it at the type's address.
function page(collection) {
  return [
    '---',
    "import { getCollection } from 'astro:content';",
    'export async function getStaticPaths() {',
    `  return (await getCollection('${collection}')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));`,
    '}',
    'const { entry } = Astro.props;',
    '---',
    '<h1>{entry.data.title}</h1>',
    '',
  ].join('\n');
}

const design = {
  'src/pages/index.astro': '<h1>Start</h1>\n',
  'src/pages/[slug].astro': page('articles'),
  'src/pages/news/[slug].astro': page('news'),
  'src/pages/pages/[slug].astro': page('pages'),
  'src/pages/contact.astro': '<h1>Contact us</h1>\n',
};

// A site repository with Astro and Konzilo's package installed, the site's
// design and `own`, files of the site's own, and its content folder, into
// which the posts are written as a build writes them.
function siteRepository(own = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-sitemap-'));
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  const sources = {
    'astro.config.mjs': astroConfig(join(core, 'src/astro/index.js')),
    'src/content.config.mjs': `import { collections as konziloCollections } from ${integration};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify(site),
    ...design,
    ...own,
  };
  for (const [path, contents] of Object.entries(sources)) write(repository, path, contents);
  writeInto(repository, posts);
  return repository;
}

function write(repository, path, contents) {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), contents);
}

function writeInto(repository, exported) {
  write(repository, 'site-settings.json', JSON.stringify({ menus: {}, settings: {}, redirects: siteRules }));
  const result = writeContent(repository, exported);
  assert.equal(result.status, 0, result.stderr);
}

function build(repository) {
  return spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
}

// The sitemap of the posts above, for https://www.example.com, written by
// hand from the sitemap protocol: the start page and the posts not marked
// noindex, sorted by address, absolute, each with its last change, else its
// date, to the second in UTC, where its type declares one.
const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/</loc>
  </url>
  <url>
    <loc>https://www.example.com/news/opening/</loc>
    <lastmod>2026-10-05T09:30:00Z</lastmod>
  </url>
  <url>
    <loc>https://www.example.com/pages/who-we-are/</loc>
  </url>
  <url>
    <loc>https://www.example.com/renamed/</loc>
    <lastmod>2026-10-20T14:05:09Z</lastmod>
  </url>
  <url>
    <loc>https://www.example.com/tips/</loc>
    <lastmod>2026-10-22T16:30:00Z</lastmod>
  </url>
</urlset>
`;

// robots.txt for https://www.example.com, as the ticket gives it,
// with AI visibility's default content signals.
const ROBOTS = `User-agent: *
Allow: /
# AI usage content signals
Content-Signal: ai-input=yes

Sitemap: https://www.example.com/sitemap.xml
`;

test('a line another part of the core adds through its place in robots.txt lands inside the group for every crawler', async () => {
  const part = ({ origin }) => [`# for ${origin}`];
  GROUP.push(part);
  try {
    assert.equal(await robotsTxt(ORIGIN), `User-agent: *
Allow: /
# AI usage content signals
Content-Signal: ai-input=yes
# for https://www.example.com

Sitemap: https://www.example.com/sitemap.xml
`);
  } finally {
    GROUP.splice(GROUP.indexOf(part), 1);
  }
  assert.equal(await robotsTxt(ORIGIN), ROBOTS);
});

test('a sitemap of more addresses than one file may hold becomes an index of numbered files, each holding as many as one may', () => {
  const addresses = [{ path: '/' }, ...['a', 'b', 'c', 'd'].map((slug) => ({ path: `/${slug}/`, lastmod: new Date('2026-10-20T14:05:09Z') }))];
  const urlset = (...entries) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((entry) => `  <url>\n    <loc>https://www.example.com${entry}</loc>\n${entry === '/' ? '' : '    <lastmod>2026-10-20T14:05:09Z</lastmod>\n'}  </url>\n`).join('')}</urlset>
`;
  assert.deepEqual(Object.fromEntries(sitemapFiles(addresses, ORIGIN, 2)), {
    '/sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://www.example.com/sitemap-1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://www.example.com/sitemap-2.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://www.example.com/sitemap-3.xml</loc>
  </sitemap>
</sitemapindex>
`,
    '/sitemap-1.xml': urlset('/', '/a/'),
    '/sitemap-2.xml': urlset('/b/', '/c/'),
    '/sitemap-3.xml': urlset('/d/'),
  });
  assert.deepEqual([...sitemapFiles(addresses, ORIGIN, 5).keys()], ['/sitemap.xml']);
  assert.equal(sitemapFiles(addresses, ORIGIN, 5).get('/sitemap.xml'), urlset('/', '/a/', '/b/', '/c/', '/d/'));
  assert.equal(LIMIT, 50_000);
});

test('on a site in several languages, every page carries its alternates, in each file of a sitemap index too, and none is a page the sitemap leaves out', async () => {
  const { types, languages } = siteDescription({
    languages: ['sv_SE', 'en_GB'],
    images: site.images,
    types: { page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph', 'post-list'], fields: { seo: {} } } },
  });
  const key = (letter) => ({ translationKey: letter.repeat(16) });
  const entry = (id, data = {}, body = 'Body.\n') => ({ id, data: { title: id, ...data }, body });
  const pages = [
    entry('sv-SE/hamnen', key('a')),
    entry('en-GB/harbour', key('a')),
    entry('sv-SE/dold', key('b')),
    entry('en-GB/hidden', { ...key('b'), seo: { noindex: true } }),
    // A list with pages of its own, whose later pages are no post's, so the
    // post below them is listed nowhere, and is no alternate either.
    entry('sv-SE/lista', {}, '::post-list{type="page" pages="true" presentation="list"}\n'),
    entry('sv-SE/lista/page/2', key('c')),
    entry('en-GB/second', key('c')),
  ];
  const addresses = await sitemapAddresses(types, async (collection) => (collection === 'pages' ? pages : []), {}, languages);
  const files = sitemapFiles(addresses, ORIGIN, 4);
  const link = (tag, path) => `    <xhtml:link rel="alternate" hreflang="${tag}" href="https://www.example.com${path}"/>\n`;
  const url = (path, ...links) => `  <url>\n    <loc>https://www.example.com${path}</loc>\n${links.join('')}  </url>\n`;
  const urlset = (...urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('')}</urlset>
`;
  const starts = [link('sv-SE', '/sv/'), link('en-GB', '/en/'), link('x-default', '/sv/')];
  const pair = [link('sv-SE', '/sv/pages/hamnen/'), link('en-GB', '/en/pages/harbour/'), link('x-default', '/sv/pages/hamnen/')];
  assert.deepEqual(Object.fromEntries(files), {
    '/sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://www.example.com/sitemap-1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://www.example.com/sitemap-2.xml</loc>
  </sitemap>
</sitemapindex>
`,
    '/sitemap-1.xml': urlset(url('/sv/', ...starts), url('/en/', ...starts), url('/en/pages/harbour/', ...pair), url('/en/pages/second/', link('en-GB', '/en/pages/second/'))),
    '/sitemap-2.xml': urlset(
      url('/sv/pages/dold/', link('sv-SE', '/sv/pages/dold/'), link('x-default', '/sv/pages/dold/')),
      url('/sv/pages/hamnen/', ...pair),
      url('/sv/pages/lista/', link('sv-SE', '/sv/pages/lista/'), link('x-default', '/sv/pages/lista/')),
    ),
  });
});

describe('a build of a site with more addresses than one file of a sitemap may hold', () => {
  let repository;
  let built;

  before(() => {
    repository = mkdtempSync(join(tmpdir(), 'konzilo-sitemap-'));
    symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
    const dated = { types: { post: { ...site.types.post, fields: { date: {} } } } };
    for (const [path, contents] of Object.entries({
      'astro.config.mjs': astroConfig(join(core, 'src/astro/index.js')),
      'src/content.config.mjs': `import { collections as konziloCollections } from ${integration};\n\nexport const collections = konziloCollections();\n`,
      'site-description.json': JSON.stringify(dated),
      'src/pages/index.astro': '<h1>Start</h1>\n',
    })) write(repository, path, contents);
    // The start page and 50,001 posts, written as the intake writes them.
    mkdirSync(join(repository, 'content/articles'), { recursive: true });
    for (let number = 0; number <= 50_000; number += 1) {
      writeFileSync(join(repository, 'content/articles', `post-${number}.md`), `---\ntitle: "Post ${number}"\ndate: 2026-10-01T08:00:00Z\n---\n\nBody.\n`);
    }
    built = build(repository);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  const output = (path) => readFileSync(join(repository, 'dist', path), 'utf8');

  test('writes the sitemap as an index of two numbered files, the first holding 50,000 addresses and the second the rest', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.equal(output('sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://www.example.com/sitemap-1.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://www.example.com/sitemap-2.xml</loc>
  </sitemap>
</sitemapindex>
`);
    const first = output('sitemap-1.xml');
    assert.equal(first.match(/<url>/g).length, 50_000);
    assert.match(first, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">\n {2}<url>\n {4}<loc>https:\/\/www\.example\.com\/<\/loc>\n {2}<\/url>\n/);
    // Sorted by address, as text: post-9998 and post-9999 come last.
    assert.equal(output('sitemap-2.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/post-9998/</loc>
    <lastmod>2026-10-01T08:00:00Z</lastmod>
  </url>
  <url>
    <loc>https://www.example.com/post-9999/</loc>
    <lastmod>2026-10-01T08:00:00Z</lastmod>
  </url>
</urlset>
`);
    assert.equal(existsSync(join(repository, 'dist/sitemap-3.xml')), false);
  });
});

describe('the static build', () => {
  let repository;
  let built;

  before(() => {
    repository = siteRepository();
    built = build(repository);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  const output = (path) => readFileSync(join(repository, 'dist', path), 'utf8');

  test('succeeds', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  });

  test('writes a sitemap of exactly the start page and the published posts not marked noindex, absolute, with their last change', () => {
    assert.equal(output('sitemap.xml'), SITEMAP);
  });

  test('writes a robots.txt that lets every crawler in and names the sitemap on the public host', () => {
    assert.equal(output('robots.txt'), ROBOTS);
  });
});

describe('the dev server', () => {
  let repository;
  let server;
  let origin;

  before(async () => {
    repository = siteRepository();
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // In the foreground, which Astro leaves for the background when it finds
    // itself run by an agent, unless told to ignore its lock file.
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: astroEnvironment, stdio: 'ignore', detached: true });
    await until(async () => (await fetch(`${origin}/tips/`)).ok);
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

  const answer = async (path) => {
    const response = await fetch(`${origin}${path}`);
    return { status: response.status, type: response.headers.get('content-type'), text: await response.text() };
  };

  test('answers the sitemap as XML and robots.txt as text, the same bytes a build writes', async () => {
    assert.deepEqual(await answer('/sitemap.xml'), { status: 200, type: 'application/xml', text: SITEMAP });
    assert.deepEqual(await answer('/robots.txt'), { status: 200, type: 'text/plain; charset=utf-8', text: ROBOTS });
  });

  test('follows the next change of the content at once: a post marked noindex leaves the sitemap, and a newly published one joins it', async () => {
    const hidden = { ...posts[2], modified: '2026-10-28 08:00:00', meta: { seo_noindex: ['1'] } };
    const added = article({ ID: 8, slug: 'fresh', title: 'Fresh', modified: '2026-10-29 07:15:00' });
    writeInto(repository, [...posts.filter((each) => each !== posts[2]), hidden, added]);
    const expected = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.example.com/</loc>
  </url>
  <url>
    <loc>https://www.example.com/fresh/</loc>
    <lastmod>2026-10-29T07:15:00Z</lastmod>
  </url>
  <url>
    <loc>https://www.example.com/news/opening/</loc>
    <lastmod>2026-10-05T09:30:00Z</lastmod>
  </url>
  <url>
    <loc>https://www.example.com/pages/who-we-are/</loc>
  </url>
  <url>
    <loc>https://www.example.com/renamed/</loc>
    <lastmod>2026-10-20T14:05:09Z</lastmod>
  </url>
</urlset>
`;
    await until(async () => (await answer('/sitemap.xml')).text === expected).catch(() => {});
    assert.equal((await answer('/sitemap.xml')).text, expected);
  });
});

describe('a build of a site with a file of its own at either address', () => {
  const builds = {};

  before(() => {
    const own = {
      'public robots.txt': { 'public/robots.txt': 'User-agent: *\nDisallow: /\n' },
      'public sitemap.xml': { 'public/sitemap.xml': '<urlset/>\n' },
      'page robots.txt': { 'src/pages/robots.txt.js': "export const GET = () => new Response('User-agent: *\\n');\n" },
      'page sitemap.xml': { 'src/pages/sitemap.xml.ts': "export const GET = () => new Response('<urlset/>');\n" },
      'public sitemap-1.xml': { 'public/sitemap-1.xml': '<urlset/>\n' },
      'page sitemap-2.xml': { 'src/pages/sitemap-2.xml.ts': "export const GET = () => new Response('<urlset/>');\n" },
    };
    for (const [what, files] of Object.entries(own)) {
      const repository = siteRepository(files);
      builds[what] = { repository, built: build(repository) };
    }
  });

  after(() => {
    for (const { repository } of Object.values(builds)) rmSync(repository, { recursive: true, force: true });
  });

  test('fails, naming the file: a site has one robots.txt and one sitemap, with its numbered files, the core\'s', () => {
    const named = {
      'public robots.txt': 'public/robots.txt',
      'public sitemap.xml': 'public/sitemap.xml',
      'page robots.txt': 'src/pages/robots.txt.js',
      'page sitemap.xml': 'src/pages/sitemap.xml.ts',
      'public sitemap-1.xml': 'public/sitemap-1.xml',
      'page sitemap-2.xml': 'src/pages/sitemap-2.xml.ts',
    };
    for (const [what, file] of Object.entries(named)) {
      const { built } = builds[what];
      assert.notEqual(built.status, 0, what);
      const address = `/${what.split(' ')[1]}`;
      assert.match(built.stdout + built.stderr, new RegExp(`Konzilo writes the site's ${address.replace('.', '\\.')} itself, so the site may not have one of its own: remove ${file.replaceAll('.', '\\.')}`), what);
    }
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

// Wait until `check` holds, for at most half a minute.
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
