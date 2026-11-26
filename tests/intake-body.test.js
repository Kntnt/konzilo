// The body check: what a source holds, whatever its bytes, and the exact form it comes out
// in. Exact bytes are the intake's job, so a padded table, another bullet or a bare address
// in angle brackets make no difference; references are followed and image paths replaced.
// It imports nothing, so that the field can run it in the browser.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBody, formulaText, writtenAsBlock } from '../src/format/body.js';
import { embedOf } from '../src/format/embeds.js';
import rules from '../src/format/rules.json' with { type: 'json' };
import { reader } from '../src/intake/reader.js';
import { everyElement, namedImages, pageFile, pagePath, pageSource, run, sourcePost, written } from './lib/intake.js';

const out = (body, site = everyElement, extra = {}) => {
  const result = run({ [pagePath]: pageSource(body), ...extra }, site);
  assert.deepEqual(result.refusals.map((one) => one.message), []);
  return { text: written(result)['pages/hello-world.md'], warnings: result.warnings.filter(({ post }) => post) };
};

const evened = [
  ['bullets', '* One\n* Two', '- One\n- Two'],
  ['a plus', '+ One', '- One'],
  ['numbers as typed', '1. One\n1. Two\n1. Three', '1. One\n2. Two\n3. Three'],
  ['a closing paren', '1) One', '1. One'],
  ['indents', '-   One\n    - Two', '- One\n  - Two'],
  ['a setext heading', 'A heading\n---', '## A heading'],
  ['a closed heading', '## A heading ##', '## A heading'],
  ['other markers', '*Italic* and __bold__, ~one~', '_Italic_ and **bold**, ~~one~~'],
  ['raw marks that need none', '<strong>Bold</strong>, <em>italic</em> and <del>gone</del>', '**Bold**, _italic_ and ~~gone~~'],
  ['spaces out of bold and italic', 'A<strong> bold </strong>word and an<em> italic </em>one', 'A **bold** word and an _italic_ one'],
  ['empty runs', 'Nothing <strong></strong>here', 'Nothing here'],
  ['runs side by side', '<strong>One</strong><strong>two</strong> and <del>three</del><del> four</del>', '**Onetwo** and ~~three four~~'],
  ['a non-breaking space by name', 'Ten&nbsp;kg', 'Ten kg'],
  ['a character by name', 'Caf&eacute; &amp; b&#228;r', 'Café & bär'],
  ['a backslash line break by spaces', 'One line  \nthe next', 'One line\\\nthe next'],
  ['a padded table', '| A    | B |\n|:----|---:|\n|  1   |  2 |', '| A | B |\n| :--- | ---: |\n| 1 | 2 |'],
  ['a short row', '| A | B |\n| - | - |\n| 1 |', '| A | B |\n| --- | --- |\n| 1 |  |'],
  ['a table without its outer pipes', 'A | B\n--- | ---\n1 | 2', '| A | B |\n| --- | --- |\n| 1 | 2 |'],
  ['a tilde fence', '~~~\ncode\n~~~', '```\ncode\n```'],
  ['an indented code block', '    code', '```\ncode\n```'],
  ['spaces at the ends of code lines', '```\nfirst   \nsecond\t\n```', '```\nfirst\nsecond\n```'],
  ['a bare address in angle brackets', '<https://vimeo.com/76979871>', 'https://vimeo.com/76979871'],
  ['an address that needs them', '<https://codepen.io/a-coder/pen/gfdDu>', 'https://codepen.io/a-coder/pen/gfdDu'],
  ['a link without attributes', '<a href="https://example.com/">Here</a>', '[Here](https://example.com/)'],
  ['attributes in another order', '<a rel="ugc" target="_blank" href="/x/">Here</a>', '<a href="/x/" target="_blank" rel="ugc">Here</a>'],
  ['a link alone whose text is its address', '[https://example.com](https://example.com)', '[https<!-- -->://example.com](https://example.com)'],
  ['a bare address in a sentence', 'See https://example.com today', 'See [https://example.com](https://example.com) today'],
  ['a loose address', 'See www.example.com', 'See [www.example.com](http://www.example.com)'],
  ['a colon typed bare', 'At 10:30 and :smile:', 'At 10\\:30 and :smile:'],
  ['a bare leaf that is no directive', '::note', '\\::note'],
  ['footnotes by name, out of order', 'One[^b] two[^a].\n\n[^a]: A.\n\n[^b]: B.', 'One[^1] two[^2].\n\n[^1]: B.\n\n[^2]: A.'],
  ['a footnote on two lines', 'One[^1].\n\n[^1]: One\\\n  two', 'One[^1].\n\n[^1]: One\\\n    two'],
  ['a citation with spaces', '> Words.\n>\n> <cite> Someone </cite>', '> Words.\n>\n> <cite>Someone</cite>'],
  ['an empty citation', '> Words.\n>\n> <cite></cite>', '> Words.'],
  ['a caption of spaces', '<table>\n<caption>  </caption>\n<thead>\n<tr><th>A</th></tr>\n</thead>\n<tbody>\n<tr><td>1</td></tr>\n</tbody>\n</table>', '| A |\n| --- |\n| 1 |'],
  ['a table in other spacing', '<table><thead><tr>\n  <th>A</th></tr></thead><tfoot><tr><td> 1 </td></tr></tfoot></table>', '<table>\n<thead>\n<tr><th>A</th></tr>\n</thead>\n<tfoot>\n<tr><td>1</td></tr>\n</tfoot>\n</table>'],
  ['a cell\'s attributes in another order', '<table>\n<thead>\n<tr><th style="text-align:right" colspan="2">A</th></tr>\n</thead>\n<tbody>\n<tr><td style="text-align: right">1</td><td>2</td></tr>\n</tbody>\n</table>', '<table>\n<thead>\n<tr><th colspan="2" style="text-align: right">A</th></tr>\n</thead>\n<tbody>\n<tr><td style="text-align: right">1</td><td>2</td></tr>\n</tbody>\n</table>'],
  ['an empty paragraph', 'One\n\n&#32;\n\nTwo', 'One\n\nTwo'],
  ['a block formula on one line', '$$x^2 + y^2$$', '$$\nx^2 + y^2\n$$'],
  ['a block formula begun beside its $$', '$$ x^2\n+ y\n$$', '$$\nx^2\n+ y\n$$'],
  ['spaces and blank lines in a block formula', '$$\n\nx  \n\n  y\t\n\n$$', '$$\nx\n\n  y\n$$'],
  ['a formula over two lines of its paragraph', 'A $x\ny$ here', 'A $x y$ here'],
  ['a $ escaped where it need not be', 'It costs \\$5 and \\$10', 'It costs $5 and $10'],
  ['a formula in a sentence', 'Write $x$ here', 'Write $x$ here'],
];

