// What the preview's pane says to the service, with no React in it: one session, drafts sent
// after a pause, the newest alone, and what the pane should show, as one state (ADR 0032).

import { DRAFT_PATH, SESSION_PATH } from './paths.js';

// A pause in typing, not a pause in thought: long enough to skip the keys between words.
const PAUSE = 500;

// `origin`: the preview's. `credential()`: the editor's own, for Forgejo. `changed(state)`:
// { phase, address, refusals }, where `phase` is `starting`, `shown` or `off`.
export function previewClient({ origin, credential, changed, send = (...args) => fetch(...args), pause = PAUSE, later = setTimeout, cancel = clearTimeout }) {
  let state = { phase: 'starting', address: null, refusals: [] };
  let session = null;
  let timer = null;
  let waiting = null;
  let sending = false;
  let closed = false;

  const become = (next) => {
    state = { ...state, ...next };
    if (!closed) changed(state);
  };

  const open = () => {
    session ??= (async () => {
      const given = credential();
      if (!given) throw new Error('no credential');
      const answer = await send(`${origin}${SESSION_PATH}`, { method: 'POST', credentials: 'include', headers: { authorization: given } });
      if (!answer.ok) throw new Error(`the session: ${answer.status}`);
    })().catch((error) => {
      session = null;
      throw error;
    });
    return session;
  };

  const post = (draft) => send(`${origin}${DRAFT_PATH}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft) });

  const flush = async () => {
    if (sending || waiting === null || closed) return;
    const making = waiting;
    waiting = null;
    sending = true;
    try {
      const draft = await making();
      await open();
      let answer = await post(draft);
      // A session lasts an hour, and an editor can stay longer.
      if (answer.status === 401) {
        session = null;
        await open();
        answer = await post(draft);
      }
      if (!answer.ok) throw new Error(`the draft: ${answer.status}`);
      const { address, refusals } = await answer.json();
      if (!Array.isArray(refusals)) throw new Error('the draft: no answer to read');
      become({ phase: 'shown', address: address ?? state.address, refusals });
    } catch (error) {
      console.warn(`The preview: ${error.message}`);
      become({ phase: 'off' });
    } finally {
      sending = false;
      if (waiting !== null) flush();
    }
  };

  return {
    state: () => state,

    // A new draft: a function that gives it, since an unsaved image takes reading.
    update(making) {
      waiting = making;
      cancel(timer);
      timer = later(flush, pause);
    },

    close() {
      closed = true;
      cancel(timer);
    },
  };
}
