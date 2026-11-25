// The worker that converts an image before it is uploaded (convert.js, ADR 0022), so that the page
// stays alive while a photograph of many millions of pixels is read, scaled and encoded.
//
// The browser decodes the file: it knows every JPEG, PNG and WebP a browser shows, turns it upright
// by its orientation and converts it to sRGB by its own colour profile. A PNG to be kept lossless
// is read by the editor itself (png.js), where it names no colour profile or orientation, since a
// canvas may keep a partly transparent pixel's colour multiplied by its alpha, and lose most of it.
// The rest is the same in every browser: the scaling is plain JavaScript (resize.js), and the
// encoding is libwebp, as WebAssembly, which writes the picture and nothing else, so no metadata
// leaves the editor's machine. Its code is fetched when the first conversion starts.

import encode from '@jsquash/webp/encode.js';

import { pngPixels } from './png.js';
import { fitted, resized } from './resize.js';

// The rows a canvas is drawn in at a time, so that none is larger than a browser allows.
const BAND = 256;

// The picture of `file`, { width, height, rows(from, to), close() }, `rows` giving the RGBA of those
// rows: as the PNG holds it, for one to be kept lossless that the editor reads itself, and else as
// the browser decodes it, drawn on a canvas a band at a time.
async function pictureOf(file, lossless) {
  const own = lossless ? await pngPixels(new Uint8Array(await file.arrayBuffer())) : null;
  if (own) {
    const { width, height, data } = own;
    return { width, height, rows: (from, to) => data.subarray(from * width * 4, to * width * 4), close: () => {} };
  }
  const bitmap = await globalThis.createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none', colorSpaceConversion: 'default' });
  const { width, height } = bitmap;
  const canvas = new globalThis.OffscreenCanvas(width, Math.min(height, BAND));
  const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
  const rows = (from, to) => {
    context.clearRect(0, 0, width, canvas.height);
    context.drawImage(bitmap, 0, -from);
    return context.getImageData(0, 0, width, to - from).data;
  };
  return { width, height, rows, close: () => bitmap.close() };
}

async function converted({ file, longestSide, quality, lossless }) {
  const picture = await pictureOf(file, lossless);
  try {
    const { width, height, rows } = picture;
    const size = fitted({ width, height }, longestSide);
    let pixels;
    if (size.width === width && size.height === height) {
      pixels = new Uint8ClampedArray(width * height * 4);
      for (let from = 0; from < height; from += BAND) pixels.set(rows(from, Math.min(height, from + BAND)), from * width * 4);
    } else {
      pixels = resized(picture, size);
    }
    // Lossless, libwebp's `quality` is how hard it tries, and its default is kept.
    const bytes = await encode({ data: pixels, width: size.width, height: size.height }, lossless ? { lossless: 1 } : { quality });
    return { bytes, width: size.width, height: size.height };
  } finally {
    picture.close();
  }
}

globalThis.addEventListener('message', async ({ data }) => {
  try {
    const answer = await converted(data);
    globalThis.postMessage(answer, [answer.bytes]);
  } catch (error) {
    globalThis.postMessage({ error: error?.message ?? String(error) });
  }
});
