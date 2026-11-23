// The keeper of a tab's lock (ADR 0073): it holds the form the tab has open, and only that one, so
// that no other tab can save it; asks what to do where another tab holds it; turns the form
// read-only when it is taken over; and checks the lock before each save and each deletion. What it
// knows it hands to `show(state)`, which draws it, and the forms other tabs hold to `mark(marks)`,
// which the list of entries marks them by.
//
// A state is { form, mode, ... }, `mode` one of:
//   none        no form is open, or a new entry, which has no lock to keep
//   checking    the service is asked for the form's lock, and the form is read-only until it answers
//   editing     the tab holds the form's lock
//   asking      another tab holds it, `holder`, and the Editor is asked what to do
//   reading     the Editor reads it read-only, while `holder` holds it, or no one, null
//   takenOver   `holder` took it over from this tab, which keeps its changes to read and copy
//   adminOnly   the form is an Admin's, and this Editor may only read it
//   staleBackup the form shows a draft backup from `at`, which a later save makes unsaveable, or,
//               `takenOver`, the changes it held when it was taken over at `at`, set aside as the
//               tab took it back, which are never saved
// A holder is { name, since, yours }, `yours` where it is the Editor's own other tab.
//
// `service`: as client.js gives it. Where it does not answer the keeper lets the Editor work on,
// since the check against the latest save still stops an old copy from overwriting a newer one.

// The modes in which the tab holds the form's lock.
const HOLDING = new Set(['editing', 'staleBackup']);

const READ_ONLY = new Set(['checking', 'asking', 'reading', 'takenOver', 'adminOnly', 'staleBackup']);

// The form an address of the editor opens, `<collection>/<entry>`, or null for a new entry, a
// list and anything else.
export function formOf(hash) {
  const found = /^#\/collections\/([^/?]+)\/entries\/([^?]+)/.exec(hash ?? '');
  if (!found) return null;
  try {
    return `${decodeURIComponent(found[1])}/${decodeURIComponent(found[2])}`;
  } catch {
    return null;
  }
}

