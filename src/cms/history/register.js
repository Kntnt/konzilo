// A form's revisions in Sveltia (ADR 0074): the form's *History*, in the panel beside it where
// Sveltia listed the file's commits, lists each revision newest first, with when it was saved, the
// account that pushed it and, for a post, the status it left; a dialog over the page compares any
// two, the form's unsaved changes as either side too, field by field under the form's labels; and
// a revision is restored into the form as unsaved changes, under the lock, asking first where it
// would replace unsaved changes, which are then kept as a draft backup and at the top of the list.
// The refusal of a save older than the latest offers the same dialog, with the latest save and the
// form's changes.
//
// The patched Sveltia asks the globals set here: the panel, `konziloHistory`, which it hands the
// form's draft and tells of each new draft by `konziloFollow`; the refusal's button,
// `konziloCompareButton`, and what it opens, `konziloCompareLatest`. It hands the core its own ways
// of reading a file as a form does and of restoring a draft, `konziloSveltia`.

import { signedInCredential } from '../credential.js';
import { loadReader } from '../body/check.js';
import { imageLibrary } from '../body/library.js';
import { languageTag, say } from '../interface-language.js';
import { onReadOnly, readOnlyNow } from '../lock/read-only.js';
import { revisionsOf } from './client.js';
import { compareForms, restoredValues } from './compare.js';
import { bodiesBetween, wordsBetween } from './differences.js';
import { accountWords, choiceWords, latestWords, savedWords, withMoment } from './words.js';
import './history.css';

const made = (tag, className, parent, words) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (words !== undefined) element.textContent = words;
  parent?.append(element);
  return element;
};
const button = (words, parent, act, label) => {
  const element = made('button', 'konzilo-history-button', parent, words);
  element.type = 'button';
  if (label) element.setAttribute('aria-label', label);
  element.addEventListener('click', act);
  return element;
};
// Words a screen reader reads and the page does not show.
const unseen = (words, parent) => made('span', 'konzilo-history-unseen', parent, `${words} `);

// A moment as the refusals name one, in the reader's own form and time zone.
const MOMENT = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };

const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const isEmpty = (value) => value === undefined || value === null || value === ''
  || (Array.isArray(value) && value.length === 0)
  || (typeof value === 'object' && value !== null && Object.keys(value).length === 0);

// What Sveltia hands the core, once it has loaded.
const sveltia = () => globalThis.konziloSveltia;

// A form as its draft holds it: its fields, its file and its values, in the one language Sveltia
// holds them in, since each translation is a form of its own.
function formOf(entryDraft) {
  const draft = entryDraft.current;
  if (!draft?.originalEntry) return null;
  const locale = Object.keys(draft.currentValues ?? {})[0] ?? '_default';
  return {
    draft,
    entryDraft,
    fields: draft.fields ?? [],
    collectionName: draft.collectionName,
    fileName: draft.fileName,
    path: sveltia()?.pathOf(draft.originalEntry),
    locale,
    values: () => plain(entryDraft.current?.currentValues?.[locale] ?? {}),
    key: `${draft.collectionName}/${draft.fileName ?? draft.originalEntry.id}`,
  };
}

// Only a form the Editor may change, with the lock where the service keeps one, takes a revision.
const mayRestore = () => !readOnlyNow() && !globalThis.konziloReadOnly?.current;

