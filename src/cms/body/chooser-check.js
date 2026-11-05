// What the chooser turns away before anything is sent, in the intake's own words, which has the
// last word all the same.

import { kindOf, masterWidth, MOST_BYTES } from '../../format/originals.js';
import { say } from '../../intake/words.js';

const HEAD = 4096;
const NOT_TAKEN = new Set(['GIF', 'HEIC', 'TIFF', 'BMP']);

// A WebP says it moves in its extended header's flags.
const movesAsWebp = (head) => String.fromCharCode(...head.subarray(12, 16)) === 'VP8X' && (head[20] & 0x02) !== 0;

const measured = async (file) => {
  const bitmap = await globalThis.createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return size;
};

// Why the site would not take this file, or null. Only what can be told here: an SVG's own check
// has a parser this page does not carry, so that one is the intake's.
export async function uploadProblem(file, { smallestWidth = null } = {}, measure = measured) {
  if (file.size > MOST_BYTES) return say('image-large');
  const head = new Uint8Array(await file.slice(0, HEAD).arrayBuffer());
  const kind = kindOf(head);
  if (NOT_TAKEN.has(kind)) return say('image-kind', { kind: `a ${kind}` });
  if (kind === 'unknown' || kind === 'pointer') return say('image-kind', { kind: 'this file' });
  if (kind === 'svg') return null;
  if (kind === 'webp' && movesAsWebp(head)) return say('image-moving');
  const size = await measure(file).catch(() => null);
  if (size === null) return say('image-kind', { kind: 'this file' });
  const width = masterWidth(size);
  return smallestWidth !== null && width < smallestWidth ? say('image-small', { width, smallest: smallestWidth }) : null;
}
