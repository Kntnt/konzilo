// The tag manager on the public site, seen in a small
// site's static build: a release built for the launched customer's domain
// (KONZILO_LAUNCHED, which the server command sets once Caddy serves the
// domain) loads Matomo Tag Manager's container from the page's own script
// file once the visitor consents to statistics, in the same page view, and
// pushes the visitor's consent into Matomo's data layer, `_mtm`, as one
// event: once when the stored choice is read, and again at every change.
// With the departure `tagManagerBeforeConsent` the container loads with the
// page. A build for any other origin, and one below a base of its own, as a
// preview is, loads no container whatever the consent.
//
// The page's script file runs under jsdom, which loads no script it is
// handed: the container is seen as the script element the page adds.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment, ORIGIN } from './lib/astro.js';
import { paragraphs, post, identity, siteSettingsArgs, writeContent } from './lib/content.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');
const { JSDOM } = createRequire(join(core, 'package.json'))('jsdom');

// Matomo Tag Manager as an Admin sets it, and the container's address.
const MATOMO = { manager: 'Matomo Tag Manager', address: 'https://matomo.example.com/', container: 'aBcD1234' };
const CONTAINER = 'https://matomo.example.com/js/container_aBcD1234.js';

const layout = [
  '---',
  "import ConsentBanner from '@kntnt/konzilo/astro/ConsentBanner.astro';",
  '---',
  '<html lang="en">',
  '  <head><title>A page</title></head>',
  '  <body><ConsentBanner /><main><slot /></main></body>',
  '</html>',
  '',
].join('\n');

const sources = {
  'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
  'src/layouts/Site.astro': layout,
  'src/pages/[slug].astro': [
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
  ].join('\n'),
};

const types = { post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } };

// A site repository with the design above, its one page exported with the
// tag manager's settings `tagManager`, and built by Astro below `base`, with
// `launched` as the build's KONZILO_LAUNCHED, or none for null.
function build({ tagManager = MATOMO, consent, launched = '1', base = '/' } = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-tag-manager-'));
  let log;
  try {
    mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
    for (const entry of readdirSync(join(core, 'node_modules'))) {
      if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
    }
    symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
    const config = astroConfig(integration);
    const files = {
      ...sources,
      'astro.config.mjs': base === '/' ? config : config.replace('export default { ', `export default { base: ${JSON.stringify(base)}, `),
      'site-description.json': JSON.stringify({ language: 'en_GB', types, ...(consent ? { consent } : {}) }),
    };
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), contents);
    }
    const posts = [post({ ID: 1, slug: 'hello', title: 'Hello', body: paragraphs('Hello.') })];
    const siteSettings = { menus: {}, settings: { tagManager }, identity };
    siteSettingsArgs(repository, siteSettings);
    const exported = writeContent(repository, posts);
    assert.equal(exported.status, 0, exported.stderr);
    const environment = { ...astroEnvironment };
    if (launched === null) delete environment.KONZILO_LAUNCHED;
    else environment.KONZILO_LAUNCHED = launched;
    const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: environment });
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    log = `${built.stdout}\n${built.stderr}`;
  } catch (error) {
    rmSync(repository, { recursive: true, force: true });
    throw error;
  }
  return { repository, base, log, output: (path) => readFileSync(join(repository, 'dist', path), 'utf8') };
}

// A visit to the built page under jsdom, its script file run once `stored`
// is put into the consent's own storage item: the window, the scripts the
// page added to itself, by address, and what Matomo's data layer holds, as
// plain values.
function visit(site, { stored } = {}) {
  const { window } = new JSDOM(site.output('hello/index.html'), { url: `${ORIGIN}${site.base}hello/`, runScripts: 'outside-only' });
  if (stored !== undefined) window.localStorage.setItem('konzilo-consent', JSON.stringify(stored));
  const own = window.document.querySelector('script[src]');
  window.eval(site.output(own.getAttribute('src').slice(site.base.length)));
  const added = () => [...window.document.querySelectorAll('script[src]')].filter((script) => script !== own).map((script) => ({ src: script.src, async: script.async }));
  const layer = () => (window._mtm === undefined ? undefined : JSON.parse(JSON.stringify(window._mtm)).map(({ 'mtm.startTime': time, ...rest }) => (time === undefined ? rest : { ...rest, 'mtm.startTime': typeof time })));
  const queue = () => (window._paq === undefined ? undefined : JSON.parse(JSON.stringify(window._paq)));
  return { window, added, layer, queue, click: (action) => window.document.querySelector(`button[data-konzilo-consent-action="${action}"]`).click() };
}

