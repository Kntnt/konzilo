// The image library (ADR 0055), as the editor reads and adds to it: entries in the source
// repository, asked of Forgejo with the credential of whoever is signed in, and a small picture of
// each from the service. No part of it is Sveltia's, whose custom field cannot list another
// collection's entries, and whose `addFile` puts a file in the draft in hand, not in the library.
//
// Adding is one commit, of the original and its entry together, so that neither stands without the
// other, and at once, so that a post can name the file from the first moment. Forgejo stores the
// original in Git LFS by the repository's `.gitattributes`, as it does for any save.

import { IMAGE_LIBRARY_FOLDER, MEDIA_FOLDER } from '../../format/masters.js';
import { kindOf } from '../../format/originals.js';
import { base64 } from '../base64.js';

export const THUMBNAIL_PATH = '/_konzilo/thumbnail';

const BLOBS_AT_ONCE = 30;
const EXTENSIONS = { jpeg: 'jpg', png: 'png', webp: 'webp', svg: 'svg' };

const hex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const decoded = (content) => new TextDecoder().decode(Uint8Array.from(atob(content), (character) => character.charCodeAt(0)));

// A file's name as words a site's address can hold, with no leading or trailing hyphen.
export const stemOf = (name) => name.replace(/\.[^.]*$/, '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '') || 'image';

// An address as the name below the media folder it means, or null.
export function mediaNameOf(address) {
  const match = /^(?:\/|(?:\.\.\/)*)media\/([^?#]+)$/.exec(address);
  if (match === null) return null;
  try {
    return decodeURI(match[1]);
  } catch {
    return null;
  }
}

// What an entry's file says, or null for one that says nothing a post could use.
function entryOf(text) {
  try {
    const { src, alt, caption } = JSON.parse(text);
    return typeof src === 'string' && src !== '' ? { src, alt: typeof alt === 'string' ? alt : '', caption: typeof caption === 'string' ? caption : '' } : null;
  } catch {
    return null;
  }
}

// `api`: Forgejo's. `credential()`: the signed-in editor's.
export function imageLibrary({ api, repository, branch = 'main', credential, get = (...args) => globalThis.fetch(...args), id = () => globalThis.crypto.randomUUID().replaceAll('-', '').slice(0, 12), digest = (bytes) => globalThis.crypto.subtle.digest('SHA-256', bytes) }) {
  const ask = async (path, options = {}) => {
    const held = credential();
    if (!held) throw new Error('nobody is signed in');
    const answer = await get(`${api}/repos/${repository}${path}`, { ...options, headers: { ...options.headers, authorization: held } });
    if (!answer.ok) throw Object.assign(new Error(`Forgejo answered ${answer.status}`), { status: answer.status });
    return answer.json();
  };

  const filesInRepository = async () => {
    const found = [];
    for (let page = 1; ; page += 1) {
      const { tree, truncated } = await ask(`/git/trees/${branch}?recursive=true&per_page=1000&page=${page}`);
      found.push(...(tree ?? []).filter(({ type }) => type === 'blob'));
      if (!truncated) return found;
    }
  };

  // An entry's file never changes under its hash, so each is asked for once while a page is open.
  const known = new Map();
  const pictures = new Map();

  const commit = (message, files) => ask('/contents', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ branch, message, files }),
  });

  return {
    // Each entry that can be used, as { src, alt, caption }, in the order of its alt text.
    async list() {
      const files = (await filesInRepository()).filter(({ path }) => path.startsWith(`${IMAGE_LIBRARY_FOLDER}/`) && path.endsWith('.json'));
      const unknown = files.map(({ sha }) => sha).filter((sha) => !known.has(sha));
      for (let at = 0; at < unknown.length; at += BLOBS_AT_ONCE) {
        const blobs = await ask(`/git/blobs?shas=${unknown.slice(at, at + BLOBS_AT_ONCE).join(',')}`);
        for (const blob of blobs ?? []) if (blob) known.set(blob.sha, entryOf(decoded(blob.content)));
      }
      return files.map(({ sha }) => known.get(sha)).filter(Boolean).sort((one, other) => one.alt.localeCompare(other.alt));
    },

    // A new entry, with its original, as what `list` gives. The same file twice is one original.
    async add({ file, alt, caption = '' }) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const extension = EXTENSIONS[kindOf(bytes)];
      if (!extension) throw new Error('this file is no image the site can take');
      const name = `${stemOf(file.name)}-${hex(await digest(bytes)).slice(0, 10)}.${extension}`;
      const path = `${MEDIA_FOLDER}/${name}`;
      const entry = { src: `/${path}`, alt: alt.trim(), caption: caption.trim() };
      const { caption: written, ...always } = entry;
      const text = `${JSON.stringify(written === '' ? always : entry, null, 2)}\n`;
      const put = async () => {
        const standing = await filesInRepository();
        return commit(`Add ${name} to the image library`, [
          ...(standing.some((one) => one.path === path) ? [] : [{ operation: 'create', path, content: base64(bytes) }]),
          { operation: 'create', path: `${IMAGE_LIBRARY_FOLDER}/${id()}.json`, content: base64(new TextEncoder().encode(text)) },
        ]);
      };
      // Someone else may have brought the same file a moment ago.
      await put().catch((error) => {
        if (error.status !== 409 && error.status !== 422) throw error;
        return put();
      });
      return entry;
    },

    // An address to show a small picture of an image at, or null when there is none to show.
    picture(address) {
      const name = mediaNameOf(address);
      if (name === null) return Promise.resolve(null);
      if (!pictures.has(name)) {
        pictures.set(name, (async () => {
          const held = credential();
          if (!held) return null;
          const answer = await get(`${THUMBNAIL_PATH}?of=${encodeURIComponent(name)}`, { headers: { authorization: held } });
          return answer.ok ? URL.createObjectURL(await answer.blob()) : null;
        })().catch(() => null).then((shown) => {
          // Not there now may be there in a moment: a thing to ask again, and not to keep.
          if (shown === null) pictures.delete(name);
          return shown;
        }));
      }
      return pictures.get(name);
    },
  };
}
