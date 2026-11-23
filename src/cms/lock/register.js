// A form locked to the tab that has it open (ADR 0073), in Sveltia: the keeper of the tab's lock
// (keeper.js) follows the address the editor shows, asks the service (client.js), and what it
// knows is drawn here: the question where another tab holds the form, the notice of a takeover,
// the line above a read-only form, the read-only state itself (Sveltia's for its own fields,
// guard.js for the core's), and the marks in the list of entries. The patched Sveltia asks the
// globals set here: whether the form is read-only and which forms other tabs hold, two states of
// its own kind it makes, `konziloReadOnly` and `konziloHeld`; the line, `konziloLine`; before a
// deletion, `konziloBeforeDeleting`; for a save older than the latest, `konziloConflictWords` and
// the words of its Reload; for a draft backup that can no longer be saved, `konziloStaleBackup`; and
// before it looks for a draft backup, `konziloLockSettled`, so that it finds the form's lock known.
// Before each save the keeper checks the lock, as a `preSave` handler.

import { signedInCredential } from '../credential.js';
import { made, madeButton } from '../elements.js';
import { say } from '../interface-language.js';
import { refuseAtSave, wordsShown } from '../refusals.js';
import { lockClient, newTab } from './client.js';
import { guardReadOnly } from './guard.js';
import { formOf, lockKeeper } from './keeper.js';
import { onReadOnly, readOnlyNow, setReadOnly } from './read-only.js';
import { conflictWords, heldWords, lineWords, markWords } from './words.js';
import './lock.css';

const button = (words, parent, act) => madeButton('konzilo-lock-button', words, parent, act);

