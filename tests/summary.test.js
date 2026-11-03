// A post's summary: its excerpt, or, without one, the start of
// its body as plain text, footnote marks out, cut at a word to at most 160
// characters, with `…` when cut. The title tag's and the meta description's
// templates name it as {{ post.auto_description }}, and the feeds  and
// llms.txt  show it too. A post is given as Astro hands a template an
// entry: its frontmatter as `data` and its body, Markdown as the exporter
// writes it, as `body`.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summary } from '../src/astro/summary.js';

const LONG = 'At dusk the keeper climbs the tower, trims the wick, polishes the glass and lights the lantern, so that the fishing boats coming home after dark find the harbour mouth between the rocks without fear.';

test('a post with an excerpt is summed up by its excerpt, whole', () => {
  assert.equal(summary({ data: { excerpt: `${LONG} ${LONG}` }, body: 'The body.' }), `${LONG} ${LONG}`);
});

test('a post without one is summed up by its body\'s text, without footnote marks, footnotes, code, images or embeds', () => {
  const body = [
    '## <a id="why"></a>Why lanterns',
    '',
    'Lanterns keep _ships_ off the rocks[^1] and `light()` them home.',
    '',
    '![A lantern](../media/lantern-0123456789.webp)\\',
    'The lantern at night',
    '',
    '```js',
    'light();',
    '```',
    '',
    '- Oil',
    '- Glass',
    '',
    '> Keep it lit.',
    '',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    '',
    '[^1]: Since 1850.',
  ].join('\n');

  assert.equal(summary({ data: {}, body }), 'Why lanterns Lanterns keep ships off the rocks and light() them home. Oil Glass Keep it lit.');
  assert.equal(summary({ data: { excerpt: '' }, body: 'Only this.' }), 'Only this.');
});

test('a body longer than 160 characters is cut at a word, with … within the 160', () => {
  assert.equal(
    summary({ data: {}, body: LONG }),
    'At dusk the keeper climbs the tower, trims the wick, polishes the glass and lights the lantern, so that the fishing boats coming home after dark find the…',
  );
  // A word that ends right where the room ends is kept.
  const exact = `Every evening ${LONG.slice('At dusk '.length)}`;
  assert.equal(
    summary({ data: {}, body: exact }),
    'Every evening the keeper climbs the tower, trims the wick, polishes the glass and lights the lantern, so that the fishing boats coming home after dark find the…',
  );
  assert.equal([...summary({ data: {}, body: exact })].length, 160);
  // Text of 160 characters is whole; a word longer than the room is cut in it.
  assert.equal(summary({ data: {}, body: 'å'.repeat(160) }), 'å'.repeat(160));
  assert.equal(summary({ data: {}, body: 'å'.repeat(161) }), `${'å'.repeat(159)}…`);
});

test('a post with neither an excerpt nor body text has an empty summary', () => {
  assert.equal(summary({ data: {}, body: '' }), '');
  assert.equal(summary({ data: {}, body: '```\ncode();\n```' }), '');
});
