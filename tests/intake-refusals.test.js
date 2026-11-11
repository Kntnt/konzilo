// Every refusal and warning the catalogues have words for: each has a case, which names
// what it is about, the post and the block or the field, or the file with the entry or the
// setting in it, and carries its reason by its name and values, which give the words an
// editor can act on in each interface language, and British English for the command line.
// A refusal or a warning the catalogues gain needs its case here.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOGUES } from '../src/catalogues.js';
import { checkBody } from '../src/format/body.js';
import { embedOf } from '../src/format/embeds.js';
import rules from '../src/format/rules.json' with { type: 'json' };
import { messageIn, placeIn, reasonIn } from '../src/refusals.js';
import { reader } from '../src/intake/reader.js';
import { named as refusalOf } from '../src/intake/words.js';
import { namedImages, run, sourcePost } from './lib/intake.js';

const site = Object.freeze({
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  search: { address: '/search/' },
  types: {
    story: {
      label: 'Article',
      plural: 'Articles',
      collection: 'articles',
      address: '/{slug}/',
      feed: '/feed/',
      elements: ['paragraph', 'heading', 'list', 'quote', 'code', 'table', 'footnotes', 'embed', 'image', 'gallery', 'post-list', 'form'],
      fields: {
        date: {},
        excerpt: {},
        categories: { taxonomy: 'category', most: 2 },
        image: {},
        seo: {},
        readingTime: { label: 'Reading time', type: 'integer', control: 'number' },
        tone: { label: 'Tone', type: 'string', control: 'select', options: ['calm', 'loud'] },
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
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph', 'post-list'] },
    guide: { label: 'Guide', plural: 'Guides', collection: 'guides', hierarchical: true, address: '/guides/{path}/', elements: ['paragraph'] },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', elements: ['paragraph'] },
  },
  taxonomies: {
    category: { label: 'Category', plural: 'Categories', collection: 'categories', hierarchical: true, address: '/category/{path}/' },
    tag: { label: 'Tag', plural: 'Tags', collection: 'tags' },
  },
  presentations: {
    list: { label: 'List', options: { date: { label: 'Date', type: 'boolean', control: 'toggle' } } },
    cards: { label: 'Cards', options: { size: { label: 'Size', type: 'string', control: 'select', options: ['small', 'large'] }, heading: { label: 'Heading', type: 'string', control: 'text', required: true } } },
  },
  menus: { main: { label: 'Main menu' } },
  settings: {
    seats: { label: 'Seats', type: 'integer', control: 'number', required: true },
    contactPage: { label: 'Contact page', type: 'post', control: 'post' },
    ratio: { label: 'Ratio', type: 'number', control: 'number' },
    open: { label: 'Open', type: 'boolean', control: 'toggle' },
    opens: { label: 'Opens', type: 'date', control: 'date' },
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
  const shaped = (one) => refusalOf({ file: 'pages/x.md', block: { path: one.path, name: one.name }, reason: one.reason });
  return { refusals: problems.map(shaped), warnings: warnings.map(shaped) };
}

const inBlock = (name) => ({ block: name });

// A redirect rule of the site's, and a pattern with a target.
const withRule = (rule) => withFiles({ 'redirects.json': { rules: [rule] } });
const withPattern = (pattern) => withRule({ pattern, to: '/x/$1', status: 301 });

// A service an Admin declares, as the site can publish it but for what is changed.
const PROVIDER = Object.freeze({ name: 'P Inc', country: 'IE', privacyPolicy: 'https://p.example.com/privacy' });
const STORED = Object.freeze({ name: 'pixel-id', kind: 'cookie', lifetime: 'P1D', party: 'third' });
const service = (changes = {}) => ({ id: 'pixel', name: 'Pixel', category: 'marketing', provider: PROVIDER, purpose: 'Counts visits.', storage: [STORED], hosts: { images: ['https://pixel.example.com'] }, transfers: [], ...changes });
const declaring = (...services) => withFiles({ 'services.json': { services } });
const hosting = (host, options) => withFiles({ 'services.json': { services: [service({ hosts: { images: [host] } })] } }, options);

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
  'image-link-alt': [() => inArticle('- [![](/media/a.png)](/x/)'), inBlock('list')],
  'embed-place': [() => inArticle('> https://vimeo.com/76979871'), inBlock('embed')],
  'embed-caption': [() => inArticle('<https://vimeo.com/76979871>\\\nA caption'), inBlock('embed')],
  'directive-unknown': [() => inArticle('::chart{data="x"}'), inBlock('paragraph')],
  'directive-form': [() => inArticle(':::form{name="contact"}\n:::'), inBlock('form')],
  'directive-label': [() => inArticle('::form[a label]{name="contact"}'), inBlock('form')],
  'directive-attribute': [() => inArticle('::form{name="contact" colour="red"}'), inBlock('form')],
  'directive-required': [() => inArticle('::form'), inBlock('form')],
  'directive-value': [() => inArticle('::post-list{type="story" presentation="list" pages="perhaps"}'), inBlock('post-list')],
  'list-direction': [() => inArticle('::post-list{type="story" presentation="list" direction="sideways"}'), inBlock('post-list')],
  'list-offset': [() => inArticle('::post-list{type="story" presentation="list" offset="-1"}'), inBlock('post-list')],
  'list-number': [() => inArticle('::post-list{type="story" presentation="list" number="101"}'), inBlock('post-list')],
  'form-name': [() => inArticle('::form{name="order"}'), inBlock('form')],
  'list-paged-twice': [() => inArticle('::post-list{type="story" pages="true" presentation="list"}\n\n::post-list{type="story" pages="true" presentation="list"}'), inBlock('post-list')],
  'list-type': [() => inArticle('::post-list{type="nothing" presentation="list"}'), inBlock('post-list')],
  'list-presentation': [() => inArticle('::post-list{type="story" presentation="slides"}'), inBlock('post-list')],
  'list-option': [() => inArticle('::post-list{type="story" presentation="list" colour="red"}'), inBlock('post-list')],
  'list-option-value': [() => inArticle('::post-list{type="story" presentation="list" date="perhaps"}'), inBlock('post-list')],
  'list-option-choice': [() => inArticle('::post-list{type="story" presentation="cards" size="huge" heading="H"}'), inBlock('post-list')],
  'list-option-required': [() => inArticle('::post-list{type="story" presentation="cards"}'), inBlock('post-list')],
  'list-terms': [() => inArticle('::post-list{type="story" presentation="list" include="nonsense"}'), inBlock('post-list')],
  'list-taxonomy': [() => inArticle('::post-list{type="story" presentation="list" include="colour:red"}'), inBlock('post-list')],
  'list-taxonomy-twice': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({}, '::post-list{type="story" presentation="list" include="category:tttttttttttt category:tttttttttttt"}'), 'categories/tttttttttttt.json': { name: 'News', slug: 'news' } }), inBlock('post-list')],
  'list-where': [() => inArticle('::post-list{type="story" presentation="list" where="nonsense"}'), inBlock('post-list')],
  'list-where-field': [() => inArticle('::post-list{type="story" presentation="list" where="colour=red"}'), inBlock('post-list')],
  'list-where-operator': [() => inArticle('::post-list{type="story" presentation="list" where="tone<calm"}'), inBlock('post-list')],
  'list-where-value': [() => inArticle('::post-list{type="story" presentation="list" where="readingTime=many"}'), inBlock('post-list')],
  'list-where-choice': [() => inArticle('::post-list{type="story" presentation="list" where="tone=quiet"}'), inBlock('post-list')],
  'list-related': [() => inArticle('::post-list{type="note" order="related" presentation="list"}'), inBlock('post-list')],
  'list-related-direction': [() => inArticle('::post-list{type="story" order="related" direction="ascending" presentation="list"}'), inBlock('post-list')],
  'list-order': [() => inArticle('::post-list{type="story" order="colour" presentation="list"}'), inBlock('post-list')],
  'link-target': [() => inArticle('<a href="/x/" target="_self">A link</a> here'), inBlock('paragraph')],
  'link-rel': [() => inArticle('<a href="/x/" rel="me">A link</a> here'), inBlock('paragraph')],
  'embed-host': [() => inArticle('https://example.com/video'), inBlock('embed')],
  'embed-address': [() => ({ refusals: [refusalOf({ file: 'pages/x.md', reason: embedOf('https://[', rules).reason })] }), { file: 'pages/x.md' }],
  // Each service's own words, for an address of its that is none of its forms.
  ...Object.fromEntries(Object.entries(rules.embeds.services).map(([key, service]) => [`embed-${key}`, [() => inArticle(`https://${service.hosts[0]}/nothing-of-its`), inBlock('embed')]])),
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
  'scheduled-passed': [() => onePost({ status: 'scheduled', date: '2026-01-01T00:00:00Z' }), { post: true, field: 'date' }, 'warning'],
  'language-folder': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({}, 'Text.'),
    'articles/de-DE/bbbbbbbbbbbb.md': article({ slug: 'annat' }, 'Text.'),
  }, { languages: ['sv_SE', 'en_GB'], types: { story: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } } }), { post: true }],
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
  'field-value': [() => onePost({ readingTime: { a: 1 } }), { field: 'readingTime' }],
  'value-choice': [() => onePost({ tone: 'quiet' }), { field: 'tone' }],
  'value-integer': [() => onePost({ readingTime: 'many' }), { field: 'readingTime' }],
  'value-number': [() => withFiles({ 'settings.json': { ...settled, ratio: 'a half' } }), { setting: 'ratio' }],
  'value-boolean': [() => withFiles({ 'settings.json': { ...settled, open: 'perhaps' } }), { setting: 'open' }],
  'value-date': [() => withFiles({ 'settings.json': { ...settled, opens: 'soon' } }), { setting: 'opens' }],
  'value-least': [() => withFiles({ 'settings.json': { ...settled, tagManager: { manager: 'Matomo', address: 'https://matomo.example.com/', site: 0 } } }), { setting: 'tagManager.site' }],
  'template-variable': [() => withFiles({ 'settings.json': { ...settled, search: { home: { title: '{{ nothing.here }}' } } } }), { setting: 'search.home.title' }],
  'format-matomo-address': [() => withFiles({ 'settings.json': { ...settled, tagManager: { address: 'http://matomo.example.com/' } } }), { setting: 'tagManager.address' }],
  'format-matomo-container': [() => withFiles({ 'settings.json': { ...settled, tagManager: { container: 'nope' } } }), { setting: 'tagManager.container' }],
  'format-domain': [() => withFiles({ 'settings.json': { ...settled, tagManager: { cookieDomain: 'Example.COM' } } }), { setting: 'tagManager.cookieDomain' }],
  'format-time-zone': [() => withFiles({ 'settings.json': { ...settled, tagManager: { timeZone: 'Mars' } } }), { setting: 'tagManager.timeZone' }],
  'format-privacy-policy': [() => withFiles({ 'settings.json': { ...settled, tagManager: { provider: { privacyPolicy: 'www.example.com/privacy/' } } } }), { setting: 'tagManager.provider.privacyPolicy' }],
  'format-country': [() => withFiles({ 'settings.json': { ...settled, tagManager: { provider: { country: 'Sweden' } } } }), { setting: 'tagManager.provider.country' }],
  'departure-service': [() => run({ 'settings.json': settled }, { ...site, consent: { departures: [{ departure: 'necessaryService', service: 'nothing', reason: 'It must.' }] } }), { file: 'site-description.json', setting: 'consent.departures.1' }, 'warning'],
  'departure-tracker': [() => run({ 'settings.json': settled }, { ...site, consent: { departures: [{ departure: 'statisticsWithoutStorageBeforeConsent', reason: 'Every visit counts.', privacySignals: 'ignore' }] } }), { file: 'site-description.json', setting: 'consent.departures.1' }, 'warning'],
  'image-required': [() => withFiles({ 'briefs/aaaaaaaaaaaa.md': sourcePost({ title: 'B', slug: 'b', status: 'published', excerpt: 'E' }) }), { field: 'image' }],
  'image-gone': [() => run({ 'articles/aaaaaaaaaaaa.md': article({ image: { src: '/media/gone.png', alt: 'Gone' } }), 'settings.json': settled }, site, { images: () => null }), { field: 'image' }],
  'image-outside': [() => inArticle('![an image](https://example.com/a.png)'), inBlock('image')],
  'image-small': [() => run({ 'articles/aaaaaaaaaaaa.md': article({ image: { src: '/media/a.png', alt: 'Small' } }), 'settings.json': settled }, site, { images: namedImages({ width: 100, height: 100 }) }), { field: 'image' }],
  'image-narrow': [() => run({ 'articles/aaaaaaaaaaaa.md': article({ image: { src: '/media/a.png', alt: 'Narrow' } }), 'settings.json': settled }, site, { images: namedImages({ width: 800, height: 600 }) }), { field: 'image' }, 'warning'],
  'icon-square': [() => run({ 'settings.json': { ...settled, icon: { src: '/media/wide.png' } } }, site, { images: namedImages({ width: 800, height: 600 }) }), { setting: 'icon' }],
  'icon-small': [() => run({ 'settings.json': { ...settled, icon: { src: '/media/site-icon.png' } } }, site, { images: namedImages({ width: 100, height: 100 }) }), { setting: 'icon' }],
  'seo-shape': [() => onePost({ seo: 'none' }), { field: 'seo' }],
  'seo-flag': [() => onePost({ search: { noindex: 'yes' } }), { field: 'search.noindex' }],
  'seo-text': [() => onePost({ search: { title: { a: 1 } } }), { field: 'search.title' }],
  'seo-schema': [() => onePost({ structured: { schema: 'Blog' } }), { field: 'structured.schema' }],
  'seo-image-alt': [() => onePost({ sharing: { image: { src: '/media/a.png' } } }), { field: 'sharing.image' }],
  'seo-canonical': [() => onePost({ search: { canonical: '/the-original/' } }), { field: 'search.canonical' }],
  'terms-most': [() => onePost({ categories: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc'] }), { field: 'categories' }],
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
  }, { languages: ['sv_SE', 'en_GB'], taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories' } }, types: { story: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { categories: { taxonomy: 'category' } } } } }), { field: 'categories' }],
  'term-name': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { slug: 'news' } }), { field: 'categories' }],
  'term-markup': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { name: 'A <b>term</b>' } }), { field: 'categories' }],
  'term-slug': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { name: 'News', slug: 'Bad Slug' } }), { field: 'categories' }],
  'term-language': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }),
    'categories/sv-SE/tttttttttttt.json': { name: 'Nyheter' },
    'categories/de-DE/tttttttttttt.json': { name: 'Neues' },
  }, { languages: ['sv_SE', 'en_GB'], taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories' } }, types: { story: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { categories: { taxonomy: 'category' } } } } }), { field: 'categories' }],
  'term-differs': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }),
    'categories/sv-SE/tttttttttttt.json': { name: 'Nyheter', description: 'Det nya' },
    'categories/en-GB/tttttttttttt.json': { name: 'News', description: 'What is new' },
  }, { languages: ['sv_SE', 'en_GB'], taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories' } }, types: { story: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { categories: { taxonomy: 'category' } } } } }), { field: 'categories' }],
  'term-parent': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { name: 'News', parent: 'gone00000000' } }), { field: 'categories' }],
  'term-loop': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }), 'categories/tttttttttttt.json': { name: 'News', parent: 'tttttttttttt' } }), { field: 'categories' }],
  'term-gone': [() => onePost({ categories: ['gone00000000'] }), { field: 'categories' }],
  'term-translation': [() => run({
    'articles/en-GB/aaaaaaaaaaaa.md': article({ categories: ['tttttttttttt'] }),
    'categories/sv-SE/tttttttttttt.json': { name: 'Nyheter' },
  }, { languages: ['sv_SE', 'en_GB'], taxonomies: { category: { label: 'C', plural: 'Cs', collection: 'categories' } }, types: { story: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { categories: { taxonomy: 'category' } } } } }), { file: true }, 'warning'],
  'list-term-gone': [() => inArticle('::post-list{type="story" include="category:gone00000000" presentation="list"}'), inBlock('post-list'), 'warning'],
  'reference-no-address': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({}, 'A [note](konzilo:nnnnnnnnnnnn).'), 'notes/nnnnnnnnnnnn.md': sourcePost({ title: 'N', slug: 'n', status: 'published' }) }), inBlock('paragraph')],
  'reference-term': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({}, 'A [tag](konzilo:tttttttttttt).'), 'tags/tttttttttttt.json': { name: 'A tag' } }), inBlock('paragraph')],
  'link-gone': [() => inArticle('A [lost link](konzilo:gone00000000).'), inBlock('paragraph'), 'warning'],
  'link-no-page': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({}, 'A [draft](konzilo:bbbbbbbbbbbb).'), 'articles/bbbbbbbbbbbb.md': sourcePost({ title: 'The draft', slug: 'the-draft', status: 'draft' }) }), inBlock('paragraph'), 'warning'],
  'link-language': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({ slug: 'en' }, 'En [länk](konzilo:en-GB/bbbbbbbbbbbb).'),
    'articles/sv-SE/bbbbbbbbbbbb.md': article({ slug: 'mal' }),
    'articles/en-GB/bbbbbbbbbbbb.md': article({ slug: 'target' }),
  }, { languages: ['sv_SE', 'en_GB'], types: { story: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } } }), inBlock('paragraph'), 'warning'],
  'parent-missing': [() => withFiles(Object.fromEntries([pagePost('cccccccccccc', { parent: 'gone00000000' })])), { field: 'parent' }],
  'parent-type': [() => withFiles(Object.fromEntries([pagePost('cccccccccccc', { parent: 'gggggggggggg' }), ['guides/gggggggggggg.md', sourcePost({ title: 'G', slug: 'g', status: 'published' })]])), { field: 'parent' }],
  'parent-loop': [() => withFiles(Object.fromEntries([pagePost('cccccccccccc', { parent: 'dddddddddddd' }), pagePost('dddddddddddd', { parent: 'cccccccccccc' })])), { field: 'parent' }],
  'parent-refused': [() => withFiles(Object.fromEntries([pagePost('cccccccccccc', { parent: 'dddddddddddd' }), pagePost('dddddddddddd', { title: '<b>Refused</b>' })])), { field: 'parent' }],
  'address-held': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article(), 'articles/bbbbbbbbbbbb.md': article({ title: 'Another' }) }), { field: 'slug' }],
  'address-reserved': [() => onePost({ slug: '_astro' }), { field: 'slug' }],
  'address-feed': [() => onePost({ slug: 'feed' }), { field: 'slug' }],
  'address-search': [() => onePost({ slug: 'search' }), { field: 'slug' }],
  'address-list': [() => withFiles(Object.fromEntries([
    pagePost('cccccccccccc', { slug: 'news' }, '::post-list{type="story" pages="true" presentation="list"}'),
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
      post: { label: 'P', plural: 'Ps', collection: 'pages', hierarchical: true, address: '/{path}/', elements: ['paragraph'] },
      story: { label: 'S', plural: 'Ss', collection: 'stories', address: '/stories/{slug}/', elements: ['paragraph'], fields: { topics: { taxonomy: 'topic' } } },
    },
    taxonomies: { topic: { label: 'T', plural: 'Ts', collection: 'topics', address: '/topics/{slug}/' } },
  }), { field: 'slug' }],
  'set-twice': [() => run({
    'articles/sv-SE/aaaaaaaaaaaa.md': article({ slug: 'ett', translationKey: '3a1dace55ce438b2' }),
    'articles/sv-SE/bbbbbbbbbbbb.md': article({ slug: 'tva', translationKey: '3a1dace55ce438b2' }),
  }, { languages: ['sv_SE', 'en_GB'], types: { story: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } } }), {}],
  'not-found-none': [() => withFiles({ 'settings.json': { ...settled, notFound: { page: 'gone00000000' } } }), { setting: 'notFound.page' }, 'warning'],
  'setting-pattern': [() => withFiles({ 'settings.json': { ...settled, ai: { excludedPaths: '([' } } }), { setting: 'ai.excludedPaths' }],
  'setting-shape': [() => withFiles({ 'settings.json': { seats: { a: 1 } } }), { setting: 'seats' }],
  'setting-required': [() => withFiles({ 'settings.json': {} }), { setting: 'seats' }],
  'setting-no-page': [() => withFiles({ 'settings.json': { ...settled, contactPage: 'gone00000000' } }), { setting: 'contactPage' }, 'warning'],
  'setting-translation': [() => run({
    'settings.json': { contactPage: 'cccccccccccc' },
    'pages/sv-SE/cccccccccccc.md': sourcePost({ title: 'Kontakt', slug: 'kontakt', status: 'published' }),
  }, { languages: ['sv_SE', 'en_GB'], settings: { contactPage: { label: 'C', type: 'post', control: 'post' } }, types: { post: { label: 'P', plural: 'Ps', collection: 'pages', address: '/{slug}/', elements: ['paragraph'] } } }), { setting: 'contactPage' }, 'warning'],
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
  // The grammar of a pattern (format/patterns.js).
  'pattern-start': [() => withPattern('blog/(.*)$'), { entry: '1' }],
  'pattern-encoded': [() => withPattern('^/café/(.*)$'), { entry: '1' }],
  'pattern-character': [() => withPattern('^/a"b/(.*)$'), { entry: '1' }],
  'pattern-brace': [() => withPattern('^/a{x}/(.*)$'), { entry: '1' }],
  'pattern-repeat-most': [() => withPattern('^/a{1001}/(.*)$'), { entry: '1' }],
  'pattern-repeat-range': [() => withPattern('^/a{5,2}/(.*)$'), { entry: '1' }],
  'pattern-repeat-nothing': [() => withPattern('^*a/(.*)$'), { entry: '1' }],
  'pattern-repeat-counted': [() => withPattern('^/(a{2}){3}/(.*)$'), { entry: '1' }],
  'pattern-repeat-twice': [() => withPattern('^/a**/(.*)$'), { entry: '1' }],
  'pattern-lookaround': [() => withPattern('^/(?=a)(.*)$'), { entry: '1' }],
  'pattern-named-group': [() => withPattern('^/(?<rest>.*)$'), { entry: '1' }],
  'pattern-group-kind': [() => withPattern('^/(?i)(.*)$'), { entry: '1' }],
  'pattern-unopened': [() => withPattern('^/a)/(.*)$'), { entry: '1' }],
  'pattern-caret': [() => withPattern('^/a^/(.*)$'), { entry: '1' }],
  'pattern-escape-end': [() => withPattern('^/(.*)\\'), { entry: '1' }],
  'pattern-backreference': [() => withPattern('^/(a)/\\1$'), { entry: '1' }],
  'pattern-escape': [() => withPattern('^/\\q/(.*)$'), { entry: '1' }],
  'pattern-unclosed': [() => withPattern('^/(a/(.*)$'), { entry: '1' }],
  'pattern-class-unclosed': [() => withPattern('^/(.*)[a'), { entry: '1' }],
  'pattern-class-escape': [() => withPattern('^/[\\q]/(.*)$'), { entry: '1' }],
  'pattern-class-nested': [() => withPattern('^/[[:alpha:]]/(.*)$'), { entry: '1' }],
  'pattern-class-empty': [() => withPattern('^/[]a]/(.*)$'), { entry: '1' }],
  'pattern-class-range': [() => withPattern('^/[\\d-z]/(.*)$'), { entry: '1' }],
  'pattern-class-backwards': [() => withPattern('^/[z-a]/(.*)$'), { entry: '1' }],
  // A service an Admin declares in services.json (format/declared-services.js).
  'service-shape': [() => declaring('not a service'), { file: 'services.json', entry: '1' }],
  'service-id': [() => declaring(service({ id: 'Not an id' })), { setting: 'Not an id.id' }],
  'service-core': [() => declaring(service({ id: 'vimeo' })), { setting: 'vimeo.id' }],
  'service-twice': [() => declaring(service(), service({ name: 'Another' })), { setting: 'pixel.id' }],
  'service-name': [() => declaring(service({ name: ' ' })), { setting: 'pixel.name' }],
  'service-necessary': [() => declaring(service({ category: 'necessary' })), { setting: 'pixel.category' }],
  'service-category': [() => declaring(service({ category: 'advertising' })), { setting: 'pixel.category' }],
  'service-provider': [() => declaring(service({ provider: 'P Inc' })), { setting: 'pixel.provider' }],
  'service-provider-name': [() => declaring(service({ provider: { ...PROVIDER, name: '' } })), { setting: 'pixel.provider.name' }],
  'service-country': [() => declaring(service({ provider: { ...PROVIDER, country: 'Ireland' } })), { setting: 'pixel.provider.country' }],
  'service-privacy-policy': [() => declaring(service({ provider: { ...PROVIDER, privacyPolicy: 'http://p.example.com/privacy' } })), { setting: 'pixel.provider.privacyPolicy' }],
  'service-provider-part': [() => declaring(service({ provider: { ...PROVIDER, email: 'p@example.com' } })), { setting: 'pixel.provider.email' }],
  'service-purpose': [() => declaring(service({ purpose: '' })), { setting: 'pixel.purpose' }],
  'service-storage': [() => declaring(service({ storage: 'a cookie' })), { setting: 'pixel.storage' }],
  'service-storage-item': [() => declaring(service({ storage: ['a cookie'] })), { setting: 'pixel.storage.1' }],
  'service-storage-name': [() => declaring(service({ storage: [{ ...STORED, name: '' }] })), { setting: 'pixel.storage.1.name' }],
  'service-storage-kind': [() => declaring(service({ storage: [{ ...STORED, kind: 'flash' }] })), { setting: 'pixel.storage.1.kind' }],
  'service-storage-lifetime': [() => declaring(service({ storage: [{ ...STORED, lifetime: 'forever' }] })), { setting: 'pixel.storage.1.lifetime' }],
  'service-storage-party': [() => declaring(service({ storage: [{ ...STORED, party: 'second' }] })), { setting: 'pixel.storage.1.party' }],
  'service-storage-part': [() => declaring(service({ storage: [{ ...STORED, domain: 'example.com' }] })), { setting: 'pixel.storage.1.domain' }],
  'service-transfers': [() => declaring(service({ transfers: 'US' })), { setting: 'pixel.transfers' }],
  'service-transfer': [() => declaring(service({ transfers: ['US'] })), { setting: 'pixel.transfers.1' }],
  'service-safeguards': [() => declaring(service({ transfers: [{ country: 'US', safeguards: ['trust'] }] })), { setting: 'pixel.transfers.1.safeguards' }],
  'service-transfer-part': [() => declaring(service({ transfers: [{ country: 'US', safeguards: ['scc'], since: 2020 }] })), { setting: 'pixel.transfers.1.since' }],
  'service-part': [() => declaring(service({ colour: 'red' })), { setting: 'pixel.colour' }],
  'service-hosts': [() => declaring(service({ hosts: 'https://pixel.example.com' })), { setting: 'pixel.hosts' }],
  'service-hosts-kind': [() => declaring(service({ hosts: { sockets: ['https://pixel.example.com'] } })), { setting: 'pixel.hosts.sockets' }],
  'service-hosts-list': [() => declaring(service({ hosts: { images: 'https://pixel.example.com' } })), { setting: 'pixel.hosts.images' }],
  'service-host-any': [() => hosting('*'), { setting: 'pixel.hosts.images.1' }],
  'service-host-http': [() => hosting('http://pixel.example.com'), { setting: 'pixel.hosts.images.1' }],
  'service-host-scheme': [() => hosting('ftp://pixel.example.com'), { setting: 'pixel.hosts.images.1' }],
  'service-host-https-alone': [() => hosting('https://'), { setting: 'pixel.hosts.images.1' }],
  'service-host-path': [() => hosting('https://pixel.example.com/count'), { setting: 'pixel.hosts.images.1' }],
  'service-host-query': [() => hosting('https://pixel.example.com?count'), { setting: 'pixel.hosts.images.1' }],
  'service-host-fragment': [() => hosting('https://pixel.example.com#count'), { setting: 'pixel.hosts.images.1' }],
  'service-host-user': [() => hosting('https://someone@pixel.example.com'), { setting: 'pixel.hosts.images.1' }],
  'service-host-port': [() => hosting('https://pixel.example.com:8443'), { setting: 'pixel.hosts.images.1' }],
  'service-host-letters': [() => hosting('https://bücher.example'), { setting: 'pixel.hosts.images.1' }],
  'service-host-wildcard': [() => hosting('https://pixel.*.example.com'), { setting: 'pixel.hosts.images.1' }],
  'service-host-name': [() => hosting('https://localhost'), { setting: 'pixel.hosts.images.1' }],
  'service-host-public': [() => hosting('https://*.co.uk'), { setting: 'pixel.hosts.images.1' }],
  'service-host-public-each': [() => hosting('https://*.kawasaki.jp'), { setting: 'pixel.hosts.images.1' }],
  'service-host-shared': [() => hosting('https://*.github.io'), { setting: 'pixel.hosts.images.1' }],
  'service-host-shared-each': [() => hosting('https://*.compute.amazonaws.com'), { setting: 'pixel.hosts.images.1' }],
  'service-host-admin': [() => hosting('https://admin.example.com', { adminHost: 'admin.example.com' }), { setting: 'pixel.hosts.images.1' }],
  'service-host-admin-under': [() => hosting('https://*.example.com', { adminHost: 'admin.example.com' }), { setting: 'pixel.hosts.images.1' }],
  'publisher-missing': [() => withFiles({}), { setting: 'search.publisher.name' }, 'warning'],
  'legal-missing': [() => withFiles({ 'articles/aaaaaaaaaaaa.md': article({}, 'https://vimeo.com/76979871') }), { setting: 'legalPages.privacyPolicy' }, 'warning'],
};

