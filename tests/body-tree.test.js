// A template's post's body as a tree (ADR 0068): Astro's static build of a small site whose
// article's template asks bodyTree() of `@kntnt/konzilo/astro` for its post's body, and whose
// component of its own, around the body it rendered through Body, asks it for the tree of that
// HTML. From the entry, the tree is the one a component's `content` is: each crosshead with its
// ID, a component as its plain rendering, and in the live preview the marks of its blocks. From
// the HTML, it is the page's own: a component as the site's component drew it, and a post list by
// its presentation. The site is built as the public site and as the live preview.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment, nodeSync } from './lib/astro.js';
import { plainImage, sharp } from './lib/images.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

const site = {
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  components: {
    aside: { label: 'Fact box', form: 'container', body: 'blocks', attributes: { anchor: { type: 'string', label: 'Anchor' } } },
    panel: { label: 'Panel', form: 'container', body: 'blocks' },
  },
  types: {
    post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'heading', 'image', 'post-list', 'aside', 'panel'], fields: {} },
  },
  presentations: { list: { label: 'List' } },
};

// A fact box, its anchor its id; a panel, which writes the tree it is given as JSON before its
// slot; a list's presentation, each post's title; and Contents, a template's own component around
// the body Body rendered, which writes the tree of that HTML as JSON before it.
const components = {
  'src/components/Aside.astro': '---\nconst { anchor, content, ...rest } = Astro.props;\n---\n<aside class="fact" id={anchor} {...rest}><slot /></aside>\n',
  'src/components/Panel.astro': '---\nconst { content, ...rest } = Astro.props;\n---\n<section class="panel" {...rest}><script type="application/json" class="content" set:html={JSON.stringify(content)} /><slot /></section>\n',
  'src/components/List.astro': '---\nconst { posts } = Astro.props;\n---\n<ul class="list">{posts.map(({ entry }) => <li>{entry.data.title}</li>)}</ul>\n',
  'src/components/Contents.astro': [
    '---',
    `import { bodyTree } from ${JSON.stringify(integration)};`,
    "const html = (await Astro.slots.render('default')) ?? '';",
    'const tree = await bodyTree(html);',
    '---',
    '<script type="application/json" id="rendered" set:html={JSON.stringify(tree)} />',
    '<Fragment set:html={html} />',
    '',
  ].join('\n'),
};
const options = {
  directives: { aside: './src/components/Aside.astro', panel: './src/components/Panel.astro' },
  presentations: { list: './src/components/List.astro' },
};

// The article's template: the tree of its post's body, from its entry, as JSON, and its body
// through Body, inside Contents.
const template = [
  '---',
  "import { getCollection, render } from 'astro:content';",
  `import { bodyTree } from ${JSON.stringify(integration)};`,
  `import Body from ${JSON.stringify(join(core, 'src/astro/Body.astro'))};`,
  "import Contents from '../components/Contents.astro';",
  'export async function getStaticPaths() {',
  "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
  '}',
  'const { entry } = Astro.props;',
  'const { Content } = await render(entry);',
  'const tree = await bodyTree(entry);',
  '---',
  '<html><head><title>{entry.data.title}</title></head><body><script type="application/json" id="tree" set:html={JSON.stringify(tree)} /><main><Contents><Body post={entry}><Content /></Body></Contents></main></body></html>',
  '',
].join('\n');

const post = (title, body) => `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body}\n`;
const content = {
  'content/articles/alpha.md': post('Alpha', 'A.'),
  'content/articles/bravo.md': post('Bravo', 'B.'),
  // A lede, two crossheads, one with an anchor of its own, a fact box with an anchor, a panel
  // holding a heading and an image, and a list of two posts.
  'content/articles/hello.md': post('Hello', [
    'Lede',
    '## <a id="start"></a>The start',
    '### Getting there',
    ':::aside{anchor="in-short"}',
    '### Facts',
    'Words',
    ':::',
    ':::panel',
    '## Inside',
    '![A barn](../media/barn.webp)',
    ':::',
    '::post-list{type="post" order="title" number="2" presentation="list"}',
  ].join('\n\n')),
};

