// A named slot for each block at the top of a container's body (ADR 0068): Astro's static build
// of a small site whose components lay their bodies out by their trees, `content`, and have the
// core draw each block they place through its slot, `block-<index>`, by the block's index in
// `content.children`. A block drawn so is drawn as the default slot draws it: a component within
// by the site's component, an image with its lightbox, a post list by its presentation, and in
// the live preview with its mark. The site is built as the public site and as the live preview,
// and the slots of a body are read as Body.astro reads them.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bodyParts, registryOf } from '../src/astro/directives.js';
import { siteDescription } from '../src/site-description.js';
import { astroConfig, astroEnvironment, nodeSync } from './lib/astro.js';
import { plainImage, sharp } from './lib/images.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

const site = {
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  components: {
    items: { label: 'Items', form: 'container', body: 'blocks' },
    note: { label: 'Note', form: 'container', body: 'blocks' },
    lead: { label: 'Lead', form: 'container', body: 'blocks' },
    turned: { label: 'Turned', form: 'container', body: 'blocks' },
  },
  types: {
    post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: {} },
    sheet: { label: 'Sheet', plural: 'Sheets', collection: 'sheets', address: '/sheets/{slug}/', elements: ['paragraph', 'heading', 'image', 'post-list', 'items', 'note', 'lead', 'turned'], fields: {} },
  },
  presentations: { list: { label: 'List' } },
};

// Items, which splits its body at its headings, each item a `<details>` with its heading's words
// as its summary and each block below the heading drawn through its slot; a note, which places
// its slot; a lead, which draws the first block of its body alone; turned, which draws its body
// through its default slot and then each block through its own, the last first; and a list's
// presentation, each post's title.
const components = {
  'src/components/Items.astro': [
    '---',
    'const { content } = Astro.props;',
    "const text = (node) => (node.type === 'text' ? node.value : (node.children ?? []).map(text).join(''));",
    'const items = [];',
    'content.children.forEach((node, index) => {',
    "  if (node.type !== 'element') return;",
    "  if (node.tagName === 'h2') items.push({ title: text(node), slots: [] });",
    '  else items.at(-1)?.slots.push(`block-${index}`);',
    '});',
    '---',
    '<div class="items">{items.map(({ title, slots }) => <details class="item"><summary>{title}</summary>{slots.map((name) => <slot name={name} />)}</details>)}</div>',
    '',
  ].join('\n'),
  'src/components/Note.astro': '<aside class="note"><slot /></aside>\n',
  'src/components/Lead.astro': '<div class="lead"><slot name="block-0" /></div>\n',
  'src/components/Turned.astro': [
    '---',
    'const { content } = Astro.props;',
    "const names = content.children.flatMap((node, index) => (node.type === 'element' ? [`block-${index}`] : [])).toReversed();",
    '---',
    '<div class="turned"><slot />{names.map((name) => <slot name={name} />)}</div>',
    '',
  ].join('\n'),
  'src/components/List.astro': '---\nconst { posts } = Astro.props;\n---\n<ul class="list">{posts.map(({ entry }) => <li>{entry.data.title}</li>)}</ul>\n',
};
const options = {
  directives: { items: './src/components/Items.astro', note: './src/components/Note.astro', lead: './src/components/Lead.astro', turned: './src/components/Turned.astro' },
  presentations: { list: './src/components/List.astro' },
};

const template = (collection) => [
  '---',
  "import { getCollection, render } from 'astro:content';",
  `import Body from ${JSON.stringify(join(core, 'src/astro/Body.astro'))};`,
  'export async function getStaticPaths() {',
  `  return (await getCollection(${JSON.stringify(collection)})).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));`,
  '}',
  'const { entry } = Astro.props;',
  'const { Content } = await render(entry);',
  '---',
  '<html><head><title>{entry.data.title}</title></head><body><main><Body post={entry}><Content /></Body></main></body></html>',
  '',
].join('\n');

const post = (title, body) => `---\ntitle: ${JSON.stringify(title)}\n---\n\n${body}\n`;
const list = (number) => `::post-list{type="post" order="title" number="${number}" presentation="list"}`;