// What the seam says, which a test of its own holds (intake-images.test.js).
const inSeam = new Set(['image-moving', 'image-kind', 'image-large', 'image-pointer', 'svg']);

// The refusals and warnings the catalogues name, by the words' key in each area.
const named = Object.keys(CATALOGUES.en).filter((name) => /^(?:refusal|warning)\./.test(name));
const nameOf = (key, kind) => `${kind}.${key}`;

test('every refusal and warning of the catalogues has its case', () => {
  const covered = Object.entries(cases).map(([key, [, , kind = 'refusal']]) => nameOf(key, kind));
  assert.deepEqual(named.filter((name) => !covered.includes(name) && !inSeam.has(name.replace(/^\w+\./, ''))), []);
  assert.deepEqual(covered.filter((name) => !named.includes(name)), []);
});

const asPattern = (words) => new RegExp(`^${words.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '[\\s\\S]*')}$`);

for (const [key, [make, about, kind = 'refusal']] of Object.entries(cases)) {
  const name = nameOf(key, kind);
  test(`${key}: ${(CATALOGUES.en[name] ?? '').slice(0, 70)}`, () => {
    const result = make();
    const list = kind === 'warning' ? result.warnings : result.refusals;
    const found = list.find((one) => one.name === name);
    assert.ok(found, `no such ${kind} in ${JSON.stringify([...(result.refusals ?? []), ...(result.warnings ?? [])].map((one) => one.name ?? one.reason ?? one))}`);
    // The command line's words are British English, and each interface language has its own.
    assert.match(found.reason, asPattern(CATALOGUES.en[name]));
    assert.equal(reasonIn('en', found), found.reason);
    assert.match(reasonIn('sv', found), asPattern(CATALOGUES.sv[name]));
    assert.equal(messageIn('en', found), found.message);
    assert.deepEqual(JSON.parse(JSON.stringify(found)), found, 'it travels as JSON');
    for (const [part, value] of Object.entries(about)) {
      if (part === 'block') assert.equal(found.block?.name, value, JSON.stringify(found));
      else if (part === 'field') assert.equal(found.field?.name, value, JSON.stringify(found));
      else if (value === true) assert.ok(found[part] !== undefined, `names no ${part}: ${JSON.stringify(found)}`);
      else assert.deepEqual(found[part], value, JSON.stringify(found));
    }
  });
}

