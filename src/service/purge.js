// An Admin's purge as the service keeps it (ADR 0078), in its memory beside the locks, since what
// it waits for is the tabs that hold them: from the moment it is asked for, no form may be opened;
// it waits for the forms open to close, or, run anyway, tells their tabs to reload, waits a moment
// for them, and lets go what they still hold; it then asks the purge's own program, in the folder
// the two share, and once that says the purge is done, or failed, opens the forms again, and every
// tab that saw it coming loads again, as what it read of the source may be gone. A purge whose
// program pushed the source and then stopped or broke is unfinished: the forms stay shut, also
// where the service starts again, until an Admin asks the program to finish it and it is done. A
// purge is of a deleted entry or of a passage; a passage is kept only until the program is asked,
// and no one is told it. What a purge that is done leaves to forget, whichever it was and whenever
// it ended, is handed to `onDone` once: the addresses a deleted entry had, which its program names
// and which are then kept no longer, and the rest, which a passage's purge leaves too. The search
// for a passage an Admin is shown first is asked of the program too, one at a time, and its answer
// taken as soon as it is read.
//
// A purge is in one of these states:
//   waiting     for the forms open to close, `forms`
//   warning     the tabs that held a form, `tabs`, are told to reload, and are waited for a moment
//   running     the purge's program is asked, and is waited for
//   unfinished  its program pushed the source, and then stopped or broke
// and then done, or failed, with its `reason`, which is kept to tell until the next.

import { randomUUID } from 'node:crypto';

const COURSES = new Set(['anyway', 'wait']);
// How long the tabs told to reload are waited for, and how long the purge's program is, for a
// purge and for a search, which is looked for this often.
const RELOAD_WITHIN = 20_000;
const ANSWERED_WITHIN = 30 * 60_000;
const SEARCH_WITHIN = 60_000;
const LOOK_EVERY = 250;

