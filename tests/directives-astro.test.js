// Directives on the site: Astro's static build of a small site
// whose posts hold the suite's directives (directives/registry.json, in a
// copy of the core's package, lib/test-core.js). A site renders a post's
// body through the integration's Body component, which puts each directive
// the site gives a component of its own (`konzilo({ directives })`) in place
// of the directive's plain rendering, given its attributes and its body; a
// directive without one shows its plain rendering. The build refuses a
// content file with a directive the registry refuses, naming the file, the
// line and the reason.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CACHE_DIR, astroEnvironment } from './lib/astro.js';
import { testCore } from './lib/test-core.js';

const registry = JSON.parse(readFileSync(new URL('./directives/registry.json', import.meta.url), 'utf8'));
const core = testCore(registry);
const repositories = [];
after(() => {
  for (const repository of repositories) rmSync(repository, { recursive: true, force: true });
  core.remove();
});

const { default: konzilo } = await import(core.url('src/astro/index.js'));

const integration = join(core.root, 'src/astro/index.js');
// What the tests' own components draw a body's tree with.
const treeHtmlFile = fileURLToPath(new URL('./lib/tree-html.js', import.meta.url));
const astro = join(core.root, 'node_modules/astro/bin/astro.mjs');
const site = {
  types: {
    post: {
      label: 'Article',
      plural: 'Articles',
      collection: 'articles',
      address: '/{slug}/',
      elements: ['paragraph', 'list', ...Object.keys(registry)],
      fields: {},
    },
  },
};
const page = [
  '---',
  "import { getCollection, render } from 'astro:content';",
  `import Body from ${JSON.stringify(join(core.root, 'src/astro/Body.astro'))};`,
  'export async function getStaticPaths() {',
  "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
  '}',
  'const { entry } = Astro.props;',
  'const { Content } = await render(entry);',
  '---',
  '<article><Body><Content /></Body></article>',
  '',
].join('\n');

// The site's components: a badge that shows its attributes and their
// types, and a note that shows its title and its body.
const components = {
  'src/components/Badge.astro': '---\nconst { label, count, wide, tone } = Astro.props;\n---\n<mark class="site-badge">{label}, {typeof count}, {String(wide)}, {tone}</mark>\n',
  'src/components/Note.astro': '---\nconst { title } = Astro.props;\n---\n<aside class="site-note"><b>{title}</b><slot /></aside>\n',
};

const post = (body) => `---\ntitle: "Hello world"\n---\n\n${body}\n`;
const body = [
  'Before',
  '::badge{label="New" count="3"}',
  ':::note{title="Mind the gap"}',
  'Inside at 10\\:30',
  '::badge{label="In"}',
  ':::',
  '::callout[Read **this**]{tone="warning"}',
].join('\n\n');

// A site repository with `files`, built; { status, output, html(slug) }.
// `environment`: what the build's environment adds, such as the live
// preview's KONZILO_PREVIEW. `command`: Astro's, `build` or `dev`; a dev
// server that has not stopped within a minute is ended, its status null.
function build(files, directives = {}, described = site, environment = {}, command = 'build') {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-directives-'));
  repositories.push(repository);
  // The core's dependencies, each on its own, for a package of the site's to stand among them.
  mkdirSync(join(repository, 'node_modules'));
  for (const entry of readdirSync(join(core.root, 'node_modules'))) {
    if (!entry.startsWith('.')) symlinkSync(join(core.root, 'node_modules', entry), join(repository, 'node_modules', entry));
  }
  const write = (path, contents) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  };
  write('astro.config.mjs', `import konzilo from ${JSON.stringify(integration)};\n\nexport default { cacheDir: './${CACHE_DIR}', vite: { cacheDir: './${CACHE_DIR}/vite' }, integrations: [konzilo({ directives: ${JSON.stringify(directives)} })] };\n`);
  write('src/content.config.mjs', `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`);
  write('site-description.json', JSON.stringify(described));
  write('src/pages/[slug].astro', page);
  for (const [path, contents] of Object.entries({ ...components, ...files })) write(path, contents);
  // A dev server in the foreground, which Astro leaves for the background when it finds itself
  // run by an agent, unless told to ignore its lock file.
  const args = command === 'dev' ? ['dev', '--host', '127.0.0.1', '--port', '0', '--ignore-lock'] : [command];
  const built = spawnSync(process.execPath, [astro, ...args], { cwd: repository, encoding: 'utf8', env: { ...astroEnvironment, ...environment }, timeout: 60_000 });
  const article = (slug) => /<article>(.*)<\/article>/s.exec(readFileSync(join(repository, `dist/${slug}/index.html`), 'utf8'))?.[1];
  return { status: built.status, output: `${built.stdout}\n${built.stderr}`, article };
}

