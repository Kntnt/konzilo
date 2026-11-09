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
async function otherPage(script, { head = '', jar = new CookieJar(), url = 'https://investors.example.com/about/' } = {}) {
  const html = `<!doctype html><html lang="en-GB"><head><title>About</title>${head}</head><body>
    <main><h1>About</h1>
      <figure class="konzilo-embed" data-embed="video"><a href="https://video.example.net/1">https://video.example.net/1</a><template><iframe src="https://player.video.example.net/1" title="Video"></iframe></template></figure>
      <div data-konzilo-consent-declaration><p><a href="https://www.example.com/cookies/">Our cookie policy</a></p></div>
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
  const script = consentScript({ registry, legalPages: { privacyPolicy: { title: 'Privacy', href: 'https://www.example.com/privacy/' }, cookiePolicy: null }, language: 'en-GB', host: null }, { domain: 'example.com' });
  const page = await otherPage(script);
  assert.equal(page.document.querySelector('.konzilo-consent-banner').hidden, false);
  assert.equal(page.document.querySelector('[data-konzilo-consent-declaration] .konzilo-declaration-revised time').getAttribute('datetime'), '2026-11-01');
  assert.equal(JSON.parse(page.document.querySelector('[data-konzilo-consent]').dataset.konziloConsent).revision, registry.revision);
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
