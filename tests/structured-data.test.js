// The structured data of every page: one JSON-LD graph in the
// page's head, which the integration's Head component writes, holding the
// website, the publisher, the page, an article where the page's structured
// data type is one, the image the page shares and, but on the start page,
// the page's breadcrumbs (breadcrumbs.test.js), each with a stable
// @id on the public host.
//
// - A small site built with `astro build` for https://www.example.com, its
//   layout placing the component, gives an article's graph, a page's whose
//   type is AboutPage, the start page's and those of a site whose publisher
//   is a person, exactly.
// - Every @id a graph names is a node of it, and every article has what
//   search engines ask of one.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { headTags } from '../src/astro/search-and-sharing.js';
import { siteDescription } from '../src/site-description.js';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { paragraphs, post as sitePost, writeContent } from './lib/content.js';
import { drawing, plainImage, sharp, shortHash } from './lib/images.js';

const ORIGIN = 'https://www.example.com';
const WEBSITE = { '@id': `${ORIGIN}/#website` };
const PUBLISHER = { '@id': `${ORIGIN}/#publisher` };

// Notes with a date but no last change, whose structured data type the
// Admin has made BlogPosting.
const notes = siteDescription({
  language: 'sv_SE',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'], fields: { date: {} } },
  },
});

// The graph of a note's page, the site's logo `logo` made by Astro's image
// pipeline into an image of 240 × 60, as the head component would write it.
async function noteGraph({ title, publisher, logo }) {
  const note = { id: 'tide', collection: 'notes', body: 'The tide turns at six.', data: { title, date: new Date('2026-10-05T06:00:00Z') } };
  const settings = { title: 'Lantern', ...(logo ? { logo } : {}), search: { separator: '–', publisher, types: { note: { title: '{{ post.title }}', description: '{{ post.auto_description }}', schema: 'BlogPosting' } } } };
  const getImage = async ({ src }) => ({ src: `/_astro/${src}`, attributes: { width: 240, height: 60 } });
  const tags = await headTags({ entry: note, path: '/notes/tide/', settings, site: notes, origin: ORIGIN, locale: 'sv_SE', languageTag: 'sv-SE' }, { getImage, getEntries: async () => [] });
  const scripts = tags.filter(({ tag }) => tag === 'script');
  assert.deepEqual(scripts.map(({ attributes }) => attributes), [{ type: 'application/ld+json' }]);
  return { text: scripts[0].text, graph: JSON.parse(scripts[0].text) };
}

test('a type without a last change gives its article the date as its last change, in the type the Admin chose for it', async () => {
  const { graph } = await noteGraph({ title: 'Tide', publisher: { kind: 'Organization', name: 'Lantern AB' } });
  const page = `${ORIGIN}/notes/tide/`;
  assert.deepEqual(graph['@graph'].slice(2), [
    { '@type': 'WebPage', '@id': `${page}#webpage`, url: page, name: 'Tide', description: 'The tide turns at six.', isPartOf: WEBSITE, inLanguage: 'sv-SE', datePublished: '2026-10-05T06:00:00Z' },
    {
      '@type': 'BlogPosting',
      '@id': `${page}#article`,
      headline: 'Tide',
      description: 'The tide turns at six.',
      datePublished: '2026-10-05T06:00:00Z',
      dateModified: '2026-10-05T06:00:00Z',
      author: PUBLISHER,
      publisher: PUBLISHER,
      mainEntityOfPage: { '@id': `${page}#webpage` },
      inLanguage: 'sv-SE',
    },
  ]);
});

test('the site\'s logo is an organisation\'s logo and a person\'s image, as schema.org names them, and a site without one names none', async () => {
  const logo = { src: 'logo.webp', alt: 'A lantern' };
  const address = `${ORIGIN}/_astro/logo.webp`;
  const object = { '@type': 'ImageObject', url: address, contentUrl: address, width: 240, height: 60, caption: 'A lantern' };
  const publisherOf = async (kind, given) => (await noteGraph({ title: 'Tide', publisher: { kind, name: 'Ada' }, logo: given })).graph['@graph'][1];
  assert.deepEqual(await publisherOf('Organization', logo), { '@type': 'Organization', '@id': `${ORIGIN}/#publisher`, name: 'Ada', url: `${ORIGIN}/`, logo: object });
  assert.deepEqual(await publisherOf('Person', logo), { '@type': 'Person', '@id': `${ORIGIN}/#publisher`, name: 'Ada', url: `${ORIGIN}/`, image: object });
  assert.deepEqual(await publisherOf('Organization', undefined), { '@type': 'Organization', '@id': `${ORIGIN}/#publisher`, name: 'Ada', url: `${ORIGIN}/` });
});