// Why a rule cannot answer with its target, which `refusal.rule-target` gives by a name of its
// own, `about.target-…`: an exact rule's target, and a pattern's.
const targets = {
  'target-missing': { from: '/a/', status: 301 },
  'target-browser': { from: '/a/', to: 'https://example.com/a b', status: 301 },
  'target-unreadable': { from: '/a/', to: 'https://[example]/', status: 301 },
  'target-site': { from: '/a/', to: 'https://someone@example.com/', status: 301 },
  'target-form': { from: '/a/', to: 'http://example.com/', status: 301 },
  'target-group-none': { pattern: '^/a/.*$', to: '/x/$1', status: 301 },
  'target-group-one': { pattern: '^/a/(.*)$', to: '/x/$2', status: 301 },
  'target-groups': { pattern: '^/a/(.*)/(.*)$', to: '/x/$3', status: 301 },
  'target-group-host': { pattern: '^/a/(.*)$', to: 'https://$1.example.com/', status: 301 },
  'target-loop': { pattern: '^/a/(.*)$', to: '/a/b/$1', status: 301 },
};

test('every reason a rule\'s target is refused for has its case', () => {
  const inCatalogue = Object.keys(CATALOGUES.en).filter((name) => name.startsWith('about.target-')).map((name) => name.slice('about.'.length));
  assert.deepEqual(inCatalogue.sort(), Object.keys(targets).sort());
});

