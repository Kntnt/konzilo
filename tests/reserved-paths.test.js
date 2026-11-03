// The reserved paths below /_konzilo/, as Konzilo's Astro
// integration keeps them for the site's services:
//
// - a static build, as a build on the shared server runs it, fails when it
//   would write a page or a file there, naming each, so that no release ever
//   holds one;
// - Astro's dev server, as a local site runs it, passes every request below
//   the prefix to the site's endpoint, which KONZILO_ENDPOINT names, without
//   what would tell the visitor apart, and shows no page of its own there.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment } from './lib/astro.js';

// The npm package, which a site installs beside Astro.
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = JSON.stringify(join(core, 'src/astro/index.js'));

const site = {
  types: { post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: [] } },
};

// A page of the site's design at every path it lists, as a design with a
// catch-all route could make one at any address.
function pagesAt(paths) {
  return [
    '---',
    'export function getStaticPaths() {',
    `  return ${JSON.stringify(paths)}.map((path) => ({ params: { path } }));`,
    '}',
    '---',
    '<h1>{Astro.params.path}</h1>',
    '',
  ].join('\n');
}

// A site repository with Astro and Konzilo's package installed, and the
// files given. The core's own file below the prefix, the page that says a form's
// message was not sent, is in every build.
function siteRepository(files) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-reserved-'));
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  const sources = {
    'astro.config.mjs': astroConfig(join(core, 'src/astro/index.js'), { bodyStyles: ['./src/styles/body.css'] }),
    'src/styles/body.css': 'p { color: rebeccapurple; }\n',
    'src/content.config.mjs': `import { collections as konziloCollections } from ${integration};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify(site),
    'content/articles/.keep': '',
    ...files,
  };
  for (const [path, contents] of Object.entries(sources)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  }
  return repository;
}

function build(files) {
  const repository = siteRepository(files);
  try {
    const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    return { ...built, formNotSent: existsSync(join(repository, 'dist/_konzilo/form-not-sent.html')) };
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
}

describe('the static build', () => {
  test('succeeds with pages beside the prefix and none below it but the core\'s own', () => {
    const built = build({ 'src/pages/[...path].astro': pagesAt(['about', 'konzilo', '_konzilos/notes']) });
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.ok(built.formNotSent, 'the page that says a form was not sent is in the release');
  });

  test('fails when a page would lie below /_konzilo/, naming each such page', () => {
    const built = build({ 'src/pages/[...path].astro': pagesAt(['about', '_konzilo', '_konzilo/notes']) });
    assert.notEqual(built.status, 0);
    assert.match(`${built.stdout}\n${built.stderr}`, /the build has pages below \/_konzilo\/, where the site's services answer: \/_konzilo\/, \/_konzilo\/notes\//);
  });

  test('fails when a file of the site\'s own would lie below /_konzilo/, naming it', () => {
    const built = build({ 'src/pages/index.astro': '<h1>Start</h1>\n', 'public/_konzilo/consent.json': '{}\n' });
    assert.notEqual(built.status, 0);
    assert.match(`${built.stdout}\n${built.stderr}`, /the build has pages below \/_konzilo\/, where the site's services answer: \/_konzilo\/consent\.json/);
  });
});

// The site's endpoint, stood in for: it records each request it gets and
// answers a POST with 204 and anything else with 405, as the endpoint does
// for a kind that takes POST alone.
function standInEndpoint() {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString() });
      const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Answered-By': 'the stand-in endpoint' };
      // Below /_konzilo/forms/down, as a server in front of the endpoint answers while it does not.
      if (request.url.startsWith('/_konzilo/forms/down')) response.writeHead(502, { 'Content-Type': 'text/html' }).end('<h1>502 Bad Gateway</h1>\n');
      else if (request.method === 'POST') response.writeHead(204, headers).end();
      else response.writeHead(405, { ...headers, Allow: 'POST', 'Content-Type': 'text/plain' }).end('Method not allowed\n');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, origin: `http://127.0.0.1:${server.address().port}` })));
}

