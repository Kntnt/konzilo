// The deletion guard: stops a build that would take most of a site's posts off it,
// since a fault upstream, an empty or partial read or a clock far behind, would
// otherwise silently empty a site. It decides, with no input or output of its own.

import { createHash } from 'node:crypto';

// What a stop says, which each post it holds back shows as its reason.
export const STOPPED = 'the build would take most of the site\'s posts off it, so it waits until the deletion is confirmed';

// `present`: the paths of the posts' files the content folder holds now. `result`: the
// intake's. `confirmed`: the code an operator gives, which holds only for exactly that
// deletion. Returns { stop, count, total, paths, code, reason }: what would go, not
// counting a post whose file moves, by the ledger; an unusually large share is more
// than half of the posts the site shows, when that is more than one post.
export function deletion(present, result, { confirmed = null } = {}) {
  const stays = new Set([...result.files.map((file) => file.path), ...result.keep]);
  const moved = new Set();
  for (const post of Object.values(result.ledger.posts)) {
    if (post.path === null) continue;
    for (const path of post.paths) if (path !== post.path) moved.add(path);
  }
  const paths = present.filter((path) => !stays.has(path) && !moved.has(path)).sort();
  const code = createHash('sha256').update(paths.join('\n')).digest('hex').slice(0, 8);
  const large = paths.length > 1 && paths.length * 2 > present.length;
  const stop = large && confirmed !== code;
  return { stop, count: paths.length, total: present.length, paths, code, reason: stop ? STOPPED : null };
}
