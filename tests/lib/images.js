// The images the suite draws (photos.mjs, drawings.mjs), drawn with the copy of
// sharp the core itself loads: two copies of its native library in one process
// can clash.

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

export const sharp = createRequire(import.meta.resolve('@kntnt/konzilo/astro'))('sharp');

export * from './photos.mjs';
export * from './drawings.mjs';

// The first ten hex digits of a file's SHA-256, which name its master.
export function shortHash(bytes) {
  return createHash('sha256').update(bytes).digest('hex').slice(0, 10);
}
