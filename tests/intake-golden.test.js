// Golden output: the hand-written fixtures and the examples of content-format.md are what
// the intake writes, byte for byte, and each is a fixed point: read as a source file, it
// comes out as it went in. The end-to-end case is the published demo content: as source
// files, through the intake and the real seam, it comes back.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { demoSource, sourceFrom } from '../src/demo-source.js';
import { imagesFrom } from '../src/intake/images.js';
import { intake } from '../src/intake/index.js';
import { siteDescription } from '../src/site-description.js';
import { contentFormat, exampleFile, markedExamples, siteOf } from './lib/content-format.js';
import { everyElement, namedImages, NOW, pageFile, pagePath, pageSource, run, sourcePost, written } from './lib/intake.js';

const root = fileURLToPath(new URL('./fixtures/', import.meta.url));
const core = fileURLToPath(new URL('../', import.meta.url));

const elements = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

describe('each fixture is what the intake writes, and a fixed point', () => {
  for (const element of elements) {
    for (const name of readdirSync(join(root, element)).filter((file) => file.endsWith('.md')).sort()) {
      test(`${element}/${name}`, () => {
        const body = readFileSync(join(root, element, name), 'utf8').replace(/\n$/, '');
        const first = run({ [pagePath]: pageSource(body) }, everyElement);
        assert.deepEqual(first.refusals, []);
        assert.equal(written(first)['pages/hello-world.md'], pageFile(body));
        const second = run({ [pagePath]: pageSource(body) }, everyElement, { ledger: first.ledger });
        assert.deepEqual(written(second), written(first), 'a build that changes nothing writes the same');
      });
    }
  }
});

// The document's whole files, as a content folder holds them, by site. Its ledger is what
// a build before this one left, so that derived fields come out as the document shows.
const document = contentFormat();
const marked = markedExamples(document);
const LEDGER = '.post-ids.json';

function documentFiles(name) {
  return marked.checked
    .filter((example) => siteOf(example) === name && example.attributes.file && !example.attributes['reader-only'] && !example.attributes.tour)
    .map(exampleFile);
}

describe('the examples of content-format.md', () => {
  const site = siteDescription(marked.site);

  test('its whole files, as source files, come back byte for byte', () => {
    const published = documentFiles('');
    const expected = Object.fromEntries(published.map(({ path, contents }) => [path, contents]));
    const source = sourceFrom(site, published.filter(({ path }) => path !== LEDGER && path !== 'consent.json').map(({ path, contents }) => ({ path, content: contents })));
    // The originals the document's masters are made from.
    const named = [...new Set(published.flatMap(({ contents }) => [...contents.matchAll(/media\/([a-z0-9-]+\.(?:webp|svg))/g)].map(([, one]) => one)))];
    const files = [...source.map(({ path, content }) => ({ path, contents: content })), ...named.map((one) => ({ path: `media/${one}`, contents: 'an original' }))];
    const ledger = JSON.parse(expected[LEDGER]);
    const result = intake({ files, site, now: NOW, ledger, images: namedImages(), changes: {} });
    assert.deepEqual(result.refusals, []);
    const got = written(result);
    for (const [path, contents] of Object.entries(expected)) assert.equal(got[path], contents, path);
  });

  test('a site in several languages', () => {
    const languages = siteDescription(marked.sites.languages);
    const published = documentFiles('languages');
    const source = sourceFrom(languages, published.map(({ path, contents }) => ({ path, content: contents })));
    const result = intake({ files: source.map(({ path, content }) => ({ path, contents: content })), site: languages, now: NOW, images: namedImages() });
    assert.deepEqual(result.refusals, []);
    const got = written(result);
    for (const { path, contents } of published) assert.equal(got[path], contents, path);
  });

  test('its tour of every element', () => {
    const tour = marked.checked.find((one) => one.attributes.tour);
    const { path, contents } = exampleFile(tour);
    const body = contents.replace(/^---\n[\s\S]*?\n---\n\n/, '').replace(/\n$/, '');
    const result = run({ [pagePath]: sourcePost({ title: 'A tour of every element', slug: 'a-tour', status: 'published' }, body) }, site);
    assert.deepEqual(result.refusals, []);
    assert.equal(written(result)[path], contents);
  });

  for (const example of marked.checked.filter((one) => one.attributes.body && !one.attributes['reader-only'])) {
    test(`the body at line ${example.line}`, () => {
      const { path, contents } = exampleFile(example);
      const body = contents.replace(/^---\ntitle: "Example"\n---\n\n/, '').replace(/\n$/, '');
      const result = run({ [pagePath]: sourcePost({ title: 'Example', slug: 'example', status: 'published' }, body), 'categories/newsnewsnews.json': { name: 'News', slug: 'news' } }, site);
      assert.deepEqual(result.refusals, []);
      assert.equal(written(result)[path], contents);
    });
  }
});

describe('the published demo content, as source files, through the intake and the real seam', () => {
  const site = siteDescription(JSON.parse(readFileSync(join(core, 'site-template/files/site-description.json'), 'utf8')));
  const demo = join(core, 'site-template/demo-content');
  const walk = (folder) => readdirSync(folder).flatMap((name) => {
    const path = join(folder, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
  const expected = new Map(walk(demo).map((path) => [relative(demo, path), readFileSync(path)]));

  const source = demoSource(site, demo).map(({ path, content }) => ({ path, contents: content }));
  const once = async () => intake({
    files: source,
    site,
    // The day the demo's registry says it last changed.
    now: new Date('2026-11-03T12:00:00Z'),
    images: await imagesFrom(source.filter(({ path }) => path.startsWith('media/'))),
  });

  test('gives back every file, byte for byte where the format decides the bytes', async () => {
    const result = await once();
    assert.deepEqual(result.refusals, []);
    assert.deepEqual(result.warnings, []);
    const got = new Map(result.files.map(({ path, contents }) => [path, Buffer.from(contents)]));
    // A demo site has no history of builds, so its folder holds no ledger.
    got.delete(LEDGER);
    assert.deepEqual([...got.keys()].sort(), [...expected.keys()].sort());
    for (const [path, bytes] of expected) {
      // A raster is re-encoded from its original, and the demo's originals are its masters,
      // so its bytes cannot come back, and a real original gives bytes of its own. Its name
      // holds its original's hash, which is what the content files hold on to, and that
      // does. An SVG is its own fixed point, and comes back.
      if (path.endsWith('.webp')) continue;
      assert.ok(got.get(path).equals(bytes), path);
    }
  });

  // A master made into an original would be a new original with a hash of its own, so the
  // text is held to its fixed point with images named by the hash they already hold.
  test('is a fixed point: the result, read as source files, gives the result', () => {
    const images = namedImages();
    const first = intake({ files: source, site, now: NOW, images });
    const again = sourceFrom(site, first.files.filter(({ path }) => path !== LEDGER && path !== 'consent.json').map(({ path, contents }) => ({ path, content: contents })));
    const second = intake({ files: again.map(({ path, content }) => ({ path, contents: content })), site, now: NOW, images });
    assert.deepEqual(second.refusals, []);
    const text = (result) => result.files.filter(({ path }) => path !== LEDGER && !path.startsWith('media/')).map(({ path, contents }) => [path, contents]);
    assert.deepEqual(text(second), text(first));
  });
});
