// An Admin's purge as the service keeps it (ADR 0078), in its memory beside the locks, since what
// it waits for is the tabs that hold them: from the moment it is asked for, no form may be opened;
// it waits for the forms open to close, or, run anyway, tells their tabs to reload, waits a moment
// for them, and lets go what they still hold; it then asks the purge's own program, in the folder
// the two share, and once that says the purge is done, or failed, opens the forms again, and every
// tab that saw it coming loads again, as what it read of the source may be gone. The addresses the
// entry had, which its program names once it is done, are handed to `onDone` and then kept no
// longer, also where the purge ended while the service was stopped.
//
// A purge is in one of these states:
//   waiting  for the forms open to close, `forms`
//   warning  the tabs that held a form, `tabs`, are told to reload, and are waited for a moment
//   running  the purge's program is asked, and is waited for
// and then done, or failed, with its `reason`, which is kept to tell until the next.

import { randomUUID } from 'node:crypto';

const COURSES = new Set(['anyway', 'wait']);
// How long the tabs told to reload are waited for, and how long the purge's program is.
const RELOAD_WITHIN = 20_000;
const ANSWERED_WITHIN = 30 * 60_000;

// `table`: the locks, as locks.js gives them. `control`: as build/record.js gives it.
// `onDone(addresses)`: what else is to forget once a purge is done, `addresses` those the entry
// had, as its program names them.
export function purgeKeeper({ table, control, now = () => new Date(), reloadWithin = RELOAD_WITHIN, answeredWithin = ANSWERED_WITHIN, onDone = () => {}, warn = console.error }) {
  let current = null;
  let last = null;

  const formsOpen = () => table.list().map(({ form, name, since }) => ({ form, name, since: since.toISOString() }));
  const become = (next) => {
    current = next;
    table.changed();
  };
  const run = () => {
    const { id, entry, by, at } = current;
    table.clear();
    control.askPurge({ id, path: entry.path, collection: entry.collection, kind: entry.kind, by, at });
    become({ ...current, state: 'running', since: now().getTime() });
  };
  // What a purge that is done, as its program said it, `said`, leaves to forget; the state it wrote
  // then names none of the entry's addresses.
  const forget = (said) => {
    try {
      onDone(Array.isArray(said.addresses) ? said.addresses.filter((one) => typeof one === 'string') : []);
    } catch (error) {
      warn(`What a purge leaves to forget could not be forgotten: ${error.message}`);
    }
    if (!Object.hasOwn(said, 'addresses')) return;
    try {
      const { addresses, ...rest } = said;
      control.writePurgeState(rest);
    } catch (error) {
      warn(`A purge's state could not be written without the addresses it named: ${error.message}`);
    }
  };
  const finish = (state) => {
    last = state.state === 'failed' ? { id: current.id, state: 'failed', reason: state.reason ?? 'broke' } : { id: current.id, state: 'done' };
    current = null;
    if (last.state === 'done') forget(state);
    table.open();
  };

  // A purge asked for before the service last started, which its program may be making still;
  // or one it made meanwhile, whose addresses are left to forget at the first step.
  const pending = control.purgeRequest();
  let ended = null;
  if (pending?.id) {
    current = { id: pending.id, entry: { path: pending.path, collection: pending.collection, kind: pending.kind }, by: pending.by, at: pending.at, state: 'running', since: now().getTime() };
    table.shut();
  } else {
    const said = control.purgeState();
    if (said?.state === 'done' && Object.hasOwn(said, 'addresses')) ended = said;
  }

  return {
    // Who has which form open: { form, name, since }.
    formsOpen,
    // What an Admin is told of the purge that runs, or the last that ended, or null.
    forAdmin() {
      if (current === null) return last;
      const { id, state, entry } = current;
      return { id, state, path: entry.path, forms: state === 'running' ? [] : formsOpen() };
    },
    // What a tab is told: { id, state, reload } of a purge that runs, `reload` where the tab is one
    // told to reload before it runs, or the last that ended.
    forTab(tab) {
      if (current === null) return last;
      return { id: current.id, state: current.state, reload: current.state === 'warning' && current.tabs.has(tab) };
    },

    // Starts the purge of `entry`, { path, collection, kind }, as `by`, { login, name }, by
    // `course`, `anyway` or `wait`: { purge } as an Admin is told of it, or { busy } where another
    // has not ended.
    start({ entry, by, course }) {
      if (!COURSES.has(course)) throw new Error(`no such course: ${course}`);
      if (current !== null) return { busy: true };
      table.shut();
      const held = table.list();
      current = {
        id: randomUUID(),
        entry,
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

    // Stops a purge that waits, which then opens the forms again; one that runs is not stopped.
    cancel() {
      if (current === null || current.state === 'running') return false;
      current = null;
      table.open();
      return true;
    },

    // Takes the purge on where it can go: once the forms are closed, or the tabs told to reload
    // have, or after a while; and once its program says it has ended.
    step() {
      if (ended !== null) {
        const said = ended;
        ended = null;
        forget(said);
      }
      if (current === null) return;
      const { state, since } = current;
      if (state === 'waiting' && table.list().length === 0) run();
      else if (state === 'warning') {
        const holding = new Set(table.list().map(({ tab }) => tab));
        if (![...current.tabs].some((tab) => holding.has(tab)) || now().getTime() - since >= reloadWithin) run();
      } else if (state === 'running') {
        const said = control.purgeState();
        if (said?.id === current.id && ['done', 'failed'].includes(said.state)) finish(said);
        else if (now().getTime() - since >= answeredWithin) finish({ state: 'failed', reason: 'unanswered' });
      }
    },
  };
}
