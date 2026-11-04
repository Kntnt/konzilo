// What the role check goes by, asked of Forgejo at each build: who the Admins are, and who
// pushed each commit (ADR 0008). What it has learned of old commits it keeps, since a commit's
// pusher never changes, and it asks only for what has happened since.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { addPushers, eventsAfter } from './pushers.js';

const PAGE = 50;
const ADMINS_TEAM = 'admins';

// `token`: a credential that may read the organisation's teams and every account's pushes.
// `instance`: the account the core itself pushes with, which counts as an Admin. `folder`: where
// it keeps what it has learned. `settled`: how long it may wait for a new commit to show in the
// feed, which Forgejo writes a moment after the push.
export function forgejoRoles({ forgejo, repository, token, instance, folder, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), settled = 15_000, step = 500, get = fetch }) {
  const asked = async (path) => {
    const answer = await get(`${forgejo}/api/v1${path}`, { headers: { authorization: `token ${token}` } });
    if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} to ${path}`);
    return answer.json();
  };
  const known = join(folder, 'pushers-known.json');
  const organisation = repository.split('/')[0];

  const admins = async () => {
    const teams = await asked(`/orgs/${organisation}/teams?limit=${PAGE}`);
    const team = teams.find(({ name }) => name === ADMINS_TEAM);
    const logins = [instance];
    for (let page = 1; team; page += 1) {
      const members = await asked(`/teams/${team.id}/members?limit=${PAGE}&page=${page}`);
      logins.push(...members.map(({ login }) => login));
      if (members.length < PAGE) break;
    }
    return logins;
  };

  const learn = async (held, commitsOf) => {
    const events = await eventsAfter(held.last, (page) => asked(`/repos/${repository}/activities/feeds?limit=${PAGE}&page=${page}`));
    await addPushers(held.commits, events, commitsOf);
    held.last = Math.max(held.last, ...events.map(({ id }) => id));
  };

  return {
    // Writes the list of Admins and who pushed what where the intake reads them, and gives
    // those files. `awaited`: the commits that are new, for which it waits a moment. A commit
    // that never shows stays unknown, and so is no Admin's.
    async read({ source, awaited }) {
      mkdirSync(folder, { recursive: true });
      const held = existsSync(known) ? JSON.parse(readFileSync(known, 'utf8')) : { last: 0, commits: {} };
      await learn(held, source.commitsOf);
      for (let waited = 0; waited < settled && awaited.some((commit) => !Object.hasOwn(held.commits, commit)); waited += step) {
        await sleep(step);
        await learn(held, source.commitsOf);
      }
      writeFileSync(known, JSON.stringify(held));
      const files = { admins: join(folder, 'admins.json'), pushers: join(folder, 'pushers.json') };
      mkdirSync(dirname(files.admins), { recursive: true });
      writeFileSync(files.admins, JSON.stringify(await admins()));
      writeFileSync(files.pushers, JSON.stringify(held.commits));
      return files;
    },
  };
}
