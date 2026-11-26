// The structure field's model: a body of the exact form as a tree of its levels, written back
// byte for byte, each node at the path the live preview marks its block with.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdownToHtml } from 'satteri';
import { blockMarks } from '../src/astro/block-marks.js';
import { directiveReader, registryOf } from '../src/astro/directives.js';
import { markdownFeatures, markdownHastPlugins } from '../src/astro/reader.js';
import { everyNode, nodeAt, parseBody, pathTo, summaryOf, writeBody } from '../src/cms/structure/model.js';
import { siteDescription } from '../src/site-description.js';

const site = siteDescription({
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  components: {
    section: { label: 'Section', form: 'container', body: 'blocks', attributes: { surface: { type: 'string', values: ['page', 'raised'], default: 'page' } } },
    eyebrow: { label: 'Eyebrow', form: 'leaf', body: 'text' },
  },
  types: { page: { label: 'Page', plural: 'Pages', collection: 'pages', address: '/{slug}/', elements: ['paragraph', 'heading', 'list', 'section', 'eyebrow'], editor: 'structure' } },
});
const body = '::::section{surface="raised"}\n\n::eyebrow[Opening _hours_]\n\n## Every day\n\n:::section\n\n- [ ] One\n- Two\n\n:::\n\n::::\n\nAfter';

test('reads a body as its levels and writes it back byte for byte', () => {
  const root = parseBody(body);
  assert.equal(writeBody(root), body);
  assert.deepEqual(root.children.map((node) => node.kind), ['container', 'paragraph']);
  assert.equal(summaryOf(root.children[0]), 'Every day');
  assert.equal(siteDescription(site).types.page.editor, 'structure');
});

test('finds each node at the path the preview marks its block with', () => {
  const root = parseBody(body);
  const { html } = markdownToHtml(body, { features: markdownFeatures, mdastPlugins: [directiveReader(() => {}, { known: registryOf(site) })], hastPlugins: [...markdownHastPlugins, blockMarks] });
  const marked = [...html.matchAll(/data-konzilo-block="([^"]+)"/g)].map(([, path]) => path);
  for (const path of marked) assert.ok(nodeAt(root, path.split('.').map(Number)), `a node at ${path}`);
  const paths = [...everyNode(root)].map((node) => pathTo(root, node).join('.'));
  assert.deepEqual(paths.filter((path) => !marked.includes(path)), [], 'and a mark for each node');
});

test('sums up an item that is a picture by its alt text', () => {
  const root = parseBody(':::section\n\n- ![The harbour office](/media/a.webp)\n- [![The guild](/media/b.webp)](/guild/)\n\n:::');
  const [list] = root.children[0].children;
  assert.deepEqual(list.children.map((item) => summaryOf(item)), ['The harbour office', 'The guild']);
});

test('reads an image with a display width as an image, and writes it back with it', () => {
  const written = '![A flow](/media/flow.webp "width=632")\n\n![A photo](/media/photo.webp)';
  const root = parseBody(written);
  assert.deepEqual(root.children.map(({ kind, alt, width }) => [kind, alt, width]), [['image', 'A flow', 632], ['image', 'A photo', null]]);
  assert.equal(writeBody(root), written);
  root.children[1].width = 300;
  root.children[0].width = null;
  assert.equal(writeBody(root), '![A flow](/media/flow.webp)\n\n![A photo](/media/photo.webp "width=300")');
});

test('reads an image with a focal point as an image, keeps it as it was, and writes a moved one', () => {
  const written = '![A flow](/media/flow.webp "width=632 focus=0.25,0.4")\n\n![A photo](/media/photo.webp "focus=0.9,0.1")';
  const root = parseBody(written);
  assert.deepEqual(root.children.map(({ kind, width, focalPoint }) => [kind, width, focalPoint]), [['image', 632, { x: 0.25, y: 0.4 }], ['image', null, { x: 0.9, y: 0.1 }]]);
  assert.equal(writeBody(root), written);
  root.children[0].focalPoint = null;
  root.children[1].focalPoint = { x: 0.5, y: 0 };
  assert.equal(writeBody(root), '![A flow](/media/flow.webp "width=632")\n\n![A photo](/media/photo.webp "focus=0.5,0")');
  assert.equal(parseBody('![A flow](/media/flow.webp "focus=2,0")').children[0].kind, 'paragraph', 'and one the intake refuses as its text');
});

// As the intake reads an image's title (imageTitleIn() of format/body.js): a width with a
// leading zero is its number, and one past the widest is none, which the intake refuses.
test('reads a display width as the intake does: one with a leading zero as its number, one past the widest as no image', () => {
  const [zero] = parseBody('![A flow](/media/flow.webp "width=0632")').children;
  assert.deepEqual([zero.kind, zero.width], ['image', 632]);
  const wide = '![A flow](/media/flow.webp "width=20000")';
  const [past] = parseBody(wide).children;
  assert.equal(past.kind, 'paragraph', 'kept as its text, for the intake to refuse');
  assert.equal(writeBody(parseBody(wide)), wide);
  assert.equal(parseBody('![A flow](/media/flow.webp "width=0")').children[0].kind, 'paragraph');
});
