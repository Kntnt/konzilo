// What the steps of a run share: refusing a post, and grouping what is read.

import { named } from './words.js';

export function groupBy(list, by) {
  const groups = new Map();
  for (const item of list) {
    const key = by(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

export const aboutPost = (post) => ({ id: post.id, type: post.type.name, title: post.title ?? post.id });

export function refuse(run, post, details) {
  const list = run.refused.get(post.key) ?? [];
  list.push(named({ post: aboutPost(post), file: post.path, ...details }));
  run.refused.set(post.key, list);
}

// A problem or a warning of a post's body as a refusal or a warning takes it: the block by
// its path and name, the line in the source file.
export const inBody = ({ path, name, line, reason }, post) => ({ block: { path, name }, line: line === null ? undefined : line + post.bodyLine - 1, reason });