export function registerHistory(CMS, config) {
  const { api_root: api, repo: repository, branch = 'main' } = config.backend ?? {};
  const library = api ? imageLibrary({ api, repository, branch, credential: signedInCredential }) : null;
  // The unsaved changes a restore replaced, by form, newest first, for as long as the page is open.
  const replaced = new Map();
  const panels = new Set();

  // A value as the comparison shows it, by its field.
  const entryTitle = (id) => {
    const entry = (sveltia()?.entries() ?? []).find(({ slug, id: own }) => slug === id || own === id);
    const content = entry?.locales?._default?.content ?? Object.values(entry?.locales ?? {})[0]?.content ?? {};
    const title = content.title ?? content['group-name.title'] ?? content.name ?? content.alt;
    return typeof title === 'string' && title !== '' ? title : id;
  };
  const describe = (field, value) => {
    if (isEmpty(value)) return say('history.empty');
    if (typeof value === 'boolean') return value ? say('history.yes') : say('history.no');
    if (Array.isArray(value)) return value.map((one) => describe(field, one)).join(', ');
    if (typeof value === 'object') return Object.entries(value).filter(([, inner]) => !isEmpty(inner)).map(([key, inner]) => `${key}: ${describe(null, inner)}`).join(', ');
    if (field?.widget === 'select') {
      const option = (field.options ?? []).find((one) => (typeof one === 'object' ? one?.value : one) === value);
      if (typeof option?.label === 'string') return option.label;
    }
    if (['relation', 'konzilo-authors'].includes(field?.widget) && typeof value === 'string') return entryTitle(value);
    if (field?.widget === 'datetime' && !Number.isNaN(Date.parse(value))) return new Date(value).toLocaleString(languageTag(), MOMENT);
    return String(value);
  };

  // Words marked as the comparison found them, each change said to a screen reader.
  const marked = (parts, parent) => {
    for (const { change, text } of parts) {
      if (change === 'alike') parent.append(text);
      else {
        const mark = made(change === 'removed' ? 'del' : 'ins', `konzilo-history-${change}`, parent);
        unseen(say(change === 'removed' ? 'history.removedWords' : 'history.addedWords'), mark);
        mark.append(text);
      }
    }
  };
  const beforeAndAfter = (parent, show) => {
    const pair = made('div', 'konzilo-history-pair', parent);
    for (const [side, name] of [['before', 'history.before'], ['after', 'history.after']]) {
      const one = made('div', `konzilo-history-${side}`, pair);
      made('p', 'konzilo-history-side', one, say(name));
      show(side, one);
    }
  };
  const picture = (value, parent) => {
    const address = typeof value === 'string' ? value : value?.src;
    const figure = made('figure', 'konzilo-history-picture', parent);
    if (isEmpty(address)) {
      made('figcaption', '', figure, say('history.empty'));
      return;
    }
    const image = made('img', '', figure);
    image.alt = typeof value?.alt === 'string' ? value.alt : '';
    image.hidden = true;
    void library?.picture(address)?.then((shown) => {
      if (shown) {
        image.src = shown;
        image.hidden = false;
      }
    }, () => {});
    made('figcaption', '', figure, [address, typeof value?.alt === 'string' && value.alt !== '' ? value.alt : null].filter(Boolean).join(' – '));
  };

  const drawBody = async (row, parent) => {
    const reader = await loadReader();
    if (reader === null) {
      marked(wordsBetween(row.before ?? '', row.after ?? ''), made('p', 'konzilo-history-words', parent));
      return;
    }
    const blocks = bodiesBetween(row.before ?? '', row.after ?? '', reader);
    const alike = blocks.filter(({ change }) => change === 'alike').length;
    if (alike > 0) made('p', 'konzilo-history-alike-count', parent, say('history.alikeBlocks', { count: alike }));
    for (const block of blocks) {
      if (block.change === 'alike') continue;
      const shown = made('div', 'konzilo-history-block', parent);
      shown.dataset.change = block.change;
      if (block.change === 'words') marked(block.parts, made('p', 'konzilo-history-words', shown));
      else if (block.change === 'form') {
        made('p', 'konzilo-history-note', shown, say('history.changedInForm'));
        beforeAndAfter(shown, (side, one) => made('pre', 'konzilo-history-source', one, block[side]));
      } else {
        const source = made('pre', 'konzilo-history-source', shown);
        marked([{ change: block.change, text: block.change === 'removed' ? block.before : block.after }], source);
      }
    }
  };

  const drawRow = (row, parent) => {
    const section = made('section', 'konzilo-history-field', parent);
    section.dataset.change = row.change;
    section.dataset.kind = row.kind;
    made('h3', '', section, row.labels.join(' › '));
    if (row.change === 'alike') {
      made('p', 'konzilo-history-value', section, row.kind === 'body' ? '' : describe(row.field, row.after));
      return section;
    }
    switch (row.kind) {
      case 'text':
        marked(row.parts, made('p', 'konzilo-history-words', section));
        break;
      case 'body':
        void drawBody(row, section);
        break;
      case 'image':
        beforeAndAfter(section, (side, one) => picture(row[side], one));
        break;
      case 'list': {
        const list = made('ul', 'konzilo-history-items', section);
        for (const { change, item } of row.items) {
          const shown = made('li', '', list);
          shown.dataset.change = change;
          if (change !== 'alike') unseen(say({ removed: 'history.removedWords', added: 'history.addedWords', moved: 'history.movedItem' }[change]), shown);
          const words = made(change === 'removed' ? 'del' : change === 'added' ? 'ins' : 'span', '', shown, describe(row.field?.field ?? row.field, item));
          words.dataset.change = change;
        }
        break;
      }
      case 'vanished':
        made('p', 'konzilo-history-note', section, say('history.vanished'));
        beforeAndAfter(section, (side, one) => made('p', 'konzilo-history-value', one, describe(null, row[side])));
        break;
      default:
        beforeAndAfter(section, (side, one) => made('p', 'konzilo-history-value', one, describe(row.field, row[side])));
    }
    return section;
  };

  // The dialog over the page that compares two choices: [{ id, label, values, restore }], each a
  // revision, the form now, the changes a restore replaced, or the latest save; `restore`, where
  // the choice may be restored, does it.
  const dialog = made('dialog', 'konzilo-history-dialog');
  dialog.setAttribute('aria-labelledby', 'konzilo-history-heading');
  made('h2', '', dialog, '').id = 'konzilo-history-heading';
  const picks = made('div', 'konzilo-history-picks', dialog);
  const pick = (name) => {
    const label = made('label', '', picks);
    made('span', '', label, say(name));
    return made('select', '', label);
  };
  const fromPick = pick('history.from');
  const toPick = pick('history.to');
  const comparison = made('div', 'konzilo-history-comparison', dialog);
  const actions = made('div', 'konzilo-history-actions', dialog);
  let shownChoices = [];
  let shownForm = null;
  const closeDialog = () => {
    if (dialog.open) dialog.close();
  };
  const drawComparison = () => {
    const [before, after] = [fromPick.value, toPick.value].map((id) => shownChoices.find((one) => one.id === id));
    comparison.replaceChildren();
    actions.replaceChildren();
    if (!before || !after || !shownForm) return;
    const rows = compareForms({ fields: shownForm.fields, before: before.values, after: after.values });
    const changed = rows.filter(({ change }) => change !== 'alike');
    const alike = rows.filter(({ change }) => change === 'alike');
    if (changed.length === 0) made('p', 'konzilo-history-note', comparison, say('history.alike'));
    for (const row of changed) drawRow(row, comparison);
    if (alike.length > 0) {
      const folded = made('details', 'konzilo-history-folded', comparison);
      made('summary', '', folded, say('history.alikeFields', { count: alike.length }));
      for (const row of alike) drawRow(row, folded);
    }
    for (const choice of [before, after]) {
      if (choice.restore && mayRestore() && !actions.querySelector(`[data-choice="${CSS.escape(choice.id)}"]`)) {
        button(choice.restoreWords, actions, async () => {
          closeDialog();
          await choice.restore();
        }).dataset.choice = choice.id;
      }
    }
    button(say('history.close'), actions, closeDialog);
  };
  fromPick.addEventListener('change', drawComparison);
  toPick.addEventListener('change', drawComparison);
  dialog.addEventListener('close', () => {
    shownChoices = [];
    shownForm = null;
  });
  const openComparison = ({ form, choices, from, to }) => {
    shownForm = form;
    shownChoices = choices;
    dialog.querySelector('h2').textContent = say('history.compareTitle');
    for (const [select, chosen] of [[fromPick, from], [toPick, to]]) {
      select.replaceChildren(...choices.map(({ id, label }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = label;
        return option;
      }));
      select.value = chosen;
    }
    drawComparison();
    if (!dialog.isConnected) document.body.append(dialog);
    if (!dialog.open) dialog.showModal();
    fromPick.focus();
  };

  // The question before a restore replaces unsaved changes.
  const question = made('dialog', 'konzilo-history-dialog konzilo-history-question');
  question.setAttribute('aria-labelledby', 'konzilo-history-question-heading');
  question.setAttribute('aria-describedby', 'konzilo-history-question-words');
  made('h2', '', question).id = 'konzilo-history-question-heading';
  made('p', '', question).id = 'konzilo-history-question-words';
  const questionActions = made('div', 'konzilo-history-actions', question);
  const askToReplace = () => new Promise((answer) => {
    question.querySelector('h2').textContent = say('history.replaceTitle');
    question.querySelector('p').textContent = say('history.replaceWords');
    questionActions.replaceChildren();
    let answered = false;
    const done = (yes) => {
      if (answered) return;
      answered = true;
      if (question.open) question.close();
      answer(yes);
    };
    button(say('history.cancel'), questionActions, () => done(false));
    button(say('history.replace'), questionActions, () => done(true));
    question.onclose = () => done(false);
    if (!question.isConnected) document.body.append(question);
    question.showModal();
    questionActions.firstElementChild.focus();
  });

  // Fills the form with `values`, a revision's or replaced changes, as unsaved changes: the form's
  // own unsaved changes, where it has any, after asking, kept as a draft backup and in the list.
  const restore = async (form, values, said) => {
    const hands = sveltia();
    const draft = form.entryDraft.current;
    if (!hands || !draft || !mayRestore()) return;
    const current = form.values();
    if (hands.modified(draft)) {
      if (!await askToReplace()) return;
      const kept = replaced.get(form.key) ?? [];
      kept.unshift({ at: new Date().toISOString(), values: current });
      replaced.set(form.key, kept);
      draft.interacted = true;
      await hands.saveBackup(draft);
    }
    await hands.restore(draft, {
      currentLocales: plain(draft.currentLocales),
      currentSlugs: plain(draft.currentSlugs),
      currentValues: { [form.locale]: restoredValues({ fields: form.fields, current, revision: values }) },
      files: {},
      pendingEntries: [],
    });
    draft.interacted = true;
    for (const panel of panels) panel.konziloSay(form.key, said);
    for (const panel of panels) panel.konziloDraw();
  };

  // The choices a form's panel offers to compare: the form now, the changes a restore replaced,
  // and each revision it has read.
  const choicesOf = (form, revisions) => [
    { id: 'form', label: say('history.theForm'), values: form.values() },
    ...(replaced.get(form.key) ?? []).map(({ at, values }, index) => ({
      id: `replaced-${index}`,
      label: withMoment('history.replaced', at),
      values,
      restoreWords: withMoment('history.restoreReplaced', at),
      restore: () => restore(form, values, withMoment('history.restoredReplaced', at)),
    })),
    ...revisions.filter(({ values }) => values).map((revision) => ({
      id: revision.commit,
      label: choiceWords(revision),
      values: revision.values,
      restoreWords: withMoment('history.restoreOne', revision.moment),
      restore: () => restore(form, revision.values, withMoment('history.restored', revision.moment)),
    })),
  ];

  // The panel of a form's revisions.
  globalThis.konziloHistory = (entryDraft) => {
    const panel = made('div', 'konzilo-history');
    const status = made('p', 'konzilo-history-state', panel);
    status.setAttribute('role', 'status');
    const told = made('p', 'konzilo-history-told', panel);
    told.setAttribute('role', 'status');
    const body = made('div', '', panel);
    let followed = null;
    let form = null;
    let revisions = [];
    let more = false;
    let page = 0;
    let state = 'loading';

    const draw = () => {
      body.replaceChildren();
      status.textContent = state === 'loading' ? say('history.loading') : state === 'failed' ? say('history.failed') : '';
      if (state === 'failed') button(say('history.retry'), body, () => load(true));
      if (!form || state !== 'shown') return;
      const kept = replaced.get(form.key) ?? [];
      if (revisions.length === 0 && kept.length === 0) made('p', 'konzilo-history-state', body, say('history.none'));
      if (!mayRestore()) made('p', 'konzilo-history-note', body, say('history.readOnly'));
      const list = made('ol', 'konzilo-history-list', body);
      list.setAttribute('aria-label', say('history.list'));
      const choices = choicesOf(form, revisions);
      const compare = (id) => openComparison({ form, choices: choicesOf(form, revisions), from: id, to: 'form' });
      kept.forEach(({ at }, index) => {
        const item = made('li', 'konzilo-history-revision konzilo-history-replaced', list);
        made('p', 'konzilo-history-when', item, withMoment('history.replaced', at));
        const ways = made('div', 'konzilo-history-ways', item);
        button(say('history.compare'), ways, () => compare(`replaced-${index}`), withMoment('history.compareReplaced', at));
        const choice = choices.find(({ id }) => id === `replaced-${index}`);
        if (mayRestore()) button(say('history.restore'), ways, () => choice.restore(), choice.restoreWords);
      });
      for (const revision of revisions) {
        const item = made('li', 'konzilo-history-revision', list);
        item.dataset.commit = revision.commit;
        const when = made('p', 'konzilo-history-when', item);
        const time = made('time', '', when, savedWords(revision.moment));
        time.dateTime = revision.moment;
        made('p', 'konzilo-history-who', item, accountWords(revision.account));
        if (revision.status) made('p', 'konzilo-history-status', item, say('history.status', { status: revision.status }));
        if (!revision.values) {
          made('p', 'konzilo-history-note', item, revision.unreadable ? say('history.unreadable') : say('history.removedFile'));
          continue;
        }
        const ways = made('div', 'konzilo-history-ways', item);
        button(say('history.compare'), ways, () => compare(revision.commit), withMoment('history.compareOne', revision.moment));
        if (mayRestore()) {
          const choice = choices.find(({ id }) => id === revision.commit);
          button(say('history.restore'), ways, () => choice.restore(), choice.restoreWords);
        }
      }
      if (more) button(say('history.more'), body, () => load(false));
    };

    const load = async (anew) => {
      if (!form) return;
      const asked = form;
      if (anew) {
        revisions = [];
        page = 0;
        more = false;
      }
      state = anew ? 'loading' : state;
      draw();
      try {
        const hands = sveltia();
        const next = await revisionsOf({
          path: asked.path,
          page: page + 1,
          fields: asked.fields,
          parse: (text) => hands.parse({ text, path: asked.path, collectionName: asked.collectionName, fileName: asked.fileName }),
          credential: signedInCredential,
        });
        if (form !== asked) return;
        revisions = [...revisions, ...next.revisions];
        more = next.more;
        page += 1;
        state = 'shown';
      } catch (error) {
        if (form !== asked) return;
        console.warn(`The revisions could not be read: ${error.message}`);
        state = 'failed';
      }
      draw();
    };

    // Each new draft of the form: a save, a reload, another form shown beside the panel.
    panel.konziloFollow = (draft) => {
      const entry = draft?.originalEntry;
      const key = entry ? JSON.stringify([draft.collectionName, draft.fileName, entry.id, entry.sha ?? null, sveltia()?.pathOf(entry)]) : null;
      if (key === followed) return;
      followed = key;
      form = entry ? formOf(entryDraft) : null;
      queueMicrotask(() => load(true));
    };
    panel.konziloDraw = draw;
    panel.konziloReload = () => {
      form = formOf(entryDraft) ?? form;
      void load(true);
    };
    panel.konziloSay = (key, words) => {
      if (form?.key === key) told.textContent = words;
    };
    panels.add(panel);
    return panel;
  };
  onReadOnly(() => {
    for (const panel of panels) {
      if (panel.isConnected) panel.konziloDraw();
      else panels.delete(panel);
    }
  });

  // The refusal of a save older than the latest offers to compare the latest save with the form.
  globalThis.konziloCompareButton = (compare) => {
    const element = made('button', 'konzilo-history-button konzilo-history-latest', null, say('history.compareLatest'));
    element.type = 'button';
    element.addEventListener('click', () => compare());
    const line = made('span', 'konzilo-history-refusal');
    line.append(element);
    return line;
  };
  globalThis.konziloCompareLatest = ({ entryDraft, entry }) => {
    const form = formOf(entryDraft);
    const latest = entry?.locales?.[form?.locale]?.content ?? Object.values(entry?.locales ?? {})[0]?.content;
    if (!form || !latest) return;
    const account = entry.commitAuthor?.login || entry.commitAuthor?.name;
    openComparison({
      form,
      choices: [
        { id: 'latest', label: latestWords({ account, at: entry.commitDate }), values: plain(latest) },
        { id: 'form', label: say('history.theForm'), values: form.values() },
      ],
      from: 'latest',
      to: 'form',
    });
  };

  // A save makes a new revision, which each panel shown reads.
  CMS.registerEventListener({
    name: 'postSave',
    handler: () => {
      for (const panel of panels) {
        if (panel.isConnected) panel.konziloReload();
        else panels.delete(panel);
      }
    },
  });
}
