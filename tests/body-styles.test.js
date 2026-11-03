// The site's body styles, as a site names them to Konzilo's Astro integration:
// every page of a small site's static build loads them, and a site that names
// none builds as before.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { paragraphs, post, siteSettingsArgs, writeContent } from './lib/content.js';

// The npm package, which a site installs beside Astro, and its command.
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

const site = {
  types: {
    post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
  },
};

const posts = [
  post({ ID: 1, slug: 'first', title: 'First', body: paragraphs('One.') }),
  post({ ID: 2, slug: 'second', title: 'Second', body: paragraphs('Two.') }),
];

// A font file of the site's own, larger than Vite inlines by itself, and an
// image in the site's public folder. Their bytes are the suite's own; no
// browser reads them here.
const font = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(6000, 7)]);
const image = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a5d50000000049454e44ae426082', 'hex');

// The body styles: the site's own stylesheet imports a second file of its
// own and a package's stylesheet, and uses a custom property, a cascade
// layer, a font of its own, an image in the public folder, a rule under the
// class the site's templates wrap a post's body in, and two addresses on
// other hosts, which no editor's copy may hold.
const styles = {
  'src/styles/body.css': [
    "@import './tokens.css';",
    "@import 'konzilo-test-styles/typography.css';",
    "@import url('https://fonts.example.com/css2?family=Elsewhere');",
    '@font-face {',
    "  font-family: 'Test Serif';",
    "  src: url('../fonts/test-serif.woff2') format('woff2');",
    '}',
    '@layer base {',
    '  .body-text p { font-family: "Test Serif", serif; color: var(--ink); }',
    '}',
    '.body-text > * + * { margin-block-start: 1.5em; }',
    'hr { background: url(https://images.example.com/rule.png); }',
    '',
  ].join('\n'),
  'src/styles/tokens.css': ':root {\n  --ink: #1a1a2e;\n  --accent: #c0392b;\n}\nblockquote { background-image: url(/images/dot.png); }\n',
  'src/fonts/test-serif.woff2': font,
  'public/images/dot.png': image,
  'packages/konzilo-test-styles/package.json': JSON.stringify({ name: 'konzilo-test-styles', version: '1.0.0', exports: { './typography.css': './typography.css' } }),
  'packages/konzilo-test-styles/typography.css': '.body-text blockquote {\n  border-inline-start: 4px solid var(--accent);\n}\n',
  // The site's own PostCSS setup, which marks every stylesheet it processes.
  'postcss.config.mjs': "export default { plugins: [{ postcssPlugin: 'mark', Once(root, { Rule }) { root.append(new Rule({ selector: '.processed-by-postcss', nodes: [] }).append({ prop: 'content', value: '\"yes\"' })); } }] };\n",
};

// Each article's page, its body wrapped in the class the site names.
const article = [
  '---',
  "import { getCollection, render } from 'astro:content';",
  'export async function getStaticPaths() {',
  "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
  '}',
  'const { entry } = Astro.props;',
  'const { Content } = await render(entry);',
  '---',
  '<html><head><title>{entry.data.title}</title></head><body><article class="body-text"><h1>{entry.data.title}</h1><Content /></article></body></html>',
  '',
].join('\n');

// A site repository with Astro and Konzilo's package installed, beside the
// package of styles above, Konzilo's integration given `options`, and its
// posts written as a build writes them.
function siteRepository(options, files = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-body-styles-'));
  mkdirSync(join(repository, 'node_modules'));
  for (const name of readdirSync(join(core, 'node_modules'))) symlinkSync(join(core, 'node_modules', name), join(repository, 'node_modules', name));
  const sources = {
    'astro.config.mjs': astroConfig(integration, options),
    'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify(site),
    'src/pages/index.astro': '<html><head><title>Start</title></head><body><h1>Start</h1></body></html>\n',
    'src/pages/[slug].astro': article,
    ...files,
  };
  for (const [path, contents] of Object.entries(sources)) write(repository, path, contents);
  if (files['packages/konzilo-test-styles/package.json']) symlinkSync(join(repository, 'packages/konzilo-test-styles'), join(repository, 'node_modules/konzilo-test-styles'));
  siteSettingsArgs(repository);
  const exported = writeContent(repository, posts);
  // A repository the test never gets is removed here.
  if (exported.status !== 0) rmSync(repository, { recursive: true, force: true });
  assert.equal(exported.status, 0, exported.stderr);
  return repository;
}

function write(repository, path, contents) {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), contents);
}

const build = (repository) => spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });

// The CSS a built page loads: its stylesheets' and its own style elements'.
function cssOf(dist, page) {
  const html = readFileSync(join(dist, page), 'utf8');
  const linked = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(([, href]) => readFileSync(join(dist, href), 'utf8'));
  const inline = [...html.matchAll(/<style>(.*?)<\/style>/gs)].map(([, css]) => css);
  return [...linked, ...inline].join('\n');
}

// Every address a stylesheet names, in url() or @import.
const addressesIn = (css) => [...css.matchAll(/url\(\s*(['"]?)([^'")]*)\1\s*\)|@import\s+(['"])([^'"]*)\3/g)].map((match) => match[2] ?? match[4]);

const pages = ['index.html', 'first/index.html', 'second/index.html'];

describe('a build of a site that names its body styles', () => {
  let repository;
  let built;

  before(() => {
    repository = siteRepository({ bodyStyles: ['./src/styles/body.css'] }, styles);
    built = build(repository);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('succeeds', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  });

  test('makes every built page load the body styles', () => {
    for (const page of pages) {
      const css = cssOf(join(repository, 'dist'), page);
      assert.match(css, /--ink:\s*#1a1a2e/, page);
      assert.match(css, /border-inline-start:\s*4px solid var\(--accent\)/, page);
      assert.match(css, /\.body-text p/, page);
    }
  });
});

describe('a build of a site that names no body styles', () => {
  let repository;
  let built;

  before(() => {
    repository = siteRepository(undefined, styles);
    built = build(repository);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('succeeds as before', () => {
    assert.equal(built.status, 0, `${built.stdout}
${built.stderr}`);
  });
});

describe('a site that names its body styles wrongly', () => {
  const cases = {
    'a list of stylesheets': { bodyStyles: './src/styles/body.css' },
    'stylesheets by name': { bodyStyles: [''] },
  };
  const builds = {};

  before(() => {
    for (const [what, options] of Object.entries(cases)) {
      const repository = siteRepository(options, styles);
      builds[what] = { repository, built: build(repository) };
    }
  });

  after(() => {
    for (const { repository } of Object.values(builds)) rmSync(repository, { recursive: true, force: true });
  });

  test('fails at once, naming the option', () => {
    for (const [what, { built }] of Object.entries(builds)) {
      assert.notEqual(built.status, 0, what);
      assert.match(built.stdout + built.stderr, /bodyStyles/, what);
    }
  });
});