describe('Astro', () => {
  test("renders each directive the site gives a component with that component, given its attributes and its body, and the others as their plain rendering", () => {
    const built = build({ 'content/articles/hello-world.md': post(body) }, { badge: './src/components/Badge.astro', note: './src/components/Note.astro' });
    assert.equal(built.status, 0, built.output);
    assert.equal(built.article('hello-world').replaceAll('\n', ''), [
      '<p>Before</p>',
      '<mark class="site-badge">New, number, false, info</mark>',
      '<aside class="site-note"><b>Mind the gap</b><p>Inside at 10:30</p><mark class="site-badge">In, undefined, false, info</mark></aside>',
      '<div data-directive="callout" data-tone="warning">Read <strong>this</strong></div>',
    ].join(''));
  });

  test('takes a component from a package, by the package\'s name', () => {
    const built = build({
      'node_modules/@acme/design/package.json': JSON.stringify({ name: '@acme/design', version: '1.0.0', type: 'module', exports: { './*.astro': './*.astro' }, peerDependencies: { astro: '*' } }),
      'node_modules/@acme/design/Badge.astro': '---\nconst { label } = Astro.props;\n---\n<mark class="package-badge">{label}</mark>\n',
      'package.json': JSON.stringify({ name: 'a-site', dependencies: { '@acme/design': '1.0.0' } }),
      'content/articles/hello-world.md': post('::badge{label="New"}'),
    }, { badge: '@acme/design/Badge.astro' });
    assert.equal(built.status, 0, built.output);
    assert.match(built.article('hello-world'), /<mark class="package-badge">New<\/mark>/);
  });

  // A template may place Body with no slot, or with a post whose body is empty.
  test('renders an empty body where Body\'s slot renders nothing, or where it has none', () => {
    const built = build({
      'content/articles/hello-world.md': post(body),
      'content/articles/empty.md': '---\ntitle: "Empty"\n---\n',
      'src/pages/bare.astro': `---\nimport Body from ${JSON.stringify(join(core.root, 'src/astro/Body.astro'))};\n---\n<article><Body /></article>\n`,
    }, { badge: './src/components/Badge.astro', note: './src/components/Note.astro' });
    assert.equal(built.status, 0, built.output);
    assert.equal(built.article('empty').trim(), '');
    assert.equal(built.article('bare').trim(), '');
  });

  test('renders every directive as its plain rendering when the site gives no component', () => {
    const built = build({ 'content/articles/hello-world.md': post(body) });
    assert.equal(built.status, 0, built.output);
    assert.equal(built.article('hello-world').replaceAll('\n', ''), [
      '<p>Before</p>',
      '<div data-directive="badge" data-label="New" data-count="3" data-wide="false" data-tone="info"></div>',
      '<div data-directive="note" data-title="Mind the gap"><p>Inside at 10:30</p><div data-directive="badge" data-label="In" data-wide="false" data-tone="info"></div></div>',
      '<div data-directive="callout" data-tone="warning">Read <strong>this</strong></div>',
    ].join(''));
  });

  test('refuses a content file holding a directive the registry refuses, naming the file, the line and the reason', () => {
    const built = build({
      'content/articles/hello-world.md': post('Fine'),
      'content/articles/refused.md': post('Before\n\n::badge{count="many"}'),
    });
    assert.notEqual(built.status, 0);
    assert.match(built.output, /content\/articles\/refused\.md: line 7: the site cannot publish the setting "count" with the value "many"/);
  });
});

