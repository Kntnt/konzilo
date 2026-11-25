// What the *Deleted* page asks of the service about an Admin's purge (ADR 0078), with what Sveltia
// signed in with: how a purge stands, to an Admin alone; a purge of a deleted entry, by its path
// and the course chosen for the forms others have open, `anyway` or `wait`; and one that waits
// stopped. It holds no React.

import { askSignedIn, fetching } from '../service.js';

const PURGE = '/_konzilo/purge';

const json = async (answer) => {
  try {
    return await answer.json();
  } catch {
    return {};
  }
};

export function purgeService({ credential, ask = fetching() }) {
  const asked = (init = {}) => askSignedIn(PURGE, init, { credential, ask });
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
    async start(path, course) {
      const answer = await asked({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, course }) });
      if (answer === null) throw new Error('nobody is signed in');
      if (answer.status === 202) return { purge: (await json(answer)).purge };
      if (answer.status === 409) return { busy: true, purge: (await json(answer)).purge };
      if (answer.status === 404) return { gone: true };
      throw new Error(`the service answered ${answer.status}`);
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
