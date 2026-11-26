// A purge in the site's Forgejo (ADR 0078), by the instance's account, which alone may rewrite the
// source repository's history, write the record of purges and have Forgejo let go of what no ref
// reaches any more (ADR 0007): both repositories cloned anew, rewritten and pushed, without a
// deleted entry (entry.js) or a passage (passage.js); then Forgejo's own collection of what is
// unreachable, until no commit that is gone answers, and of the LFS objects no commit names, until
// none that went answers; and the archives Forgejo keeps of a repository's files, which may hold
// what went, removed. And the search for a passage an Admin is shown before its purge, in the
// source cloned anew. Nothing of the clones stays.

import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { addPushers, eventsAfter } from '../build/pushers.js';
import { accountName, gitEnvironment } from '../forgejo.js';
import { purgeEntry } from './entry.js';
import { findPassage, passageMatcher, purgePassage } from './passage.js';
import { gitIn } from './rewrite.js';

const PAGE = 50;
// How long Forgejo is given to let go of what a purge made unreachable, and how often it is asked
// again. An LFS object is let go only a minute after it came, which compose.yaml sets, so that an
// upload whose commit is on its way is never taken.
const LET_GO_WITHIN = 5 * 60_000;
const ASK_AGAIN = 15_000;
const LOOK = 2000;
// Of the commits that went, Forgejo is asked about this many at most each time.
const MOST_LOOKED_AT = 20;

