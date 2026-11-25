// The right to object to counting without storage, placed in a post's body by the core's leaf
// directive `::consent-objection` (ADR 0049), seen in a small site's static build: on a site
// that counts visits without storage before consent, the body draws there what a template's
// `<ConsentControls links={false} buttons={false} objection />` draws, the objection's control
// with the same classes and data attributes, which the consent client drives as it drives the
// dialog's; on a site that counts no visits so, it draws nothing. The integration renders it
// itself, so a site gives no component of its own for it.
//
// The page's script file runs under jsdom; acceptance/consent-objection.test.js has the
// control in the three browser engines.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import konzilo from '../src/astro/index.js';
import { astroConfig, astroEnvironment, nodeSync, ORIGIN } from './lib/astro.js';
import { identity, paragraphs, post, siteSettingsArgs, writeContent } from './lib/content.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');
const { JSDOM, VirtualConsole } = createRequire(join(core, 'package.json'))('jsdom');

// Matomo's own tracker, as an Admin sets it.
const TRACKER = { manager: 'Matomo', address: 'https://matomo.example.com/', site: 3 };
const COUNTING = { departures: [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'We count every visit, and store nothing before consent.', privacySignals: 'ignore' }] };

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
    "import Body from '@kntnt/konzilo/astro/Body.astro';",
    "import Site from '../layouts/Site.astro';",
    'export async function getStaticPaths() {',
    "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
    '}',
    'const { entry } = Astro.props;',
    'const { Content } = await render(entry);',
    '---',
    '<Site><Body post={entry}><Content /></Body></Site>',
    '',
  ].join('\n'),
  // A template that places the right to object itself, as a privacy policy's may.
  'src/pages/placed.astro': [
    '---',
    "import ConsentControls from '@kntnt/konzilo/astro/ConsentControls.astro';",
    "import Site from '../layouts/Site.astro';",
    '---',
    '<Site><ConsentControls links={false} buttons={false} objection /></Site>',
    '',
  ].join('\n'),
};

const types = { post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'consent-objection'] } };

// A site repository with the design above, Matomo's own tracker chosen and `consent` its site
// description's, whose one post holds the right to object between two paragraphs, built.
function build(consent) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-consent-objection-'));
  try {
    mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
    for (const entry of readdirSync(join(core, 'node_modules'))) {
      if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
    }
    symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
    const files = {
      ...sources,
      'astro.config.mjs': astroConfig(integration),
      'site-description.json': JSON.stringify({ language: 'en_GB', types, ...(consent ? { consent } : {}) }),
    };
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), contents);
    }
    siteSettingsArgs(repository, { menus: {}, settings: { tagManager: TRACKER }, identity });
    const exported = writeContent(repository, [post({ ID: 1, slug: 'privacy', title: 'Privacy', body: paragraphs('We count the visits.', '::consent-objection', 'Ask us anything.') })]);
    assert.equal(exported.status, 0, exported.stderr);
    const built = nodeSync([astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  } catch (error) {
    rmSync(repository, { recursive: true, force: true });
    throw error;
  }
  return { repository, output: (path) => readFileSync(join(repository, 'dist', path), 'utf8') };
}

const main = (html) => /<main>(.*)<\/main>/s.exec(html)[1];

// The right to object as the body draws it, in the core's words: hidden until the script shows
// it, the explanation whose word in brackets is the link that opens the confirmation, and the
// paragraph shown once the visitor objects, with the link that takes the objection back.
const OBJECTION = [
  '<div class="konzilo-consent-controls">',
  '<div class="konzilo-consent-objection" data-konzilo-consent-objection hidden>',
  '<p class="konzilo-consent-objection-text">We can&#39;t see who you are, we don&#39;t follow you from one visit to the next, and we don&#39;t profile you. All we do is count the visits: how many there are, which pages are read and for how long, from which country, in which language and with which browser, and when in the day. We do so on our legitimate interest in knowing this. If you disagree, you have the right to <a href="#konzilo-consent-objection" class="konzilo-consent-objection-link" data-konzilo-consent-action="objection">object</a>.</p>',
  '<p class="konzilo-consent-objection-objected" data-konzilo-consent-objected hidden>You have objected to the counting, so your visits are not counted. <a href="#konzilo-consent-objection" class="konzilo-consent-objection-link" data-konzilo-consent-action="resume">Undo your objection</a></p>',
  '</div>',
  '</div>',
].join('');

