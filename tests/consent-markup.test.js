// The consent's markup as pure functions (src/consent/markup.js), outside
// Astro: a registry, the consent texts, the legal pages and the page's
// language in, an escaped HTML string out, with the classes and data
// attributes docs/site-design.md names. A page made of nothing but that
// markup, with the client (src/consent/client.js) run on it under jsdom,
// works as a Konzilo page does. And the folder imports nothing outside
// itself, so a site Konzilo does not build can copy it.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { consentClient, cookieDeclaration, embedPanels } from '../src/consent/client.js';
import { consentControlsMarkup, consentMarkup, cookieDeclarationMarkup, escape } from '../src/consent/markup.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const { CookieJar, JSDOM, VirtualConsole } = createRequire(join(core, 'package.json'))('jsdom');

const none = { scripts: [], frames: [], connections: [], images: [], styles: [], fonts: [] };

// A registry as another catalogue maps onto the format: a necessary
// service of the site's own, a statistics service and an embed service.
const registry = {
  revision: '0123456789abcdef',
  revised: '2026-11-01',
  categories: [
    { id: 'necessary', name: 'Necessary', description: 'Always on.', services: ['consent'] },
    { id: 'statistics', name: 'Statistics', description: 'Counting visits.', services: ['counter'] },
    { id: 'marketing', name: 'Marketing', description: 'Others\' purposes.', services: ['video'] },
  ],
  services: [
    { id: 'consent', name: 'Consent', category: 'necessary', provider: null, purpose: 'Remembers your choice.', storage: [{ name: 'konzilo-consent', kind: 'localStorage', lifetime: 'P12M', party: 'first' }], hosts: none, transfers: [], necessity: 'It keeps your choice.' },
    { id: 'counter', name: 'Counter <b>&</b> "Co"', category: 'statistics', provider: { name: 'Count AB', country: 'SE', privacyPolicy: 'https://count.example.com/privacy' }, purpose: 'Counts.', storage: [{ name: '_count', kind: 'cookie', lifetime: 'P13M', party: 'first' }], hosts: { ...none, scripts: ['count.example.com'] }, transfers: [], necessity: null },
    { id: 'video', name: 'Video', category: 'marketing', provider: { name: 'Video Inc.', country: 'US', privacyPolicy: 'https://video.example.net/privacy' }, purpose: 'Plays videos.', storage: [], hosts: { ...none, frames: ['player.video.example.net'] }, transfers: [{ country: 'US', safeguards: ['scc'] }], necessity: null },
  ],
  departures: [],
  texts: {
    banner: { title: 'Your privacy', text: 'We ask first.', accept: 'Accept all', reject: 'Reject optional', customise: 'Customise' },
    dialog: { title: 'Privacy settings', introduction: 'Choose.', accept: 'Accept all', reject: 'Reject optional', save: 'Save my choices', close: 'Close' },
    footer: { change: 'Change privacy settings', withdraw: 'Withdraw consent' },
    notice: { withdrawn: 'Your consents have been withdrawn. The page will reload.' },
    placeholder: { question: 'Allow {service} to play this content?', button: 'Allow and play' },
  },
};

const legalPages = { privacyPolicy: { title: 'Privacy', href: 'https://www.example.com/privacy/' }, cookiePolicy: { title: 'Cookies', href: 'https://www.example.com/cookies/' } };
const input = { registry, legalPages, language: 'en-GB' };

const parse = (html) => new JSDOM(`<!doctype html><html><body>${html}</body></html>`).window.document;
const text = (element) => element.textContent.replace(/\s+/g, ' ').trim();

