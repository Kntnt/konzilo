// Konzilo's own consent client: the
// banner with its preferences dialog and the footer controls, components of
// the integration that a site's layout places, rendered from the service
// registry into the page, seen in a small site's static build; and the
// integration's script file of that build, which keeps the visitor's choice
// and gives the consent signal, run on the built page under jsdom. jsdom
// has no modal dialog: the acceptance suite drives the dialog in a browser
// (tests/acceptance/tests/consent-banner.spec.js).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { consentView } from '../src/consent/markup.js';
import { astroConfig, astroEnvironment, ORIGIN } from './lib/astro.js';
import { paragraphs, post, siteSettingsArgs, writeContent } from './lib/content.js';

// The npm package, which a site installs beside Astro, and its command.
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');
const { JSDOM, VirtualConsole } = createRequire(join(core, 'package.json'))('jsdom');

const embed = (url) => url;

const types = {
  post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'embed'] },
};

// The site's frame: the banner first in the body, and the footer controls
// in the footer, as the site template places them, imported from the
// package.
const layout = [
  '---',
  "import ConsentBanner from '@kntnt/konzilo/astro/ConsentBanner.astro';",
  "import ConsentControls from '@kntnt/konzilo/astro/ConsentControls.astro';",
  `import { publicSite } from ${JSON.stringify(integration)};`,
  'const { languageTag } = publicSite();',
  '---',
  '<html lang={languageTag}>',
  '  <head><title>A page</title></head>',
  '  <body>',
  '    <ConsentBanner />',
  '    <main><slot /></main>',
  '    <footer><ConsentControls /></footer>',
  '  </body>',
  '</html>',
  '',
].join('\n');

const sources = {
  'astro.config.mjs': astroConfig(integration),
  'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
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
  'src/pages/split-footer.astro': [
    '---',
    "import ConsentControls from '@kntnt/konzilo/astro/ConsentControls.astro';",
    '---',
    '<html lang="en-GB"><head><title>A footer</title></head><body><main><p>Words</p></main><footer>',
    '<div id="links"><ConsentControls buttons={false} /></div>',
    '<div id="buttons"><ConsentControls links={false} /></div>',
    '</footer></body></html>',
    '',
  ].join('\n'),
};

const videos = post({
  ID: 1,
  slug: 'videos',
  title: 'Videos',
  body: [embed('https://www.youtube.com/watch?v=Kz3pQ8vXw1A'), embed('https://vimeo.com/76979871'), embed('https://youtu.be/Rt5uVw2Xy3Z')].join('\n\n'),
});
const privacy = post({ ID: 3, slug: 'privacy', title: 'Privacy policy', body: paragraphs('What we keep.') });
const cookies = post({ ID: 4, slug: 'cookies', title: 'Cookie policy', body: paragraphs('What we store.') });
const text = post({ ID: 5, slug: 'text', title: 'Text', body: paragraphs('Nothing to load.') });

// The site settings of a site that chooses its privacy policy and its
// cookie policy.
const legalPages = { menus: {}, settings: { legalPages: { cookiePolicy: '4', privacyPolicy: '3' } } };

// A site repository with Astro and Konzilo's package installed, the design
// above, the integration given `options`, `posts` exported as a build
// writes them with `siteSettings`, and built by Astro below `base`, whose
// output it keeps as `log`. A repository whose content or build fails is
// removed.
function build({ language = 'en_GB', posts = [videos, privacy, cookies, text], siteSettings = legalPages, consent, options, base = '/', pageLayout = layout, environment = astroEnvironment } = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-consent-client-'));
  let log;
  try {
    // The core's dependencies, and the core itself as a site installs it.
    mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
    for (const entry of readdirSync(join(core, 'node_modules'))) {
      if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
    }
    symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
    const files = {
      ...sources,
      'astro.config.mjs': astroConfig(integration, options),
      'src/layouts/Site.astro': pageLayout,
      'site-description.json': JSON.stringify({ language, types, ...(consent ? { consent } : {}) }),
    };
    // A build below a base of its own, as a preview is.
    if (base !== '/') files['astro.config.mjs'] = files['astro.config.mjs'].replace('export default { ', `export default { base: ${JSON.stringify(base)}, `);
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), contents);
    }
    siteSettingsArgs(repository, siteSettings);
    const exported = writeContent(repository, posts);
    assert.equal(exported.status, 0, exported.stderr);
    log = buildAstro(repository, environment);
  } catch (error) {
    rmSync(repository, { recursive: true, force: true });
    throw error;
  }
  const output = (path) => readFileSync(join(repository, 'dist', path), 'utf8');
  return { repository, base, output, log, page: (slug) => new JSDOM(output(`${slug}/index.html`)).window.document };
}

// Astro's build of a site repository, into dist/, with the repository's
// own cache; gives what it printed.
function buildAstro(repository, environment = astroEnvironment) {
  const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: environment });
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  return `${built.stdout}\n${built.stderr}`;
}

const texts = (elements) => [...elements].map((element) => element.textContent.trim().replace(/\s+/g, ' '));

