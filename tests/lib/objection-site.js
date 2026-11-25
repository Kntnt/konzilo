// A small site whose one post, a privacy policy, places the right to object to counting
// without storage in its body, `::consent-objection`, between two paragraphs, rendered
// through the integration's Body, under a layout with the consent's banner; and a page of its
// own, /placed/, where a template places the same with ConsentControls.astro. Matomo's own
// tracker is chosen in its settings, and `consent` is its site description's, so that a test
// builds it with the departure that counts visits without storage, or without. For
// tests/consent-objection.test.js and acceptance/consent-objection.test.js alike.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment, nodeSync } from './astro.js';
import { identity, paragraphs, post, siteSettingsArgs, writeContent } from './content.js';

const core = fileURLToPath(new URL('../../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

// Matomo's own tracker, as an Admin sets it, and where it loads from.
export const TRACKER = { manager: 'Matomo', address: 'https://matomo.example.com/', site: 3 };

// The departure that has the statistics count visits without storage before consent.
export const COUNTING = { departures: [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'We count every visit, and store nothing before consent.', privacySignals: 'ignore' }] };

// The post's address, and the paragraphs around the right to object in its body.
export const POST = '/privacy/';
export const BEFORE = 'We count the visits.';
export const AFTER = 'Ask us anything.';

const layout = [
  '---',
  "import ConsentBanner from '@kntnt/konzilo/astro/ConsentBanner.astro';",
  '---',
  '<html lang="en">',
  '  <head><meta charset="utf-8"><title>A page</title></head>',
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

// The site, built by Astro: { repository, dist, output(path), remove() }.
export function objectionSite(consent) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-consent-objection-'));
  const remove = () => rmSync(repository, { recursive: true, force: true });
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
    const exported = writeContent(repository, [post({ ID: 1, slug: 'privacy', title: 'Privacy', body: paragraphs(BEFORE, '::consent-objection', AFTER) })]);
    assert.equal(exported.status, 0, exported.stderr);
    const built = nodeSync([astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  } catch (error) {
    remove();
    throw error;
  }
  const dist = join(repository, 'dist');
  return { repository, dist, output: (path) => readFileSync(join(dist, path), 'utf8'), remove };
}