for (const [what, source, exact] of evened) {
  test(`evens out ${what}`, () => {
    assert.equal(out(source).text, pageFile(exact));
    assert.equal(out(exact).text, pageFile(exact), 'and what it writes stands');
  });
}

test('takes a level per block, and only where the reader needs it', () => {
  assert.equal(out('A [link](https://example.com/).\n\nAt www<!-- -->.example.com.\n\nA \\[link\\]: /x\n\n<strong>"Bold"</strong>s').text, pageFile('A [link](https://example.com/).\n\nAt www<!-- -->.example.com.\n\nA [link]: /x\n\n<strong>"Bold"</strong>s'));
});

test('a code block drops its language, and says so', () => {
  const { text, warnings } = out('```js\nlet x;\n```');
  assert.equal(text, pageFile('```\nlet x;\n```'));
  assert.match(warnings[0].reason, /"js" is left out/);
  assert.deepEqual(warnings[0].block, { path: '1', name: 'code' });
});

const linkSite = (target) => ({ [`pages/targettarget.md`]: sourcePost({ title: 'The guide', slug: 'a-guide', status: target }) });

test('writes an internal link out as its target\'s address, in every block', () => {
  const body = '## About [the guide](konzilo:targettarget)\n\n- See [it](konzilo:targettarget#the-start)\n\n> Back to <a href="konzilo:targettarget" rel="nofollow">it</a>.';
  assert.equal(out(body, everyElement, linkSite('published')).text, pageFile('## About [the guide](/a-guide/)\n\n- See [it](/a-guide/#the-start)\n\n> Back to <a href="/a-guide/" rel="nofollow">it</a>.'));
});

