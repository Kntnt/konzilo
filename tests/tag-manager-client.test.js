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
const { JSDOM, VirtualConsole } = createRequire(join(core, 'package.json'))('jsdom');

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
// page added to itself, by address, what Matomo's data layer and Matomo's
// queue hold, as plain values, what the consent's own storage item holds,
// the reloads the page asked for, and the events of the consent signal.
// jsdom has no modal dialog: a dialog opens and closes here as its `open`
// alone.
function visit(site, { stored, signals = false } = {}) {
  const reloads = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (/navigation/.test(error.message)) reloads.push(error.message);
    else throw error;
  });
  const { window } = new JSDOM(site.output('hello/index.html'), { url: `${ORIGIN}${site.base}hello/`, runScripts: 'outside-only', virtualConsole });
  if (stored !== undefined) window.localStorage.setItem('konzilo-consent', JSON.stringify(stored));
  // A browser that sends Global Privacy Control.
  if (signals) Object.defineProperty(window.navigator, 'globalPrivacyControl', { value: true });
  // The reload after a withdrawal is jsdom's to refuse; it waits here.
  window.setTimeout = () => 0;
  for (const dialog of window.document.querySelectorAll('dialog')) {
    Object.assign(dialog, {
      showModal() { this.open = true; },
      close() { this.open = false; this.dispatchEvent(new window.Event('close')); },
    });
  }
  const events = [];
  window.document.addEventListener('konzilo:consent', (event) => events.push(JSON.parse(JSON.stringify(event.detail))));
  const own = window.document.querySelector('script[src]');
  window.eval(site.output(own.getAttribute('src').slice(site.base.length)));
  const added = () => [...window.document.querySelectorAll('script[src]')].filter((script) => script !== own).map((script) => ({ src: script.src, async: script.async }));
  const layer = () => (window._mtm === undefined ? undefined : JSON.parse(JSON.stringify(window._mtm)).map(({ 'mtm.startTime': time, ...rest }) => (time === undefined ? rest : { ...rest, 'mtm.startTime': typeof time })));
  const queue = () => (window._paq === undefined ? undefined : JSON.parse(JSON.stringify(window._paq)));
  const kept = () => JSON.parse(window.localStorage.getItem('konzilo-consent'));
  return { window, document: window.document, added, layer, queue, kept, reloads, events, click: (action) => window.document.querySelector(`button[data-konzilo-consent-action="${action}"]`).click() };
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

// What the tracker queues to count as a web server's log would, before
// what it counts: nothing stored, no device property and no load time read,
// and each request's time of day put in the site's time zone; what lets it
// store and read once the visitor allows statistics; and what it queues on
// a page where the visitor allows them from the start.
const LOG_LIKE = [['requireCookieConsent'], ['setCustomRequestProcessing', null], ['disableBrowserFeatureDetection'], ['disablePerformanceTracking']];
const STORING = [['setCookieConsentGiven'], ['enableBrowserFeatureDetection']];
const ALLOWED = [['requireCookieConsent'], ['setCustomRequestProcessing', null], ...STORING];
const departure = (privacySignals) => ({ departures: [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'We count every visit, and store nothing before consent.', privacySignals }] });

// A request as Matomo's tracker makes it, with the time of day it read from
// the device's clock in the device's own time zone, and what the function
// the page gave setCustomRequestProcessing makes of it, at 08:14:05 UTC.
const REQUEST = 'action_name=Hello&idsite=3&rec=1&r=123456&h=1&m=2&s=3&url=https%3A%2F%2Fwww.example.com%2Fhello%2F&send_image=0';
const processed = (page, request = REQUEST) => {
  const [, process] = page.window._paq.find(([name]) => name === 'setCustomRequestProcessing');
  const RealDate = page.window.Date;
  page.window.Date = class extends RealDate {
    constructor(...given) {
      super(...(given.length > 0 ? given : [Date.UTC(2026, 10, 10, 8, 14, 5)]));
    }
  };
  try {
    return process(request);
  } finally {
    page.window.Date = RealDate;
  }
};
const at = (h, m, s) => REQUEST.replace('h=1&m=2&s=3', `h=${h}&m=${m}&s=${s}`);

const text = (element) => element.textContent.replace(/\s+/g, ' ').trim();

