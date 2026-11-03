// Every refusal and warning the rule data has words for: each has a case, which names
// what it is about, the post and the block or the field, or the file with the entry or the
// setting in it, and gives the reason in words an editor can act on. A key the rule data
// gains needs its case here.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkBody } from '../src/format/body.js';
import { embedOf } from '../src/format/embeds.js';
import rules from '../src/format/rules.json' with { type: 'json' };
import { reader } from '../src/intake/reader.js';
import { namedImages, run, sourcePost } from './lib/intake.js';

const site = Object.freeze({
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  search: { address: '/search/' },
  types: {
    article: {
      label: 'Article',
      plural: 'Articles',
      collection: 'articles',
      address: '/{slug}/',
      feed: '/feed/',
      elements: ['paragraph', 'heading', 'list', 'quote', 'code', 'table', 'footnotes', 'embed', 'image', 'gallery', 'post-list', 'form'],
      fields: {
        date: {},
        excerpt: {},
        categories: { taxonomy: 'category' },
        image: {},
        seo: {},
        readingTime: { label: 'Reading time', type: 'integer', control: 'number' },
      },
    },
    brief: {
      label: 'Brief',
      plural: 'Briefs',
      collection: 'briefs',
      address: '/briefs/{slug}/',
      elements: ['paragraph'],
      fields: { excerpt: { required: true }, image: { required: true }, tags: { taxonomy: 'tag', required: true } },
    },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph', 'post-list'], fields: { seo: {} } },
    guide: { label: 'Guide', plural: 'Guides', collection: 'guides', hierarchical: true, address: '/guides/{path}/', elements: ['paragraph'] },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', elements: ['paragraph'] },
  },
  taxonomies: {
    category: { label: 'Category', plural: 'Categories', collection: 'categories', hierarchical: true, address: '/category/{path}/' },
    tag: { label: 'Tag', plural: 'Tags', collection: 'tags' },
  },
  presentations: { list: { label: 'List', options: { date: { label: 'Date', type: 'boolean', control: 'toggle' } } } },
  menus: { main: { label: 'Main menu' } },
  settings: {
    seats: { label: 'Seats', type: 'integer', control: 'number', required: true },
    contactPage: { label: 'Contact page', type: 'post', control: 'post' },
  },
  forms: { contact: { label: 'Contact us', fields: [{ name: 'email', label: 'Email', kind: 'email', required: true }] } },
});

const settled = { seats: 40 };
const article = (fields = {}, body = '') => sourcePost({ title: 'An article', slug: 'an-article', status: 'published', ...fields }, body);
const inArticle = (body) => run({ 'articles/aaaaaaaaaaaa.md': article({}, body), 'settings.json': settled }, site);
const withFiles = (files, options) => run({ 'settings.json': settled, ...files }, site, options);
const onePost = (fields, body) => withFiles({ 'articles/aaaaaaaaaaaa.md': article(fields, body) });
const pagePost = (id, fields, body = '') => [`pages/${id}.md`, sourcePost({ title: `Page ${id}`, slug: id, status: 'published', ...fields }, body)];
const table = (inner) => `<table>\n${inner}\n</table>`;

// A body check with a reader that reads otherwise than Sätteri, to reach what it cannot.
function withReader(tree, source = 'x') {
  const hands = { reader: { tree }, rules, embedOf, elements: Object.keys(rules.elements), link: (id) => ({ href: `/${id}/` }), image: (address) => ({ src: address }) };
  const { problems, warnings } = checkBody(source, hands);
  return { refusals: problems.map((one) => ({ block: { path: one.path, name: one.name }, reason: one.reason })), warnings };
}

const inBlock = (name) => ({ block: name });

