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
import { IMAGE_CONTEXTS, imageContexts } from '../src/astro/image-versions.js';
import { astroConfig, astroEnvironment, nodeSync } from './lib/astro.js';
import { paragraphs, post, siteSettingsArgs, writeContent } from './lib/content.js';
import { alike, plainImage, sharp } from './lib/images.js';

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
  'figure.webp': { width: 1264, height: 800, lossless: true },
};

// A 3:2 image of three stripes, red, green and blue from the left, each a third of its width, for
// the crops; and a square one, which a square context does not crop.
const STRIPES = { width: 1500, height: 1000 };
const RED = [220, 30, 30];
const GREEN = [30, 180, 30];
const BLUE = [30, 30, 220];

async function stripes(sharp) {
  const third = STRIPES.width / 3;
  const part = (colour) => ({ create: { width: third, height: STRIPES.height, channels: 3, background: { r: colour[0], g: colour[1], b: colour[2] } } });
  return sharp({ create: { ...STRIPES, channels: 3, background: '#000' } })
    .composite([RED, GREEN, BLUE].map((colour, index) => ({ input: part(colour), left: third * index, top: 0 })))
    .webp({ quality: 90 })
    .toBuffer();
}

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
  // A figure saved at twice the size it is meant to be drawn at, with its display width: alone,
  // in a gallery, and one whose display width is wider than its master.
  post({
    ID: 2,
    slug: 'figures',
    title: 'Figures',
    body: paragraphs(
      '![A flow of work](../media/figure.webp "width=632")\\\nThe flow',
      '![The flow again](../media/figure.webp "width=632")\n![A tall lighthouse](../media/tall.webp)',
      '![A small boat](../media/small.webp "width=900")',
      '![A plan of the pier](../media/plan.svg "width=200")',
    ),
  }),
  // The stripes with a focal point near the left edge and without one, a square image, a gallery
  // of the stripes with its point near the right edge, and the stripes with a display width.
  post({
    ID: 3,
    slug: 'crops',
    title: 'Crops',
    body: paragraphs(
      '![Stripes, held at the left](../media/stripes.webp "focus=0.1,0.5")',
      '![Stripes, around the middle](../media/stripes.webp)',
      '![A square](../media/square.webp "focus=0.9,0.9")',
      '![Stripes, held at the right](../media/stripes.webp "focus=0.9,0.5")\n![A square again](../media/square.webp)',
      '![Stripes, drawn smaller](../media/stripes.webp "width=600 focus=0.1,0.5")',
    ),
  }),
];

// A page that draws the stripes as a card, with its focal point near the right edge, through the
// widths and sizes a template takes.
const cards = [
  '---',
  "import { Image } from 'astro:assets';",
  "import { imageVersions } from '@kntnt/konzilo/astro/images';",
  "import stripes from '../../content/media/stripes.webp';",
  '---',
  '<html><head><title>Cards</title></head><body><Image src={stripes} alt="Stripes as a card" {...imageVersions(\'card\', { focalPoint: { x: 0.9, y: 0.5 } })} /><Image src={stripes} alt="Stripes as a hero" {...imageVersions(\'hero\')} /></body></html>',
  '',
].join('\n');

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
    'src/pages/cards.astro': cards,
  };
  for (const [path, contents] of Object.entries(sources)) write(repository, path, contents);
  siteSettingsArgs(repository);
  const exported = writeContent(repository, posts);
  assert.equal(exported.status, 0, exported.stderr);
  write(repository, 'content/media/stripes.webp', await stripes(sharp));
  write(repository, 'content/media/square.webp', await sharp(await plainImage(sharp, { width: 1000, height: 1000, format: 'png' })).webp({ quality: 90 }).toBuffer());
  write(repository, 'content/media/plan.svg', '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400"><rect width="800" height="400" fill="#246"/></svg>\n');
  for (const [name, { width, height, lossless }] of Object.entries(MASTERS)) {
    const drawn = await plainImage(sharp, { width, height, format: 'png' });
    write(repository, `content/media/${name}`, await sharp(drawn).webp(lossless ? { lossless: true } : { quality: 90 }).toBuffer());
  }
  return repository;
}

const pageOf = (repository, slug) => {
  const page = join(repository, `dist/${slug}/index.html`);
  return existsSync(page) ? readFileSync(page, 'utf8') : '';
};

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

// The mean colour of a column of a picture, `at` its left edge or its right, two pixels wide, and
// how many of its pixels are blue.
async function shapeOf(bytes) {
  const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const column = (from) => {
    const sum = [0, 0, 0];
    for (let y = 0; y < info.height; y += 1) {
      for (let x = from; x < from + 2; x += 1) for (let c = 0; c < 3; c += 1) sum[c] += data[(y * info.width + x) * 3 + c];
    }
    return sum.map((total) => Math.round(total / (info.height * 2)));
  };
  let blue = 0;
  for (let at = 0; at < data.length; at += 3) if (data[at + 2] > 150 && data[at] < 100 && data[at + 1] < 100) blue += 1;
  return { width: info.width, height: info.height, left: column(0), right: column(info.width - 2), blue };
}

