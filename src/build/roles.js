// What the role check goes by, asked of Forgejo at each build: who the Admins and the Reviewers
// are, and who pushed each commit (ADR 0008). What it has learned of old commits it keeps, since
// a commit's pusher never changes, and it asks only for what has happened since.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { organisationTeams } from '../forgejo.js';
import { addPushers, eventsAfter } from './pushers.js';

const PAGE = 50;
// The organisation's teams of Admins and of Reviewers (ADR 0008).
export const ADMINS_TEAM = 'admins';
const REVIEWERS_TEAM = 'reviewers';

// `token`: a credential that may read the organisation's teams and every account's pushes.
// `instance`: the account the core itself pushes with, which counts as an Admin and is never a
// Reviewer. `folder`: where it keeps what it has learned. `settled`: how long it may wait for a new commit to show in the
// feed, which Forgejo writes a moment after the push.
export function forgejoRoles({ forgejo, repository, token, instance, folder, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), settled = 15_000, step = 500, get = fetch }) {
  const asked = async (path) => {
    const answer = await get(`${forgejo}/api/v1${path}`, { headers: { authorization: `token ${token}` } });
    if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} to ${path}`);
    return answer.json();
  };
  const known = join(folder, 'pushers-known.json');
  const organisation = repository.split('/')[0];

  const learn = async (held, commitsOf) => {
    const events = await eventsAfter(held.last, (page) => asked(`/repos/${repository}/activities/feeds?limit=${PAGE}&page=${page}`));
    await addPushers(held.commits, events, commitsOf);
    held.last = Math.max(held.last, ...events.map(({ id }) => id));
  };

  return {
    // Writes the lists of Admins and Reviewers and who pushed what where the intake reads them,
    // and gives those files. `awaited`: the commits that are new, for which it waits a moment. A
    // commit that never shows stays unknown, and so is no Admin's, and no Reviewer's either.
    async read({ source, awaited }) {
      mkdirSync(folder, { recursive: true });
      const held = existsSync(known) ? JSON.parse(readFileSync(known, 'utf8')) : { last: 0, commits: {} };
      await learn(held, source.commitsOf);
      for (let waited = 0; waited < settled && awaited.some((commit) => !Object.hasOwn(held.commits, commit)); waited += step) {
        await sleep(step);
        await learn(held, source.commitsOf);
      }
      writeFileSync(known, JSON.stringify(held));
      const files = { admins: join(folder, 'admins.json'), reviewers: join(folder, 'reviewers.json'), pushers: join(folder, 'pushers.json') };
      mkdirSync(dirname(files.admins), { recursive: true });
      const teams = organisationTeams({ forgejo, organisation, token, get });
      writeFileSync(files.admins, JSON.stringify([instance, ...await teams.members(ADMINS_TEAM)]));
      writeFileSync(files.reviewers, JSON.stringify((await teams.members(REVIEWERS_TEAM)).filter((login) => login !== instance)));
      writeFileSync(files.pushers, JSON.stringify(held.commits));
      return files;
    },
  };
}