describe('the consent\'s markup functions', () => {
  test('escape every text and attribute, a service\'s name among them', () => {
    assert.equal(escape('<a href="x">\'&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
    const html = consentMarkup(input);
    assert.doesNotMatch(html, /<b>/);
    assert.equal(parse(html).querySelector('#konzilo-consent-service-counter').textContent, 'Counter <b>&</b> "Co"');
  });

  test('give the banner, hidden, the dialog with a row per category and a switch per optional service, and the registry the client reads', () => {
    const page = parse(consentMarkup(input));
    const root = page.querySelector('.konzilo-consent');
    assert.deepEqual(JSON.parse(root.dataset.konziloConsent), {
      revision: '0123456789abcdef',
      categories: { necessary: ['consent'], statistics: ['counter'], marketing: ['video'] },
      storage: { counter: [{ name: '_count', kind: 'cookie' }] },
      language: 'en-GB',
    });
    const banner = root.querySelector('.konzilo-consent-banner');
    assert.equal(banner.hidden, true);
    assert.deepEqual([...banner.querySelectorAll('a')].map((link) => [text(link), link.href]), [['Privacy', 'https://www.example.com/privacy/'], ['Cookies', 'https://www.example.com/cookies/']]);
    assert.deepEqual([...banner.querySelectorAll('button')].map((button) => [button.className, button.dataset.konziloConsentAction, text(button)]), [
      ['konzilo-consent-choice', 'accept', 'Accept all'],
      ['konzilo-consent-choice', 'reject', 'Reject optional'],
      ['konzilo-consent-secondary', 'customise', 'Customise'],
    ]);
    const dialog = root.querySelector('dialog.konzilo-consent-dialog');
    assert.deepEqual([...dialog.querySelectorAll('input[data-konzilo-consent-category]')].map((input) => [input.dataset.konziloConsentCategory, input.checked, input.disabled]), [['necessary', true, true], ['statistics', false, false], ['marketing', false, false]]);
    assert.deepEqual([...dialog.querySelectorAll('input[data-konzilo-consent-service]')].map((input) => [input.dataset.konziloConsentService, input.dataset.konziloConsentIn]), [['counter', 'statistics'], ['video', 'marketing']]);
    assert.deepEqual([...dialog.querySelectorAll('.konzilo-consent-count')].map(text), ['1 service', '1 service', '1 service']);
  });

  test('give a placeholder\'s template to each optional service whose content shows in a frame, linking to the cookie policy', () => {
    const page = parse(consentMarkup(input));
    const templates = [...page.querySelectorAll('[data-konzilo-consent] > template[data-konzilo-consent-placeholder]')];
    assert.deepEqual(templates.map((template) => template.dataset.konziloConsentPlaceholder), ['video']);
    const content = templates[0].content;
    assert.equal(text(content.querySelector('.konzilo-embed-question')), 'Allow Video to play this content?');
    assert.equal(text(content.querySelector('.konzilo-embed-storage')), 'Video may store data in your browser, and Video Inc. (United States) receives data about your visit, which may be processed outside the EU and EEA. Cookies');
    assert.equal(content.querySelector('.konzilo-embed-storage a').getAttribute('href'), 'https://www.example.com/cookies/');
  });

  test('take the page\'s own texts and categories\' words, and the core\'s words in its language', () => {
    const texts = { ...registry.texts, banner: { ...registry.texts.banner, title: 'Din integritet' }, categories: { statistics: { name: 'Statistik', description: 'Räkning.' } } };
    const page = parse(consentMarkup({ ...input, texts, language: 'sv-SE' }));
    assert.equal(text(page.querySelector('.konzilo-consent-banner h2')), 'Din integritet');
    assert.deepEqual([...page.querySelectorAll('.konzilo-consent-category-name')].map(text), ['Necessary', 'Statistik', 'Marketing']);
    assert.equal(text(page.querySelector('.konzilo-consent-always')), 'Alltid på');
    assert.equal(JSON.parse(page.querySelector('[data-konzilo-consent]').dataset.konziloConsent).language, 'sv-SE');
  });

  test('give a registry that asks no consent no banner, no dialog and no buttons, and still the registry', () => {
    const necessary = { ...registry, categories: [registry.categories[0]], services: [registry.services[0]] };
    const page = parse(consentMarkup({ ...input, registry: necessary }) + consentControlsMarkup({ ...input, registry: necessary }));
    assert.equal(page.querySelector('.konzilo-consent-banner'), null);
    assert.equal(page.querySelector('dialog'), null);
    assert.equal(page.querySelectorAll('button').length, 0);
    assert.deepEqual(JSON.parse(page.querySelector('[data-konzilo-consent]').dataset.konziloConsent).categories, { necessary: ['consent'] });
  });

  test('give the footer controls with the links, the buttons hidden, either left out, and nothing when both are', () => {
    const page = parse(consentControlsMarkup(input));
    assert.deepEqual([...page.querySelectorAll('.konzilo-consent-controls a')].map(text), ['Privacy', 'Cookies']);
    assert.deepEqual([...page.querySelectorAll('.konzilo-consent-controls button')].map((button) => [button.dataset.konziloConsentAction, button.hidden]), [['change', true], ['withdraw', true]]);
    assert.equal(parse(consentControlsMarkup(input, { links: false })).querySelector('a'), null);
    assert.equal(parse(consentControlsMarkup(input, { buttons: false })).querySelector('button'), null);
    assert.equal(consentControlsMarkup(input, { links: false, buttons: false }), '');
    assert.equal(consentControlsMarkup({ ...input, legalPages: {} }, { buttons: false }), '');
  });

  test('give the cookie declaration at the level asked for, with the consent ID only where records are sent', () => {
    const recorded = parse(cookieDeclarationMarkup(input, { records: '/_konzilo/consent' }));
    assert.ok(recorded.querySelector('[data-konzilo-declaration-id]'));
    const unrecorded = parse(cookieDeclarationMarkup(input, { level: 3 }));
    assert.equal(unrecorded.querySelector('[data-konzilo-declaration-id]'), null);
    assert.deepEqual([...unrecorded.querySelectorAll('.konzilo-declaration-choice dt')].map(text), ['Given', 'Allows']);
    assert.deepEqual([...unrecorded.querySelectorAll('h3, h4, h5')].map((heading) => `${heading.tagName} ${text(heading)}`).slice(0, 4), ['H3 Your consent', 'H3 Services and what they store', 'H4 Necessary', 'H5 Consent']);
    const consent = unrecorded.querySelector('#konzilo-declaration-service-consent dd a');
    assert.equal(consent.getAttribute('href'), 'https://www.example.com/privacy/');
  });
});

// A page made of nothing but the markup, the declaration's without
// records, with the client run on it as a site that is not Konzilo's runs
// it.
function visit({ stored } = {}) {
  const html = `<!doctype html><html lang="en-GB"><head><title>A page</title></head><body>${consentMarkup(input)}<main>${cookieDeclarationMarkup(input)}<figure class="konzilo-embed" data-embed="video"><a href="https://video.example.net/1">https://video.example.net/1</a><template><iframe src="https://player.video.example.net/1" title="Video"></iframe></template></figure></main><footer>${consentControlsMarkup(input)}</footer></body></html>`;
  const { window } = new JSDOM(html, { url: 'https://www.example.com/cookies/', runScripts: 'outside-only' });
  if (stored) window.localStorage.setItem('konzilo-consent', JSON.stringify(stored));
  window.eval(`(${consentClient})({ records: null });\n(${cookieDeclaration})();\n(${embedPanels})();`);
  return window;
}

describe('where the markup names each stored item\'s domain', () => {
  const stored = (storage) => ({ ...registry, services: registry.services.map((service) => (service.id === 'counter' ? { ...service, storage } : service)) });
  const items = [
    { name: 'own', kind: 'cookie', lifetime: 'P1D', party: 'first', domain: null },
    { name: 'shared', kind: 'cookie', lifetime: 'P1D', party: 'first', domain: 'example.com' },
    { name: 'theirs', kind: 'cookie', lifetime: 'P1D', party: 'third', domain: 'count.example.com' },
    { name: 'unnamed', kind: 'cookie', lifetime: 'P1D', party: 'third', domain: null },
  ];

  test('the dialog and the declaration name the page\'s host, a shared domain with the sites below it, and the provider\'s', () => {
    const given = { ...input, registry: stored(items), host: 'www.example.com' };
    const dialog = parse(consentMarkup(given));
    assert.deepEqual([...dialog.querySelector('#konzilo-consent-service-counter').closest('.konzilo-consent-service').querySelectorAll('.konzilo-consent-facts li')].map(text), [
      'own: cookie, 1 day, on www.example.com',
      'shared: cookie, 1 day, on example.com and the sites below it',
      'theirs: cookie, 1 day, on count.example.com',
      'unnamed: cookie, 1 day, on its provider\'s domain',
    ]);
    const declaration = parse(cookieDeclarationMarkup(given));
    const rows = [...declaration.querySelectorAll('#konzilo-declaration-service-counter tbody tr')].map((row) => text(row.lastElementChild));
    assert.deepEqual(rows, ['www.example.com', 'example.com and the sites below it', 'count.example.com', 'Its provider\'s domain']);
  });

  test('without a host, the page\'s own is named by the client from the page\'s address, and the words for this site until it runs', () => {
    const html = cookieDeclarationMarkup({ ...input, registry: stored(items) });
    assert.equal(text(parse(html).querySelector('[data-konzilo-consent-host]')), 'This site');
    const { window } = new JSDOM(`<!doctype html><html><body>${consentMarkup({ ...input, registry: stored(items) })}${html}</body></html>`, { url: 'https://investors.example.com/cookies/', runScripts: 'outside-only' });
    window.eval(`(${consentClient})({});`);
    // The consent's own item and the counter's own, in the dialog and in the declaration.
    assert.deepEqual([...window.document.querySelectorAll('[data-konzilo-consent-host]')].map(text), Array(4).fill('investors.example.com'));
  });

  test('a registry with no domain on an item names the page\'s host for one of its own, and its provider\'s domain in words for a third party\'s', () => {
    const page = parse(cookieDeclarationMarkup({ ...input, registry: stored(items.map(({ domain, ...item }) => item)), host: 'www.example.com' }));
    assert.deepEqual([...page.querySelectorAll('#konzilo-declaration-service-counter tbody tr')].map((row) => text(row.lastElementChild)), ['www.example.com', 'www.example.com', 'Its provider\'s domain', 'Its provider\'s domain']);
  });
});

describe('on a legal page', () => {
  test('the banner stays hidden, as the markup, the client\'s option or the page\'s own meta says, and the footer\'s buttons show', () => {
    const page = (head, html, options = {}) => {
      const { window } = new JSDOM(`<!doctype html><html><head>${head}</head><body>${html}${consentControlsMarkup(input)}</body></html>`, { url: 'https://www.example.com/privacy/', runScripts: 'outside-only' });
      window.eval(`(${consentClient})(${JSON.stringify(options)});`);
      return window.document;
    };
    const banner = (document) => document.querySelector('.konzilo-consent-banner').hidden;
    assert.equal(banner(page('', consentMarkup(input))), false);
    assert.equal(banner(page('', consentMarkup(input, { legalPage: true }))), true);
    assert.equal(banner(page('', consentMarkup(input), { legalPage: true })), true);
    const marked = page('<meta name="konzilo-consent" content="legal-page">', consentMarkup(input));
    assert.equal(banner(marked), true);
    assert.deepEqual([...marked.querySelectorAll('.konzilo-consent-controls button')].map((button) => button.hidden), [false, false]);
  });
});

describe('a page made of the markup functions alone, with the client', () => {
  test('shows the banner and the footer\'s buttons, asks in the placeholder, and allows the necessary alone', () => {
    const window = visit();
    const { document } = window;
    assert.equal(document.querySelector('.konzilo-consent-banner').hidden, false);
    assert.deepEqual([...document.querySelectorAll('footer button')].map((button) => button.hidden), [false, false]);
    assert.equal(text(document.querySelector('figure.konzilo-embed .konzilo-embed-question')), 'Allow Video to play this content?');
    assert.deepEqual(['consent', 'counter', 'video'].map(window.konziloConsent.service), [true, false, false]);
  });

  test('a choice there shows in the declaration when it was made and what it allows, without a consent ID, and sends no record', () => {
    const window = visit();
    const { document } = window;
    window.fetch = () => assert.fail('no record is sent');
    document.querySelector('.konzilo-consent-banner [data-konzilo-consent-action="accept"]').click();
    const choice = document.querySelector('.konzilo-declaration-choice');
    assert.equal(choice.hidden, false);
    assert.equal(choice.querySelector('[data-konzilo-declaration-id]'), null);
    assert.equal(choice.querySelector('time').getAttribute('datetime'), JSON.parse(window.localStorage.getItem('konzilo-consent')).time);
    assert.deepEqual([...choice.querySelectorAll('li')].filter((item) => !item.hidden).map(text), ['Necessary', 'Statistics', 'Marketing']);
    assert.equal(document.querySelector('figure.konzilo-embed > iframe').getAttribute('src'), 'https://player.video.example.net/1');
    assert.equal(JSON.parse(window.localStorage.getItem('konzilo-consent')).unsent, undefined);
    assert.equal(JSON.parse(window.localStorage.getItem('konzilo-consent')).id, undefined, 'no consent ID without records');
  });

  test('a choice with a consent ID, made where records are sent, holds there without the consent ID, and the next choice keeps none', () => {
    const id = '0b5c8e2a-4d1f-4c3b-9a7e-6f2d1c0b9a8e';
    const window = visit({ stored: { id, time: new Date(Date.now() - 60_000).toISOString(), revision: registry.revision, categories: { necessary: true, statistics: true, marketing: false }, services: { consent: true, counter: true, video: false } } });
    assert.equal(window.document.querySelector('.konzilo-consent-banner').hidden, true);
    assert.equal(window.konziloConsent.service('counter'), true);
    assert.equal(window.konziloConsent.choice().id, undefined);
    window.konziloConsent.allow('video');
    assert.equal(JSON.parse(window.localStorage.getItem('konzilo-consent')).id, undefined);
  });
});

describe('a choice kept on a domain for every site below it', () => {
  // Two sites below example.com, in one browser, whose counter keeps a
  // cookie of the site's own and the video a local storage item; each
  // page sends records, as the public site's do.
  const withStorage = { ...registry, services: registry.services.map((service) => (service.id === 'video' ? { ...service, storage: [{ name: 'video-volume', kind: 'localStorage', lifetime: 'persistent', party: 'first' }] } : service)) };
  const shared = { ...input, registry: withStorage };
  const browser = () => new CookieJar();
  const open = (jar, url, { stored, records = '/_konzilo/consent' } = {}) => {
    const html = `<!doctype html><html lang="en-GB"><head><title>A page</title></head><body>${consentMarkup(shared)}<footer>${consentControlsMarkup(shared)}</footer></body></html>`;
    // jsdom does not navigate: a reload is an error it reports, and nothing more.
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => {
      if (!/navigation/.test(error.message)) throw error;
    });
    const { window } = new JSDOM(html, { url, cookieJar: jar, runScripts: 'outside-only', virtualConsole });
    if (stored) window.localStorage.setItem('konzilo-consent', JSON.stringify(stored));
    window.fetch = () => new Promise(() => {});
    window.setTimeout = (callback) => callback();
    window.eval(`(${consentClient})(${JSON.stringify({ domain: 'example.com', records })});`);
    return window;
  };
  const cookieOf = (window) => {
    const pair = window.document.cookie.split('; ').find((part) => part.startsWith('konzilo-consent='));
    return pair ? JSON.parse(decodeURIComponent(pair.slice('konzilo-consent='.length))) : null;
  };

  test('a choice on one site is the choice on another below the domain, in a cookie on it, and the records wait in the origin\'s local storage', () => {
    const jar = browser();
    const first = open(jar, 'https://www.example.com/');
    first.document.querySelector('.konzilo-consent-banner [data-konzilo-consent-action="reject"]').click();
    const kept = cookieOf(first);
    assert.deepEqual(Object.keys(kept).sort(), ['categories', 'id', 'revision', 'services', 'time']);
    assert.deepEqual(kept.services, { consent: true, counter: false, video: false });
    assert.equal(JSON.parse(first.localStorage.getItem('konzilo-consent')).unsent.length, 1, 'the record waits in local storage, not in the cookie');

    const cookies = jar.getCookiesSync('https://investors.example.com/');
    const consent = cookies.find((one) => one.key === 'konzilo-consent');
    assert.deepEqual([consent.domain, consent.path, consent.secure, consent.sameSite, consent.httpOnly], ['example.com', '/', true, 'lax', false]);
    const months = (consent.expires.getTime() - Date.parse(kept.time)) / (24 * 3600 * 1000);
    assert.ok(months > 364 && months < 367, `kept ${months} days`);

    const other = open(jar, 'https://investors.example.com/');
    assert.equal(other.document.querySelector('.konzilo-consent-banner').hidden, true);
    assert.deepEqual(JSON.parse(JSON.stringify(other.konziloConsent.choice())), kept);
    other.konziloConsent.allow('video');
    assert.equal(cookieOf(other).id, kept.id, 'one consent ID for both');
    assert.equal(open(jar, 'https://www.example.com/').konziloConsent.service('video'), true);
  });

  test('a choice kept in local storage under the other rule is not carried over: the visitor is asked once more', () => {
    const stored = { id: '0b5c8e2a-4d1f-4c3b-9a7e-6f2d1c0b9a8e', time: new Date().toISOString(), revision: registry.revision, categories: { necessary: true, statistics: true, marketing: true }, services: { consent: true, counter: true, video: true } };
    const window = open(browser(), 'https://www.example.com/', { stored });
    assert.equal(window.document.querySelector('.konzilo-consent-banner').hidden, false);
    assert.equal(window.konziloConsent.choice(), null);
  });

  test('withdrawing on one site removes cookies on the shared domain, and the other site removes what it stored at its next page view', () => {
    const jar = browser();
    const first = open(jar, 'https://www.example.com/');
    first.document.querySelector('.konzilo-consent-banner [data-konzilo-consent-action="accept"]').click();
    first.document.cookie = '_count=1; Domain=example.com; Path=/';
    const other = open(jar, 'https://investors.example.com/');
    other.localStorage.setItem('video-volume', '5');
    other.document.cookie = '_count=2; Path=/';

    const again = open(jar, 'https://www.example.com/');
    again.document.querySelector('footer [data-konzilo-consent-action="withdraw"]').click();
    assert.equal(jar.getCookiesSync('https://www.example.com/').some((one) => one.key === '_count'), false, 'the shared domain\'s cookie is gone');
    assert.deepEqual(cookieOf(again).services, { consent: true, counter: false, video: false });

    const next = open(jar, 'https://investors.example.com/');
    assert.equal(next.localStorage.getItem('video-volume'), null);
    assert.equal(jar.getCookiesSync('https://investors.example.com/').some((one) => one.key === '_count'), false);
    assert.equal(next.document.querySelector('.konzilo-consent-banner').hidden, true, 'the withdrawal holds there too');
  });

  test('every page removes, as it loads, what each service the choice does not allow stored, before a choice too', () => {
    const jar = browser();
    const first = open(jar, 'https://www.example.com/');
    first.localStorage.setItem('video-volume', '5');
    first.document.cookie = '_count=1; Path=/';
    const next = open(jar, 'https://www.example.com/');
    assert.equal(next.localStorage.getItem('video-volume'), null);
    assert.equal(next.document.cookie, '');
  });
});

test('the consent\'s folder imports nothing outside itself', () => {
  const folder = join(core, 'src/consent');
  for (const name of readdirSync(folder).filter((file) => file.endsWith('.js'))) {
    const source = readFileSync(join(folder, name), 'utf8');
    const imported = [...source.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+'([^']+)'/gm)].map(([, path]) => path);
    for (const path of imported) assert.ok(path.startsWith('./') || path.startsWith('node:'), `${name} imports ${path}`);
    assert.doesNotMatch(source, /\bimport\(/, `${name} imports at run time`);
  }
});
