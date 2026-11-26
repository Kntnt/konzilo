// An Admin's purge (ADR 0078), of a deleted entry on the *Deleted* page or of a passage on the
// *Purge a passage* page, in steps, each of which says that it is meant and that there is no way
// back, and that backups keep what is purged until they expire: first that it is meant, then the
// entry's name, or the passage, written to confirm it, then, where others have forms open, who has
// which, and whether to run anyway, their tabs loading again, or to wait for them, while nobody may
// open a form; then how it stands until it has ended. Every tab that saw it coming loads again
// once it is done, this one too (lock/register.js), which then says what was purged. It is React,
// since that is what Sveltia takes, in the browser's own dialog.

import { say } from '../interface-language.js';
import { momentValue, wordsShown } from '../refusals.js';
import { IMAGE_LIBRARY_FOLDER } from '../../format/masters.js';
import { fetchedEntry } from './client.js';

const react = () => globalThis.__SVELTIA_CMS_REACT__;
// How often a purge that waits or runs is looked at again.
const LOOK = 2000;
// What this tab purged, said once after it loads again.
const PURGED_KEY = 'konzilo-purged';

// The purge this tab asked for, { id, title }, kept in the tab's storage from the moment it starts,
// since every tab that saw it coming loads again once it is done (lock/register.js), before this
// page may have seen it done.
const asked = (purge, title) => {
  try {
    globalThis.sessionStorage?.setItem(PURGED_KEY, JSON.stringify({ id: purge.id, title }));
  } catch { /* Nothing said after the page loads again, then. */ }
};

// What this tab purged before it loaded again, by `purge`, the last purge as the service tells it
// to an Admin: its entry's name, where it is the purge this tab asked for and is done, else null.
// What the tab kept goes once that purge has ended, and is said for as long as the page is open.
let purgedLast;
export function purgedBefore(purge) {
  if (purgedLast !== undefined) return purgedLast;
  let kept = null;
  try {
    kept = JSON.parse(globalThis.sessionStorage?.getItem(PURGED_KEY) ?? 'null');
  } catch {
    kept = null;
  }
  if (kept === null || purge?.id !== kept.id) return null;
  if (!['done', 'failed'].includes(purge.state)) return null;
  try {
    globalThis.sessionStorage?.removeItem(PURGED_KEY);
  } catch { /* Said once all the same. */ }
  purgedLast = purge.state === 'done' ? kept.title : null;
  return purgedLast;
}

// A form another tab has open, as an Admin reads it: its type and the name of its entry.
function formShown({ form, name, since }, collectionOf) {
  const [collection, ...rest] = form.split('/');
  const id = rest.join('/');
  const title = fetchedEntry(id)?.title ?? id;
  return wordsShown({ name: 'deleted.purgeFormOpen', values: { name, collection: collectionOf(collection)?.label ?? collection, title, since: momentValue(since) } });
}

// Why a purge of an entry was not made, in words.
const FAILED = { 'not-deleted': 'deleted.purgeFailed-not-deleted', 'not-found': 'deleted.purgeFailed-not-found', unanswered: 'deleted.purgeFailed-unanswered', unfinished: 'deleted.purgeFailed-unfinished' };
const failedWords = (reason) => say(FAILED[reason] ?? 'deleted.purgeFailed-broke');

// A deleted entry as the dialog purges it, `row` as the *Deleted* page lists it: what it is
// called, what goes, and how it is confirmed and asked for, kept for the page from the moment it
// starts.
function entrySubject(row, service, collectionOf) {
  const { title } = row;
  const values = { title, collection: collectionOf(row.collection)?.label ?? row.collection };
  return {
    heading: wordsShown({ name: 'deleted.purgeTitle', values }),
    during: wordsShown({ name: 'deleted.purgeOf', values }),
    what: say(row.collection === IMAGE_LIBRARY_FOLDER ? 'deleted.purgeWhatImage' : 'deleted.purgeWhat'),
    noWayBack: say('deleted.purgeNoWayBack'),
    write: wordsShown({ name: 'deleted.purgeWrite', values: { title } }),
    matches: (written) => written.trim() === title.trim(),
    start: async (course) => {
      const answer = await service.start(row.path, course);
      if (answer.purge?.id && !answer.busy) asked(answer.purge, title);
      return answer;
    },
    failed: (purge) => failedWords(purge?.reason),
    doneWords: say('deleted.purgeDone'),
  };
}

// A purge that is unfinished as the dialog finishes it: it was confirmed as it was asked for, and
// what it is the service does not tell.
const unfinishedSubject = () => ({ heading: say('deleted.purgeFinishTitle'), during: say('deleted.purgeFinishTitle'), failed: (purge) => failedWords(purge?.reason), doneWords: say('deleted.purgeDone') });