export function registerLock(CMS) {
  const client = lockClient({ tab: newTab(), credential: signedInCredential });
  const lines = new Set();
  let entryDraft = null;
  let shownMode = 'none';

  const backToList = () => {
    const form = keeper.state().form;
    globalThis.location.hash = form ? `#/collections/${encodeURIComponent(form.split('/')[0])}` : '#/';
  };

  // The question where another tab holds the form, and the notice of a takeover: one dialog over
  // the page, which says what it is about, and what each way on does.
  const dialog = made('dialog', 'konzilo-lock-dialog');
  const heading = made('h2', '', dialog);
  const told = made('p', '', dialog);
  const more = made('p', '', dialog);
  const actions = made('div', 'konzilo-lock-actions', dialog);
  heading.id = 'konzilo-lock-heading';
  told.id = 'konzilo-lock-told';
  dialog.setAttribute('aria-labelledby', heading.id);
  dialog.setAttribute('aria-describedby', told.id);
  let onCancel = () => {};
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    onCancel();
  });
  const close = () => {
    if (dialog.open) dialog.close();
  };
  const ask = ({ title, words, aside = '', choices, cancel }) => {
    heading.textContent = title;
    told.textContent = words;
    more.textContent = aside;
    more.hidden = aside === '';
    actions.replaceChildren();
    for (const [label, act] of choices) button(label, actions, () => {
      close();
      act();
    });
    onCancel = () => {
      close();
      cancel();
    };
    if (!dialog.isConnected) document.body.append(dialog);
    if (!dialog.open) dialog.showModal();
    actions.firstElementChild?.focus();
  };

  // The line above a read-only form, with the ways on from it, in Sveltia's bar, which a screen
  // reader reads as it changes.
  const drawLine = (line) => {
    const state = keeper.state();
    line.replaceChildren();
    made('span', 'konzilo-lock-words', line, lineWords(state));
    const ways = made('span', 'konzilo-lock-ways', line);
    if (state.mode === 'reading') button(state.holder ? say('lock.takeOver') : say('lock.edit'), ways, () => keeper.takeOver());
    const draft = line.konziloEntryDraft ?? entryDraft;
    if (state.mode === 'takenOver') button(say('lock.takeOver'), ways, () => takeBack(draft));
    if (state.mode === 'staleBackup') {
      button(say('lock.openLatest'), ways, async () => {
        keeper.latest();
        await globalThis.konziloLatest?.(draft);
      });
    }
    if (state.mode !== 'staleBackup') button(say('lock.back'), ways, backToList);
  };
  // Taking back a form taken over: its unsaved changes are set aside as a draft backup, and the form
  // shows them read-only from the latest save, never to be saved, as a Reload does. Where it had
  // none, the latest save opens to edit.
  const takeBack = async (draft) => {
    await keeper.takeOver();
    const { mode, takenOver } = keeper.state();
    if (mode !== 'staleBackup' || !takenOver) return;
    if (!await globalThis.konziloSetAside?.(draft)) keeper.latest();
  };
  globalThis.konziloLine = (draft) => {
    entryDraft = draft;
    const line = made('span', 'konzilo-lock-line');
    line.konziloEntryDraft = draft;
    lines.add(line);
    drawLine(line);
    return line;
  };

  const show = (state) => {
    for (const line of [...lines]) {
      if (line.isConnected) drawLine(line);
      else if (shownMode === 'none' || state.mode === 'none') lines.delete(line);
    }
    const readOnly = keeper.readOnly();
    if (globalThis.konziloReadOnly) globalThis.konziloReadOnly.current = readOnly ? { form: state.form, mode: state.mode } : null;
    setReadOnly(readOnly);
    if (state.mode === 'asking') {
      ask({
        title: say('lock.heldTitle'),
        words: heldWords(state.holder),
        aside: say('lock.choose'),
        choices: [[say('lock.back'), backToList], [say('lock.read'), () => keeper.read()], [say('lock.takeOver'), () => keeper.takeOver()]],
        cancel: backToList,
      });
    } else if (state.mode === 'takenOver' && shownMode !== 'takenOver') {
      ask({ title: say('lock.takenOverTitle'), words: lineWords(state), choices: [[say('lock.ok'), () => {}]], cancel: () => {} });
    } else if (state.mode !== 'takenOver') {
      close();
    }
    shownMode = state.mode;
  };

  const mark = (marks) => {
    if (!globalThis.konziloHeld) return;
    globalThis.konziloHeld.current = Object.fromEntries(Object.entries(marks).map(([form, held]) => [form, { ...held, text: markWords(held) }]));
  };

  const keeper = lockKeeper({ service: client, show, mark });

  guardReadOnly(document, { readOnly: readOnlyNow, follow: (listener) => onReadOnly(() => listener(readOnlyNow())) });

  // The form the editor shows, as its address changes, and none once the page is left, whose lock
  // goes with it at once, in whatever state the form is, by a call that outlives the page. Sveltia's
  // check for a draft backup waits until the service has answered for the form.
  const follow = () => {
    void keeper.open(formOf(globalThis.location.hash));
  };
  globalThis.addEventListener('hashchange', follow);
  follow();
  globalThis.addEventListener('pagehide', () => {
    const form = keeper.held();
    if (form !== null) void client.release(form, { leaving: true });
  });
  globalThis.konziloLockSettled = () => keeper.settled();
  void client.watch(async (answer) => {
    try {
      await keeper.seen(answer);
    } catch (error) {
      console.warn(`The locks could not be followed: ${error.message}`);
    }
  });

  // Before each save the form checks that its tab still holds the lock, and refuses otherwise,
  // naming who took it.
  CMS.registerEventListener({
    name: 'preSave',
    handler: async () => {
      const refusal = await keeper.beforeSave();
      if (refusal) refuseAtSave(wordsShown(refusal), say('lock.notSaved'));
    },
  });

  // A deletion, from the form or from the list, of the entries Sveltia is handed.
  globalThis.konziloBeforeDeleting = async ({ items = [], collection, collectionFile } = {}) => {
    const forms = items.map(({ entry }) => `${collection?.name}/${collectionFile?.name ?? entry?.subPath}`);
    if (forms.length === 0) return null;
    const answer = await keeper.beforeDeleting(forms);
    return answer.refusal ? { refusal: wordsShown(answer.refusal) } : answer;
  };

  globalThis.konziloConflictWords = conflictWords;
  globalThis.__KONZILO_RELOAD_WORDS__ = say('lock.reload');
  globalThis.konziloStaleBackup = (timestamp) => keeper.staleBackup(new Date(timestamp).toISOString());
}
