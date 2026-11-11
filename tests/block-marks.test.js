// The live preview's marks on a body's blocks: each top-level block by its place, and within a
// directive's body and a list, each block and item by its path below it, so that a click on the
// page leads to the right place in a field, and a field can show the page a block.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { markdownToHtml } from 'satteri';
import { blockMarks } from '../src/astro/block-marks.js';
import { directiveReader, registryOf } from '../src/astro/directives.js';
import { markdownFeatures, markdownHastPlugins } from '../src/astro/reader.js';
import { siteDescription } from '../src/site-description.js';

const site = siteDescription({
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  components: { section: { label: 'Section', form: 'container', body: 'blocks' } },
  types: { page: { label: 'Page', plural: 'Pages', collection: 'pages', address: '/{slug}/', elements: ['paragraph', 'heading', 'list', 'section'] } },
});
const marked = (body) => markdownToHtml(body, { features: markdownFeatures, mdastPlugins: [directiveReader(() => {}, { known: registryOf(site) })], hastPlugins: [...markdownHastPlugins, blockMarks] }).html;
const marks = (html) => [...html.matchAll(/<(\w+)[^>]*data-konzilo-block="([^"]+)"/g)].map(([, tag, path]) => `${tag} ${path}`);

test('marks each block by its place, and each block within a directive and each list item by its path', () => {
  const html = marked('Before\n\n:::section\n\n## Inside\n\n- One\n- Two\n  - Deeper\n\n:::\n\nAfter');
  assert.deepEqual(marks(html), ['p 0', 'div 1', 'h2 1.0', 'ul 1.1', 'li 1.1.0', 'li 1.1.1', 'li 1.1.1.0', 'p 2']);
});

test("a directive's mark is no attribute of its own, nor an option of a post list's presentation", async () => {
  const { bodyParts, registry } = await import('../src/astro/directives.js');
  const html = '<div data-directive="post-list" data-type="article" data-presentation="cards" data-konzilo-block="1.2"></div>';
  const [part] = bodyParts(html, ['post-list'], registry);
  assert.equal(part.block, '1.2');
  assert.equal(Object.hasOwn(part.attributes, 'konziloBlock'), false);
});
