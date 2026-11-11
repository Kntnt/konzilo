// The consent script for pages a site does not build (src/consent/script.js):
// one file per language at the site's fixed address, made from the
// registry, the consent texts and the legal pages, which a page of another
// system loads with one deferred script element. Run under jsdom on such a
// page, it adds the banner, the dialog and the placeholders' templates,
// shows the page's own footer buttons, fills its cookie declaration, makes
// its embeds placeholders, and gives the consent signal at once.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { consentScriptFiles } from '../src/astro/consent.js';
import { CATALOGUES } from '../src/catalogues.js';
import { CONSENT_SCRIPTS, consentScriptPath, registryRevision } from '../src/consent/registry.js';
import { consentScript } from '../src/consent/script.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const { CookieJar, JSDOM, VirtualConsole } = createRequire(join(core, 'package.json'))('jsdom');

const none = { scripts: [], frames: [], connections: [], images: [], styles: [], fonts: [] };
const texts = (language) => (language === 'sv'
  ? { bannerTitle: 'Din integritet', bannerText: 'Vi frågar först.', bannerAccept: 'Acceptera alla', bannerReject: 'Neka valfria', bannerCustomise: 'Anpassa', dialogTitle: 'Integritetsinställningar', dialogIntroduction: 'Välj.', dialogAccept: 'Acceptera alla', dialogReject: 'Neka valfria', dialogSave: 'Spara mina val', dialogClose: 'Stäng', footerChange: 'Ändra integritetsinställningar', footerWithdraw: 'Återkalla samtycke', noticeWithdrawn: 'Dina samtycken har återkallats. Sidan laddas om.', placeholderQuestion: 'Vill du låta {service} spela upp det här innehållet?', placeholderButton: 'Tillåt och spela upp', necessaryName: 'Nödvändiga', necessaryDescription: 'Alltid på.', marketingName: 'Marknadsföring', marketingDescription: 'Andras syften.' }
  : { bannerTitle: 'Your privacy', bannerText: 'We ask first.', bannerAccept: 'Accept all', bannerReject: 'Reject optional', bannerCustomise: 'Customise', dialogTitle: 'Privacy settings', dialogIntroduction: 'Choose.', dialogAccept: 'Accept all', dialogReject: 'Reject optional', dialogSave: 'Save my choices', dialogClose: 'Close', footerChange: 'Change privacy settings', footerWithdraw: 'Withdraw consent', noticeWithdrawn: 'Your consents have been withdrawn. The page will reload.', placeholderQuestion: 'Allow {service} to play this content?', placeholderButton: 'Allow and play', necessaryName: 'Necessary', necessaryDescription: 'Always on.', marketingName: 'Marketing', marketingDescription: 'Others\' purposes.' });

// The registry as a build writes it, with a video service, and its
// revision made by the shared function.
const categories = [
  { id: 'necessary', name: 'Necessary', description: 'Always on.', services: ['consent'] },
  { id: 'marketing', name: 'Marketing', description: 'Others\' purposes.', services: ['video'] },
];
const services = [
  { id: 'consent', name: 'Consent', category: 'necessary', provider: null, purpose: 'Remembers your choice.', storage: [{ name: 'konzilo-consent', kind: 'localStorage', lifetime: 'P12M', party: 'first', domain: null }], hosts: none, transfers: [], necessity: 'It keeps your choice.' },
  { id: 'video', name: 'Video', category: 'marketing', provider: { name: 'Video Inc.', country: 'US', privacyPolicy: 'https://video.example.net/privacy' }, purpose: 'Plays videos.', storage: [], hosts: { ...none, frames: ['player.video.example.net'] }, transfers: [], necessity: null },
];
const registry = {
  revision: registryRevision({ categories, services, departures: [] }),
  revised: '2026-11-01',
  categories,
  services,
  departures: [],
  texts: {
    banner: { title: 'Your privacy', text: 'We ask first.', accept: 'Accept all', reject: 'Reject optional', customise: 'Customise' },
    dialog: { title: 'Privacy settings', introduction: 'Choose.', accept: 'Accept all', reject: 'Reject optional', save: 'Save my choices', close: 'Close' },
    footer: { change: 'Change privacy settings', withdraw: 'Withdraw consent' },
    notice: { withdrawn: 'Your consents have been withdrawn. The page will reload.' },
    placeholder: { question: 'Allow {service} to play this content?', button: 'Allow and play' },
  },
};

