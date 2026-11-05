// What an original is, by its first bytes, whatever its name says: read by the intake, which
// has the last word, and by the editor's upload, which can say so at once. It reads bytes and
// nothing else, so that both can have it.

export const MOST_BYTES = 30 * 1024 * 1024;
export const LONGEST_SIDE = 2520;

const ascii = (bytes, from, to) => String.fromCharCode(...bytes.subarray(from, to));
const startsWith = (bytes, text, at = 0) => ascii(bytes, at, at + text.length) === text;

// `jpeg`, `png`, `webp` or `svg`; `GIF`, `HEIC`, `TIFF` or `BMP`, which the site does not take;
// `pointer`, where Git LFS left its pointer rather than the file; or `unknown`.
export function kindOf(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (startsWith(bytes, '\x89PNG\r\n\x1a\n')) return 'png';
  if (startsWith(bytes, 'RIFF') && startsWith(bytes, 'WEBP', 8)) return 'webp';
  if (startsWith(bytes, 'GIF8')) return 'GIF';
  if (startsWith(bytes, 'ftyp', 4) && /^(?:heic|heix|hevc|mif1|msf1|heif)/.test(ascii(bytes, 8, 12))) return 'HEIC';
  if (startsWith(bytes, 'II*\0') || startsWith(bytes, 'MM\0*')) return 'TIFF';
  if (startsWith(bytes, 'BM')) return 'BMP';
  if (startsWith(bytes, 'version https://git-lfs')) return 'pointer';
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'svg';
  const head = new TextDecoder().decode(bytes.subarray(0, 1024)).replace(/^﻿/, '').trimStart();
  if (/^<(?:\?xml|!--|!DOCTYPE|svg)/i.test(head)) return 'svg';
  return 'unknown';
}

// The width of the master a raster of this size becomes: its longest side at most what the site
// keeps, scaled down only.
export const masterWidth = ({ width, height }) => Math.round(width * Math.min(1, LONGEST_SIDE / Math.max(width, height)));
