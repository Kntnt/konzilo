// Konzilo's content format document: one document in the package,
// content-format.md, that describes the content files for a reader who knows
// Markdown, YAML and JSON but not Konzilo. These tests keep it in step with the
// core: it names every element, inline element and embed service the rule data
// knows, every field and type the site description's checker takes, and every
// example renders as it says. Every whole file it gives as an example, its tour
// of every body element among them, placed in the content folder of a site
// repository made from the site template, with the document's own site
// description and a master for each image they name, builds with `astro build`,
// and the tour's page shows each body element and each inline element the rule
// data knows.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { registryOf } from '../src/astro/directives.js';
import { BUILT_IN_TAXONOMIES, BUILT_IN_TYPES } from '../src/format/built-in-types.js';
import { readContentFile } from '../src/astro/reader.js';
import { CORE_FIELDS, FIELD_TYPES, IDENTITY, OLD_ADDRESSES, OTHER_ADDRESSES, SEO_FIELD, SEO_KEYS, SETTING_TYPES, siteDescription, TRANSLATION_KEY } from '../src/site-description.js';
import { astroEnvironment } from './lib/astro.js';
import { contentFormat, exampleFile, markedExamples, siteOf, unnamed } from './lib/content-format.js';
import { drawing, plainImage, sharp } from './lib/images.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const template = join(core, 'site-template/files');
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const rules = JSON.parse(readFileSync(join(core, 'src/format/rules.json'), 'utf8'));

const known = {
  rules,
  coreFields: CORE_FIELDS,
  seoField: SEO_FIELD,
  seoKeys: SEO_KEYS,
  frontmatterKeys: ['title', TRANSLATION_KEY, OLD_ADDRESSES, OTHER_ADDRESSES],
  fieldTypes: FIELD_TYPES,
  settingTypes: SETTING_TYPES,
  identity: IDENTITY,
  builtInTypes: BUILT_IN_TYPES,
  builtInTaxonomies: BUILT_IN_TAXONOMIES,
};

// What shows each element of the rule data on the tour's page, as Astro builds
// it. An element the rule data gains needs its own here.
const shown = {
  elements: {
    paragraph: /<p>A paragraph with /,
    heading: /<h2 id="headings"[^>]*>A heading at level 2<\/h2>.*<h3[^>]*>Level 3<\/h3>.*<h4[^>]*>Level 4<\/h4>.*<h5[^>]*>Level 5<\/h5>.*<h6[^>]*>Level 6<\/h6>/s,
    list: /<ul>.*<ol>/s,
    quote: /<blockquote>.*<cite>Someone, <em>somewhere<\/em><\/cite>.*<\/blockquote>/s,
    code: /<pre class="astro-code[^"]*"[^>]*><code>.*npm test.*<\/code><\/pre>/s,
    table: /<th>Item<\/th>.*<caption>What we packed<\/caption>.*<tfoot>/s,
    footnotes: /<section[^>]*data-footnotes[^>]*>.*A footnote's text\./s,
    embed: /<figure class="konzilo-embed" data-embed="youtube"/,
    image: /<figure><img[^>]*src="\/_astro\/a-tour-3f9a1c2b7d\.[^"]*\.webp"[^>]*><figcaption>/,
    gallery: /<figure class="konzilo-gallery"><figure>.*<figcaption>A farm in summer<\/figcaption><\/figure>/s,
    'post-list': /<ul class="post-list">.*<a href="\/harbour-lights\/">Harbour lights &amp; lanterns<\/a>/s,
    form: /<form class="konzilo-form" id="konzilo-form-contact" method="post" action="\/_konzilo\/forms\/contact"/,
  },
  inline: {
    strong: /<strong>bold<\/strong>/,
    em: /<em>italic<\/em>/,
    a: /<a href="https:\/\/example\.com\/">a link<\/a>.*<a href="\/pages\/about-us\/">a page of the site<\/a>.*<a href="https:\/\/example\.com\/offer" target="_blank" rel/s,
    sup: /mc<sup>2<\/sup>/,
    sub: /H<sub>2<\/sub>O/,
    br: /<br>\s*A line break/,
    code: /<code>inline code<\/code>/,
    s: /<del>struck<\/del>/,
    footnote: /<sup><a href="#user-content-fn-1"/,
  },
};