// The consent event Konzilo pushes into the data layer.
const consentEvent = (statistics) => ({
  event: 'konzilo-consent',
  konziloConsent: { categories: { necessary: true, statistics }, services: { consent: true, matomo: statistics } },
});
const START = { event: 'mtm.Start', 'mtm.startTime': 'number' };

describe('a release built for the launched customer\'s domain, with Matomo Tag Manager set', () => {
  let site;

  before(() => {
    site = build();
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('a fresh visitor\'s page loads no container, and the data layer gets the consent event with statistics not allowed', () => {
    const page = visit(site);

    assert.deepEqual(page.added(), []);
    assert.deepEqual(page.layer(), [consentEvent(false)]);
  });

  test('Accept all loads the container without a reload, after the consent event with statistics allowed', () => {
    const page = visit(site);
    page.click('accept');

    assert.deepEqual(page.added(), [{ src: CONTAINER, async: true }]);
    assert.deepEqual(page.layer(), [consentEvent(false), consentEvent(true), START]);
  });

  test('a new page after consent loads the container at once, and the event comes again', () => {
    const first = visit(site);
    first.click('accept');
    const stored = JSON.parse(first.window.localStorage.getItem('konzilo-consent'));

    const next = visit(site, { stored });
    assert.deepEqual(next.added(), [{ src: CONTAINER, async: true }]);
    assert.deepEqual(next.layer(), [consentEvent(true), START]);
  });

  test('Reject optional loads no container, and the data layer gets the event again', () => {
    const page = visit(site);
    page.click('reject');

    assert.deepEqual(page.added(), []);
    assert.deepEqual(page.layer(), [consentEvent(false), consentEvent(false)]);
  });

  test('the page holds no inline script, and the release\'s policy lets the instance\'s host give scripts, requests and images', () => {
    const html = site.output('hello/index.html');
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
    const policy = /Content-Security-Policy: (.*)/.exec(site.output('_headers'))[1];
    for (const directive of ['script-src', 'connect-src', 'img-src']) {
      assert.match(policy, new RegExp(`${directive} [^;]*https://matomo\\.example\\.com`), directive);
    }
    assert.doesNotMatch(policy, /frame-src [^;]*matomo/);
  });
});

describe('a release with the departure tagManagerBeforeConsent', () => {
  let site;

  before(() => {
    site = build({ consent: { departures: [{ departure: 'tagManagerBeforeConsent', reason: 'Our tags are cookieless until consent.' }] } });
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('loads the container before any choice, after the consent event with statistics not allowed', () => {
    const page = visit(site);

    assert.deepEqual(page.added(), [{ src: CONTAINER, async: true }]);
    assert.deepEqual(page.layer(), [consentEvent(false), START]);
    page.click('accept');
    assert.equal(page.added().length, 1, 'the container loads once');
    assert.deepEqual(page.layer(), [consentEvent(false), START, consentEvent(true)]);
  });
});

describe('a release built for another origin than a launched customer\'s domain', () => {
  let site;

  before(() => {
    site = build({ launched: null });
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('loads no container and touches no data layer, even after Accept all', () => {
    const page = visit(site);
    page.click('accept');

    assert.deepEqual(page.added(), []);
    assert.equal(page.layer(), undefined);
  });
});

describe('a build below a base of its own, as a preview is, with KONZILO_LAUNCHED set', () => {
  let site;

  before(() => {
    site = build({ base: '/preview/' });
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('loads no container, even after Accept all', () => {
    const page = visit(site);
    page.click('accept');

    assert.deepEqual(page.added(), []);
    assert.equal(page.layer(), undefined);
  });
});

describe('a launched release with no tag manager chosen', () => {
  let site;

  before(() => {
    site = build({ tagManager: { manager: 'None' } });
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('loads no container and touches no data layer, and its policy names no instance', () => {
    const page = visit(site);

    assert.deepEqual(page.added(), []);
    assert.equal(page.layer(), undefined);
    assert.doesNotMatch(site.output('_headers'), /matomo/);
  });
});

// Matomo's own tracker as an Admin sets it, and its script.
const TRACKER = { manager: 'Matomo', address: 'https://matomo.example.com/', site: 3, cookieDomain: 'example.com' };
const MATOMO_JS = 'https://matomo.example.com/matomo.js';
const COUNTED = [
  ['setCookieDomain', '*.example.com'],
  ['setDomains', ['*.example.com']],
  ['setTrackerUrl', 'https://matomo.example.com/matomo.php'],
  ['setSiteId', '3'],
  ['trackPageView'],
  ['enableLinkTracking'],
];

describe('a release built for the launched customer\'s domain, with Matomo\'s own tracker set', () => {
  let site;

  before(() => {
    site = build({ tagManager: TRACKER });
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('a fresh visitor\'s page loads no tracker, queues nothing for it, and loads no container', () => {
    const page = visit(site);
    assert.deepEqual(page.added(), []);
    assert.equal(page.queue(), undefined);
    assert.equal(page.layer(), undefined);
  });

  test('Accept all loads matomo.js from the instance without a reload, and counts the page view, with its cookies on the cookie domain', () => {
    const page = visit(site);
    page.click('accept');
    assert.deepEqual(page.added(), [{ src: MATOMO_JS, async: true }]);
    assert.deepEqual(page.queue(), COUNTED);
    page.click('accept');
    assert.equal(page.added().length, 1, 'the tracker loads once');
  });

  test('a new page after consent loads the tracker at once; one after Reject optional loads none', () => {
    const first = visit(site);
    first.click('accept');
    const next = visit(site, { stored: JSON.parse(first.window.localStorage.getItem('konzilo-consent')) });
    assert.deepEqual(next.added(), [{ src: MATOMO_JS, async: true }]);
    assert.deepEqual(next.queue(), COUNTED);

    const refused = visit(site);
    refused.click('reject');
    assert.deepEqual(refused.added(), []);
    assert.equal(refused.queue(), undefined);
  });

  test('the registry holds Matomo as a statistics service, its cookies on the cookie domain, and the release\'s policy lets the instance\'s host give scripts, requests and images', () => {
    const registry = JSON.parse(readFileSync(join(site.repository, 'content/consent.json'), 'utf8'));
    const matomo = registry.services.find((service) => service.id === 'matomo');
    assert.equal(matomo.category, 'statistics');
    assert.match(matomo.purpose, /^Measures how visitors use the site, with the site's own Matomo\.$/);
    assert.deepEqual(matomo.storage.find((item) => item.name === '_pk_id.*'), { name: '_pk_id.*', kind: 'cookie', lifetime: 'P13M', party: 'first', domain: 'example.com' });
    assert.equal(matomo.storage.find((item) => item.name === 'MatomoAbTesting').domain, null);
    const policy = /Content-Security-Policy: (.*)/.exec(site.output('_headers'))[1];
    for (const directive of ['script-src', 'connect-src', 'img-src']) {
      assert.match(policy, new RegExp(`${directive} [^;]*https://matomo\\.example\\.com`), directive);
    }
    assert.doesNotMatch(site.output('hello/index.html'), /<script(?![^>]*\bsrc=)[^>]*>/);
  });
});

test('a tracker on a release for another origin, or below a base of its own, loads nothing, and a cookie domain the host is not below is left out, with a warning', () => {
  const sites = [build({ tagManager: TRACKER, launched: null }), build({ tagManager: TRACKER, base: '/preview/' }), build({ tagManager: { ...TRACKER, cookieDomain: 'example.org' } })];
  try {
    const [elsewhere, preview, wrong] = sites;
    for (const site of [elsewhere, preview]) {
      const page = visit(site);
      page.click('accept');
      assert.deepEqual(page.added(), []);
      assert.equal(page.queue(), undefined);
    }
    assert.match(wrong.log, /Matomo's cookie domain is example\.org, which the public host www\.example\.com is neither at nor below/);
    const page = visit(wrong);
    page.click('accept');
    assert.deepEqual(page.queue(), COUNTED.slice(2));
  } finally {
    for (const site of sites) rmSync(site.repository, { recursive: true, force: true });
  }
});