const content = {
  'content/articles/alpha.md': post('Alpha', 'A.'),
  'content/articles/bravo.md': post('Bravo', 'B.'),
  'content/articles/charlie.md': post('Charlie', 'C.'),
  'content/articles/delta.md': post('Delta', 'D.'),
  // Three items: a note, an image and a list; then a list and an image below the items.
  'content/sheets/items.md': post('Items', [
    'Before',
    '::::items',
    '## Note',
    ':::note',
    'Inside the note',
    ':::',
    '## Picture',
    '![A barn](../media/barn.webp)',
    '## Posts',
    list(2),
    '::::',
    list(1),
    '![A lake](../media/lake.webp)',
  ].join('\n\n')),
  // A lead whose list and image are in blocks it never draws, and a list below it.
  'content/sheets/lead.md': post('Lead', [':::lead', 'The lead', list(1), '![A barn](../media/barn.webp)', ':::', list(1)].join('\n\n')),
  // The same blocks drawn whole, as a note draws them, with a note within, and an image below.
  'content/sheets/whole.md': post('Whole', ['::::note', 'The lead', list(1), '![A barn](../media/barn.webp)', ':::note', 'Within', ':::', '::::', list(1), '![A lake](../media/lake.webp)'].join('\n\n')),
  // An image and a list drawn twice, the second time the list first, and a list below them.
  'content/sheets/turned.md': post('Turned', [':::turned', '![A barn](../media/barn.webp)', list(1), ':::', list(1)].join('\n\n')),
};

const repositories = [];
after(() => {
  for (const repository of repositories) rmSync(repository, { recursive: true, force: true });
});

// A site repository with the site's files, `files` over them, built; { status, output,
// main(path) }, `main` the HTML of a page's main, its lines joined.
async function build(files, env = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-block-slots-'));
  repositories.push(repository);
  symlinkSync(join(core, 'node_modules'), join(repository, 'node_modules'));
  const write = (path, contents) => {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  };
  write('astro.config.mjs', astroConfig(integration, options));
  write('src/content.config.mjs', `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`);
  write('site-description.json', JSON.stringify(site));
  write('src/pages/sheets/[slug].astro', template('sheets'));
  write('src/pages/[slug].astro', template('articles'));
  write('content/media/barn.webp', await plainImage(sharp, { width: 900, height: 600, format: 'webp' }));
  write('content/media/lake.webp', await plainImage(sharp, { width: 800, height: 600, format: 'webp' }));
  for (const [path, contents] of Object.entries({ ...components, ...content, ...files })) write(path, contents);
  const built = nodeSync([astro, 'build'], { cwd: repository, encoding: 'utf8', env: { ...astroEnvironment, ...env } });
  const main = (path) => /<main>(.*)<\/main>/s.exec(readFileSync(join(repository, 'dist', path, 'index.html'), 'utf8'))?.[1].replaceAll('\n', '');
  return { status: built.status, output: `${built.stdout}\n${built.stderr}`, main };
}

// What an item of Items holds, by its summary.
const item = (html, title) => new RegExp(`<details class="item"><summary>${title}</summary>(.*?)</details>`).exec(html)?.[1];

// Each image of a page that opens in a dialog, in the page's order, [alt, number], where the button
// around it opens the dialog after its figure, and no two dialogs have the same number.
function lightboxes(html) {
  const opened = [...html.matchAll(/<button class="konzilo-lightbox-open" [^>]*commandfor="konzilo-modal-(\d+)"[^>]*><img [^>]*alt="([^"]*)"[^>]*><\/button><\/figure><dialog [^>]*id="konzilo-modal-(\d+)"/g)];
  assert.equal(opened.length, (html.match(/<dialog /g) ?? []).length, 'each dialog after an image that opens it');
  for (const [, button, , dialog] of opened) assert.equal(button, dialog);
  const numbers = opened.map(([, number]) => Number(number));
  assert.equal(new Set(numbers).size, numbers.length, `no number twice: ${numbers}`);
  return opened.map(([, number, alt]) => [alt, Number(number)]);
}

