// A PNG's pixels as the file holds them, read by the editor itself for an upload asked to be kept
// lossless (ADR 0022). A browser's canvas may keep its pixels multiplied by their alpha, so that a
// pixel that hardly shows loses most of its colour, (200, 100, 50) at an alpha of 3 coming back as
// (170, 85, 85) or (255, 255, 255); read here, every pixel is the file's. Every kind of PNG is read:
// grey, colour or a palette, with alpha or a transparent colour, of 1 to 16 bits, interlaced or
// not, sixteen bits taken to eight by their high byte, as a browser and sharp take them. The
// decompression is the browser's own, DecompressionStream.
//
// A PNG that names a colour profile, or an orientation, is left to the browser, which converts it
// to sRGB and turns it upright as it does every other image; so is one of more pixels than
// MOST_PIXELS, which the browser reads a band at a time.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const MOST_PIXELS = 40_000_000;

// The chunks that say a PNG's pixels are not plain sRGB, or not upright, as stored.
const BROWSERS = new Set(['iCCP', 'cICP', 'eXIf']);

// Channels by colour type: grey, colour, palette, grey with alpha, colour with alpha.
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// Adam7's seven passes: where each starts, and the steps between its pixels.
const PASSES = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

const broken = (why) => new Error(`the PNG is broken: ${why}`);

/**
 * The pixels of a PNG, { width, height, data }, its RGBA in rows from the top, or null where the
 * browser is to read it: for what is no PNG, a PNG that names a colour profile or an orientation,
 * and one of more than MOST_PIXELS. A broken PNG is refused.
 * @param {Uint8Array} bytes
 */
export async function pngPixels(bytes) {
  if (bytes.length < 8 || SIGNATURE.some((byte, at) => bytes[at] !== byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let header = null;
  let palette = null;
  let transparency = null;
  const compressed = [];
  let ended = false;
  for (let at = 8; !ended;) {
    if (at + 8 > bytes.length) throw broken('it ends before its last chunk');
    const size = view.getUint32(at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (at + 12 + size > bytes.length) throw broken(`its ${type} chunk runs past its end`);
    const data = bytes.subarray(at + 8, at + 8 + size);
    if (BROWSERS.has(type)) return null;
    if (type === 'IHDR') header = { width: view.getUint32(at + 8), height: view.getUint32(at + 12), depth: data[8], colour: data[9], interlaced: data[12] === 1 };
    else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') transparency = data;
    else if (type === 'IDAT') compressed.push(data);
    else if (type === 'IEND') ended = true;
    at += 12 + size;
  }
  if (header === null || compressed.length === 0) throw broken('it has no picture');
  const { width, height, depth, colour, interlaced } = header;
  if (!CHANNELS[colour] || ![1, 2, 4, 8, 16].includes(depth) || width === 0 || height === 0) throw broken('its header is none a PNG has');
  if (colour === 3 && palette === null) throw broken('it has no palette');
  if (width * height > MOST_PIXELS) return null;

  const raw = new Uint8Array(await new Response(new Blob(compressed).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const channels = CHANNELS[colour];
  const bits = channels * depth;
  const step = Math.max(1, bits >> 3);
  const pixels = new Uint8ClampedArray(width * height * 4);
  const pixelAt = pixelReader({ colour, depth, palette, transparency });

  let read = 0;
  const pass = (xFrom, yFrom, xStep, yStep) => {
    const across = Math.ceil((width - xFrom) / xStep);
    const down = Math.ceil((height - yFrom) / yStep);
    if (across <= 0 || down <= 0) return;
    const length = Math.ceil((across * bits) / 8);
    let above = new Uint8Array(length);
    for (let row = 0; row < down; row += 1) {
      if (read + 1 + length > raw.length) throw broken('its picture ends too soon');
      const line = unfiltered(raw[read], raw.slice(read + 1, read + 1 + length), above, step);
      read += 1 + length;
      const y = yFrom + row * yStep;
      for (let column = 0; column < across; column += 1) pixels.set(pixelAt(line, column), (y * width + xFrom + column * xStep) * 4);
      above = line;
    }
  };
  if (interlaced) for (const one of PASSES) pass(...one);
  else pass(0, 0, 1, 1);
  return { width, height, data: pixels };
}

// A line with its filter undone, by the line above it, `step` the bytes of a pixel, at least one.
function unfiltered(filter, line, above, step) {
  for (let at = 0; at < line.length; at += 1) {
    const left = at >= step ? line[at - step] : 0;
    const up = above[at];
    const corner = at >= step ? above[at - step] : 0;
    let add;
    if (filter === 0) add = 0;
    else if (filter === 1) add = left;
    else if (filter === 2) add = up;
    else if (filter === 3) add = (left + up) >> 1;
    else if (filter === 4) {
      const guess = left + up - corner;
      const [toLeft, toUp, toCorner] = [Math.abs(guess - left), Math.abs(guess - up), Math.abs(guess - corner)];
      add = toLeft <= toUp && toLeft <= toCorner ? left : toUp <= toCorner ? up : corner;
    } else throw broken(`a line has the filter ${filter}`);
    line[at] = (line[at] + add) & 0xff;
  }
  return line;
}

// The RGBA of the pixel at `column` of an unfiltered line.
function pixelReader({ colour, depth, palette, transparency }) {
  const channels = CHANNELS[colour];
  const most = (1 << Math.min(depth, 8)) - 1;
  // A sample as stored, of `depth` bits, the `index`th of the line.
  const sample = (line, index) => {
    if (depth === 8) return line[index];
    if (depth === 16) return (line[index * 2] << 8) | line[index * 2 + 1];
    const bit = index * depth;
    return (line[bit >> 3] >> (8 - depth - (bit & 7))) & most;
  };
  // A sample taken to eight bits: a few bits spread over the range, sixteen by their high byte.
  const eight = (value) => (depth === 16 ? value >> 8 : depth === 8 ? value : Math.round((value * 255) / most));
  const clear = transparency === null || colour === 3 ? null : Array.from({ length: transparency.length >> 1 }, (_, at) => (transparency[at * 2] << 8) | transparency[at * 2 + 1]);
  return (line, column) => {
    const values = Array.from({ length: channels }, (_, at) => sample(line, column * channels + at));
    if (colour === 3) {
      const index = values[0];
      return [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], transparency !== null && index < transparency.length ? transparency[index] : 255];
    }
    const hidden = clear !== null && clear.length === channels && clear.every((value, at) => value === values[at]);
    if (colour === 0) return [eight(values[0]), eight(values[0]), eight(values[0]), hidden ? 0 : 255];
    if (colour === 2) return [eight(values[0]), eight(values[1]), eight(values[2]), hidden ? 0 : 255];
    if (colour === 4) return [eight(values[0]), eight(values[0]), eight(values[0]), eight(values[1])];
    return values.map(eight);
  };
}
