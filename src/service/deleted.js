// The deleted posts, terms and image library entries (ADR 0077): each source file of one that a
// save removed, and that the source repository's history still holds. Deleting is a save like any
// other, so the history keeps all an entry held until it is purged, and nothing is stored beside
// it: what has been purged from the history is in no list.
//
// The history is learned from the branch, commit by commit, with the files each changed, and kept
// in memory alone, as who pushed each commit is (revisions.js): a file absent from the branch now
// was removed by the newest commit that changed it. After the first walk only the commits after the
// last one learned are asked for; a branch whose history was written anew, as by a purge, is
// learned again from its start.

import { commitsFrom } from '../forgejo.js';
import { IMAGE_LIBRARY_FOLDER, MEDIA_FOLDER } from '../format/masters.js';

// The branch the editor saves to.
const BRANCH = 'main';

// Whether a source file is a post, a term or an image library entry of the site `site` describes:
// { collection, kind } where it is, `kind` one of `post`, `term` and `image`, else null. A post is `.md` and a term `.json` in its collection's
// folder, on a site in several languages in its language's folder below it, and a library entry
// `.json` in the library's folder, which is in one language.
export function deletableIn(site) {
  const tags = site.languages.length > 1 ? site.languages.map(({ tag }) => tag) : null;
  const folders = [
    ...Object.values(site.types ?? {}).map(({ collection }) => [collection, '.md', tags, 'post']),
    ...Object.values(site.taxonomies ?? {}).map(({ collection }) => [collection, '.json', tags, 'term']),
    [IMAGE_LIBRARY_FOLDER, '.json', null, 'image'],
  ];
  return (path) => {
    const parts = path.split('/');
    const name = parts.at(-1);
    if (name.startsWith('.')) return null;
    for (const [collection, extension, languages, kind] of folders) {
      const placed = languages === null
        ? parts.length === 2 && parts[0] === collection
        : parts.length === 3 && parts[0] === collection && languages.includes(parts[1]);
      if (placed && name.endsWith(extension) && name.length > extension.length) return { collection, kind };
    }
    return null;
  };
}

// The original a library entry names, as its path in the source, or null.
function originalOf(text) {
  try {
    const { src } = JSON.parse(text);
    const [, name] = /^\/?media\/([^?#]+)$/.exec(typeof src === 'string' ? src : '') ?? [];
    return name === undefined ? null : `${MEDIA_FOLDER}/${decodeURI(name)}`;
  } catch {
    return null;
  }
}

// `ask(path)`: Forgejo's answer for the source repository, by a credential that reads it, which
// throws where Forgejo answers otherwise. `textAt(path, commit)`: a file as a commit left it, or
// null. `saved(commits)`: the moment and account of each commit's push, { [sha]: { moment,
// account } }, as revisions.js has them.
export function deletions({ ask, textAt, saved }) {
  // Each file's newest change: { commit, parent, date, order }, `order` higher for a newer commit.
  let learned = { head: null, changed: new Map(), order: 0 };
  // The files on the branch at the head learned.
  let standing = { head: null, files: null };

  const walk = (head, before) => commitsFrom(ask, head, before, { files: true });

  // One look at the branch at a time, each from where the last left off.
  let learning = Promise.resolve();
  const learn = () => {
    learning = learning.catch(() => {}).then(async () => {
      const head = (await (await ask(`/branches/${BRANCH}`)).json())?.commit?.id;
      if (typeof head !== 'string' || head === learned.head) return;
      let newer = null;
      if (learned.head !== null) {
        try {
          const shown = await walk(head, learned.head);
          if (shown.some(({ parents }) => (parents ?? []).some(({ sha }) => sha === learned.head))) newer = shown;
        } catch {
          // A head the branch no longer leads to.
        }
      }
      const next = newer === null ? { head, changed: new Map(), order: 0 } : { ...learned, head, changed: new Map(learned.changed) };
      for (const { sha, commit, parents, files } of [...(newer ?? await walk(head, null))].reverse()) {
        next.order += 1;
        const date = commit?.committer?.date ?? commit?.author?.date ?? null;
        for (const { filename } of files ?? []) next.changed.set(filename, { commit: sha, parent: parents?.[0]?.sha ?? null, date, order: next.order });
      }
      learned = next;
    });
    return learning;
  };

  const filesAt = async (head) => {
    if (standing.head === head) return standing.files;
    const files = new Set();
    for (let page = 1; ; page += 1) {
      const { tree, truncated } = await (await ask(`/git/trees/${encodeURIComponent(head)}?recursive=true&per_page=1000&page=${page}`)).json();
      for (const { path, type } of tree ?? []) if (type === 'blob') files.add(path);
      if (!truncated) break;
    }
    standing = { head, files };
    return files;
  };

  return {
    // The deleted entry at `path`, { path, collection, kind }, as list() would give it, or null.
    async find(path, { deletable }) {
      await learn();
      const { head, changed } = learned;
      const change = changed.get(path);
      const kind = deletable(path);
      if (head === null || !change || change.parent === null || kind === null || (await filesAt(head)).has(path)) return null;
      return { path, ...kind };
    },

    // A page of the deleted entries, newest deletion first, those of `collection` alone where it is
    // given, by `deletable(path)` as deletableIn() gives it: { deleted, more }, each { path,
    // collection, commit, moment, account, last: { commit, text }, along }, `commit` the deletion's
    // and `last` the revision before it, and `along` the files that went with it and come back
    // with it: a library entry's original, where the deletion took it too.
    async list({ page = 1, perPage, collection = null, deletable }) {
      await learn();
      const { head, changed } = learned;
      const files = head === null ? new Set() : await filesAt(head);
      const found = [];
      for (const [path, change] of changed) {
        if (files.has(path) || change.parent === null) continue;
        const kind = deletable(path);
        if (kind === null || (collection !== null && kind.collection !== collection)) continue;
        found.push({ path, collection: kind.collection, ...change });
      }
      found.sort((a, b) => b.order - a.order || (a.path < b.path ? -1 : 1));
      const shown = found.slice((page - 1) * perPage, page * perPage);
      const pushes = await saved(shown.map(({ commit, date }) => ({ sha: commit, date })));
      const deleted = await Promise.all(shown.map(async ({ path, collection: of, commit, parent }) => {
        const text = await textAt(path, parent);
        const original = of === IMAGE_LIBRARY_FOLDER && text !== null ? originalOf(text) : null;
        const along = original !== null && !files.has(original) && changed.get(original)?.commit === commit ? [original] : [];
        return { path, collection: of, commit, ...pushes[commit], last: { commit: parent, text }, along };
      }));
      return { deleted, more: found.length > page * perPage };
    },
  };
}
