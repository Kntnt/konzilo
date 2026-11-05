// Small pictures of originals, for what an editor chooses among (ADR 0055): an original can be
// 30 MB, and a library shows many at once. An original is private, so a picture goes only to
// whoever the service has asked Forgejo about, and is kept by the version of the file it is of.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { MEDIA_FOLDER } from '../format/masters.js';
import { kindOf, MOST_BYTES } from '../format/originals.js';

const LONGEST_SIDE = 640;
const QUALITY = 70;
const TAKEN = new Set(['jpeg', 'png', 'webp']);
// A small file can open up to more than the service may hold, which it does not try. A photograph
// comes well below this, and is read at a fraction of its size in any case.
const MOST_PIXELS = 100_000_000;

// Only when one is asked for: the service needs no picture code to say how publishing stands.
async function smallRaster(bytes) {
  const { default: sharp } = await import('sharp');
  sharp.cache(false);
  sharp.concurrency(1);
  return sharp(bytes, { limitInputPixels: MOST_PIXELS }).rotate().resize({ width: LONGEST_SIDE, height: LONGEST_SIDE, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').webp({ quality: QUALITY }).toBuffer();
}

const inMediaFolder = (name) => typeof name === 'string' && name !== '' && name.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
const pathOf = (name) => [MEDIA_FOLDER, ...name.split('/')].map(encodeURIComponent).join('/');

// `folder`: where pictures are kept, which can be lost at any time. `token`: can read the source.
export function thumbnails({ forgejo, repository, token, folder, get = fetch, small = smallRaster }) {
  let turn = Promise.resolve();
  const repo = `${forgejo}/api/v1/repos/${repository}`;
  const headers = { authorization: `token ${token}` };

  const readKept = (version) => {
    for (const [extension, type] of [['webp', 'image/webp'], ['svg', 'image/svg+xml']]) {
      try {
        return { status: 200, type, version, bytes: readFileSync(join(folder, `${version}.${extension}`)) };
      } catch { /* Not this one. */ }
    }
    return null;
  };

  const keep = (version, extension, bytes) => {
    mkdirSync(folder, { recursive: true });
    const named = join(folder, `${version}.${extension}`);
    writeFileSync(`${named}.part`, bytes);
    renameSync(`${named}.part`, named);
  };

  const make = async (name, version) => {
    const kept = readKept(version);
    if (kept !== null) return kept;
    const asked = await get(`${repo}/media/${pathOf(name)}?ref=main`, { headers });
    if (!asked.ok) return { status: asked.status === 404 ? 404 : 502 };
    if (Number(asked.headers?.get?.('content-length') ?? 0) > MOST_BYTES) return { status: 413 };
    const bytes = Buffer.from(await asked.arrayBuffer());
    if (bytes.length > MOST_BYTES) return { status: 413 };
    const kind = kindOf(bytes);
    // An SVG is small, and shows only as an image, where nothing in it runs.
    if (kind === 'svg') {
      keep(version, 'svg', bytes);
      return { status: 200, type: 'image/svg+xml', version, bytes };
    }
    if (!TAKEN.has(kind)) return { status: 415 };
    const picture = await small(bytes).catch(() => null);
    if (picture === null) return { status: 415 };
    keep(version, 'webp', picture);
    return { status: 200, type: 'image/webp', version, bytes: picture };
  };

  return {
    // The picture of the original `name` below the media folder: { status: 200, type, version,
    // bytes }, or { status } for why there is none. One is made at a time, since each can take
    // an original's whole size and more in memory.
    async of(name) {
      if (!inMediaFolder(name)) return { status: 400 };
      const about = await get(`${repo}/contents/${pathOf(name)}?ref=main`, { headers });
      if (!about.ok) return { status: about.status === 404 ? 404 : 502 };
      const { sha, type } = await about.json();
      if (type !== 'file' || !/^[0-9a-f]+$/.test(sha ?? '')) return { status: 404 };
      const kept = readKept(sha);
      if (kept !== null) return kept;
      const made = turn.then(() => make(name, sha));
      turn = made.catch(() => {});
      return made;
    },
  };
}
