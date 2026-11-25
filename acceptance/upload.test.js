// An image converted in the browser before it is uploaded (ADR 0022), in a real browser of each
// engine, alone on a page with no Sveltia and no Compose, since what a browser decodes and how it
// reads a colour profile and an orientation is each engine's own: the conversion itself, and the
// chooser's upload with *Lossless compression*, by the keyboard. What arrives is read with sharp.
// Compose has the upload through Forgejo into the library.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ENGINES } from './lib/editor.js';
import { openFieldPage } from './lib/field-page.js';
import { sharp } from '../tests/lib/images.js';

// The quarters of an upright photograph, as sRGB.
const QUARTERS = [[230, 40, 40], [40, 200, 60], [60, 80, 220], [200, 180, 40]];

// A photograph as a camera writes one: stored on its side with the orientation that turns it
// upright, its colours in Display P3 by its own profile, and where it was taken in its metadata.
async function cameraPhoto(width, height) {
  const drawing = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${QUARTERS.map(([red, green, blue], at) => `<rect x="${(at % 2) * width / 2}" y="${Math.floor(at / 2) * height / 2}" width="${width / 2}" height="${height / 2}" fill="rgb(${red},${green},${blue})"/>`).join('')}</svg>`;
  const upright = await sharp(Buffer.from(drawing)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return sharp(upright.data, { raw: upright.info })
    .rotate(270)
    .withIccProfile('p3')
    .withExif({ IFD0: { Copyright: 'Someone' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '59/1 19/1 48/1', GPSLongitudeRef: 'E', GPSLongitude: '18/1 4/1 6/1' } })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 90 })
    .toBuffer();
}

// The chunks of a WebP, by name: what it holds besides its picture.
function chunksOf(bytes) {
  const found = [];
  for (let at = 12; at + 8 <= bytes.length;) {
    found.push(bytes.subarray(at, at + 4).toString('latin1'));
    const size = bytes.readUInt32LE(at + 4);
    at += 8 + size + (size % 2);
  }
  return found;
}

const pixel = ({ data, info }, x, y) => [...data.subarray((y * info.width + x) * info.channels, (y * info.width + x) * info.channels + 3)];
const near = (seen, wanted, by = 8) => seen.every((value, at) => Math.abs(value - wanted[at]) <= by);

for (const [name, engine] of Object.entries(ENGINES)) {
  describe(`an image converted before it is uploaded, in ${name}`, () => {
    let site;
    let page;
    let seen;

    const convert = async (bytes, fileName, options) => {
      const answer = await page.evaluate(([encoded, one, given]) => globalThis.uploadPage.convert(encoded, one, given), [bytes.toString('base64'), fileName, options]);
      return { ...answer, bytes: Buffer.from(answer.bytes, 'base64') };
    };

    before(async () => {
      site = await openFieldPage({ engine });
      ({ page, seen } = await site.newPage());
    }, { timeout: 120_000 });

    after(() => site?.close());

    test('makes a camera\'s 6000 × 4000 JPEG a WebP of 3840 × 2560, upright, in sRGB, with no metadata', async () => {
      const photo = await cameraPhoto(6000, 4000);
      const taken = await sharp(photo).metadata();
      assert.deepEqual([taken.width, taken.height, taken.orientation, Boolean(taken.icc), Boolean(taken.exif)], [4000, 6000, 6, true, true], 'the photograph as the camera wrote it');

      const converted = await convert(photo, 'Harbour at dawn.jpg', { longestSide: 3840, quality: 90 });
      assert.deepEqual([converted.name, converted.type, converted.size], ['Harbour at dawn.webp', 'image/webp', { width: 3840, height: 2560 }]);
      assert.deepEqual(chunksOf(converted.bytes), ['VP8 '], 'its picture, lossy, and nothing else');
      const made = await sharp(converted.bytes).metadata();
      assert.deepEqual([made.format, made.width, made.height, made.exif, made.icc, made.xmp, made.orientation], ['webp', 3840, 2560, undefined, undefined, undefined, undefined]);

      // Each quarter where it stands upright, in the colours the profile gives in sRGB; read as
      // sRGB without the profile, each would be some twenty levels off.
      const pixels = await sharp(converted.bytes).raw().toBuffer({ resolveWithObject: true });
      const middles = [[960, 640], [2880, 640], [960, 1920], [2880, 1920]];
      middles.forEach(([x, y], at) => assert.ok(near(pixel(pixels, x, y), QUARTERS[at]), `the quarter at ${x}, ${y} is ${pixel(pixels, x, y)}, not ${QUARTERS[at]}`));
      assert.deepEqual(seen.errors, []);
      assert.deepEqual(seen.refused, []);
    });

    test('keeps every pixel of a PNG, losslessly, and enlarges nothing within the size', async () => {
      const drawing = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#336699', noise: { type: 'gaussian', mean: 128, sigma: 50 } } }).png().toBuffer();
      const converted = await convert(drawing, 'diagram.png', { longestSide: 3840, quality: 90, lossless: true });
      assert.deepEqual(converted.size, { width: 640, height: 480 });
      assert.deepEqual(chunksOf(converted.bytes), ['VP8L']);
      const [given, kept] = await Promise.all([drawing, converted.bytes].map((bytes) => sharp(bytes).removeAlpha().raw().toBuffer()));
      assert.ok(given.equals(kept), 'every pixel as it was');
    });

    test('follows the longest side and the quality it is given', async () => {
      const photo = await sharp({ create: { width: 2000, height: 1500, channels: 3, background: '#887766', noise: { type: 'gaussian', mean: 120, sigma: 30 } } }).blur(1).jpeg({ quality: 95 }).toBuffer();
      const fine = await convert(photo, 'photo.jpg', { longestSide: 1000, quality: 95 });
      const coarse = await convert(photo, 'photo.jpg', { longestSide: 1000, quality: 40 });
      assert.deepEqual([fine.size, coarse.size], [{ width: 1000, height: 750 }, { width: 1000, height: 750 }]);
      assert.ok(coarse.bytes.length < fine.bytes.length * 0.6, `${coarse.bytes.length} bytes at 40, ${fine.bytes.length} at 95`);
    });

    test('takes an SVG as it is', async () => {
      const drawing = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#c00"/></svg>');
      const converted = await convert(drawing, 'logo.svg', { longestSide: 3840, quality: 90 });
      assert.deepEqual([converted.name, converted.size], ['logo.svg', null]);
      assert.ok(converted.bytes.equals(drawing));
    });

    describe('in the image library entry\'s own form', () => {
      const call = (method, ...args) => page.evaluate(([one, values]) => globalThis.imagePage[one](...values), [method, args]);
      const field = () => page.locator('.the-image-field');
      const lossless = () => field().getByRole('checkbox', { name: 'Lossless compression' });

      const choose = async (file) => {
        await field().locator('input[type=file]').setInputFiles(file);
        await field().locator('.konzilo-pick-picture img').waitFor({ timeout: 60_000 });
      };

      test('converts the file as it is chosen, a JPEG lossy, and again losslessly once the box is ticked by the keyboard', async () => {
        await call('open');
        assert.equal(await lossless().isVisible(), false, 'nothing to say before a file is chosen');
        await choose({ name: 'From the form.jpg', mimeType: 'image/jpeg', buffer: await sharp({ create: { width: 1300, height: 800, channels: 3, background: '#208060' } }).jpeg().toBuffer() });
        assert.equal(await lossless().isChecked(), false);
        assert.equal(await lossless().isEnabled(), true);
        let record = await call('record');
        assert.deepEqual(record.added.map(({ type }) => type), ['image/webp']);
        assert.match(record.added[0].name, /^from-the-form-[0-9a-f]{10}\.webp$/);
        assert.deepEqual(chunksOf(Buffer.from(record.added[0].bytes, 'base64')), ['VP8 ']);
        assert.deepEqual(record.told, [false]);

        await lossless().focus();
        await page.keyboard.press('Space');
        await page.waitForFunction(() => globalThis.imagePage.record().added.length === 2, null, { timeout: 60_000 });
        await page.waitForFunction(() => globalThis.imagePage.record().told.length === 2);
        record = await call('record');
        assert.deepEqual(chunksOf(Buffer.from(record.added[1].bytes, 'base64')), ['VP8L']);
        assert.notEqual(record.added[1].name, record.added[0].name, 'another file, by its hash');
        assert.deepEqual(record.told, [false, true]);
        assert.match(record.values.at(-1), /^blob:/);
        assert.equal(await lossless().isChecked(), true);
      });

      test('ticks it for a PNG, offers it for no SVG, and shows a saved entry\'s, greyed', async () => {
        await call('open');
        await choose({ name: 'chart.png', mimeType: 'image/png', buffer: await sharp({ create: { width: 900, height: 600, channels: 3, background: '#fafafa' } }).png().toBuffer() });
        assert.equal(await lossless().isChecked(), true);
        assert.deepEqual((await call('record')).told, [true]);

        await call('open');
        await choose({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>') });
        assert.equal(await lossless().isVisible(), false);

        await call('open', { value: '/media/chart-0123456789.webp', lossless: true });
        assert.equal(await lossless().isChecked(), true);
        assert.equal(await lossless().isEnabled(), false);
      });
    });

    describe('in the chooser\'s upload', () => {
      const call = (method, ...args) => page.evaluate(([one, values]) => globalThis.fieldPage[one](...values), [method, args]);
      const chooser = () => page.getByRole('dialog', { name: 'Choose an image' });
      const lossless = () => chooser().getByRole('checkbox', { name: 'Lossless compression' });

      const openUpload = async (settings) => {
        await call('open', '', { library: { entries: [], settings } });
        await call('focusEnd');
        await page.keyboard.type('/image', { delay: 20 });
        await page.locator('.milkdown-slash-menu li.hover', { hasText: 'Image' }).waitFor();
        await page.keyboard.press('Enter');
        await chooser().getByRole('button', { name: 'Upload a new image' }).click();
      };

      const upload = async (file, alt) => {
        await chooser().locator('input[type=file]').setInputFiles(file);
        await chooser().getByRole('textbox', { name: 'Alt text' }).fill(alt);
        await chooser().getByRole('button', { name: 'Upload and use' }).click();
        await chooser().waitFor({ state: 'detached', timeout: 60_000 });
        const [added] = await call('added');
        const [bytes] = await call('addedBytes');
        return { ...added, bytes: Buffer.from(bytes, 'base64') };
      };

      test('ticks Lossless compression for a PNG, and uploads it lossless', async () => {
        await openUpload();
        const drawing = await sharp({ create: { width: 800, height: 500, channels: 3, background: '#fafafa' } }).png().toBuffer();
        await chooser().locator('input[type=file]').setInputFiles({ name: 'A chart.png', mimeType: 'image/png', buffer: drawing });
        await assert.doesNotReject(lossless().waitFor());
        assert.equal(await lossless().isChecked(), true);
        assert.match(await lossless().getAttribute('aria-describedby'), /./, 'with what it does, for a screen reader');
        const added = await upload({ name: 'A chart.png', mimeType: 'image/png', buffer: drawing }, 'A chart');
        assert.deepEqual([added.name, added.type, added.lossless], ['A chart.webp', 'image/webp', true]);
        assert.deepEqual(chunksOf(added.bytes), ['VP8L']);
      });

      test('uploads a PNG lossy at the quality set, once the box is cleared by the keyboard', async () => {
        await openUpload({ longestSide: 600, quality: 50 });
        const drawing = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#4477aa' } }).png().toBuffer();
        await chooser().locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: drawing });
        await lossless().focus();
        await page.keyboard.press('Space');
        assert.equal(await lossless().isChecked(), false);
        await chooser().getByRole('textbox', { name: 'Alt text' }).fill('A photo');
        await chooser().getByRole('button', { name: 'Upload and use' }).click();
        await chooser().waitFor({ state: 'detached', timeout: 60_000 });
        const [added] = await call('added');
        const bytes = Buffer.from((await call('addedBytes'))[0], 'base64');
        assert.equal(added.lossless, false);
        assert.deepEqual(chunksOf(bytes), ['VP8 ']);
        const made = await sharp(bytes).metadata();
        assert.deepEqual([made.width, made.height], [600, 400], 'at the longest side set');
      });

      test('leaves a JPEG unticked, and offers no box for an SVG', async () => {
        await openUpload();
        await chooser().locator('input[type=file]').setInputFiles({ name: 'a.jpg', mimeType: 'image/jpeg', buffer: await sharp({ create: { width: 900, height: 600, channels: 3, background: '#a33' } }).jpeg().toBuffer() });
        await lossless().waitFor();
        assert.equal(await lossless().isChecked(), false);
        await chooser().locator('input[type=file]').setInputFiles({ name: 'a.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>') });
        await lossless().waitFor({ state: 'hidden' });
        await page.keyboard.press('Escape');
      });
    });
  });
}