export function lockKeeper({ service, show = () => {}, mark = () => {} }) {
  let state = { form: null, mode: 'none' };
  // Each opening, so that what an earlier one learns late changes nothing.
  let opening = 0;
  // Forms held for a deletion from the list, which the locks seen meanwhile leave alone.
  const deleting = new Set();
  // Settled once the service has answered the latest opening.
  let settled = Promise.resolve();
  // A draft backup that can no longer be saved, found while the service was asked: its moment.
  let staleAt = null;

  const become = (next) => {
    state = next;
    show(state);
  };
  const holderOf = ({ name, since, yours }) => ({ name, since, yours });
  const refusalOf = (holder) => ({ name: 'lock.refusedTakenOver', values: { name: holder.name, at: { moment: holder.since } } });

  // What the service answers for `form` made the tab's state.
  const answered = (form, answer) => {
    const at = staleAt;
    staleAt = null;
    if ((answer === null || answer.held) && at !== null) return become({ form, mode: 'staleBackup', at });
    if (answer === null || answer.held) return become({ form, mode: 'editing' });
    if (answer.adminOnly) return become({ form, mode: 'adminOnly' });
    return become({ form, mode: 'asking', holder: holderOf(answer.holder) });
  };

  return {
    state: () => state,
    readOnly: () => READ_ONLY.has(state.mode),
    // Once the service has answered for the form the tab has open, or given up.
    settled: () => settled,
    // The form whose lock the tab holds, or is asking for, which the page lets go as it is closed.
    held: () => (state.mode === 'checking' || HOLDING.has(state.mode) ? state.form : null),

    // The tab now has `form` open, or none: the lock of the one it leaves goes, and the new one's is
    // asked for.
    async open(form) {
      if (form === state.form) return;
      const left = state;
      opening += 1;
      const mine = opening;
      if (form === null) {
        become({ form: null, mode: 'none' });
        if (left.form !== null && HOLDING.has(left.mode)) await service.release(left.form);
        return undefined;
      }
      staleAt = null;
      become({ form, mode: 'checking' });
      let answering;
      settled = new Promise((go) => {
        answering = go;
      });
      try {
        const releasing = left.form !== null && HOLDING.has(left.mode) ? service.release(left.form) : null;
        const answer = await service.hold(form);
        await releasing;
        if (mine !== opening) {
          if (answer?.held) await service.release(form);
          return undefined;
        }
        return answered(form, answer);
      } finally {
        answering();
      }
    },

    // The Editor chose to read the form another tab holds.
    read() {
      if (state.mode === 'asking') become({ ...state, mode: 'reading' });
    },

    // The Editor chose to take the form over, from the question or from the read-only state. A form
    // this tab had taken over from it comes back with the changes it held set aside, to read and
    // never to save, since the tab that took it may have saved since.
    async takeOver() {
      const { form, mode, holder } = state;
      if (form === null || !['asking', 'reading', 'takenOver'].includes(mode)) return;
      const answer = await service.hold(form, { takeOver: true });
      if (state.form !== form) return;
      if (mode === 'takenOver' && (answer === null || answer.held)) become({ form, mode: 'staleBackup', at: holder.since, takenOver: true });
      else answered(form, answer);
    },

    // The locks as the service says they stand, { version, locks }.
    async seen({ locks }) {
      const others = {};
      for (const lock of locks) if (!lock.mine) others[lock.form] = { name: lock.name, yours: lock.yours };
      mark(others);
      for (const lock of locks) {
        if (lock.mine && lock.form !== state.form && !deleting.has(lock.form)) await service.release(lock.form);
      }
      const { form, mode } = state;
      if (form === null) return;
      const lock = locks.find((one) => one.form === form);
      if (mode === 'editing' || mode === 'staleBackup') {
        if (lock && !lock.mine) become({ form, mode: 'takenOver', holder: holderOf(lock) });
        else if (!lock) {
          const answer = await service.hold(form);
          if (state.form === form && answer?.holder) become({ form, mode: 'takenOver', holder: holderOf(answer.holder) });
        }
      } else if (mode === 'reading') {
        const holder = lock && !lock.mine ? holderOf(lock) : null;
        if (JSON.stringify(holder) !== JSON.stringify(state.holder)) become({ form, mode: 'reading', holder });
      }
    },

    // Null where the form may be saved, else the refusal, by its name and values.
    async beforeSave() {
      const { form, mode } = state;
      if (form === null) return null;
      if (mode !== 'editing') return { name: 'lock.refusedReadOnly' };
      const answer = await service.hold(form);
      if (answer === null || answer.held) return null;
      if (answer.adminOnly) {
        become({ form, mode: 'adminOnly' });
        return { name: 'lock.refusedReadOnly' };
      }
      become({ form, mode: 'takenOver', holder: holderOf(answer.holder) });
      return refusalOf(answer.holder);
    },

    // Whether `forms` may be deleted: { refusal } where another tab holds one, else { done() },
    // called once the deletion is over, which lets go what was held for it alone.
    async beforeDeleting(forms) {
      const held = [];
      const done = async () => {
        for (const form of held) {
          deleting.delete(form);
          if (form !== state.form) await service.release(form);
        }
      };
      for (const form of forms) {
        if (form === state.form) {
          const refusal = await this.beforeSave();
          if (refusal) {
            await done();
            return { refusal };
          }
          continue;
        }
        deleting.add(form);
        const answer = await service.hold(form);
        if (answer?.held) held.push(form);
        else deleting.delete(form);
        if (answer?.holder || answer?.adminOnly) {
          await done();
          if (answer.adminOnly) return { refusal: { name: 'lock.refusedReadOnly' } };
          return { refusal: answer.holder.yours ? { name: 'lock.refusedDeleteYours' } : { name: 'lock.refusedDelete', values: { name: answer.holder.name } } };
        }
      }
      return { done };
    },

    // The form shows a draft backup from `at` that can no longer be saved, unless it is read-only
    // for its lock, and once the service has answered where it is asked.
    staleBackup(at) {
      if (state.form !== null && state.mode === 'editing') become({ form: state.form, mode: 'staleBackup', at });
      else if (state.mode === 'checking') staleAt = at;
    },

    // The form shows its latest save again, in place of a backup.
    latest() {
      if (state.mode === 'staleBackup') become({ form: state.form, mode: 'editing' });
    },
  };
}
