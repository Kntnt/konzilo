// A body's image as a browser loads it, in each browser engine, from the static build of a site
// made from the site template with its demo content: in a narrow window it loads the version
// nearest the width the page draws the image at, not the widest, and on a screen of density 2 one
// about twice as wide, by the image's `srcset` and `sizes` (ADR 0022).

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { astroEnvironment, nodeSync } from '../tests/lib/astro.js';
import { ENGINES } from './lib/editor.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const template = join(core, 'site-template/files');
const astro = join(core, 'node_modules/astro/bin/astro.mjs');

// The demo content's article that holds an image alone, its first, and a gallery.
const ARTICLE = '/every-element/';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };

// A site repository as `new-site` makes one from the template, its node modules the core's, with
// the core itself as the Konzilo package, given the demo content as a first build gives it.
function siteRepository() {
  const repository = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-image-versions-')));
  for (const file of ['astro.config.mjs', 'site-description.json', 'package.json']) cpSync(join(template, file), join(repository, file));
  cpSync(join(template, 'src'), join(repository, 'src'), { recursive: true });
  const modules = join(repository, 'node_modules');
  mkdirSync(join(modules, '@kntnt'), { recursive: true });
  for (const name of readdirSync(join(core, 'node_modules'))) {
    if (name !== '@kntnt' && !name.startsWith('.')) symlinkSync(join(core, 'node_modules', name), join(modules, name));
  }
  symlinkSync(core, join(modules, '@kntnt/konzilo'));
  const copied = nodeSync([join(core, 'bin/konzilo-demo-content.js')], { cwd: repository, encoding: 'utf8', env: { ...astroEnvironment, KONZILO_ORIGIN: 'http://localhost:4321' } });
  assert.equal(copied.status, 0, copied.stderr + copied.stdout);
  return repository;
}

// The build's files, as the public host serves them.
function serve(dist) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = join(dist, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe('a body\'s image, as a browser loads it from the site template\'s demo content', () => {
  let repository;
  let server;
  let origin;

  before(async () => {
    repository = siteRepository();
    const built = nodeSync([astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(built.status, 0, built.stderr + built.stdout);
    server = await serve(join(repository, 'dist'));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    await new Promise((resolve) => {
      server?.close(resolve);
    });
    rmSync(repository, { recursive: true, force: true });
  });

  // In a window `width` wide at a screen's `density`: the width the page draws the first image
  // at, the width of the version the browser shows, by the srcset's descriptor, every width in
  // its srcset, and the widths of its versions the browser asked for.
  async function loaded(engine, { width, density }) {
    const browser = await ENGINES[engine].launch();
    try {
      const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: density });
      const page = await context.newPage();
      const asked = [];
      page.on('request', (request) => asked.push(new URL(request.url()).pathname));
      await page.goto(`${origin}${ARTICLE}`);
      const image = page.locator('article figure:not(.konzilo-gallery) > button > img').first();
      await image.scrollIntoViewIfNeeded();
      await page.waitForFunction((element) => element.complete && element.naturalWidth > 0, await image.elementHandle());
      const shown = await image.evaluate((element) => ({
        drawn: element.getBoundingClientRect().width,
        current: new URL(element.currentSrc).pathname,
        srcset: element.getAttribute('srcset'),
        sizes: element.getAttribute('sizes'),
      }));
      const versions = shown.srcset.split(', ').map((candidate) => {
        const [file, descriptor] = candidate.split(' ');
        return { file, width: Number(descriptor.replace(/w$/, '')) };
      });
      const widthOf = (file) => versions.find((version) => version.file === file)?.width;
      return {
        drawn: shown.drawn,
        sizes: shown.sizes,
        shown: widthOf(shown.current),
        widths: versions.map((version) => version.width),
        asked: asked.map(widthOf).filter((one) => one !== undefined),
      };
    } finally {
      await browser.close();
    }
  }

  for (const engine of Object.keys(ENGINES)) {
    test(`${engine}: loads the version nearest the drawn width in a narrow window, not the widest, and one twice as wide at density 2`, async () => {
      const single = await loaded(engine, { width: 400, density: 1 });
      assert.ok(single.drawn <= 400, `drawn at ${single.drawn} px`);
      assert.deepEqual(single.widths, [480, 800, 1200, 1600], 'the demo content\'s masters are 1600 px wide');
      assert.equal(single.shown, 480, `at density 1: ${JSON.stringify(single)}`);
      assert.deepEqual(single.asked, [480], 'and no other version of it');

      const double = await loaded(engine, { width: 400, density: 2 });
      assert.equal(double.shown, 800, `at density 2: ${JSON.stringify(double)}`);
      assert.deepEqual(double.asked, [800], 'and no other version of it');
    });
  }
});
