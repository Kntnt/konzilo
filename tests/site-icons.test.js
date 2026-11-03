// Every icon a browser, a phone or a search engine asks for, and the web app
// manifest, made by Astro from the site icon at every build:
// favicon.ico at 16, 32 and 48 pixels, the SVG master itself as icon.svg
// where the icon is SVG, a 180-pixel opaque Apple touch icon, PNG icons of
// 192 and 512 pixels, and site.webmanifest, at the root of the site below
// its base, each page's head linking them through Konzilo's Head component.
// A site without an icon gets none of them.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroConfig, astroEnvironment } from './lib/astro.js';
import { paragraphs, post, writeContent } from './lib/content.js';
import { sharp } from './lib/images.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');

// Every file the icons are, by its name at the root of the site.
const ICONS = ['favicon.ico', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'site.webmanifest'];

// A red disc on a transparent square: a square SVG, by its viewBox.
const DISC = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="#ff0000"/></svg>\n');

const RED = [255, 0, 0, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];

// The site's frame, with Konzilo's head in each page's <head>, and two
// pages: the start page and an article's.
const sources = {
  'astro.config.mjs': astroConfig(integration),
  'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
  'site-description.json': JSON.stringify({ types: { post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } } }),
  'src/layouts/Site.astro': [
    '---',
    "import Head from '@kntnt/konzilo/astro/Head.astro';",
    'const { title } = Astro.props;',
    '---',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8" />',
    '    <Head title={title} />',
    '  </head>',
    '  <body><main><slot /></main></body>',
    '</html>',
    '',
  ].join('\n'),
  'src/pages/index.astro': "---\nimport Site from '../layouts/Site.astro';\n---\n<Site title=\"Home\"><p>Welcome.</p></Site>\n",
  'src/pages/[slug].astro': [
    '---',
    "import { getCollection, render } from 'astro:content';",
    "import Site from '../layouts/Site.astro';",
    'export async function getStaticPaths() {',
    "  return (await getCollection('articles')).map((entry) => ({ params: { slug: entry.id }, props: { entry } }));",
    '}',
    'const { entry } = Astro.props;',
    'const { Content } = await render(entry);',
    '---',
    '<Site title={entry.data.title}><Content /></Site>',
    '',
  ].join('\n'),
};

const article = post({ ID: 1, slug: 'harbour-lights', title: 'Harbour lights', body: paragraphs('The lantern keeps the harbour.') });

// A site repository with Astro and Konzilo's package installed, as a site
// installs them, and the design above, with the files `own` in place of
// its own or beside them.
function siteRepository(own = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-site-icons-'));
  mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
  for (const entry of readdirSync(join(core, 'node_modules'))) {
    if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
  }
  symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
  for (const [path, contents] of Object.entries({ ...sources, ...own })) {
    mkdirSync(dirname(join(repository, path)), { recursive: true });
    writeFileSync(join(repository, path), contents);
  }
  return repository;
}

// Export the article with the site's `identity`, as a build does.
function writeWith(repository, identity) {
  const settings = join(repository, 'site-settings.json');
  writeFileSync(settings, JSON.stringify({ menus: {}, settings: {}, identity }));
  const exported = writeContent(repository, [article]);
  assert.equal(exported.status, 0, exported.stderr);
}

