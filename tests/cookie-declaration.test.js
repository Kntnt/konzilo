// The cookie declaration: a component of
// the integration that a site's templates place after a page's body, which
// shows on the page the site settings choose as the cookie policy, and only
// there. It renders the service registry in the site's language: each
// category with its services and all their facts, the departures with their
// reasons and the day the registry last changed; and, through the
// integration's script, the visitor's own consent, with the buttons that
// change and withdraw it. Seen in a small site's static build, and its
// script run on the built page under jsdom.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { isCookiePolicy } from '../src/astro/consent.js';
import { declarationView } from '../src/consent/markup.js';
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

// The site's frame: the banner first in the body and the footer controls in
// the footer, as the site template places them; and its one template, which
// places the declaration after each post's body, imported from the package.
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
  '    <slot />',
  '    <footer><ConsentControls /></footer>',
  '  </body>',
  '</html>',
  '',
].join('\n');

const sources = {
  'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
  'src/layouts/Site.astro': layout,
  'src/pages/[slug].astro': [
    '---',
    "import CookieDeclaration from '@kntnt/konzilo/astro/CookieDeclaration.astro';",
    "import { getCollection, render } from 'astro:content';",
    "import Site from '../layouts/Site.astro';",
    'export async function getStaticPaths() {',
    "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
    '}',
    'const { entry } = Astro.props;',
    'const { Content } = await render(entry);',
    '---',
    '<Site><main><h1>{entry.data.title}</h1><Content /><CookieDeclaration /></main></Site>',
    '',
  ].join('\n'),
};

const videos = post({
  ID: 1,
  slug: 'videos',
  title: 'Videos',
  body: [embed('https://www.youtube.com/watch?v=Kz3pQ8vXw1A'), embed('https://vimeo.com/76979871')].join('\n\n'),
});
const privacy = post({ ID: 3, slug: 'privacy', title: 'Privacy policy', body: paragraphs('What we keep.') });
const cookies = post({ ID: 4, slug: 'cookies', title: 'Cookie policy', body: paragraphs('What we store.') });

// A service an Admin declares: a counter the tag manager loads, which sets
// two cookies of the site's own and sends what it counts to the US.
const counter = {
  id: 'counter',
  name: 'Example Counter',
  category: 'statistics',
  provider: { name: 'Example Counting Inc.', country: 'US', privacyPolicy: 'https://counting.example.net/privacy' },
  purpose: 'Counts the visits to each page.',
  storage: [{ name: '_count', kind: 'cookie', lifetime: 'P13M', party: 'first' }, { name: '_count_session', kind: 'cookie', lifetime: 'session', party: 'first' }],
  hosts: { scripts: ['https://cdn.counting.example.net'], frames: [], connections: ['https://collect.counting.example.net'], images: [], styles: [], fonts: [] },
  transfers: [{ country: 'US', safeguards: ['adequacy', 'scc'] }],
};

// Another: an advertiser's pixel, beside YouTube in marketing.
const pixel = {
  id: 'pixel',
  name: 'Example Pixel',
  category: 'marketing',
  provider: { name: 'Example Ads Ltd', country: 'IE', privacyPolicy: 'https://ads.example.net/privacy' },
  purpose: 'Measures which of our ads lead visitors to the site.',
  storage: [{ name: 'ads_id', kind: 'cookie', lifetime: 'P3M', party: 'third' }],
  hosts: { scripts: [], frames: [], connections: [], images: ['https://pixel.example.net'], styles: [], fonts: [] },
  transfers: [],
};

// The site settings of a site that chooses its privacy policy and its
// cookie policy, and declares the counter and the pixel.
const siteSettings = { menus: {}, settings: { legalPages: { cookiePolicy: '4', privacyPolicy: '3' } }, services: [counter, pixel] };

// The site's departure: Vimeo counts as necessary.
const departures = [{ departure: 'necessaryService', service: 'vimeo', reason: 'Our courses are Vimeo videos.' }];