for (const [key, rule] of Object.entries(targets)) {
  test(`a rule's target, ${key}: ${CATALOGUES.en[`about.${key}`] ?? ''}`, () => {
    const found = withRule(rule).refusals.find((one) => one.name === 'refusal.rule-target');
    assert.ok(found, JSON.stringify(withRule(rule).refusals));
    assert.equal(found.values.reason.name, `about.${key}`);
    assert.equal(found.values.source, rule.from ?? rule.pattern);
    const words = (language) => CATALOGUES[language]['refusal.rule-target'].replace('{reason}', CATALOGUES[language][`about.${key}`]);
    assert.match(found.reason, asPattern(words('en')));
    assert.match(reasonIn('sv', found), asPattern(words('sv')));
    assert.deepEqual(JSON.parse(JSON.stringify(found)), found, 'it travels as JSON');
  });
}

test('a pattern\'s answer is refused in the words of an exact rule\'s', () => {
  const status = withRule({ pattern: '^/a/(.*)$', to: '/x/$1', status: 200 }).refusals[0];
  assert.equal(status.name, 'refusal.rule-status');
  assert.equal(status.reason, 'the rule from ^/a/(.*)$ cannot answer "200": it answers 301, 302, 307, 308, 404, 410');
  const gone = withRule({ pattern: '^/a/(.*)$', to: '/x/$1', status: 410 }).refusals[0];
  assert.equal(gone.reason, 'the rule from ^/a/(.*)$ cannot answer so: a 410 answers without a target');
  assert.equal(reasonIn('sv', gone), 'regeln från ^/a/(.*)$ kan inte svara så: en 410 svarar utan mål');
});

