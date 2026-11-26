// What every purge does to the source and content repositories' histories (ADR 0078), whatever it
// takes from them, a deleted entry (entry.js) or a passage (passage.js): both rewritten by the
// rules it is handed (rewrite.js), the content repository's commits naming the source commit they
// publish by its new identity, the record of purges (record.js) noting the purge, who and when,
// and the push that brought each save it gave a new identity, as it was; and both pushed with a
// lease on what was read, so that a save that came meanwhile turns the push away and the purge
// starts again from what is there now, and nothing of that save is lost. The source is pushed
// first, with the record; what each push is to be is said before it, and each push once it is
// made, so that a purge stopped after the first is finished from where it was (pushContent()).
//
// It works on two clones it is handed, each a bare repository whose `origin` is Forgejo's.

import { IDENTITY } from '../build/repositories.js';
import { PURGES_BRANCH, PURGES_FILE, purgeRecord, recordFile } from './record.js';
import { rewriteHistory } from './rewrite.js';

export const BRANCH = 'main';
// A save that comes while a purge runs makes it start again, this many times at most.
const TRIES = 4;
// Blobs are read this many at a time.
const BATCH = 500;

// Why a purge is not made: `not-deleted`, the entry is in the source as it stands; `not-found`,
// no commit of either history holds what is to go; and `current`, a passage is in the current
// version of the files `paths` names.
export class PurgeRefusal extends Error {
  constructor(reason, { paths = null } = {}) {
    super(`the purge is refused: ${reason}`);
    this.reason = reason;
    if (paths) this.paths = paths;
  }
}

// The bytes of each object named, by its identity, read by `cat-file --batch` a share at a time.
export async function blobsOf(git, shas) {
  const found = new Map();
  for (let from = 0; from < shas.length; from += BATCH) {
    const out = await git(['cat-file', '--batch'], { input: `${shas.slice(from, from + BATCH).join('\n')}\n` });
    let at = 0;
    while (at < out.length) {
      const end = out.indexOf(10, at);
      const [sha, kind, size] = out.subarray(at, end).toString('utf8').split(' ');
      at = end + 1;
      if (kind === 'missing') continue;
      found.set(sha, out.subarray(at, at + Number(size)));
      at += Number(size) + 1;
    }
  }
  return found;
}

