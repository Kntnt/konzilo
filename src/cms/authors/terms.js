// The authors, as the authors field reads and adds to them: the terms' files in the authors'
// folder of the source repository, asked of Forgejo with the credential of whoever is signed in,
// since a field of Sveltia's cannot list another collection's entries (ADR 0055). On a site in
// several languages the folder is the main language's, where every author has a file.
//
// Adding is one commit of the new author's file, at once, so that a post can name the author from
// the first moment, and Sveltia finds the file the next time it looks at the repository.

import { base64 } from '../base64.js';

const BLOBS_AT_ONCE = 30;

const decoded = (content) => new TextDecoder().decode(Uint8Array.from(atob(content), (character) => character.charCodeAt(0)));

// What a term's file says of its author, or null for one with no name to show.
function nameIn(text) {
  try {
    const { name } = JSON.parse(text);
    return typeof name === 'string' && name.trim() !== '' ? name.trim() : null;
  } catch {
    return null;
  }
}

// `api`: Forgejo's. `folder`: the authors' files, `authors` or `authors/<tag>`. `credential()`: the
// signed-in editor's. An ID is made as Sveltia makes one, the last part of a random UUID.
export function authorsIn({ api, repository, branch = 'main', folder, credential, get = (...args) => globalThis.fetch(...args), id = () => globalThis.crypto.randomUUID().split('-').pop() }) {
  const ask = async (path, options = {}) => {
    const held = credential();
    if (!held) throw new Error('nobody is signed in');
    const answer = await get(`${api}/repos/${repository}${path}`, { ...options, headers: { ...options.headers, authorization: held } });
    if (!answer.ok) throw Object.assign(new Error(`Forgejo answered ${answer.status}`), { status: answer.status });
    return answer.json();
  };
  const where = `/contents/${folder.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;

  // A file never changes under its hash, so each is asked for once while a page is open.
  const known = new Map();

  return {
    // Each author, as { id, name }.
    async list() {
      const listed = await ask(where).catch((error) => {
        if (error.status === 404) return [];
        throw error;
      });
      const files = listed.filter(({ type, name }) => type === 'file' && name.endsWith('.json'));
      const unknown = files.map(({ sha }) => sha).filter((sha) => !known.has(sha));
      for (let at = 0; at < unknown.length; at += BLOBS_AT_ONCE) {
        const blobs = await ask(`/git/blobs?shas=${unknown.slice(at, at + BLOBS_AT_ONCE).join(',')}`);
        for (const blob of blobs ?? []) if (blob) known.set(blob.sha, nameIn(decoded(blob.content)));
      }
      return files.map(({ name, sha }) => ({ id: name.slice(0, -'.json'.length), name: known.get(sha) })).filter(({ name }) => name);
    },

    // A new author, as `list` gives one, with its biography where one is written.
    async add({ name, biography = '' }) {
      const written = { name: name.trim(), ...(biography.trim() === '' ? {} : { description: biography.trim() }) };
      if (written.name === '') throw new Error('an author with no name');
      const made = id();
      await ask('/contents', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          branch,
          message: `Add the author ${written.name}`,
          files: [{ operation: 'create', path: `${folder}/${made}.json`, content: base64(new TextEncoder().encode(`${JSON.stringify(written, null, 2)}\n`)) }],
        }),
      });
      return { id: made, name: written.name };
    },
  };
}