// By the words' key: what makes them, and what they must name.
const cases = {
  'element-not-taken': [() => withFiles({ 'guides/aaaaaaaaaaaa.md': sourcePost({ title: 'G', slug: 'g', status: 'published' }, '## A heading') }), inBlock('heading')],
  'inline-element': [() => inArticle('## A heading[^1]\n\n[^1]: Its note.'), inBlock('heading')],
  'soft-break': [() => inArticle('One line\nand the next'), inBlock('paragraph')],
  'raw-html': [() => inArticle('<div>Raw</div>'), inBlock('paragraph')],
  'raw-unclosed': [() => inArticle('Some <strong>bold'), inBlock('paragraph')],
  construct: [() => withReader(() => ({ children: [{ type: 'math', position: { start: { line: 1 } } }] })), inBlock('math')],
  'constructs.thematicBreak': [() => inArticle('Before\n\n***\n\nAfter'), inBlock('thematicBreak')],
  'constructs.linkReference': [() => inArticle('A [link][the-one].\n\n[the-one]: /x/'), inBlock('paragraph')],
  'constructs.imageReference': [() => inArticle('An ![image][the-one]\n\n[the-one]: /x/'), inBlock('paragraph')],
  'constructs.definition': [() => inArticle('[unused]: /x/'), inBlock('definition')],
  'heading-level': [() => inArticle('# A title'), inBlock('heading')],
  'heading-empty': [() => inArticle('## <a id="x"></a>'), inBlock('heading')],
  'anchor-form': [() => inArticle('## <a id="Not Good"></a>A heading'), inBlock('heading')],
  'anchor-place': [() => inArticle('Text <a id="x"></a> beside an anchor'), inBlock('paragraph')],
  'anchor-twice': [() => inArticle('## <a id="x"></a>One\n\n## <a id="x"></a>Two'), inBlock('heading')],
  'anchor-taken': [() => inArticle('## <a id="footnote-label"></a>One'), inBlock('heading')],
  'list-start': [() => inArticle('3. Starts at three'), inBlock('list')],
  'list-loose': [() => inArticle('- One\n\n- Two'), inBlock('list')],
  'list-task': [() => inArticle('- [ ] A task'), inBlock('list')],
  'list-item-empty': [() => inArticle('-\n- Two'), inBlock('list')],
  'list-item-blocks': [() => inArticle('- One\n\n  ```\n  code\n  ```'), inBlock('list')],
  'quote-empty': [() => inArticle('>'), inBlock('quote')],
  'quote-block': [() => inArticle('> ```\n> code\n> ```'), inBlock('quote')],
  'citation-place': [() => inArticle('> <cite>Someone</cite>\n>\n> And words after'), inBlock('quote')],
  'code-empty': [() => inArticle('```\n\n```'), inBlock('code')],
  'code-language': [() => inArticle('```js\nlet x;\n```'), inBlock('code'), 'warning'],
  'table-row': [() => inArticle('| A |\n| --- |\n| 1 | 2 |'), inBlock('table')],
  'table-no-header': [() => inArticle('|  |\n| --- |\n| 1 |'), inBlock('table')],
  'table-header-rows': [() => inArticle(table('<thead>\n<tr><th>A</th></tr>\n<tr><th>B</th></tr>\n</thead>')), inBlock('table')],
  'table-header-plain': [() => inArticle(table('<thead>\n<tr><td>A</td></tr>\n</thead>')), inBlock('table')],
  'table-header-outside': [() => inArticle(table('<thead>\n<tr><th>A</th></tr>\n</thead>\n<tbody>\n<tr><th>1</th></tr>\n</tbody>')), inBlock('table')],
  'table-empty': [() => inArticle(table('<thead>\n<tr></tr>\n</thead>')), inBlock('table')],
  'table-spans': [() => inArticle(table('<thead>\n<tr><th>A</th><th>B</th></tr>\n</thead>\n<tbody>\n<tr><td colspan="3">1</td></tr>\n</tbody>')), inBlock('table')],
  'table-align': [() => inArticle(table('<caption>C</caption>\n<thead>\n<tr><th style="text-align: left">A</th></tr>\n</thead>\n<tbody>\n<tr><td style="text-align: right">1</td></tr>\n</tbody>')), inBlock('table')],
  'table-shape': [() => inArticle(table('<thead>\n<tr><th><span>A</span></th></tr>\n</thead>')), inBlock('table')],
  'table-cell-attribute': [() => inArticle(table('<thead>\n<tr><th class="x">A</th></tr>\n</thead>')), inBlock('table')],
  'link-title': [() => inArticle('A [link](https://example.com/ "with a title")'), inBlock('paragraph')],
  'link-address': [() => inArticle('A [link](ftp://example.com/)'), inBlock('paragraph')],
  'link-fragment': [() => inArticle('A [link](#the-start)'), inBlock('paragraph')],
  'link-admin': [() => run({ 'articles/aaaaaaaaaaaa.md': article({}, 'To [sign in](https://admin.example.com/).'), 'settings.json': settled }, site, { adminHost: 'admin.example.com' }), inBlock('paragraph')],
  'image-alone': [() => inArticle('Text and ![an image](/media/a.png)'), inBlock('image')],
  'image-place': [() => inArticle('> ![an image](/media/a.png)'), inBlock('image')],
  'image-alt': [() => inArticle('![](/media/a.png)'), inBlock('image')],
  'image-alt-lines': [() => inArticle('![one\ntwo](/media/a.png)'), inBlock('image')],
  'image-title': [() => inArticle('![an image](/media/a.png "a title")'), inBlock('image')],
  'embed-place': [() => inArticle('> https://vimeo.com/76979871'), inBlock('embed')],
  'embed-caption': [() => inArticle('<https://vimeo.com/76979871>\\\nA caption'), inBlock('embed')],
  'directive-unknown': [() => inArticle('::chart{data="x"}'), inBlock('paragraph')],
  'directive-form': [() => inArticle(':::form{name="contact"}\n:::'), inBlock('form')],
  'directive-label': [() => inArticle('::form[a label]{name="contact"}'), inBlock('form')],
  'directive-attribute': [() => inArticle('::form{name="contact" colour="red"}'), inBlock('form')],
  'directive-required': [() => inArticle('::form'), inBlock('form')],
  'directive-value': [() => inArticle('::post-list{type="article" presentation="list" pages="perhaps"}'), inBlock('post-list')],
  'footnote-twice': [() => inArticle('One[^1] and again[^1].\n\n[^1]: The note.'), inBlock('paragraph')],
  'footnote-unmarked': [() => inArticle('No mark.\n\n[^1]: The note.'), inBlock('footnotes')],
  'footnote-empty': [() => inArticle('A claim[^1].\n\n[^1]:'), inBlock('footnotes')],
  'footnote-blocks': [() => inArticle('A claim[^1].\n\n[^1]: One paragraph.\n\n    And another.'), inBlock('footnotes')],
  'footnote-place': [() => inArticle('A <a href="/x/" rel="ugc">link[^1]</a> here.\n\n[^1]: The note.'), inBlock('paragraph')],
  'read-back': [() => {
    // A reader that reads a source one way, and every written body as nothing.
    let reads = 0;
    return withReader((text) => {
      reads += 1;
      return reads === 1 ? reader.tree(text) : { children: [] };
    }, 'Hello world');
  }, inBlock('paragraph')],

  'source-frontmatter': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': 'No frontmatter at all' }), { line: 1 }],
  'source-yaml': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': '---\ntitle: "x\nstatus: [\n---\n\nBody\n' }), { line: true }],
  'source-json': [() => withFiles({ 'menus/main.json': '{ not json' }), { file: 'menus/main.json' }],
  status: [() => onePost({ status: 'perhaps' }), { field: 'status' }],
  'scheduled-date': [() => onePost({ status: 'scheduled' }), { field: 'status' }],
  'language-folder': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({}, 'Text.'),
    'articles/de-DE/bbbbbbbbbbbb.md': article({ slug: 'annat' }, 'Text.'),
  }, { languages: ['sv_SE', 'en_GB'], types: { article: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } } }), { post: true }],
  'admin-file': [() => withFiles({ 'menus/main.json': { items: [] } }, { changes: { 'menus/main.json': { by: 'editor@example.com', admin: false } } }), { file: 'menus/main.json' }],
  'admin-legal-gone': [() => {
    const legal = { 'settings.json': { ...settled, legalPages: { privacyPolicy: 'cccccccccccc' } } };
    const first = run({ ...legal, 'pages/cccccccccccc.md': sourcePost({ title: 'Privacy', slug: 'privacy', status: 'published' }, 'Text.') }, site);
    return run(legal, site, { ledger: first.ledger, changes: { 'pages/cccccccccccc.md': { by: 'editor@example.com', admin: false } } });
  }, { post: true }],
  'admin-legal': [() => withFiles({
    'settings.json': { ...settled, legalPages: { privacyPolicy: 'cccccccccccc' } },
    ...Object.fromEntries([pagePost('cccccccccccc', { slug: 'privacy' })]),
  }, { changes: { 'pages/cccccccccccc.md': { by: 'editor@example.com', admin: false } } }), { post: true }],
  'title-empty': [() => onePost({ title: '' }), { field: 'title' }],
  'title-markup': [() => onePost({ title: 'A <b>bold</b> title' }), { field: 'title' }],
  slug: [() => onePost({ slug: 'Not A Slug' }), { field: 'slug' }],
  'slug-empty': [() => onePost({ title: '!!!', slug: '' }), { field: 'slug' }],
  'field-required': [() => withFiles({ 'briefs/aaaaaaaaaaaa.md': sourcePost({ title: 'B', slug: 'b', status: 'published', image: { src: '/media/a.png', alt: 'A' } }) }), { field: 'excerpt' }],
  'field-moment': [() => onePost({ date: 'soon' }), { field: 'date' }],
  'field-text': [() => onePost({ excerpt: { a: 1 } }), { field: 'excerpt' }],
  'field-markup': [() => onePost({ excerpt: 'An <em>excerpt</em>' }), { field: 'excerpt' }],
  'image-required': [() => withFiles({ 'briefs/aaaaaaaaaaaa.md': sourcePost({ title: 'B', slug: 'b', status: 'published', excerpt: 'E' }) }), { field: 'image' }],
  'image-gone': [() => run({ 'articles/aaaaaaaaaaaa.md': article({ image: { src: '/media/gone.png', alt: 'Gone' } }), 'settings.json': settled }, site, { images: () => null }), { field: 'image' }],
  'image-outside': [() => inArticle('![an image](https://example.com/a.png)'), inBlock('image')],
  'image-small': [() => run({ 'articles/aaaaaaaaaaaa.md': article({ image: { src: '/media/a.png', alt: 'Small' } }), 'settings.json': settled }, site, { images: namedImages({ width: 100, height: 100 }) }), { field: 'image' }],
  'image-narrow': [() => run({ 'articles/aaaaaaaaaaaa.md': article({ image: { src: '/media/a.png', alt: 'Narrow' } }), 'settings.json': settled }, site, { images: namedImages({ width: 800, height: 600 }) }), { field: 'image' }, 'warning'],
  'icon-square': [() => run({ 'settings.json': { ...settled, icon: { src: '/media/wide.png' } } }, site, { images: namedImages({ width: 800, height: 600 }) }), { setting: 'icon' }],
  'icon-small': [() => run({ 'settings.json': { ...settled, icon: { src: '/media/site-icon.png' } } }, site, { images: namedImages({ width: 100, height: 100 }) }), { setting: 'icon' }],
  'seo-shape': [() => onePost({ seo: 'none' }), { field: 'seo' }],
  'seo-flag': [() => onePost({ seo: { noindex: 'yes' } }), { field: 'seo.noindex' }],
  'seo-text': [() => onePost({ seo: { title: { a: 1 } } }), { field: 'seo.title' }],
  'seo-schema': [() => onePost({ seo: { schema: 'Blog' } }), { field: 'seo.schema' }],
  'seo-image-alt': [() => onePost({ seo: { socialImage: '/media/a.png' } }), { field: 'seo.socialImageAlt' }],
  'other-shape': [() => onePost({ otherAddresses: 'none' }), { field: 'otherAddresses' }],
  'other-address': [() => onePost({ otherAddresses: [{ address: 'not a path' }] }), { field: 'otherAddresses' }],
  'other-answer': [() => onePost({ otherAddresses: [{ address: '/x/', answer: 404 }] }), { field: 'otherAddresses' }],
  'other-show-query': [() => onePost({ otherAddresses: [{ address: '/x/?a=1', answer: 'show' }] }), { field: 'otherAddresses' }],
  'other-no-address': [() => withFiles({ 'notes/aaaaaaaaaaaa.md': sourcePost({ title: 'N', slug: 'n', status: 'published', otherAddresses: [{ address: '/x/' }] }) }), { field: 'otherAddresses' }],
  'other-held': [() => withFiles({
    'articles/aaaaaaaaaaaa.md': article({ otherAddresses: [{ address: '/another/' }] }),
    'articles/bbbbbbbbbbbb.md': article({ title: 'Another', slug: 'another' }),
  }), { field: 'otherAddresses' }],
  'other-rule': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ otherAddresses: [{ address: '/x/' }] }), 'redirects.json': { rules: [{ from: '/x/', to: '/y/', status: 301 }] } }), { field: 'otherAddresses' }],
  'term-main': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }),
    'categories/en-GB/tttttttttttt.json': { name: 'News' },
  }, { languages: ['sv_SE', 'en_GB'], taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories' } }, types: { article: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { categories: { taxonomy: 'category' } } } } }), { field: 'categories' }],
  'term-name': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { slug: 'news' } }), { field: 'categories' }],
  'term-markup': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { name: 'A <b>term</b>' } }), { field: 'categories' }],
  'term-slug': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { name: 'News', slug: 'Bad Slug' } }), { field: 'categories' }],
  'term-language': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }),
    'categories/sv-SE/tttttttttttt.json': { name: 'Nyheter' },
    'categories/de-DE/tttttttttttt.json': { name: 'Neues' },
  }, { languages: ['sv_SE', 'en_GB'], taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories' } }, types: { article: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { categories: { taxonomy: 'category' } } } } }), { field: 'categories' }],
  'term-differs': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }),
    'categories/sv-SE/tttttttttttt.json': { name: 'Nyheter', description: 'Det nya' },
    'categories/en-GB/tttttttttttt.json': { name: 'News', description: 'What is new' },
  }, { languages: ['sv_SE', 'en_GB'], taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories' } }, types: { article: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { categories: { taxonomy: 'category' } } } } }), { field: 'categories' }],
  'term-parent': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { name: 'News', parent: 'gone00000000' } }), { field: 'categories' }],
  'term-loop': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { name: 'News', parent: 'tttttttttttt' } }), { field: 'categories' }],
  'term-gone': [() => onePost({ categories: ['gone00000000'] }), { field: 'categories' }],
  'term-translation': [() => run({
    'articles/en-GB/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }),
    'categories/sv-SE/tttttttttttt.json': { name: 'Nyheter' },
  }, { languages: ['sv_SE', 'en_GB'], taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories' } }, types: { article: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { categories: { taxonomy: 'category' } } } } }), { file: true }, 'warning'],
  'list-term-gone': [() => inArticle('::post-list{type="article" include="category:gone00000000" presentation="list"}'), inBlock('post-list'), 'warning'],
  'reference-no-address': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({}, 'A [note](konzilo:nnnnnnnnnnnn).'), 'notes/nnnnnnnnnnnn.md': sourcePost({ title: 'N', slug: 'n', status: 'published' }) }), inBlock('paragraph')],
  'reference-term': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({}, 'A [tag](konzilo:tttttttttttt).'), 'tags/tttttttttttt.json': { name: 'A tag' } }), inBlock('paragraph')],
  'link-gone': [() => inArticle('A [lost link](konzilo:gone00000000).'), inBlock('paragraph'), 'warning'],
  'link-no-page': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({}, 'A [draft](konzilo:bbbbbbbbbbbb).'), 'articles/bbbbbbbbbbbb.md': sourcePost({ title: 'The draft', slug: 'the-draft', status: 'draft' }) }), inBlock('paragraph'), 'warning'],
  'link-language': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({ slug: 'en' }, 'En [länk](konzilo:en-GB/bbbbbbbbbbbb).'),
    'articles/sv-SE/bbbbbbbbbbbb.md': article({ slug: 'mal' }),
    'articles/en-GB/bbbbbbbbbbbb.md': article({ slug: 'target' }),
  }, { languages: ['sv_SE', 'en_GB'], types: { article: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } } }), inBlock('paragraph'), 'warning'],
  'parent-missing': [() => withFiles(Object.fromEntries([pagePost('cccccccccccc', { parent: 'gone00000000' })])), { field: 'parent' }],
  'parent-type': [() => withFiles(Object.fromEntries([pagePost('cccccccccccc', { parent: 'gggggggggggg' }), ['guides/gggggggggggg.md', sourcePost({ title: 'G', slug: 'g', status: 'published' })]])), { field: 'parent' }],
  'parent-loop': [() => withFiles(Object.fromEntries([pagePost('cccccccccccc', { parent: 'dddddddddddd' }), pagePost('dddddddddddd', { parent: 'cccccccccccc' })])), { field: 'parent' }],
  'parent-refused': [() => withFiles(Object.fromEntries([pagePost('cccccccccccc', { parent: 'dddddddddddd' }), pagePost('dddddddddddd', { title: '<b>Refused</b>' })])), { field: 'parent' }],
  'address-held': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article(), 'articles/bbbbbbbbbbbb.md': article({ title: 'Another' }) }), { field: 'slug' }],
  'address-reserved': [() => onePost({ slug: '_astro' }), { field: 'slug' }],
  'address-feed': [() => onePost({ slug: 'feed' }), { field: 'slug' }],
  'address-search': [() => onePost({ slug: 'search' }), { field: 'slug' }],
  'address-list': [() => withFiles(Object.fromEntries([
    pagePost('cccccccccccc', { slug: 'news' }, '::post-list{type="article" pages="true" presentation="list"}'),
    pagePost('dddddddddddd', { slug: 'page' }),
    pagePost('eeeeeeeeeeee', { slug: 'two', parent: 'dddddddddddd', title: 'Two' }),
    pagePost('ffffffffffff', { slug: 'page', parent: 'cccccccccccc', title: 'Below' }),
    pagePost('999999999999', { slug: '2', parent: 'ffffffffffff', title: 'Second page' }),
  ])), { field: 'slug' }],
  'address-term': [() => run({
    'pages/aaaaaaaaaaaa.md': sourcePost({ title: 'Topics', slug: 'topics', status: 'published' }),
    'pages/bbbbbbbbbbbb.md': sourcePost({ title: 'Clash', slug: 'clash', parent: 'aaaaaaaaaaaa', status: 'published' }),
    'stories/cccccccccccc.md': sourcePost({ title: 'Story', slug: 'story', status: 'published', topics: ['tttttttttttt'] }),
    'topics/tttttttttttt.json': { name: 'Clash', slug: 'clash' },
  }, {
    types: {
      page: { label: 'P', plural: 'Ps', collection: 'pages', hierarchical: true, address: '/{path}/', elements: ['paragraph'] },
      story: { label: 'S', plural: 'Ss', collection: 'stories', address: '/stories/{slug}/', elements: ['paragraph'], fields: { topics: { taxonomy: 'topic' } } },
    },
    taxonomies: { topic: { label: 'T', plural: 'Ts', collection: 'topics', address: '/topics/{slug}/' } },
  }), { field: 'slug' }],
  'set-twice': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({ slug: 'ett', translationKey: '3a1dace55ce438b2' }),
    'articles/sv-SE/bbbbbbbbbbbb.md': article({ slug: 'tva', translationKey: '3a1dace55ce438b2' }),
  }, { languages: ['sv_SE', 'en_GB'], types: { article: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } } }), { field: 'translationKey' }],
  'not-found-none': [() => withFiles({ 'settings.json': { ...settled, notFound: { page: 'gone00000000' } } }), { setting: 'notFound.page' }, 'warning'],
  'setting-pattern': [() => withFiles({ 'settings.json': { ...settled, ai: { excludedPaths: '([' } } }), { setting: 'ai.excludedPaths' }],
  'setting-shape': [() => withFiles({ 'settings.json': { seats: { a: 1 } } }), { setting: 'seats' }],
  'setting-required': [() => withFiles({ 'settings.json': {} }), { setting: 'seats' }],
  'setting-no-page': [() => withFiles({ 'settings.json': { ...settled, contactPage: 'gone00000000' } }), { setting: 'contactPage' }, 'warning'],
  'setting-translation': [() => run({
    'settings.json': { contactPage: 'cccccccccccc' },
    'pages/sv-SE/cccccccccccc.md': sourcePost({ title: 'Kontakt', slug: 'kontakt', status: 'published' }),
  }, { languages: ['sv_SE', 'en_GB'], settings: { contactPage: { label: 'C', type: 'post', control: 'post' } }, types: { page: { label: 'P', plural: 'Ps', collection: 'pages', address: '/{slug}/', elements: ['paragraph'] } } }), { setting: 'contactPage' }, 'warning'],
  'menu-shape': [() => withFiles({ 'menus/main.json': { items: ['not an entry'] } }), { entry: '1' }],
  'menu-no-page': [() => withFiles({ 'menus/main.json': { items: [{ post: 'gone00000000' }] } }), { entry: '1' }, 'warning'],
  'menu-url': [() => withFiles({ 'menus/main.json': { items: [{ title: 'Bad', url: 'javascript:alert(1)' }] } }), { entry: '1' }],
  'menu-title': [() => withFiles({ 'menus/main.json': { items: [{ url: '/x/' }] } }), { entry: '1' }],
  'menu-nowhere': [() => withFiles({ 'menus/main.json': { items: [{ title: 'Nowhere', items: [{ title: 'Below', url: '/x/' }] }, { title: 'Alone' }] } }), { entry: '2' }],
  'rule-shape': [() => withFiles({ 'redirects.json': { rules: ['not a rule'] } }), { entry: '1' }],
  'rule-pattern-post': [() => withFiles({ 'redirects.json': { rules: [{ from: '^/a/(.*)$', post: 'cccccccccccc', status: 301 }] } }), { entry: '1' }],
  'rule-pattern-long': [() => withFiles({ 'redirects.json': { rules: [{ pattern: `^/${'a'.repeat(600)}$`, to: '/x/', status: 301 }] } }), { entry: '1' }],
  'rule-twice': [() => withFiles({ 'redirects.json': { rules: [{ from: '/a/', to: '/x/', status: 301 }, { from: '/a', to: '/y/', status: 301 }] } }), { entry: '2' }],
  'rule-patterns': [() => withFiles({ 'redirects.json': { rules: Array.from({ length: 101 }, (_, i) => ({ pattern: `^/p${i}/(.*)$`, to: '/x/$1', status: 301 })) } }), { entry: '101' }],
  'rule-source': [() => withFiles({ 'redirects.json': { rules: [{ from: 'not a path', to: '/x/', status: 301 }] } }), { entry: '1' }],
  'rule-reserved': [() => withFiles({ 'redirects.json': { rules: [{ from: '/_konzilo/a/', to: '/x/', status: 301 }] } }), { entry: '1' }],
  'rule-parameters': [() => withFiles({ 'redirects.json': { rules: [{ from: `/a/?${Array.from({ length: 11 }, (_, i) => `p${i}=1`).join('&')}`, to: '/x/', status: 301 }] } }), { entry: '1' }],
  'rule-status': [() => withFiles({ 'redirects.json': { rules: [{ from: '/a/', to: '/x/', status: 200 }] } }), { entry: '1' }],
  'rule-target': [() => withFiles({ 'redirects.json': { rules: [{ from: '/a/', to: 'http://example.com/', status: 301 }] } }), { entry: '1' }],
  'rule-loop': [() => withFiles({ 'redirects.json': { rules: [{ from: '/a/', to: '/b/', status: 301 }, { from: '/b/', to: '/a/', status: 301 }] } }), { entry: '1' }],
  'rule-chain': [() => withFiles({ 'redirects.json': { rules: [{ from: '/a/', to: '/b/', status: 301 }, { from: '/b/', to: '/c/', status: 301 }] } }), { entry: '1' }, 'warning'],
  'rule-start': [() => withFiles({ 'redirects.json': { rules: [{ from: '/a/', to: '/', status: 301 }] } }), { entry: '1' }, 'warning'],
  'rule-post-off': [() => withFiles({ 'redirects.json': { rules: [{ from: '/a/', post: 'gone00000000', status: 301 }] } }), { file: 'redirects.json' }, 'warning'],
  'rule-shadowed': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article(), 'redirects.json': { rules: [{ from: '/an-article/', to: '/x/', status: 301 }] } }), { file: 'redirects.json' }, 'warning'],
  'publisher-missing': [() => withFiles({}), { setting: 'search.publisher.name' }, 'warning'],
  'legal-missing': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({}, 'https://vimeo.com/76979871') }), { setting: 'legalPages.privacyPolicy' }, 'warning'],
};

