// What the preview's pane says to the service, with no React in it: one session, drafts sent
// after a pause, the newest alone, and what the pane should show, as one state (ADR 0032).

import { DRAFT_PATH, SESSION_PATH, WHERE_PATH } from './paths.js';

// A pause in typing, not a pause in thought: long enough to skip the keys between words.
const PAUSE = 500;
// Long enough to read, and gone without anyone having to do anything about it.
const STOPPED_FOR = 8000;
const LONGEST_ADDRESS = 4096;
// How a page tried to leave, as the guard in the page says it. Only `history` has no address.
const WAYS = new Set(['link', 'window', 'form', 'script', 'history']);

// `origin`: the preview's. `credential()`: the editor's own, for Forgejo. `changed(state)`:
// { phase, address, refusals, leads, stopped }, where `phase` is `starting`, `shown` or `off`;
// `address` is the page the frame may show, which is never one that redirects; `leads` says
// where the draft's own address leads when it does: { address, status, to, loop }; `stopped`
// says what the page last tried to load instead: { to, how, where }, as the gate's answer.
export function previewClient({ origin, credential, changed, send = (...args) => fetch(...args), pause = PAUSE, later = setTimeout, cancel = clearTimeout }) {
  let state = { phase: 'starting', address: null, refusals: [], leads: null, stopped: null };
  let session = null;
  // The last address looked at. It is looked at once, since each look renders a page and a
  // redirect there changes only with its rules, so nothing here can go round.
  let looked = { address: null, where: null };
  let stoppedTimer = null;
  let stoppedTurn = 0;
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

  const whereFrom = async (path) => {
    try {
      const answer = await send(`${origin}${WHERE_PATH}?to=${encodeURIComponent(path)}`, { credentials: 'include' });
      return answer.ok ? await answer.json() : null;
    } catch {
      return null;
    }
  };

  // What the frame is to show now that a draft has this address, and what to say of it. When
  // nobody can tell, the page is shown, since the gate keeps a frame from following anything.
  const showing = async (address) => {
    if (address === null || address === undefined) return { address: state.address, leads: null };
    if (looked.address !== address) looked = { address, where: await whereFrom(address) };
    const { where } = looked;
    if (!where?.redirect && !where?.loop) return { address, leads: null };
    return { address: state.address, leads: { address, status: where.redirect?.status ?? null, to: where.redirect?.to ?? null, loop: where.loop === true } };
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
      become({ phase: 'shown', refusals, ...await showing(address) });
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

    // A page in the frame was kept from leaving, as its guard says. Whatever the page says
    // beyond what is asked for here is not read, and this does nothing but say it.
    stopped(told) {
      const { to, how } = told ?? {};
      if (!WAYS.has(how) || typeof to !== 'string' || to.length > LONGEST_ADDRESS) return;
      if (how !== 'history' && !URL.canParse(to)) return;
      const url = how === 'history' ? null : new URL(to);
      const here = url?.origin === origin;
      stoppedTurn += 1;
      const turn = stoppedTurn;
      const stopped = { to: here ? `${url.pathname}${url.search}${url.hash}` : to, how, where: null };
      become({ stopped });
      cancel(stoppedTimer);
      stoppedTimer = later(() => become({ stopped: null }), STOPPED_FOR);
      // What a form is sent to only takes what is sent, and has nothing to say to a look.
      if (!here || how === 'form') return;
      whereFrom(`${url.pathname}${url.search}`).then((where) => {
        if (turn === stoppedTurn && state.stopped !== null) become({ stopped: { ...stopped, where } });
      });
    },

    close() {
      closed = true;
      cancel(timer);
      cancel(stoppedTimer);
    },
  };
}