test('writes a link to what has no page as its text alone, with a warning, and back again', () => {
  const body = 'Read [the **guide**](konzilo:targettarget) first.';
  const { text, warnings } = out(body, everyElement, linkSite('draft'));
  assert.equal(text, pageFile('Read the **guide** first.'));
  assert.equal(warnings[0].reason, 'the site shows "the guide" without its link until "The guide" is published');
  assert.deepEqual(warnings[0].block, { path: '1', name: 'paragraph' });
  assert.equal(out(body, everyElement, linkSite('published')).text, pageFile('Read [the **guide**](/a-guide/) first.'));
});

test('replaces an image\'s path with its master, from where the file is', () => {
  const site = { ...everyElement, types: { page: { ...everyElement.types.page, hierarchical: true, address: '/{path}/' } } };
  const files = {
    'pages/parentparent.md': sourcePost({ title: 'Parent', slug: 'parent', status: 'published' }),
    'pages/childchild00.md': sourcePost({ title: 'Child', slug: 'child', parent: 'parentparent', status: 'published' }, '![A barn](/media/barn-faf546aae9.jpg)\\\nThe barn'),
  };
  const result = run(files, site);
  assert.deepEqual(result.refusals, []);
  assert.equal(written(result)['pages/parent/child.md'], '---\ntitle: "Child"\ndate: 2026-11-03T12:00:00Z\nmodified: 2026-11-03T12:00:00Z\n---\n\n![A barn](../../media/child-faf546aae9.webp)\\\nThe barn\n');
  assert.equal(written(result)['media/child-faf546aae9.webp'], 'the master of media/barn-faf546aae9.jpg');
});

test('keeps an image\'s display width, its title, alone and in a gallery, in the exact form', () => {
  const source = "![A flow](/media/flow-faf546aae9.png 'width=0632')\\\nThe flow\n\n![One](/media/one-500a71b248.png (width=300))\n![Two](/media/two-3f9a1c2b7d.png)";
  const { text } = out(source);
  assert.equal(text, pageFile('![A flow](../media/hello-world-faf546aae9.webp "width=632")\\\nThe flow\n\n![One](../media/hello-world-500a71b248.webp "width=300")\n![Two](../media/hello-world-3f9a1c2b7d.webp)'));
  assert.equal(out(text.split('---\n\n')[1].trim()).text, text, 'and reads it back the same');
});

test('warns of no image with a display width of its own for being narrow, standing alone, and still refuses one narrower than the smallest', () => {
  const site = { ...everyElement, images: { smallestWidth: 400, displayWidth: 1280 } };
  const body = '![Sized](/media/sized.png "width=400")\n\n![Filling](/media/filling.png)\n\n![In a gallery](/media/one.png "width=400")\n![Beside it](/media/two.png)';
  const narrow = run({ [pagePath]: pageSource(body) }, site, { images: namedImages({ width: 800, height: 500 }) });
  assert.deepEqual(narrow.refusals, []);
  assert.deepEqual(narrow.warnings.filter(({ post }) => post).map(({ name, block, values }) => [name, block.path, values.name]), [
    ['warning.image-narrow', '2', 'filling.png'],
    ['warning.image-narrow', '3', 'one.png'],
    ['warning.image-narrow', '3', 'two.png'],
  ]);
  const small = run({ [pagePath]: pageSource('![Sized](/media/sized.png "width=200")') }, site, { images: namedImages({ width: 300, height: 200 }) });
  assert.deepEqual(small.refusals.map(({ name, values }) => [name, values]), [['refusal.image-small', { width: 300, smallest: 400 }]]);
});

// Its size is chosen only where it is drawn at it: one wider than its master is drawn at the
// master's width, which is narrow as before.
test('warns of an image standing alone whose display width is wider than its master, as of one with none', () => {
  const site = { ...everyElement, images: { smallestWidth: 400, displayWidth: 1280 } };
  const wide = run({ [pagePath]: pageSource('![Stretched](/media/stretched.png "width=2000")') }, site, { images: namedImages({ width: 800, height: 500 }) });
  assert.deepEqual(wide.refusals, []);
  assert.deepEqual(wide.warnings.filter(({ post }) => post).map(({ name, values }) => [name, values.name, values.width]), [['warning.image-narrow', 'stretched.png', 800]]);
  const just = run({ [pagePath]: pageSource('![Just](/media/just.png "width=800")') }, site, { images: namedImages({ width: 800, height: 500 }) });
  assert.deepEqual(just.warnings.filter(({ post }) => post), [], 'not of one drawn at its master\'s own width');
});