describe("a site's own components", () => {
  const own = {
    components: {
      panel: { label: 'Panel', form: 'container', body: 'blocks', attributes: { tone: { type: 'string', label: 'Tone', values: ['plain', 'bright'], default: 'plain' } } },
      kicker: { label: 'Kicker', form: 'leaf', body: 'text' },
      list: { label: 'Series', form: 'container', body: 'blocks', attributes: {} },
    },
    types: { post: { ...site.types.post, elements: ['paragraph', 'list', 'heading', 'panel', 'kicker', 'list-directive'] } },
  };
  const ownBody = [
    ':::panel{tone="bright"}',
    '::kicker[A _kicker_]',
    '## Inside',
    '::::list',
    '- One\n- Two',
    '::::',
    ':::',
  ].join('\n\n');

  test('renders the components the site description declares, as their plain rendering or by the component the site gives', () => {
    const plain = build({ 'content/articles/hello-world.md': post(ownBody) }, {}, own);
    assert.equal(plain.status, 0, plain.output);
    assert.equal(plain.article('hello-world').replaceAll('\n', ''), [
      '<div data-directive="panel" data-tone="bright">',
      '<div data-directive="kicker">A <em>kicker</em></div>',
      '<h2 id="inside">Inside</h2>',
      '<div data-directive="list"><ul><li>One</li><li>Two</li></ul></div>',
      '</div>',
    ].join(''));
    const given = build({ 'content/articles/hello-world.md': post(ownBody) }, { panel: './src/components/Note.astro' }, own);
    assert.equal(given.status, 0, given.output);
    assert.match(given.article('hello-world'), /<aside class="site-note"><b><\/b><div data-directive="kicker">/);
  });

  // A panel that lays itself out by what it holds, read from its body as a tree, and draws
  // the tree; a kicker that reads its label as a tree; a divider, which has no body.
  const fromTree = {
    'src/components/Panel.astro': [
      '---',
      `import { treeHtml } from ${JSON.stringify(treeHtmlFile)};`,
      'const { tone, content } = Astro.props;',
      "const headings = content.children.filter((node) => node.type === 'element' && /^h[2-6]$/.test(node.tagName)).length;",
      '---',
      '<section class="site-panel" data-tone={tone} data-headings={headings}><Fragment set:html={treeHtml(content)} /></section>',
      '',
    ].join('\n'),
    'src/components/Kicker.astro': "---\nconst { content } = Astro.props;\n---\n<p class=\"site-kicker\">{content.children.map((node) => node.type).join(' ')}</p>\n",
    'src/components/Divider.astro': "---\n---\n<hr class=\"site-divider\" data-content={String(Astro.props.content)} />\n",
  };
  const withDivider = {
    ...own,
    components: { ...own.components, divider: { label: 'Divider', form: 'leaf', body: 'none' } },
    types: { post: { ...own.types.post, elements: [...own.types.post.elements, 'divider'] } },
  };
  const treeBody = ['::kicker[A _kicker_]', ownBody, '::divider'].join('\n\n');
  const treeComponents = { panel: './src/components/Panel.astro', kicker: './src/components/Kicker.astro', divider: './src/components/Divider.astro' };

  test('gives a component its body as a tree as well, in `content`, a nested component in it as its plain rendering', () => {
    const built = build({ 'content/articles/hello-world.md': post(treeBody), ...fromTree }, treeComponents, withDivider);
    assert.equal(built.status, 0, built.output);
    assert.equal(built.article('hello-world').replaceAll('\n', ''), [
      '<p class="site-kicker">text element</p>',
      '<section class="site-panel" data-tone="bright" data-headings="1">',
      '<div data-directive="kicker">A <em>kicker</em></div>',
      '<h2 id="inside">Inside</h2>',
      '<div data-directive="list"><ul><li>One</li><li>Two</li></ul></div>',
      '</section>',
      '<hr class="site-divider" data-content="undefined">',
    ].join(''));
  });

  test("in the live preview, the tree's blocks hold their marks, so that a component drawn from it keeps them", () => {
    const built = build({ 'content/articles/hello-world.md': post(treeBody), ...fromTree }, treeComponents, withDivider, { KONZILO_PREVIEW: '1' });
    assert.equal(built.status, 0, built.output);
    const article = built.article('hello-world').replaceAll('\n', '');
    assert.match(article, /<p data-konzilo-block="0" class="site-kicker">text element<\/p>/);
    assert.equal(/<section [^>]*class="site-panel"[^>]*>.*<\/section>/.exec(article)?.[0], [
      '<section data-konzilo-block="1" class="site-panel" data-tone="bright" data-headings="1">',
      '<div data-directive="kicker" data-konzilo-block="1.0">A <em>kicker</em></div>',
      '<h2 data-konzilo-block="1.1" id="inside">Inside</h2>',
      '<div data-directive="list" data-konzilo-block="1.2"><ul data-konzilo-block="1.2.0"><li data-konzilo-block="1.2.0.0">One</li><li data-konzilo-block="1.2.0.1">Two</li></ul></div>',
      '</section>',
    ].join(''));
  });

  test("puts each table in its box, simple or structured, in the body and in a component's tree, its mark on the box in the live preview", () => {
    const withTables = { ...withDivider, types: { post: { ...withDivider.types.post, elements: [...withDivider.types.post.elements, 'table'] } } };
    const tablesBody = [
      '| A | B |\n| --- | ---: |\n| 1 | 2 |',
      ':::panel',
      '<table>\n<caption>Packed</caption>\n<thead>\n<tr><th>Item</th></tr>\n</thead>\n<tbody>\n<tr><td>Tent</td></tr>\n</tbody>\n</table>',
      ':::',
    ].join('\n\n');
    const files = { 'content/articles/hello-world.md': post(tablesBody), ...fromTree };
    const published = build(files, treeComponents, withTables);
    const previewed = build(files, treeComponents, withTables, { KONZILO_PREVIEW: '1' });
    assert.equal(published.status, 0, published.output);
    assert.equal(previewed.status, 0, previewed.output);
    assert.equal(published.article('hello-world').replaceAll('\n', ''), [
      '<div class="konzilo-table"><table><thead><tr><th>A</th><th style="text-align: right">B</th></tr></thead><tbody><tr><td>1</td><td style="text-align: right">2</td></tr></tbody></table></div>',
      '<section class="site-panel" data-tone="plain" data-headings="0">',
      '<div class="konzilo-table"><table><caption>Packed</caption><thead><tr><th>Item</th></tr></thead><tbody><tr><td>Tent</td></tr></tbody></table></div>',
      '</section>',
    ].join(''));
    assert.equal(previewed.article('hello-world').replaceAll('\n', ''), [
      '<div class="konzilo-table" data-konzilo-block="0"><table><thead><tr><th>A</th><th style="text-align: right">B</th></tr></thead><tbody><tr><td>1</td><td style="text-align: right">2</td></tr></tbody></table></div>',
      '<section data-konzilo-block="1" class="site-panel" data-tone="plain" data-headings="0">',
      '<div class="konzilo-table" data-konzilo-block="1.0"><table><caption>Packed</caption><thead><tr><th>Item</th></tr></thead><tbody><tr><td>Tent</td></tr></tbody></table></div>',
      '</section>',
    ].join(''));
  });

  for (const command of ['build', 'dev']) {
    test(`stops ${command === 'dev' ? 'a dev server' : 'a build'} at a site description the checker refuses with the checker's own problems, before it holds the site's components against it`, () => {
      const twice = { ...own, types: { ...own.types, news: { ...own.types.post, label: 'News item', plural: 'News', collection: 'news' } } };
      const started = build({ 'content/articles/hello-world.md': post('Fine') }, { panel: './src/components/Note.astro' }, twice, {}, command);
      assert.equal(typeof started.status, 'number', started.output);
      assert.notEqual(started.status, 0);
      assert.match(started.output, /the site description is not valid:\n\s+types\.news\.address: \/\{slug\}\/ is also the address of types\.post/);
      assert.doesNotMatch(started.output, /the site gives a component for the directive/);
    });
  }

  test('refuses a value a component does not take, naming the file and the line', () => {
    const built = build({ 'content/articles/hello-world.md': post(':::panel{tone="dark"}\n\nText\n\n:::') }, {}, own);
    assert.notEqual(built.status, 0);
    assert.match(built.output, /content\/articles\/hello-world\.md: line 5: the site cannot publish the setting "tone" with the value "dark"/);
  });

  test('takes the components a package declares, and draws them by the package\'s components', () => {
    const taking = {
      componentsFrom: '@acme/design/components.json',
      componentLabels: { panel: { label: { sv: 'Panel' } } },
      types: { post: { ...site.types.post, elements: ['paragraph', 'panel'] } },
    };
    const files = {
      'node_modules/@acme/design/package.json': JSON.stringify({ name: '@acme/design', version: '1.0.0', type: 'module', exports: { './*.astro': './*.astro', './components.json': './components.json' }, peerDependencies: { astro: '*' } }),
      'node_modules/@acme/design/components.json': JSON.stringify({ panel: own.components.panel }),
      'node_modules/@acme/design/Panel.astro': '---\nconst { tone } = Astro.props;\n---\n<section class="package-panel" data-tone={tone}><slot /></section>\n',
      'package.json': JSON.stringify({ name: 'a-site', dependencies: { '@acme/design': '1.0.0' } }),
    };
    const built = build({ ...files, 'content/articles/hello-world.md': post(':::panel{tone="bright"}\n\nInside\n\n:::') }, { panel: '@acme/design/Panel.astro' }, taking);
    assert.equal(built.status, 0, built.output);
    assert.equal(built.article('hello-world').replaceAll('\n', ''), '<section class="package-panel" data-tone="bright"><p>Inside</p></section>');
    const refused = build({ ...files, 'content/articles/hello-world.md': post(':::panel{tone="dark"}\n\nText\n\n:::') }, { panel: '@acme/design/Panel.astro' }, taking);
    assert.notEqual(refused.status, 0);
    assert.match(refused.output, /content\/articles\/hello-world\.md: line 5: the site cannot publish the setting "tone" with the value "dark"/);
  });
});

