// What a post shows its editor (ADR 0031), from what the last build read and what the current
// release holds, for the version of its file that stands in the source repository now. It is
// worked out each time it is asked for, so that a version no build has read needs no record:
// that is what being published is.

// `post`: what the last build read of this file. `held`: the version the current release holds,
// or undefined. `reason`: why the last build made no release, or null.
function statusOf({ post, held, reason }, version) {
  const about = post?.version === version ? post : null;
  if (about?.state === 'refused') return { status: 'failed', refusals: about.refusals, stillShown: about.shown };
  if (about?.state === 'live' && held === version) return { status: 'live', warnings: about.warnings };
  if (held === version && about === null) return { status: 'live', warnings: post?.warnings ?? [] };
  if (about && reason && (about.state === 'live' || held !== undefined)) return { status: 'failed', reason, stillShown: held !== undefined };
  if (about?.state === 'waiting') return { status: 'scheduled', at: about.at, stillShown: about.shown };
  if (about?.state === 'off') return { status: 'draft', stillShown: about.shown };
  return { status: 'being-published', stillShown: held !== undefined };
}

// The publish status of the file `file`, at the version `version`, by a build's record, or null
// while no build has finished. It holds the post's address and what it is known by, as the last
// build read it.
export function publishStatus(record, file, version) {
  if (!record) return { file, version, status: 'being-published', stillShown: false };
  const post = record.posts?.[file] ?? null;
  const held = record.release?.held?.[file];
  const { status, ...rest } = statusOf({ post, held, reason: record.reason ?? null }, version);
  return { file, version, status, ...rest, ...(post ? { id: post.id, type: post.type, title: post.title, address: post.address } : {}) };
}
