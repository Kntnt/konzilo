// The label of the menu entry that leads to a post, which the post's name in breadcrumbs shows
// while it is empty, as the site names the post by it (breadcrumbOf() of article-parts.js): of
// the menus' source files, in the order the site description declares the menus, the first that
// has an entry whose `post` is the post's ID, and in it the first such entry, an entry before
// those under it (firstEntry() of menus.js). They are asked of Forgejo with the credential of
// whoever is signed in, since a field of Sveltia's cannot read another collection's entries, each
// time a form shows the field, so that a menu changed since shows as it now is. An entry with no
// label of its own is labelled with the post's title, which the name falls back to anyway, so it
// gives none here.

import { firstEntry, labelOf } from '../../format/menus.js';
import { sourceReader } from '../source.js';

// The source as sourceOf() names it, and `credential()`, the signed-in editor's. Gives
// labelFor(id, files), the label for the post by its ID among the menus in `files`, their paths in
// the source repository, in order; '' for none.
export function menuLabelReader({ api, repository, branch, credential, get }) {
  const source = sourceReader({ api, repository, branch, credential, get });
  // A menu's entries, none where its file cannot be read.
  const entriesIn = async (path) => {
    try {
      const text = await source.text(path);
      return text === null ? [] : JSON.parse(text)?.items ?? [];
    } catch {
      return [];
    }
  };
  return async (id, files) => {
    if (!api || !credential() || !id || files.length === 0) return '';
    const menus = await Promise.all(files.map(entriesIn));
    return labelOf(firstEntry(menus, (entry) => entry.post !== undefined && entry.post !== null && String(entry.post) === id));
  };
}
