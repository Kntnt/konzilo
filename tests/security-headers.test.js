// The public site's security headers, as Konzilo's Astro
// integration makes them from the site description and the rule data:
//
// - The static build, as a build on the shared server runs it, writes them
//   into the release as `_headers`, beside `_redirects`, in the form static
//   hosts read: `/*`, then one indented `Name: value` per header. The server
//   command hands them to Caddy (tests/server/test_public_host.py).
// - Astro's dev server, as a local site runs it, sends the same headers on
//   every answer, but for the Content Security Policy, of which it sends
//   the framing part alone, since its own code is inline.
//
// The site description's `security` part opts in to `includeSubDomains`,
// and lists the origins that may frame the site. The policy itself, from the
// release's pages and the service registry, is content-security-policy.test.js's.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { HEADER_LIMIT } from '../src/astro/security-headers.js';
import { astroConfig, astroEnvironment } from './lib/astro.js';

// The npm package, which a site installs beside Astro.
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');

const types = {
  post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'embed'] },
};

// The permissions policy, the same for every site: off for what no page of
// the site asks for, and for what an embed's player is given (its `allow` in
// the rule data, and fullscreen, which every player is given), the site and
// the players' origins of the services that ask for it.
const PERMISSIONS = [
  'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=()',
  'accelerometer=(self "https://www.youtube-nocookie.com")',
  'autoplay=(self "https://api.screen9.com" "https://embed.podcasts.apple.com" "https://open.spotify.com" "https://player.vimeo.com" "https://qcnl.tv" "https://www.youtube-nocookie.com")',
  'clipboard-write=(self "https://embed.podcasts.apple.com" "https://open.spotify.com" "https://player.vimeo.com" "https://www.youtube-nocookie.com")',
  'encrypted-media=(self "https://embed.podcasts.apple.com" "https://open.spotify.com" "https://player.vimeo.com" "https://www.youtube-nocookie.com")',
  'fullscreen=(self "https://api.screen9.com" "https://codepen.io" "https://datawrapper.dwcdn.net" "https://embed.acast.com" "https://embed.podcasts.apple.com" "https://open.spotify.com" "https://player.vimeo.com" "https://qcnl.tv" "https://speakerdeck.com" "https://www.linkedin.com" "https://www.loom.com" "https://www.youtube-nocookie.com")',
  'gyroscope=(self "https://www.youtube-nocookie.com")',
  'picture-in-picture=(self "https://open.spotify.com" "https://player.vimeo.com" "https://www.youtube-nocookie.com")',
  'web-share=(self "https://player.vimeo.com" "https://www.youtube-nocookie.com")',
].join(', ');

// The Content Security Policy of a site whose pages hold no inline code and
// whose registry has no host: the site alone, for every kind of request.
const POLICY = [
  "default-src 'self'", "script-src 'self'", "style-src 'self'", "style-src-attr 'none'", "img-src 'self'", "font-src 'self'",
  "connect-src 'self'", "media-src 'self'", "frame-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
].join('; ');

// Where the public site's pages report a violation of the policy: the
// endpoint's kind for violation reports, by its path and as the group the
// Reporting-Endpoints header names.
const REPORTS = 'report-uri /_konzilo/violations; report-to violations';