describe('a build of a site that gives no widths of its own', () => {
  let repository;
  let built;
  let html;
  let images;
  let figuresHtml;
  let figures;

  before(async () => {
    repository = await siteRepository();
    built = build(repository);
    html = pageOf(repository, 'harbour');
    images = imagesOf(html);
    figuresHtml = pageOf(repository, 'figures');
    figures = imagesOf(figuresHtml);
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

  test('writes an image with a display width at that width, by its master\'s proportions, in every version up to its master\'s, at sizes no wider', () => {
    const [sized] = figures;
    assert.deepEqual([sized.width, sized.height], ['632', '400']);
    assert.deepEqual(versionsOf(sized).map(({ width }) => width), [480, 800, 1264], 'its full pixels, for a dense screen');
    assert.equal(sized.src, versionsOf(sized).at(-1).file);
    assert.equal(sized.sizes, '(min-width: 46rem) min(46rem, 632px), min(100vw, 632px)');
    assert.equal(sized.title, undefined, 'and no title');
    assert.doesNotMatch(figuresHtml, /displaywidth|width=632"/i, 'nor anything else of how it was asked for');
  });

  test('draws a gallery\'s image as it would any other, and an image no wider than its display width as before', () => {
    const [, inGallery, , small] = figures;
    assert.deepEqual([inGallery.width, inGallery.height, inGallery.title], ['1264', '800', undefined]);
    assert.equal(inGallery.sizes, '(min-width: 46rem) 15rem, (min-width: 28rem) 50vw, 100vw');
    assert.deepEqual([small.width, small.height, small.title], ['600', '400', undefined]);
    assert.equal(small.sizes, '(min-width: 46rem) min(46rem, 900px), min(100vw, 900px)');
  });

  test('writes an SVG with a display width at that width, as itself, in no widths', () => {
    const plan = figures.find(({ alt }) => alt === 'A plan of the pier');
    assert.deepEqual([plan.width, plan.height, plan.srcset, plan.title], ['200', '100', undefined, undefined]);
    assert.match(plan.src, /\.svg$/);
  });

  test('shows an image with a display width across the window in its lightbox', () => {
    const [sized] = imagesOf(figuresHtml, { lightbox: true });
    assert.equal(sized.sizes, '100vw');
    assert.equal(sized.srcset, figures[0].srcset);
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

  test('writes an image with a display width at the site\'s sizes, none wider than that width', () => {
    const [sized] = imagesOf(pageOf(repository, 'figures'));
    assert.equal(sized.sizes, '(min-width: 60rem) min(40rem, 632px), min(90vw, 632px)');
    assert.deepEqual(versionsOf(sized).map(({ width }) => width), [400, 900, 1264]);
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

describe('a build of a site whose design names aspect ratios', () => {
  let repository;
  let built;
  let html;
  let images;
  let cardsHtml;
  const fileOf = (version) => readFileSync(join(repository, 'dist', version.file));

  before(async () => {
    repository = await siteRepository({ images: { body: { ratio: '1:1' }, gallery: { ratio: '1:1' }, card: { ratio: '1:1' } } });
    built = build(repository);
    html = pageOf(repository, 'crops');
    images = imagesOf(html);
    cardsHtml = pageOf(repository, 'cards');
  });

  after(() => rmSync(repository, { recursive: true, force: true }));

  test('succeeds', () => {
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  });

  test('serves a 3:2 image with its point near its left edge, drawn in a 1:1 context, as square versions whose crop holds the point, with no pixels from outside the crop', async () => {
    const [held] = images;
    assert.deepEqual([held.width, held.height], ['1000', '1000']);
    assert.deepEqual(versionsOf(held).map(({ width }) => width), [480, 800, 1000]);
    assert.equal(held.src, versionsOf(held).at(-1).file);
    for (const version of versionsOf(held)) {
      const shape = await shapeOf(fileOf(version));
      assert.deepEqual([shape.width, shape.height], [version.width, version.width], version.file);
      assert.ok(alike(shape.left, RED, 24), `red at the left, where the point is: ${shape.left}`);
      assert.ok(alike(shape.right, GREEN, 24), `green at the right: ${shape.right}`);
      assert.equal(shape.blue, 0, 'and nothing of the blue third, outside the crop');
    }
  });

  test('crops an image without a focal point around its middle', async () => {
    const [, middle] = images;
    const shape = await shapeOf(fileOf(versionsOf(middle).at(-1)));
    assert.deepEqual([shape.width, shape.height], [1000, 1000]);
    assert.ok(alike(shape.left, RED, 24), `${shape.left}`);
    assert.ok(alike(shape.right, BLUE, 24), `${shape.right}`);
  });

  test('crops a gallery\'s image to the gallery\'s ratio around its point', async () => {
    const [, , , inGallery] = images;
    assert.deepEqual([inGallery.width, inGallery.height], ['1000', '1000']);
    const shape = await shapeOf(fileOf(versionsOf(inGallery).at(-1)));
    assert.ok(alike(shape.left, GREEN, 24), `${shape.left}`);
    assert.ok(alike(shape.right, BLUE, 24), `${shape.right}`);
  });

  test('writes an image with a display width at that width in the crop\'s ratio', () => {
    const smaller = images.at(-1);
    assert.deepEqual([smaller.width, smaller.height], ['600', '600']);
    assert.deepEqual(versionsOf(smaller).map(({ width }) => width), [480, 800, 1000]);
  });

  test('does not crop an image in the context\'s own ratio, whose versions are its whole picture\'s', () => {
    const [, , square] = images;
    const [, , whole] = imagesOf(html, { lightbox: true });
    assert.deepEqual([square.width, square.height], ['1000', '1000']);
    assert.equal(versionsOf(square).at(-1).file, versionsOf(whole).at(-1).file);
  });

  test('shows each image whole in its lightbox, from versions of the whole picture', async () => {
    const shown = imagesOf(html, { lightbox: true });
    assert.equal(shown.length, images.length, 'one in a lightbox for each on the page, and no other on the page');
    const [held] = shown;
    assert.deepEqual([held.width, held.height], ['1500', '1000']);
    assert.equal(held.sizes, '100vw');
    assert.deepEqual(versionsOf(held).map(({ width }) => width), [1500]);
    const shape = await shapeOf(fileOf(versionsOf(held)[0]));
    assert.deepEqual([shape.width, shape.height], [1500, 1000]);
    assert.ok(alike(shape.right, BLUE, 24), `${shape.right}`);
    assert.doesNotMatch(html.replace(/<style\b[\s\S]*?<\/style>/g, ''), /\shidden\b|data-konzilo-whole/, 'nor anything of how it came there');
  });

  test('crops an image a template draws in a context of the design\'s ratio around the point it is given, and one in a context with none not at all', async () => {
    const [card, hero] = imagesOf(cardsHtml);
    assert.deepEqual([card.width, card.height], ['1000', '1000']);
    const shape = await shapeOf(fileOf(versionsOf(card).at(-1)));
    assert.ok(alike(shape.left, GREEN, 24), `${shape.left}`);
    assert.ok(alike(shape.right, BLUE, 24), `${shape.right}`);
    assert.deepEqual([hero.width, hero.height], ['1500', '1000']);
    assert.doesNotMatch(cardsHtml, /konzilo/i, 'and nothing of how it was asked for');
  });
});

test('refuses widths and sizes the core cannot use, naming what is wrong', () => {
  const refused = [
    [{ galery: { sizes: '100vw' } }, /names the context galery, which the core does not know: body, gallery, lightbox, hero, card/],
    [{ hero: { widths: [1920, 3840] } }, /gives hero a width of 3840 px, wider than the widest version the core makes, 2520 px/],
    [{ body: { widths: [] } }, /must give body its widths as a list of whole numbers of pixels/],
    [{ card: { widths: [480.5] } }, /must give card its widths as a list of whole numbers of pixels/],
    [{ gallery: { sizes: ' ' } }, /must give gallery its sizes as the text of a sizes attribute/],
    [{ body: { width: [480] } }, /gives body width, where a context has its widths, its sizes and its aspect ratio/],
    [{ body: '100vw' }, /must give body its widths, its sizes, its aspect ratio or any of these/],
    [['body'], /must give each context the site draws images in by its name/],
    [{ card: { ratio: '4/3' } }, /must give card its aspect ratio as a width and a height with a colon between, such as '16:9', not 4\/3/],
    [{ card: { ratio: 1.5 } }, /must give card its aspect ratio as a width and a height with a colon between, such as '16:9', not 1.5/],
    [{ lightbox: { ratio: '1:1' } }, /gives lightbox an aspect ratio, where the lightbox shows each image whole/],
  ];
  for (const [images, reason] of refused) assert.throws(() => konzilo({ images }), reason, JSON.stringify(images));
  assert.doesNotThrow(() => konzilo({ images: { hero: { widths: [2520] }, card: {} } }));
  assert.doesNotThrow(() => konzilo({ images: { hero: { ratio: '21:9' }, card: { widths: [400], ratio: ' 1:1 ' } } }));
});

test('gives each context its aspect ratio, the site\'s design\'s, or none, the image\'s own, by default', () => {
  assert.deepEqual(Object.values(IMAGE_CONTEXTS).map(({ ratio }) => ratio), [null, null, null, null, null]);
  const contexts = imageContexts({ card: { ratio: ' 1:1 ' }, body: { widths: [480] } });
  assert.equal(contexts.card.ratio, '1:1');
  assert.deepEqual(contexts.card.widths, IMAGE_CONTEXTS.card.widths);
  assert.equal(contexts.body.ratio, null);
  assert.equal(contexts.hero.ratio, null);
});