// `subject`: what is purged, as the dialog says it, { heading, during, what, noWayBack, write,
// doneWords }, its words, `matches(written)`, whether what is written confirms it, `start(course)`,
// which asks for it as purge.js answers and keeps what the page says of it once it loads again,
// `failed(purge)`, why it was not made, in words, and `failedFiles(purge)`, where it has one, the
// files a refusal names, drawn; or `row`, the entry, as the *Deleted* page
// lists it, which it is made from. `started`: a purge asked for already, as the service tells it,
// whose progress alone it shows. `service`: as purge.js gives it. `onClose()`: closes it.
export function PurgeDialog({ row = null, subject: given = null, started = null, service, collectionOf, onClose }) {
  const { createElement: h, useEffect, useRef, useState } = react();
  const dialog = useRef(null);
  const heading = useRef(null);
  const [step, setStep] = useState(started ? 'progress' : 'meant');
  const [written, setWritten] = useState('');
  const [open, setOpen] = useState([]);
  const [purge, setPurge] = useState(started);
  const [said, setSaid] = useState(null);
  const ours = useRef(started?.id ?? null);
  const [subject] = useState(() => given ?? (row ? entrySubject(row, service, collectionOf) : unfinishedSubject()));

  // The focus goes back where it was once the dialog has gone, as what is behind a modal dialog
  // takes none while it is open.
  useEffect(() => {
    const element = dialog.current;
    const before = document.activeElement;
    if (!element.open) element.showModal();
    return () => {
      if (element.open) element.close();
      if (before?.isConnected) before.focus?.();
    };
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step]);
  // A purge that waits or runs, looked at again until it has ended.
  useEffect(() => {
    if (step !== 'progress') return undefined;
    let gone = false;
    const look = async () => {
      const now = await service.status();
      if (gone || !now?.admin) return;
      const shown = now.purge;
      if (shown?.id !== ours.current) {
        if (shown === null) setPurge({ id: ours.current, state: 'stopped' });
        return;
      }
      setPurge(shown);
      if (shown.state === 'done') setTimeout(() => globalThis.location.reload(), LOOK);
    };
    const timer = setInterval(look, LOOK);
    void look();
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [step]);

  const toForms = async () => {
    setSaid(null);
    const now = await service.status();
    if (!now?.admin) {
      setSaid(subject.failed({ reason: 'broke' }));
      return;
    }
    setOpen(now.open ?? []);
    setStep('forms');
  };
  const start = async (course) => {
    setSaid(null);
    try {
      const answer = await subject.start(course);
      if (answer.gone) {
        setSaid(subject.failed({ reason: 'not-found' }));
        return;
      }
      if (answer.busy) {
        setSaid(say('deleted.purgeBusy'));
        return;
      }
      ours.current = answer.purge.id;
      setPurge(answer.purge);
      setStep('progress');
    } catch (error) {
      console.warn(`The purge could not be asked for: ${error.message}`);
      setSaid(subject.failed({ reason: 'broke' }));
    }
  };
  const stop = async () => {
    if (await service.stop()) onClose();
  };
  // A purge that is unfinished asked to be finished, which then runs again.
  const finish = async () => {
    setSaid(null);
    try {
      const answer = await service.finish();
      if (answer.purge?.id === ours.current && !answer.busy) setPurge(answer.purge);
      else setSaid(failedWords('broke'));
    } catch (error) {
      console.warn(`The purge could not be finished: ${error.message}`);
      setSaid(failedWords('broke'));
    }
  };
  const ended = purge && ['done', 'failed', 'stopped', 'unfinished'].includes(purge.state);
  const cancel = (event) => {
    event.preventDefault();
    if (step !== 'progress' || ended) onClose();
  };

  const button = (label, act, more = {}) => h('button', { type: 'button', className: 'konzilo-deleted-button', onClick: act, ...more }, label);
  const noWayBack = h('p', { className: 'konzilo-purge-warning' }, subject.noWayBack);
  const backups = h('p', null, say('deleted.purgeBackups'));
  let body;
  if (step === 'meant') {
    body = [
      h('p', { key: 'what' }, subject.what),
      h('div', { key: 'no' }, noWayBack, backups),
      h('div', { key: 'ways', className: 'konzilo-deleted-ways' }, button(say('deleted.purgeCancel'), onClose), button(say('deleted.purgeMeant'), () => setStep('name'), { className: 'konzilo-deleted-button konzilo-purge-go' })),
    ];
  } else if (step === 'name') {
    const matches = subject.matches(written);
    body = [
      h('div', { key: 'no' }, noWayBack, backups),
      h('label', { key: 'name', className: 'konzilo-purge-name' },
        h('span', null, subject.write),
        h('input', { type: 'text', value: written, autoComplete: 'off', spellCheck: false, onChange: (event) => setWritten(event.target.value), onKeyDown: (event) => {
          // By what the box holds as the key is pressed, which the last change may not yet have
          // drawn.
          if (event.key === 'Enter' && subject.matches(event.target.value)) void toForms();
        } })),
      h('div', { key: 'ways', className: 'konzilo-deleted-ways' }, button(say('deleted.purgeCancel'), onClose), button(say('deleted.purgeConfirm'), toForms, { className: 'konzilo-deleted-button konzilo-purge-go', disabled: !matches })),
    ];
  } else if (step === 'forms') {
    body = open.length === 0
      ? [
        h('p', { key: 'none' }, say('deleted.purgeNoneOpen')),
        h('div', { key: 'no' }, noWayBack, backups),
        h('div', { key: 'ways', className: 'konzilo-deleted-ways' }, button(say('deleted.purgeCancel'), onClose), button(say('deleted.purgeNow'), () => start('anyway'), { className: 'konzilo-deleted-button konzilo-purge-go' })),
      ]
      : [
        h('p', { key: 'some' }, say('deleted.purgeSomeOpen')),
        h('ul', { key: 'open', className: 'konzilo-purge-forms' }, open.map((one) => h('li', { key: one.form }, formShown(one, collectionOf)))),
        h('p', { key: 'anyway' }, say('deleted.purgeAnywayWords')),
        h('p', { key: 'wait' }, say('deleted.purgeWaitWords')),
        h('div', { key: 'no' }, noWayBack, backups),
        h('div', { key: 'ways', className: 'konzilo-deleted-ways' },
          button(say('deleted.purgeCancel'), onClose),
          button(say('deleted.purgeWait'), () => start('wait'), { className: 'konzilo-deleted-button konzilo-purge-go' }),
          button(say('deleted.purgeAnyway'), () => start('anyway'), { className: 'konzilo-deleted-button konzilo-purge-go' })),
      ];
  } else {
    const state = purge?.state ?? 'running';
    const words = {
      waiting: say('deleted.purgeWaiting'),
      warning: say('deleted.purgeWarning'),
      running: say('deleted.purgeRunning'),
      done: subject.doneWords,
      stopped: say('deleted.purgeStopped'),
      failed: subject.failed(purge),
      unfinished: say('deleted.purgeUnfinished'),
    }[state];
    body = [
      h('p', { key: 'state', role: ['failed', 'unfinished'].includes(state) ? 'alert' : 'status', className: 'konzilo-purge-state' }, words),
      state === 'failed' ? subject.failedFiles?.(purge) ?? null : null,
      state === 'waiting' && (purge.forms ?? []).length > 0 ? h('ul', { key: 'open', className: 'konzilo-purge-forms' }, purge.forms.map((one) => h('li', { key: one.form }, formShown(one, collectionOf)))) : null,
      h('div', { key: 'ways', className: 'konzilo-deleted-ways' },
        state === 'waiting' ? button(say('deleted.purgeStop'), stop) : null,
        state === 'unfinished' ? button(say('deleted.purgeFinish'), finish, { className: 'konzilo-deleted-button konzilo-purge-go' }) : null,
        ended && state !== 'done' ? button(say('deleted.purgeClose'), onClose) : null),
    ];
  }
  return h('dialog', { ref: dialog, className: 'konzilo-purge-dialog', 'aria-labelledby': 'konzilo-purge-heading', onCancel: cancel },
    h('h2', { id: 'konzilo-purge-heading', ref: heading, tabIndex: -1 }, step === 'progress' ? subject.during : subject.heading),
    ...body,
    said ? h('p', { role: 'alert', className: 'konzilo-purge-state' }, said) : null);
}

// What an Admin reads of a purge that is unfinished, `purge` as the service tells it, on the page
// it purges from, and the way to finish it, which then shows its progress in the dialog.
export function UnfinishedPurge({ purge, service, collectionOf }) {
  const { createElement: h, useState } = react();
  const [finishing, setFinishing] = useState(null);
  const [said, setSaid] = useState(null);
  const finish = async () => {
    setSaid(null);
    try {
      const answer = await service.finish();
      if (answer.purge && !answer.busy) setFinishing(answer.purge);
      else setSaid(failedWords('broke'));
    } catch (error) {
      console.warn(`The purge could not be finished: ${error.message}`);
      setSaid(failedWords('broke'));
    }
  };
  return h('div', { className: 'konzilo-purge-unfinished' },
    finishing ? h(PurgeDialog, { started: finishing, service, collectionOf, onClose: () => setFinishing(null) }) : null,
    h('p', { role: 'alert' }, say('deleted.purgeUnfinishedNotice')),
    h('div', { className: 'konzilo-deleted-ways' },
      h('button', { type: 'button', className: 'konzilo-deleted-button konzilo-purge-go', onClick: finish, disabled: purge?.state !== 'unfinished' }, say('deleted.purgeFinish'))),
    said ? h('p', { role: 'alert', className: 'konzilo-purge-state' }, said) : null);
}

// The line an Admin reads of the purges made before: how many, and the last by whom and when.
export function purgesWords(purges) {
  if (!purges?.length) return null;
  const last = purges.at(-1);
  return wordsShown({ name: 'deleted.purgedBefore', values: { count: purges.length, name: last.by.name, moment: momentValue(last.at) } });
}