// Its link that objects, or takes the objection back.
const objectionLink = (page) => page.document.querySelector('a[data-konzilo-consent-action="objection"]');

describe('a release whose tracker counts without storage before consent', () => {
  let site;

  before(() => {
    // The site's time zone in Matomo: 14 hours ahead of UTC, all year.
    site = build({ tagManager: { ...TRACKER, timeZone: 'Pacific/Kiritimati' }, consent: departure('stop') });
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('a fresh visitor\'s page loads the tracker at once, counting as a server\'s log would: nothing stored, no device property or load time read, and the time of day in the site\'s time zone', () => {
    const page = visit(site);
    assert.deepEqual(page.added(), [{ src: MATOMO_JS, async: true }]);
    assert.deepEqual(page.queue(), [...LOG_LIKE, ...COUNTED]);
    assert.equal(processed(page), at(22, 14, 5));
    assert.doesNotMatch(site.log, /time zone/);
  });

  test('Accept all lets it store and read in the same page view, without a reload or a second load, and the time of day is the visitor\'s own from then on; a later page does so from the start, load times too', () => {
    const page = visit(site);
    page.click('accept');
    assert.deepEqual(page.queue(), [...LOG_LIKE, ...COUNTED, ...STORING]);
    assert.equal(page.added().length, 1);
    assert.equal(processed(page), REQUEST);
    const next = visit(site, { stored: page.kept() });
    assert.deepEqual(next.queue(), [...ALLOWED, ...COUNTED]);
    assert.equal(processed(next), REQUEST);
  });

  test('Withdraw consent forgets the consent and reads no more before the page reloads; a refusal stores nothing', () => {
    const page = visit(site);
    page.click('accept');
    // The footer's button, which this layout leaves out.
    page.window.document.body.insertAdjacentHTML('beforeend', '<button type="button" data-konzilo-consent-action="withdraw">Withdraw consent</button>');
    page.click('withdraw');
    assert.deepEqual(page.queue().slice(-2), [['forgetCookieConsentGiven'], ['disableBrowserFeatureDetection']]);
    const refused = visit(site);
    refused.click('reject');
    assert.deepEqual(refused.queue(), [...LOG_LIKE, ...COUNTED]);
    assert.equal(processed(refused), at(22, 14, 5));
  });

  test('with privacySignals "stop", a browser that sends Global Privacy Control is not counted at all, even after Accept all', () => {
    const page = visit(site, { signals: true });
    page.click('accept');
    assert.deepEqual(page.added(), []);
    assert.equal(page.queue(), undefined);
  });

  test('the statistics category and the cookie declaration say what is counted without storage', () => {
    const page = new JSDOM(site.output('hello/index.html')).window.document;
    const statistics = page.querySelector('#konzilo-consent-category-statistics').closest('.konzilo-consent-category');
    assert.match(statistics.querySelector('.konzilo-consent-description').textContent, /Each visit is counted from the first page, without storing or reading anything in your browser\./);
    const registry = JSON.parse(readFileSync(join(site.repository, 'content/consent.json'), 'utf8'));
    assert.deepEqual(registry.departures, [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'We count every visit, and store nothing before consent.', privacySignals: 'stop' }]);
  });

  test('the statistics category\'s services end in the right to object, a short explanation and a link, which opens a confirmation with a plain appeal and two buttons alike', () => {
    const built = new JSDOM(site.output('hello/index.html')).window.document;
    const statistics = built.querySelector('#konzilo-consent-category-statistics').closest('.konzilo-consent-category');
    const objection = statistics.querySelector('details.konzilo-consent-services > .konzilo-consent-objection');
    assert.equal(text(objection), 'The counting without storage rests on the site\'s legitimate interest, and you may object to it at any time. Don\'t count my visits');
    const link = objection.querySelector('a');
    assert.deepEqual([link.tagName, link.className, link.getAttribute('href'), link.hidden], ['A', 'konzilo-consent-objection-link', '#konzilo-consent-objection', true]);
    assert.equal(built.querySelectorAll('.konzilo-consent-objection').length, 1, 'in statistics alone');
    const confirmation = built.querySelector('dialog#konzilo-consent-objection');
    assert.equal(confirmation.className, 'konzilo-consent-confirmation');
    assert.equal(text(built.getElementById(confirmation.getAttribute('aria-labelledby'))), 'Don\'t count my visits');
    assert.equal(text(built.getElementById(confirmation.getAttribute('aria-describedby'))), 'Do you really want us to stop counting your visits? We can\'t see who you are, and we don\'t follow you from one visit to the next. The figures help us understand what is valuable on the site and what we need to do better.');
    assert.deepEqual([...confirmation.querySelectorAll('button')].map((button) => [button.className, button.dataset.konziloConsentAction, text(button)]), [
      ['konzilo-consent-choice', 'object', 'Don\'t count my visits'],
      ['konzilo-consent-choice', 'cancel', 'Cancel'],
    ]);
    assert.doesNotMatch(site.output('hello/index.html'), /anonym/i);

    const page = visit(site);
    assert.deepEqual([objectionLink(page).hidden, text(objectionLink(page))], [false, 'Don\'t count my visits']);
    objectionLink(page).click();
    assert.equal(page.document.querySelector('#konzilo-consent-objection').open, true);
    const shown = [...page.document.querySelectorAll('#konzilo-consent-objection p')].filter((paragraph) => !paragraph.hidden);
    assert.deepEqual(shown.map((paragraph) => paragraph.id), ['konzilo-consent-objection-appeal'], 'the appeal to a visitor counted without storage');
    page.click('cancel');
    assert.equal(page.document.querySelector('#konzilo-consent-objection').open, false);
    assert.equal(page.kept(), null, 'cancel keeps nothing');
    assert.equal(page.window.konziloConsent.objected(), false);
  });

  test('confirming the objection sends nothing more in the page view and sets no cookie; it is kept, no choice, and the next page loads no tracker, its link saying Count my visits again', () => {
    const page = visit(site);
    objectionLink(page).click();
    page.click('object');
    assert.equal(page.document.querySelector('#konzilo-consent-objection').open, false);
    assert.deepEqual(page.queue().slice(-1), [['requireConsent']], 'Matomo holds back every later request');
    assert.equal(page.document.cookie, '', 'and no cookie says so');
    assert.deepEqual(Object.keys(page.kept()), ['objection']);
    assert.ok(Math.abs(Date.parse(page.kept().objection) - Date.now()) < 60_000);
    assert.equal(page.window.konziloConsent.objected(), true);
    assert.equal(page.window.konziloConsent.choice(), null, 'an objection is no choice');
    assert.deepEqual(page.events, [{ choice: null, how: 'objection', objected: true }]);
    assert.equal(text(objectionLink(page)), 'Count my visits again');
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, false, 'the banner still asks');

    const next = visit(site, { stored: page.kept() });
    assert.deepEqual(next.added(), []);
    assert.equal(next.queue(), undefined);
    assert.equal(text(objectionLink(next)), 'Count my visits again');
    next.click('reject');
    assert.equal(next.kept().objection, page.kept().objection, 'a refusal keeps it');
    assert.equal(visit(site, { stored: next.kept() }).queue(), undefined);
  });

  test('Count my visits again takes the objection back at once, and the next page counts without storage again', () => {
    const page = visit(site, { stored: { objection: new Date().toISOString() } });
    objectionLink(page).click();
    assert.equal(page.document.querySelector('#konzilo-consent-objection').open, false, 'no confirmation is asked');
    assert.equal(page.kept(), null);
    assert.equal(page.window.konziloConsent.objected(), false);
    assert.deepEqual(page.events, [{ choice: null, how: 'objection', objected: false }]);
    assert.equal(text(objectionLink(page)), 'Don\'t count my visits');
    assert.deepEqual(page.added(), [], 'it counts from the next page view');
    assert.deepEqual(visit(site, { stored: page.kept() }).queue(), [...LOG_LIKE, ...COUNTED]);
  });

  test('allowing statistics ends the objection, and the tracker stores in the same page view: loaded at once, or sending again', () => {
    const objected = visit(site, { stored: { objection: new Date().toISOString() } });
    objected.click('accept');
    assert.equal(objected.kept().objection, undefined);
    assert.equal(objected.window.konziloConsent.objected(), false);
    assert.deepEqual(objected.added(), [{ src: MATOMO_JS, async: true }]);
    assert.deepEqual(objected.queue(), [...ALLOWED, ...COUNTED]);

    const page = visit(site);
    objectionLink(page).click();
    page.click('object');
    page.click('accept');
    assert.deepEqual(page.queue().slice(-4), [['requireConsent'], ['setConsentGiven'], ...STORING]);
    assert.equal(page.kept().objection, undefined);
  });

  test('objecting after consent to statistics withdraws it as a choice, after an appeal that says the browser is recognised now: Matomo forgets its cookie consent and holds back every request, and the page reloads', () => {
    const page = visit(site);
    page.click('accept');
    objectionLink(page).click();
    const confirmation = page.document.querySelector('#konzilo-consent-objection');
    const shown = [...confirmation.querySelectorAll('p')].filter((paragraph) => !paragraph.hidden);
    assert.deepEqual(shown.map(text), ['Do you really want us to stop counting your visits? You have allowed statistics, so for now we recognise your browser from one visit to the next. If you object, we turn that off and stop counting your visits altogether. The figures help us understand what is valuable on the site and what we need to do better.']);
    assert.equal(confirmation.getAttribute('aria-describedby'), shown[0].id);
    page.click('object');
    assert.deepEqual(page.queue().slice(-3), [['forgetCookieConsentGiven'], ['disableBrowserFeatureDetection'], ['requireConsent']]);
    assert.equal(page.kept().services.matomo, false);
    assert.equal(typeof page.kept().objection, 'string');
    assert.deepEqual(page.events.at(-1).how, 'objection');
    assert.equal(page.reloads.length, 1);
    const next = visit(site, { stored: page.kept() });
    assert.equal(next.queue(), undefined);
    assert.equal(next.document.querySelector('.konzilo-consent-banner').hidden, true, 'the choice holds');
  });

  test('Withdraw consent ends the objection too: the next page counts without storage as for a first visit, and the banner stays away', () => {
    const page = visit(site);
    page.click('reject');
    objectionLink(page).click();
    page.click('object');
    page.window.document.body.insertAdjacentHTML('beforeend', '<button type="button" data-konzilo-consent-action="withdraw">Withdraw consent</button>');
    page.click('withdraw');
    assert.equal(page.kept().objection, undefined);
    assert.equal(page.kept().services.matomo, false);
    const next = visit(site, { stored: page.kept() });
    assert.deepEqual(next.queue(), [...LOG_LIKE, ...COUNTED]);
    assert.equal(next.document.querySelector('.konzilo-consent-banner').hidden, true);
  });

  test('an objection holds 12 months from when it was made, whatever the choice beside it', () => {
    const months = (count) => {
      const date = new Date();
      date.setUTCMonth(date.getUTCMonth() - count);
      return date.toISOString();
    };
    const old = visit(site, { stored: { objection: months(13) } });
    assert.equal(old.kept(), null);
    assert.deepEqual(old.queue(), [...LOG_LIKE, ...COUNTED]);
    const refusal = { time: months(13), revision: JSON.parse(readFileSync(join(site.repository, 'content/consent.json'), 'utf8')).revision, categories: { necessary: true, statistics: false }, services: { consent: true, matomo: false } };
    const objection = months(1);
    const outlived = visit(site, { stored: { ...refusal, objection } });
    assert.deepEqual(outlived.kept(), { objection });
    assert.equal(outlived.queue(), undefined);
    assert.equal(outlived.document.querySelector('.konzilo-consent-banner').hidden, false, 'the choice is gone, the objection stays');
  });
});

test('with privacySignals "ignore", a browser that sends Global Privacy Control is counted without storage too; without a time zone the time of day is in UTC, with a warning', () => {
  const site = build({ tagManager: TRACKER, consent: departure('ignore') });
  try {
    assert.match(site.log, /the site counts visits before consent without a time zone for Matomo, so such a visit has its time of day in UTC/);
    const page = visit(site, { signals: true });
    assert.deepEqual(page.queue(), [...LOG_LIKE, ...COUNTED]);
    assert.equal(processed(page), at(8, 14, 5));
    page.click('accept');
    assert.deepEqual(page.queue().slice(-2), STORING);
  } finally {
    rmSync(site.repository, { recursive: true, force: true });
  }
});
