// The body check: what a source holds, whatever its bytes, and the exact form it comes out
// in. Exact bytes are the intake's job, so a padded table, another bullet or a bare address
// in angle brackets make no difference; references are followed and image paths replaced.
// It imports nothing, so that the field can run it in the browser.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkBody } from '../src/format/body.js';
import { embedOf } from '../src/format/embeds.js';
import rules from '../src/format/rules.json' with { type: 'json' };
import { reader } from '../src/intake/reader.js';
import { everyElement, pageFile, pagePath, pageSource, run, sourcePost, written } from './lib/intake.js';

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
  assert.equal(written(result)['pages/parent/child.md'], '---\ntitle: "Child"\n---\n\n![A barn](../../media/child-faf546aae9.webp)\\\nThe barn\n');
  assert.equal(written(result)['media/child-faf546aae9.webp'], 'the master of media/barn-faf546aae9.jpg');
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
  const pieces = ['*', '_', '`', '~', '[', ']', '(', ')', '<', '>', '&', '#', '|', '\\', ':', '!', '-', '+', '=', '.', '1', 'a', ' ', '^', '"', 'www.', '@', 'b', '/', ';', '{', '}', 'é', ' '];
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