// What Git wrote, as text, by `git` as gitRunner() gives it.
export const gitText = async (git, args, options) => (await git(args, options)).toString('utf8');
const fetchAll = (git) => git(['fetch', '--quiet', '--force', '--prune', 'origin', '+refs/heads/*:refs/heads/*']);
const headOf = async (git, ref) => {
  try {
    return (await gitText(git, ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`])).trim();
  } catch {
    return null;
  }
};
// A branch's head as `origin` holds it, or null where it holds no such branch.
const originHead = async (git, ref) => (await gitText(git, ['ls-remote', 'origin', `refs/heads/${ref}`])).split(/\s/)[0] || null;
const wait = (ms) => new Promise((go) => setTimeout(go, ms));

// The source commit a content commit publishes, by its message, among `commits`, or null.
const publishedIn = (commits) => (message) => {
  const prefix = /^Publish ([0-9a-f]{12})\b/.exec(message)?.[1];
  return prefix === undefined ? null : commits.find((commit) => commit.startsWith(prefix)) ?? null;
};

// One attempt, from what the clones hold: the rewrites made in the clones, and what the pushes
// need.
async function attempt({ source, content, by, at, pushedBy, plan }) {
  const before = { source: await headOf(source.git, BRANCH), content: await headOf(content.git, BRANCH), record: await headOf(source.git, PURGES_BRANCH) };
  const planned = await plan({ before });
  const record = purgeRecord(before.record === null ? null : (await source.git(['show', `${before.record}:${PURGES_FILE}`]).catch(() => null))?.toString('utf8'));
  const oldCommits = (await gitText(source.git, ['rev-list', BRANCH])).split('\n').filter(Boolean);
  const pushes = await pushedBy(oldCommits.filter((commit) => !Object.hasOwn(record.pushes, commit)));

  const rewritten = await rewriteHistory({ git: source.git, branch: BRANCH, ...planned.source });
  const newCommits = new Set((await gitText(source.git, ['rev-list', BRANCH])).split('\n').filter(Boolean));
  const shortly = new Map(oldCommits.map((commit) => [commit.slice(0, 12), rewritten.renamed.get(commit)?.slice(0, 12) ?? null]));

  // Who pushed each save as it was, by its new identity; a save that kept its own keeps what the
  // record held of it.
  const carried = {};
  for (const commit of oldCommits) {
    const now = rewritten.renamed.get(commit);
    if (rewritten.gone.has(commit) || now === null || !newCommits.has(now)) continue;
    const pusher = Object.hasOwn(record.pushes, commit) ? record.pushes[commit] : pushes[commit] ?? null;
    if (now !== commit || Object.hasOwn(record.pushes, commit)) carried[now] = pusher;
  }
  const noted = { purges: [...record.purges, { at, by: { login: by.login, name: by.name ?? by.login } }], pushes: carried };
  const blob = (await gitText(source.git, ['hash-object', '-w', '--stdin'], { input: recordFile(noted) })).trim();
  const tree = (await gitText(source.git, ['mktree'], { input: `100644 blob ${blob}\t${PURGES_FILE}\n` })).trim();
  const noteCommit = (await gitText(source.git, [...IDENTITY, 'commit-tree', tree, ...(before.record ? ['-p', before.record] : []), '-m', `Purge by ${by.login}`])).trim();

  // The content repository, by its own rules, each commit naming the source commit it publishes
  // by its new identity.
  let contentHead = null;
  if (before.content !== null) {
    const rules = planned.content({ published: publishedIn(oldCommits) });
    const done = await rewriteHistory({
      git: content.git,
      branch: BRANCH,
      ...rules,
      message: async (said) => {
        const named = said.replace(/^Publish ([0-9a-f]{12})\b/, (whole, prefix) => (shortly.get(prefix) ? `Publish ${shortly.get(prefix)}` : whole));
        const made = rules.message ? await rules.message(named) : null;
        return made ?? (named === said ? null : named);
      },
    });
    contentHead = done.head;
  }
  if (rewritten.head === before.source && (contentHead === null || contentHead === before.content)) throw new PurgeRefusal('not-found');
  return { before, source: rewritten, contentHead, noteCommit, record: noted, planned };
}

// Whether the source was pushed as `planned` said it would be, by a purge stopped before it said
// so: the record's branch stands where the purge was to put it, which only the instance's account
// writes, and no purge but this one could have.
export async function pushedAlready(source, planned) {
  return planned?.after?.record != null && await originHead(source.git, PURGES_BRANCH) === planned.after.record;
}

// Pushes the content repository's history as a purge rewrote it, `after`, over `before`, as it read
// it, with a lease on it, again where a push fails, `tries` times at most, after a wait longer each
// time, by `sleep(ms)`: the push of a purge that runs, and of one finished after it stopped, whose
// clone holds `after` still. One that a run before made already is done. Throws where it cannot
// be made, as where the repository stands elsewhere, which nothing but a build writes, and builds
// are held back until the purge is done.
export async function pushContent({ content, before, after, tries = TRIES, sleep = wait }) {
  if (after === null || after === before) return;
  for (let pushed = 1; ; pushed += 1) {
    try {
      const stands = await originHead(content.git, BRANCH);
      if (stands === after) return;
      if (stands !== before) throw new Error(`the content repository stands at ${stands}, not where the purge read it`);
      await content.git(['push', '--quiet', 'origin', `--force-with-lease=refs/heads/${BRANCH}:${before}`, `${after}:refs/heads/${BRANCH}`]);
      return;
    } catch (error) {
      if (pushed >= tries) throw error;
      await sleep(1000 * pushed);
    }
  }
}

// Purges what `plan` says from both repositories' histories, as `by`, { login, name }, at `at`.
// `source` and `content`: { git }, each a bare clone whose `origin` is the repository.
// `pushedBy(commits)`: who pushed each commit as Forgejo's feed has it, { [sha]: { login, name, at
// } }, a commit it has none of left out. `plan({ before })`, asked again at each attempt, with the
// heads the attempt read: { source, content, outcome }, `source` the rules the source's history is
// rewritten by, as rewriteHistory() takes them, `content({ published })` those of the content
// repository's, `published(message)` giving the source commit a content commit's message says it
// publishes, as it was, and `outcome` what the purge gives once done beside the histories, as JSON.
// `noted(step, more)`: called with `planned` before the source is pushed, `more` { before, after,
// dropped, outcome }, the heads each branch had and is to have, `before` and `after`, { source,
// content, record }, and the source commits that held nothing but what went, `dropped`; with
// `source` once the source is pushed, and with `content` once the content is. Gives { source: {
// before, after, renamed, gone, dropped }, content: { before, after }, record, outcome }, `gone`
// the source commits that are no more, and `dropped` those of them that held nothing else.
// Throws a PurgeRefusal where nothing is to be purged, or where `plan` throws one.
export async function purgeHistories({ source, content, by, at, pushedBy, plan, tries = TRIES, sleep = wait, noted = async () => {} }) {
  for (let tried = 1; ; tried += 1) {
    await fetchAll(source.git);
    await fetchAll(content.git).catch(() => {});
    const made = await attempt({ source, content, by, at, pushedBy, plan });
    const { before } = made;
    await noted('planned', {
      before,
      after: { source: made.source.head, content: made.contentHead, record: made.noteCommit },
      dropped: [...made.source.gone],
      outcome: made.planned.outcome ?? {},
    });
    try {
      await source.git(['push', '--quiet', '--atomic', 'origin',
        `--force-with-lease=refs/heads/${BRANCH}:${before.source}`,
        `--force-with-lease=refs/heads/${PURGES_BRANCH}:${before.record ?? ''}`,
        `refs/heads/${BRANCH}:refs/heads/${BRANCH}`,
        `${made.noteCommit}:refs/heads/${PURGES_BRANCH}`]);
    } catch (error) {
      if (tried >= tries) throw error;
      continue;
    }
    await noted('source');
    await pushContent({ content, before: before.content, after: made.contentHead, tries, sleep });
    await noted('content');
    return {
      source: { before: before.source, after: made.source.head, renamed: made.source.renamed, gone: [...made.source.renamed.keys()].filter((commit) => made.source.renamed.get(commit) !== commit), dropped: [...made.source.gone] },
      content: { before: before.content, after: made.contentHead },
      record: made.record,
      outcome: made.planned.outcome ?? {},
    };
  }
}
