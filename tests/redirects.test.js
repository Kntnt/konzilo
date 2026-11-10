// The redirects on the public site, as Konzilo's Astro integration makes them
// in a site repository from the content files: each old
// address a content file keeps leads to its post's current address, each
// other address answers as its rule says, and each of the site's rules in
// content/redirects.json too. An address a post or a page of the site's
// design has shows that page.
//
// - Astro's dev server, as a local site runs it, answers each rule with its
//   status, and follows each change of the content at once; a 404 or a 410 with the site's
//   404 page, as it answers an address nothing holds.
// - The static build, as a build on the shared server runs it, lists the
//   rules for the web server in `_redirects`, one `<source> <target>
//   <status>` per line, `<source> <status>` for a 404 or a 410, and writes
//   each redirect from a path as a page that sends a browser on, for a server
//   that reads no such list.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { paragraphs, post, writeContent } from './lib/content.js';

// The npm package, which a site installs beside Astro, and its command.
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');

const site = {
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph'] },
    // A type the site's design builds no page for.
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'] },
  },
};

const posts = [
  post({
    ID: 1,
    slug: 'third-name',
    title: 'Renamed twice',
    body: paragraphs('Body.'),
    meta: { live_address: ['/third-name/'] },
    rules: [
      { id: 20, address: '/campaign/', answer: 302 },
      { id: 21, address: '/deal', answer: 307 },
      { id: 25, address: '/shown-here/', answer: 'show' },
      { id: 22, address: '/first-name/', answer: 301, automatic: true },
      { id: 23, address: '/second-name/', answer: 301, automatic: true },
    ],
  }),
  post({ ID: 2, slug: 'second-name-taken', title: 'Newcomer', body: paragraphs('New.') }),
  post({
    ID: 3,
    type: 'page',
    slug: 'who-we-are',
    title: 'Who we are',
    body: paragraphs('Us.'),
    rules: [{ id: 24, address: '/pages/about-us/', answer: 301, automatic: true }],
  }),
  post({ ID: 5, slug: 'a-guide', title: 'A guide', body: paragraphs('Read me.') }),
  post({ ID: 6, type: 'note', slug: 'jotted', title: 'Jotted', body: paragraphs('Short.'), rules: [{ id: 26, address: '/jotted-here/', answer: 'show' }] }),
];

