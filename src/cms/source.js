// The source repository as the editor reads it beside Sveltia, through Forgejo's API with the
// credential of whoever is signed in, since a field of Sveltia's cannot read another collection's
// entries or a file of no collection (ADR 0055): where the configuration says it is, a file's text
// and whether a file is there, on the branch the editor saves to.

// Where the editor reads the source, from Sveltia's configuration: Forgejo's API, the repository
// and the branch, each null where the configuration names no Forgejo, as a test repository's.
export const sourceOf = (config) => ({ api: config.backend?.api_root ?? null, repository: config.backend?.repo ?? null, branch: config.backend?.branch ?? null });

// A file's or a blob's content as Forgejo gives it, base64, in lines or not, as text.
export const decodedContent = (content) => new TextDecoder().decode(Uint8Array.from(atob(String(content ?? '').replace(/\s/g, '')), (character) => character.charCodeAt(0)));

// The path in Forgejo's API, below the repository, of a file or a folder of the source on `branch`.
export const contentsPath = (path, branch) => `/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`;

/**
 * The source as sourceOf() names it, read with `credential()`, the signed-in editor's: `text(path)`,
 * a file as text, and `exists(path)`, each null or false where the branch holds no file there, and
 * thrown where Forgejo fails or nobody is signed in.
 */
export function sourceReader({ api, repository, branch, credential, get = (...args) => globalThis.fetch(...args) }) {
  const contents = async (path) => {
    const held = credential();
    if (!held) throw new Error('nobody is signed in');
    const answer = await get(`${api}/repos/${repository}${contentsPath(path, branch)}`, { headers: { authorization: held } });
    if (answer.status === 404) return null;
    if (!answer.ok) throw Object.assign(new Error(`Forgejo answered ${answer.status}`), { status: answer.status });
    return answer.json();
  };
  return {
    async text(path) {
      const file = await contents(path);
      return file === null ? null : decodedContent(file.content);
    },
    async exists(path) {
      return (await contents(path)) !== null;
    },
  };
}