// `table`: the locks, as locks.js gives them. `control`: what the service shares with the purge's
// program, as purge/control.js gives it.
// `onDone(addresses)`: what else is to forget once a purge is done, `addresses` those the entry
// had, as its program names them, which, should it break, is said and leaves the purge done.
export function purgeKeeper({ table, control, now = () => new Date(), reloadWithin = RELOAD_WITHIN, answeredWithin = ANSWERED_WITHIN, searchWithin = SEARCH_WITHIN, lookEvery = LOOK_EVERY, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), onDone = () => {}, warn = console.error }) {
  let current = null;
  let last = null;
  // The search that waits for the program's answer, and those after it.
  let searching = Promise.resolve();
  let awaited = null;

  const formsOpen = () => table.list().map(({ form, name, since }) => ({ form, name, since: since.toISOString() }));
  const become = (next) => {
    current = next;
    table.changed();
  };
  // Whether the program's progress says the purge `id` pushed its source.
  const pushed = (id) => {
    const progress = control.progress();
    return progress?.id === id && progress.steps.includes('source');
  };
  // What a request of the program's names: the deleted entry, or null for a passage.
  const entryOf = (request) => (typeof request?.passage === 'string' ? null : { path: request?.path, collection: request?.collection, kind: request?.kind });
  const run = () => {
    const { id, entry, passage, by, at } = current;
    table.clear();
    control.askPurge(entry ? { id, path: entry.path, collection: entry.collection, kind: entry.kind, by, at } : { id, passage, by, at });
    become({ ...current, passage: null, state: 'running', since: now().getTime() });
  };
  // What a purge that is done, as its program said it, `said`, leaves to forget, once: the state it
  // wrote then says it is forgotten, and names none of the entry's addresses.
  const forget = (said) => {
    try {
      onDone(Array.isArray(said.addresses) ? said.addresses.filter((one) => typeof one === 'string') : []);
    } catch (error) {
      warn(`What a purge leaves to forget could not be forgotten: ${error.message}`);
    }
    try {
      const { addresses, ...rest } = said;
      control.writePurgeState({ ...rest, forgotten: true });
    } catch (error) {
      warn(`A purge's state could not be written as forgotten: ${error.message}`);
    }
  };
  const ended = (id, state) => (state.state === 'failed'
    ? { id, state: 'failed', reason: state.reason ?? 'broke', ...(Array.isArray(state.paths) ? { paths: state.paths } : {}) }
    : { id, state: 'done', ...(state.changed ? { changed: state.changed } : {}) });
  const finish = (state) => {
    last = ended(current.id, state);
    current = null;
    table.open();
  };
  const what = ({ entry }) => (entry ? { path: entry.path } : { passage: true });

  // A purge asked for before the service last started, which its program may be making still, or
  // one left unfinished, its request from what the program keeps of it.
  const pending = control.purgeRequest();
  const kept = control.progress();
  if (pending !== null) {
    const entry = entryOf(pending.finish === true && kept?.id === pending.id ? kept.request : pending);
    current = { id: pending.id, entry, passage: null, by: pending.by, at: pending.at, state: 'running', since: now().getTime() };
    table.shut();
  } else if (kept !== null && pushed(kept.id) && !(control.purgeState()?.id === kept.id && control.purgeState().state === 'done')) {
    current = { id: kept.id, entry: entryOf(kept.request), passage: null, state: 'unfinished' };
    table.shut();
  }

  // One search, asked of the program, and waited for: { found }, { failed } where it broke, or
  // { busy } where it did not answer in time, as while it purges.
  const searchOnce = async (passage) => {
    if (current?.state === 'running') return { busy: true };
    const id = randomUUID();
    awaited = id;
    try {
      control.takeSearchAnswer();
      control.askSearch({ id, passage });
      for (let waited = 0; ; waited += lookEvery) {
        const answer = control.searchAnswer();
        if (answer?.id === id) {
          control.takeSearchAnswer();
          return answer.failed ? { failed: true } : { found: answer.found };
        }
        if (waited >= searchWithin) {
          if (control.searchRequest()?.id === id) control.takeSearchRequest();
          return { busy: true };
        }
        await sleep(lookEvery);
      }
    } finally {
      awaited = null;
    }
  };

  return {
    // Who has which form open: { form, name, since }.
    formsOpen,
    // What an Admin is told of the purge that runs, `path` its entry's, or `passage` where it is
    // of one, which is not told; or of the last that ended, with what it `changed`, or why it
    // failed and, where a current file holds its passage, which `paths` do; or null.
    forAdmin() {
      if (current === null) return last;
      const { id, state } = current;
      return { id, state, ...what(current), forms: ['waiting', 'warning'].includes(state) ? formsOpen() : [] };
    },
    // What a tab is told: { id, state, reload } of a purge that runs, `reload` where the tab is one
    // told to reload before it runs, or { id, state } of the last that ended.
    forTab(tab) {
      if (current === null) return last && { id: last.id, state: last.state };
      return { id: current.id, state: current.state, reload: current.state === 'warning' && current.tabs.has(tab) };
    },

    // Starts the purge of `entry`, { path, collection, kind }, or of `passage`, as `by`, { login,
    // name }, by `course`, `anyway` or `wait`: { purge } as an Admin is told of it, or { busy }
    // where another has not ended.
    start({ entry = null, passage = null, by, course }) {
      if (!COURSES.has(course)) throw new Error(`no such course: ${course}`);
      if ((entry === null) === (passage === null)) throw new Error('a purge is of an entry or of a passage');
      if (current !== null) return { busy: true };
      table.shut();
      const held = table.list();
      current = {
        id: randomUUID(),
        entry,
        passage,
        by,
        at: now().toISOString(),
        state: course === 'wait' ? 'waiting' : 'warning',
        tabs: new Set(held.map(({ tab }) => tab)),
        since: now().getTime(),
      };
      table.changed();
      this.step();
      return { purge: this.forAdmin() };
    },

    // Stops a purge that waits, which then opens the forms again; one that runs, or is unfinished,
    // is not stopped.
    cancel() {
      if (current === null || !['waiting', 'warning'].includes(current.state)) return false;
      current = null;
      table.open();
      return true;
    },

    // Asks the purge's program to finish the purge that is unfinished, by its name: { purge } as an
    // Admin is told of it, or null where none is.
    finish() {
      if (current?.state !== 'unfinished') return null;
      control.askPurge({ id: current.id, finish: true });
      become({ ...current, state: 'running', since: now().getTime() });
      return { purge: this.forAdmin() };
    },

    // The files and revisions that hold `passage`, as the purge's program finds them, one search
    // at a time: { found }, { failed }, or { busy }.
    search(passage) {
      const asked = searching.then(() => searchOnce(passage));
      searching = asked.catch(() => {});
      return asked;
    },

    // Takes the purge on where it can go: once the forms are closed, or the tabs told to reload
    // have, or after a while; and once its program says it has ended, or is unfinished. What a
    // purge that is done leaves to forget is forgotten, whenever it ended: one the service gave up
    // on is told an Admin, as done after all. A purge whose program says nothing in time is given
    // up on, and its request taken back, so that the program does not make it with the forms open;
    // unless it pushed the source, which leaves it unfinished. An answer to a search no one waits
    // for any more is taken, as it holds the text around the passage.
    step() {
      const said = control.purgeState();
      if (said?.state === 'done' && said.forgotten !== true) {
        forget(said);
        if (current === null && last?.id === said.id) last = ended(said.id, said);
      }
      const stale = control.searchAnswer();
      if (stale !== null && stale.id !== awaited) control.takeSearchAnswer();
      if (current === null) return;
      const { id, state, since } = current;
      if (state === 'waiting' && table.list().length === 0) run();
      else if (state === 'warning') {
        const holding = new Set(table.list().map(({ tab }) => tab));
        if (![...current.tabs].some((tab) => holding.has(tab)) || now().getTime() - since >= reloadWithin) run();
      } else if (['running', 'unfinished'].includes(state) && said?.id === id && ['done', 'failed'].includes(said.state)) {
        finish(said);
      } else if (state === 'running' && said?.id === id && said.state === 'unfinished') {
        become({ ...current, state: 'unfinished' });
      } else if (state === 'running' && now().getTime() - since >= answeredWithin) {
        control.takePurgeRequest(id);
        if (pushed(id)) become({ ...current, state: 'unfinished' });
        else finish({ state: 'failed', reason: 'unanswered' });
      }
    },
  };
}