// The site's own rules, as a build hands them out, the
// patterns in the list's order. A page of the site's design holds /contact/.
const siteRules = [
  { id: 30, from: '/?p=3', to: '/pages/who-we-are/', status: 308 },
  { id: 31, from: '/shop/', to: 'https://shop.example.com/', status: 301 },
  { id: 32, from: '/gone/', status: 410 },
  { id: 33, from: '/missing/', status: 404 },
  { id: 34, from: '/contact/', to: '/third-name/', status: 301 },
  { id: 35, from: '/tips/', to: '/third-name/?from=tips', status: 302 },
  { id: 40, from: '^/blog/(\\d{4})/(.+)/$', to: '/$2/', status: 301 },
  { id: 41, from: '^/(a-guide|contact|gone|nowhere)/$', to: '/pages/who-we-are/', status: 302 },
  { id: 42, from: '^/both/(.*)$', to: '/first/$1#top', status: 307 },
  { id: 43, from: '^/both/x$', to: '/second/', status: 301 },
  { id: 44, from: '^/files/(.*)\\.pdf$', to: 'https://files.example.com/$1.pdf', status: 308 },
  { id: 45, from: '^/removed/.*$', status: 410 },
  { id: 46, from: '^/(.*)\\.php$', to: '/$1/?from=php', status: 301 },
  { id: 47, from: '^/out(.*)$', to: '/$1', status: 302 },
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

// A site repository with Astro and Konzilo's package installed, the site's
// design, and its content folder, into which the posts are exported as a
// build writes them.
function siteRepository() {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-redirects-'));
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  const integration = JSON.stringify(join(core, 'src/astro/index.js'));
  const sources = {
    'astro.config.mjs': astroConfig(join(core, 'src/astro/index.js')),
    'src/content.config.mjs': `import { collections as konziloCollections } from ${integration};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify(site),
    'src/pages/[slug].astro': page('articles'),
    'src/pages/pages/[slug].astro': page('pages'),
    'src/pages/contact.astro': '<h1>Contact us</h1>\n',
    'src/pages/404.astro': "---\nimport { getEntry } from 'astro:content';\nconst page = await getEntry('notFound', 'page');\n---\n<h1>{page?.data.title ?? 'Nothing at this address'}</h1>\n",
  };
  for (const [path, contents] of Object.entries(sources)) write(repository, path, contents);
  return repository;
}

function write(repository, path, contents) {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), contents);
}

function writeInto(repository, exported, redirects = siteRules) {
  write(repository, 'site-settings.json', JSON.stringify({ menus: {}, settings: {}, redirects }));
  const result = writeContent(repository, exported);
  assert.equal(result.status, 0, result.stderr);
}

// A content file that lists another post's address among its old ones,
// which the intake never writes.
const listingTaken = '---\ntitle: "Elsewhere"\noldAddresses: ["/second-name-taken/"]\n---\n';

describe('the static build', () => {
  let repository;
  let built;

  before(() => {
    repository = siteRepository();
    writeInto(repository, posts);
    write(repository, 'content/articles/elsewhere.md', listingTaken);
    built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  const output = (path) => readFileSync(join(repository, 'dist', path), 'utf8');

  test('succeeds', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  });

  test('lists every rule for the web server, sorted by source: old addresses, other addresses and the site\'s rules', () => {
    assert.equal(output('_redirects'), [
      '/?p=3 /pages/who-we-are/ 308',
      '/campaign/ /third-name/ 302',
      '/deal /third-name/ 307',
      '/first-name/ /third-name/ 301',
      '/gone/ 410',
      '/missing/ 404',
      '/pages/about-us/ /pages/who-we-are/ 301',
      '/second-name/ /third-name/ 301',
      '/shop/ https://shop.example.com/ 301',
      '/tips/ /third-name/?from=tips 302',
      '^/blog/(\\d{4})/(.+)/$ /$2/ 301',
      '^/(a-guide|contact|gone|nowhere)/$ /pages/who-we-are/ 302',
      '^/both/(.*)$ /first/$1#top 307',
      '^/both/x$ /second/ 301',
      '^/files/(.*)\\.pdf$ https://files.example.com/$1.pdf 308',
      '^/removed/.*$ 410',
      '^/(.*)\\.php$ /$1/?from=php 301',
      '^/out(.*)$ /$1 302',
      '',
    ].join('\n'));
  });

  test('writes no page for a pattern, and shows a post and a page of the site\'s design at an address a pattern matches', () => {
    assert.equal(existsSync(join(repository, 'dist', 'blog')), false);
    assert.equal(existsSync(join(repository, 'dist', 'nowhere')), false);
    assert.match(output('a-guide/index.html'), /<h1>A guide<\/h1>/);
    assert.doesNotMatch(output('a-guide/index.html'), /konzilo-preview-stopped/, 'only a live preview keeps a page where it is');
    assert.match(output('contact/index.html'), /<h1>Contact us<\/h1>/);
  });

  test('leaves out a rule whose source a page of the site\'s design has, shows the page there, and warns of it', () => {
    assert.match(output('contact/index.html'), /<h1>Contact us<\/h1>/);
    assert.match(built.stdout + built.stderr, /the redirect from \/contact\/ does not answer, since the site has a page of its own there/);
  });

  test('writes each redirect from a path as a page that sends a browser on to its target, and none for a 404, a 410 or a query', () => {
    for (const [from, to] of [['campaign', '/third-name/'], ['deal', '/third-name/'], ['shop', 'https://shop.example.com/'], ['tips', '/third-name/?from=tips']]) {
      const html = output(`${from}/index.html`);
      assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0;url=${to.replace('?', '\\?')}">`), from);
      assert.match(html, /<meta name="robots" content="noindex">/, from);
    }
    for (const path of ['gone/index.html', 'missing/index.html']) assert.equal(existsSync(join(repository, 'dist', path)), false, path);
  });

  test('writes each old address as a page that sends a browser on to the current address', () => {
    for (const [old, current] of [['first-name', '/third-name/'], ['second-name', '/third-name/'], ['pages/about-us', '/pages/who-we-are/']]) {
      const html = output(`${old}/index.html`);
      assert.match(html, new RegExp(`<meta http-equiv="refresh" content="0;url=${current}">`), old);
      assert.match(html, /<meta name="robots" content="noindex">/, old);
    }
  });

  test('shows the post at an address a post has now, even when a content file lists it among its old ones', () => {
    assert.match(output('second-name-taken/index.html'), /<h1>Newcomer<\/h1>/);
    assert.match(output('third-name/index.html'), /<h1>Renamed twice<\/h1>/);
    assert.doesNotMatch(output('_redirects'), /^\/second-name-taken\//m);
  });

  test('writes the post\'s page again, as it is, at an other address that shows it, which is no rule for the web server and not in the sitemap', () => {
    assert.equal(output('shown-here/index.html'), output('third-name/index.html'));
    assert.match(output('shown-here/index.html'), /<h1>Renamed twice<\/h1>/);
    assert.doesNotMatch(output('_redirects'), /shown-here/);
    assert.match(output('sitemap.xml'), /\/third-name\/<\/loc>/);
    assert.doesNotMatch(output('sitemap.xml'), /shown-here/);
  });

  test('shows no post at an other address where the site\'s design builds no page at the post\'s own, and warns of it', () => {
    assert.equal(existsSync(join(repository, 'dist', 'jotted-here')), false);
    assert.match(built.stdout + built.stderr, /the post shown at \/jotted-here\/ does not answer, since the site's design builds no page at the post's address, \/notes\/jotted\//);
  });
});