// Export with `identity`, then build, with Astro's own arguments `args`.
// Returns what the build wrote into `outDir`: each icon's bytes by its name,
// undefined for one it did not write, and each page's HTML by its path; the
// icon's master the writer wrote, if any; and the build's log.
function build(repository, identity, { args = [], outDir = 'dist' } = {}) {
  writeWith(repository, identity);
  const built = spawnSync(process.execPath, [astro, 'build', '--outDir', outDir, ...args], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
  assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  const dist = join(repository, outDir);
  const icons = Object.fromEntries(ICONS.map((name) => [name, existsSync(join(dist, name)) ? readFileSync(join(dist, name)) : undefined]));
  const pages = Object.fromEntries(['index.html', 'harbour-lights/index.html'].map((path) => [path, readFileSync(join(dist, path), 'utf8')]));
  const { icon } = JSON.parse(readFileSync(join(repository, 'content/settings.json'), 'utf8'));
  return { icons, pages, master: icon && readFileSync(join(repository, 'content', icon.src)), log: `${built.stdout}${built.stderr}` };
}

// The images an ICO file holds, each { width, height, image }, as its
// directory gives them.
function icoImages(bytes) {
  assert.deepEqual([bytes.readUInt16LE(0), bytes.readUInt16LE(2)], [0, 1], 'an ICO file\'s header');
  return Array.from({ length: bytes.readUInt16LE(4) }, (_, index) => {
    const entry = 6 + 16 * index;
    const [size, offset] = [bytes.readUInt32LE(entry + 8), bytes.readUInt32LE(entry + 12)];
    return { width: bytes[entry] || 256, height: bytes[entry + 1] || 256, image: bytes.subarray(offset, offset + size) };
  });
}

// An image's format, size and whether it has an alpha channel, and its
// pixels, as [r, g, b, a], at its centre and in its top left corner.
async function looks(bytes) {
  const { format, width, height, hasAlpha } = await sharp(bytes).metadata();
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
  return { format, width, height, hasAlpha, centre: pixel(Math.floor(width / 2), Math.floor(height / 2)), corner: pixel(0, 0) };
}

// The <link> elements of a page's head that name an icon or the manifest,
// each as its attributes.
function linked(html) {
  const head = /<head>(.*?)<\/head>/s.exec(html)?.[1] ?? '';
  return [...head.matchAll(/<link\b([^>]*)>/g)]
    .map(([, attributes]) => Object.fromEntries([...attributes.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])))
    .filter((link) => ['icon', 'apple-touch-icon', 'manifest'].includes(link.rel));
}

function alike(colour, expected, tolerance = 8) {
  return colour.every((value, index) => Math.abs(value - expected[index]) <= tolerance);
}

