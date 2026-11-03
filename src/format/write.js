// The ledger, the file in the content folder that says which post each content file of a
// post is, by the post's ID, and only the intake writes it. Like every file named with a
// leading dot, no collection reads it.
export const POST_IDS_FILE = '.post-ids.json';

// The ID of each post's file, by the file's path, from a ledger as JSON holds it: a
// key is the post's ID, or `<tag>/<ID>` on a site in several languages. A file another
// tool wrote has no entry, and what is no ledger names none.
export function postIdsByPath(ledger) {
  const ids = {};
  const posts = ledger?.posts;
  if (posts === null || typeof posts !== 'object' || Array.isArray(posts)) return ids;
  for (const [key, entry] of Object.entries(posts)) {
    if (typeof entry?.path === 'string') ids[entry.path] = key.split('/').at(-1);
  }
  return ids;
}
