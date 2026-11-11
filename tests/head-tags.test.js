// The search and sharing tags in every page's head: the title
// tag, the meta description, the canonical address, the robots rule, Open
// Graph and X's card, from the Admin's metadata templates in the Search and
// sharing settings, the post's own search and sharing fields and the site's
// identity, which the integration's Head component writes.
//
// - The template renderer gives each variable its value from the post, the
//   settings and the site's identity, and tidies what it renders.
// - A small site built with `astro build` for https://www.example.com, its
//   layout placing the component, gives each article's head and the start
//   page's exactly.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { feedTitle, siteFeeds } from '../src/astro/feeds.js';
import { renderTemplate } from '../src/metadata-templates.js';
import { ALTERNATES, headTags, templateValues } from '../src/astro/search-and-sharing.js';
import { siteDescription } from '../src/site-description.js';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { paragraphs, post as sitePost, writeContent } from './lib/content.js';
import { alike, drawing, plainImage, QUARTERS, quarterColours, sharp, shortHash } from './lib/images.js';

// Articles with every field a template can name: a date, the last change,
// an excerpt, topics and fields of the site's own of each type.
const model = siteDescription({
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    post: {
      label: 'Article',
      plural: 'Articles',
      collection: 'articles',
      address: '/{slug}/',
      elements: ['paragraph'],
      fields: {
        date: {},
        modified: {},
        excerpt: {},
        topics: { taxonomy: 'topic' },
        image: {},
        seo: {},
        subtitle: { label: 'Subtitle', type: 'string', control: 'text' },
        rating: { label: 'Rating', type: 'integer', control: 'number' },
        featured: { label: 'Featured', type: 'boolean', control: 'toggle' },
        opens: { label: 'Opens', type: 'date', control: 'date' },
      },
    },
  },
  taxonomies: { topic: { label: 'Topic', plural: 'Topics', collection: 'topics' } },
});

// The settings as Astro hands a template the settings entry's data.
const settings = {
  title: 'The Quiet Lantern',
  search: { separator: '–', description: 'Light for the harbour.' },
};

// An article as Astro hands a template its entry, and its topics' names.
const article = {
  id: 'harbour-lights',
  collection: 'articles',
  body: 'The lantern keeps the harbour.',
  data: {
    title: 'Harbour lights',
    date: new Date('2026-10-01T08:00:00Z'),
    modified: new Date('2026-10-20T14:05:09Z'),
    excerpt: 'Where the lantern stands.',
    topics: [{ collection: 'topics', id: 'harbours' }, { collection: 'topics', id: 'light' }],
    subtitle: 'A guide',
    rating: 4,
    featured: true,
    opens: new Date('2026-11-01T00:00:00Z'),
  },
};
const post = { entry: article, type: model.types.post, terms: { topic: ['Harbours', 'Light'] } };
const now = new Date('2026-10-30T12:00:00Z');

function rendered(template, given = {}) {
  const values = templateValues({ settings, post, languageTag: 'en-GB', now, ...given });
  return renderTemplate(template, values, (given.settings ?? settings).search.separator);
}

test('each variable of the Search and sharing settings renders as its value from the post, the settings and the site\'s identity', () => {
  const table = [
    ['site.title', 'The Quiet Lantern'],
    ['site.description', 'Light for the harbour.'],
    ['current.year', '2026'],
    ['post.title', 'Harbour lights'],
    ['post.auto_description', 'Where the lantern stands.'],
    ['post.excerpt', 'Where the lantern stands.'],
    ['post.date', '1 October 2026'],
    ['post.modified_date', '20 October 2026'],
    ['post.custom_field.subtitle', 'A guide'],
    ['post.custom_field.rating', '4'],
    ['post.custom_field.featured', '1'],
    ['post.custom_field.opens', '2026-11-01'],
    ['post.tax.topic', 'Harbours, Light'],
    ['post_type.labels.singular', 'Article'],
  ];
  for (const [variable, value] of table) assert.equal(rendered(`{{ ${variable} }}`), value, variable);
  // The separator, which goes at either end, between two parts.
  assert.equal(rendered('A {{ sep }} B'), 'A – B');
  // Written without spaces too.
  assert.equal(rendered('{{post.title}}'), 'Harbour lights');
});

