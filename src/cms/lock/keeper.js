// The keeper of a tab's lock (ADR 0073): it holds the form the tab has open, and only that one, so
// that no other tab can save it; asks what to do where another tab holds it; turns the form
// read-only when it is taken over; and checks the lock before each save, each deletion and each
// restore of a deleted entry. What it knows it hands to `show(state)`, which draws it, and the forms
// other tabs hold to `mark(marks)`, which the list of entries marks them by.
//
// A state is { form, mode, ... }, `mode` one of:
//   none        no form is open, or a new entry, which has no lock to keep
//   checking    the service is asked for the form's lock, and the form is read-only until it answers
//   editing     the tab holds the form's lock
//   asking      another tab holds it, `holder`, and the Editor is asked what to do
//   reading     the Editor reads it read-only, while `holder` holds it, or no one, null
//   takenOver   `holder` took it over from this tab, which keeps its changes to read and copy
//   adminOnly   the form is an Admin's, and this Editor may only read it
//   fromFeed    the form is a post made from a feed, which only the feed changes, and everyone may
//               only read it (ADR 0079)
//   staleBackup the form shows a draft backup from `at`, which a later save makes unsaveable, or,
//               `takenOver`, the changes it held when it was taken over at `at`, set aside as the
//               tab took it back, which are never saved
//   shut        an Admin's purge waits, runs or is unfinished, as `purge` says, and no form opens
//               until it has ended (ADR 0078)
// A holder is { name, since, yours }, `yours` where it is the Editor's own other tab.
//
// `service`: as client.js gives it. Where it does not answer the keeper lets the Editor work on,
// since the check against the latest save still stops an old copy from overwriting a newer one.
// `purged(news)`: what the locks say of an Admin's purge, as purgeNews() tells it.

// The modes in which the tab holds the form's lock.
const HOLDING = new Set(['editing', 'staleBackup']);

const READ_ONLY = new Set(['checking', 'asking', 'reading', 'takenOver', 'adminOnly', 'fromFeed', 'staleBackup', 'shut']);

// The states of an Admin's purge in which the forms are shut (ADR 0078): until it has ended, and
// while it is unfinished, its source pushed and the rest not done.
const PURGING = new Set(['waiting', 'warning', 'running', 'unfinished']);

// The refusal of a change while an Admin's purge waits, is under way, or is unfinished, by how it
// stands, `purge`, which the service may not say.
const PURGE_REFUSALS = { waiting: 'lock.refusedPurgeWaiting', unfinished: 'lock.refusedPurgeUnfinished' };
const purgeRefused = (purge) => ({ name: PURGE_REFUSALS[purge] ?? 'lock.refusedPurge' });

// What the locks say of an Admin's purge to a tab, which keeps the purges it saw before they ended
// in `seen`: `warn`, the tab is to reload before it runs, as it has a form open; `shut`, it waits,
// runs or is unfinished, and no form opens; `reload`, one the tab saw coming is done, and what the
// tab read of the source may be gone; and `open`, none waits or runs.
export function purgeNews(purge, seen) {
  if (purge && PURGING.has(purge.state)) {
    seen.add(purge.id);
    return purge.reload ? 'warn' : 'shut';
  }
  if (purge?.state === 'done' && seen.has(purge.id)) return 'reload';
  return 'open';
}

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

