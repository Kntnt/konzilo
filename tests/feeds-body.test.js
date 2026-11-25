// An incoming feed's item's text as a post's body (ADR 0079): its HTML turned into the body
// elements the post's type takes, each such as the intake publishes, with an element the type does
// not take left out, its text kept as paragraphs where it has one, and named so that the build
// warns of it; its images, media and scripts never taken. A plain text is paragraphs.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { feedBody } from '../src/feeds/body.js';
import { siteDescription } from '../src/site-description.js';
import { run, sourcePost } from './lib/intake.js';

const declared = {
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    story: { label: 'Story', plural: 'Stories', collection: 'stories', address: '/{slug}/', elements: ['paragraph', 'heading', 'list', 'quote', 'code', 'table', 'image'] },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'] },
  },
};
const site = siteDescription(declared);
const BASE = 'https://news.example.com/releases/1';
// What the intake makes of a body in a post of a type: its problems, which a feed's post must not
// have, since its text is what the feed gave.
const published = (body, type) => {
  const result = run({ [`${site.types[type].collection}/aaaaaaaaaaaa.md`]: sourcePost({ title: 'From a feed', status: 'published' }, body) }, declared);
  assert.deepEqual(result.refusals, [], body);
};
const made = (text, type) => {
  const given = feedBody(text, { site, type: site.types[type], base: BASE });
  published(given.body, type);
  return given;
};
const article = (html) => made({ html }, 'story');
const note = (html) => made({ html }, 'note');

describe('an item\'s HTML, in a type that takes it', () => {
  test('makes paragraphs with their inline formats, each link a whole address', () => {
    assert.deepEqual(article('<p>The <b>whole</b> text, <em>in</em> <a href="/x">a link</a>, <code>code</code>, <s>old</s>, H<sub>2</sub>O and <a href="mailto:press@example.com">mail</a>.</p><p>Second<br>line</p>'), {
      body: 'The **whole** text, _in_ [a link](https://news.example.com/x), `code`, ~~old~~, H<sub>2</sub>O and [mail](mailto:press@example.com).\n\nSecond\\\nline',
      dropped: [],
    });
  });

  test('keeps the text of a link that leads nowhere a page can, and of a tag it does not know', () => {
    assert.deepEqual(article('<p><a href="javascript:alert(1)">Click</a> or <span class="x"><u>this</u></span> <a>anchor</a>.</p>'), { body: 'Click or this anchor.', dropped: [] });
  });

  test('makes headings from level 2, a level 1 among them', () => {
    assert.deepEqual(article('<h1>Big</h1><h2>Two</h2><h4>Four <i>it</i></h4><p>Text</p>'), { body: '## Big\n\n## Two\n\n#### Four _it_\n\nText', dropped: [] });
  });

  test('makes lists, a list within an item among them', () => {
    assert.deepEqual(article('<ul><li>Fruit<ul><li>Apple</li><li>Pear</li></ul></li><li><p>Vegetables</p></li></ul><ol><li>First</li><li>Second</li></ol>'), {
      body: '- Fruit\n  - Apple\n  - Pear\n- Vegetables\n\n1. First\n2. Second',
      dropped: [],
    });
  });

  test('makes a quote of its paragraphs, and a code block of preformatted text', () => {
    assert.deepEqual(article('<blockquote><p>Words worth repeating.</p><p>Twice.</p></blockquote><pre><code>npm ci\nnpm test\n</code></pre>'), {
      body: '> Words worth repeating.\n>\n> Twice.\n\n```\nnpm ci\nnpm test\n```',
      dropped: [],
    });
  });

  test('makes a simple table a table', () => {
    assert.deepEqual(article('<table><thead><tr><th>Item</th><th>Price</th></tr></thead><tbody><tr><td>Tent</td><td>120 | 130</td></tr></tbody></table>'), {
      body: '| Item | Price |\n| --- | --- |\n| Tent | 120 \\| 130 |',
      dropped: [],
    });
  });

  test('escapes what Markdown would read as more than text', () => {
    assert.deepEqual(article('<p>2*3*4, [brackets], snake_case, `ticks`, &lt;b&gt;, a $5 and $10 fee, at 10:30, ~tilde~ and a back\\slash.</p><p># Not a heading</p><p>2024. A year</p><p>- not a list</p><p>+ nor this</p>'), {
      body: '2\\*3\\*4, \\[brackets\\], snake\\_case, \\`ticks\\`, \\<b>, a \\$5 and \\$10 fee, at 10\\:30, \\~tilde\\~ and a back\\\\slash.\n\n\\# Not a heading\n\n2024\\. A year\n\n\\- not a list\n\n\\+ nor this',
      dropped: [],
    });
  });

  test('makes nothing of an empty text', () => {
    assert.deepEqual(article(''), { body: '', dropped: [] });
    assert.deepEqual(article('<p> </p><div><br></div>'), { body: '', dropped: [] });
  });

  test('takes nothing of images, media, frames, scripts and forms, and says nothing of them', () => {
    assert.deepEqual(article('<p>Before <img src="a.jpg" alt="A"> after.</p><figure><img src="b.jpg"><figcaption>The caption</figcaption></figure><iframe src="https://video.example.com/1"></iframe><video src="c.mp4"></video><script>alert(1)</script><style>p{}</style><form><input name="x"></form><p>End</p>'), {
      body: 'Before after.\n\nThe caption\n\nEnd',
      dropped: [],
    });
  });

  test('makes a paragraph of text that stands in a container of its own', () => {
    assert.deepEqual(article('<div>Loose text <b>here</b><p>A paragraph</p>more loose</div>'), { body: 'Loose text **here**\n\nA paragraph\n\nmore loose', dropped: [] });
  });
});

describe('an item\'s HTML, in a type that takes paragraphs alone', () => {
  test('keeps the text of headings, lists, quotes and code blocks as paragraphs, and names each', () => {
    assert.deepEqual(note('<h2>Title</h2><ul><li>One</li><li>Two<ol><li>Deep</li></ol></li></ul><blockquote><p>Said.</p></blockquote><pre>a\nb</pre>'), {
      body: 'Title\n\nOne\n\nTwo\n\nDeep\n\nSaid.\n\na\\\nb',
      dropped: ['heading', 'list', 'quote', 'code'],
    });
  });

  test('leaves a table out, and names it', () => {
    assert.deepEqual(note('<p>Prices:</p><table><tr><td>Tent</td><td>120</td></tr></table>'), { body: 'Prices:', dropped: ['table'] });
  });
});

describe('a table that is no simple table', () => {
  test('is left out, even in a type that takes tables, and named', () => {
    assert.deepEqual(article('<table><tr><td colspan="2">Merged</td></tr><tr><td>a</td><td>b</td></tr></table>'), { body: '', dropped: ['table'] });
  });
});

describe('an item\'s plain text', () => {
  test('is paragraphs, by its blank lines, a line break within each kept', () => {
    assert.deepEqual(made({ plain: 'Line one <not a tag>\nline two\n\nA *second* one' }, 'note'), {
      body: 'Line one \\<not a tag>\\\nline two\n\nA \\*second\\* one',
      dropped: [],
    });
  });
});