describe('a page of a site whose registry asks for consent', () => {
  let site;
  let page;

  before(() => {
    site = build();
    page = site.page('videos');
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('holds the banner, hidden until the script shows it, titled from the texts, with accept and reject alike and customise secondary, in that order', () => {
    const banner = page.querySelector('.konzilo-consent-banner');
    assert.ok(banner, 'the banner is on the page');
    assert.equal(banner.hidden, true);
    const title = page.getElementById(banner.getAttribute('aria-labelledby'));
    assert.equal(title.textContent, 'Your privacy');
    assert.match(banner.querySelector('.konzilo-consent-text').textContent, /^This site uses only what it needs to work, unless you allow more\./);
    const buttons = [...banner.querySelectorAll('button')];
    assert.deepEqual(texts(buttons), ['Accept all', 'Reject optional', 'Customise']);
    assert.deepEqual(buttons.map((button) => button.type), ['button', 'button', 'button']);
    assert.deepEqual(buttons.map((button) => button.className), ['konzilo-consent-choice', 'konzilo-consent-choice', 'konzilo-consent-secondary']);
  });

  test('the banner links to the privacy policy and the cookie policy the site settings choose, by their titles', () => {
    const links = [...page.querySelectorAll('.konzilo-consent-banner a')].map((link) => [link.textContent, link.getAttribute('href')]);
    assert.deepEqual(links, [['Privacy policy', '/privacy/'], ['Cookie policy', '/cookies/']]);
  });

  test('the dialog is a closed native dialog titled from the texts, with its introduction, a close button, and accept and reject alike before save', () => {
    const dialog = page.querySelector('dialog.konzilo-consent-dialog');
    assert.ok(dialog, 'the dialog is on the page');
    assert.equal(dialog.hasAttribute('open'), false);
    assert.equal(page.getElementById(dialog.getAttribute('aria-labelledby')).textContent, 'Privacy settings');
    assert.match(dialog.querySelector('.konzilo-consent-introduction').textContent, /Your choice holds for 12 months\. You can change or withdraw it at any time from the footer of every page\./);
    assert.deepEqual(texts(dialog.querySelectorAll('.konzilo-consent-head button')), ['Close']);
    const buttons = [...dialog.querySelectorAll(':scope > .konzilo-consent-buttons button')];
    assert.deepEqual(texts(buttons), ['Accept all', 'Reject optional', 'Save my choices']);
    assert.deepEqual(buttons.map((button) => button.className), ['konzilo-consent-choice', 'konzilo-consent-choice', 'konzilo-consent-secondary']);
  });

  test('the dialog has a row per category with its name, a count of its services and a switch, necessary on and locked', () => {
    const rows = [...page.querySelectorAll('.konzilo-consent-category')].map((category) => {
      const row = category.querySelector(':scope > .konzilo-consent-row');
      const toggle = row.querySelector('input');
      return {
        name: row.querySelector('h3').textContent,
        count: row.querySelector('.konzilo-consent-count').textContent,
        role: toggle.getAttribute('role'),
        named: page.getElementById(toggle.getAttribute('aria-labelledby')).textContent,
        checked: toggle.checked,
        locked: toggle.disabled,
      };
    });
    assert.deepEqual(rows, [
      { name: 'Necessary', count: '1 service', role: 'switch', named: 'Necessary', checked: true, locked: true },
      { name: 'Marketing', count: '2 services', role: 'switch', named: 'Marketing', checked: false, locked: false },
    ]);
  });

  test('each category lists its services, each with its purpose, provider and storage, and a switch of its own unless necessary', () => {
    const services = [...page.querySelectorAll('.konzilo-consent-service')].map((service) => {
      const facts = Object.fromEntries([...service.querySelectorAll(':scope > dl > dt')].map((term) => [term.textContent, term.nextElementSibling.textContent.replace(/\s+/g, ' ').trim()]));
      const toggle = service.querySelector('input[role="switch"]');
      return { name: service.querySelector('h4').textContent, toggle: toggle ? toggle.dataset.konziloConsentService : service.querySelector('.konzilo-consent-always').textContent, facts };
    });
    assert.deepEqual(services.map(({ name, toggle }) => [name, toggle]), [['Consent', 'Always on'], ['Vimeo', 'vimeo'], ['YouTube', 'youtube']]);
    const [consent, vimeo, youtube] = services.map(({ facts }) => facts);
    assert.deepEqual(Object.keys(consent), ['Purpose', 'Why it is needed', 'Provider', 'Stores in your browser']);
    assert.equal(consent.Provider, 'This site');
    assert.equal(consent['Stores in your browser'], 'konzilo-consent: local storage, 12 months, on www.example.com');
    assert.equal(vimeo.Provider, 'Vimeo.com, Inc., United States. Privacy policy');
    assert.match(vimeo['Stores in your browser'], /__cf_bm: cookie, 30 minutes, on player\.vimeo\.com/);
    assert.equal(youtube['Stores in your browser'], 'Its provider names nothing it stores');
    assert.match(youtube.Purpose, /\S/);
    const policy = page.querySelectorAll('.konzilo-consent-service')[2].querySelector('dd a');
    assert.match(policy.getAttribute('href'), /^https:\/\/policies\.google\.com\//);
  });

  test('the footer controls link to both policies, and hold Change privacy settings and Withdraw consent as buttons, hidden until the script shows them', () => {
    const controls = page.querySelector('footer .konzilo-consent-controls');
    assert.deepEqual([...controls.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')]), [['Privacy policy', '/privacy/'], ['Cookie policy', '/cookies/']]);
    const buttons = [...controls.querySelectorAll('button')];
    assert.deepEqual(texts(buttons), ['Change privacy settings', 'Withdraw consent']);
    assert.deepEqual(buttons.map((button) => [button.type, button.hidden]), [['button', true], ['button', true]]);
  });

  test('each embed\'s panel says, until the script runs, that it has not run, before the link to the address, and holds its player in its template alone', () => {
    const panels = [...page.querySelectorAll('figure.konzilo-embed')].map((panel) => [...panel.children].map((child) => (child.tagName === 'P' ? [child.className, child.textContent] : child.tagName.toLowerCase())));
    const notice = ['konzilo-embed-no-script', 'The site\'s script has not run, so this content can neither ask for your consent nor load.'];
    assert.deepEqual(panels, [[notice, 'a', 'template'], [notice, 'a', 'template'], [notice, 'a', 'template']]);
    assert.equal(page.querySelectorAll('iframe').length, 0);
  });

  test('the page holds no inline code: its one script is a file of the site\'s own, and no element has an event handler or a style', () => {
    const scripts = [...page.querySelectorAll('script')];
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].type, 'module');
    assert.match(scripts[0].getAttribute('src'), /^\/_astro\/[^/]+\.js$/);
    assert.equal(scripts[0].textContent, '');
    const handlers = [...page.querySelectorAll('*')].flatMap((element) => element.getAttributeNames().filter((attribute) => attribute.startsWith('on')));
    assert.deepEqual(handlers, []);
    assert.equal(page.querySelectorAll('.konzilo-consent [style], .konzilo-consent-controls [style]').length, 0);
  });

  test('the page holds the registry for the script: its revision, its categories with their services, no storage that withdrawing removes, and the language of the texts shown', () => {
    const registry = JSON.parse(readFileSync(join(site.repository, 'content/consent.json'), 'utf8'));
    const data = JSON.parse(page.querySelector('[data-konzilo-consent]').dataset.konziloConsent);
    assert.deepEqual(data, { revision: registry.revision, categories: { necessary: ['consent'], marketing: ['vimeo', 'youtube'] }, storage: {}, language: 'en-GB' });
  });
});

describe('a page of a site whose registry asks no consent', () => {
  let site;
  let page;

  before(() => {
    site = build({ posts: [privacy, cookies, text] });
    page = site.page('text');
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('shows no banner, no dialog and no button, only the links to the policies, and still holds the registry', () => {
    assert.equal(page.querySelector('.konzilo-consent-banner'), null);
    assert.equal(page.querySelector('dialog'), null);
    assert.equal(page.querySelectorAll('button').length, 0);
    assert.deepEqual(texts(page.querySelectorAll('footer a')), ['Privacy policy', 'Cookie policy']);
    const data = JSON.parse(page.querySelector('[data-konzilo-consent]').dataset.konziloConsent);
    assert.deepEqual(data.categories, { necessary: ['consent'] });
  });
});

describe('a page of a site in sv_SE, whose Admin wrote the banner\'s title', () => {
  let site;
  let page;

  before(() => {
    const settings = { ...legalPages, settings: { ...legalPages.settings, consent: { bannerTitle: 'Vi frågar först' } } };
    site = build({ language: 'sv_SE', siteSettings: settings });
    page = site.page('videos');
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('shows the Admin\'s text in its place, and every other text in Swedish', () => {
    const banner = page.querySelector('.konzilo-consent-banner');
    assert.equal(banner.querySelector('h2').textContent, 'Vi frågar först');
    assert.deepEqual(texts(banner.querySelectorAll('button')), ['Acceptera alla', 'Neka valfria', 'Anpassa']);
    assert.deepEqual(texts(page.querySelectorAll('dialog > .konzilo-consent-buttons button')), ['Acceptera alla', 'Neka valfria', 'Spara mina val']);
    assert.deepEqual(texts(page.querySelectorAll('.konzilo-consent-count')), ['1 tjänst', '2 tjänster']);
    assert.deepEqual(texts(page.querySelectorAll('footer button')), ['Ändra integritetsinställningar', 'Återkalla samtycke']);
    const [consent, vimeo] = page.querySelectorAll('.konzilo-consent-service');
    assert.equal(consent.querySelector('.konzilo-consent-always').textContent, 'Alltid på');
    assert.match(consent.querySelector('dl').textContent.replace(/\s+/g, ' '), /konzilo-consent: lokal lagring, 12 månader, på www\.example\.com/);
    assert.match(vimeo.querySelector('dl').textContent.replace(/\s+/g, ' '), /Vimeo\.com, Inc\., USA\./);
  });

  test('an embed\'s panel says in Swedish that the script has not run, until it runs', () => {
    assert.equal(page.querySelector('figure.konzilo-embed > .konzilo-embed-no-script').textContent, 'Webbplatsens skript har inte körts, så innehållet kan varken be om ditt samtycke eller laddas.');
  });

  test('an embed\'s panel asks in Swedish, from the texts\' Swedish defaults and the core\'s own Swedish', () => {
    const visited = visit(site, 'videos');
    const panel = visited.document.querySelector('figure.konzilo-embed');
    assert.equal(panel.querySelector('.konzilo-embed-question').textContent, 'Vill du låta YouTube spela upp det här innehållet?');
    assert.equal(panel.querySelector('.konzilo-embed-storage').textContent.replace(/\s+/g, ' ').trim(), 'YouTube kan lagra uppgifter i din webbläsare, och Google Ireland Limited (Irland) tar emot uppgifter om ditt besök, som kan behandlas utanför EU och EES. Cookie policy');
    assert.equal(panel.querySelector('.konzilo-embed-allow').textContent, 'Tillåt och spela upp');
  });

  test('a choice\'s record notes that the banner shown was in Swedish', () => {
    const endpoint = standIn();
    const visited = visit(site, 'videos', { endpoint });
    click(visited, 'reject');
    assert.equal(endpoint.sent[0].record.language, 'sv-SE');
  });
});

test('warns at the build of a page with an embed where the layout has no banner to ask with', () => {
  const without = build({ pageLayout: layout.replace('    <ConsentBanner />\n', '') });
  const withBanner = build();
  try {
    assert.match(without.log, /page\(s\) with an embed, such as videos\/index\.html, have no ConsentBanner/);
    assert.doesNotMatch(withBanner.log, /have no ConsentBanner/);
  } finally {
    rmSync(without.repository, { recursive: true, force: true });
    rmSync(withBanner.repository, { recursive: true, force: true });
  }
});

test('the footer\'s controls can stand apart, the policies in one place and the buttons in another', () => {
  const site = build({});
  try {
    const page = site.page('split-footer');
    const links = page.querySelector('#links');
    const buttons = page.querySelector('#buttons');
    assert.deepEqual([...links.querySelectorAll('.konzilo-consent-policies a')].map(({ textContent }) => textContent), ['Privacy policy', 'Cookie policy']);
    assert.equal(links.querySelector('[data-konzilo-consent-action]'), null);
    assert.deepEqual([...buttons.querySelectorAll('[data-konzilo-consent-action]')].map(({ dataset }) => dataset.konziloConsentAction), ['change', 'withdraw']);
    assert.equal(buttons.querySelector('.konzilo-consent-policies'), null);
  } finally {
    rmSync(site.repository, { recursive: true, force: true });
  }
});

// A visit to a built page under jsdom, at its address on the public host:
// the page's script file run on it, after `stored` is put into the
// consent's own storage item and `data` has changed the registry the page
// holds for the script. Gives the window, the consent signal, the details
// of each event of it, whether the page asked to be reloaded, and what it
// set to run later, each { callback, delay }, which `later()` runs.
function visit(site, slug, { stored, data, endpoint, query = '' } = {}) {
  const reloads = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (/navigation/.test(error.message)) reloads.push(error.message);
    else throw error;
  });
  const html = site.output(`${slug}/index.html`);
  const { window } = new JSDOM(html, { url: `${ORIGIN}${site.base}${slug}/${query}`, runScripts: 'outside-only', virtualConsole });
  if (stored !== undefined) window.localStorage.setItem('konzilo-consent', JSON.stringify(stored));
  // jsdom has no fetch: a page given an endpoint has the stand-in's.
  if (endpoint) window.fetch = endpoint.fetch;
  const root = window.document.querySelector('[data-konzilo-consent]');
  if (data) root.dataset.konziloConsent = JSON.stringify(data(JSON.parse(root.dataset.konziloConsent)));
  const events = [];
  window.document.addEventListener('konzilo:consent', (event) => events.push(event.detail));
  const timers = [];
  window.setTimeout = (callback, delay) => timers.push({ callback, delay });
  window.eval(site.output(window.document.querySelector('script[src]').getAttribute('src').slice(site.base.length)));
  const kept = () => JSON.parse(window.localStorage.getItem('konzilo-consent'));
  const later = () => timers.splice(0).forEach(({ callback }) => callback());
  return { window, document: window.document, signal: window.konziloConsent, events, reloads, kept, timers, later };
}

// A value made in the page's window, as one of this realm's.
const plain = (value) => JSON.parse(JSON.stringify(value));
const click = (page, action) => page.document.querySelector(`button[data-konzilo-consent-action="${action}"]`).click();
const revisionOf = (site) => JSON.parse(readFileSync(join(site.repository, 'content/consent.json'), 'utf8')).revision;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('the consent client on a page of a site whose registry asks for consent', () => {
  let site;

  before(() => {
    site = build();
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('before a choice shows the banner and the footer\'s buttons, stores nothing, and allows the necessary alone', () => {
    const page = visit(site, 'videos');
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, false);
    assert.deepEqual([...page.document.querySelectorAll('footer button')].map((button) => button.hidden), [false, false]);
    assert.equal(page.window.localStorage.length, 0);
    assert.equal(page.document.cookie, '');
    assert.deepEqual(['necessary', 'marketing'].map(page.signal.category), [true, false]);
    assert.deepEqual(['consent', 'youtube', 'vimeo', 'elsewhere'].map(page.signal.service), [true, false, false, false]);
    assert.equal(page.signal.choice(), null);
  });

  test('Accept all allows every category and service at once, keeps the choice with a new consent ID, hides the banner, and gives one event', () => {
    const page = visit(site, 'videos');
    click(page, 'accept');
    assert.deepEqual(['necessary', 'marketing'].map(page.signal.category), [true, true]);
    assert.deepEqual(['youtube', 'vimeo'].map(page.signal.service), [true, true]);
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, true);
    const kept = page.kept();
    assert.match(kept.id, UUID);
    assert.equal(kept.revision, revisionOf(site));
    assert.ok(Math.abs(Date.parse(kept.time) - Date.now()) < 60_000);
    assert.deepEqual(kept.categories, { necessary: true, marketing: true });
    assert.deepEqual(kept.services, { consent: true, vimeo: true, youtube: true });
    assert.equal(page.events.length, 1);
    assert.deepEqual(plain(page.events[0]), { choice: kept, how: 'banner' });
    assert.deepEqual(plain(page.signal.choice()), kept);
    assert.deepEqual(page.reloads, []);
  });

  test('on the privacy policy and the cookie policy the banner stays hidden before a choice, and the footer\'s buttons work there', () => {
    for (const slug of ['privacy', 'cookies']) {
      const page = visit(site, slug);
      assert.equal(JSON.parse(page.document.querySelector('[data-konzilo-consent]').dataset.konziloConsent).legalPage, true, slug);
      assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, true, slug);
      assert.deepEqual([...page.document.querySelectorAll('footer button')].map((button) => button.hidden), [false, false], slug);
      const dialog = Object.assign(page.document.querySelector('dialog'), { showModal() { this.open = true; } });
      click(page, 'change');
      assert.equal(dialog.open, true, slug);
    }
    assert.equal(JSON.parse(visit(site, 'text').document.querySelector('[data-konzilo-consent]').dataset.konziloConsent).legalPage, undefined);
  });

  test('a choice that holds keeps the banner hidden on the next page, and the signal gives it', () => {
    const first = visit(site, 'videos');
    click(first, 'reject');
    const kept = first.kept();
    assert.deepEqual(kept.services, { consent: true, vimeo: false, youtube: false });
    assert.equal(first.events[0].how, 'banner');

    const next = visit(site, 'text', { stored: kept });
    assert.equal(next.document.querySelector('.konzilo-consent-banner').hidden, true);
    assert.deepEqual(plain(next.signal.choice()), kept);
    assert.equal(next.signal.service('youtube'), false);
    assert.equal(next.events.length, 0);
  });

  test('a choice of another revision shows the banner again and allows nothing optional, and the next choice keeps its consent ID', () => {
    const id = '0b5c8e2a-4d1f-4c3b-9a7e-6f2d1c0b9a8e';
    const stored = { id, time: new Date().toISOString(), revision: '0123456789abcdef', categories: { necessary: true, marketing: true }, services: { consent: true, vimeo: true, youtube: true } };
    const page = visit(site, 'videos', { stored });
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, false);
    assert.equal(page.signal.service('youtube'), false);
    assert.equal(page.signal.choice(), null);
    click(page, 'accept');
    assert.equal(page.kept().id, id);
    assert.equal(page.kept().revision, revisionOf(site));
  });

  test('a choice made more than 12 months ago is gone from the browser as the page loads: the banner asks again, and the next choice has a new consent ID', () => {
    const id = '0b5c8e2a-4d1f-4c3b-9a7e-6f2d1c0b9a8e';
    const accepted = { id, revision: revisionOf(site), categories: { necessary: true, marketing: true }, services: { consent: true, vimeo: true, youtube: true } };
    const aged = new Date();
    aged.setUTCMonth(aged.getUTCMonth() - 12);
    aged.setUTCMinutes(aged.getUTCMinutes() - 1);
    const page = visit(site, 'videos', { stored: { ...accepted, time: aged.toISOString() } });
    assert.equal(page.kept(), null, 'nothing is kept past its 12 months');
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, false);
    assert.equal(page.signal.service('youtube'), false);
    assert.equal(page.signal.choice(), null);
    click(page, 'accept');
    assert.match(page.kept().id, UUID);
    assert.notEqual(page.kept().id, id);

    const young = new Date();
    young.setUTCMonth(young.getUTCMonth() - 11);
    const holding = visit(site, 'videos', { stored: { ...accepted, time: young.toISOString() } });
    assert.equal(holding.document.querySelector('.konzilo-consent-banner').hidden, true, '11 months old');
    assert.equal(holding.signal.service('youtube'), true, '11 months old');
    assert.equal(holding.kept().id, id, '11 months old');
  });

  test('allowing one service, as a placeholder does, allows it alone on every page, and keeps what else was allowed', () => {
    const page = visit(site, 'videos');
    page.signal.allow('vimeo');
    assert.deepEqual(['vimeo', 'youtube'].map(page.signal.service), [true, false]);
    assert.equal(page.signal.category('marketing'), false);
    assert.deepEqual(page.events.map(({ how }) => how), ['placeholder']);
    page.signal.allow('youtube');
    assert.deepEqual(page.kept().services, { consent: true, vimeo: true, youtube: true });
    assert.equal(page.signal.category('marketing'), true);
    page.signal.allow('elsewhere');
    assert.equal(page.events.length, 2, 'a service the registry does not hold is no choice');
  });

  test('before a choice each embed\'s panel asks for consent to its service, with Allow and play and the link to the address, and holds no player', () => {
    const page = visit(site, 'videos');
    const panels = [...page.document.querySelectorAll('figure.konzilo-embed')].map((panel) => ({
      service: panel.dataset.embed,
      parts: [...panel.children].map((child) => `${child.tagName.toLowerCase()}${child.className ? `.${child.className}` : ''}`),
      question: panel.querySelector(':scope > .konzilo-embed-question').textContent,
      button: panel.querySelector(':scope > button').textContent,
      address: panel.querySelector(':scope > a').getAttribute('href'),
    }));
    const parts = ['p.konzilo-embed-question', 'p.konzilo-embed-storage', 'button.konzilo-embed-allow', 'a', 'template'];
    assert.deepEqual(panels, [
      { service: 'youtube', parts, question: 'Allow YouTube to play this content?', button: 'Allow and play', address: 'https://www.youtube.com/watch?v=Kz3pQ8vXw1A' },
      { service: 'vimeo', parts, question: 'Allow Vimeo to play this content?', button: 'Allow and play', address: 'https://vimeo.com/76979871' },
      { service: 'youtube', parts, question: 'Allow YouTube to play this content?', button: 'Allow and play', address: 'https://youtu.be/Rt5uVw2Xy3Z' },
    ]);
    assert.equal(page.document.querySelectorAll('iframe').length, 0);
    assert.equal(page.document.querySelector('.konzilo-embed button').type, 'button');
  });

  test('Allow and play allows that service alone, as given in a placeholder, and loads every panel of it on the page, the focus in the player pressed; another service\'s panel keeps asking', () => {
    const page = visit(site, 'videos');
    const [first, vimeo, second] = page.document.querySelectorAll('figure.konzilo-embed');
    first.querySelector('.konzilo-embed-allow').click();

    assert.deepEqual(page.kept().services, { consent: true, vimeo: false, youtube: true });
    assert.deepEqual(page.events.map(({ how }) => how), ['placeholder']);
    const contents = (panel) => [...panel.children].map((child) => (child.tagName === 'IFRAME' ? [child.title, child.getAttribute('src')] : child.className || child.tagName.toLowerCase()));
    assert.deepEqual(contents(first), [['YouTube', 'https://www.youtube-nocookie.com/embed/Kz3pQ8vXw1A']]);
    assert.deepEqual(contents(second), [['YouTube', 'https://www.youtube-nocookie.com/embed/Rt5uVw2Xy3Z']]);
    assert.equal(page.document.activeElement, first.querySelector('iframe'));
    assert.deepEqual(contents(vimeo), ['konzilo-embed-question', 'konzilo-embed-storage', 'konzilo-embed-allow', 'a', 'template']);
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, true);
    assert.deepEqual(page.reloads, []);
  });

  test('a placeholder says in a sentence what its service may store and where its data goes, and links to the cookie policy, which holds the cookie declaration', () => {
    const page = visit(site, 'videos');
    const [youtube, vimeo] = [...page.document.querySelectorAll('figure.konzilo-embed .konzilo-embed-storage')];
    assert.equal(youtube.textContent.replace(/\s+/g, ' ').trim(), 'YouTube may store data in your browser, and Google Ireland Limited (Ireland) receives data about your visit, which may be processed outside the EU and EEA. Cookie policy');
    assert.equal(vimeo.textContent.replace(/\s+/g, ' ').trim(), 'Vimeo may store data in your browser, and Vimeo.com, Inc. (United States) receives data about your visit, which may be processed outside the EU and EEA. Cookie policy');
    assert.deepEqual([...youtube.querySelectorAll('a')].map((link) => [link.textContent, link.getAttribute('href')]), [['Cookie policy', '/cookies/']]);
  });

  test('a panel whose service the visitor allows loads its player as the page loads, and one allowed later the moment the signal says so, without a reload', () => {
    const first = visit(site, 'videos');
    first.signal.allow('youtube');
    const next = visit(site, 'videos', { stored: first.kept() });
    const players = (page) => [...page.document.querySelectorAll('figure.konzilo-embed > iframe')].map((player) => player.getAttribute('src'));
    assert.deepEqual(players(next), ['https://www.youtube-nocookie.com/embed/Kz3pQ8vXw1A', 'https://www.youtube-nocookie.com/embed/Rt5uVw2Xy3Z']);
    assert.notEqual(next.document.activeElement?.tagName, 'IFRAME');

    click(next, 'accept');
    assert.deepEqual(players(next), ['https://www.youtube-nocookie.com/embed/Kz3pQ8vXw1A', 'https://player.vimeo.com/video/76979871?dnt=1', 'https://www.youtube-nocookie.com/embed/Rt5uVw2Xy3Z']);
    assert.equal(next.document.querySelectorAll('.konzilo-embed-allow').length, 0);
    assert.deepEqual(next.reloads, []);
  });

  test('Withdraw consent rejects every optional service, keeps the consent ID, removes what each one stored that the page reaches, says so in the banner\'s place, and reloads two seconds later', () => {
    // A registry whose YouTube stores items of its own on the site: a
    // cookie, local storage under a pattern, and session storage.
    const storage = { youtube: [{ name: 'yt_visitor', kind: 'cookie' }, { name: 'yt-player-*', kind: 'localStorage' }, { name: 'yt-session', kind: 'sessionStorage' }] };
    const page = visit(site, 'videos', { data: (registry) => ({ ...registry, storage }) });
    click(page, 'accept');
    const { id } = page.kept();
    page.document.cookie = 'yt_visitor=1; Path=/';
    page.document.cookie = 'yt_visitor=2; Path=/videos';
    page.document.cookie = 'kept=1; Path=/';
    page.window.localStorage.setItem('yt-player-volume', '5');
    page.window.localStorage.setItem('yt-player-quality', 'hd');
    page.window.localStorage.setItem('elsewhere', 'stays');
    page.window.sessionStorage.setItem('yt-session', 'x');

    click(page, 'withdraw');
    assert.deepEqual(page.kept().services, { consent: true, vimeo: false, youtube: false });
    assert.equal(page.kept().id, id);
    assert.deepEqual(page.events.map(({ how }) => how), ['banner', 'withdrawal']);
    assert.equal(page.document.cookie, 'kept=1');
    const keys = Array.from({ length: page.window.localStorage.length }, (_, index) => page.window.localStorage.key(index)).sort();
    assert.deepEqual(keys, ['elsewhere', 'konzilo-consent']);
    assert.equal(page.window.sessionStorage.length, 0);
    const notice = page.document.querySelector('.konzilo-consent-notice');
    assert.equal(notice.hidden, false);
    assert.equal(notice.getAttribute('role'), 'status');
    assert.equal(notice.textContent, 'Your consents have been withdrawn. The page will reload.');
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, true);
    assert.deepEqual(page.reloads, []);
    assert.deepEqual(page.timers.map(({ delay }) => delay), [2000]);
    page.later();
    assert.equal(page.reloads.length, 1);

    const next = visit(site, 'videos', { stored: page.kept() });
    assert.equal(next.document.querySelector('.konzilo-consent-banner').hidden, true, 'the banner does not come back');
    assert.equal(next.document.querySelector('.konzilo-consent-notice').hidden, true);
  });

  test('turning a service off in the dialog does for it what withdrawing does: it removes what that service stored that the page reaches, and reloads; a choice that withdraws nothing does neither', () => {
    const storage = { youtube: [{ name: 'yt_visitor', kind: 'cookie' }, { name: 'yt-player-*', kind: 'localStorage' }], vimeo: [{ name: 'vuid', kind: 'cookie' }] };
    const accepted = { id: '0b5c8e2a-4d1f-4c3b-9a7e-6f2d1c0b9a8e', time: new Date(Date.now() - 60_000).toISOString(), revision: revisionOf(site), categories: { necessary: true, marketing: true }, services: { consent: true, vimeo: true, youtube: true } };
    // jsdom has no modal dialog: the dialog opens and closes as a browser's.
    const dialogOf = (page) => Object.assign(page.document.querySelector('dialog'), { showModal() { this.open = true; }, close() { this.open = false; } });
    const inDialog = (page, action) => page.document.querySelector(`dialog button[data-konzilo-consent-action="${action}"]`).click();
    const stores = (page) => {
      page.document.cookie = 'yt_visitor=1; Path=/';
      page.document.cookie = 'vuid=1; Path=/';
      page.window.localStorage.setItem('yt-player-volume', '5');
    };

    const page = visit(site, 'videos', { stored: accepted, data: (registry) => ({ ...registry, storage }) });
    dialogOf(page);
    stores(page);
    click(page, 'change');
    page.document.querySelector('input[data-konzilo-consent-service="youtube"]').checked = false;
    inDialog(page, 'save');
    assert.deepEqual(page.kept().services, { consent: true, vimeo: true, youtube: false });
    assert.deepEqual(page.events.map(({ how }) => how), ['dialog']);
    assert.equal(page.document.cookie, 'vuid=1');
    assert.equal(page.window.localStorage.getItem('yt-player-volume'), null);
    assert.equal(page.reloads.length, 1);

    // Turning off a whole category in the dialog, as Reject optional does.
    const rejecting = visit(site, 'videos', { stored: accepted, data: (registry) => ({ ...registry, storage }) });
    dialogOf(rejecting);
    stores(rejecting);
    click(rejecting, 'change');
    inDialog(rejecting, 'reject');
    assert.equal(rejecting.document.cookie, '');
    assert.equal(rejecting.reloads.length, 1);

    // Allowing more withdraws nothing.
    const adding = visit(site, 'videos', { stored: { ...accepted, categories: { necessary: true, marketing: false }, services: { consent: true, vimeo: false, youtube: true } }, data: (registry) => ({ ...registry, storage }) });
    dialogOf(adding);
    stores(adding);
    click(adding, 'change');
    inDialog(adding, 'accept');
    assert.deepEqual(adding.kept().services, { consent: true, vimeo: true, youtube: true });
    assert.equal(adding.window.localStorage.getItem('yt-player-volume'), '5');
    assert.deepEqual(adding.reloads, []);
  });
});