export function lockKeeper({ service, show = () => {}, mark = () => {}, purged = () => {} }) {
  let state = { form: null, mode: 'none' };
  const purgesSeen = new Set();
  // Each opening, so that what an earlier one learns late changes nothing.
  let opening = 0;
  // Forms held for a deletion from the list or a restore, which the locks seen meanwhile leave
  // alone.
  const changing = new Set();
  // Settled once the service has answered the latest opening.
  let settled = Promise.resolve();
  // Forms whose hold is asked for and not yet answered, which the service may hold for the tab.
  const asked = new Map();
  const asking = async (form, options) => {
    asked.set(form, (asked.get(form) ?? 0) + 1);
    try {
      return await service.hold(form, options);
    } finally {
      if (asked.get(form) === 1) asked.delete(form);
      else asked.set(form, asked.get(form) - 1);
    }
  };
  // A draft backup that can no longer be saved, found while the service was asked: its moment.
  let staleAt = null;

  const become = (next) => {
    state = next;
    show(state);
  };
  const holderOf = ({ name, since, yours }) => ({ name, since, yours });
  const refusalOf = (holder) => ({ name: 'lock.refusedTakenOver', values: { name: holder.name, at: { moment: holder.since } } });

  // Why the service refused the tab a form's lock, `answer` as it answered a hold, as the form then
  // stands: { mode }, `adminOnly` or `fromFeed`; { mode: 'shut', purge }, while an Admin's purge
  // waits, runs or is unfinished; or { mode: 'held', holder }, where another tab holds it. Null
  // where the tab holds the lock, or the service did not answer.
  const refusedHold = (answer) => {
    if (answer === null || answer.held) return null;
    if (answer.adminOnly) return { mode: 'adminOnly' };
    if (answer.fromFeed) return { mode: 'fromFeed' };
    if (answer.shut) return { mode: 'shut', purge: answer.purge ?? null };
    return { mode: 'held', holder: holderOf(answer.holder) };
  };

  // What the service answers for `form` made the tab's state.
  const answered = (form, answer) => {
    const at = staleAt;
    staleAt = null;
    const why = refusedHold(answer);
    if (why === null) return become(at === null ? { form, mode: 'editing' } : { form, mode: 'staleBackup', at });
    return become(why.mode === 'held' ? { form, mode: 'asking', holder: why.holder } : { form, ...why });
  };

  return {
    state: () => state,
    readOnly: () => READ_ONLY.has(state.mode),
    // Once the service has answered for the form the tab has open, or given up.
    settled: () => settled,
    // The forms whose locks the page lets go as it is closed: the one the tab holds, each one held
    // for a deletion, and each one whose hold is not yet answered, which the service may hold for it
    // by now.
    toLetGo: () => [...new Set([...(HOLDING.has(state.mode) ? [state.form] : []), ...changing, ...asked.keys()])],

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
        // The form left goes as the next is asked for, whose answer waits for nothing of it.
        if (left.form !== null && HOLDING.has(left.mode)) void service.release(left.form);
        const answer = await asking(form);
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
      const answer = await asking(form, { takeOver: true });
      if (state.form !== form) return;
      if (mode === 'takenOver' && (answer === null || answer.held)) become({ form, mode: 'staleBackup', at: holder.since, takenOver: true });
      else answered(form, answer);
    },

    // The locks as the service says they stand, { version, locks, purge }.
    async seen({ locks, purge = null }) {
      const news = purgeNews(purge, purgesSeen);
      purged(news);
      // A form shut while a purge waited opens once it has ended otherwise, as when it was
      // stopped; one that is done loads the page again.
      if (state.mode === 'shut' && news === 'open') {
        const { form: shut } = state;
        state = { form: null, mode: 'none' };
        await this.open(shut);
      } else if (state.mode === 'shut' && news === 'shut' && purge.state !== state.purge) {
        become({ ...state, purge: purge.state });
      }
      const others = {};
      for (const lock of locks) if (!lock.mine) others[lock.form] = { name: lock.name, yours: lock.yours };
      mark(others);
      for (const lock of locks) {
        if (lock.mine && lock.form !== state.form && !changing.has(lock.form)) await service.release(lock.form);
      }
      const { form, mode } = state;
      if (form === null) return;
      const lock = locks.find((one) => one.form === form);
      if (mode === 'editing' || mode === 'staleBackup') {
        if (lock && !lock.mine) become({ form, mode: 'takenOver', holder: holderOf(lock) });
        else if (!lock) {
          const why = refusedHold(await asking(form));
          if (state.form === form && why?.mode === 'held') become({ form, mode: 'takenOver', holder: why.holder });
          else if (state.form === form && why?.mode === 'shut') become({ form, ...why });
        }
      } else if (mode === 'reading') {
        const holder = lock && !lock.mine ? holderOf(lock) : null;
        if (JSON.stringify(holder) !== JSON.stringify(state.holder)) become({ form, mode: 'reading', holder });
      }
    },

    // Null where nothing stops a change made outside a form, as a rule saved on the *Addresses not
    // found* page, else the refusal, by its name: while an Admin's purge waits, runs or is
    // unfinished, as the service says now, where it answers (ADR 0078).
    async purgeRefusal() {
      const answer = await service.locks?.(null);
      return PURGING.has(answer?.purge?.state) ? purgeRefused(answer.purge.state) : null;
    },

    // Null where the form may be saved, else the refusal, by its name and values. A new entry,
    // which has no lock to keep, is held only while an Admin's purge waits, runs or is unfinished.
    async beforeSave() {
      const { form, mode } = state;
      if (form === null) return this.purgeRefusal();
      if (mode === 'shut') return purgeRefused(state.purge);
      if (mode !== 'editing') return { name: 'lock.refusedReadOnly' };
      const why = refusedHold(await asking(form));
      if (why === null) return null;
      if (why.mode === 'held') {
        become({ form, mode: 'takenOver', holder: why.holder });
        return refusalOf(why.holder);
      }
      become({ form, ...why });
      return why.mode === 'shut' ? purgeRefused(why.purge) : { name: 'lock.refusedReadOnly' };
    },

    // Whether `forms` may be deleted: { refusal } where another tab holds one, else { done() },
    // called once the deletion is over, which lets go what was held for it alone.
    beforeDeleting(forms) {
      return this.holdFor(forms, { holder: 'lock.refusedDelete', yours: 'lock.refusedDeleteYours' });
    },

    // Whether a deleted entry's form may be restored (ADR 0077), as beforeDeleting() for a
    // deletion: what is held for it stays held where its form is open once it is done.
    beforeRestoring(form) {
      return this.holdFor([form], { holder: 'lock.refusedRestore', yours: 'lock.refusedRestoreYours' });
    },

    // Holds `forms` for a change made outside their form, a deletion's or a restore's, as the form
    // the tab has open holds its own: { refusal } where another tab holds one, by the names in
    // `refused`, else { done() }, called once the change is over, which lets go what was held for
    // it alone.
    async holdFor(forms, refused) {
      const held = [];
      const done = async () => {
        for (const form of held) {
          changing.delete(form);
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
        changing.add(form);
        const answer = await asking(form);
        if (answer?.held) held.push(form);
        else changing.delete(form);
        const why = refusedHold(answer);
        if (why !== null) {
          await done();
          if (why.mode === 'held') return { refusal: why.holder.yours ? { name: refused.yours } : { name: refused.holder, values: { name: why.holder.name } } };
          if (why.mode === 'shut') return { refusal: purgeRefused(why.purge) };
          return { refusal: { name: why.mode === 'fromFeed' ? 'lock.refusedFeed' : 'lock.refusedReadOnly' } };
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