// A request as a browser could send it, every header as given: { status, headers, body }.
function send(origin, method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const request = httpRequest(new URL(path, origin), { method, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

// What tells one visitor from another, and what a browser sends of it.
const visitor = {
  Cookie: 'session=someone',
  'User-Agent': 'Mozilla/5.0 (a visitor\'s browser)',
  Referer: 'https://www.example.com/about/',
  Authorization: 'Basic c2l0ZTpwYXNzd29yZA==',
  'X-Forwarded-For': '192.0.2.7',
  Forwarded: 'for=192.0.2.7',
  'Sec-CH-UA': '"Chromium";v="141"',
  'Accept-Language': 'sv-SE',
};

describe('the dev server', () => {
  let repository;
  let server;
  let origin;
  let endpoint;

  before(async () => {
    endpoint = await standInEndpoint();
    repository = siteRepository({ 'src/pages/[...path].astro': pagesAt(['about', '_konzilo/notes']) });
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // In the foreground, which Astro leaves for the background when it finds
    // itself run by an agent, unless told to ignore its lock file.
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: { ...astroEnvironment, KONZILO_ENDPOINT: endpoint.origin }, stdio: 'ignore', detached: true });
    await until(async () => (await send(origin, 'GET', '/about/')).status === 200);
  });

  after(() => {
    // The dev server and what it started, as one process group.
    try {
      process.kill(-server.pid);
    } catch {
      // It has ended already.
    }
    endpoint.server.close();
    rmSync(repository, { recursive: true, force: true });
  });

  test('passes a request below /_konzilo/ to the endpoint with its method, path, query and body, and answers with the endpoint\'s answer', async () => {
    const body = JSON.stringify({ note: 'Hello' });
    const answer = await send(origin, 'POST', '/_konzilo/notes?from=test', { headers: { 'Content-Type': 'application/json', ...visitor }, body });

    assert.equal(answer.status, 204);
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.equal(answer.headers['x-content-type-options'], 'nosniff');
    assert.equal(answer.headers['x-answered-by'], 'the stand-in endpoint');
    const got = endpoint.requests.at(-1);
    assert.deepEqual([got.method, got.url, got.body], ['POST', '/_konzilo/notes?from=test', body]);
    assert.equal(got.headers['content-type'], 'application/json');
    assert.equal(got.headers['content-length'], String(Buffer.byteLength(body)));
  });

  test('tells the endpoint of the visitor only its address, its host and where it came from, which the endpoint keeps from every kind', async () => {
    // Astro's own dev server refuses a request it is told is cross-site
    // before the endpoint sees it, unless it is a navigation.
    const claims = { 'X-Konzilo-Client': '192.0.2.7', 'X-Konzilo-Host': 'www.example.com', Origin: 'https://www.example.com', 'Sec-Fetch-Site': 'same-site' };
    await send(origin, 'POST', '/_konzilo/notes', { headers: { 'Content-Type': 'application/json', ...visitor, ...claims }, body: '{}' });

    const { headers } = endpoint.requests.at(-1);
    for (const name of Object.keys(visitor).filter((name) => name !== 'Referer')) assert.equal(headers[name.toLowerCase()], undefined, name);
    assert.equal(headers.referer, visitor.Referer);
    assert.equal(headers.origin, 'https://www.example.com');
    assert.equal(headers['sec-fetch-site'], 'same-site');
    // The address and host the dev server itself was reached at, never what
    // a visitor's headers claim.
    assert.equal(headers['x-konzilo-client'], '127.0.0.1');
    assert.equal(headers['x-konzilo-host'], new URL(origin).host);
    const told = Object.entries(headers).filter(([name]) => !['referer', 'origin'].includes(name));
    for (const [, value] of told) assert.doesNotMatch(String(value), /192\.0\.2\.7|someone|visitor/);
  });

  test('shows no page of the site\'s below /_konzilo/: the endpoint answers there', async () => {
    const answer = await send(origin, 'GET', '/_konzilo/notes');

    assert.equal(answer.status, 405);
    assert.equal(answer.headers.allow, 'POST');
    assert.doesNotMatch(answer.body, /<h1>/);
  });

  test('answers a form below /_konzilo/forms/ that the server in front of the endpoint cannot pass on with the page that says the message was not sent', async () => {
    const answer = await send(origin, 'POST', '/_konzilo/forms/down', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=Ada' });

    assert.equal(answer.status, 502);
    assert.equal(answer.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.match(answer.body, /<h1>Your message was not sent<\/h1>/);
    assert.match(answer.body, /reach us another way/);
  });

  test('answers 502 without a store when the endpoint does not answer, and the site\'s pages go on', async () => {
    await new Promise((resolve) => endpoint.server.close(resolve));

    const answer = await send(origin, 'POST', '/_konzilo/notes', { headers: { 'Content-Type': 'application/json' }, body: '{}' });

    assert.equal(answer.status, 502);
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.equal((await send(origin, 'GET', '/about/')).status, 200);

    // A form's post gets the page that says its message was not sent, in
    // the site's language, which this site does not declare: English.
    const form = await send(origin, 'POST', '/_konzilo/forms/contact', { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'name=Ada' });
    assert.equal(form.status, 502);
    assert.equal(form.headers['content-type'], 'text/html; charset=utf-8');
    assert.equal(form.headers['x-content-type-options'], 'nosniff');
    assert.match(form.body, /^<!DOCTYPE html>\n<html lang="en">/);
    assert.match(form.body, /<h1>Your message was not sent<\/h1>/);
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
