// A form's revisions (ADR 0074): each commit that changed its file, read from the source
// repository's history, newest first, with the file as that commit left it, and with the moment and
// the account of the push that brought it as Forgejo's feed recorded them. What a commit says of
// its author anyone who writes can make up, so it names no one (ADR 0008). Nothing is stored beside
// the history: what has been purged from it is in no revision. What the service learns of who
// pushed what it keeps in memory alone, since a commit's pusher never changes, and a restart learns
// it again from the feed. The same history, and the same pushes, give the deleted posts, terms and
// image library entries (deleted.js, ADR 0077). A save a purge rewrote was pushed anew by the
// instance's account, so the feed names the purge's push; the record of purges, which only that
// account writes, names the push that brought it as it was, and is read first (ADR 0078).

import { addPushers, eventsAfter } from '../build/pushers.js';
import { accountName, commitsFrom } from '../forgejo.js';
import { PURGES_BRANCH, PURGES_FILE, purgeRecord } from '../purge/record.js';
import { deletions } from './deleted.js';

// The feed is asked for this many events at a time.
const PAGE = 50;
// A form's revisions are shown this many at a time, newest first.
export const REVISIONS_AT_ONCE = 20;
// Forgejo records a push in the feed a moment after it, so the push of a commit made this lately is
// waited for, this long at most, looking again at each step.
const LATELY = 120_000;
const SETTLED = 10_000;
const STEP = 500;
// The record of purges is looked at again after this long at most.
const RECORD_HOLDS = 5000;

// A file in the source, as a form names it: a path below the repository's root, with no part that
// leads elsewhere.
export const isSourcePath = (path) => typeof path === 'string'
  && path.length > 0
  && path.length <= 512
  && !path.includes('\\')
  && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..');

const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');

// `token`: a credential that can read the source. `pushesToken`: one that can read who pushed each
// commit, the feed and a push's commits, which shows a private account's pushes only to the
// instance's account. `perPage`: how many revisions an answer holds.
export function sourceHistory({ forgejo, repository, token, pushesToken = token, get = fetch, perPage = REVISIONS_AT_ONCE, now = () => new Date(), sleep = (ms) => new Promise((go) => setTimeout(go, ms)) }) {
  const repo = `${forgejo}/api/v1/repos/${repository}`;
  const ask = async (path, credential = token) => {
    const answer = await get(`${repo}${path}`, { headers: { authorization: `token ${credential}` } });
    if (!answer.ok) throw Object.assign(new Error(`Forgejo answered ${answer.status} to ${path.split('?')[0]}`), { status: answer.status });
    return answer;
  };
  const LIST = 'stat=false&verification=false&files=false';

  // Each commit's push: { login, name, at }.
  const known = { last: 0, commits: {} };
  // A push whose commits Forgejo can no longer list, as one a purge took the head it started from
  // of, brought none the history still has.
  const commitsOf = async (after, before) => {
    try {
      return (await commitsFrom((path) => ask(path, pushesToken), after, before)).map(({ sha }) => sha);
    } catch {
      return [];
    }
  };
  const whom = ({ act_user: user, created }) => ({ login: user.login, name: accountName(user), at: created });
  // One look at the feed at a time, each from where the last left off.
  let learning = Promise.resolve();
  const learn = () => {
    learning = learning.catch(() => {}).then(async () => {
      const events = await eventsAfter(known.last, async (page) => (await ask(`/activities/feeds?limit=${PAGE}&page=${page}`, pushesToken)).json());
      await addPushers(known.commits, events, commitsOf, whom);
      known.last = Math.max(known.last, ...events.map(({ id }) => id));
    });
    return learning;
  };

  // The record of purges (ADR 0078), as its branch stands, looked at again after a moment.
  const record = { head: undefined, held: purgeRecord(null), at: -Infinity };
  const purges = async () => {
    if (now().getTime() - record.at < RECORD_HOLDS) return record.held;
    let head = null;
    try {
      head = (await (await ask(`/branches/${PURGES_BRANCH}`)).json())?.commit?.id ?? null;
    } catch (error) {
      if (error.status !== 404) throw error;
    }
    if (head !== record.head) {
      record.held = head === null ? purgeRecord(null) : purgeRecord(await textAt(PURGES_FILE, head));
      record.head = head;
    }
    record.at = now().getTime();
    return record.held;
  };

  // The file at a commit, or null where the commit removed it.
  const textAt = async (path, commit) => {
    try {
      return await (await ask(`/raw/${encodedPath(path)}?ref=${encodeURIComponent(commit)}`)).text();
    } catch (error) {
      if (error.status === 404) return null;
      throw error;
    }
  };

  // The moment and the account of each commit's push, { [sha]: { moment, account } }, `account`
  // { login, name } or null where the feed has no push of it, and `moment` the push's, else the
  // commit's own `date`: the feed learned first, unless `learnt` says it is, and a commit made
  // lately waited for a moment.
  const saved = async (commits, { learnt = false } = {}) => {
    if (!learnt) await learn();
    const { pushes: carried } = await purges();
    const awaited = () => commits.some(({ sha, date }) => !Object.hasOwn(known.commits, sha) && !Object.hasOwn(carried, sha) && now().getTime() - Date.parse(date ?? '') < LATELY);
    for (let waited = 0; waited < SETTLED && awaited(); waited += STEP) {
      await sleep(STEP);
      await learn();
    }
    return Object.fromEntries(commits.map(({ sha, date }) => {
      const push = Object.hasOwn(carried, sha) ? carried[sha] : known.commits[sha];
      return [sha, { moment: push?.at ?? date ?? null, account: push ? { login: push.login, name: push.name } : null }];
    }));
  };

  const removed = deletions({ ask: (path) => ask(path), textAt, saved });

  return {
    // A page of the revisions of the file at `path`, newest first: { revisions, more }, each
    // { commit, moment, account, text }, as saved() gives the moment and the account.
    async revisions(path, { page = 1 } = {}) {
      // Forgejo answers 404 for a file no commit of the branch holds, as one purged (ADR 0078).
      const [shown] = await Promise.all([
        ask(`/commits?path=${encodeURIComponent(path)}&limit=${perPage}&page=${page}&${LIST}`).then((answer) => answer.json(), (error) => {
          if (error.status === 404) return [];
          throw error;
        }),
        learn(),
      ]);
      const pushes = await saved(shown.map(({ sha, commit }) => ({ sha, date: commit?.committer?.date ?? commit?.author?.date ?? null })), { learnt: true });
      const revisions = await Promise.all(shown.map(async ({ sha }) => ({ commit: sha, ...pushes[sha], text: await textAt(path, sha) })));
      return { revisions, more: shown.length === perPage };
    },

    // A page of the deleted posts, terms and image library entries, newest deletion first, as
    // deleted.js lists them, with the moment and the account of the push that deleted each.
    deleted: ({ page = 1, collection = null, deletable }) => removed.list({ page, perPage, collection, deletable }),

    // The deleted entry at `path`, { path, collection, kind }, or null.
    deletedOne: (path, deletable) => removed.find(path, { deletable }),

    // The record of purges, { purges, pushes } (ADR 0078).
    purges,
    // Looks at the record of purges again at the next call, as after a purge.
    purgesChanged() {
      record.at = -Infinity;
    },
  };
}