test('a date is written in the site\'s language, and the summary is the body\'s start without an excerpt', () => {
  assert.equal(rendered('{{ post.date }}', { languageTag: 'sv-SE' }), '1 oktober 2026');
  assert.equal(rendered('{{ post.date }}', { languageTag: 'en' }), 'October 1, 2026');
  const plain = { ...post, entry: { ...article, data: { ...article.data, excerpt: undefined, featured: false } } };
  assert.equal(rendered('{{ post.auto_description }}', { post: plain }), 'The lantern keeps the harbour.');
  assert.equal(rendered('{{ post.excerpt }}|{{ post.custom_field.featured }}', { post: plain }), '|');
});

test('a type\'s label given by language renders in the page\'s language, else in British English', () => {
  const byLanguage = { ...post, type: { ...model.types.post, label: { en: 'Article', sv: 'Artikel' } } };
  assert.equal(rendered('{{ post_type.labels.singular }}', { post: byLanguage, languageTag: 'sv-SE' }), 'Artikel');
  assert.equal(rendered('{{ post_type.labels.singular }}', { post: byLanguage, languageTag: 'en-GB' }), 'Article');
  assert.equal(rendered('{{ post_type.labels.singular }}', { post: byLanguage, languageTag: 'fi' }), 'Article');
});

test('a type\'s feed among others takes the type\'s plural given by language in the feed\'s language', () => {
  const type = (plural, collection, feed) => ({ label: 'x', plural, collection, address: `/${collection}/{slug}/`, feed, elements: ['paragraph'], fields: { date: {} } });
  const site = siteDescription({
    languages: ['sv_SE', 'en_GB'],
    types: { news: type({ en: 'News', sv: 'Nyheter' }, 'news', '/news/feed/'), notes: type('Notes', 'notes', '/notes/feed/') },
  });
  const titles = siteFeeds(site).filter((feed) => feed.type.name === 'news').map((feed) => [feed.language.locale, feedTitle(site, feed, { title: 'Lyktan' })]);
  assert.deepEqual(titles, [['sv_SE', 'Lyktan – Nyheter'], ['en_GB', 'Lyktan – News']]);
});

test('the start page\'s part renders the site\'s variables', () => {
  assert.equal(rendered('{{ site.title }} {{ sep }} {{ site.description }} {{ current.year }}', { post: null }), 'The Quiet Lantern – Light for the harbour. 2026');
});

test('a rendered template\'s spaces collapse to one, and a separator left at either end, or beside another, goes', () => {
  assert.equal(rendered('{{ post.title }} {{ sep }} {{ site.title }}'), 'Harbour lights – The Quiet Lantern');
  assert.equal(rendered('  {{ post.title }}\n  in   {{ site.title }} '), 'Harbour lights in The Quiet Lantern');
  const without = { ...settings, title: undefined, search: { separator: '|' } };
  assert.equal(rendered('{{ post.title }} {{ sep }} {{ site.title }}', { settings: without }), 'Harbour lights');
  assert.equal(rendered('{{ site.description }} {{ sep }} {{ post.title }} {{ sep }} {{ site.description }} {{ sep }} {{ site.title }}', { settings: without }), 'Harbour lights');
  assert.equal(rendered('{{ site.title }} | {{ post.title }}', { settings: { ...without, title: 'Lantern' } }), 'Lantern | Harbour lights');
  assert.equal(rendered('{{ site.description }}', { settings: without }), '');
});