// A content folder as a build leaves it: the registry, and the settings of
// one language, or of each.
function contentFolder(languages) {
  const folder = mkdtempSync(join(tmpdir(), 'konzilo-consent-script-'));
  writeFileSync(join(folder, 'consent.json'), JSON.stringify(registry));
  const settings = (language, prefix = '') => ({ consent: texts(language), legalPages: { privacyPolicy: { title: language === 'sv' ? 'Integritet' : 'Privacy', url: `${prefix}/privacy/` }, cookiePolicy: { title: language === 'sv' ? 'Kakor' : 'Cookies', url: `${prefix}/cookies/` } } });
  if (languages.length > 1) {
    mkdirSync(join(folder, 'settings'));
    for (const language of languages) writeFileSync(join(folder, 'settings', `${language.tag}.json`), JSON.stringify(settings(language.prefix, `/${language.prefix}`)));
  } else {
    writeFileSync(join(folder, 'settings.json'), JSON.stringify(settings('en')));
  }
  return folder;
}

// A page of another system below the same domain, with what the script
// needs and nothing of Konzilo's: its footer buttons, hidden; its own
// declaration's place, with a link that stays without the script; an embed
// in the markup of ADR 0024; and the script, run as a deferred script runs,
// once the page is parsed, then a later deferred script of the page's own.
async function otherPage(script, { head = '', body = '', jar = new CookieJar(), url = 'https://investors.example.com/about/' } = {}) {
  const html = `<!doctype html><html lang="en-GB"><head><title>About</title>${head}</head><body>
    <main><h1>About</h1>
      <figure class="konzilo-embed" data-embed="video"><a href="https://video.example.net/1">https://video.example.net/1</a><template><iframe src="https://player.video.example.net/1" title="Video"></iframe></template></figure>
      <div data-konzilo-consent-declaration><p><a href="https://www.example.com/cookies/">Our cookie policy</a></p></div>
      ${body}
    </main>
    <footer><button type="button" data-konzilo-consent-action="change" hidden>Privacy settings</button><button type="button" data-konzilo-consent-action="withdraw" hidden>Withdraw consent</button></footer>
  </body></html>`;
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (!/navigation/.test(error.message)) throw error;
  });
  const { window } = new JSDOM(html, { url, cookieJar: jar, runScripts: 'outside-only', virtualConsole });
  const sent = [];
  window.fetch = (...request) => {
    sent.push(request);
    return new Promise(() => {});
  };
  // A deferred script runs once the page is parsed.
  if (window.document.readyState === 'loading') await new Promise((resolve) => window.document.addEventListener('DOMContentLoaded', resolve));
  window.eval(script);
  // jsdom has no modal dialog: a dialog the script added opens and closes
  // here as its `open` alone.
  for (const dialog of window.document.querySelectorAll('dialog')) {
    Object.assign(dialog, { showModal() { this.open = true; }, close() { this.open = false; this.dispatchEvent(new window.Event('close')); } });
  }
  // A later deferred script of the page reads the stored choice at once.
  const later = window.eval('window.konziloConsent ? window.konziloConsent.choice() : "no signal"');
  return { window, document: window.document, sent, later };
}

const text = (element) => element.textContent.replace(/\s+/g, ' ').trim();