test('writes a post list\'s attributes in the registry\'s order, off their defaults, its terms as slugs', () => {
  const site = {
    ...everyElement,
    taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories' } },
    types: { page: { ...everyElement.types.page, fields: { categories: { taxonomy: 'category' } } } },
  };
  const list = '::post-list{presentation="list" number="10" offset="0" include="category:termtermterm,news" date="false" type="page" pages="true"}';
  const { text } = out(list, site, { 'categories/termtermterm.json': { name: 'Local', slug: 'local' }, 'categories/newsnewsnews.json': { name: 'News', slug: 'news' } });
  assert.equal(text.split('---\n\n')[1], '::post-list{type="page" include="category:local,news" pages="true" presentation="list"}\n');
});

test('writes a list shown on the first page alone with firstPage after pages, and leaves out firstPage at its default', () => {
  const { text } = out('::post-list{firstPage="true" presentation="list" type="page" number="3"}\n\n::post-list{type="page" firstPage="false" pages="true" presentation="list"}');
  assert.equal(text.split('---\n\n')[1], '::post-list{type="page" number="3" firstPage="true" presentation="list"}\n\n::post-list{type="page" pages="true" presentation="list"}\n');
});

// A page has a date and a last change, so a list of pages may be ordered by either.
test('takes a list of pages ordered by their date or their last change', () => {
  for (const order of ['date', 'modified']) {
    const { text } = out(`::post-list{type="page" order="${order}" presentation="list"}`);
    assert.equal(text.split('---\n\n')[1], `::post-list{type="page" order="${order}" presentation="list"}\n`, order);
  }
});

test('reads a source the same with any other parser that gives the same tree', () => {
  const hands = {
    reader: { tree: (text) => reader.tree(text) },
    rules,
    embedOf,
    elements: Object.keys(rules.elements),
    link: () => ({ href: '/x/' }),
    image: (address) => ({ src: address }),
  };
  assert.equal(checkBody('* One', hands).body, '- One');
});

