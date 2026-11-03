// The log of addresses not found on a local site:
// Astro's dev server keeps counts of the public host's 404 answers, in the file KONZILO_NOT_FOUND names. For each
// address it answered 404 to a GET or a HEAD, without its query, but below
// /_konzilo/ and at a path of over 300 characters: how often, and when last.
// An address goes 30 days after it was last asked for, and once the dev
// server answers it with something else, as a post or a rule now holds it;
// of more than 5,000, the least recently asked go first.
//
// - Astro's dev server, as a local site runs it, with the site's rules.
// - The dev server's step that counts, with the clock moved.
// - The limits, which the server command's fold holds equal.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ADDRESSES, KEPT, PATH_LIMIT, devNotFoundLog } from '../src/astro/not-found-log.js';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { paragraphs, post, writeContent } from './lib/content.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');

const site = {
  types: { post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } },
};
const siteRules = [
  { id: 30, from: '/gone/', status: 410 },
  { id: 31, from: '/missing/', status: 404 },
  { id: 32, from: '/moved/', to: '/first/', status: 301 },
];
const first = post({ ID: 1, slug: 'first', title: 'First', body: paragraphs('Body.') });

function write(repository, path, contents) {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), contents);
}

function siteRepository() {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-not-found-log-'));
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  const integration = JSON.stringify(join(core, 'src/astro/index.js'));
  const sources = {
    'astro.config.mjs': astroConfig(join(core, 'src/astro/index.js')),
    'src/content.config.mjs': `import { collections as konziloCollections } from ${integration};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify(site),
    'src/pages/[slug].astro': [
      '---',
      "import { getCollection } from 'astro:content';",
      'export async function getStaticPaths() {',
      "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
      '}',
      'const { entry } = Astro.props;',
      '---',
      '<h1>{entry.data.title}</h1>',
      '',
    ].join('\n'),
    'src/pages/404.astro': '<h1>Nothing at this address</h1>\n',
  };
  for (const [path, contents] of Object.entries(sources)) write(repository, path, contents);
  return repository;
}

function writeInto(repository, exported) {
  write(repository, 'site-settings.json', JSON.stringify({ menus: {}, settings: {}, redirects: siteRules }));
  const result = writeContent(repository, exported);
  assert.equal(result.status, 0, result.stderr);
}

const counts = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).addresses : {});
const requests = (file) => Object.fromEntries(Object.entries(counts(file)).map(([path, entry]) => [path, entry.count]));

describe('the dev server', () => {
  let repository;
  let server;
  let origin;
  let file;

  before(async () => {
    repository = siteRepository();
    writeInto(repository, [first]);
    file = join(repository, 'not-found.json');
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: { ...astroEnvironment, KONZILO_NOT_FOUND: file }, stdio: 'ignore', detached: true });
    // Astro's first start in a folder takes a while.
    await until(async () => (await fetch(`${origin}/first/`)).ok, 90_000);
  });

  after(() => {
    try {
      process.kill(-server.pid);
    } catch {
      // It has ended already.
    }
    rmSync(repository, { recursive: true, force: true });
  });

  const ask = (path, method = 'GET') => fetch(`${origin}${path}`, { method, redirect: 'manual', headers: { 'User-Agent': 'the-visitors-browser', Referer: 'https://referrer.example/' } });

  test('counts each address it answers 404 to a GET or a HEAD, without its query, a rule\'s 404 among them', async () => {
    const longest = `/${'a'.repeat(PATH_LIMIT - 1)}`;
    for (let n = 0; n < 3; n++) assert.equal((await ask('/nowhere/?email=a@b.c')).status, 404);
    assert.equal((await ask('/headed/', 'HEAD')).status, 404);
    assert.equal((await ask('/missing/')).status, 404);
    assert.equal((await ask(longest)).status, 404);
    assert.equal((await ask(`${longest}a`)).status, 404);
    await ask('/posted/', 'POST');
    await ask('/_konzilo/nothing');
    assert.equal((await ask('/gone/')).status, 410);
    assert.equal((await ask('/moved/')).status, 301);
    assert.equal((await ask('/first/')).status, 200);
    await until(() => requests(file)['/nowhere/'] === 3);
    assert.deepEqual(requests(file), { '/nowhere/': 3, '/headed/': 1, '/missing/': 1, [longest]: 1 });
    const text = readFileSync(file, 'utf8');
    for (const secret of ['email', 'the-visitors-browser', 'referrer.example', '127.0.0.1']) assert.ok(!text.includes(secret), secret);
  });

  test('lets an address go once a post holds it', async () => {
    assert.equal((await ask('/second/')).status, 404);
    await until(() => requests(file)['/second/'] === 1);
    writeInto(repository, [first, post({ ID: 2, slug: 'second', title: 'Second', body: paragraphs('Two.') })]);
    await until(async () => (await ask('/second/')).status === 200);
    await until(() => !('/second/' in counts(file)));
  });
});

describe('the dev server\'s count', () => {
  // The step as the dev server takes it, before an answer of `status`.
  async function answered(file, path, status, now) {
    const step = devNotFoundLog({ file, now: () => now });
    const server = createHttpServer((request, response) => step(request, response, () => {
      response.statusCode = status;
      response.end();
    }));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    await new Promise((resolve) => server.close(resolve));
  }

  const NOW = 1793361600;
  const DAY = 86400;
  let file;

  before(() => {
    file = join(mkdtempSync(join(tmpdir(), 'konzilo-not-found-count-')), 'not-found.json');
  });

  test('keeps when each address was last asked for, and lets it go 30 days after', async () => {
    writeFileSync(file, JSON.stringify({ addresses: { '/stale/': { count: 4, last: NOW - KEPT }, '/fresh/': { count: 2, last: NOW - 3 * DAY, hidden: true } } }));
    await answered(file, '/fresh/?x=1', 404, NOW);
    assert.deepEqual(counts(file), { '/stale/': { count: 4, last: NOW - KEPT }, '/fresh/': { count: 3, last: NOW, hidden: true } });
    await answered(file, '/new/', 404, NOW + 1);
    assert.deepEqual(Object.keys(counts(file)).sort(), ['/fresh/', '/new/']);
  });

  test('keeps 5,000 addresses and lets the least recently asked go first', async () => {
    const many = Object.fromEntries(Array.from({ length: ADDRESSES }, (_, n) => [`/a-${n}/`, { count: 1, last: NOW - 10_000 + n }]));
    writeFileSync(file, JSON.stringify({ addresses: many }));
    await answered(file, '/new/', 404, NOW);
    const kept = counts(file);
    assert.equal(Object.keys(kept).length, ADDRESSES);
    assert.ok(!('/a-0/' in kept) && '/a-1/' in kept && '/new/' in kept);
  });

  test('lets an address go that it answers otherwise now, but not for an error of its own', async () => {
    writeFileSync(file, JSON.stringify({ addresses: { '/held/': { count: 1, last: NOW }, '/broken/': { count: 1, last: NOW } } }));
    await answered(file, '/held/', 200, NOW);
    await answered(file, '/broken/', 500, NOW);
    assert.deepEqual(Object.keys(counts(file)), ['/broken/']);
  });

  test('counts nothing without a file to keep the counts in', async () => {
    await answered(undefined, '/nowhere/', 404, NOW);
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