// A visit to the built post under jsdom, its script file run once `stored` is put into the
// consent's own storage item: the document, what that item holds, and a click on a button by
// its action. jsdom has no modal dialog: a dialog opens and closes here as its `open` alone.
function visit(site, { stored } = {}) {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    if (!/navigation/.test(error.message)) throw error;
  });
  const { window } = new JSDOM(site.output('privacy/index.html'), { url: `${ORIGIN}/privacy/`, runScripts: 'outside-only', virtualConsole });
  if (stored !== undefined) window.localStorage.setItem('konzilo-consent', JSON.stringify(stored));
  window.setTimeout = () => 0;
  for (const dialog of window.document.querySelectorAll('dialog')) {
    Object.assign(dialog, {
      showModal() { this.open = true; },
      close() { this.open = false; this.dispatchEvent(new window.Event('close')); },
    });
  }
  const own = window.document.querySelector('script[src]');
  window.eval(site.output(own.getAttribute('src').slice(1)));
  const document = window.document;
  const kept = () => JSON.parse(window.localStorage.getItem('konzilo-consent'));
  return { document, kept, click: (action) => document.querySelector(`button[data-konzilo-consent-action="${action}"]`).click() };
}

// The right to object in the post's body, not the dialog's.
const inBody = (page) => page.document.querySelector('main > .konzilo-consent-controls > [data-konzilo-consent-objection]');

describe('the right to object in a body, on a site that counts visits without storage', () => {
  let site;

  before(() => {
    site = build(COUNTING);
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('draws the objection\'s control where the body places it, as a template\'s ConsentControls draws it with `objection` alone', () => {
    const body = main(site.output('privacy/index.html'));
    assert.equal(body.replaceAll('\n', ''), `<p>We count the visits.</p>${OBJECTION}<p>Ask us anything.</p>`);
    assert.equal(main(site.output('placed/index.html')), OBJECTION);
  });

  test('the consent client shows it while the visitor allows no statistics, hides it once they do, and lets the visitor object and take it back there', () => {
    const fresh = visit(site);
    assert.equal(inBody(fresh).hidden, false, 'a first visit');
    fresh.click('accept');
    assert.equal(inBody(fresh).hidden, true, 'statistics allowed');

    const refused = visit(site);
    refused.click('reject');
    assert.equal(inBody(refused).hidden, false, 'statistics refused');
    inBody(refused).querySelector('a[data-konzilo-consent-action="objection"]').click();
    assert.equal(refused.document.querySelector('dialog#konzilo-consent-objection').open, true, 'the confirmation');
    refused.click('object');
    assert.equal(typeof refused.kept().objection, 'string');
    assert.equal(inBody(refused).querySelector('[data-konzilo-consent-objected]').hidden, false, 'the paragraph that takes it back');

    const objected = visit(site, { stored: refused.kept() });
    assert.equal(inBody(objected).querySelector('[data-konzilo-consent-objected]').hidden, false, 'the next page');
    inBody(objected).querySelector('a[data-konzilo-consent-action="resume"]').click();
    assert.equal(objected.kept().objection, undefined);
    assert.equal(inBody(objected).querySelector('[data-konzilo-consent-objected]').hidden, true, 'taken back');
  });
});

describe('the right to object in a body, on a site that counts no visits without storage', () => {
  let site;

  before(() => {
    site = build(undefined);
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('draws nothing where the body places it', () => {
    assert.equal(main(site.output('privacy/index.html')).replaceAll('\n', ''), '<p>We count the visits.</p><p>Ask us anything.</p>');
  });
});

test('the integration refuses a component of a site\'s own for the right to object, which it renders itself', () => {
  assert.throws(() => konzilo({ directives: { 'consent-objection': './src/components/Objection.astro' } }), /renders the directive consent-objection itself/);
});
