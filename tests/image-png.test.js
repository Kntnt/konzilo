// The editor's own reading of a PNG asked to be kept lossless (ADR 0022): its pixels as the file
// holds them, which a browser's canvas does not keep where a pixel is partly transparent. Each
// kind of PNG is read as sharp reads it.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { pngPixels } from '../src/cms/image/png.js';
import { sharp } from './lib/images.js';

// A picture of every colour and every opacity, the faint ones among them.
function rainbow(width, height, channels = 4) {
  const data = Buffer.alloc(width * height * channels);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = [(x * 37 + y) % 256, (y * 53 + x) % 256, ((x + y) * 29) % 256, (x * 7 + y * 13) % 256];
      data.set(pixel.slice(0, channels), (y * width + x) * channels);
    }
  }
  return data;
}

// The RGBA sharp reads of `bytes`.
const theirs = async (bytes) => sharp(bytes).ensureAlpha().raw().toBuffer();

const read = async (bytes) => {
  const pixels = await pngPixels(new Uint8Array(bytes));
  return { ...pixels, data: Buffer.from(pixels.data.buffer, pixels.data.byteOffset, pixels.data.length) };
};

describe('a PNG read by the editor', () => {
  test('gives each pixel as the file holds it, the faint ones too', async () => {
    const data = rainbow(97, 41);
    data.set([200, 100, 50, 3], 0);
    const bytes = await sharp(data, { raw: { width: 97, height: 41, channels: 4 } }).png().toBuffer();
    const pixels = await read(bytes);
    assert.deepEqual([pixels.width, pixels.height], [97, 41]);
    assert.deepEqual([...pixels.data.subarray(0, 4)], [200, 100, 50, 3]);
    assert.ok(pixels.data.equals(data), 'every pixel');
  });

  test('reads every way a PNG is written: grey, colour, a palette, few bits, sixteen, transparency and interlacing', async () => {
    const width = 61;
    const height = 23;
    const colour = sharp(rainbow(width, height), { raw: { width, height, channels: 4 } });
    const kinds = {
      'grey': colour.clone().removeAlpha().toColourspace('b-w').png(),
      'grey with alpha': colour.clone().toColourspace('b-w').png(),
      'colour, opaque': colour.clone().removeAlpha().png(),
      'a palette, transparent': colour.clone().png({ palette: true, colours: 200, dither: 0 }),
      'a palette of four, two bits': colour.clone().png({ palette: true, colours: 4, dither: 0 }),
      'sixteen bits': colour.clone().toColourspace('rgb16').png(),
      'interlaced': colour.clone().png({ progressive: true }),
      'interlaced, a palette': colour.clone().png({ progressive: true, palette: true, colours: 16, dither: 0 }),
      'every filter': colour.clone().png({ adaptiveFiltering: true, compressionLevel: 9 }),
    };
    for (const [kind, made] of Object.entries(kinds)) {
      const bytes = await made.toBuffer();
      const pixels = await read(bytes);
      assert.deepEqual([pixels.width, pixels.height], [width, height], kind);
      assert.ok(pixels.data.equals(await theirs(bytes)), kind);
    }
  });

  test('leaves to the browser a PNG that names a colour profile, and what is no PNG', async () => {
    const profiled = await sharp(rainbow(8, 8), { raw: { width: 8, height: 8, channels: 4 } }).withIccProfile('p3').png().toBuffer();
    assert.equal(await pngPixels(new Uint8Array(profiled)), null);
    const photo = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    assert.equal(await pngPixels(new Uint8Array(photo)), null);
  });

  test('refuses a PNG that is cut short or broken, rather than give pixels it does not hold', async () => {
    const bytes = await sharp(rainbow(40, 40), { raw: { width: 40, height: 40, channels: 4 } }).png().toBuffer();
    await assert.rejects(pngPixels(new Uint8Array(bytes.subarray(0, bytes.length - 40))));
  });
});