test('a page with no image to share has X\'s small card, and the alternates of the core come after its tags, before the structured data: its Markdown, then those another part adds', async () => {
  const part = ({ path, origin }) => [{ type: 'application/atom+xml', href: `${origin}${path}feed/` }, { type: 'application/rss+xml', href: `${origin}/feed/`, title: 'Articles' }];
  ALTERNATES.push(part);
  let tags;
  try {
    const plain = { ...article, data: { title: 'Harbour lights', date: article.data.date, modified: article.data.modified } };
    tags = await headTags(
      { entry: plain, path: '/harbour-lights/', settings: { title: 'Lantern', search: { separator: '–', types: { post: { title: '{{ post.title }}', schema: 'Article' } } } }, site: model, origin: 'https://www.example.com', locale: 'en_GB', languageTag: 'en-GB' },
      { getImage: () => assert.fail('no image to make'), getEntries: async () => [] },
    );
  } finally {
    ALTERNATES.splice(ALTERNATES.indexOf(part), 1);
  }
  assert.deepEqual(tags.map(({ tag, attributes, text }) => (tag === 'title' ? text : Object.values(attributes).join(' '))), [
    'Harbour lights',
    'canonical https://www.example.com/harbour-lights/',
    'og:type website',
    'og:title Harbour lights',
    'og:url https://www.example.com/harbour-lights/',
    'og:site_name Lantern',
    'og:locale en_GB',
    'twitter:card summary',
    'twitter:title Harbour lights',
    'alternate text/markdown https://www.example.com/harbour-lights.md',
    'alternate application/atom+xml https://www.example.com/harbour-lights/feed/',
    'alternate application/rss+xml https://www.example.com/feed/ Articles',
    'application/ld+json',
  ]);
});

