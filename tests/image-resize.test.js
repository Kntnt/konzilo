// How the editor scales an image down before it is uploaded, in plain JavaScript, so that
// every browser gives the same pixels of the same decoded picture: the size it fits within the
// longest side an Admin sets, and a Lanczos filter as sharp's, which the intake uses.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { fitted, resized } from '../src/cms/image/resize.js';
import { sharp } from './lib/images.js';

// A picture as the editor reads it, a band of rows at a time.
const source = (data, width, height) => ({ width, height, rows: (from, to) => data.subarray(from * width * 4, to * width * 4) });

const raw = async (image) => {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
};

describe('the size an upload is converted to', () => {
  test('fits within the longest side, in proportion, either way up', () => {
    assert.deepEqual(fitted({ width: 6000, height: 4000 }, 3840), { width: 3840, height: 2560 });
    assert.deepEqual(fitted({ width: 4000, height: 6000 }, 3840), { width: 2560, height: 3840 });
    assert.deepEqual(fitted({ width: 5000, height: 5000 }, 1000), { width: 1000, height: 1000 });
  });

  test('is never larger than the image, nor a line thinner than a pixel', () => {
    assert.deepEqual(fitted({ width: 1000, height: 800 }, 3840), { width: 1000, height: 800 });
    assert.deepEqual(fitted({ width: 3840, height: 100 }, 3840), { width: 3840, height: 100 });
    assert.deepEqual(fitted({ width: 9000, height: 2 }, 900), { width: 900, height: 1 });
  });
});

describe('scaling down', () => {
  test('gives the pixels sharp\'s Lanczos filter gives, within a level or two', async () => {
    const drawn = sharp({ create: { width: 600, height: 400, channels: 3, background: '#557799', noise: { type: 'gaussian', mean: 128, sigma: 40 } } }).blur(2);
    const original = await raw(drawn.clone());
    const mine = resized(source(original.data, 600, 400), { width: 384, height: 256 });
    const { data: theirs } = await raw(sharp(Buffer.from(original.data), { raw: { width: 600, height: 400, channels: 4 } }).resize(384, 256, { kernel: 'lanczos3' }));
    assert.equal(mine.length, theirs.length);
    let total = 0;
    let most = 0;
    for (let at = 0; at < mine.length; at += 1) {
      const apart = Math.abs(mine[at] - theirs[at]);
      total += apart;
      most = Math.max(most, apart);
    }
    assert.ok(total / mine.length < 0.5, `on average ${total / mine.length} levels apart`);
    assert.ok(most <= 2, `at most ${most} levels apart`);
  });

  test('keeps a flat colour as it is, to its edges', () => {
    const data = new Uint8ClampedArray(90 * 60 * 4);
    for (let at = 0; at < data.length; at += 4) data.set([200, 30, 90, 255], at);
    const mine = resized(source(data, 90, 60), { width: 31, height: 21 });
    assert.equal(mine.length, 31 * 21 * 4);
    for (let at = 0; at < mine.length; at += 4) assert.deepEqual([...mine.subarray(at, at + 4)], [200, 30, 90, 255], `pixel ${at / 4}`);
  });

  test('lets the colour hidden under a transparent pixel bleed into none of its neighbours', () => {
    // Its left half clear, and black under that; its right half opaque red.
    const data = new Uint8ClampedArray(80 * 20 * 4);
    for (let at = 0; at < data.length; at += 4) data.set((at / 4) % 80 < 40 ? [0, 0, 0, 0] : [255, 0, 0, 255], at);
    const mine = resized(source(data, 80, 20), { width: 30, height: 8 });
    for (let at = 0; at < mine.length; at += 4) {
      if (mine[at + 3] < 8) continue;
      assert.ok(mine[at] >= 250 && mine[at + 1] <= 3 && mine[at + 2] <= 3, `pixel ${at / 4} is ${[...mine.subarray(at, at + 4)]}`);
    }
    assert.ok(mine[3] === 0 && mine[mine.length - 1] === 255, 'and the clear stays clear, the opaque opaque');
  });

  test('reads the picture a band at a time, from the top', () => {
    const data = new Uint8ClampedArray(50 * 300 * 4).fill(255);
    const asked = [];
    const rows = (from, to) => {
      asked.push([from, to]);
      return data.subarray(from * 50 * 4, to * 50 * 4);
    };
    resized({ width: 50, height: 300, rows }, { width: 10, height: 60 });
    assert.ok(asked.every(([from, to], at) => to > from && (at === 0 || from >= asked[at - 1][0])), JSON.stringify(asked));
    assert.equal(asked[0][0], 0);
    assert.equal(asked.at(-1)[1], 300);
  });
});
