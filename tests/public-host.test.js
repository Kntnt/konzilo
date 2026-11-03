// The site's language and the public host a build is made for, as
// Konzilo's Astro integration hands them to the site's templates, seen in a
// small site's static build: every page says the site's language, and an
// address made from the origin is absolute on the public host. A build that
// is not told its public host fails at once, naming what to set.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment, ORIGIN } from './lib/astro.js';
import { paragraphs, post, siteSettingsArgs, writeContent } from './lib/content.js';

// The npm package, which a site installs beside Astro, and its command.
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = JSON.stringify(join(core, 'src/astro/index.js'));

const types = {
  post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
};

// The site's frame, which says the page's language and links the page by
// its address on the public host, made from the integration's origin and
// from Astro's `site`.
const layout = [
  '---',
  `import { publicSite } from ${integration};`,
  'const { path } = Astro.props;',
  'const { languageTag, origin } = publicSite();',
  '---',
  '<html lang={languageTag}>',
  '  <head>',
  '    <link rel="canonical" href={new URL(path, origin).href} />',
  '    <link rel="alternate" href={new URL(path, Astro.site).href} />',
  '  </head>',
  '  <body><slot /></body>',
  '</html>',
  '',
].join('\n');

const sources = {
  'astro.config.mjs': astroConfig(join(core, 'src/astro/index.js')),
  'src/content.config.mjs': `import { collections as konziloCollections } from ${integration};\n\nexport const collections = konziloCollections();\n`,
  'src/layouts/Site.astro': layout,
  'src/pages/index.astro': "---\nimport Site from '../layouts/Site.astro';\n---\n<Site path=\"/\"><h1>Start</h1></Site>\n",
  'src/pages/[slug].astro': [
    '---',
    "import { getCollection } from 'astro:content';",
    "import Site from '../layouts/Site.astro';",
    'export async function getStaticPaths() {',
    "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
    '}',
    'const { entry } = Astro.props;',
    '---',
    '<Site path={`/${entry.id}/`}><h1>{entry.data.title}</h1></Site>',
    '',
  ].join('\n'),
  // What the integration hands a template, as it is.
  'src/pages/public-site.json.js': `import { publicSite } from ${integration};\n\nexport const GET = () => new Response(JSON.stringify(publicSite()));\n`,
};

const posts = [
  post({ ID: 1, slug: 'first', title: 'First', body: paragraphs('One.') }),
  post({ ID: 2, slug: 'second', title: 'Second', body: paragraphs('Two.') }),
];

// A site repository with Astro and Konzilo's package installed, the design
// above, its posts written as a build writes them, and built by Astro in
// `environment`.
function build(description, environment) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-public-host-'));
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  for (const [path, contents] of Object.entries({ ...sources, 'site-description.json': JSON.stringify(description) })) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  }
  siteSettingsArgs(repository);
  const exported = writeContent(repository, posts);
  assert.equal(exported.status, 0, exported.stderr);
  const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: environment });
  return { repository, built, output: (path) => readFileSync(join(repository, 'dist', path), 'utf8') };
}

const pages = ['index.html', 'first/index.html', 'second/index.html'];

describe('a build of a site that declares its language', () => {
  let site;

  before(() => {
    site = build({ language: 'sv_SE', types }, astroEnvironment);
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('succeeds', () => {
    assert.equal(site.built.status, 0, `${site.built.stdout}\n${site.built.stderr}`);
  });

  test('says the site\'s language on every page, as its language tag', () => {
    for (const page of pages) assert.match(site.output(page), /^<!DOCTYPE html><html lang="sv-SE">/, page);
  });

  test('makes an address from the origin absolute on the public host, as Astro\'s site does', () => {
    const html = site.output('first/index.html');
    assert.match(html, /<link rel="canonical" href="https:\/\/www\.example\.com\/first\/">/);
    assert.match(html, /<link rel="alternate" href="https:\/\/www\.example\.com\/first\/">/);
  });

  test('hands a template the site\'s locale, its language tag and the public host\'s origin', () => {
    assert.deepEqual(JSON.parse(site.output('public-site.json')), { locale: 'sv_SE', languageTag: 'sv-SE', origin: ORIGIN });
  });
});

describe('a build of a site that declares no language', () => {
  let site;

  before(() => {
    site = build({ types }, astroEnvironment);
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('says lang="en" on every page, and hands a template no locale', () => {
    assert.equal(site.built.status, 0, `${site.built.stdout}\n${site.built.stderr}`);
    for (const page of pages) assert.match(site.output(page), /^<!DOCTYPE html><html lang="en">/, page);
    assert.deepEqual(JSON.parse(site.output('public-site.json')), { locale: null, languageTag: 'en', origin: ORIGIN });
  });
});

describe('a build that is not told its public host', () => {
  const { KONZILO_ORIGIN: _, ...untold } = astroEnvironment;
  const builds = {};

  before(() => {
    builds.untold = build({ types }, untold);
    builds.path = build({ types }, { ...untold, KONZILO_ORIGIN: 'https://www.example.com/blog/' });
    builds.plain = build({ types }, { ...untold, KONZILO_ORIGIN: 'http://www.example.com' });
  });

  after(() => {
    for (const site of Object.values(builds)) rmSync(site.repository, { recursive: true, force: true });
  });

  test('fails, naming what to set', () => {
    for (const [what, { built }] of Object.entries(builds)) {
      assert.notEqual(built.status, 0, what);
      assert.match(built.stderr + built.stdout, /KONZILO_ORIGIN/, what);
    }
    const { stderr, stdout } = builds.untold.built;
    assert.match(stderr + stdout, /set KONZILO_ORIGIN to the origin of the public host the site is built for, such as https:\/\/www\.example\.com/);
  });
});