describe('the dev server', () => {
  let repository;
  let server;
  let origin;

  before(async () => {
    repository = siteRepository();
    writeInto(repository, posts);
    write(repository, 'content/articles/elsewhere.md', listingTaken);
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // In the foreground, which Astro leaves for the background when it finds
    // itself run by an agent, unless told to ignore its lock file.
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: astroEnvironment, stdio: 'ignore', detached: true });
    await until(async () => (await fetch(`${origin}/third-name/`)).ok);
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
    const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
    return { status: response.status, location: response.headers.get('location') };
  };

  test('answers each old address with a permanent redirect straight to the current address', async () => {
    assert.deepEqual(await answer('/first-name/'), { status: 301, location: '/third-name/' });
    assert.deepEqual(await answer('/second-name/'), { status: 301, location: '/third-name/' });
    assert.deepEqual(await answer('/pages/about-us/'), { status: 301, location: '/pages/who-we-are/' });
  });

  test('redirects an old address without its final slash, and keeps the query', async () => {
    assert.deepEqual(await answer('/first-name'), { status: 301, location: '/third-name/' });
    assert.deepEqual(await answer('/first-name/?from=newsletter'), { status: 301, location: '/third-name/?from=newsletter' });
  });

  test('shows the post at an address a post has now, even when a content file lists it among its old ones', async () => {
    assert.equal((await answer('/second-name-taken/')).status, 200);
    assert.equal((await answer('/third-name/')).status, 200);
  });

  test('answers each other address and each rule of the site\'s with its status, the final slash optional where the source has one', async () => {
    assert.deepEqual(await answer('/campaign/'), { status: 302, location: '/third-name/' });
    assert.deepEqual(await answer('/campaign'), { status: 302, location: '/third-name/' });
    assert.deepEqual(await answer('/deal'), { status: 307, location: '/third-name/' });
    assert.equal((await answer('/deal/')).status, 404);
    assert.deepEqual(await answer('/shop/'), { status: 301, location: 'https://shop.example.com/' });
    assert.deepEqual(await answer('/?p=3'), { status: 308, location: '/pages/who-we-are/' });
    assert.equal((await answer('/gone/')).status, 410);
    assert.equal((await answer('/gone')).status, 410);
    assert.equal((await answer('/missing/')).status, 404);
  });

  test('answers an other address that shows the post with the post\'s own page, the final slash optional', async () => {
    for (const path of ['/shown-here/', '/shown-here', '/shown-here/?utm_source=print']) {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
      assert.equal(response.status, 200, path);
      assert.match(await response.text(), /<h1[^>]*>Renamed twice<\/h1>/, path);
    }
  });

  test('answers an address nothing holds with the site\'s 404 page and 404, and a rule\'s or a pattern\'s 404 or 410 with it and that status', async () => {
    for (const [path, status] of [['/nothing-here/', 404], ['/pages/nowhere', 404], ['/gone/', 410], ['/gone?x=1', 410], ['/missing/', 404], ['/removed/anything/at/all', 410]]) {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
      assert.equal(response.status, status, path);
      assert.match(response.headers.get('content-type'), /^text\/html/, path);
      assert.match(await response.text(), /<h1[^>]*>Nothing at this address<\/h1>/, path);
    }
  });

  test('keeps the visitor\'s query unless the source or the target has one of its own', async () => {
    assert.deepEqual(await answer('/campaign/?utm_source=print'), { status: 302, location: '/third-name/?utm_source=print' });
    assert.deepEqual(await answer('/shop/?item=4'), { status: 301, location: 'https://shop.example.com/?item=4' });
    assert.deepEqual(await answer('/tips/?utm_source=print'), { status: 302, location: '/third-name/?from=tips' });
    assert.notEqual((await answer('/?p=3&utm_source=print')).status, 308);
  });

  test('shows a page of the site\'s design at its address, even when a rule has it', async () => {
    assert.equal((await answer('/contact/')).status, 200);
  });

  test('answers a pattern where nothing else does, with what its groups matched in the target', async () => {
    assert.deepEqual(await answer('/blog/2019/a-guide/'), { status: 301, location: '/a-guide/' });
    assert.deepEqual(await answer('/nowhere/'), { status: 302, location: '/pages/who-we-are/' });
    assert.deepEqual(await answer('/files/report%202019.pdf'), { status: 308, location: 'https://files.example.com/report%202019.pdf' });
    assert.equal((await answer('/removed/anything/at/all')).status, 410);
  });

  test('shows a post, a page of the site\'s design and an exact rule at an address a pattern matches', async () => {
    assert.equal((await answer('/a-guide/')).status, 200);
    assert.equal((await answer('/contact/')).status, 200);
    assert.equal((await answer('/gone/')).status, 410);
  });

  test('answers the first pattern in the list\'s order that matches, keeping the visitor\'s query unless the target has one', async () => {
    assert.deepEqual(await answer('/both/x'), { status: 307, location: '/first/x#top' });
    assert.deepEqual(await answer('/both/x?a=1'), { status: 307, location: '/first/x?a=1#top' });
    assert.deepEqual(await answer('/blog/2019/a-guide/?utm_source=print'), { status: 301, location: '/a-guide/?utm_source=print' });
    assert.deepEqual(await answer('/old.php?id=4'), { status: 301, location: '/old/?from=php' });
  });

  test('answers no pattern below /_konzilo/, nor one that would lead off the site', async () => {
    // The site's public endpoint answers there, whatever a pattern matches.
    assert.notDeepEqual(await answer('/_konzilo/search.php'), { status: 301, location: '/_konzilo/search/?from=php' });
    assert.equal((await answer('/_konzilo/search.php')).location, null);
    assert.equal((await answer('/out/evil.example/')).status, 404);
    assert.deepEqual(await answer('/outside'), { status: 302, location: '/side' });
  });

  test('follows the next change of the content at once: a new old address redirects, and an address taken again shows its post', async () => {
    // Live at /third-name/, published at /fourth-name/ now.
    const renamedAgain = { ...posts[0], slug: 'fourth-name' };
    const takingFirst = post({ ID: 4, slug: 'first-name', title: 'Taker', body: paragraphs('Mine.') });
    writeInto(repository, [renamedAgain, posts[1], posts[2], posts[3], takingFirst], [...siteRules, { id: 36, from: '/winter/', to: '/fourth-name/', status: 302 }]);

    await until(async () => (await answer('/third-name/')).status === 301);
    assert.deepEqual(await answer('/third-name/'), { status: 301, location: '/fourth-name/' });
    assert.deepEqual(await answer('/second-name/'), { status: 301, location: '/fourth-name/' });
    await until(async () => (await answer('/first-name/')).status === 200);
    assert.deepEqual(await answer('/winter/'), { status: 302, location: '/fourth-name/' });
    assert.deepEqual(await answer('/campaign/'), { status: 302, location: '/fourth-name/' });
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

// A site in several languages: Swedish first, so Swedish is the
// main language, with a design that builds each language's start page and
// each article at its address through the integration's helpers.
const languagesSite = {
  languages: ['sv_SE', 'en_GB'],
  types: { post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } },
};

const inLanguage = (ID, slug, locale) => post({ ID, slug: slug, title: `Post ${ID}`, body: paragraphs('Body.'), meta: { _locale: [locale] } });

function languagesRepository(own = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-redirects-languages-'));
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  const integration = JSON.stringify(join(core, 'src/astro/index.js'));
  const helpers = JSON.stringify(join(core, 'src/astro/site-languages.js'));
  const sources = {
    'astro.config.mjs': astroConfig(join(core, 'src/astro/index.js')),
    'src/content.config.mjs': `import { collections as konziloCollections } from ${integration};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify(languagesSite),
    'src/pages/[...start].astro': `---\nimport { startPages } from ${helpers};\nexport const getStaticPaths = () => startPages();\nconst { language } = Astro.props;\n---\n<h1>Start {language.tag}</h1>\n`,
    'src/pages/[...article].astro': `---\nimport { entryPages } from ${helpers};\nexport const getStaticPaths = () => entryPages('articles', 'article');\nconst { entry } = Astro.props;\n---\n<h1>{entry.data.title}</h1>\n`,
    'src/pages/404.astro': '<h1>Nothing at this address</h1>\n',
    ...own,
  };
  for (const [path, contents] of Object.entries(sources)) write(repository, path, contents);
  writeInto(repository, [inLanguage(1, 'hamnljus', 'sv_SE'), inLanguage(2, 'harbour-lights', 'en_GB')], []);
  return repository;
}

describe('a site in several languages', () => {
  let repository;
  let server;
  let origin;

  before(async () => {
    repository = languagesRepository();
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: astroEnvironment, stdio: 'ignore', detached: true });
    // A minute and a half, as the whole suite's load may slow its start.
    await until(async () => (await fetch(`${origin}/sv/hamnljus/`)).ok, 90_000);
  });

  after(() => {
    try {
      process.kill(-server.pid);
    } catch {
      // It has ended already.
    }
    rmSync(repository, { recursive: true, force: true });
  });

  const answer = async (path, headers = {}) => {
    const response = await fetch(`${origin}${path}`, { redirect: 'manual', headers });
    return { status: response.status, location: response.headers.get('location') };
  };

  test('the dev server leads the root to the main language\'s start page with a 301, whatever language the browser asks for, and keeps the query', async () => {
    for (const language of ['en-GB,en;q=0.9', 'sv-SE', 'de']) {
      assert.deepEqual(await answer('/', { 'Accept-Language': language }), { status: 301, location: '/sv/' }, language);
    }
    assert.deepEqual(await answer('/?utm_source=x'), { status: 301, location: '/sv/?utm_source=x' });
  });

  test('the dev server shows each language\'s start page and each post under its prefix, leads a Swedish post\'s address without the prefix to it, and has no page for a translation the site has not got', async () => {
    assert.equal((await answer('/sv/')).status, 200);
    assert.equal((await answer('/en/')).status, 200);
    assert.equal((await answer('/sv/hamnljus/')).status, 200);
    assert.equal((await answer('/en/harbour-lights/')).status, 200);
    assert.deepEqual(await answer('/hamnljus/'), { status: 301, location: '/sv/hamnljus/' });
    assert.equal((await answer('/en/hamnljus/')).status, 404);
    assert.equal((await answer('/harbour-lights/')).status, 404);
  });

  test('a build whose design has a page of its own at the root keeps it there, and warns that the root does not lead to the main language\'s start page', () => {
    const own = languagesRepository({ 'src/pages/index.astro': '<h1>Our own root</h1>\n' });
    try {
      const built = spawnSync(process.execPath, [astro, 'build'], { cwd: own, encoding: 'utf8', env: astroEnvironment });
      assert.equal(built.status, 0, built.stderr + built.stdout);
      assert.match(readFileSync(join(own, 'dist/index.html'), 'utf8'), /Our own root/);
      assert.doesNotMatch(readFileSync(join(own, 'dist/_redirects'), 'utf8'), /^\/ /m);
      assert.match(built.stdout + built.stderr, /the site's root, \/, does not lead to the main language's start page, \/sv\/, since the site has a page of its own there/);
    } finally {
      rmSync(own, { recursive: true, force: true });
    }
  });
});
