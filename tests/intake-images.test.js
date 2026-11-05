// The seam the intake reaches images through, with the real sharp and SVGO: what an
// original is, by its first bytes, and the master it makes; and the strict check of an SVG,
// which refuses rather than cleans.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { describe, test } from 'node:test';
import { imagesFrom, namedOriginals, originalFacts, svgMaster } from '../src/intake/images.js';
import { svgProblem } from '../src/intake/svg.js';
import rules from '../src/format/rules.json' with { type: 'json' };
import { sharp } from './lib/images.js';

const words = (key) => new RegExp(`^${rules.refusals[key].replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '[\\s\\S]*')}$`);
const picture = ({ width = 600, height = 400, format = 'jpeg', ...options } = {}) => sharp({ create: { width, height, channels: 3, background: '#a33' } })[format](options);

const png = await picture({ format: 'png' }).toBuffer();

describe('a raster original', () => {
  test('becomes a WebP named by its hash, measured as its master', async () => {
    const bytes = await picture().toBuffer();
    const facts = await originalFacts(bytes);
    assert.equal(facts.hash, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(facts.extension, 'webp');
    assert.equal(facts.width, 600);
    const master = await sharp(facts.contents).metadata();
    assert.equal(master.format, 'webp');
    assert.equal(master.space, 'srgb');
  });

  test('gives the same bytes each time', async () => {
    const bytes = await picture({ format: 'png' }).toBuffer();
    const [one, two] = [await originalFacts(bytes), await originalFacts(bytes)];
    assert.ok(one.contents.equals(two.contents));
  });

  test('is scaled down only, to 2520 pixels on its longest side', async () => {
    const large = await originalFacts(await picture({ width: 3000, height: 1500 }).toBuffer());
    assert.deepEqual([large.width, large.height], [2520, 1260]);
    const small = await originalFacts(await picture({ width: 300, height: 200 }).toBuffer());
    assert.deepEqual([small.width, small.height], [300, 200]);
  });

  test('is turned upright, and keeps no metadata', async () => {
    const bytes = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#a33' } }).jpeg().withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'Someone' } } }).toBuffer();
    const facts = await originalFacts(bytes);
    assert.deepEqual([facts.width, facts.height], [400, 600]);
    const master = await sharp(facts.contents).metadata();
    assert.equal(master.exif, undefined);
    assert.equal(master.orientation, undefined);
  });

  test('a master already made of it is left alone, by the hash in its name', async () => {
    const bytes = await picture().toBuffer();
    const digits = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    const existing = await sharp({ create: { width: 500, height: 300, channels: 3, background: '#3a3' } }).webp().toBuffer();
    const images = await imagesFrom([{ path: 'media/a.jpg', contents: bytes }], new Map([[`some-post-${digits}.webp`, existing]]));
    assert.ok(images('media/a.jpg').contents.equals(existing));
    assert.equal(images('media/gone.jpg'), null);
  });
});

describe('what is refused, saying what to do instead', () => {
  test('a moving image', async () => {
    const other = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#3a3' } }).png().toBuffer();
    const moving = await sharp([png, other], { join: { animated: true } }).webp().toBuffer();
    assert.match((await originalFacts(moving)).reason, words('image-moving'));
  });

  for (const [what, bytes] of [
    ['a GIF', Buffer.from('GIF89a')],
    ['a HEIC', Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic')])],
    ['a TIFF', Buffer.from('II*\0')],
    ['a BMP', Buffer.from('BM6')],
    ['this file', Buffer.from('plain text')],
  ]) {
    test(`${what}, whatever its name says`, async () => {
      const { reason } = await originalFacts(bytes);
      assert.match(reason, words('image-kind'));
      assert.ok(reason.includes(what), reason);
    });
  }

  test('a file larger than 30 MB', async () => {
    assert.match((await originalFacts(Buffer.alloc(30 * 1024 * 1024 + 1))).reason, words('image-large'));
  });

  test('a pointer left where the image should be', async () => {
    assert.match((await originalFacts(Buffer.from('version https://git-lfs.github.com/spec/v1\noid sha256:abc\n'))).reason, words('image-pointer'));
  });

  test('a file that only starts as an image', async () => {
    assert.match((await originalFacts(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).reason, words('image-kind'));
  });
});

describe('an SVG', () => {
  const svg = (inner, attributes = 'viewBox="0 0 10 10"') => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ${attributes}>${inner}</svg>`);

  test('stays an SVG, optimised, with the same bytes each time', async () => {
    const bytes = svg('<!-- a comment --><rect   width="10" height="10"/>');
    const facts = await originalFacts(bytes);
    assert.equal(facts.extension, 'svg');
    assert.equal(facts.svg, true);
    assert.deepEqual([facts.width, facts.height], [10, 10]);
    assert.doesNotMatch(facts.contents.toString(), /a comment/);
    assert.ok(svgMaster(bytes.toString()).equals(facts.contents));
  });

  for (const [what, bytes] of [
    ['no reference', svg('<rect width="10" height="10"/>')],
    ['a reference inside', svg('<defs><linearGradient id="g"/></defs><rect fill="url(#g)" width="1" height="1"/><use href="#g"/>')],
    ['a still image inside', svg(`<image width="1" height="1" href="data:image/png;base64,${png.toString('base64')}"/>`)],
    ['a width and a height for proportions', svg('<rect width="1" height="1"/>', 'width="10" height="10"')],
    ['its encoding declared', Buffer.from('<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>')],
    ['a plain document type', Buffer.from('<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>')],
  ]) {
    test(`takes ${what}`, () => assert.equal(svgProblem(bytes), null));
  }

  for (const [what, bytes, says] of [
    ['a script', svg('<script>alert(1)</script>'), /a script/],
    ['a script of another prefix', svg('<x:script xmlns:x="http://www.w3.org/2000/svg">alert(1)</x:script>'), /a script/],
    ['a javascript: address', svg('<a href="javascript:alert(1)"><rect/></a>'), /javascript/],
    ['an event handler', svg('<rect onclick="alert(1)"/>'), /event handler onclick/],
    ['a foreignObject', svg('<foreignObject/>'), /foreignObject/],
    ['an element of XHTML', svg('<div xmlns="http://www.w3.org/1999/xhtml"/>'), /XHTML/],
    ['a reference outside, in href', svg('<image href="https://example.com/a.png"/>'), /outside the file/],
    ['a reference outside, in xlink:href', svg('<use xlink:href="other.svg#a"/>'), /outside the file/],
    ['a reference outside, in src', svg('<rect src="https://example.com/"/>'), /outside the file/],
    ['a CSS url()', svg('<rect fill="url(https://example.com/a)"/>'), /outside the file/],
    ['a CSS url() in a style', svg('<style>rect { fill: url("a.svg#b"); }</style>'), /outside the file/],
    ['an @import', svg('<style>@import "a.css";</style>'), /@import/],
    ['an image-set()', svg('<rect style="fill: image-set(\'a.png\' 1x)"/>'), /image-set/],
    ['a moving image inside', svg(`<image href="data:image/gif;base64,${Buffer.from('GIF89a').toString('base64')}"/>`), /outside the file/],
    ['an xml-stylesheet', Buffer.from('<?xml-stylesheet href="a.css"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'), /stylesheet/],
    ['an internal subset', Buffer.from('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>'), /document type/],
    ['an unknown entity', svg('<text>&x;</text>'), /malformed/],
    ['an animation that sets a reference', svg('<a><animate attributeName="href" to="https://example.com/"/></a>'), /animation/],
    ['an animation that sets a handler', svg('<set attributeName="onclick" to="alert(1)"/>'), /animation/],
    ['no proportions', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>'), /proportions/],
    ['malformed XML', Buffer.from('<svg viewBox="0 0 1 1"><rect></svg>'), /malformed/],
    ['another encoding declared', Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><svg viewBox="0 0 1 1"/>'), /encoding/],
    ['bytes that are no UTF-8', Buffer.concat([Buffer.from('<svg viewBox="0 0 1 1"><text>'), Buffer.from([0xff]), Buffer.from('</text></svg>')]), /UTF-8/],
    ['compression', gzipSync(svg('<rect/>')), /compression/],
    ['another root', Buffer.from('<html viewBox="0 0 1 1"/>'), /no <svg>/],
  ]) {
    test(`refuses ${what}`, () => {
      const problem = svgProblem(bytes);
      assert.match(problem ?? '', says);
      assert.match(problem, words('svg'));
    });
  }

  test('is refused through the seam too, named by its first bytes', async () => {
    assert.match((await originalFacts(svg('<script>alert(1)</script>'))).reason, words('svg'));
    assert.match((await originalFacts(gzipSync(svg('<rect/>')))).reason, words('svg'));
  });
});

describe('which originals are read', () => {
  const originalsNamed = (...names) => names.map((name) => ({ path: `media/${name}`, contents: () => {
    throw new Error(`${name} was read`);
  } }));
  const paths = (found) => found.map(({ path }) => path);

  test('those a source file names, in whichever form it gives them', () => {
    const files = [
      { path: 'articles/a.md', contents: '---\nimage: {"src":"/media/featured.webp","alt":"A"}\n---\n\n![B](/media/in-body.webp)\n\n![C](<../media/with space.webp>)\n\n![D](/media/en%20bild.webp)\n\n![E](/media/par\\(1\\).webp)' },
      { path: 'settings.json', contents: '{"logo":{"src":"/media/logo.svg"}}' },
    ];
    const names = ['featured.webp', 'in-body.webp', 'with space.webp', 'en bild.webp', 'par(1).webp', 'logo.svg'];
    assert.deepEqual(paths(namedOriginals(originalsNamed(...names, 'unused.webp'), files)), names.map((name) => `media/${name}`));
  });

  test('not those only the image library names, which no post uses', () => {
    const files = [
      { path: 'image-library/a1.json', contents: '{"src":"/media/waiting.webp","alt":"A"}' },
      { path: 'articles/a.md', contents: '---\n---\n\n![B](/media/used.webp)' },
    ];
    assert.deepEqual(paths(namedOriginals(originalsNamed('waiting.webp', 'used.webp'), files)), ['media/used.webp']);
  });
});
