// A form's values as the preview's service reads them: plain data, where it lies, and an
// image not saved yet read from the browser, since its address means nothing elsewhere.

import { base64 } from '../base64.js';
import { plain } from '../plain.js';

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif' };

const nameOf = (address, type) => `preview-${address.split('/').at(-1).replaceAll(/[^A-Za-z0-9-]/g, '')}.${EXTENSIONS[type] ?? 'bin'}`;

// The values with each unsaved image at the name it travels under, and those images.
async function withImages(value, images, read) {
  if (Array.isArray(value)) return Promise.all(value.map((one) => withImages(one, images, read)));
  if (value !== null && typeof value === 'object') {
    const pairs = await Promise.all(Object.entries(value).map(async ([key, one]) => [key, await withImages(one, images, read)]));
    return Object.fromEntries(pairs);
  }
  if (typeof value !== 'string' || !value.startsWith('blob:')) return value;
  const known = images.get(value);
  if (known) return `/media/${known.name}`;
  const file = await read(value);
  const image = { name: nameOf(value, file.type), data: base64(new Uint8Array(await file.arrayBuffer())) };
  images.set(value, image);
  return `/media/${image.name}`;
}

const readBlob = async (address) => (await fetch(address)).blob();

// `id`: the file's, its slug once saved, else one this form was given. `tag`: its
// language's folder, on a site in several.
export async function draftOf({ collection, id, tag, data }, read = readBlob) {
  const images = new Map();
  const fields = await withImages(plain(data), images, read);
  return { path: `${collection}/${tag ? `${tag}/` : ''}${id}.md`, fields, images: [...images.values()] };
}