let published;
let previewed;
before(async () => {
  published = await build({});
  previewed = await build({}, { KONZILO_PREVIEW: '1' });
}, { timeout: 600_000 });

describe('a component that draws the blocks of its body through their slots', () => {
  test('draws a component within by the site\'s component, in the build', () => {
    assert.equal(published.status, 0, published.output);
    assert.equal(item(published.main('sheets/items'), 'Note'), '<aside class="note"><p>Inside the note</p></aside>');
  });

  test('draws an image that opens in the lightbox, its dialog with a number of its own on the page, in the build', () => {
    assert.equal(published.status, 0, published.output);
    const main = published.main('sheets/items');
    assert.match(item(main, 'Picture'), /^<figure><button class="konzilo-lightbox-open" type="button" commandfor="(konzilo-modal-\d+)" command="show-modal" [^>]*><img [^>]*alt="A barn"[^>]*><\/button><\/figure><dialog class="konzilo-modal konzilo-lightbox" id="\1" aria-label="Image">.*<\/dialog>$/);
    assert.deepEqual(lightboxes(main).map(([alt]) => alt), ['A barn', 'A lake']);
  });

  test('draws a post list by its presentation, in its place among the body\'s lists, in the build', () => {
    assert.equal(published.status, 0, published.output);
    const main = published.main('sheets/items');
    assert.equal(item(main, 'Posts'), '<ul class="list"><li>Alpha</li><li>Bravo</li></ul>');
    assert.match(main, /<\/div><ul class="list"><li>Charlie<\/li><\/ul>/);
  });

  test('renders no block whose slot is not asked for, and a list in it leaves out of the lists below it what it would show', () => {
    assert.equal(published.status, 0, published.output);
    assert.equal(published.main('sheets/lead'), '<div class="lead"><p>The lead</p></div><ul class="list"><li>Bravo</li></ul>');
    assert.match(published.main('sheets/whole'), /<\/aside><ul class="list"><li>Bravo<\/li><\/ul><figure>/);
  });

  test('draws blocks in any order and as often as asked for, a list the same each time and each dialog with a number of its own', () => {
    assert.equal(published.status, 0, published.output);
    const main = published.main('sheets/turned');
    assert.deepEqual(lightboxes(main).map(([alt]) => alt), ['A barn', 'A barn']);
    const once = '<ul class="list"><li>Alpha</li></ul>';
    assert.match(main, new RegExp(`^<div class="turned"><figure>.*</dialog>${once}${once}<figure>.*</dialog></div><ul class="list"><li>Bravo</li></ul>$`));
  });

  test('in the live preview, marks each block drawn through its slot as the default slot marks it', () => {
    assert.equal(previewed.status, 0, previewed.output);
    const main = previewed.main('sheets/items');
    assert.match(main, /^<p data-konzilo-block="0">Before<\/p><div data-konzilo-block="1" class="items">/);
    assert.equal(item(main, 'Note'), '<aside data-konzilo-block="1.1" class="note"><p data-konzilo-block="1.1.0">Inside the note</p></aside>');
    assert.match(item(main, 'Picture'), /^<figure data-konzilo-block="1.3"><button class="konzilo-lightbox-open" [^>]*><img [^>]*alt="A barn"[^>]*><\/button><\/figure><dialog /);
    assert.equal(item(main, 'Posts'), '<ul data-konzilo-block="1.5" class="list"><li>Alpha</li><li>Bravo</li></ul>');
    assert.match(main, /<\/div><ul data-konzilo-block="2" class="list"><li>Charlie<\/li><\/ul><figure data-konzilo-block="3">/);
  });
});

// A page's main as today's core renders it, but for what the image service and the lightbox write
// within it, which their own tests hold: each image by its alt text alone, and each dialog without
// what it shows.
const pinned = (html) => html.replace(/<img [^>]*?alt="([^"]*)"[^>]*>/g, '<img alt="$1">').replace(/(<dialog [^>]*>).*?<\/dialog>/g, '$1…</dialog>');

