// Each image of a body served in fixed widths, as a small site's static build writes it: its
// versions in `srcset`, by their widths, with the `sizes` of the context it is drawn in, a body's
// or a gallery's, each version no wider than its master or the widest the core makes, all of them
// in the release, and a lossless master's lossless. A site's design gives the widths and sizes of
// a context in konzilo({ images }), and one that gives none has the core's.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import konzilo from '../src/astro/index.js';
import { astroConfig, astroEnvironment, nodeSync } from './lib/astro.js';
import { paragraphs, post, siteSettingsArgs, writeContent } from './lib/content.js';
import { plainImage, sharp } from './lib/images.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

const site = {
  images: { smallestWidth: 300, displayWidth: 1200 },
  types: {
    post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'image', 'gallery'] },
  },
};

// The masters: a landscape as wide as a master may be, a portrait, a small image, and a
// drawing kept lossless.
const MASTERS = {
  'wide.webp': { width: 2520, height: 1680 },
  'tall.webp': { width: 1120, height: 1680 },
  'small.webp': { width: 600, height: 400 },
  'drawing.webp': { width: 1300, height: 800, lossless: true },
};

const posts = [
  post({
    ID: 1,
    slug: 'harbour',
    title: 'Harbour',
    body: paragraphs(
      'The harbour at dusk.',
      '![A wide harbour](../media/wide.webp)\\\nThe harbour _at dusk_',
      '![A small boat](../media/small.webp)',
      '![A drawing of the pier](../media/drawing.webp)',
      '![A tall lighthouse](../media/tall.webp)\n![A wide harbour again](../media/wide.webp)\nTwo views',
    ),
  }),
];

const article = [
  '---',
  "import Body from '@kntnt/konzilo/astro/Body.astro';",
  "import { getCollection, render } from 'astro:content';",
  'export async function getStaticPaths() {',
  "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
  '}',
  'const { entry } = Astro.props;',
  'const { Content } = await render(entry);',
  '---',
  '<html><head><title>{entry.data.title}</title></head><body><article><Body><Content /></Body></article></body></html>',
  '',
].join('\n');

function write(repository, path, contents) {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), contents);
}

// A site repository with Astro and Konzilo's package installed, Konzilo's integration given
// `options`, its post written as a build writes it, and the masters it names.
async function siteRepository(options) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-image-versions-'));
  mkdirSync(join(repository, 'node_modules'));
  for (const name of readdirSync(join(core, 'node_modules'))) {
    if (name !== '@kntnt' && !name.startsWith('.')) symlinkSync(join(core, 'node_modules', name), join(repository, 'node_modules', name));
  }
  mkdirSync(join(repository, 'node_modules/@kntnt'));
  symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
  const sources = {
    'astro.config.mjs': astroConfig(integration, options),
    'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
    'site-description.json': JSON.stringify(site),
    'src/pages/index.astro': '<html><head><title>Start</title></head><body><h1>Start</h1></body></html>\n',
    'src/pages/[slug].astro': article,
  };
  for (const [path, contents] of Object.entries(sources)) write(repository, path, contents);
  siteSettingsArgs(repository);
  const exported = writeContent(repository, posts);
  assert.equal(exported.status, 0, exported.stderr);
  for (const [name, { width, height, lossless }] of Object.entries(MASTERS)) {
    const drawn = await plainImage(sharp, { width, height, format: 'png' });
    write(repository, `content/media/${name}`, await sharp(drawn).webp(lossless ? { lossless: true } : { quality: 90 }).toBuffer());
  }
  return repository;
}

const build = (repository) => nodeSync([astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });

// Each <img> of a page, in order, by its attributes: those of the page, or with `lightbox`
// those of its lightboxes' dialogs.
const dialogs = /<dialog\b[\s\S]*?<\/dialog>/g;
const imagesOf = (html, { lightbox = false } = {}) => attributesOf(lightbox ? (html.match(dialogs) ?? []).join('') : html.replace(dialogs, ''));