// A site repository with Astro and Konzilo's package installed, the design
// above, `posts` written as a build writes them with `settings`, and built
// by Astro, below `base` as a preview is. A repository whose export or build
// fails is removed.
function build({ language = 'en_GB', posts = [videos, privacy, cookies], settings = siteSettings, consent = { departures }, base = '/' } = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-cookie-declaration-'));
  try {
    mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
    for (const entry of readdirSync(join(core, 'node_modules'))) {
      if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
    }
    symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
    const files = {
      ...sources,
      'astro.config.mjs': astroConfig(integration).replace('export default {', `export default { base: ${JSON.stringify(base)},`),
      'site-description.json': JSON.stringify({ language, types, ...(consent ? { consent } : {}) }),
    };
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), contents);
    }
    siteSettingsArgs(repository, settings);
    const exported = writeContent(repository, posts);
    assert.equal(exported.status, 0, exported.stderr);
    const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  } catch (error) {
    rmSync(repository, { recursive: true, force: true });
    throw error;
  }
  const output = (path) => readFileSync(join(repository, 'dist', path), 'utf8');
  const registry = () => JSON.parse(readFileSync(join(repository, 'content/consent.json'), 'utf8'));
  return { repository, output, registry, page: (slug) => new JSDOM(output(`${slug}/index.html`)).window.document };
}

const text = (element) => element.textContent.replace(/\s+/g, ' ').trim();

// A service's part of the declaration: its heading, its facts by their
// terms, a list's items each apart, and its table of what it stores, by its
// headers, or the sentence in its place.
function serviceOf(section) {
  const fact = (value) => (value.querySelector('ul') ? [...value.querySelectorAll('li')].map(text) : text(value));
  const facts = Object.fromEntries([...section.querySelectorAll(':scope > dl > dt')].map((term) => [text(term), fact(term.nextElementSibling)]));
  const table = section.querySelector(':scope > table');
  const storage = table
    ? { caption: text(table.querySelector('caption')), headers: [...table.querySelectorAll('thead th')].map(text), rows: [...table.querySelectorAll('tbody tr')].map((row) => [...row.children].map(text)) }
    : text(section.querySelector(':scope > p'));
  return { name: text(section.querySelector('h4')), facts, storage };
}

