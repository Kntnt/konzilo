// What the *Deleted* page asks of the service (ADR 0077), with what Sveltia signed in with: the
// deleted posts, terms and image library entries, a page at a time, newest deletion first, of one
// collection where one is chosen; and what it names each by, and an entry Sveltia has fetched. It
// holds no React.

import { askSignedIn } from '../service.js';
import { idOf } from './restore.js';

const DELETED = '/_konzilo/deleted';

// A page of the deleted entries, as the service gives them. Throws where the service cannot be
// asked or answers otherwise.
async function pageOf({ page, collection, credential, ask }) {
  const query = new URLSearchParams({ page: String(page), ...(collection ? { collection } : {}) });
  const answer = await askSignedIn(`${DELETED}?${query}`, {}, { credential, ask });
  if (answer === null) throw new Error('nobody is signed in');
  if (!answer.ok) throw new Error(`the service answered ${answer.status}`);
  return answer.json();
}

// The deleted entries as the page shows them, each answer { deleted, more }, all those it holds so
// far: `first()` the newest, and `older()` those it holds with the page after them, or null where
// there is none. The older ones are asked for once while they are on their way, however often
// `older()` is called meanwhile, as by two quick clicks.
export function deletedPages({ collection = null, credential, ask = (...args) => globalThis.fetch(...args) }) {
  let held = null;
  let page = 0;
  let asking = null;
  const read = async () => {
    const next = await pageOf({ page: page + 1, collection, credential, ask });
    page += 1;
    held = { deleted: [...(held?.deleted ?? []), ...(next.deleted ?? [])], more: next.more === true };
    return held;
  };
  return {
    first: () => read(),
    older() {
      if (!held?.more) return Promise.resolve(null);
      asking ??= read().finally(() => {
        asking = null;
      });
      return asking;
    },
  };
}

// What an entry is called in its last revision, `values` as its form reads them, by the field its
// collection names its entries by, else its ID.
export function entryTitle({ values, collection, path }) {
  const title = values?.[collection?.identifier_field];
  return typeof title === 'string' && title.trim() !== '' ? title : idOf(path);
}

// What the editor calls the entry `id` where Sveltia has fetched it: { title }, `title` by the first
// field that names it, or null where it holds none; else null.
export function fetchedEntry(id) {
  const entry = (globalThis.konziloSveltia?.entries() ?? []).find(({ slug, id: own }) => slug === id || own === id);
  if (entry === undefined) return null;
  const content = entry.locales?._default?.content ?? Object.values(entry.locales ?? {})[0]?.content ?? {};
  return { title: [content.title, content['group-name.title'], content.name, content.alt].find((one) => typeof one === 'string' && one !== '') ?? null };
}