// Every header of a site that opts in to nothing, in the file's order.
const HEADERS = [
  ['Strict-Transport-Security', 'max-age=31536000'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Content-Security-Policy', `${POLICY}; frame-ancestors 'self'; ${REPORTS}`],
  ['Reporting-Endpoints', 'violations="/_konzilo/violations"'],
  ['X-Frame-Options', 'SAMEORIGIN'],
  ['Permissions-Policy', PERMISSIONS],
  ['Cross-Origin-Opener-Policy', 'same-origin'],
];

const page = [
  '---',
  "import { getCollection } from 'astro:content';",
  'export async function getStaticPaths() {',
  "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
  '}',
  'const { entry } = Astro.props;',
  '---',
  '<h1>{entry.data.title}</h1>',
  '',
].join('\n');

// A site repository with Astro and Konzilo's package installed, a page per
// article, and one article's content file.
function siteRepository(description) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-headers-'));
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  const integration = JSON.stringify(join(core, 'src/astro/index.js'));
  const sources = {
    'astro.config.mjs': astroConfig(join(core, 'src/astro/index.js')),
    'src/content.config.mjs': `import { collections as konziloCollections } from ${integration};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify(description),
    'src/pages/[slug].astro': page,
    'content/articles/harbour.md': '---\ntitle: "The harbour"\noldAddresses: ["/old-harbour/"]\n---\n\nBoats.\n',
    'public/mark.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>\n',
  };
  for (const [path, contents] of Object.entries(sources)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  }
  return repository;
}

// The headers of a `_headers` file, as [name, value] in its order.
function parse(text) {
  const [path, ...lines] = text.split('\n');
  assert.equal(path, '/*');
  assert.equal(lines.pop(), '', 'the file ends with a line end');
  return lines.map((line) => {
    const match = /^ {2}([A-Za-z-]+): (.+)$/.exec(line);
    assert.ok(match, `not a header line: ${JSON.stringify(line)}`);
    return [match[1], match[2]];
  });
}

describe('the static build', () => {
  const builds = {};

  before(() => {
    const descriptions = {
      plain: { types },
      opted: { types, security: { includeSubDomains: true, frameAncestors: ['https://partner.example.org', 'https://intranet.example.com'] } },
    };
    for (const [name, description] of Object.entries(descriptions)) {
      const repository = siteRepository(description);
      const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
      builds[name] = { repository, built };
    }
  });

  after(() => {
    for (const { repository } of Object.values(builds)) rmSync(repository, { recursive: true, force: true });
  });

  const output = (name, path) => readFileSync(join(builds[name].repository, 'dist', path), 'utf8');

  test('succeeds', () => {
    for (const [name, { built }] of Object.entries(builds)) assert.equal(built.status, 0, `${name}: ${built.stdout}\n${built.stderr}`);
  });

  test('writes every security header into the release, beside _redirects, for every page', () => {
    assert.deepEqual(parse(output('plain', '_headers')), HEADERS);
    assert.equal(output('plain', '_redirects'), '/old-harbour/ /harbour/ 301\n');
  });

  test('holds every header within what a web server is asked to take', () => {
    for (const build of ['plain', 'opted']) {
      for (const [name, value] of parse(output(build, '_headers'))) assert.ok(value.length <= HEADER_LIMIT, `${build}: ${name}`);
    }
  });

  test('an opt-in to includeSubDomains and framing origins change exactly HSTS and the framing headers', () => {
    const opted = new Map(parse(output('opted', '_headers')));
    const plain = new Map(HEADERS);
    assert.equal(opted.get('Strict-Transport-Security'), 'max-age=31536000; includeSubDomains');
    assert.equal(opted.get('Content-Security-Policy'), `${POLICY}; frame-ancestors 'self' https://partner.example.org https://intranet.example.com; ${REPORTS}`);
    assert.equal(opted.has('X-Frame-Options'), false, 'X-Frame-Options cannot name the origins');
    for (const name of ['Strict-Transport-Security', 'Content-Security-Policy', 'X-Frame-Options']) {
      opted.delete(name);
      plain.delete(name);
    }
    assert.deepEqual([...opted], [...plain]);
  });
});

describe('the dev server', () => {
  let repository;
  let server;
  let origin;

  before(async () => {
    repository = siteRepository({ types, security: { frameAncestors: ['https://partner.example.org'] } });
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // In the foreground, which Astro leaves for the background when it finds
    // itself run by an agent, unless told to ignore its lock file.
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: astroEnvironment, stdio: 'ignore', detached: true });
    await until(async () => (await fetch(`${origin}/harbour/`)).ok);
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

  // The site's headers, as the build writes them for its description, its
  // policy the framing part alone, which reports nothing.
  const expected = HEADERS.filter(([name]) => name !== 'X-Frame-Options' && name !== 'Reporting-Endpoints')
    .map(([name, value]) => [name, name === 'Content-Security-Policy' ? "frame-ancestors 'self' https://partner.example.org" : value]);

  for (const [what, path, status] of [['a page', '/harbour/', 200], ['a file of the site', '/mark.svg', 200], ['a missing page', '/nothing-here/', 404], ['a redirect', '/old-harbour/', 301]]) {
    test(`sends the site's security headers with ${what}`, async () => {
      const response = await fetch(`${origin}${path}`, { redirect: 'manual' });
      assert.equal(response.status, status);
      for (const [name, value] of expected) assert.equal(response.headers.get(name), value, `${path}: ${name}`);
      assert.equal(response.headers.get('X-Frame-Options'), null, `${path}: X-Frame-Options`);
      assert.equal(response.headers.get('Reporting-Endpoints'), null, `${path}: Reporting-Endpoints`);
    });
  }
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