const repositories = [];
after(() => {
  for (const repository of repositories) rmSync(repository, { recursive: true, force: true });
});

// The JSON a page, `html`, holds in the script of that id, and what each panel was given as its
// tree, in the page's order. A dev server writes attributes of its own after an element's.
const json = (html, id) => JSON.parse(new RegExp(`<script type="application/json" id="${id}"[^>]*>(.*?)</script>`, 's').exec(html)[1]);
const contentsOf = (html) => [...html.matchAll(/<script type="application\/json" class="content"[^>]*>(.*?)<\/script>/gs)].map(([, text]) => JSON.parse(text));

// The site repository, with what it is made of written.
async function siteRepository() {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-body-tree-'));
  repositories.push(repository);
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  const write = (path, contents) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  };
  write('astro.config.mjs', astroConfig(integration, options));
  write('src/content.config.mjs', `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`);
  write('site-description.json', JSON.stringify(site));
  write('src/pages/[slug].astro', template);
  write('content/media/barn.webp', await plainImage(sharp, { width: 900, height: 600, format: 'webp' }));
  for (const [path, contents] of Object.entries({ ...components, ...content })) write(path, contents);
  return repository;
}

// The site, built; { status, output, json(id), contents() }, of the article's page.
async function build(env = {}) {
  const repository = await siteRepository();
  const built = nodeSync([astro, 'build'], { cwd: repository, encoding: 'utf8', env: { ...astroEnvironment, ...env } });
  const page = () => readFileSync(join(repository, 'dist/hello/index.html'), 'utf8');
  return { status: built.status, output: `${built.stdout}\n${built.stderr}`, json: (id) => json(page(), id), contents: () => contentsOf(page()) };
}

const elements = (tree) => tree.children.filter((node) => node.type === 'element');
// An element as `tag#id.class[property=value]`, by the properties that say what it is.
const named = ({ tagName, properties }) => [
  tagName,
  properties.id ? `#${properties.id}` : '',
  ...(properties.className ?? []).map((name) => `.${name}`),
  ...['dataDirective', 'dataAnchor', 'dataKonziloBlock'].filter((key) => Object.hasOwn(properties, key)).map((key) => `[${key}=${properties[key]}]`),
].join('');
const words = (node) => (node.type === 'text' ? node.value : (node.children ?? []).map(words).join(''));
const marked = (node) => (node.properties?.dataKonziloBlock !== undefined ? 1 : 0) + (node.children ?? []).reduce((count, child) => count + marked(child), 0);

let published;
let previewed;
before(async () => {
  published = await build();
  previewed = await build({ KONZILO_PREVIEW: '1' });
}, { timeout: 600_000 });