test('a pattern\'s grammar and a declared service\'s problem are named in each interface language', () => {
  const [lookaround] = withPattern('^/(?=a)(.*)$').refusals;
  assert.equal(lookaround.reason, 'the pattern ^/(?=a)(.*)$ holds lookaround, which RE2 has not');
  assert.equal(reasonIn('sv', lookaround), 'mönstret ^/(?=a)(.*)$ innehåller lookaround, som RE2 saknar');
  assert.equal(messageIn('en', lookaround), 'The file redirects.json, entry 1: the pattern ^/(?=a)(.*)$ holds lookaround, which RE2 has not');
  const [kind] = declaring(service({ storage: [{ ...STORED, kind: 'flash' }] })).refusals;
  assert.equal(kind.reason, '"flash" is no kind of storage; the kinds are cookie, localStorage, sessionStorage and other');
  assert.equal(reasonIn('sv', kind), '"flash" är ingen typ av lagring; typerna är cookie, localStorage, sessionStorage och other');
  assert.equal(messageIn('sv', kind), 'Filen services.json, inställningen pixel.storage.1.kind: "flash" är ingen typ av lagring; typerna är cookie, localStorage, sessionStorage och other');
});

test('names a site\'s own label given by language in the language a refusal is shown in, British English on the command line', () => {
  const byLanguage = {
    ...site,
    language: 'sv_SE',
    types: { ...site.types, note: { ...site.types.note, plural: { en: 'Notes', sv: 'Anteckningar' } } },
    taxonomies: { ...site.taxonomies, category: { ...site.taxonomies.category, plural: { en: 'Categories', sv: 'Kategorier' } } },
  };
  const { refusals } = run({
    'settings.json': settled,
    'notes/nnnnnnnnnnnn.md': sourcePost({ title: 'A note', slug: 'a-note', status: 'published' }, 'Text.'),
    'articles/aaaaaaaaaaaa.md': article({ categories: ['aaaaaaaaaaaa', 'bbbbbbbbbbbb', 'cccccccccccc'] }),
    'articles/bbbbbbbbbbbb.md': article({ slug: 'another' }, 'A [note](konzilo:nnnnnnnnnnnn).'),
  }, byLanguage);
  const reasons = refusals.map((one) => one.reason);
  assert.ok(reasons.includes('a post takes at most 2 of its categories; choose fewer'), reasons.join('\n'));
  assert.ok(reasons.some((reason) => reason.includes('and notes have no page of their own')), reasons.join('\n'));

  // And in the editor's interface language, the post and the field it names with it.
  const most = refusals.find((one) => one.name === 'refusal.terms-most');
  assert.deepEqual(most.values, { most: 2, plural: { label: { en: 'Categories', sv: 'Kategorier' } } });
  assert.equal(reasonIn('sv', most), 'ett inlägg tar högst 2 av sina kategorier; välj färre');
  assert.equal(messageIn('sv', most), 'Inlägget "An article" (story, aaaaaaaaaaaa), fältet kategorier: ett inlägg tar högst 2 av sina kategorier; välj färre');
  assert.equal(messageIn('en', most), 'The story "An article" (aaaaaaaaaaaa), the field categories: a post takes at most 2 of its categories; choose fewer');
  const note = refusals.find((one) => one.name === 'refusal.reference-no-address');
  assert.match(reasonIn('sv', note), /och anteckningar har ingen egen sida/);
});

