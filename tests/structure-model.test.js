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