test('no text in the graph can end its script in the page', async () => {
  const { text, graph } = await noteGraph({ title: '</script><!-- Tide', publisher: { kind: 'Organization', name: 'Lantern AB' } });
  assert.doesNotMatch(text, /</);
  assert.equal(graph['@graph'][3].headline, '</script><!-- Tide');
});

// A small site built by Astro, as a build on the shared server builds it
// for its public host, from content files the intake's command writes.
describe('a site built with astro build for https://www.example.com', () => {
  const core = fileURLToPath(new URL('../', import.meta.url));
  const astro = join(core, 'node_modules/astro/bin/astro.mjs');
  const integration = join(core, 'src/astro/index.js');
  const { JSDOM } = createRequire(join(core, 'package.json'))('jsdom');

  // Articles with a date, their last change, an excerpt, a featured image and
  // the search and sharing fields, below /news/, and pages with the search
  // and sharing fields alone, at the root.
  const site = {
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: {
      post: {
        label: 'Article',
        plural: 'Articles',
        collection: 'articles',
        address: '/news/{slug}/',
        elements: ['paragraph'],
        fields: { date: {}, modified: {}, excerpt: {}, image: {}, seo: {} },
      },
      page: {
        label: 'Page',
        plural: 'Pages',
        collection: 'pages', hierarchical: true,
        address: '/{path}/',
        elements: ['paragraph'],
      },
    },
  };

  // The layout places the component in its head, given the entry a page
  // shows.
  const route = (collection, parameter = 'slug') => [
    '---',
    "import { getCollection } from 'astro:content';",
    `import Page from '${collection === 'articles' ? '../../' : '../'}layouts/Page.astro';`,
    'export async function getStaticPaths() {',
    `  return (await getCollection('${collection}')).map((entry) => ({ params: { ${parameter}: entry.id }, props: { entry } }));`,
    '}',
    'const { entry } = Astro.props;',
    '---',
    '<Page entry={entry}><h1>{entry.data.title}</h1></Page>',
    '',
  ].join('\n');
  const design = {
    'src/layouts/Page.astro': [
      '---',
      "import Head from '@kntnt/konzilo/astro/Head.astro';",
      'const { entry } = Astro.props;',
      '---',
      '<html lang="en-GB">',
      '  <head>',
      '    <meta charset="utf-8" />',
      '    <Head entry={entry} />',
      '  </head>',
      '  <body><main><slot /></main></body>',
      '</html>',
      '',
    ].join('\n'),
    'src/pages/index.astro': "---\nimport Page from '../layouts/Page.astro';\n---\n<Page><h1>Start</h1></Page>\n",
    'src/pages/news/[slug].astro': route('articles'),
    'src/pages/[...path].astro': route('pages', 'path'),
  };

  // The images, each drawn by the suite: the featured image, and the logo,
  // a drawing.
  const LOGO = drawing({ width: 240, height: 60 });
  let images;
  let disk;
  let repository;

  const posts = () => [
    // An article with no values of its own, with an excerpt and a featured image.
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
    // An article with no image of its own and no featured image.
    sitePost({
      ID: 2,
      slug: 'night-watch',
      title: 'Night watch',
      date: '2026-10-02 20:00:00',
      modified: '2026-10-02 20:00:00',
      body: paragraphs('The keeper watches the light all night.'),
    }),
    // A page whose structured data type is its own, AboutPage.
    sitePost({
      ID: 3,
      type: 'page',
      slug: 'about',
      title: 'About the lantern',
      body: paragraphs('The lantern has stood on the pier since 1890.'),
      meta: { seo_schema: ['AboutPage'], seo_description: ['Who keeps the lantern.'] },
    }),
  ];

  function write(path, contents) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  }

  // Export the posts with the site settings as a build
  // hands them out, the Search and sharing settings `search` kept and the
  // site's logo `logo`, as a build does, build, and give each page's graph.
  function build(search, logo) {
    const identity = { title: 'The Quiet Lantern', logo: logo ? { id: 51, original: join(disk, 'logo.svg'), alt: 'A lantern beside the words The Quiet Lantern' } : null, icon: null };
    write('site-settings.json', JSON.stringify({ menus: {}, settings: { search }, redirects: [], identity }));
    const exported = writeContent(repository, posts());
    assert.equal(exported.status, 0, exported.stderr);
    const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    return (path) => graphOf(readFileSync(join(repository, 'dist', path, 'index.html'), 'utf8'));
  }

  // The one JSON-LD script of a page, in its head, read.
  function graphOf(html) {
    const { document } = new JSDOM(html).window;
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    assert.equal(scripts.length, 1, 'one JSON-LD script');
    assert.equal(scripts[0].parentElement, document.head);
    return JSON.parse(scripts[0].textContent);
  }

  // The address of the image a graph names by `@id`, which must be on the
  // public host, made from the master named `master` in the format `format`.
  function imageAt(graph, id, master, format) {
    const node = graph['@graph'].find((found) => found['@id'] === id);
    assert.ok(node, `a node ${id}`);
    assert.match(node.url, new RegExp(`^https://www\\.example\\.com/_astro/${master}\\.[^./]+\\.(${format})$`));
    assert.ok(existsSync(join(repository, 'dist', new URL(node.url).pathname)), node.url);
    return node.url;
  }

  before(async () => {
    images = {
      'featured.png': await plainImage(sharp, { width: 1600, height: 1000 }),
      'logo.svg': LOGO,
    };
    disk = mkdtempSync(join(tmpdir(), 'konzilo-uploads-'));
    for (const [file, bytes] of Object.entries(images)) writeFileSync(join(disk, file), bytes);
    repository = mkdtempSync(join(tmpdir(), 'konzilo-structured-data-'));
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

  // The website and the publisher every page's graph holds, the
  // organisation with every detail and the logo at `logo`.
  const website = (description) => ({
    '@type': 'WebSite',
    '@id': `${ORIGIN}/#website`,
    url: `${ORIGIN}/`,
    name: 'The Quiet Lantern',
    ...(description ? { description } : {}),
    inLanguage: 'en-GB',
    publisher: PUBLISHER,
  });
  const organisation = (logo) => ({
    '@type': 'Organization',
    '@id': `${ORIGIN}/#publisher`,
    name: 'The Quiet Lantern AB',
    url: `${ORIGIN}/`,
    logo: { '@type': 'ImageObject', url: logo, contentUrl: logo, width: 240, height: 60, caption: 'A lantern beside the words The Quiet Lantern' },
    sameAs: ['https://www.linkedin.com/company/quiet-lantern', 'https://www.facebook.com/quietlantern'],
    email: 'keeper@example.com',
    telephone: '+46 304 12 34 56',
    address: { '@type': 'PostalAddress', streetAddress: 'Pier 1', postalCode: '471 31', addressLocality: 'Skärhamn', addressCountry: 'SE' },
    taxID: '556677-8899',
    vatID: 'SE556677889901',
  });
  const image = (page, address, caption) => ({ '@type': 'ImageObject', '@id': `${page}#primaryimage`, url: address, contentUrl: address, width: 1200, height: 630, caption });
  // The breadcrumbs of a page at the address `page`, `name`, below the start
  // page alone.
  const breadcrumbs = (page, name) => ({
    '@type': 'BreadcrumbList',
    '@id': `${page}#breadcrumb`,
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name, item: page },
    ],
  });

  // What every graph must be, whatever it holds: each @id it names is one of
  // its nodes, and each article has a headline, an image when the page
  // shares one, a date and an author.
  function wellFormed(graph, path) {
    const ids = new Set(graph['@graph'].map((node) => node['@id']));
    const named = [];
    const walk = (value) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === 'object') {
        if (Object.keys(value).length === 1 && '@id' in value) named.push(value['@id']);
        else Object.values(value).forEach(walk);
      }
    };
    for (const node of graph['@graph']) Object.entries(node).filter(([key]) => key !== '@id').forEach(([, value]) => walk(value));
    assert.ok(named.length > 0, path);
    for (const id of named) assert.ok(ids.has(id), `${path}: ${id} is a node of the graph`);
    const shares = ids.has(`${ORIGIN}/${path}${path ? '/' : ''}#primaryimage`);
    for (const article of graph['@graph'].filter((node) => ['Article', 'BlogPosting', 'NewsArticle'].includes(node['@type']))) {
      assert.ok(article.headline, `${path}: headline`);
      assert.ok(article.datePublished, `${path}: datePublished`);
      assert.ok(article.author, `${path}: author`);
      assert.equal('image' in article, shares, `${path}: image`);
    }
  }

  // The articles are a type of the site's own, which an Admin gives the structured data type
  // Article, as the built-in article has by default.
  test('an article, a page whose type is AboutPage and the start page name the organisation that publishes the site, with its logo, and the image each shares', () => {
    const graphOf = build({
      types: { post: { schema: 'Article' } },
      description: 'Light for the harbour.',
      publisher: {
        kind: 'Organization',
        name: 'The Quiet Lantern AB',
        organisationNumber: '556677-8899',
        vatNumber: 'SE556677889901',
        tradeRegister: 'Bolagsverket',
        street: 'Pier 1',
        postalCode: '471 31',
        locality: 'Skärhamn',
        country: 'SE',
        email: 'keeper@example.com',
        telephone: '+46 304 12 34 56',
        // Each https address, as written; a line that is none is left out.
        profiles: 'https://www.linkedin.com/company/quiet-lantern\nthe harbour office\nhttp://www.example.org/lantern\n  https://www.facebook.com/quietlantern  \n',
      },
    }, true);

    // An article with no values of its own: the title template, the
    // excerpt, the featured image.
    const article = graphOf('news/harbour-lights');
    const page = `${ORIGIN}/news/harbour-lights/`;
    const featured = imageAt(article, `${page}#primaryimage`, `harbour-lights-${shortHash(images['featured.png'])}`, 'jpg|jpeg');
    const logo = article['@graph'][1].logo?.url;
    assert.match(logo, new RegExp(`^https://www\\.example\\.com/_astro/logo-${shortHash(LOGO)}\\.[^./]+\\.svg$`));
    assert.ok(existsSync(join(repository, 'dist', new URL(logo).pathname)), logo);
    assert.deepEqual(article, {
      '@context': 'https://schema.org',
      '@graph': [
        website('Light for the harbour.'),
        organisation(logo),
        {
          '@type': 'WebPage',
          '@id': `${page}#webpage`,
          url: page,
          name: 'Harbour lights – The Quiet Lantern',
          description: 'Where the lantern stands, and why.',
          isPartOf: WEBSITE,
          breadcrumb: { '@id': `${page}#breadcrumb` },
          inLanguage: 'en-GB',
          primaryImageOfPage: { '@id': `${page}#primaryimage` },
          datePublished: '2026-10-01T08:00:00Z',
          dateModified: '2026-10-20T14:05:09Z',
        },
        {
          '@type': 'Article',
          '@id': `${page}#article`,
          headline: 'Harbour lights',
          description: 'Where the lantern stands, and why.',
          datePublished: '2026-10-01T08:00:00Z',
          dateModified: '2026-10-20T14:05:09Z',
          image: { '@id': `${page}#primaryimage` },
          author: PUBLISHER,
          publisher: PUBLISHER,
          mainEntityOfPage: { '@id': `${page}#webpage` },
          inLanguage: 'en-GB',
        },
        image(page, featured, 'The lantern at dusk'),
        breadcrumbs(page, 'Harbour lights'),
      ],
    });

    // A page whose own type is AboutPage, with no date, sharing the logo.
    const about = graphOf('about');
    const aboutPage = `${ORIGIN}/about/`;
    const card = imageAt(about, `${aboutPage}#primaryimage`, `logo-${shortHash(LOGO)}`, 'jpg|jpeg');
    assert.deepEqual(about, {
      '@context': 'https://schema.org',
      '@graph': [
        website('Light for the harbour.'),
        organisation(logo),
        {
          '@type': 'AboutPage',
          '@id': `${aboutPage}#webpage`,
          url: aboutPage,
          name: 'About the lantern – The Quiet Lantern',
          description: 'Who keeps the lantern.',
          isPartOf: WEBSITE,
          breadcrumb: { '@id': `${aboutPage}#breadcrumb` },
          inLanguage: 'en-GB',
          primaryImageOfPage: { '@id': `${aboutPage}#primaryimage` },
        },
        image(aboutPage, card, 'A lantern beside the words The Quiet Lantern'),
        breadcrumbs(aboutPage, 'About the lantern'),
      ],
    });

    // The start page, a web page of the website, with no breadcrumbs.
    assert.deepEqual(graphOf(''), {
      '@context': 'https://schema.org',
      '@graph': [
        website('Light for the harbour.'),
        organisation(logo),
        {
          '@type': 'WebPage',
          '@id': `${ORIGIN}/#webpage`,
          url: `${ORIGIN}/`,
          name: 'The Quiet Lantern',
          description: 'Light for the harbour.',
          isPartOf: WEBSITE,
          inLanguage: 'en-GB',
          primaryImageOfPage: { '@id': `${ORIGIN}/#primaryimage` },
        },
        image(`${ORIGIN}/`, card, 'A lantern beside the words The Quiet Lantern'),
      ],
    });

    for (const path of ['', 'about', 'news/harbour-lights', 'news/night-watch']) wellFormed(graphOf(path), path);
  });

  test('a site whose publisher is a person, without a logo, names the person as each article\'s author, and a page that shares no image has none', () => {
    const graphOf = build({ types: { post: { schema: 'Article' } }, publisher: { kind: 'Person', name: 'Ada Lindqvist', email: 'ada@example.com' } }, false);

    const person = { '@type': 'Person', '@id': `${ORIGIN}/#publisher`, name: 'Ada Lindqvist', url: `${ORIGIN}/`, email: 'ada@example.com' };
    const article = graphOf('news/harbour-lights');
    const page = `${ORIGIN}/news/harbour-lights/`;
    const featured = imageAt(article, `${page}#primaryimage`, `harbour-lights-${shortHash(images['featured.png'])}`, 'jpg|jpeg');
    assert.deepEqual(article, {
      '@context': 'https://schema.org',
      '@graph': [
        website(),
        person,
        {
          '@type': 'WebPage',
          '@id': `${page}#webpage`,
          url: page,
          name: 'Harbour lights – The Quiet Lantern',
          description: 'Where the lantern stands, and why.',
          isPartOf: WEBSITE,
          breadcrumb: { '@id': `${page}#breadcrumb` },
          inLanguage: 'en-GB',
          primaryImageOfPage: { '@id': `${page}#primaryimage` },
          datePublished: '2026-10-01T08:00:00Z',
          dateModified: '2026-10-20T14:05:09Z',
        },
        {
          '@type': 'Article',
          '@id': `${page}#article`,
          headline: 'Harbour lights',
          description: 'Where the lantern stands, and why.',
          datePublished: '2026-10-01T08:00:00Z',
          dateModified: '2026-10-20T14:05:09Z',
          image: { '@id': `${page}#primaryimage` },
          author: PUBLISHER,
          publisher: PUBLISHER,
          mainEntityOfPage: { '@id': `${page}#webpage` },
          inLanguage: 'en-GB',
        },
        image(page, featured, 'The lantern at dusk'),
        breadcrumbs(page, 'Harbour lights'),
      ],
    });

    // No image of its own, no featured image, no default and no logo: no
    // image at all.
    const night = `${ORIGIN}/news/night-watch/`;
    assert.deepEqual(graphOf('news/night-watch')['@graph'].slice(2), [
      {
        '@type': 'WebPage',
        '@id': `${night}#webpage`,
        url: night,
        name: 'Night watch – The Quiet Lantern',
        description: 'The keeper watches the light all night.',
        isPartOf: WEBSITE,
        breadcrumb: { '@id': `${night}#breadcrumb` },
        inLanguage: 'en-GB',
        datePublished: '2026-10-02T20:00:00Z',
        dateModified: '2026-10-02T20:00:00Z',
      },
      {
        '@type': 'Article',
        '@id': `${night}#article`,
        headline: 'Night watch',
        description: 'The keeper watches the light all night.',
        datePublished: '2026-10-02T20:00:00Z',
        dateModified: '2026-10-02T20:00:00Z',
        author: PUBLISHER,
        publisher: PUBLISHER,
        mainEntityOfPage: { '@id': `${night}#webpage` },
        inLanguage: 'en-GB',
      },
      breadcrumbs(night, 'Night watch'),
    ]);

    // The start page of a site without a description has none.
    assert.deepEqual(graphOf(''), {
      '@context': 'https://schema.org',
      '@graph': [
        website(),
        person,
        { '@type': 'WebPage', '@id': `${ORIGIN}/#webpage`, url: `${ORIGIN}/`, name: 'The Quiet Lantern', isPartOf: WEBSITE, inLanguage: 'en-GB' },
      ],
    });

    for (const path of ['', 'about', 'news/harbour-lights', 'news/night-watch']) wellFormed(graphOf(path), path);
  });
});