test('whatever an editor types comes back as typed, in any block, and is a fixed point', () => {
  const hands = { reader, rules, embedOf, elements: Object.keys(rules.elements), link: () => ({ href: '/x/' }), image: (address) => ({ src: address }) };
  const pieces = ['$', '*', '_', '`', '~', '[', ']', '(', ')', '<', '>', '&', '#', '|', '\\', ':', '!', '-', '+', '=', '.', '1', 'a', ' ', '^', '"', 'www.', '@', 'b', '/', ';', '{', '}', 'é', ' '];
  let seed = 1;
  const next = (below) => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed % below;
  };
  const textOf = (nodes) => nodes.map((node) => node.value ?? textOf(node.children ?? [])).join('');
  const shapes = [
    [(text) => text, ([first]) => first.children],
    [(text) => `## ${text}`, ([first]) => first.children],
    [(text) => `- ${text}`, ([first]) => first.children[0].children[0].children],
    [(text) => `> ${text}`, ([first]) => first.children[0].children],
    [(text) => `| A |\n| --- |\n| ${text} |`, ([first]) => first.children[1].children[0].children],
  ];
  for (let round = 0; round < 300; round += 1) {
    const typed = Array.from({ length: 1 + next(12) }, () => pieces[next(pieces.length)]).join('').trim();
    if (typed === '') continue;
    // Every character of punctuation escaped: the plainest way to say that it is text.
    const source = [...typed].map((c) => (/[!-/:-@[-`{-~]/.test(c) ? `\\${c}` : c)).join('');
    for (const [shape, read] of shapes) {
      const { body, problems } = checkBody(shape(source), hands);
      assert.deepEqual(problems, [], typed);
      assert.equal(textOf(read(reader.tree(body).children)).replaceAll('<!-- -->', ''), typed);
      assert.equal(checkBody(body, hands).body, body, typed);
    }
  }
});

test('imports nothing, so that the field can run it in the browser', () => {
  const text = readFileSync(fileURLToPath(new URL('../src/format/body.js', import.meta.url)), 'utf8');
  assert.doesNotMatch(text, /^\s*import\b|\bimport\(|\brequire\(/m);
});

test('keeps each task\'s box, ticked or not, beside plain items, and escapes a plain item that begins as a box', () => {
  const { text } = out('* [ ] Ask\n* [X] Asked\n* Plain\n  1. [ ] Nested\n* \\[ ] Not a task');
  assert.equal(text, pageFile('- [ ] Ask\n- [x] Asked\n- Plain\n  1. [ ] Nested\n- \\[ \\] Not a task'));
});

test('takes an image in a list\'s item, as a link too, resolved to its master', () => {
  const { text } = out('- ![Harbour](/media/harbour.png)\n- [![Guild](/media/harbour.png)](https://example.com/)', everyElement, { 'media/harbour.png': 'an original' });
  assert.match(text, /^- !\[Harbour\]\(\.\.\/media\/hello-world-[0-9a-f]{10}\.webp\)\n- \[!\[Guild\]\(\.\.\/media\/hello-world-[0-9a-f]{10}\.webp\)\]\(https:\/\/example\.com\/\)$/m);
});

// A site whose pages take formulas of one kind, or of none.
const takingFormulas = (...kinds) => ({ ...everyElement, types: { page: { ...everyElement.types.page, elements: ['paragraph', 'quote', ...kinds] } } });
const refusalsOf = (body, site = everyElement) => run({ [pagePath]: pageSource(body) }, site).refusals.map(({ name, block, values }) => ({ name, block: block?.name, values }));

test('a formula a digit or another formula follows ends with the empty comment', () => {
  for (const exact of ['The $n$<!-- -->2 term', 'Both $x$<!-- -->$y$ at once']) {
    assert.equal(out(exact).text, pageFile(exact));
  }
  assert.equal(out('The $n$<!---->2 term').text, pageFile('The $n$<!-- -->2 term'));
});

test('a formula in a table\'s cell keeps a pipe in it escaped', () => {
  const exact = '| Norm |\n| --- |\n| $\\|x\\|$ |';
  assert.equal(out(exact).text, pageFile(exact));
});

test('a $ beside a formula, in a quote and in an image\'s alt text is written so that it stays text', () => {
  for (const [source, exact] of [
    // A `\$` ends a formula a `$` before it opened, so the `$` before 10 needs its backslash too.
    ['It costs $5 and \\$10, and \\$x$ too', 'It costs $5 and \\$10, and \\$x$ too'],
    ['Pay \\$5, now $x$', 'Pay $5, now $x$'],
    ['> Pay \\$5 for \\$y$', '> Pay \\$5 for \\$y$'],
    ['![A \\$x$ sign](/media/a.png)', '![A \\$x$ sign](../media/hello-world-612e706e67.webp)'],
  ]) {
    const { text } = out(source, everyElement, { 'media/a.png': 'an original' });
    assert.equal(text, pageFile(exact), source);
    assert.equal(out(exact.replace('../media/hello-world-612e706e67.webp', '/media/a.png'), everyElement, { 'media/a.png': 'an original' }).text, pageFile(exact), 'and what it writes stands');
  }
});

test('a type that takes no formula reads a $ as text, as before formulas, and writes it so that the site does too', () => {
  const none = takingFormulas();
  assert.equal(out('$x^2$ and $$y$$', none).text, pageFile('\\$x^2$ and \\$\\$y\\$\\$'));
  assert.equal(out('\\$x^2$ and \\$\\$y\\$\\$', none).text, pageFile('\\$x^2$ and \\$\\$y\\$\\$'));
  assert.deepEqual(refusalsOf('$$\nx\n$$', none).map(({ name }) => name), ['refusal.soft-break']);
});

test('a type that takes block formulas alone reads $…$ as text', () => {
  const blocks = takingFormulas('block-math');
  assert.equal(out('Write $x$ here', blocks).text, pageFile('Write \\$x$ here'));
  assert.equal(out('$$\nx^2\n$$', blocks).text, pageFile('$$\nx^2\n$$'));
  assert.deepEqual(refusalsOf('$$\nx\n$$', takingFormulas('inline-math')), [{ name: 'refusal.element-not-taken', block: 'block-math', values: { element: { name: 'body.element.block-math', values: {} } } }]);
});

test('a block formula stands at the top of a body', () => {
  assert.deepEqual(refusalsOf('> $$\n> x\n> $$').map(({ name, block }) => [name, block]), [['refusal.quote-block', 'quote']]);
  assert.deepEqual(refusalsOf('- $$x$$').map(({ name, block }) => [name, block]), [['refusal.math-block-place', 'list']]);
});

// One writing of an inline formula and one test of `$$` in a text, for the intake, the field and
// the site alike.
test('an inline formula is written between two `$`, a `|` escaped in a cell, the empty comment after it where a digit or another formula would follow', () => {
  assert.equal(formulaText('a|b'), '$a|b$');
  assert.equal(formulaText('a|b', { cell: true }), '$a\\|b$');
  assert.equal(formulaText('x', { after: '5 more' }), '$x$<!-- -->');
  assert.equal(formulaText('x', { after: '$y$' }), '$x$<!-- -->');
  assert.equal(formulaText('x', { after: ' and' }), '$x$');
  assert.equal(formulaText('x', { after: '5', fallback: false }), '$x$', 'the minimal form, before the first fallback');
});

test('a formula in a text is written as a block formula\'s where its source opens it with `$$`', () => {
  const at = (offset) => ({ type: 'inlineMath', value: 'x', position: { start: { offset } } });
  assert.equal(writtenAsBlock(at(2), 'A $$x$$ b'), true);
  assert.equal(writtenAsBlock(at(2), 'A $x$ b'), false);
  assert.equal(writtenAsBlock({ type: 'inlineMath', value: 'x' }, '$$x$$'), false, 'not without where it stands');
  assert.equal(writtenAsBlock({ ...at(0), type: 'text' }, '$$x$$'), false, 'nor what is no formula');
});

test('an image\'s display width with a leading zero is its number, and one past the widest is refused, as the structure field reads them', () => {
  assert.deepEqual(refusalsOf('![A flow](/media/flow.png "width=0632")'), []);
  assert.deepEqual(refusalsOf('![A flow](/media/flow.png "width=20000")').map(({ name }) => name), ['refusal.image-display-width']);
});

test('a formula Temml cannot read is named with the LaTeX it could not read, and Temml\'s own words beside', () => {
  assert.deepEqual(refusalsOf('Here $\\foo + 1$ stops'), [{ name: 'refusal.math-unreadable', block: 'paragraph', values: { formula: '\\foo + 1', unread: '\\foo', problem: 'Unsupported function name: \\foo' } }]);
  assert.deepEqual(refusalsOf('$$\na & b\n$$')[0].values.unread, '&');
  // One that ends before it is whole has nothing to point at.
  assert.deepEqual(refusalsOf('$$\n\\frac{1}{\n$$'), [{ name: 'refusal.math-unfinished', block: 'block-math', values: { formula: '\\frac{1}{', problem: 'Unexpected end of input in a macro argument, expected \'}\'' } }]);
  // Where Temml stops at an error of its own, the whole formula is what it could not read.
  assert.deepEqual(refusalsOf('Here $x^$ stops')[0].values, { formula: 'x^', unread: 'x^', problem: { name: 'about.math-error', values: {} } });
});

// The right to object to counting without storage, placed in a body (ADR 0049): a leaf with no
// attributes, which writes nothing on a site that does not count so, and says why.
const counting = {
  ...everyElement,
  consent: { departures: [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'We count every visit, and store nothing before consent.', privacySignals: 'stop' }] },
};

test('writes the right to object as a leaf of its own, on a site that counts visits without storage', () => {
  const { text, warnings } = out('Read this.\n\n::consent-objection', counting);
  assert.equal(text, pageFile('Read this.\n\n::consent-objection'));
  assert.deepEqual(warnings, []);
});

test('warns of the right to object in a post of a site that counts no visits without storage, since it shows nothing there', () => {
  const { text, warnings } = out('::consent-objection');
  assert.equal(text, pageFile('::consent-objection'));
  assert.deepEqual(warnings.map(({ name, block, reason }) => [name, block, reason]), [
    ['warning.consent-objection-none', { path: '1', name: 'consent-objection' }, 'the site counts no visits without storage before consent, so the right to object shows nothing here'],
  ]);
});

test('refuses the right to object in a type that does not list it, and one with attributes or a label', () => {
  const without = { ...counting, types: { page: { ...counting.types.page, elements: ['paragraph'] } } };
  assert.deepEqual(refusalsOf('::consent-objection', without), [{ name: 'refusal.element-not-taken', block: 'consent-objection', values: { element: { name: 'body.element.consent-objection', values: {} } } }]);
  assert.deepEqual(refusalsOf('::consent-objection{tone="loud"}', counting).map(({ name }) => name), ['refusal.directive-attribute']);
  assert.deepEqual(refusalsOf('::consent-objection[Object]', counting).map(({ name }) => name), ['refusal.directive-label']);
});