// In the live preview, each component's block is marked on its own root, so that a design's
// child selectors see the page as published (docs/site-design.md, *The live preview*).
describe("a site's own components in the live preview", () => {
  const own = {
    components: {
      section: { label: 'Section', form: 'container', body: 'blocks', attributes: { tone: { type: 'string', label: 'Tone', values: ['plain', 'bright'], default: 'plain' } } },
      kicker: { label: 'Kicker', form: 'leaf', body: 'text' },
      pair: { label: 'Pair', form: 'leaf', body: 'none' },
      words: { label: 'Words', form: 'leaf', body: 'none' },
      bare: { label: 'Bare', form: 'container', body: 'blocks' },
    },
    types: { post: { ...site.types.post, elements: ['paragraph', 'heading', 'section', 'kicker', 'pair', 'words', 'bare'] } },
  };
  // A section that places its mark itself, on its root; a kicker, one
  // element, and a pair, two side by side, that place none; words, which render no element; and
  // a bare container, which renders its blocks with nothing around them.
  const designed = {
    'src/components/Section.astro': '<section class="site-section" data-konzilo-block={Astro.props["data-konzilo-block"]}><div class="site-band"><slot /></div></section>\n',
    'src/components/Kicker.astro': '<p class="site-kicker"><slot /></p>\n',
    'src/components/Pair.astro': '<b class="site-pair">One</b><i class="site-pair">Two</i>\n',
    'src/components/Words.astro': 'Only words\n',
    'src/components/Bare.astro': '<slot />\n',
  };
  const given = { section: './src/components/Section.astro', kicker: './src/components/Kicker.astro', pair: './src/components/Pair.astro', words: './src/components/Words.astro', bare: './src/components/Bare.astro' };
  const nested = ['Before', '::::section{tone="bright"}', '::kicker[A _kicker_]', '## Inside', ':::section', 'Deep', ':::', '::pair', '::words', ':::bare', 'Bare', ':::', '::::', '::words', ':::bare', 'Bare too', ':::'].join('\n\n');

  test('puts each mark on the root the component renders, its own or the core\'s, and a wrapper only at the top of the body, where nothing else can hold it', () => {
    const built = build({ ...designed, 'content/articles/hello-world.md': post(nested) }, given, own, { KONZILO_PREVIEW: '1' });
    assert.equal(built.status, 0, built.output);
    assert.equal(built.article('hello-world').replaceAll('\n', ''), [
      '<p data-konzilo-block="0">Before</p>',
      '<section class="site-section" data-konzilo-block="1"><div class="site-band">',
      '<p data-konzilo-block="1.0" class="site-kicker">A <em>kicker</em></p>',
      '<h2 data-konzilo-block="1.1" id="inside">Inside</h2>',
      '<section class="site-section" data-konzilo-block="1.2"><div class="site-band"><p data-konzilo-block="1.2.0">Deep</p></div></section>',
      '<b data-konzilo-block="1.3" class="site-pair">One</b><i data-konzilo-block="1.3" class="site-pair">Two</i>',
      'Only words',
      '<p data-konzilo-block="1.5.0">Bare</p>',
      '</div></section>',
      '<div class="konzilo-preview-part" data-konzilo-block="2">Only words</div>',
      '<div class="konzilo-preview-part" data-konzilo-block="3"><p data-konzilo-block="3.0">Bare too</p></div>',
    ].join(''));
  });

  test('lets a component that passes the props it does not take to its root leave the tree out, so that its root holds no `content` and holds its mark in the live preview', () => {
    const passing = { ...designed, 'src/components/Section.astro': '---\nconst { content, tone, ...rest } = Astro.props;\n---\n<section class="site-section" data-tone={tone} {...rest}><slot /></section>\n' };
    const files = { ...passing, 'content/articles/hello-world.md': post(':::section{tone="bright"}\n\nInside\n\n:::') };
    const published = build(files, given, own);
    const previewed = build(files, given, own, { KONZILO_PREVIEW: '1' });
    assert.equal(published.status, 0, published.output);
    assert.equal(previewed.status, 0, previewed.output);
    assert.equal(published.article('hello-world').replaceAll('\n', ''), '<section class="site-section" data-tone="bright"><p>Inside</p></section>');
    assert.equal(previewed.article('hello-world').replaceAll('\n', ''), '<section class="site-section" data-tone="bright" data-konzilo-block="0"><p data-konzilo-block="0.0">Inside</p></section>');
  });

  test('keeps a component\'s script, as the public site has it', () => {
    const scripted = { ...designed, 'src/components/Kicker.astro': '<p class="site-kicker"><slot /></p>\n<script>document.documentElement.dataset.kicker = "ran";</script>\n' };
    const files = { ...scripted, 'content/articles/hello-world.md': post(nested) };
    const scripts = (built) => built.article('hello-world').match(/<script\b[^>]*>[^<]*<\/script>/g);
    const published = build(files, given, own);
    const previewed = build(files, given, own, { KONZILO_PREVIEW: '1' });
    assert.equal(previewed.status, 0, previewed.output);
    assert.equal(scripts(published).length, 1, published.article('hello-world'));
    assert.deepEqual(scripts(previewed), scripts(published));
    assert.match(previewed.article('hello-world'), /<p data-konzilo-block="1.0" class="site-kicker">/);
  });

  test('gives a component no mark on the public site', () => {
    const built = build({ ...designed, 'content/articles/hello-world.md': post(nested) }, given, own);
    assert.equal(built.status, 0, built.output);
    assert.equal(built.article('hello-world').replaceAll('\n', ''), [
      '<p>Before</p>',
      '<section class="site-section"><div class="site-band">',
      '<p class="site-kicker">A <em>kicker</em></p>',
      '<h2 id="inside">Inside</h2>',
      '<section class="site-section"><div class="site-band"><p>Deep</p></div></section>',
      '<b class="site-pair">One</b><i class="site-pair">Two</i>',
      'Only words',
      '<p>Bare</p>',
      '</div></section>',
      'Only words',
      '<p>Bare too</p>',
    ].join(''));
  });
});

test('the integration refuses a component for a directive the registry has not got', () => {
  const built = build({ 'content/articles/hello-world.md': post('Fine'), 'src/components/Poll.astro': '<p>Poll</p>\n' }, { poll: './src/components/Poll.astro' });
  assert.notEqual(built.status, 0);
  assert.match(built.output, /the site gives a component for the directive poll, which neither the rule data nor the site description declares/);
});

test('the integration still refuses a component for the post list, which it renders itself', () => {
  assert.throws(() => konzilo({ directives: { 'post-list': './src/components/List.astro' } }), /renders the directive post-list itself/);
});