describe('the cookie policy page of a site whose registry asks for consent', () => {
  let site;
  let page;

  before(() => {
    site = build();
    page = site.page('cookies');
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('shows after its body each category of the registry, in the registry\'s order, with its name, its description and its services', () => {
    const declaration = page.querySelector('main > .konzilo-declaration');
    assert.ok(declaration, 'the declaration follows the body');
    assert.equal(declaration.previousElementSibling.textContent, 'What we store.');
    const registry = site.registry();
    const categories = [...declaration.querySelectorAll('.konzilo-declaration-category')].map((category) => ({
      name: text(category.querySelector('h3')),
      description: text(category.querySelector(':scope > p')),
      services: [...category.querySelectorAll('h4')].map(text),
    }));
    const names = new Map(registry.services.map((service) => [service.id, service.name]));
    assert.deepEqual(categories, registry.categories.map((category) => ({ name: category.name, description: category.description, services: category.services.map((id) => names.get(id)) })));
    assert.deepEqual(categories.map(({ name, services }) => [name, services]), [['Necessary', ['Consent', 'Vimeo']], ['Statistics', ['Example Counter']], ['Marketing', ['Example Pixel', 'YouTube']]]);
  });

  test('shows each service with its provider and its country, a link to its privacy policy that names it, its purpose, the hosts it reaches and its transfers', () => {
    const [consent, vimeo, counted, , youtube] = [...page.querySelectorAll('.konzilo-declaration-service')].map(serviceOf);
    assert.deepEqual(Object.keys(counted.facts), ['Provider', 'Purpose', 'Hosts it reaches', 'Transfers outside the EU and EEA']);
    assert.deepEqual(counted.facts, {
      Provider: 'Example Counting Inc., United States. Privacy policy of Example Counting Inc.',
      Purpose: 'Counts the visits to each page.',
      'Hosts it reaches': ['cdn.counting.example.net', 'collect.counting.example.net'],
      'Transfers outside the EU and EEA': ['United States, on an adequacy decision or standard contractual clauses'],
    });
    const link = [...page.querySelectorAll('.konzilo-declaration-service')][2].querySelector('dd a');
    assert.equal(link.getAttribute('href'), 'https://counting.example.net/privacy');
    assert.equal(youtube.facts.Provider, 'Google Ireland Limited, Ireland. Privacy policy of Google Ireland Limited');
    assert.deepEqual(youtube.facts['Hosts it reaches'], ['www.youtube-nocookie.com']);
    assert.equal(consent.facts.Provider, 'This site. Privacy policy');
    assert.equal(consent.facts['Hosts it reaches'], 'None beyond this site');
    assert.equal(consent.facts['Transfers outside the EU and EEA'], 'None');
    assert.deepEqual(vimeo.facts['Transfers outside the EU and EEA'], ['United States, on an adequacy decision or standard contractual clauses']);
  });

  test('shows for a necessary service why it is necessary, a departure\'s reason among them, and for no other', () => {
    const [consent, vimeo, counted, , youtube] = [...page.querySelectorAll('.konzilo-declaration-service')].map(serviceOf);
    assert.match(consent.facts['Why it is needed'], /\S/);
    assert.equal(vimeo.facts['Why it is needed'], 'Our courses are Vimeo videos.');
    assert.equal(counted.facts['Why it is needed'], undefined);
    assert.equal(youtube.facts['Why it is needed'], undefined);
  });

  test('shows what each service stores in a table with headers, its name, kind, lifetime, party and the domain it is on, or says that its provider names nothing', () => {
    const [consent, vimeo, counted, , youtube] = [...page.querySelectorAll('.konzilo-declaration-service')].map(serviceOf);
    const headers = ['Name', 'Kind', 'Lifetime', 'Party', 'Domain'];
    assert.deepEqual(consent.storage, { caption: 'What Consent stores in your browser', headers, rows: [['konzilo-consent', 'local storage', '12 months', 'First party', 'www.example.com']] });
    assert.deepEqual(counted.storage, { caption: 'What Example Counter stores in your browser', headers, rows: [['_count', 'cookie', '13 months', 'First party', 'www.example.com'], ['_count_session', 'cookie', 'until you close the browser', 'First party', 'www.example.com']] });
    assert.deepEqual(vimeo.storage.rows.find(([name]) => name === '__cf_bm'), ['__cf_bm', 'cookie', '30 minutes', 'Third party', 'player.vimeo.com']);
    assert.equal(youtube.storage, 'Its provider names nothing it stores.');
    for (const header of page.querySelectorAll('.konzilo-declaration thead th')) assert.equal(header.getAttribute('scope'), 'col');
  });

  test('shows each departure in plain words with its reason, and the day the registry last changed', () => {
    const departures = page.querySelector('.konzilo-declaration-departures');
    assert.equal(text(page.getElementById(departures.getAttribute('aria-labelledby'))), 'Departures from the rules on consent');
    assert.deepEqual([...departures.querySelectorAll('li')].map(text), ['Vimeo counts as necessary on this site, so it is always on, without your consent. The reason: Our courses are Vimeo videos.']);
    const revised = page.querySelector('.konzilo-declaration-revised > time');
    assert.equal(revised.getAttribute('datetime'), site.registry().revised);
    const [year, month, day] = site.registry().revised.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    assert.equal(text(revised.parentElement), `Last changed ${date}.`);
  });

  test('its headings follow the page\'s own: its parts at the second level, a category at the third and a service at the fourth', () => {
    const outline = [...page.querySelectorAll('main h1, main h2, main h3, main h4')].map((heading) => `${heading.tagName} ${text(heading)}`);
    assert.deepEqual(outline, [
      'H1 Cookie policy',
      'H2 Your consent',
      'H2 Services and what they store',
      'H3 Necessary', 'H4 Consent', 'H4 Vimeo',
      'H3 Statistics', 'H4 Example Counter',
      'H3 Marketing', 'H4 Example Pixel', 'H4 YouTube',
      'H2 Departures from the rules on consent',
    ]);
  });

  test('without the site\'s script, the visitor\'s own part says that it needs it, and shows no consent and no button', () => {
    const own = page.querySelector('.konzilo-declaration-consent');
    const shown = [...own.querySelectorAll(':scope > *, :scope > div > *')].filter((element) => !element.closest('[hidden]') && element.tagName !== 'DIV').map((element) => `${element.tagName} ${text(element)}`);
    assert.deepEqual(shown, ['H2 Your consent', 'P Your own choice shows here only when your browser runs the site\'s script.']);
    assert.deepEqual([...own.querySelectorAll('button')].map((button) => [text(button), button.type, button.dataset.konziloConsentAction, button.hidden]), [
      ['Change privacy settings', 'button', 'change', true],
      ['Withdraw consent', 'button', 'withdraw', true],
    ]);
  });

  test('another page shows no declaration', () => {
    assert.equal(site.page('videos').querySelector('.konzilo-declaration'), null);
    assert.equal(site.page('privacy').querySelector('.konzilo-declaration'), null);
  });
});

// A visit to a built page under jsdom, at its address on the public host:
// the page's script file run on it, after `stored` is put into the
// consent's own storage item. Gives the window, the consent signal, and
// whether the page asked to be reloaded.
function visit(site, slug, { stored } = {}) {
  const reloads = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (/navigation/.test(error.message)) reloads.push(error.message);
    else throw error;
  });
  const { window } = new JSDOM(site.output(`${slug}/index.html`), { url: `${ORIGIN}/${slug}/`, runScripts: 'outside-only', virtualConsole });
  if (stored !== undefined) window.localStorage.setItem('konzilo-consent', JSON.stringify(stored));
  const timers = [];
  window.setTimeout = (callback) => timers.push(callback);
  window.eval(site.output(window.document.querySelector('script[src]').getAttribute('src').slice(1)));
  const kept = () => JSON.parse(window.localStorage.getItem('konzilo-consent'));
  const later = () => timers.splice(0).forEach((callback) => callback());
  return { window, document: window.document, signal: window.konziloConsent, reloads, kept, later };
}

