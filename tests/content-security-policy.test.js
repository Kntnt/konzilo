// The public site's Content Security Policy, which every build
// works out from what Konzilo knows and writes into the release's `_headers`
// beside the other security headers: the hashes of the release's inline
// scripts, inline styles and distinct `style` attribute values, collected
// over every page as built, the players' origins of the embed services the
// pages use, and the hosts of the service registry's services, each kind of
// request in its own directive. Images may also come as `data:`, unless the
// site description says not. It never offers 'unsafe-inline',
// 'unsafe-eval', `*`, a scheme alone but `data:` for images, or a nonce, and
// a page with code no hash can allow, an inline event handler or a
// `javascript:` address, fails the build, naming the page and the element.
//
// The policy is data (contentSecurityPolicy()), so each part is checked
// here by itself too; Astro's dev server sends the framing part alone
// (security-headers.test.js).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy, policyText, releaseCode } from '../src/astro/content-security-policy.js';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { post, identity, siteSettingsArgs, writeContent } from './lib/content.js';

// The npm package, which a site installs beside Astro, and its command.
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

// A source as a policy names it, by the SHA-256 of its text.
const hash = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;

const types = {
  post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'embed', 'table'] },
};

// The inline code of the site's own frame, as its template writes it.
const SCRIPT = "document.documentElement.dataset.ready = 'yes';";
const STYLE = 'body { margin: 0 }';

const layout = [
  '---',
  `import { publicSite } from ${JSON.stringify(integration)};`,
  'const { languageTag } = publicSite();',
  '---',
  '<html lang={languageTag}>',
  '  <head>',
  '    <title>A page</title>',
  `    <style is:inline>${STYLE}</style>`,
  `    <script is:inline>${SCRIPT}</script>`,
  '  </head>',
  '  <body><main><slot /></main></body>',
  '</html>',
  '',
].join('\n');

const articlePage = [
  '---',
  "import { getCollection, render } from 'astro:content';",
  "import Site from '../layouts/Site.astro';",
  'export async function getStaticPaths() {',
  "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
  '}',
  'const { entry } = Astro.props;',
  'const { Content } = await render(entry);',
  '---',
  '<Site><h1>{entry.data.title}</h1><Content /></Site>',
  '',
].join('\n');

// An article with a table whose columns are aligned, and a YouTube video.
const table = [
  '| Item | Note | Size | Price |',
  '| --- | :--- | :---: | ---: |',
  '| Tent | Two people | Large | 120 |',
].join('\n');
const youtube = 'https://www.youtube.com/watch?v=Kz3pQ8vXw1A';
const embed = youtube;
const article = post({ ID: 1, slug: 'gear', title: 'Gear', body: `${table}\n\n${embed}` });

// A service an Admin declares, whose tag loads a script from one host.
const pixel = {
  id: 'pixel',
  name: 'Example Pixel',
  category: 'marketing',
  provider: { name: 'Example Ads Ltd', country: 'IE', privacyPolicy: 'https://ads.example.net/privacy' },
  purpose: 'Measures which of our ads lead visitors to the site.',
  storage: [{ name: '_ex', kind: 'cookie', lifetime: 'P3M', party: 'first' }],
  hosts: { scripts: ['https://pixel.example.net'], frames: [], connections: [], images: [], styles: [], fonts: [] },
  transfers: [{ country: 'US', safeguards: ['adequacy'] }],
};

// A site repository with Astro and Konzilo's package installed, `pages` of
// the site's own design beside the frame and the article page, `posts`
// written as a build writes them with the services an Admin declares, and
// built by Astro: { repository, built }, Astro's run.
function build({ pages = {}, posts = [article], services = [] } = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-policy-'));
  mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
  for (const entry of readdirSync(join(core, 'node_modules'))) {
    if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
  }
  symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
  const files = {
    'astro.config.mjs': astroConfig(integration),
    'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify({ language: 'en_GB', types }),
    'src/layouts/Site.astro': layout,
    'src/pages/[slug].astro': articlePage,
    ...pages,
  };
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  }
  const siteSettings = { menus: {}, settings: {}, identity, redirects: [], services };
  siteSettingsArgs(repository, siteSettings);
    const exported = writeContent(repository, posts);
  assert.equal(exported.status, 0, exported.stderr);
  const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
  return { repository, built, output: `${built.stdout}\n${built.stderr}` };
}