// A small site built by Astro, as a build on the shared server builds it
// for its public host, from content files the intake's command writes.
describe('a site built with astro build for https://www.example.com', () => {
  const core = fileURLToPath(new URL('../', import.meta.url));
  const astro = join(core, 'node_modules/astro/bin/astro.mjs');
  const integration = join(core, 'src/astro/index.js');
  const { JSDOM } = createRequire(join(core, 'package.json'))('jsdom');

  // Articles with a date, their last change, an excerpt, a featured image and
  // the search and sharing fields, on a site in Swedish.
  const site = {
    language: 'sv_SE',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      post: {
        label: 'Article',
        plural: 'Articles',
        collection: 'articles',
        address: '/{slug}/',
        elements: ['paragraph'],
        fields: { date: {}, modified: {}, excerpt: {}, image: {}, seo: {} },
      },
    },
  };

  // The layout places the component in its head, given the entry a page
  // shows, or a page of the site's own's title and description.
  const design = {
    'src/layouts/Page.astro': [
      '---',
      "import Head from '@kntnt/konzilo/astro/Head.astro';",
      'const { entry, title, description } = Astro.props;',
      '---',
      '<html lang="sv-SE">',
      '  <head>',
      '    <meta charset="utf-8" />',
      '    <Head entry={entry} title={title} description={description} />',
      '  </head>',
      '  <body><main><slot /></main></body>',
      '</html>',
      '',
    ].join('\n'),
    'src/pages/index.astro': "---\nimport Page from '../layouts/Page.astro';\n---\n<Page><h1>Start</h1></Page>\n",
    'src/pages/contact.astro': "---\nimport Page from '../layouts/Page.astro';\n---\n<Page title=\"Contact us\" description=\"How to reach the keeper.\"><h1>Contact us</h1></Page>\n",
    'src/pages/[slug].astro': [
      '---',
      "import { getCollection, render } from 'astro:content';",
      "import Page from '../layouts/Page.astro';",
      'export async function getStaticPaths() {',
      "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
      '}',
      'const { entry } = Astro.props;',
      'const { Content } = await render(entry);',
      '---',
      '<Page entry={entry}><h1>{entry.data.title}</h1><Content /></Page>',
      '',
    ].join('\n'),
  };

  // The images, each drawn by the suite, of its own size so that each has
  // a master of its own: the featured image, an article's own sharing image,
  // the default sharing image and the logo, a drawing.
  const LOGO = drawing({ width: 240, height: 60 });
  let images;
  let disk;
  let repository;

  const LONG = 'At dusk the keeper climbs the tower, trims the wick, polishes the glass and lights the lantern, so that the fishing boats coming home after dark find the harbour mouth between the rocks without fear.';
  const posts = () => [
    // No values of its own, with an excerpt and a featured image.
    sitePost({
      ID: 1,
      slug: 'harbour-lights',
      title: 'Harbour lights',
      excerpt: 'Where the lantern stands, and why.',
      date: '2026-10-01 08:00:00',
      modified: '2026-10-20 14:05:09',
      body: paragraphs('The lantern keeps the harbour.'),
      meta: { thumbnail: ['12'], image_alt: ['The lantern at dusk'] },
      attachments: { 12: { original: join(disk, 'featured.png') } },
    }),
    // No values of its own, no excerpt and no featured image.
    sitePost({
      ID: 2,
      slug: 'night-watch',
      title: 'Night watch',
      date: '2026-10-02 20:00:00',
      modified: '2026-10-02 20:00:00',
      body: paragraphs(LONG),
    }),
    // Every value of its own.
    sitePost({
      ID: 3,
      slug: 'thank-you',
      title: 'Thank you',
      date: '2026-10-03 09:00:00',
      modified: '2026-10-03 09:30:00',
      body: paragraphs('Thank you for your letter.'),
      meta: {
        seo_title: ['Thanks for writing'],
        seo_description: ['We read every letter.'],
        seo_social_title: ['Write to the keeper'],
        seo_social_description: ['The keeper answers every letter.'],
        seo_social_image: ['14'],
        seo_social_image_alt: ['A letter on the table'],
        seo_schema: ['WebPage'],
        seo_noindex: ['1'],
        seo_nofollow: ['1'],
      },
      attachments: { 14: { original: join(disk, 'own.png') } },
    }),
    // Published first elsewhere, which its canonical address names.
    sitePost({
      ID: 4,
      slug: 'ferry-times',
      title: 'Ferry times',
      date: '2026-10-04 07:00:00',
      modified: '2026-10-04 07:00:00',
      body: paragraphs('The first ferry leaves at dawn.'),
      meta: { seo_canonical: ['https://ferries.example.org/timetable/ferry-times'] },
    }),
    // Its canonical address is its own.
    sitePost({
      ID: 5,
      slug: 'quay-walk',
      title: 'A walk on the quay',
      date: '2026-10-05 07:00:00',
      modified: '2026-10-05 07:00:00',
      body: paragraphs('The quay is long.'),
      meta: { seo_canonical: ['https://www.example.com/quay-walk/'] },
    }),
  ];

  // The site settings as a build hands them out: the
  // site's title and logo, and the Search and sharing settings kept.
  const siteSettings = (search) => ({
    menus: {},
    settings: { search },
    redirects: [],
    identity: { title: 'The Quiet Lantern', logo: { id: 51, original: join(disk, 'logo.svg'), alt: 'A lantern beside the words The Quiet Lantern' }, icon: null },
    attachments: { 41: { original: join(disk, 'card.png'), alt: 'The harbour at night' } },
  });

  function write(path, contents) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  }

  // Export the posts with the Search and sharing settings `search` kept, as
  // a build does, build, and give each page's head as [name, value] pairs.
  function build(search) {
    write('site-settings.json', JSON.stringify(siteSettings(search)));
    const exported = writeContent(repository, posts());
    assert.equal(exported.status, 0, exported.stderr);
    const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    return (path) => headOf(readFileSync(join(repository, 'dist', path, 'index.html'), 'utf8'));
  }

  // A head's title, its meta tags by name or property and its links by
  // relation, in order, each with its value.
  function headOf(html) {
    const { document } = new JSDOM(html).window;
    return [...document.head.children].flatMap((element) => {
      if (element.tagName === 'TITLE') return [['title', element.textContent]];
      if (element.tagName === 'LINK') return [[element.getAttribute('rel'), element.getAttribute('href')]];
      const name = element.getAttribute('name') ?? element.getAttribute('property');
      return element.tagName === 'META' && name !== null ? [[name, element.getAttribute('content')]] : [];
    });
  }

  // The image a head shares, which must be a 1200 × 630 JPEG on the public
  // host made from the master named `master`, the same for X, showing the
  // four quarters every image of the suite is drawn of.
  async function shared(head, master) {
    const address = new Map(head).get('og:image');
    assert.match(address, new RegExp(`^https://www\\.example\\.com/_astro/${master}\\.[^./]+\\.(jpg|jpeg)$`));
    assert.equal(new Map(head).get('twitter:image'), address);
    const bytes = readFileSync(join(repository, 'dist', new URL(address).pathname));
    const { format, width, height } = await sharp(bytes).metadata();
    assert.deepEqual({ format, width, height }, { format: 'jpeg', width: 1200, height: 630 });
    const colours = await quarterColours(sharp, bytes);
    for (const [quarter, colour] of Object.entries(QUARTERS)) assert.ok(alike(colours[quarter], colour, 24), `${quarter}: ${colours[quarter]}`);
    return address;
  }

  before(async () => {
    images = {
      'featured.png': await plainImage(sharp, { width: 1600, height: 1000 }),
      'own.png': await plainImage(sharp, { width: 1300, height: 700 }),
      'card.png': await plainImage(sharp, { width: 1000, height: 900 }),
      'logo.svg': LOGO,
    };
    disk = mkdtempSync(join(tmpdir(), 'konzilo-uploads-'));
    for (const [file, bytes] of Object.entries(images)) writeFileSync(join(disk, file), bytes);
    repository = mkdtempSync(join(tmpdir(), 'konzilo-head-tags-'));
    // The core's dependencies, and the core itself as a site installs it.
    mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
    for (const entry of readdirSync(join(core, 'node_modules'))) {
      if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
    }
    symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
    write('astro.config.mjs', astroConfig(integration));
    write('src/content.config.mjs', `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`);
    write('site-description.json', JSON.stringify(site));
    for (const [path, contents] of Object.entries(design)) write(path, contents);
  });

  after(() => {
    rmSync(repository, { recursive: true, force: true });
    rmSync(disk, { recursive: true, force: true });
  });

  const master = (slug, file) => `${slug}-${shortHash(images[file])}`;

  test('an article takes the templates where it has no values of its own, and its own where it has, on its address, sharing its own image, its featured image or the default', async () => {
    const head = build({ image: '41', description: 'Light for the harbour.' });

    // No values of its own: the title template, the excerpt, the featured image.
    const article = head('harbour-lights');
    const image = await shared(article, master('harbour-lights', 'featured.png'));
    assert.deepEqual(article, [
      ['title', 'Harbour lights – The Quiet Lantern'],
      ['description', 'Where the lantern stands, and why.'],
      ['canonical', 'https://www.example.com/harbour-lights/'],
      ['og:type', 'website'],
      ['og:title', 'Harbour lights'],
      ['og:description', 'Where the lantern stands, and why.'],
      ['og:url', 'https://www.example.com/harbour-lights/'],
      ['og:site_name', 'The Quiet Lantern'],
      ['og:locale', 'sv_SE'],
      ['og:image', image],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:image:alt', 'The lantern at dusk'],
      ['twitter:card', 'summary_large_image'],
      ['twitter:title', 'Harbour lights'],
      ['twitter:description', 'Where the lantern stands, and why.'],
      ['twitter:image', image],
      ['twitter:image:alt', 'The lantern at dusk'],
      ['alternate', 'https://www.example.com/harbour-lights.md'],
    ]);

    // Without an excerpt, the start of its body, cut at a word; without a
    // featured image, the default sharing image, made from a smaller one.
    const night = head('night-watch');
    const card = await shared(night, `search-image-${shortHash(images['card.png'])}`);
    const cut = 'At dusk the keeper climbs the tower, trims the wick, polishes the glass and lights the lantern, so that the fishing boats coming home after dark find the…';
    const shown = ['title', 'description', 'og:description', 'og:image:alt', 'twitter:description', 'twitter:image:alt'];
    assert.deepEqual(Object.fromEntries(night.filter(([name]) => shown.includes(name))), {
      title: 'Night watch – The Quiet Lantern',
      description: cut,
      'og:description': cut,
      'og:image:alt': 'The harbour at night',
      'twitter:description': cut,
      'twitter:image:alt': 'The harbour at night',
    });

    // Every value of its own, kept from search engines.
    const thanks = head('thank-you');
    const own = await shared(thanks, master('thank-you', 'own.png'));
    assert.deepEqual(thanks, [
      ['title', 'Thanks for writing'],
      ['description', 'We read every letter.'],
      ['canonical', 'https://www.example.com/thank-you/'],
      ['robots', 'noindex, nofollow'],
      ['og:type', 'website'],
      ['og:title', 'Write to the keeper'],
      ['og:description', 'The keeper answers every letter.'],
      ['og:url', 'https://www.example.com/thank-you/'],
      ['og:site_name', 'The Quiet Lantern'],
      ['og:locale', 'sv_SE'],
      ['og:image', own],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:image:alt', 'A letter on the table'],
      ['twitter:card', 'summary_large_image'],
      ['twitter:title', 'Write to the keeper'],
      ['twitter:description', 'The keeper answers every letter.'],
      ['twitter:image', own],
      ['twitter:image:alt', 'A letter on the table'],
    ]);

    // The start page takes its templates, the site's title and description,
    // and a page of the site's own its own title, in a title tag as an
    // article's by default, and description, each on its own address.
    assert.deepEqual(head(''), [
      ['title', 'The Quiet Lantern'],
      ['description', 'Light for the harbour.'],
      ['canonical', 'https://www.example.com/'],
      ['og:type', 'website'],
      ['og:title', 'The Quiet Lantern'],
      ['og:description', 'Light for the harbour.'],
      ['og:url', 'https://www.example.com/'],
      ['og:site_name', 'The Quiet Lantern'],
      ['og:locale', 'sv_SE'],
      ['og:image', card],
      ['og:image:width', '1200'],
      ['og:image:height', '630'],
      ['og:image:alt', 'The harbour at night'],
      ['twitter:card', 'summary_large_image'],
      ['twitter:title', 'The Quiet Lantern'],
      ['twitter:description', 'Light for the harbour.'],
      ['twitter:image', card],
      ['twitter:image:alt', 'The harbour at night'],
      ['alternate', 'https://www.example.com/index.md'],
    ]);
    assert.deepEqual(Object.fromEntries(head('contact').slice(0, 7)), {
      title: 'Contact us – The Quiet Lantern',
      description: 'How to reach the keeper.',
      canonical: 'https://www.example.com/contact/',
      'og:type': 'website',
      'og:title': 'Contact us',
      'og:description': 'How to reach the keeper.',
      'og:url': 'https://www.example.com/contact/',
    });
  });

  test('a post with a canonical address elsewhere names it as its canonical link and its og:url, and is not in the sitemap, as one that names its own is', () => {
    const head = build({});
    const ferry = new Map(head('ferry-times'));
    assert.equal(ferry.get('canonical'), 'https://ferries.example.org/timetable/ferry-times');
    assert.equal(ferry.get('og:url'), 'https://ferries.example.org/timetable/ferry-times');
    const quay = new Map(head('quay-walk'));
    assert.equal(quay.get('canonical'), 'https://www.example.com/quay-walk/');
    assert.equal(quay.get('og:url'), 'https://www.example.com/quay-walk/');
    const sitemap = readFileSync(join(repository, 'dist/sitemap.xml'), 'utf8');
    assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc), [
      'https://www.example.com/',
      'https://www.example.com/harbour-lights/',
      'https://www.example.com/night-watch/',
      'https://www.example.com/quay-walk/',
    ]);
  });

  test('a changed template changes the title, and without a default sharing image an article without an image of its own shares the logo, drawn as a JPEG', async () => {
    const head = build({ types: { post: { title: '{{ post.title }} {{ sep }} {{ post_type.labels.singular }} {{ sep }} {{ site.title }}' } } });

    assert.equal(new Map(head('harbour-lights')).get('title'), 'Harbour lights – Article – The Quiet Lantern');
    const night = head('night-watch');
    await shared(night, `logo-${shortHash(LOGO)}`);
    assert.equal(new Map(night).get('og:image:alt'), 'A lantern beside the words The Quiet Lantern');
    // The start page of a site without a description has none.
    assert.deepEqual(head('').map(([name]) => name).filter((name) => name.includes('description')), []);
  });
});