describe('the icons a build makes from the site icon', () => {
  let repository;
  let uploads;
  let svg; // a square SVG icon and a title
  let again; // the same, built again
  let png; // a 512-pixel PNG icon, and no title
  let preview; // the same, built below a base
  let none; // no icon

  before(async () => {
    repository = siteRepository();
    uploads = mkdtempSync(join(tmpdir(), 'konzilo-uploads-'));
    writeFileSync(join(uploads, 'disc.svg'), DISC);
    writeFileSync(join(uploads, 'disc.png'), await sharp(DISC, { density: 72 * 5.12 }).png().toBuffer());
    const svgIcon = { title: 'Lantern &amp; Co', logo: null, icon: { id: 13, original: join(uploads, 'disc.svg') } };
    const pngIcon = { title: '', logo: null, icon: { id: 14, original: join(uploads, 'disc.png') } };
    svg = build(repository, svgIcon);
    again = build(repository, svgIcon);
    png = build(repository, pngIcon);
    preview = build(repository, pngIcon, { args: ['--base', '/preview/'], outDir: 'dist-preview' });
    none = build(repository, { title: 'Lantern &amp; Co', logo: null, icon: null });
  });

  after(() => {
    rmSync(repository, { recursive: true, force: true });
    rmSync(uploads, { recursive: true, force: true });
  });

  test('favicon.ico holds the icon drawn at 16, 32 and 48 pixels, each a PNG', async () => {
    const images = icoImages(svg.icons['favicon.ico']);
    assert.deepEqual(images.map(({ width, height }) => [width, height]), [[16, 16], [32, 32], [48, 48]]);
    for (const { width, image } of images) {
      const drawn = await looks(image);
      assert.deepEqual([drawn.format, drawn.width, drawn.height], ['png', width, width]);
      assert.ok(alike(drawn.centre, RED), `${width}: ${drawn.centre}`);
      assert.deepEqual(drawn.corner, CLEAR, `${width}`);
    }
  });

  test('icon.svg is the SVG master itself', () => {
    assert.match(svg.master.toString('utf8'), /^<svg /);
    assert.deepEqual(svg.icons['icon.svg'], svg.master);
  });

  test('the Apple touch icon is 180 pixels and opaque, the transparent icon laid on white', async () => {
    const touch = await looks(svg.icons['apple-touch-icon.png']);
    assert.deepEqual([touch.format, touch.width, touch.height, touch.hasAlpha], ['png', 180, 180, false]);
    assert.ok(alike(touch.centre, RED), `${touch.centre}`);
    assert.deepEqual(touch.corner, WHITE);
  });

  test('the PNG icons are 192 and 512 pixels, drawn at their size and transparent where the icon is', async () => {
    for (const size of [192, 512]) {
      const icon = await looks(svg.icons[`icon-${size}.png`]);
      assert.deepEqual([icon.format, icon.width, icon.height, icon.hasAlpha], ['png', size, size, true]);
      assert.ok(alike(icon.centre, RED), `${size}: ${icon.centre}`);
      assert.deepEqual(icon.corner, CLEAR, `${size}`);
    }
  });

  test('the manifest names the site by its title and holds both PNG icons', () => {
    assert.deepEqual(JSON.parse(svg.icons['site.webmanifest']), {
      name: 'Lantern & Co',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    });
  });

  test('every page\'s head links the ICO with its sizes, the SVG icon with its type, the Apple touch icon and the manifest', () => {
    for (const [path, html] of Object.entries(svg.pages)) {
      assert.deepEqual(linked(html), [
        { rel: 'icon', href: '/favicon.ico', sizes: '16x16 32x32 48x48' },
        { rel: 'icon', href: '/icon.svg', type: 'image/svg+xml' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
        { rel: 'manifest', href: '/site.webmanifest' },
      ], path);
    }
  });

  test('two builds of the same icon give the same bytes', () => {
    for (const name of ICONS) {
      assert.ok(Buffer.isBuffer(svg.icons[name]), name);
      assert.deepEqual(again.icons[name], svg.icons[name], name);
    }
  });

  test('a 512-pixel PNG icon makes every file but icon.svg, scaled down from it, and the head links no SVG icon', async () => {
    assert.equal(png.icons['icon.svg'], undefined);
    assert.deepEqual(icoImages(png.icons['favicon.ico']).map(({ width, height }) => [width, height]), [[16, 16], [32, 32], [48, 48]]);
    for (const [name, size] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
      const icon = await looks(png.icons[name]);
      assert.deepEqual([icon.format, icon.width, icon.height], ['png', size, size], name);
      assert.ok(alike(icon.centre, RED), `${name}: ${icon.centre}`);
      assert.deepEqual(icon.corner, name === 'apple-touch-icon.png' ? WHITE : CLEAR, name);
    }
    for (const [path, html] of Object.entries(png.pages)) {
      assert.deepEqual(linked(html).map((link) => link.href), ['/favicon.ico', '/apple-touch-icon.png', '/site.webmanifest'], path);
    }
  });

  test('without a title, the manifest has no name', () => {
    assert.deepEqual(Object.keys(JSON.parse(png.icons['site.webmanifest'])), ['icons']);
  });

  test('a site built below a base writes the icons at its root and links them, and the manifest its icons, below the base', () => {
    for (const name of ICONS.filter((one) => one !== 'icon.svg')) assert.ok(Buffer.isBuffer(preview.icons[name]), name);
    for (const [path, html] of Object.entries(preview.pages)) {
      assert.deepEqual(linked(html).map((link) => link.href), ['/preview/favicon.ico', '/preview/apple-touch-icon.png', '/preview/site.webmanifest'], path);
    }
    assert.deepEqual(JSON.parse(preview.icons['site.webmanifest']).icons.map((icon) => icon.src), ['/preview/icon-192.png', '/preview/icon-512.png']);
  });

  test('a site without an icon gets none of the files, and its pages link none', () => {
    for (const name of ICONS) assert.equal(none.icons[name], undefined, name);
    for (const [path, html] of Object.entries(none.pages)) assert.deepEqual(linked(html), [], path);
  });

  test('a site that names no colour tokens has no theme-color, and nothing but its search and sharing tags, its links and the page\'s script after its title', () => {
    for (const built of [svg, png, preview, none]) {
      for (const [path, html] of Object.entries(built.pages)) {
        assert.deepEqual(themeColours(html), [], path);
        assert.match(html, /<\/title>(?:<(?:meta|link) [^>]*>|<script type="application\/ld\+json">[^<]*<\/script>)*<script [^>]*><\/script><\/head>/, path);
      }
    }
  });
});

describe('a site with an icon file of its own', () => {
  test('a file in public/, or a page, at an icon\'s address fails the build, naming it', () => {
    for (const [path, contents, address] of [
      ['public/favicon.ico', '', '/favicon.ico'],
      ['src/pages/site.webmanifest.js', 'export const GET = () => new Response("{}");\n', '/site.webmanifest'],
    ]) {
      const repository = siteRepository();
      try {
        mkdirSync(dirname(join(repository, path)), { recursive: true });
        writeFileSync(join(repository, path), contents);
        const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
        assert.notEqual(built.status, 0, path);
        assert.ok(`${built.stdout}${built.stderr}`.includes(`Konzilo writes the site's ${address} itself, so the site may not have one of its own: remove ${path}`), `${built.stdout}${built.stderr}`);
      } finally {
        rmSync(repository, { recursive: true, force: true });
      }
    }
  });
});

// A site that names its colours to the integration as its tokens (ADR
// 0108), in a stylesheet every page loads: `colours`, the custom property
// of each role of Ollie's palette it names, and `css`, the stylesheet's
// rules.
function colouredSite(colours, css) {
  return {
    'astro.config.mjs': astroConfig(integration, { tokens: { colors: colours } }),
    'src/styles/site.css': css,
    'src/layouts/Site.astro': sources['src/layouts/Site.astro'].replace('const { title } = Astro.props;', "import '../styles/site.css';\nconst { title } = Astro.props;"),
  };
}

// The <meta name="theme-color"> elements of a page's head, each as its
// content.
function themeColours(html) {
  const head = /<head>(.*?)<\/head>/s.exec(html)?.[1] ?? '';
  return [...head.matchAll(/<meta\b([^>]*)>/g)]
    .map(([, attributes]) => Object.fromEntries([...attributes.matchAll(/([a-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])))
    .filter((meta) => meta.name === 'theme-color')
    .map((meta) => meta.content);
}

// The manifest's colours and theme-color are the site's brand colour,
// Ollie's `primary`, and its page background, Ollie's `base`, as the start
// page's root resolves the tokens that name them; the Apple touch icon is
// laid on the background.
describe('the site\'s colours, from the tokens it names', () => {
  let uploads;
  let icon;
  const sites = [];
  let hex; // hexadecimal colours, the background through var()
  let spaces; // colours in other notations: OKLCH and HSL
  let neither; // tokens whose values are not opaque colours
  let preview; // hexadecimal colours, built below a base

  // Export with the red disc as the site icon, and build a site of
  // `colours` and `css`.
  const coloured = (colours, css, options) => {
    const repository = siteRepository(colouredSite(colours, css));
    sites.push(repository);
    return build(repository, { title: 'Lantern', logo: null, icon }, options);
  };

  before(() => {
    uploads = mkdtempSync(join(tmpdir(), 'konzilo-uploads-'));
    writeFileSync(join(uploads, 'disc.svg'), DISC);
    icon = { id: 13, original: join(uploads, 'disc.svg') };
    const named = { primary: '--brand', base: '--paper' };
    const css = ':root { --ink: #222222; --brand: #0B57D0; --paper: var(--cream); --cream: #fdf6e3; }\n';
    hex = coloured(named, css);
    preview = coloured(named, css, { args: ['--base', '/preview/'], outDir: 'dist-preview' });
    // Pure red in OKLCH, as Björn Ottosson's Oklab gives it, and a blue in HSL.
    spaces = coloured({ primary: '--brand', base: '--paper' }, ':root { --brand: oklch(62.7955% 0.257683 29.2339); --paper: hsl(210 50% 40%); }\n');
    neither = coloured({ primary: '--brand', base: '--paper' }, ':root { --brand: 1.5rem; --paper: rgb(255 255 255 / 50%); }\n');
  });

  after(() => {
    for (const repository of sites) rmSync(repository, { recursive: true, force: true });
    rmSync(uploads, { recursive: true, force: true });
  });

  test('the manifest\'s theme_color is the brand colour, and its background_color the page background', () => {
    assert.deepEqual(JSON.parse(hex.icons['site.webmanifest']), {
      name: 'Lantern',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: '#0b57d0',
      background_color: '#fdf6e3',
    });
  });

  test('every page\'s head holds theme-color, the brand colour, once', () => {
    for (const [path, html] of Object.entries(hex.pages)) assert.deepEqual(themeColours(html), ['#0b57d0'], path);
  });

  test('the Apple touch icon lays the transparent icon on the page background, and the other icons stay transparent', async () => {
    const touch = await looks(hex.icons['apple-touch-icon.png']);
    assert.deepEqual([touch.format, touch.width, touch.height, touch.hasAlpha], ['png', 180, 180, false]);
    assert.ok(alike(touch.centre, RED), `${touch.centre}`);
    assert.deepEqual(touch.corner, [0xfd, 0xf6, 0xe3, 255]);
    for (const size of [192, 512]) assert.deepEqual((await looks(hex.icons[`icon-${size}.png`])).corner, CLEAR, `${size}`);
  });

  test('a colour in another notation, as OKLCH or HSL, is written in hexadecimal, as every browser reads it', async () => {
    const manifest = JSON.parse(spaces.icons['site.webmanifest']);
    assert.deepEqual([manifest.theme_color, manifest.background_color], ['#ff0000', '#336699']);
    for (const [path, html] of Object.entries(spaces.pages)) assert.deepEqual(themeColours(html), ['#ff0000'], path);
    assert.deepEqual((await looks(spaces.icons['apple-touch-icon.png'])).corner, [0x33, 0x66, 0x99, 255]);
  });

  test('a token that is no opaque colour is left out, and the build\'s log names it', async () => {
    assert.deepEqual(Object.keys(JSON.parse(neither.icons['site.webmanifest'])), ['name', 'icons']);
    for (const [path, html] of Object.entries(neither.pages)) assert.deepEqual(themeColours(html), [], path);
    assert.deepEqual((await looks(neither.icons['apple-touch-icon.png'])).corner, WHITE);
    // The value as the built stylesheet has it, which Astro's build may have
    // written shorter.
    assert.match(neither.log, /theme-color go without the site's primary colour, since --brand, which the option tokens names for it, is 1\.5rem on the start page's root, which is not an opaque colour/);
    assert.match(neither.log, /background go without the site's base colour, since --paper, which the option tokens names for it, is \S+ on the start page's root, which is not an opaque colour/);
  });

  test('a site built below a base takes the same colours', () => {
    const manifest = JSON.parse(preview.icons['site.webmanifest']);
    assert.deepEqual([manifest.theme_color, manifest.background_color], ['#0b57d0', '#fdf6e3']);
    for (const [path, html] of Object.entries(preview.pages)) assert.deepEqual(themeColours(html), ['#0b57d0'], path);
  });
});

// Astro's dev server, as a local site runs it, follows every change of the content.
describe('the dev server', () => {
  let repository;
  let uploads;
  let built;
  let server;
  let origin;

  before(async () => {
    repository = siteRepository();
    uploads = mkdtempSync(join(tmpdir(), 'konzilo-uploads-'));
    writeFileSync(join(uploads, 'disc.svg'), DISC);
    built = build(repository, { title: 'Lantern &amp; Co', logo: null, icon: { id: 13, original: join(uploads, 'disc.svg') } });
    const port = await freePort();
    origin = `http://127.0.0.1:${port}`;
    // In the foreground, which Astro leaves for the background when it finds
    // itself run by an agent, unless told to ignore its lock file.
    const args = [astro, 'dev', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'];
    server = spawn(process.execPath, args, { cwd: repository, env: astroEnvironment, stdio: 'ignore', detached: true });
    await until(async () => (await fetch(`${origin}/`)).ok);
  });

  after(() => {
    // The dev server and what it started, as one process group.
    try {
      process.kill(-server.pid);
    } catch {
      // It has ended already.
    }
    rmSync(repository, { recursive: true, force: true });
    rmSync(uploads, { recursive: true, force: true });
  });

  const answer = async (name) => {
    const response = await fetch(`${origin}/${name}`);
    return { status: response.status, type: response.headers.get('content-type'), bytes: Buffer.from(await response.arrayBuffer()) };
  };

  test('answers each icon and the manifest with its type, the same bytes a build writes, and the start page links them', async () => {
    const types = {
      'favicon.ico': 'image/x-icon',
      'icon.svg': 'image/svg+xml',
      'apple-touch-icon.png': 'image/png',
      'icon-192.png': 'image/png',
      'icon-512.png': 'image/png',
      'site.webmanifest': 'application/manifest+json',
    };
    for (const name of ICONS) assert.deepEqual(await answer(name), { status: 200, type: types[name], bytes: built.icons[name] }, name);
    const page = await (await fetch(`${origin}/`)).text();
    assert.deepEqual(linked(page).map((link) => link.href), ['/favicon.ico', '/icon.svg', '/apple-touch-icon.png', '/site.webmanifest']);
  });

  test('follows the next change of the content at once: without an icon, every address answers 404 and the start page links none', async () => {
    writeWith(repository, { title: 'Lantern &amp; Co', logo: null, icon: null });
    for (const name of ICONS) assert.equal((await answer(name)).status, 404, name);
    await until(async () => linked(await (await fetch(`${origin}/`)).text()).length === 0).catch(() => {});
    assert.deepEqual(linked(await (await fetch(`${origin}/`)).text()), []);
  });
});

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer().listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on('error', reject);
  });
}

// Wait until `check` holds, for at most half a minute.
async function until(check, timeout = 90_000) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // Not answering yet.
    }
    if (Date.now() > end) throw new Error(`still not so after ${timeout / 1000} seconds`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}