describe("a post's body as a tree, from its entry", () => {
  test('holds each crosshead with its ID, and a component as its plain rendering, with its anchor', () => {
    assert.equal(published.status, 0, published.output);
    const tree = published.json('tree');
    assert.equal(tree.type, 'root');
    assert.deepEqual(elements(tree).map(named), [
      'p',
      'h2#start',
      'h3#getting-there',
      'div[dataDirective=aside][dataAnchor=in-short]',
      'div[dataDirective=panel]',
      'div[dataDirective=post-list]',
    ]);
    const aside = elements(tree)[3];
    assert.deepEqual(elements(aside).map(named), ['h3#facts', 'p']);
  });

  test("is, for a component's part, the tree the component is given as its `content`", () => {
    assert.equal(published.status, 0, published.output);
    const panel = elements(published.json('tree')).find(({ properties }) => properties.dataDirective === 'panel');
    const [content] = published.contents();
    assert.equal(content.type, 'root');
    assert.deepEqual(panel.children, content.children);
    assert.deepEqual(elements(content).map(named), ['h2#inside', 'figure']);
  });

  test('holds no mark in a public build', () => {
    assert.equal(published.status, 0, published.output);
    assert.equal(marked(published.json('tree')), 0);
  });

  test("in the live preview holds the marks of its blocks, as a component's `content` does", () => {
    assert.equal(previewed.status, 0, previewed.output);
    const tree = previewed.json('tree');
    assert.deepEqual(elements(tree).map(named), [
      'p[dataKonziloBlock=0]',
      'h2#start[dataKonziloBlock=1]',
      'h3#getting-there[dataKonziloBlock=2]',
      'div[dataDirective=aside][dataAnchor=in-short][dataKonziloBlock=3]',
      'div[dataDirective=panel][dataKonziloBlock=4]',
      'div[dataDirective=post-list][dataKonziloBlock=5]',
    ]);
    const panel = elements(tree)[4];
    const [content] = previewed.contents();
    assert.deepEqual(panel.children, content.children);
    assert.deepEqual(elements(content).map(named), ['h2#inside[dataKonziloBlock=4.0]', 'figure[dataKonziloBlock=4.1]']);
  });
});

describe('the tree of the HTML a template rendered through Body', () => {
  test("holds each crosshead with its ID, a component as the site's component drew it, with its anchor, and a post list by its presentation", () => {
    assert.equal(published.status, 0, published.output);
    const tree = published.json('rendered');
    assert.equal(tree.type, 'root');
    assert.deepEqual(elements(tree).map(named), ['p', 'h2#start', 'h3#getting-there', 'aside#in-short.fact', 'section.panel', 'ul.list']);
    assert.deepEqual(elements(elements(tree)[5]).map(words), ['Alpha', 'Bravo']);
    assert.equal(marked(tree), 0);
  });

  test('in the live preview holds the marks of the page, a component\'s on its root', () => {
    assert.equal(previewed.status, 0, previewed.output);
    const tree = previewed.json('rendered');
    assert.deepEqual(elements(tree).map(named).slice(0, 5), [
      'p[dataKonziloBlock=0]',
      'h2#start[dataKonziloBlock=1]',
      'h3#getting-there[dataKonziloBlock=2]',
      'aside#in-short.fact[dataKonziloBlock=3]',
      'section.panel[dataKonziloBlock=4]',
    ]);
  });
});

// The live preview is Astro's dev server, which renders a page as it is asked for it.
describe("the live preview's dev server", () => {
  let server;
  let origin;

  before(async () => {
    const repository = await siteRepository();
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // In the foreground, which Astro leaves for the background when it finds itself run by an
    // agent, unless told to ignore its lock file.
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: { ...astroEnvironment, KONZILO_PREVIEW: '1' }, stdio: 'ignore', detached: true });
    await until(async () => (await fetch(`${origin}/hello/`)).ok);
  }, { timeout: 120_000 });

  after(() => {
    // The dev server and what it started, as one process group.
    try {
      process.kill(-server.pid);
    } catch {
      // It has ended already.
    }
  });

  test("gives the tree from the entry with the marks of its blocks, as a component's `content`", async () => {
    const html = await (await fetch(`${origin}/hello/`)).text();
    const tree = json(html, 'tree');
    assert.deepEqual(elements(tree).map(named), [
      'p[dataKonziloBlock=0]',
      'h2#start[dataKonziloBlock=1]',
      'h3#getting-there[dataKonziloBlock=2]',
      'div[dataDirective=aside][dataAnchor=in-short][dataKonziloBlock=3]',
      'div[dataDirective=panel][dataKonziloBlock=4]',
      'div[dataDirective=post-list][dataKonziloBlock=5]',
    ]);
    const [content] = contentsOf(html);
    assert.deepEqual(elements(tree)[4].children, content.children);
  });
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

async function until(check, timeout = 90_000) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // Not answering yet.
    }
    if (Date.now() > end) throw new Error(`still not so after ${timeout / 1000} seconds`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