// The policy of a `_headers` file, as [directive, [source, ...]] in its order.
function policyOf(headers) {
  const line = headers.split('\n').find((found) => found.startsWith('  Content-Security-Policy: '));
  assert.ok(line, 'the release has a Content-Security-Policy');
  return line.slice('  Content-Security-Policy: '.length).split('; ').map((directive) => {
    const [name, ...sources] = directive.split(' ');
    return [name, sources];
  });
}

const sorted = (list) => [...list].sort();

describe('a built site with an inline script, an inline style, an aligned table, a YouTube embed and a declared service', () => {
  let site;
  let policy;

  before(() => {
    site = build({ services: [pixel] });
    assert.equal(site.built.status, 0, site.output);
    policy = policyOf(readFileSync(join(site.repository, 'dist/_headers'), 'utf8'));
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('gets a policy of exactly their hashes, YouTube\'s player origin, the service\'s script host and data: images', () => {
    // The player's own size, as the panel's <template> holds it, and each
    // column's alignment, as the reader writes it.
    const attributes = ['text-align: left', 'text-align: center', 'text-align: right', 'display: block; width: 100%; aspect-ratio: 16 / 9; border: 0'];
    assert.deepEqual(policy, [
      ['default-src', ["'self'"]],
      ['script-src', ["'self'", hash(SCRIPT), 'https://pixel.example.net']],
      ['style-src', ["'self'", hash(STYLE)]],
      ['style-src-attr', ["'unsafe-hashes'", ...sorted(attributes.map(hash))]],
      ['img-src', ["'self'", 'data:']],
      ['font-src', ["'self'"]],
      ['connect-src', ["'self'"]],
      ['media-src', ["'self'"]],
      ['frame-src', ["'self'", 'https://www.youtube-nocookie.com']],
      ['object-src', ["'none'"]],
      ['base-uri', ["'none'"]],
      ['form-action', ["'self'"]],
      ['frame-ancestors', ["'self'"]],
      ['report-uri', ['/_konzilo/violations']],
      ['report-to', ['violations']],
    ]);
  });

  test('offers none of \'unsafe-inline\', \'unsafe-eval\', a wildcard or a nonce, and no scheme alone but data: for images', () => {
    for (const [directive, sources] of policy) {
      for (const source of sources) {
        assert.ok(!["'unsafe-inline'", "'unsafe-eval'", '*'].includes(source), `${directive} ${source}`);
        if (directive !== 'img-src' || source !== 'data:') assert.doesNotMatch(source, /^[a-z][a-z0-9+.-]*:$/i, `${directive} ${source}: a scheme alone`);
        assert.doesNotMatch(source, /^'nonce-/, `${directive} ${source}`);
      }
    }
  });
});

describe('a page with code no hash can allow fails the build, naming the page and the element', () => {
  for (const [what, path, markup, named] of [
    ['an inline event handler', 'src/pages/handler.astro', '<button type="button" onclick="history.back()">Back</button>', /\/handler\/.*<button onclick>/],
    ['a javascript: link', 'src/pages/nowhere.astro', '<a href="javascript:void(0)">Nowhere</a>', /\/nowhere\/.*<a href="javascript:/],
  ]) {
    test(what, () => {
      const site = build({ pages: { [path]: `<html lang="en"><head><title>A page</title></head><body>${markup}</body></html>\n` } });
      try {
        assert.notEqual(site.built.status, 0, 'the build fails');
        assert.match(site.output, named);
      } finally {
        rmSync(site.repository, { recursive: true, force: true });
      }
    });
  }
});

test('a policy longer than the server takes of a header fails the build, saying how much inline code the pages hold', () => {
  // A page whose every paragraph has a style of its own, a hash each.
  const paragraphs = Array.from({ length: 1300 }, (_, index) => `<p style="--n: ${index}">${index}</p>`).join('');
  const site = build({ pages: { 'src/pages/many.astro': `<html lang="en"><head><title>A page</title></head><body>${paragraphs}</body></html>\n` } });
  try {
    assert.notEqual(site.built.status, 0, 'the build fails');
    assert.match(site.output, /Content-Security-Policy .* more than the 65536 characters the server takes/);
    assert.match(site.output, /1304 distinct style attribute values/);
  } finally {
    rmSync(site.repository, { recursive: true, force: true });
  }
});

// A release of pages written by hand, as { path: html }, in a folder of its
// own; gives the folder.
function release(pages) {
  const dir = mkdtempSync(join(tmpdir(), 'konzilo-release-'));
  for (const [path, html] of Object.entries(pages)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), html);
  }
  return dir;
}

describe('the code of a release', () => {
  test('is every inline script, style and style attribute of every page, each once, the players in panels\' templates and noscript among them', () => {
    const dir = release({
      'index.html': [
        '<!doctype html><html><head>',
        '<script>one()</script><script type="module">two()</script><script src="/_astro/page.js"></script>',
        '<script type="application/ld+json">{"@type":"WebSite"}</script>',
        '<style>p { color: red }</style>',
        '</head><body><p style="color: blue">A</p><p style="color: blue">B</p>',
        '<svg><style>circle { fill: red }</style><circle style="fill: blue" r="1"/></svg>',
        '<noscript><p style="display: none">No script</p></noscript>',
        '<figure class="konzilo-embed" data-embed="vimeo"><a href="https://vimeo.com/76979871">https://vimeo.com/76979871</a>',
        '<template><iframe src="https://player.vimeo.com/video/76979871?dnt=1" style="height: 1px"></iframe></template></figure>',
        '</body></html>',
      ].join('\n'),
      'deeper/page/index.html': '<!doctype html><script>one()</script><p style="color: blue">C</p><style>p { color: red }</style>',
      'deeper/file.css': 'p { color: green }',
    });
    try {
      const { code, problems } = releaseCode(dir);
      assert.deepEqual(problems, []);
      assert.deepEqual(code, {
        scripts: sorted([hash('one()'), hash('two()')]),
        styles: sorted([hash('p { color: red }'), hash('circle { fill: red }')]),
        attributes: sorted([hash('color: blue'), hash('fill: blue'), hash('display: none'), hash('height: 1px')]),
        players: ['https://player.vimeo.com'],
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('names each inline event handler and javascript: address with its page, in a template too, and lets a word like JavaScript: alone', () => {
    const dir = release({
      'index.html': '<!doctype html><body onload="go()"><img alt="JavaScript: the good parts" src="/a.png"><a href=" JavaScript:go()">Go</a></body>',
      'form/index.html': '<!doctype html><form action="javascript:go()"><button formaction="javascript:go()">Go</button></form><template><img src="/a.png" onerror="go()"></template>',
      '404.html': '<!doctype html><svg><a href="javascript:go()"><text>Go</text></a></svg>',
    });
    try {
      assert.deepEqual(sorted(releaseCode(dir).problems), sorted([
        'the page / has <body onload>, an inline event handler',
        'the page / has <a href="javascript:…">, a javascript: address',
        'the page /form/ has <form action="javascript:…">, a javascript: address',
        'the page /form/ has <button formaction="javascript:…">, a javascript: address',
        'the page /form/ has <img onerror>, an inline event handler',
        'the page /404.html has <a href="javascript:…">, a javascript: address',
      ]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// A registry as the intake writes it, with these services' hosts.
function registry(...services) {
  const none = { scripts: [], frames: [], connections: [], images: [], styles: [], fonts: [] };
  return { services: [{ id: 'consent', hosts: none }, ...services.map(([id, hosts]) => ({ id, hosts: { ...none, ...hosts } }))] };
}

const empty = { scripts: [], styles: [], attributes: [], players: [] };

describe('the policy', () => {
  test('gives each kind of request of the registry\'s services its own directive, each host once, a subdomain wildcard as it is', () => {
    const policy = contentSecurityPolicy({
      code: { ...empty, players: ['https://www.youtube-nocookie.com'] },
      registry: registry(
        ['youtube', { frames: ['www.youtube-nocookie.com'] }],
        ['chat', { scripts: ['widget.chat.example.org'], frames: ['*.chat.example.org'], connections: ['api.chat.example.org'], images: ['img.chat.example.org'], styles: ['css.chat.example.org'], fonts: ['fonts.chat.example.org'] }],
        ['stats', { scripts: ['widget.chat.example.org', 'stats.example.com'], connections: ['stats.example.com'] }],
      ),
      description: { types },
    });
    assert.deepEqual(policy, {
      'default-src': ["'self'"],
      'script-src': ["'self'", 'https://stats.example.com', 'https://widget.chat.example.org'],
      'style-src': ["'self'", 'https://css.chat.example.org'],
      'style-src-attr': ["'none'"],
      'img-src': ["'self'", 'data:', 'https://img.chat.example.org'],
      'font-src': ["'self'", 'https://fonts.chat.example.org'],
      'connect-src': ["'self'", 'https://api.chat.example.org', 'https://stats.example.com'],
      'media-src': ["'self'"],
      'frame-src': ["'self'", 'https://*.chat.example.org', 'https://www.youtube-nocookie.com'],
      'object-src': ["'none'"],
      'base-uri': ["'none'"],
      'form-action': ["'self'"],
      'frame-ancestors': ["'self'"],
    });
    assert.equal(policyText(policy), Object.entries(policy).map(([name, sources]) => [name, ...sources].join(' ')).join('; '));
  });

  test('without a registry or a service gives every kind of request the site alone, images data: too, and the framing origins the site lists', () => {
    const policy = contentSecurityPolicy({ code: empty, registry: null, description: { types, security: { frameAncestors: ['https://intranet.example.com'] } } });
    for (const directive of ['script-src', 'style-src', 'font-src', 'connect-src', 'media-src', 'frame-src']) assert.deepEqual(policy[directive], ["'self'"], directive);
    assert.deepEqual(policy['img-src'], ["'self'", 'data:']);
    assert.deepEqual(policy['frame-ancestors'], ["'self'", 'https://intranet.example.com']);
    assert.deepEqual(contentSecurityPolicy({ code: empty, registry: registry(), description: { types } })['script-src'], ["'self'"]);
  });

  test('names the endpoint\'s path for reports, last, only when the pages report, as the public site\'s do and a preview\'s do not', () => {
    const description = { types };
    const reporting = contentSecurityPolicy({ code: empty, registry: null, description, reports: true });
    assert.deepEqual(Object.entries(reporting).slice(-3), [['frame-ancestors', ["'self'"]], ['report-uri', ['/_konzilo/violations']], ['report-to', ['violations']]]);
    const silent = contentSecurityPolicy({ code: empty, registry: null, description });
    assert.equal('report-uri' in silent || 'report-to' in silent, false);
    assert.deepEqual(contentSecurityPolicy({ code: empty, registry: null, description, reports: false }), silent);
  });

  test('refuses a registry host that is no host, naming the service and the kind', () => {
    for (const host of ['*', 'https:', 'https://pixel.example.net', 'data:', '*.com', 'pixel.example.net/path', "pixel.example.net 'unsafe-inline'"]) {
      assert.throws(
        () => contentSecurityPolicy({ code: empty, registry: registry(['pixel', { scripts: [host] }]), description: { types } }),
        (error) => error.message.includes('pixel') && error.message.includes('scripts') && error.message.includes(host),
        host,
      );
    }
  });

  // Whichever way a host reaches the registry, a *. never takes in a name
  // under which anyone may have a host.
  test('refuses a registry host whose *. takes in a public suffix or a shared domain', () => {
    for (const host of ['*.co.uk', '*.github.io', '*.cloudfront.net', '*.amazonaws.com']) {
      assert.throws(
        () => contentSecurityPolicy({ code: empty, registry: registry(['pixel', { scripts: [host] }]), description: { types } }),
        (error) => error.message.includes('pixel') && error.message.includes('scripts') && error.message.includes(host),
        host,
      );
    }
    const policy = contentSecurityPolicy({ code: empty, registry: registry(['pixel', { scripts: ['*.example.co.uk'] }]), description: { types } });
    assert.ok(policy['script-src'].includes('https://*.example.co.uk'));
  });
});