// `forgejo`: its peer address. `repository`: the source's, `<organisation>/source`. `token`: the
// instance's account's, which may write every repository and run Forgejo's own tasks. `work`: a
// folder of the program's own. `control`: as build/record.js gives it, whose build log loses each
// line that names what went.
export function forgejoPurge({ forgejo, repository, token, work, control = null, user = 'konzilo', get = fetch, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), now = Date.now }) {
  const organisation = repository.split('/')[0];
  const contentRepository = `${organisation}/content`;
  const api = async (method, path, { allow = [] } = {}) => {
    const answer = await get(`${forgejo}/api/v1${path}`, { method, headers: { authorization: `token ${token}` } });
    if (!answer.ok && !allow.includes(answer.status)) throw new Error(`Forgejo answered ${answer.status} to ${method} ${path.split('?')[0]}`);
    return answer;
  };
  const task = (name) => api('POST', `/admin/cron/${name}`);
  // Whether Forgejo still holds a commit.
  const holds = async (of, commit) => {
    const answer = await api('GET', `/repos/${of}/git/commits/${commit}?stat=false&verification=false&files=false`, { allow: [404, 422] });
    await answer.arrayBuffer();
    return answer.ok;
  };
  // Whether Forgejo still holds an LFS object, as its batch API says to whoever may read it.
  const holdsObject = async (oid) => {
    const answer = await get(`${forgejo}/${repository}.git/info/lfs/objects/batch`, {
      method: 'POST',
      headers: { authorization: `Basic ${Buffer.from(`${user}:${token}`).toString('base64')}`, accept: 'application/vnd.git-lfs+json', 'content-type': 'application/vnd.git-lfs+json' },
      body: JSON.stringify({ operation: 'download', transfers: ['basic'], objects: [{ oid, size: 1 }] }),
    });
    if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} about an LFS object`);
    const [object] = (await answer.json()).objects ?? [];
    return !object?.error;
  };
  // Runs a task of Forgejo's own until `left()` gives nothing, asking it again now and then, as
  // it runs in the background and a call while it runs is let go.
  const until = async (name, left) => {
    const deadline = now() + LET_GO_WITHIN;
    let asked = -Infinity;
    for (;;) {
      if ((await left()).length === 0) return;
      if (now() > deadline) throw new Error(`Forgejo's ${name} left what the purge took`);
      if (now() - asked >= ASK_AGAIN) {
        await task(name);
        asked = now();
      }
      await sleep(LOOK);
    }
  };
  const filter = async (list, test) => (await Promise.all(list.map(async (one) => [one, await test(one)]))).filter(([, kept]) => kept).map(([one]) => one);

  return async (request) => {
    const folder = join(work, request.id);
    rmSync(folder, { recursive: true, force: true });
    const home = join(folder, 'home');
    mkdirSync(home, { recursive: true });
    const environment = gitEnvironment({ user, token, home });
    const cloneOf = async (name, of) => {
      const at = join(folder, `${name}.git`);
      mkdirSync(at);
      const git = gitIn(at, environment);
      await git(['init', '--quiet', '--bare', '--initial-branch=main']);
      await git(['remote', 'add', 'origin', `${forgejo}/${of}.git`]);
      return { git };
    };
    try {
      const source = await cloneOf('source', repository);
      const content = await cloneOf('content', contentRepository);
      // Who pushed each commit, as the feed recorded it, read with the source as it was.
      const pushedBy = async (commits) => {
        const events = await eventsAfter(0, async (page) => (await api('GET', `/repos/${repository}/activities/feeds?limit=${PAGE}&page=${page}`)).json());
        const known = {};
        const commitsOf = async (after, before) => {
          try {
            return (await source.git(['rev-list', after, ...(before ? [`^${before}`] : [])])).toString('utf8').split('\n').filter(Boolean);
          } catch {
            return [];
          }
        };
        await addPushers(known, events, commitsOf, ({ act_user: account, created }) => ({ login: account.login, name: accountName(account), at: created }));
        return Object.fromEntries(commits.filter((commit) => Object.hasOwn(known, commit)).map((commit) => [commit, known[commit]]));
      };
      const passage = typeof request.passage === 'string' ? request.passage : null;
      const result = passage === null
        ? await purgeEntry({ source, content, entry: request, by: request.by, at: request.at, pushedBy })
        : await purgePassage({ source, content, passage, by: request.by, at: request.at, pushedBy });

      // What went, let go by Forgejo: the commits that are no more, of both repositories, by the
      // heads that were and the saves that held nothing else, and the LFS objects no commit names
      // now.
      const gone = [
        ...[...new Set([...(result.source.after !== result.source.before ? [result.source.before] : []), ...result.source.dropped])].slice(0, MOST_LOOKED_AT).map((commit) => [repository, commit]),
        ...(result.content.after !== null && result.content.after !== result.content.before ? [[contentRepository, result.content.before]] : []),
      ];
      await until('git_gc_repos', () => filter(gone, ([of, commit]) => holds(of, commit)));
      if (result.originals?.length > 0) await until('gc_lfs', () => filter(result.originals, holdsObject));
      await task('delete_repo_archives').catch(() => {});
      if (passage === null) control?.scrubLog((line) => result.paths.some((path) => line.includes(path)));
      else control?.scrubLog(passageMatcher(passage).holds);
      return result;
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  };
}

// The search for a passage in the site's Forgejo (ADR 0078): the source cloned anew, by the
// instance's account, and every file and revision that holds the passage found in it
// (passage.js); nothing of the clone stays. `forgejo`, `repository`, `token` and `work` as
// forgejoPurge() takes them.
export function forgejoSearch({ forgejo, repository, token, work, user = 'konzilo' }) {
  return async (request) => {
    if (!/^[0-9a-z-]{1,64}$/.test(request.id)) throw new Error('the search has no name the program takes');
    const folder = join(work, `search-${request.id}`);
    rmSync(folder, { recursive: true, force: true });
    const home = join(folder, 'home');
    mkdirSync(home, { recursive: true });
    try {
      const git = gitIn(folder, gitEnvironment({ user, token, home }));
      await git(['init', '--quiet', '--bare', '--initial-branch=main']);
      await git(['fetch', '--quiet', `${forgejo}/${repository}.git`, '+refs/heads/main:refs/heads/main']);
      return await findPassage({ git, passage: request.passage });
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  };
}