describe('a component that renders no slot of a block', () => {
  const barn = (number, mark = '') => `<figure${mark}><button class="konzilo-lightbox-open" type="button" commandfor="konzilo-modal-${number}" command="show-modal" data-konzilo-at="0" aria-label="Show larger: A barn"><img alt="A barn"></button></figure><dialog class="konzilo-modal konzilo-lightbox" id="konzilo-modal-${number}" aria-label="Image">…</dialog>`;
  const lake = (number, mark = '') => barn(number, mark).replaceAll('A barn', 'A lake');

  test('renders a page as it did before a component had a slot for each block, in the build', () => {
    assert.equal(published.status, 0, published.output);
    assert.equal(pinned(published.main('sheets/whole')), [
      '<aside class="note"><p>The lead</p><ul class="list"><li>Alpha</li></ul>',
      barn(2),
      '<aside class="note"><p>Within</p></aside></aside>',
      '<ul class="list"><li>Bravo</li></ul>',
      lake(1),
    ].join(''));
  });

  test('renders a page as it did before a component had a slot for each block, in the live preview', () => {
    assert.equal(previewed.status, 0, previewed.output);
    assert.equal(pinned(previewed.main('sheets/whole')), [
      '<aside data-konzilo-block="0" class="note"><p data-konzilo-block="0.0">The lead</p><ul data-konzilo-block="0.1" class="list"><li>Alpha</li></ul>',
      barn(2, ' data-konzilo-block="0.2"'),
      '<aside data-konzilo-block="0.3" class="note"><p data-konzilo-block="0.3.0">Within</p></aside></aside>',
      '<ul data-konzilo-block="1" class="list"><li>Bravo</li></ul>',
      lake(1, ' data-konzilo-block="2"'),
    ].join(''));
  });
});

// The slots a container is given, as Body.astro reads its body into parts: by each block's index
// in the tree.
describe('the slot of each block', () => {
  const known = registryOf(siteDescription(site));
  const read = (body) => bodyParts(`<div data-directive="note">${body}</div>`, ['note', 'items'], known)[0];
  const slots = (part) => Object.fromEntries(part.blocks.map(({ slot, parts }) => [slot, parts]));

  test('is named by the block\'s index among the nodes at the top of the tree, which text of whitespace alone and a comment take and have no slot of', () => {
    const part = read('\n<h2 id="a">A</h2>\n<!-- note -->\n<p>One &amp; two</p>Loose words<hr>\n');
    assert.deepEqual(part.content.children.map((node) => node.tagName ?? node.type), ['text', 'h2', 'text', 'comment', 'text', 'p', 'text', 'hr', 'text']);
    assert.deepEqual(slots(part), { 'block-1': ['<h2 id="a">A</h2>'], 'block-5': ['<p>One &amp; two</p>'], 'block-6': ['Loose words'], 'block-7': ['<hr>'] });
  });

  test('holds a component within as the same part the body holds, read once', () => {
    const part = read('<p>Before</p>\n<div data-directive="items"><h2 id="b">B</h2></div>\n<blockquote><div data-directive="items"><p>Deep</p></div></blockquote>');
    const [, within, , deep] = part.parts;
    assert.deepEqual(slots(part), { 'block-0': ['<p>Before</p>'], 'block-2': [within], 'block-4': ['<blockquote>', deep, '</blockquote>'] });
    assert.equal(within.name, 'items');
    assert.deepEqual(slots(within), { 'block-0': ['<h2 id="b">B</h2>'] });
  });

  test('is none for a leaf, whose label holds no blocks, and for a body whose top the tree reads otherwise', () => {
    const leaf = { ...site, components: { ...site.components, kicker: { label: 'Kicker', form: 'leaf', body: 'text' } } };
    const [kicker] = bodyParts('<div data-directive="kicker">A <em>kicker</em></div>', ['kicker'], registryOf(siteDescription(leaf)));
    assert.deepEqual(kicker.blocks, []);
    assert.deepEqual(read('<p>One</p></p>').blocks, []);
  });
});