describe('the consent scripts of a site in one language', () => {
  let folder;
  let files;

  before(() => {
    folder = contentFolder([{ tag: 'en-GB', prefix: null }]);
    files = consentScriptFiles({ folder, languages: [{ locale: 'en_GB', tag: 'en-GB', prefix: null, main: true }], origin: 'https://www.example.com', domain: 'example.com' });
  });

  after(() => rmSync(folder, { recursive: true, force: true }));

  test('are one script by the language\'s subtag at the fixed address, and the stylesheet beside it', () => {
    assert.deepEqual([...files.keys()], ['/_konzilo/consent/en.js', '/_konzilo/consent/consent.css']);
    assert.equal(consentScriptPath('en'), `${CONSENT_SCRIPTS}en.js`);
    assert.match(files.get('/_konzilo/consent/consent.css'), /\.konzilo-consent-banner/);
    assert.doesNotMatch(files.get('/_konzilo/consent/consent.css'), /var\(--body-/);
  });

  test('on another system\'s page add the banner, show its buttons, fill its declaration and ask in its embeds, and give the signal at once', async () => {
    const page = await otherPage(files.get('/_konzilo/consent/en.js'));
    const { document } = page;
    assert.equal(page.later, null, 'no choice yet, read at once by a later script');
    const root = document.body.lastElementChild;
    assert.ok(root.matches('.konzilo-consent[data-konzilo-consent]'), 'at the end of the body');
    assert.equal(root.querySelector('.konzilo-consent-banner').hidden, false);
    assert.deepEqual([...root.querySelectorAll('.konzilo-consent-banner a')].map((link) => link.href), ['https://www.example.com/privacy/', 'https://www.example.com/cookies/']);
    assert.deepEqual([...document.querySelectorAll('footer button')].map((button) => button.hidden), [false, false]);
    const declaration = document.querySelector('[data-konzilo-consent-declaration] > .konzilo-declaration');
    assert.ok(declaration, 'the declaration in its place');
    assert.equal(document.querySelector('[data-konzilo-consent-declaration]').textContent.includes('Our cookie policy'), false);
    assert.equal(declaration.querySelector('[data-konzilo-declaration-id]'), null, 'no consent ID: these pages send no records');
    assert.equal(text(document.querySelector('figure.konzilo-embed .konzilo-embed-question')), 'Allow Video to play this content?');
    assert.equal(document.querySelectorAll('script, [style]').length, 0, 'nothing inline');
  });

  test('a choice there gives the event, loads the embed, keeps the choice on the shared domain, and sends no record', async () => {
    const jar = new CookieJar();
    const page = await otherPage(files.get('/_konzilo/consent/en.js'), { jar });
    const events = [];
    page.document.addEventListener('konzilo:consent', (event) => events.push(event.detail.how));
    page.document.querySelector('figure.konzilo-embed .konzilo-embed-allow').click();
    assert.deepEqual(events, ['placeholder']);
    assert.equal(page.document.querySelector('figure.konzilo-embed > iframe').getAttribute('src'), 'https://player.video.example.net/1');
    assert.deepEqual(page.sent, []);
    const cookie = jar.getCookiesSync('https://www.example.com/').find((one) => one.key === 'konzilo-consent');
    assert.equal(cookie.domain, 'example.com');
    assert.equal(JSON.parse(decodeURIComponent(cookie.value)).id, undefined);
    const choice = page.document.querySelector('.konzilo-declaration-choice');
    assert.equal(choice.hidden, false);
    assert.deepEqual([...choice.querySelectorAll('li')].filter((item) => !item.hidden).map(text), ['Necessary', 'Marketing']);
    const again = await otherPage(files.get('/_konzilo/consent/en.js'), { jar, url: 'https://investors.example.com/news/' });
    assert.equal(again.later.services.video, true, 'the next page reads it at once');
    assert.equal(again.document.querySelector('.konzilo-consent-banner').hidden, true);
  });

  test('Withdraw consent there removes the shared choice, so the next page below the domain asks again with the banner', async () => {
    const jar = new CookieJar();
    const shared = () => jar.getCookiesSync('https://www.example.com/').find((one) => one.key === 'konzilo-consent');
    const first = await otherPage(files.get('/_konzilo/consent/en.js'), { jar });
    first.document.querySelector('figure.konzilo-embed .konzilo-embed-allow').click();
    assert.ok(shared());
    const second = await otherPage(files.get('/_konzilo/consent/en.js'), { jar, url: 'https://investors.example.com/news/' });
    assert.equal(second.document.querySelector('.konzilo-consent-banner').hidden, true);
    second.document.querySelector('footer [data-konzilo-consent-action="withdraw"]').click();
    assert.equal(second.document.querySelector('.konzilo-consent-notice').hidden, false);
    assert.equal(shared(), undefined);
    first.window.close();
    second.window.close();
    const third = await otherPage(files.get('/_konzilo/consent/en.js'), { jar, url: 'https://www.example.com/' });
    assert.equal(third.document.querySelector('.konzilo-consent-banner').hidden, false);
    third.window.close();
  });

  test('a page that marks itself as a legal page shows no banner, and its buttons still work', async () => {
    const page = await otherPage(files.get('/_konzilo/consent/en.js'), { head: '<meta name="konzilo-consent" content="legal-page">' });
    assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, true);
    const dialog = Object.assign(page.document.querySelector('dialog'), { showModal() { this.open = true; } });
    page.document.querySelector('footer [data-konzilo-consent-action="change"]').click();
    assert.equal(dialog.open, true);
  });

  test('do nothing on a page that has the signal already', async () => {
    const page = await otherPage(files.get('/_konzilo/consent/en.js'));
    page.window.eval(files.get('/_konzilo/consent/en.js'));
    assert.equal(page.document.querySelectorAll('[data-konzilo-consent]').length, 1);
  });

  test('wait for the page to be parsed when it runs before, as a script without defer does', () => {
    const { window } = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'https://investors.example.com/', runScripts: 'outside-only' });
    Object.defineProperty(window.document, 'readyState', { value: 'loading', configurable: true });
    window.eval(files.get('/_konzilo/consent/en.js'));
    assert.equal(window.document.querySelector('[data-konzilo-consent]'), null);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    assert.ok(window.document.querySelector('[data-konzilo-consent]'));
  });
});