// What the seam says, which a test of its own holds (intake-images.test.js).
const inSeam = new Set(['image-moving', 'image-kind', 'image-large', 'image-pointer', 'svg']);

const keys = [...Object.keys(rules.refusals).filter((key) => key !== 'constructs'), ...Object.keys(rules.refusals.constructs).map((key) => `constructs.${key}`)];

test('every word of the rule data has its case', () => {
  assert.deepEqual(keys.filter((key) => !Object.hasOwn(cases, key) && !inSeam.has(key)), []);
  assert.deepEqual(Object.keys(cases).filter((key) => !keys.includes(key)), []);
});

const wordsOf = (key) => (key.startsWith('constructs.') ? rules.refusals.constructs[key.slice('constructs.'.length)] : rules.refusals[key]);
const asPattern = (words) => new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '[\\s\\S]*')}$`);

for (const [key, [make, about, kind = 'refusal']] of Object.entries(cases)) {
  test(`${key}: ${wordsOf(key).slice(0, 70)}`, () => {
    const result = make();
    const list = kind === 'warning' ? result.warnings : result.refusals;
    const pattern = asPattern(wordsOf(key));
    const found = list.find((one) => pattern.test(one.reason));
    assert.ok(found, `no such ${kind} in ${JSON.stringify([...(result.refusals ?? []), ...(result.warnings ?? [])].map((one) => one.reason ?? one))}`);
    for (const [name, value] of Object.entries(about)) {
      if (name === 'block') assert.equal(found.block?.name, value, JSON.stringify(found));
      else if (value === true) assert.ok(found[name] !== undefined, `names no ${name}: ${JSON.stringify(found)}`);
      else assert.deepEqual(found[name], value, JSON.stringify(found));
    }
  });
}

// What the rule data holds in its elements: a directive's refusals, and a link's.
const body = (text) => inArticle(text).refusals.map((one) => one.reason);

test('a link\'s target and rel are refused in the rule data\'s words', () => {
  assert.deepEqual(body('<a href="/x/" target="_self">A link</a> here'), ['the site cannot publish a link that opens anywhere but a new tab (target "_self")']);
  assert.deepEqual(body('<a href="/x/" rel="me">A link</a> here'), ['the site cannot publish a link with the rel value "me"; a link\'s rel may hold noreferrer, noopener, nofollow, sponsored and ugc, each once']);
  assert.deepEqual(body('<a href="/x/" rel="ugc ugc">A link</a> here'), ['the site cannot publish a link with the rel value "ugc ugc"; a link\'s rel may hold noreferrer, noopener, nofollow, sponsored and ugc, each once']);
});

test('a post list\'s attributes are refused in the rule data\'s words', () => {
  const list = (attributes) => body(`::post-list{type="article" presentation="list" ${attributes}}`);
  assert.deepEqual(list('direction="sideways"'), ['the site cannot publish a list in the direction "sideways": a list is ascending or descending']);
  assert.deepEqual(list('offset="-1"'), ['the site cannot publish a list that skips -1 posts: a list skips none, or a whole number of them']);
  assert.deepEqual(list('number="101"'), ['the site cannot publish a list of 101 posts: a list shows 1 to 100 posts']);
});

test('a form the site no longer offers, and a second list with pages', () => {
  assert.deepEqual(body('::form{name="order"}'), ['the site declares no form "order"; it declares contact']);
  assert.deepEqual(body('::post-list{type="article" pages="true" presentation="list"}\n\n::post-list{type="article" pages="true" presentation="list"}'), ['the site cannot publish a second list with pages of its own; turn off Pages in one of them']);
});

test('an embed the rule data does not take is refused in its words', () => {
  assert.match(body('https://example.com/video')[0], /^the site cannot embed content from example\.com; it embeds content from YouTube, Vimeo/);
  assert.match(body('https://www.youtube.com/channel/x')[0], /^the site cannot embed this address from YouTube; use the address of a video or a playlist/);
});

test('names every problem in a post, in the order of its blocks', () => {
  const { refusals } = inArticle('# One\n\n- Two\n\n  three\n\n<div>Four</div>\n\n> ```\n> five\n> ```');
  assert.deepEqual(refusals.map(({ block, line }) => [block.path, block.name, line]), [
    ['1', 'heading', 7],
    ['2.1', 'list', 9],
    ['3', 'paragraph', 13],
    ['4.1', 'quote', 15],
  ]);
  for (const refusal of refusals) {
    assert.deepEqual(refusal.post, { id: 'aaaaaaaaaaaa', type: 'article', title: 'An article' });
    assert.match(refusal.message, /^The article "An article" \(aaaaaaaaaaaa\), block /);
  }
});

test('a refused post leaves the rest of the site as it is', () => {
  const { refusals, files } = withFiles({
    'articles/aaaaaaaaaaaa.md': article({}, '# Refused'),
    'articles/bbbbbbbbbbbb.md': article({ title: 'Fine', slug: 'fine' }, 'Fine.'),
  });
  assert.equal(refusals.length, 1);
  assert.ok(files.some(({ path }) => path === 'articles/fine.md'));
  assert.ok(!files.some(({ path }) => path === 'articles/an-article.md'));
});

test('fails closed: a check that breaks writes nothing', () => {
  const broken = { tree: () => { throw new Error('the reader broke'); } };
  assert.throws(() => run({ 'articles/aaaaaaaaaaaa.md': article({}, 'Text.'), 'settings.json': settled }, site, { reader: broken }), /the reader broke/);
});

test('a non-Admin may change a post, and an Admin what is an Admin\'s', () => {
  const admin = { by: 'admin@example.com', admin: true };
  const { refusals } = withFiles({
    'settings.json': { ...settled, legalPages: { privacyPolicy: 'cccccccccccc' } },
    'menus/main.json': { items: [] },
    ...Object.fromEntries([pagePost('cccccccccccc', { slug: 'privacy' })]),
    'articles/aaaaaaaaaaaa.md': article(),
  }, { changes: { 'settings.json': admin, 'menus/main.json': admin, 'pages/cccccccccccc.md': admin, 'articles/aaaaaaaaaaaa.md': { by: 'editor@example.com', admin: false } } });
  assert.deepEqual(refusals, []);
});