// An editor reads a field as the form shows it, by its label in the interface language, in the
// middle of a phrase; the command line reads the British English (ADR 0066).
test('names a field by its label, the core\'s or the site\'s own, in each interface language, and in British English on the command line', () => {
  const shown = (refusal) => [placeIn('en', refusal), placeIn('sv', refusal), reasonIn('sv', refusal)];
  const title = onePost({ title: '' }).refusals.find((one) => one.name === 'refusal.title-empty');
  assert.deepEqual(title.field, { name: 'title', label: { en: 'Title', sv: 'Titel' } });
  assert.deepEqual(shown(title).slice(0, 2), ['the field title', 'fältet titel']);
  assert.match(title.message, /, the field title: /);
  const moment = onePost({ date: 'soon' }).refusals.find((one) => one.name === 'refusal.field-moment');
  assert.deepEqual(shown(moment), ['the field date', 'fältet datum', 'webbplatsen kan inte publicera "soon" som datum och tid i datum; välj en']);
  assert.equal(moment.reason, 'the site cannot publish "soon" as a date and time in date; choose one');
  const canonical = onePost({ search: { canonical: 'the-original/' } }).refusals[0];
  assert.deepEqual(shown(canonical).slice(0, 2), ['the field search: canonical address', 'fältet sök: kanonisk adress']);
  const excerpt = onePost({ excerpt: 'An <em>excerpt</em>' }).refusals.find((one) => one.name === 'refusal.field-markup');
  assert.deepEqual(shown(excerpt), ['the field excerpt', 'fältet utdrag', 'webbplatsen kan inte publicera utdrag med HTML i; skriv det som vanlig text']);
  const own = withFiles({ 'articles/aaaaaaaaaaaa.md': article({ readingTime: { a: 1 } }) }).refusals.find((one) => one.name === 'refusal.field-value');
  assert.deepEqual(shown(own), ['the field reading time', 'fältet reading time', 'webbplatsen kan inte publicera detta som reading time']);
  const brief = withFiles({ 'briefs/aaaaaaaaaaaa.md': sourcePost({ title: 'B', slug: 'b', status: 'published', excerpt: 'E', image: { src: '/media/a.png', alt: 'A' } }) }).refusals.find((one) => one.name === 'refusal.field-required');
  assert.deepEqual(shown(brief), ['the field tags', 'fältet tags', 'webbplatsen kan inte publicera ett inlägg utan fältet tags; fyll i det']);
});

