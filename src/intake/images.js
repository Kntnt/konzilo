// The seam the intake reaches images through. The function itself stays free of input
// and output: it asks `images(path)` what an original is, and gets its facts and its
// master. This module makes that from the originals, with sharp at the version Astro
// takes and SVGO, before the function runs: a master already in the content folder is
// used as it is, since the same original always gives the same bytes.

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { optimize } from 'svgo';
import { svgProblem, svgSize } from './svg.js';
import { say } from './words.js';

const MOST_BYTES = 30 * 1024 * 1024;
const LONGEST_SIDE = 2520;
const QUALITY = 90;

// The ten hexadecimal digits a master's name holds of its original's SHA-256.
export const hashDigits = (hash) => hash.slice(0, 10);

const startsWith = (bytes, text, at = 0) => bytes.subarray(at, at + text.length).toString('latin1') === text;

// What an original is, by its first bytes, whatever its name says.
function kindOf(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (startsWith(bytes, '\x89PNG\r\n\x1a\n')) return 'png';
  if (startsWith(bytes, 'RIFF') && startsWith(bytes, 'WEBP', 8)) return 'webp';
  if (startsWith(bytes, 'GIF8')) return 'GIF';
  if (startsWith(bytes, 'ftyp', 4) && /^(?:heic|heix|hevc|mif1|msf1|heif)/.test(bytes.subarray(8, 12).toString('latin1'))) return 'HEIC';
  if (startsWith(bytes, 'II*\0') || startsWith(bytes, 'MM\0*')) return 'TIFF';
  if (startsWith(bytes, 'BM')) return 'BMP';
  if (startsWith(bytes, 'version https://git-lfs')) return 'pointer';
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return 'svg';
  const head = bytes.subarray(0, 1024).toString('utf8').replace(/^﻿/, '').trimStart();
  if (/^<(?:\?xml|!--|!DOCTYPE|svg)/i.test(head)) return 'svg';
  return 'unknown';
}

// The master of a still raster: a WebP at quality 90, its longest side at most 2520
// pixels, scaled down only, upright, in sRGB by the original's own profile, and without
// any metadata, which sharp drops unless told otherwise.
export function rasterMaster(bytes) {
  return sharp(bytes)
    .rotate()
    .resize({ width: LONGEST_SIDE, height: LONGEST_SIDE, fit: 'inside', withoutEnlargement: true })
    .toColourspace('srgb')
    .webp({ quality: QUALITY })
    .toBuffer();
}

// The master of an SVG, which has passed the check: optimised, with the same bytes each time.
export function svgMaster(text) {
  return Buffer.from(optimize(text, { multipass: true }).data);
}

async function rasterFacts(bytes, hash, existing) {
  let meta;
  try {
    meta = await sharp(bytes).metadata();
  } catch {
    return { reason: say('image-kind', { kind: 'this file' }) };
  }
  if ((meta.pages ?? 1) > 1) return { reason: say('image-moving') };
  const master = existing ?? await rasterMaster(bytes);
  const { width, height } = await sharp(master).metadata();
  return { hash, extension: 'webp', width, height, contents: master };
}

function svgFacts(bytes, hash, existing) {
  const problem = svgProblem(bytes);
  if (problem) return { reason: problem };
  const { width, height } = svgSize(bytes.toString('utf8'));
  return { hash, extension: 'svg', svg: true, width, height, contents: existing ?? svgMaster(bytes.toString('utf8')) };
}

// What one original is: { hash, extension, width, height, svg, contents }, the width
// measured as the master's, or { reason }. `existing`, the master already made of this
// hash, if any.
export async function originalFacts(bytes, existing = null) {
  if (bytes.length > MOST_BYTES) return { reason: say('image-large') };
  const kind = kindOf(bytes);
  if (['GIF', 'HEIC', 'TIFF', 'BMP'].includes(kind)) return { reason: say('image-kind', { kind: `a ${kind}` }) };
  if (kind === 'pointer') return { reason: say('image-pointer') };
  if (kind === 'unknown') return { reason: say('image-kind', { kind: 'this file' }) };
  const hash = createHash('sha256').update(bytes).digest('hex');
  return kind === 'svg' ? svgFacts(bytes, hash, existing) : rasterFacts(bytes, hash, existing);
}

// The seam for a set of originals, each { path, contents }: a function of a path below
// `media/`. `masters`, the content folder's, name to its bytes, so that a master already
// there is left alone, by the hash its name holds. Either's contents may be a function
// that reads them, so that a site's originals are in memory one at a time, as they can
// be 30 MB each, and a master only when its original is at hand.
export async function imagesFrom(originals, masters = new Map()) {
  const read = (contents) => (typeof contents === 'function' ? contents() : Buffer.from(contents));
  const byHash = new Map();
  for (const [name, contents] of masters) {
    const hash = /-([0-9a-f]{10})\.(?:webp|svg)$/.exec(name)?.[1];
    if (hash) byHash.set(hash, contents);
  }
  const facts = new Map();
  for (const { path, contents } of originals) {
    const bytes = read(contents);
    const existing = byHash.get(hashDigits(createHash('sha256').update(bytes).digest('hex')));
    // One at a time: sharp keeps its own pool of threads, and a site has many images.
    facts.set(path, await originalFacts(bytes, existing === undefined ? null : read(existing)));
  }
  return (path) => facts.get(path) ?? null;
}
