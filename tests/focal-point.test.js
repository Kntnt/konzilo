// An image's focal point, as the format holds it and as a crop is centred on it: the one reading
// and writing of it, and the one crop of an image to an aspect ratio, which the build makes and
// the editor's frames show.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { cropOf, focalPointIn, focalPointOf, focalPointText, ratioOf } from '../src/format/focal-point.js';

describe('the crop of an image to an aspect ratio', () => {
  test('is as large as fits in the image, and centred on the focal point as far as the image\'s edges allow', () => {
    const image = { width: 1500, height: 1000 };
    assert.deepEqual(cropOf(image, 1, { x: 0.5, y: 0.5 }), { left: 250, top: 0, width: 1000, height: 1000 });
    assert.deepEqual(cropOf(image, 1, { x: 0.4, y: 0.5 }), { left: 100, top: 0, width: 1000, height: 1000 });
    assert.deepEqual(cropOf(image, 1, { x: 0.1, y: 0.5 }), { left: 0, top: 0, width: 1000, height: 1000 }, 'held at the left edge');
    assert.deepEqual(cropOf(image, 1, { x: 0.95, y: 0 }), { left: 500, top: 0, width: 1000, height: 1000 }, 'held at the right edge');
  });

  test('takes the whole width of an image narrower than the ratio, and moves up and down', () => {
    const portrait = { width: 1000, height: 1500 };
    assert.deepEqual(cropOf(portrait, 16 / 9, { x: 0.5, y: 0.2 }), { left: 0, top: 19, width: 1000, height: 563 });
    assert.deepEqual(cropOf(portrait, 16 / 9, { x: 0.5, y: 1 }), { left: 0, top: 937, width: 1000, height: 563 });
  });

  test('is around the middle of an image without a focal point', () => {
    assert.deepEqual(cropOf({ width: 1500, height: 1000 }, 1), { left: 250, top: 0, width: 1000, height: 1000 });
    assert.deepEqual(cropOf({ width: 1500, height: 1000 }, 1, null), { left: 250, top: 0, width: 1000, height: 1000 });
  });

  test('is none where the image is in the ratio already, to the pixel', () => {
    assert.equal(cropOf({ width: 1500, height: 1000 }, 3 / 2, { x: 0.1, y: 0.1 }), null);
    assert.equal(cropOf({ width: 1300, height: 867 }, 3 / 2), null, '1300 × 866.7 is 1300 × 867');
    assert.deepEqual(cropOf({ width: 1300, height: 860 }, 3 / 2), { left: 5, top: 0, width: 1290, height: 860 });
  });
});

describe('a focal point', () => {
  test('is two fractions, of the width from the left and of the height from the top, to the thousandth', () => {
    assert.deepEqual(focalPointOf({ x: 0.25, y: 0.4 }), { x: 0.25, y: 0.4 });
    assert.deepEqual(focalPointOf({ x: 0, y: 1 }), { x: 0, y: 1 });
    assert.deepEqual(focalPointOf({ x: 1 / 3, y: 0.66666 }), { x: 0.333, y: 0.667 });
  });

  test('is none where it is not given, and wrong where it is not two fractions from 0 to 1', () => {
    for (const none of [undefined, null, '']) assert.equal(focalPointOf(none), null);
    for (const wrong of [{ x: 0.5 }, { x: -0.1, y: 0.5 }, { x: 0.5, y: 1.2 }, { x: '0.5', y: 0.5 }, { x: 0.5, y: 0.5, z: 1 }, [0.5, 0.5], 'middle', { x: Number.NaN, y: 0.5 }]) {
      assert.deepEqual(focalPointOf(wrong), { wrong: true }, JSON.stringify(wrong));
    }
  });

  test('is written in an image\'s title as x and y after `focus=`, and read back', () => {
    assert.equal(focalPointText({ x: 0.25, y: 0.4 }), '0.25,0.4');
    assert.equal(focalPointText({ x: 0, y: 1 }), '0,1');
    assert.deepEqual(focalPointIn('0.25,0.4'), { x: 0.25, y: 0.4 });
    assert.deepEqual(focalPointIn('0.333333,1.0'), { x: 0.333, y: 1 });
    for (const wrong of ['0.25', '0.25;0.4', '1.5,0.4', 'a,b', '0.25, 0.4', '-0,0.5', '.5,.5', '']) assert.equal(focalPointIn(wrong), null, wrong);
  });
});

describe('an aspect ratio', () => {
  test('is a width and a height, each a positive number, written with a colon', () => {
    assert.deepEqual(ratioOf('16:9'), { text: '16:9', value: 16 / 9 });
    assert.deepEqual(ratioOf(' 1.91:1 '), { text: '1.91:1', value: 1.91 });
    assert.deepEqual(ratioOf('1:1'), { text: '1:1', value: 1 });
  });

  test('is nothing else', () => {
    for (const wrong of ['16/9', '16:0', '0:9', '-16:9', '16:9:1', 'wide', '', 16 / 9, null, undefined]) assert.equal(ratioOf(wrong), null, String(wrong));
  });
});
