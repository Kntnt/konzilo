// What the *Deleted* page and the *Purge a passage* page ask of the service about an Admin's purge
// (ADR 0078), with what Sveltia signed in with: how a purge stands, to an Admin alone; a purge of a
// deleted entry, by its path, or of a passage, and the course chosen for the forms others have
// open, `anyway` or `wait`; one that waits stopped; and the search for a passage, which goes in
// the request's body. It holds no React.

import { askSignedIn, fetching } from '../service.js';

const PURGE = '/_konzilo/purge';
const SEARCH = '/_konzilo/purge/search';

const json = async (answer) => {
  try {
    return await answer.json();
  } catch {
    return {};
  }
};

export function purgeService({ credential, ask = fetching() }) {
  const asked = (init = {}, address = PURGE) => askSignedIn(address, init, { credential, ask });
  const posted = (body, address) => asked({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, address);
  const started = async (body) => {
    const answer = await posted(body);
    if (answer === null) throw new Error('nobody is signed in');
    if (answer.status === 202) return { purge: (await json(answer)).purge };
    if (answer.status === 409) return { busy: true, purge: (await json(answer)).purge };
    if (answer.status === 404) return { gone: true };
    throw new Error(`the service answered ${answer.status}`);
  };
  return {
    // { admin: true, purge, purges, open } to an Admin, { admin: false } to anyone else who may
    // write, or null where the service cannot be asked or answers otherwise.
    async status() {
      try {
        const answer = await asked();
        if (answer === null) return null;
        if (answer.status === 403) return { admin: false };
        if (!answer.ok) return null;
        const { purge = null, purges = [], open = [] } = await json(answer);
        return { admin: true, purge, purges, open };
      } catch {
        return null;
      }
    },
    // Asks for the purge of the entry at `path`: { purge } as it starts, { busy, purge } where
    // another has not ended, { gone } where the entry is no longer one the page lists. Throws where
    // the service cannot be asked or answers otherwise.
    start: (path, course) => started({ path, course }),
    // Asks for the purge of `passage` from every old revision: as start() answers.
    startPassage: (passage, course) => started({ passage, course }),
    // Every file and revision that holds `passage`: { found }, as the purge's program finds them,
    // { refused } where the passage is too short or too long, { busy } where the service could
    // not ask in time, as while a purge runs, or null where it cannot be asked or broke.
    async search(passage) {
      try {
        const answer = await posted({ passage }, SEARCH);
        if (answer?.status === 200) return { found: (await json(answer)).found };
        if (answer?.status === 400) return { refused: true };
        if (answer?.status === 503) return { busy: true };
        return null;
      } catch {
        return null;
      }
    },
    // Stops a purge that waits: whether it did.
    async stop() {
      try {
        const answer = await asked({ method: 'DELETE' });
        return answer?.ok === true;
      } catch {
        return false;
      }
    },
  };
}