// What the visitor's own part of the declaration shows: its sentence, or
// the consent ID, the time and what the choice allows; and its buttons.
function ownConsent(visited) {
  const own = visited.document.querySelector('.konzilo-declaration-consent');
  const visible = (element) => !element.closest('[hidden]');
  const sentences = [...own.querySelectorAll(':scope > p')].filter(visible).map(text);
  const choice = own.querySelector('.konzilo-declaration-choice');
  return {
    sentences,
    choice: visible(choice)
      ? {
          id: text(choice.querySelector('[data-konzilo-declaration-id]')),
          time: choice.querySelector('time').getAttribute('datetime'),
          allows: [...choice.querySelectorAll('li')].filter(visible).map(text),
        }
      : null,
    buttons: [...own.querySelectorAll('button')].filter(visible).map(text),
  };
}

describe('the visitor\'s own consent on the cookie policy page, with the site\'s script', () => {
  let site;

  before(() => {
    site = build();
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('before a choice says that there is none, beside the buttons that change and withdraw it', () => {
    assert.deepEqual(ownConsent(visit(site, 'cookies')), {
      sentences: ['You have made no choice that holds on this site.'],
      choice: null,
      buttons: ['Change privacy settings', 'Withdraw consent'],
    });
  });

  test('after Accept all shows the browser\'s consent ID, when it was given and every category it allows, at once and on the next visit', () => {
    const visited = visit(site, 'cookies');
    visited.document.querySelector('.konzilo-consent-banner button[data-konzilo-consent-action="accept"]').click();
    const { id, time } = visited.kept();
    const shown = { sentences: [], choice: { id, time, allows: ['Necessary', 'Statistics', 'Marketing'] }, buttons: ['Change privacy settings', 'Withdraw consent'] };
    assert.deepEqual(ownConsent(visited), shown);
    const given = visited.document.querySelector('.konzilo-declaration-choice time');
    assert.match(text(given), /\d{4}/);
    assert.deepEqual(ownConsent(visit(site, 'cookies', { stored: visited.kept() })), shown);
  });

  test('after Reject optional shows the necessary alone; a service allowed on its own, as a placeholder allows it, shows by its name', () => {
    const visited = visit(site, 'cookies');
    visited.document.querySelector('.konzilo-consent-banner button[data-konzilo-consent-action="reject"]').click();
    assert.deepEqual(ownConsent(visited).choice.allows, ['Necessary']);
    visited.signal.allow('youtube');
    assert.deepEqual(ownConsent(visited).choice.allows, ['Necessary', 'YouTube']);
    visited.signal.allow('counter');
    assert.deepEqual(ownConsent(visited).choice.allows, ['Necessary', 'Statistics', 'YouTube']);
    visited.signal.allow('pixel');
    assert.deepEqual(ownConsent(visited).choice.allows, ['Necessary', 'Statistics', 'Marketing']);
  });

  test('Withdraw consent there rejects every optional service, keeps the consent ID and reloads, as the footer\'s does', () => {
    const visited = visit(site, 'cookies');
    visited.signal.allow('youtube');
    const { id } = visited.kept();
    visited.document.querySelector('.konzilo-declaration button[data-konzilo-consent-action="withdraw"]').click();
    assert.deepEqual(visited.kept().services, { consent: true, vimeo: true, counter: false, pixel: false, youtube: false });
    assert.equal(visited.kept().id, id);
    visited.later();
    assert.equal(visited.reloads.length, 1);
    assert.deepEqual(ownConsent(visit(site, 'cookies', { stored: visited.kept() })).choice.allows, ['Necessary']);
  });
});

describe('the cookie policy page of a site in sv_SE', () => {
  let site;
  let page;

  before(() => {
    site = build({ language: 'sv_SE' });
    page = site.page('cookies');
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('shows the registry\'s texts in Swedish, and every word of the core\'s own in Swedish too', () => {
    const registry = site.registry();
    const outline = [...page.querySelectorAll('.konzilo-declaration h2, .konzilo-declaration h3')].map(text);
    assert.deepEqual(outline, ['Ditt samtycke', 'Tjänster och vad de lagrar', ...registry.categories.map((category) => category.name), 'Avsteg från reglerna om samtycke']);
    assert.equal(registry.categories[0].name, 'Nödvändiga');
    const [, , counted, , youtube] = [...page.querySelectorAll('.konzilo-declaration-service')].map(serviceOf);
    assert.deepEqual(counted.facts, {
      Leverantör: 'Example Counting Inc., USA. Integritetspolicy för Example Counting Inc.',
      Syfte: 'Counts the visits to each page.',
      'Värdar den når': ['cdn.counting.example.net', 'collect.counting.example.net'],
      'Överföringar utanför EU och EES': ['USA, med stöd av ett beslut om adekvat skyddsnivå eller standardavtalsklausuler'],
    });
    assert.deepEqual(counted.storage, {
      caption: 'Vad Example Counter lagrar i din webbläsare',
      headers: ['Namn', 'Typ', 'Livslängd', 'Part', 'Domän'],
      rows: [['_count', 'kaka', '13 månader', 'Förstapart', 'www.example.com'], ['_count_session', 'kaka', 'tills du stänger webbläsaren', 'Förstapart', 'www.example.com']],
    });
    assert.equal(youtube.storage, 'Leverantören anger inget som den lagrar.');
    assert.equal(youtube.facts.Syfte, registry.services.find((service) => service.id === 'youtube').purpose);
    assert.deepEqual([...page.querySelectorAll('.konzilo-declaration-departures li')].map(text), ['Vimeo räknas som nödvändig på den här webbplatsen och är därför alltid på, utan ditt samtycke. Skälet: Our courses are Vimeo videos.']);
    assert.match(text(page.querySelector('.konzilo-declaration-revised')), /^Senast ändrad \d{1,2} [a-zåäö]+ \d{4}\.$/);
    assert.equal(text(page.querySelector('.konzilo-declaration-no-script')), 'Ditt eget val visas här bara när din webbläsare kör webbplatsens skript.');
    assert.deepEqual([...page.querySelectorAll('.konzilo-declaration button')].map(text), ['Ändra integritetsinställningar', 'Återkalla samtycke']);
  });

  test('with the site\'s script, says in Swedish that no choice holds, and after Accept all names the categories it allows in Swedish', () => {
    const visited = visit(site, 'cookies');
    assert.deepEqual(ownConsent(visited).sentences, ['Du har inget val som gäller på den här webbplatsen.']);
    visited.document.querySelector('.konzilo-consent-banner button[data-konzilo-consent-action="accept"]').click();
    assert.deepEqual(ownConsent(visited).choice.allows, site.registry().categories.map((category) => category.name));
  });
});

describe('the cookie policy page of a site whose registry asks no consent', () => {
  let site;
  let page;

  before(() => {
    site = build({ posts: [privacy, cookies], settings: { ...siteSettings, services: [] }, consent: null });
    page = site.page('cookies');
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('says so in the visitor\'s own part, with no button, and declares the necessary services, the consent\'s own linking to the site\'s privacy policy', () => {
    const own = page.querySelector('.konzilo-declaration-consent');
    assert.deepEqual([...own.children].map(text), ['Your consent', 'This site asks for no consent, since every service it uses counts as necessary.']);
    assert.equal(page.querySelectorAll('.konzilo-declaration button').length, 0);
    assert.deepEqual([...page.querySelectorAll('.konzilo-declaration-category h3')].map(text), ['Necessary']);
    const link = page.querySelector('.konzilo-declaration-service dd a');
    assert.deepEqual([text(link), link.getAttribute('href')], ['Privacy policy', '/privacy/']);
    assert.equal(page.querySelector('.konzilo-declaration-departures'), null);
  });
});

test('a transfer names its country, or says that its provider names none, and each safeguard, or that its provider documents none', () => {
  const service = (id, transfers) => ({ id, name: id, category: 'marketing', provider: { name: 'P', country: 'SE', privacyPolicy: 'https://p.example/' }, purpose: 'A purpose.', storage: [], hosts: {}, transfers, necessity: null });
  const registry = {
    revision: '0123456789abcdef',
    revised: '2026-01-05',
    categories: [{ id: 'marketing', name: 'Marketing', description: 'D.', services: ['a', 'b', 'c'] }],
    services: [
      service('a', [{ country: null, safeguards: ['adequacy', 'scc'] }]),
      service('b', [{ country: 'US', safeguards: [] }]),
      service('c', [{ country: 'IN', safeguards: ['bcr'] }, { country: 'CH', safeguards: ['adequacy'] }]),
    ],
    departures: [{ departure: 'tagManagerBeforeConsent', reason: 'Its tags wait for consent themselves.' }],
    texts: { footer: { change: 'Change', withdraw: 'Withdraw' } },
  };
  const transfers = (language) => declarationView({ registry, language }).categories[0].services.map((one) => one.transfers);
  assert.deepEqual(transfers('en-GB'), [
    ['A country its provider does not name, on an adequacy decision or standard contractual clauses'],
    ['United States, on no safeguard its provider documents'],
    ['India, on binding corporate rules', 'Switzerland, on an adequacy decision'],
  ]);
  assert.deepEqual(transfers('sv-SE'), [
    ['Ett land som leverantören inte namnger, med stöd av ett beslut om adekvat skyddsnivå eller standardavtalsklausuler'],
    ['USA, utan någon skyddsåtgärd som leverantören redovisar'],
    ['Indien, med stöd av bindande företagsbestämmelser', 'Schweiz, med stöd av ett beslut om adekvat skyddsnivå'],
  ]);
  const english = declarationView({ registry, language: 'en-GB' });
  assert.deepEqual(english.departures, [{ text: 'The site\'s tag manager loads before you make a choice, and the tags it loads follow your choice.', reason: 'Its tags wait for consent themselves.' }]);
  assert.deepEqual(english.revised, { before: 'Last changed ', date: '5 January 2026', datetime: '2026-01-05', after: '.' });
  assert.equal(declarationView({ registry, language: 'en-US' }).revised.date, 'January 5, 2026');
});

test('the declaration is on the page at the cookie policy\'s address, below the site\'s base, with or without its last slash, and on no page while none is chosen', () => {
  const settings = { legalPages: { privacyPolicy: { title: 'Privacy', url: '/pages/privacy/' }, cookiePolicy: { title: 'Cookies', url: '/pages/cookies/' } } };
  assert.equal(isCookiePolicy('/pages/cookies/', settings), true);
  assert.equal(isCookiePolicy('/pages/cookies', settings), true);
  assert.equal(isCookiePolicy('/pages/privacy/', settings), false);
  assert.equal(isCookiePolicy('/preview/pages/cookies/', settings, '/preview/'), true);
  assert.equal(isCookiePolicy('/pages/cookies/', settings, '/preview/'), false);
  assert.equal(isCookiePolicy('/pages/k%C3%A4kor/', { legalPages: { cookiePolicy: { title: 'Kakor', url: '/pages/käkor/' } } }), true);
  assert.equal(isCookiePolicy('/pages/cookies/', { legalPages: {} }), false);
  assert.equal(isCookiePolicy('/pages/cookies/', undefined), false);
});

test('a build below a base of its own, as a preview is, shows the declaration on the cookie policy page below it, and on no other', () => {
  const site = build({ base: '/preview/' });
  try {
    assert.ok(site.page('cookies').querySelector('main > .konzilo-declaration'));
    assert.equal(site.page('videos').querySelector('.konzilo-declaration'), null);
  } finally {
    rmSync(site.repository, { recursive: true, force: true });
  }
});