test('a feed a refusal names is named in each interface language', () => {
  const feed = onePost({ slug: 'feed' }).refusals.find((one) => one.name === 'refusal.address-feed');
  assert.equal(feed.reason, 'the address /feed/ is the feed of articles; change this post\'s slug');
  assert.equal(reasonIn('sv', feed), 'adressen /feed/ är flödet för articles; ändra det här inläggets slug');
});

test('a refusal in the body names its block in each interface language', () => {
  const [heading] = inArticle('# A title').refusals;
  assert.equal(heading.name, 'refusal.heading-level');
  assert.equal(heading.reason, 'the site cannot publish a heading at level 1: the post\'s title is its level 1; use a level from 2 to 6');
  assert.equal(reasonIn('sv', heading), 'webbplatsen kan inte publicera en rubrik på nivå 1: inläggets titel är dess nivå 1; använd en nivå från 2 till 6');
  assert.equal(messageIn('sv', heading), `Inlägget "An article" (story, aaaaaaaaaaaa), block 1 (heading), rad ${heading.line}: ${reasonIn('sv', heading)}`);
});

// What the rule data holds in its elements: a directive's refusals, and a link's.
const body = (text) => inArticle(text).refusals.map((one) => one.reason);

test('a link\'s target and rel are refused in their own words', () => {
  assert.deepEqual(body('<a href="/x/" target="_self">A link</a> here'), ['the site cannot publish a link that opens anywhere but a new tab (target "_self")']);
  assert.deepEqual(body('<a href="/x/" rel="me">A link</a> here'), ['the site cannot publish a link with the rel value "me"; a link\'s rel may hold noreferrer, noopener, nofollow, sponsored and ugc, each once']);
  assert.deepEqual(body('<a href="/x/" rel="ugc ugc">A link</a> here'), ['the site cannot publish a link with the rel value "ugc ugc"; a link\'s rel may hold noreferrer, noopener, nofollow, sponsored and ugc, each once']);
  const [rel] = inArticle('<a href="/x/" rel="me">A link</a> here').refusals;
  assert.equal(reasonIn('sv', rel), 'webbplatsen kan inte publicera en länk med rel-värdet "me"; en länks rel får innehålla noreferrer, noopener, nofollow, sponsored och ugc, vart och ett en gång');
});