test('a site in several languages has a script for each, by its prefix, in its texts and with its legal pages', async () => {
  const languages = [{ locale: 'sv_SE', tag: 'sv-SE', prefix: 'sv', main: true }, { locale: 'en_GB', tag: 'en-GB', prefix: 'en', main: false }];
  const folder = contentFolder(languages);
  try {
    const files = consentScriptFiles({ folder, languages, origin: 'https://www.example.com' });
    assert.deepEqual([...files.keys()], ['/_konzilo/consent/sv.js', '/_konzilo/consent/en.js', '/_konzilo/consent/consent.css']);
    const swedish = (await otherPage(files.get('/_konzilo/consent/sv.js'))).document;
    assert.equal(text(swedish.querySelector('.konzilo-consent-banner h2')), 'Din integritet');
    assert.deepEqual([...swedish.querySelectorAll('.konzilo-consent-banner a')].map((link) => link.href), ['https://www.example.com/sv/privacy/', 'https://www.example.com/sv/cookies/']);
    assert.equal(JSON.parse(swedish.querySelector('[data-konzilo-consent]').dataset.konziloConsent).language, 'sv-SE');
    assert.equal(text((await otherPage(files.get('/_konzilo/consent/en.js'))).document.querySelector('.konzilo-consent-banner h2')), 'Your privacy');
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('a site that is not Konzilo\'s makes the same script from its own registry with the shared functions', async () => {
  const script = consentScript({ registry, legalPages: { privacyPolicy: { title: 'Privacy', href: 'https://www.example.com/privacy/' }, cookiePolicy: null }, language: 'en-GB', catalogues: CATALOGUES, host: null }, { domain: 'example.com' });
  const page = await otherPage(script);
  assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, false);
  assert.equal(page.document.querySelector('[data-konzilo-consent-declaration] .konzilo-declaration-revised time').getAttribute('datetime'), '2026-11-01');
  assert.equal(JSON.parse(page.document.querySelector('[data-konzilo-consent]').dataset.konziloConsent).revision, registry.revision);
});

test('a page that names its own privacy policy and cookie policy has the consent link to them, by its titles where it gives them; one that names neither keeps the site\'s', async () => {
  const script = consentScript({ registry, legalPages: { privacyPolicy: { title: 'Privacy', href: 'https://www.example.com/privacy/' }, cookiePolicy: { title: 'Cookies', href: 'https://www.example.com/cookies/' } }, language: 'en-GB', catalogues: CATALOGUES, host: null }, { domain: 'example.com' });
  const head = '<link rel="privacy-policy" href="/legal/privacy/" title="How we handle your data"><link rel="Cookie-Policy" href="https://investors.example.com/legal/cookies/">';
  const own = (await otherPage(script, { head })).document;
  assert.deepEqual([...own.querySelectorAll('.konzilo-consent-banner a')].map((link) => [text(link), link.href]), [
    ['How we handle your data', 'https://investors.example.com/legal/privacy/'],
    ['Cookies', 'https://investors.example.com/legal/cookies/'],
  ]);
  const placeholder = own.querySelector('template[data-konzilo-consent-placeholder="video"]').content.querySelector('.konzilo-embed-storage a');
  assert.equal(placeholder.href, 'https://investors.example.com/legal/cookies/');
  assert.equal(own.querySelector('figure.konzilo-embed .konzilo-embed-storage a').href, 'https://investors.example.com/legal/cookies/');
  const consent = own.querySelector('[data-konzilo-consent-declaration] #konzilo-declaration-service-consent dd a');
  assert.deepEqual([text(consent), consent.href], ['How we handle your data', 'https://investors.example.com/legal/privacy/']);
  const provider = own.querySelector('[data-konzilo-consent-declaration] #konzilo-declaration-service-video dd a');
  assert.equal(provider.href, 'https://video.example.net/privacy', 'a provider\'s own policy stays');

  const site = (await otherPage(script)).document;
  assert.deepEqual([...site.querySelectorAll('.konzilo-consent-banner a')].map((link) => [text(link), link.href]), [['Privacy', 'https://www.example.com/privacy/'], ['Cookies', 'https://www.example.com/cookies/']]);
});

test('where the site counts visits without storage before consent, a page of its own may place the right to object, which the script fills; the objection is kept in the shared cookie for 12 months, and holds on every site below the domain', async () => {
  const counter = { id: 'counter', name: 'Counter', category: 'statistics', provider: null, purpose: 'Counts visits.', storage: [{ name: '_count', kind: 'cookie', lifetime: 'P13M', party: 'first', domain: null }], hosts: { ...none, scripts: ['count.example.com'] }, transfers: [], necessity: null };
  const counting = {
    ...registry,
    categories: [registry.categories[0], { id: 'statistics', name: 'Statistics', description: 'Counting visits.', services: ['counter'] }, registry.categories[1]],
    services: [registry.services[0], counter, registry.services[1]],
    departures: [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'We count every visit.', privacySignals: 'ignore' }],
  };
  const script = consentScript({ registry: counting, legalPages: {}, language: 'en-GB', catalogues: CATALOGUES, host: null }, { domain: 'example.com' });
  const body = '<section><h2>Your right to object</h2><div data-konzilo-consent-objection hidden>\n</div></section>';
  const jar = new CookieJar();
  const page = await otherPage(script, { body, jar, head: '<meta name="konzilo-consent" content="legal-page">' });
  const place = page.document.querySelector('section [data-konzilo-consent-objection]');
  assert.equal(place.hidden, false);
  assert.match(text(place.querySelector('.konzilo-consent-objection-text')), /^We can't see who you are, .* you have the right to object\.$/);
  place.querySelector('a[data-konzilo-consent-action="objection"]').click();
  const confirmation = page.document.querySelector('dialog#konzilo-consent-objection');
  assert.equal(confirmation.open, true);
  page.document.querySelector('#konzilo-consent-objection [data-konzilo-consent-action="object"]').click();
  assert.equal(confirmation.open, false);
  assert.equal(place.querySelector('a[data-konzilo-consent-action="objection"]').hasAttribute('href'), false);
  assert.equal(place.querySelector('.konzilo-consent-objection-objected').hidden, false);
  const cookie = jar.getCookiesSync('https://www.example.com/').find((one) => one.key === 'konzilo-consent');
  assert.equal(cookie.domain, 'example.com');
  const kept = JSON.parse(decodeURIComponent(cookie.value));
  assert.deepEqual(Object.keys(kept), ['objection']);
  const days = (cookie.expires.getTime() - Date.parse(kept.objection)) / (24 * 3600 * 1000);
  assert.ok(days > 364 && days < 367, `kept ${days} days`);
  assert.deepEqual(page.sent, [], 'an objection sends no record');

  const other = await otherPage(script, { jar, url: 'https://www.example.com/news/' });
  assert.equal(other.window.konziloConsent.objected(), true);
  assert.equal(other.document.querySelector('.konzilo-consent-objection-objected').hidden, false, 'in the dialog\'s statistics too');
  assert.equal(other.document.querySelector('.konzilo-consent-banner').hidden, false, 'the banner still asks for a choice');
  other.document.querySelector('.konzilo-consent-banner [data-konzilo-consent-action="accept"]').click();
  assert.equal(JSON.parse(decodeURIComponent(jar.getCookiesSync('https://www.example.com/').find((one) => one.key === 'konzilo-consent').value)).objection, undefined, 'allowing statistics ends it');
  assert.equal(other.document.querySelector('.konzilo-consent-objection').hidden, true, 'and hides it');

  // A site that does not count so offers none: the page's place stays empty and hidden.
  const uncounted = await otherPage(consentScript({ registry, legalPages: {}, language: 'en-GB', catalogues: CATALOGUES, host: null }, { domain: 'example.com' }), { body });
  const empty = uncounted.document.querySelector('section [data-konzilo-consent-objection]');
  assert.deepEqual([empty.hidden, empty.children.length], [true, 0]);
  assert.equal(uncounted.document.querySelector('#konzilo-consent-objection'), null);
});

test('a content folder with no registry has no consent script', () => {
  const folder = mkdtempSync(join(tmpdir(), 'konzilo-consent-script-'));
  try {
    assert.equal(consentScriptFiles({ folder, origin: 'https://www.example.com' }).size, 0);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

test('the default stylesheet is the one in the consent\'s folder', () => {
  const folder = contentFolder([]);
  try {
    assert.equal(consentScriptFiles({ folder, origin: 'https://www.example.com' }).get('/_konzilo/consent/consent.css'), readFileSync(join(core, 'src/consent/consent.css'), 'utf8'));
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
