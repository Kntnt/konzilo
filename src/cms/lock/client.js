// What a tab asks of the service about the locks of the editor's forms (ADR 0073), by the name it
// gives itself as it loads, `tab`, with what Sveltia signed in with.
//
// Gives { hold(form, { takeOver }), release(form), end(), locks(after, signal), watch(seen) }:
// `hold` gives { held: true, since }, { holder: { name, since, yours } }, { adminOnly: true },
// { shut: true } while an Admin's purge waits or runs (ADR 0078), or null where the service cannot be asked, does not answer within `answersWithin` milliseconds, or
// answers otherwise; `release` lets the form go, by a call that outlives the page, so that a form
// left just before the page is, or as it is, goes too; `end` ends the tab as its page is closed,
// by such a call, after which the service lets go every form it holds and holds none for it, a
// hold still on its way among them; `locks` gives { version, locks } once they differ from
// `after`, or null; `watch` asks for them again and again, for as long as the page is open, and
// hands each answer to `seen`, waiting a while after an answer it cannot read.

import { askSignedIn } from '../service.js';

const LOCKS = '/_konzilo/locks';
// A form stays read-only until the service answers for its lock, at most this long.
const ANSWERS_WITHIN = 10_000;

// A name for this tab, new at each load, so that a tab copied with its session is another tab.
export const newTab = () => globalThis.crypto.randomUUID();

export function lockClient({ tab, credential, ask = (...args) => globalThis.fetch(...args), pause = (ms) => new Promise((go) => setTimeout(go, ms)), answersWithin = ANSWERS_WITHIN }) {
  const call = async (method, path, query = {}, init = {}) => {
    const address = `${path}?${new URLSearchParams({ tab, ...query })}`;
    try {
      // A hold is given up on after a while; the call for the locks waits as long as the service
      // holds it, and a release outlives the page, untimed.
      const signal = method === 'PUT' ? AbortSignal.timeout(answersWithin) : undefined;
      return await askSignedIn(address, { method, ...(signal ? { signal } : {}), ...init }, { credential, ask });
    } catch {
      return null;
    }
  };
  const lockOf = (form) => `${LOCKS}/${encodeURIComponent(form)}`;
  const json = async (answer) => {
    try {
      return await answer.json();
    } catch {
      return null;
    }
  };

  const client = {
    async hold(form, { takeOver = false } = {}) {
      const answer = await call('PUT', lockOf(form), takeOver ? { takeOver: 'true' } : {});
      if (answer === null) return null;
      if (answer.status === 200) return { held: true, since: (await json(answer))?.since ?? null };
      if (answer.status === 409) {
        const holder = (await json(answer))?.holder;
        return holder ? { holder: { name: holder.name, since: holder.since, yours: holder.yours === true } } : null;
      }
      if (answer.status === 403) return { adminOnly: true };
      if (answer.status === 423) return { shut: true };
      return null;
    },
    async release(form) {
      await call('DELETE', lockOf(form), {}, { keepalive: true });
    },
    async end() {
      await call('DELETE', LOCKS, {}, { keepalive: true });
    },
    async locks(after, signal) {
      const answer = await call('GET', LOCKS, after === null ? {} : { after: String(after) }, signal ? { signal } : {});
      if (answer?.status !== 200) return null;
      const read = await json(answer);
      return Array.isArray(read?.locks) ? read : null;
    },
    async watch(seen) {
      let after = null;
      for (;;) {
        const answer = await client.locks(after);
        if (answer === null) {
          await pause(5000);
          continue;
        }
        after = answer.version;
        await seen(answer);
      }
    },
  };
  return client;
}