describe('the content format document', () => {
  const document = contentFormat();
  const marked = markedExamples(document);

  test('names every element, inline element and embed service of the rule data, every field and type, and every built-in type and taxonomy', () => {
    assert.deepEqual(unnamed(document, known), []);
  });

  test('gives site descriptions the checker takes', () => {
    for (const site of Object.values(marked.sites)) assert.doesNotThrow(() => siteDescription(site));
  });

  for (const example of marked.checked.filter((one) => one.language !== 'json')) {
    test(`renders the example at line ${example.line}${example.attributes.read ? ' as it says' : ''}`, () => {
      const { html, problems } = readContentFile(exampleFile(example).contents, { known: registryOf(siteDescription(marked.sites[siteOf(example)])) });
      assert.deepEqual(problems, []);
      if (example.rendered !== undefined) assert.equal(html.trim(), example.rendered.trim());
      assert.ok(siteOf(example) in marked.sites);
    });
  }

  for (const example of marked.checked.filter((one) => one.language === 'json')) {
    test(`writes the JSON example at line ${example.line} with two spaces`, () => {
      const { contents } = exampleFile(example);
      assert.equal(contents, `${JSON.stringify(JSON.parse(contents), null, 2)}\n`);
    });
  }
});

describe('the content format document\'s files, as a site built from the site template', () => {
  let repository;
  let page;

  before(async () => {
    const marked = markedExamples(contentFormat());
    repository = mkdtempSync(join(tmpdir(), 'konzilo-content-format-site-'));
    cpSync(join(template, 'astro.config.mjs'), join(repository, 'astro.config.mjs'));
    cpSync(join(template, 'src'), join(repository, 'src'), { recursive: true });
    writeFileSync(join(repository, 'site-description.json'), JSON.stringify(marked.site));
    const modules = join(repository, 'node_modules');
    mkdirSync(join(modules, '@kntnt'), { recursive: true });
    for (const name of readdirSync(join(core, 'node_modules'))) {
      if (name !== '@kntnt' && !name.startsWith('.')) symlinkSync(join(core, 'node_modules', name), join(modules, name));
    }
    symlinkSync(core, join(modules, '@kntnt/konzilo'));

    const content = join(repository, 'content');
    const files = marked.checked.filter((example) => example.attributes.file && !example.attributes.site).map(exampleFile);
    for (const { path, contents } of files) {
      mkdirSync(dirname(join(content, path)), { recursive: true });
      writeFileSync(join(content, path), contents);
    }
    // A master for each image a file names: the site icon square.
    mkdirSync(join(content, 'media'), { recursive: true });
    const masters = new Set(files.flatMap(({ contents }) => [...contents.matchAll(/media\/([a-z0-9-]+\.(?:webp|svg))/g)].map(([, name]) => name)));
    for (const master of masters) {
      const bytes = master.endsWith('.svg')
        ? drawing(master.includes('site-icon') ? { width: 100, height: 100 } : { width: 320, height: 64 })
        : await plainImage(sharp, { width: 1200, height: 800, format: 'webp' });
      writeFileSync(join(content, 'media', master), bytes);
    }

    const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(built.status, 0, built.stderr + built.stdout);
    const file = join(repository, 'dist/pages/a-tour/index.html');
    page = existsSync(file) ? readFileSync(file, 'utf8') : '';
  });

  after(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  test('shows each element of the rule data on the tour\'s page', () => {
    assert.deepEqual(Object.keys(rules.elements).filter((name) => !shown.elements[name]), [], 'an element with no check of its own');
    for (const [name, pattern] of Object.entries(shown.elements)) assert.match(page, pattern, name);
  });

  test('shows each inline element of the rule data on the tour\'s page', () => {
    assert.deepEqual(Object.keys(rules.inline).filter((name) => !shown.inline[name]), [], 'an element with no check of its own');
    for (const [name, pattern] of Object.entries(shown.inline)) assert.match(page, pattern, name);
  });
});