test('a form the site no longer offers, and a second list with pages', () => {
  assert.deepEqual(body('::form{name="order"}'), ['the site declares no form "order"; it declares contact']);
  assert.deepEqual(body('::post-list{type="story" pages="true" presentation="list"}\n\n::post-list{type="story" pages="true" presentation="list"}'), ['the site cannot publish a second list with pages of its own; turn off Pages in one of them']);
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
    assert.deepEqual(refusal.post, { id: 'aaaaaaaaaaaa', type: 'story', title: 'An article' });
    assert.match(refusal.message, /^The story "An article" \(aaaaaaaaaaaa\), block /);
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

test('a canonical address is a whole http:// or https:// address, and anything else is refused, naming the field', () => {
  for (const given of ['the-original/', '/the-original/', '//elsewhere.example.org/the-original/', 'ftp://elsewhere.example.org/the-original/', 'mailto:keeper@example.org', 'https://', 'https://elsewhere.example.org/the original/', 'https://keeper@elsewhere.example.org/']) {
    const { refusals } = onePost({ search: { canonical: given } });
    assert.deepEqual(refusals.map(({ field, reason }) => [field.name, reason]), [['search.canonical', `the canonical address ${JSON.stringify(given)} is not a whole web address; write one starting with https:// or http://, or leave it out`]], given);
  }
  for (const given of ['https://elsewhere.example.org/the-original/', 'http://elsewhere.example.org', 'https://elsewhere.example.org:8443/a/b?c=d#e']) {
    assert.deepEqual(onePost({ search: { canonical: given } }).refusals, [], given);
  }
});

test('search and sharing fields in one map, as the content file holds them, are refused, not dropped', () => {
  const { refusals } = onePost({ seo: { title: 'A title' } });
  assert.deepEqual(refusals.map((one) => /cannot read the search and sharing fields/.test(one.message)), [true]);
});