describe('the consent client on a page of a site that counts a service as necessary', () => {
  let site;

  before(() => {
    site = build({ consent: { departures: [{ departure: 'necessaryService', service: 'vimeo', reason: 'Our courses are Vimeo videos.' }] } });
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('allows that service always, before any choice and after a refusal, and shows it as necessary with the reason', () => {
    const page = visit(site, 'videos');
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, false);
    assert.deepEqual(['vimeo', 'youtube'].map(page.signal.service), [true, false]);
    click(page, 'reject');
    assert.deepEqual(['vimeo', 'youtube'].map(page.signal.service), [true, false]);
    const vimeo = [...page.document.querySelectorAll('.konzilo-consent-service')].find((service) => service.querySelector('h4').textContent === 'Vimeo');
    assert.equal(vimeo.closest('.konzilo-consent-category').querySelector('h3').textContent, 'Necessary');
    assert.equal(vimeo.querySelector('.konzilo-consent-always').textContent, 'Always on');
    assert.match(vimeo.querySelector('dl').textContent, /Why it is neededOur courses are Vimeo videos\./);
  });

  test('loads that service\'s embeds before any choice, and the page holds no placeholder of it', () => {
    const page = visit(site, 'videos');
    const panels = [...page.document.querySelectorAll('figure.konzilo-embed')].map((panel) => [panel.dataset.embed, panel.querySelector(':scope > iframe') !== null]);
    assert.deepEqual(panels, [['youtube', false], ['vimeo', true], ['youtube', false]]);
    assert.deepEqual([...page.document.querySelectorAll('template[data-konzilo-consent-placeholder]')].map((template) => template.dataset.konziloConsentPlaceholder), ['youtube']);
  });
});

describe('the consent client on a page of a site whose registry asks no consent', () => {
  let site;

  before(() => {
    site = build({ posts: [privacy, cookies, text] });
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('gives the signal, which allows the necessary alone, and stores nothing', () => {
    const page = visit(site, 'text');
    assert.equal(page.signal.service('consent'), true);
    assert.equal(page.signal.category('marketing'), false);
    assert.equal(page.signal.choice(), null);
    assert.equal(page.window.localStorage.length, 0);
  });
});

test('withdrawing removes what each optional service stores on the site itself, its cookies, local and session storage, and nothing a necessary service or a frame stores', () => {
  const service = (id, category, storage) => ({ id, name: id, category, provider: null, purpose: 'A purpose.', storage, hosts: {}, transfers: [], necessity: category === 'necessary' ? 'A reason.' : null });
  const item = (name, kind, party) => ({ name, kind, lifetime: 'P1D', party });
  const registry = {
    revision: '0123456789abcdef',
    categories: [
      { id: 'necessary', name: 'Necessary', description: 'D.', services: ['consent'] },
      { id: 'statistics', name: 'Statistics', description: 'D.', services: ['counter', 'player'] },
    ],
    services: [
      service('consent', 'necessary', [item('konzilo-consent', 'localStorage', 'first')]),
      service('counter', 'statistics', [item('_count*', 'cookie', 'first'), item('count', 'localStorage', 'first'), item('visit', 'sessionStorage', 'first'), item('db', 'other', 'first')]),
      service('player', 'statistics', [item('frame', 'cookie', 'third')]),
    ],
    texts: {},
  };
  const { data } = consentView({ registry, language: 'en-GB' });
  assert.deepEqual(data.storage, { counter: [{ name: '_count*', kind: 'cookie' }, { name: 'count', kind: 'localStorage' }, { name: 'visit', kind: 'sessionStorage' }] });
});

// A stand-in for the site's public endpoint: every request a page sends
// it, and its answer, 204 unless `answer` gives another status or throws,
// as an endpoint that does not answer does.
function standIn(answer = () => 204) {
  const sent = [];
  const fetch = (url, init) => {
    sent.push({ url: String(url), method: init.method, type: init.headers['Content-Type'], keepalive: init.keepalive, record: JSON.parse(init.body) });
    try {
      const status = answer();
      return Promise.resolve({ status, ok: status >= 200 && status < 300, text: () => Promise.resolve(status === 204 ? '' : 'Bad request\n') });
    } catch (error) {
      return Promise.reject(error);
    }
  };
  return { sent, fetch };
}

// Once what the page's requests settle on has run.
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const unanswered = () => {
  throw new TypeError('Failed to fetch');
};

describe('the consent client\'s records', () => {
  let site;

  before(() => {
    site = build();
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('every choice is sent to the endpoint in the background, as a record of the consent ID, the browser\'s time, the revision, every state, the part and control, the page\'s path without its query, and the language of the banner shown', () => {
    const endpoint = standIn();
    const page = visit(site, 'videos', { endpoint, query: '?utm_source=mail#top' });
    click(page, 'accept');
    const kept = page.kept();
    assert.deepEqual(endpoint.sent.map(({ url, method, type, keepalive }) => ({ url, method, type, keepalive })), [
      { url: '/_konzilo/consent', method: 'POST', type: 'application/json', keepalive: true },
    ]);
    assert.deepEqual(endpoint.sent[0].record, {
      id: kept.id,
      chosen: kept.time,
      revision: revisionOf(site),
      categories: { necessary: true, marketing: true },
      services: { consent: true, vimeo: true, youtube: true },
      how: 'banner',
      control: 'accept',
      path: '/videos/',
      language: 'en-GB',
    });

    click(page, 'reject');
    page.signal.allow('vimeo');
    click(page, 'withdraw');
    assert.deepEqual(endpoint.sent.map(({ record: { how, control, services } }) => ({ how, control, services })), [
      { how: 'banner', control: 'accept', services: { consent: true, vimeo: true, youtube: true } },
      { how: 'banner', control: 'reject', services: { consent: true, vimeo: false, youtube: false } },
      { how: 'placeholder', control: 'allow', services: { consent: true, vimeo: true, youtube: false } },
      { how: 'withdrawal', control: 'withdraw', services: { consent: true, vimeo: false, youtube: false } },
    ]);
    assert.equal(new Set(endpoint.sent.map(({ record }) => record.id)).size, 1, 'one consent ID');
  });

  test('each choice has a time of its own, later than the last, even two in the same millisecond', () => {
    const endpoint = standIn();
    const page = visit(site, 'videos', { endpoint });
    page.signal.allow('vimeo');
    page.signal.allow('youtube');
    const [first, second] = endpoint.sent.map(({ record }) => record.chosen);
    assert.ok(Date.parse(second) > Date.parse(first), `${second} is later than ${first}`);
  });

  test('a record the endpoint stored leaves nothing kept for later, and the next page sends nothing', async () => {
    const endpoint = standIn();
    const page = visit(site, 'videos', { endpoint });
    click(page, 'accept');
    await settled();
    const kept = page.kept();
    assert.deepEqual(Object.keys(kept).sort(), ['categories', 'id', 'revision', 'services', 'time']);

    const next = visit(site, 'text', { stored: kept, endpoint });
    await settled();
    assert.equal(endpoint.sent.length, 1);
    assert.deepEqual(plain(next.signal.choice()), kept);
  });

  test('a record the endpoint did not store is kept with the choice, which holds regardless, and sent once more on a later page view, then given up', async () => {
    const down = standIn(unanswered);
    const page = visit(site, 'videos', { endpoint: down });
    click(page, 'accept');
    await settled();
    assert.equal(page.signal.service('youtube'), true);
    const kept = page.kept();
    assert.deepEqual(kept.unsent, [down.sent[0].record]);
    assert.equal(page.signal.choice().unsent, undefined, 'the signal hands out the choice alone');
    assert.equal(page.events[0].choice.unsent, undefined, 'the event too');

    // The next page view, with the endpoint still down: the choice holds,
    // the record is sent once more, and then given up.
    const next = visit(site, 'text', { stored: kept, endpoint: down });
    await settled();
    assert.equal(next.document.querySelector('.konzilo-consent-banner').hidden, true);
    assert.equal(next.signal.service('youtube'), true);
    assert.deepEqual(down.sent.map(({ record }) => record), [down.sent[0].record, down.sent[0].record]);
    assert.equal(next.kept().unsent, undefined);

    const later = visit(site, 'videos', { stored: next.kept(), endpoint: down });
    await settled();
    assert.equal(down.sent.length, 2, 'given up');
    assert.equal(later.signal.service('youtube'), true);
  });

  test('every record the endpoint did not store waits until it is sent, each with its own choice, and a later page view sends each once more', async () => {
    const down = standIn(unanswered);
    const page = visit(site, 'videos', { endpoint: down });
    click(page, 'accept');
    page.signal.allow('vimeo');
    click(page, 'withdraw');
    await settled();
    const records = down.sent.map(({ record }) => record);
    assert.deepEqual(records.map(({ how, services }) => [how, services.youtube]), [['banner', true], ['placeholder', true], ['withdrawal', false]]);
    assert.deepEqual(page.kept().unsent, records);

    // The endpoint takes the second when it is sent again, and fails the
    // others: each is given up after its second try alike.
    let tries = 0;
    const flaky = standIn(() => {
      tries += 1;
      if (tries === 2) return 204;
      throw new TypeError('Failed to fetch');
    });
    const next = visit(site, 'text', { stored: page.kept(), endpoint: flaky });
    await settled();
    assert.deepEqual(flaky.sent.map(({ record }) => record), records);
    assert.equal(next.kept().unsent, undefined);

    // One stored of two that wait on the same page: the other still waits.
    let answers = 0;
    const half = standIn(() => {
      answers += 1;
      if (answers === 1) return 204;
      throw new TypeError('Failed to fetch');
    });
    const again = visit(site, 'videos', { endpoint: half });
    click(again, 'reject');
    again.signal.allow('youtube');
    await settled();
    assert.deepEqual(again.kept().unsent, [half.sent[1].record]);
  });

  test('a record refused or failed at the endpoint arrives on a later page view once the endpoint takes it', async () => {
    for (const status of [400, 500, 502]) {
      const failing = standIn(() => status);
      const page = visit(site, 'videos', { endpoint: failing });
      click(page, 'reject');
      await settled();
      assert.ok(page.kept().unsent, `kept after ${status}`);

      const up = standIn();
      const next = visit(site, 'text', { stored: page.kept(), endpoint: up });
      await settled();
      assert.deepEqual(up.sent.map(({ record }) => record), [failing.sent[0].record], `sent again after ${status}`);
      assert.equal(next.kept().unsent, undefined);
    }
  });

  test('a page without fetch keeps no record for later', () => {
    const page = visit(site, 'videos');
    click(page, 'accept');
    assert.equal(page.kept().unsent, undefined);
  });
});

test('a release built for the launched origin keeps the choice on the domain the site description gives, and no other build does', () => {
  const launched = { ...astroEnvironment, KONZILO_LAUNCHED: '1' };
  const script = (site) => site.output(site.page('videos').querySelector('script[src]').getAttribute('src').slice(1));
  const sites = [
    build({ consent: { domain: 'example.com' }, environment: launched }),
    build({ consent: { domain: 'example.com' } }),
    build({ consent: { domain: 'example.org' }, environment: launched }),
  ];
  try {
    const [shared, prelaunch, elsewhere] = sites;
    // The client's options as the bundled script holds them.
    assert.match(script(shared), /months:12,domain:[`"]example\.com[`"],records:/);
    assert.match(script(prelaunch), /months:12,domain:null,records:/);
    assert.match(script(elsewhere), /months:12,domain:null,records:/);
    assert.match(elsewhere.log, /keeps the consent choice on example\.org, which the public host www\.example\.com is neither at nor below/);
    const registry = JSON.parse(readFileSync(join(shared.repository, 'content/consent.json'), 'utf8'));
    assert.equal(registry.services.find((one) => one.id === 'consent').storage[0].domain, 'example.com');
  } finally {
    for (const site of sites) rmSync(site.repository, { recursive: true, force: true });
  }
});

test('a preview, which no visitor sees, sends no record, keeps none, and makes no consent ID', async () => {
  const site = build({ base: '/preview/someone/' });
  try {
    const endpoint = standIn();
    const page = visit(site, 'videos', { endpoint });
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, false);
    click(page, 'accept');
    await settled();
    assert.equal(page.signal.service('youtube'), true);
    assert.deepEqual(endpoint.sent, []);
    assert.equal(page.kept().unsent, undefined);
    assert.deepEqual(Object.keys(page.kept()).sort(), ['categories', 'revision', 'services', 'time'], 'and no consent ID, which nobody could look up');
    assert.equal(page.signal.choice().id, undefined);
  } finally {
    rmSync(site.repository, { recursive: true, force: true });
  }
});

test('a placeholder\'s sentence names the provider and its country, says so when data may leave the EU and EEA, and links to no cookie policy where the site has none', () => {
  const provider = (name, country) => ({ name, country, privacyPolicy: 'https://example.com/privacy' });
  const service = (id, name, owner, transfers) => ({ id, name, category: 'functional', provider: owner, purpose: 'A purpose.', storage: [], hosts: { frames: [`${id}.example.com`] }, transfers, necessity: null });
  const registry = {
    revision: '0123456789abcdef',
    categories: [{ id: 'functional', name: 'Functional', description: 'D.', services: ['datawrapper', 'screen9', 'spotify'] }],
    services: [
      service('datawrapper', 'Datawrapper', null, []),
      service('screen9', 'Screen9', provider('Quickchannel AB', 'SE'), []),
      service('spotify', 'Spotify', provider('Spotify AB', 'SE'), [{ country: null, safeguards: ['scc'] }]),
    ],
    texts: { placeholder: { question: 'Play {service}?', button: 'Play {service}' } },
  };
  const sentences = (language) => consentView({ registry, language }).placeholders.map(({ service, storage }) => [service, storage]);
  assert.deepEqual(sentences('en-GB'), [
    ['datawrapper', 'Datawrapper may store data in your browser.'],
    ['screen9', 'Screen9 may store data in your browser, and Quickchannel AB (Sweden) receives data about your visit.'],
    ['spotify', 'Spotify may store data in your browser, and Spotify AB (Sweden) receives data about your visit, which may be processed outside the EU and EEA.'],
  ]);
  assert.deepEqual(sentences('sv-SE'), [
    ['datawrapper', 'Datawrapper kan lagra uppgifter i din webbläsare.'],
    ['screen9', 'Screen9 kan lagra uppgifter i din webbläsare, och Quickchannel AB (Sverige) tar emot uppgifter om ditt besök.'],
    ['spotify', 'Spotify kan lagra uppgifter i din webbläsare, och Spotify AB (Sverige) tar emot uppgifter om ditt besök, som kan behandlas utanför EU och EES.'],
  ]);
  const view = consentView({ registry, language: 'en-GB' });
  assert.equal(view.declaration, null);
  assert.deepEqual(view.placeholders.map(({ question, button }) => [question, button]), [['Play Datawrapper?', 'Play Datawrapper'], ['Play Screen9?', 'Play Screen9'], ['Play Spotify?', 'Play Spotify']]);
});

test('a site that changes its language shows each embed\'s sentence in the new one at the next build, though its content files and Astro\'s cache stay', () => {
  const site = build();
  try {
    const notice = () => site.page('videos').querySelector('.konzilo-embed-no-script').textContent;
    assert.equal(notice(), 'The site\'s script has not run, so this content can neither ask for your consent nor load.');
    writeFileSync(join(site.repository, 'site-description.json'), JSON.stringify({ language: 'sv_SE', types }));
    buildAstro(site.repository);
    assert.equal(notice(), 'Webbplatsens skript har inte körts, så innehållet kan varken be om ditt samtycke eller laddas.');
  } finally {
    rmSync(site.repository, { recursive: true, force: true });
  }
});