function attributesOf(html) {
  return [...html.matchAll(/<img\b([^>]*)>/g)].map(([, text]) => Object.fromEntries([...text.matchAll(/([a-z-]+)(?:="([^"]*)")?/g)].map(([, name, value]) => [name, (value ?? '').replaceAll('&amp;', '&')])));
}

// An image's versions, by its srcset: each { file, width }, the width its descriptor gives.
const versionsOf = (image) => (image.srcset ?? '').split(', ').filter(Boolean).map((candidate) => {
  const [file, descriptor] = candidate.split(' ');
  return { file, width: Number(descriptor.replace(/w$/, '')) };
});

// Whether a WebP file holds a lossless picture: its first image chunk is VP8L.
function isLossless(bytes) {
  for (let at = 12; at + 8 <= bytes.length;) {
    const kind = bytes.toString('latin1', at, at + 4);
    if (kind === 'VP8L') return true;
    if (kind === 'VP8 ') return false;
    at += 8 + bytes.readUInt32LE(at + 4) + (bytes.readUInt32LE(at + 4) % 2);
  }
  return false;
}

describe('a build of a site that gives no widths of its own', () => {
  let repository;
  let built;
  let html;
  let images;

  before(async () => {
    repository = await siteRepository();
    built = build(repository);
    const page = join(repository, 'dist/harbour/index.html');
    html = existsSync(page) ? readFileSync(page, 'utf8') : '';
    images = imagesOf(html);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('succeeds', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  });

  test('writes a body\'s image with its versions in the core\'s widths for a body and the lightbox, and the body\'s sizes', () => {
    const [wide] = images;
    assert.deepEqual(versionsOf(wide).map(({ width }) => width), [480, 800, 1200, 1600, 2520]);
    assert.equal(wide.sizes, '(min-width: 46rem) 46rem, 100vw');
    assert.equal(wide.alt, 'A wide harbour');
  });

  test('writes a gallery\'s images with the gallery\'s sizes, and an image drawn twice with the same versions', () => {
    const [wide, , , tall, again] = images;
    assert.equal(tall.sizes, '(min-width: 46rem) 15rem, (min-width: 28rem) 50vw, 100vw');
    assert.equal(again.sizes, tall.sizes);
    assert.equal(again.srcset, wide.srcset);
  });

  test('makes no version wider than its master, its master\'s own width in place of those wider, and no near duplicate of it', () => {
    const [, small, drawing, tall] = images;
    assert.deepEqual(versionsOf(small).map(({ width }) => width), [480, 600]);
    assert.deepEqual(versionsOf(tall).map(({ width }) => width), [480, 800, 1120]);
    assert.deepEqual(versionsOf(drawing).map(({ width }) => width), [480, 800, 1300], 'no 1200 beside 1300');
  });

  test('draws each image in its lightbox from the same versions, across the window', () => {
    const shown = imagesOf(html, { lightbox: true });
    assert.deepEqual(shown.map(({ srcset }) => srcset), images.map(({ srcset }) => srcset));
    for (const image of shown) assert.equal(image.sizes, '100vw');
  });

  test('writes each image at its widest version, which is its src, by the master\'s proportions', () => {
    const [wide, small, , tall] = images;
    assert.deepEqual([wide, small, tall].map(({ width, height }) => [width, height]), [['2520', '1680'], ['600', '400'], ['1120', '1680']]);
    for (const image of images) assert.equal(image.src, versionsOf(image).at(-1).file);
  });

  test('has each version in the release, as wide as its srcset says and as WebP, none wider than the widest the core makes', async () => {
    const files = images.flatMap(versionsOf);
    assert.ok(files.length > 0);
    for (const { file, width } of files) {
      const bytes = readFileSync(join(repository, 'dist', file));
      const shape = await sharp(bytes).metadata();
      assert.equal(shape.format, 'webp', file);
      assert.equal(shape.width, width, file);
    }
    const all = readdirSync(join(repository, 'dist/_astro')).filter((name) => name.endsWith('.webp'));
    for (const name of all) assert.ok((await sharp(join(repository, 'dist/_astro', name)).metadata()).width <= 2520, name);
  });

  test('makes every version of a lossless master lossless, and the others lossy', () => {
    const [wide, , drawing] = images;
    for (const { file } of versionsOf(drawing)) assert.ok(isLossless(readFileSync(join(repository, 'dist', file))), file);
    for (const { file } of versionsOf(wide)) assert.ok(!isLossless(readFileSync(join(repository, 'dist', file))), file);
  });
});

describe('a build of a site that gives widths and sizes of its own', () => {
  let repository;
  let built;
  let html;
  let images;

  before(async () => {
    repository = await siteRepository({ images: { body: { widths: [900, 400], sizes: '(min-width: 60rem) 40rem, 90vw' }, lightbox: { widths: [1800], sizes: '90vw' }, gallery: { sizes: '33vw' } } });
    built = build(repository);
    const page = join(repository, 'dist/harbour/index.html');
    html = existsSync(page) ? readFileSync(page, 'utf8') : '';
    images = imagesOf(html);
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('succeeds', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  });

  test('writes a body\'s image in the site\'s widths for a body and the lightbox, with its sizes', () => {
    const [wide] = images;
    assert.deepEqual(versionsOf(wide).map(({ width }) => width), [400, 900, 1800]);
    assert.equal(wide.sizes, '(min-width: 60rem) 40rem, 90vw');
  });

  test('keeps the core\'s widths for a context the site gives only its sizes', () => {
    const [, , , tall] = images;
    assert.deepEqual(versionsOf(tall).map(({ width }) => width), [480, 800, 1120]);
    assert.equal(tall.sizes, '33vw');
  });

  test('draws each image in its lightbox at the site\'s sizes for the lightbox', () => {
    const shown = imagesOf(html, { lightbox: true });
    assert.equal(shown.length, images.length);
    for (const image of shown) assert.equal(image.sizes, '90vw');
  });
});

test('refuses widths and sizes the core cannot use, naming what is wrong', () => {
  const refused = [
    [{ galery: { sizes: '100vw' } }, /names the context galery, which the core does not know: body, gallery, lightbox, hero, card/],
    [{ hero: { widths: [1920, 3840] } }, /gives hero a width of 3840 px, wider than the widest version the core makes, 2520 px/],
    [{ body: { widths: [] } }, /must give body its widths as a list of whole numbers of pixels/],
    [{ card: { widths: [480.5] } }, /must give card its widths as a list of whole numbers of pixels/],
    [{ gallery: { sizes: ' ' } }, /must give gallery its sizes as the text of a sizes attribute/],
    [{ body: { width: [480] } }, /gives body width, where a context has its widths and its sizes/],
    [{ body: '100vw' }, /must give body its widths, its sizes or both/],
    [['body'], /must give each context the site draws images in by its name/],
  ];
  for (const [images, reason] of refused) assert.throws(() => konzilo({ images }), reason, JSON.stringify(images));
  assert.doesNotThrow(() => konzilo({ images: { hero: { widths: [2520] }, card: {} } }));
});
