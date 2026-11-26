// The *Deleted* page (ADR 0077): the posts, terms and image library entries deleted from the source,
// newest deletion first, each with what its last save called it, its type, when it was deleted and
// the account that pushed the deletion, a type at a time where one is chosen. A deleted entry opens
// read-only, at its last revision, beside its revisions, which compare as a form's do, and *Restore*
// saves it again, as a draft, under its own ID, and opens its form. An Admin also purges one for
// good, from its row or as it is read (ADR 0078). It is React, since that is what Sveltia takes;
// what a revision holds is drawn by the form's History (history/register.js).

import { signedInCredential } from '../credential.js';
import { languageTag, say } from '../interface-language.js';
import { momentValue, wordsShown } from '../refusals.js';
import { latestSaveOf, revisionsOf } from '../history/client.js';
import { accountWords, choiceWords, savedWords, withMoment } from '../history/words.js';
import { deletedPages, entryTitle } from './client.js';
import { PurgeDialog, purgedBefore, purgesWords } from './purge-dialog.js';
import { purgeService } from './purge.js';
import { idOf, restoreDeleted } from './restore.js';
import { sourceOf } from '../source.js';
import './deleted.css';

const react = () => globalThis.__SVELTIA_CMS_REACT__;
const sveltia = () => globalThis.konziloSveltia;

// A moment as the page shows it, in the reader's own form and time zone, named.
const MOMENT = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
const momentShown = (at) => new Date(at).toLocaleString(languageTag(), MOMENT);

// An entry's last revision read as its form reads its file, and what it is called there.
async function named(row, collectionOf) {
  let values = null;
  try {
    if (typeof row.last?.text === 'string') values = await sveltia()?.parse({ text: row.last.text, path: row.path, collectionName: row.collection }) ?? null;
  } catch {
    values = null;
  }
  return { ...row, values, title: entryTitle({ values, collection: collectionOf(row.collection), path: row.path }) };
}

// Opens a restored entry's form, once Sveltia has fetched it, as it fetches what another tab saved;
// the editor loads again where it has not, which fetches it too.
async function openForm({ path, collection }) {
  try {
    await sveltia()?.refresh();
  } catch (error) {
    console.warn(`The restored entry could not be fetched: ${error.message}`);
  }
  const known = (sveltia()?.entries() ?? []).some(({ locales }) => Object.values(locales ?? {}).some((locale) => locale?.path === path));
  const changed = new Promise((go) => {
    globalThis.addEventListener('hashchange', go, { once: true });
  });
  globalThis.location.hash = `#/collections/${encodeURIComponent(collection)}/entries/${encodeURIComponent(idOf(path))}`;
  await changed;
  if (!known) globalThis.location.reload();
}

// The list of deleted entries, of one collection where `collection` is given, with a way to purge
// each for an Admin, `admin`.
function DeletedList({ collection, collectionOf, onOpen, admin, onPurge }) {
  const { createElement: h, useEffect, useRef, useState } = react();
  const pages = useRef(null);
  const [shown, setShown] = useState(undefined);
  const [tried, setTried] = useState(0);
  useEffect(() => {
    let gone = false;
    pages.current = deletedPages({ collection: collection || null, credential: signedInCredential });
    setShown(undefined);
    pages.current.first()
      .then(async (answer) => ({ deleted: await Promise.all(answer.deleted.map((row) => named(row, collectionOf))), more: answer.more }))
      .catch((error) => {
        console.warn(`The deleted entries could not be read: ${error.message}`);
        return null;
      })
      .then((answer) => {
        if (!gone) setShown(answer);
      });
    return () => {
      gone = true;
    };
  }, [collection, tried]);
  const older = async () => {
    const from = shown.deleted.length;
    try {
      const next = await pages.current.older();
      if (next) setShown({ deleted: [...shown.deleted, ...await Promise.all(next.deleted.slice(from).map((row) => named(row, collectionOf)))], more: next.more });
    } catch (error) {
      console.warn(`The deleted entries could not be read: ${error.message}`);
    }
  };
  if (shown === undefined) return h('p', { className: 'konzilo-deleted-state', role: 'status' }, say('deleted.loading'));
  if (shown === null) {
    return h('div', null,
      h('p', { className: 'konzilo-deleted-state', role: 'alert' }, say('deleted.failed')),
      h('button', { type: 'button', className: 'konzilo-deleted-button', onClick: () => setTried(tried + 1) }, say('deleted.retry')));
  }
  if (shown.deleted.length === 0) return h('p', { className: 'konzilo-deleted-state', role: 'status' }, collection ? say('deleted.noneOfType') : say('deleted.none'));
  return h('div', null,
    h('table', { className: 'konzilo-deleted-table' },
      h('caption', null, say('deleted.list')),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, say('deleted.name')),
        h('th', { scope: 'col' }, say('deleted.type')),
        h('th', { scope: 'col' }, say('deleted.when')),
        h('th', { scope: 'col' }, say('deleted.who')),
        admin ? h('th', { scope: 'col' }, say('deleted.purgeColumn')) : null)),
      h('tbody', null, shown.deleted.map((row) => h('tr', { key: row.path, 'data-path': row.path },
        h('th', { scope: 'row' }, h('button', { type: 'button', className: 'konzilo-deleted-open', onClick: () => onOpen(row) }, row.title)),
        h('td', null, collectionOf(row.collection)?.label ?? row.collection),
        h('td', null, h('time', { dateTime: row.moment }, momentShown(row.moment))),
        h('td', null, row.account ? row.account.name : say('deleted.unknownAccount')),
        admin ? h('td', null, h('button', { type: 'button', className: 'konzilo-deleted-button konzilo-purge-open', 'aria-label': wordsShown({ name: 'deleted.purgeOne', values: { title: row.title } }), onClick: () => onPurge(row) }, say('deleted.purge'))) : null)))),
    shown.more ? h('button', { type: 'button', className: 'konzilo-deleted-button', onClick: older }, say('deleted.older')) : null);
}

// A deleted entry's revisions, newest first, its deletion among them, each that can be read to
// compare with its last revision, in the History's dialog.
function Revisions({ row, fields, history }) {
  const { createElement: h, useEffect, useState } = react();
  const [state, setState] = useState({ revisions: [], more: false, page: 0, loading: true, failed: false });
  const parse = (text) => sveltia().parse({ text, path: row.path, collectionName: row.collection });
  const load = async (from) => {
    setState({ ...from, loading: true, failed: false });
    try {
      const next = await revisionsOf({ path: row.path, page: from.page + 1, fields, parse, credential: signedInCredential });
      setState({ revisions: [...from.revisions, ...next.revisions], more: next.more, page: from.page + 1, loading: false, failed: false });
    } catch (error) {
      console.warn(`The revisions could not be read: ${error.message}`);
      setState({ ...from, loading: false, failed: true });
    }
  };
  useEffect(() => {
    void load({ revisions: [], more: false, page: 0 });
  }, [row.path]);
  const readable = state.revisions.filter(({ values }) => values);
  const compare = (revision) => history.openComparison({
    form: { fields },
    choices: readable.map((one) => ({ id: one.commit, label: choiceWords(one), values: one.values })),
    from: revision.commit,
    to: row.last.commit,
  });
  return h('section', { className: 'konzilo-deleted-revisions', 'aria-labelledby': 'konzilo-deleted-revisions' },
    h('h3', { id: 'konzilo-deleted-revisions' }, say('deleted.revisions')),
    state.loading ? h('p', { className: 'konzilo-deleted-state', role: 'status' }, say('history.loading')) : null,
    state.failed ? h('p', { className: 'konzilo-deleted-state', role: 'alert' }, say('history.failed')) : null,
    state.failed ? h('button', { type: 'button', className: 'konzilo-deleted-button', onClick: () => load(state) }, say('history.retry')) : null,
    h('ol', { className: 'konzilo-history-list', 'aria-label': say('history.list') }, state.revisions.map((revision) => h('li', { key: revision.commit, className: 'konzilo-history-revision', 'data-commit': revision.commit },
      h('p', { className: 'konzilo-history-when' }, h('time', { dateTime: revision.moment }, savedWords(revision.moment))),
      h('p', { className: 'konzilo-history-who' }, accountWords(revision.account)),
      revision.status ? h('p', { className: 'konzilo-history-status' }, say('history.status', { status: revision.status })) : null,
      !revision.values ? h('p', { className: 'konzilo-history-note' }, revision.unreadable ? say('history.unreadable') : say('history.removedFile')) : null,
      revision.values && revision.commit !== row.last.commit && readable.some(({ commit }) => commit === row.last.commit)
        ? h('div', { className: 'konzilo-history-ways' }, h('button', { type: 'button', className: 'konzilo-history-button', 'aria-label': withMoment('deleted.compareOne', revision.moment), onClick: () => compare(revision) }, say('history.compare')))
        : null))),
    state.more && !state.loading ? h('button', { type: 'button', className: 'konzilo-deleted-button', onClick: () => load(state) }, say('history.more')) : null);
}

// A deleted entry, read-only, as its last revision left it, with the way to restore it, and for an
// Admin, `admin`, the way to purge it.
function DeletedEntry({ row, collection, history, lock, api, repository, branch, onBack, admin, onPurge }) {
  const { createElement: h, useEffect, useRef, useState } = react();
  const heading = useRef(null);
  const drawn = useRef(null);
  const gone = useRef(false);
  const [state, setState] = useState({ restoring: false, said: null, alert: false });
  const fields = collection?.fields ?? [];
  useEffect(() => {
    heading.current?.focus();
    return () => {
      gone.current = true;
    };
  }, []);
  useEffect(() => {
    if (!drawn.current) return;
    drawn.current.replaceChildren();
    if (row.values) history.drawValues({ fields, values: row.values }, drawn.current);
  }, [row.path]);
  const restore = async () => {
    setState({ restoring: true, said: say('deleted.restoring'), alert: false });
    try {
      const answer = await restoreDeleted({
        entry: row,
        api,
        repository,
        branch,
        credential: signedInCredential,
        lock,
        latestSave: (path) => latestSaveOf({ path, credential: signedInCredential }),
        opened: () => openForm(row),
      });
      if (!gone.current && answer.refusal) setState({ restoring: false, said: wordsShown(answer.refusal), alert: true });
    } catch (error) {
      console.warn(`The entry could not be restored: ${error.message}`);
      if (!gone.current) setState({ restoring: false, said: say('deleted.restoreFailed'), alert: true });
    }
  };
  const kind = collection?.label ?? row.collection;
  const line = row.account
    ? wordsShown({ name: 'deleted.line', values: { collection: kind, moment: momentValue(row.moment), account: row.account.name } })
    : wordsShown({ name: 'deleted.lineUnknown', values: { collection: kind, moment: momentValue(row.moment) } });
  return h('article', { className: 'konzilo-deleted-entry', 'aria-labelledby': 'konzilo-deleted-title' },
    h('div', { className: 'konzilo-deleted-ways' },
      h('button', { type: 'button', className: 'konzilo-deleted-button', onClick: onBack }, say('deleted.back'))),
    h('h2', { id: 'konzilo-deleted-title', ref: heading, tabIndex: -1 }, row.title),
    h('p', { className: 'konzilo-deleted-line' }, line),
    h('p', { className: 'konzilo-deleted-note' }, say('deleted.restoreWords')),
    h('div', { className: 'konzilo-deleted-ways' },
      h('button', { type: 'button', className: 'konzilo-deleted-button konzilo-deleted-restore', disabled: state.restoring, onClick: restore }, say('deleted.restore')),
      admin ? h('button', { type: 'button', className: 'konzilo-deleted-button konzilo-purge-open', onClick: () => onPurge(row) }, say('deleted.purge')) : null),
    h('p', { className: 'konzilo-deleted-told', role: state.alert ? 'alert' : 'status' }, state.said ?? ''),
    h('div', { className: 'konzilo-deleted-columns' },
      h('section', { className: 'konzilo-deleted-fields', 'aria-labelledby': 'konzilo-deleted-fields' },
        h('h3', { id: 'konzilo-deleted-fields' }, say('deleted.fields')),
        row.values ? null : h('p', { className: 'konzilo-history-note' }, say('history.unreadable')),
        h('div', { ref: drawn })),
      h(Revisions, { row, fields, history })));
}

// `config`: Sveltia's configuration, whose folder collections are the types of what can be
// deleted. `history`: what registerHistory() gives. `lock`: what registerLock() gives.
export function deletedPage({ config, history, lock }) {
  const { api, repository, branch } = sourceOf(config);
  const collections = (config.collections ?? []).filter(({ folder }) => typeof folder === 'string');
  const collectionOf = (name) => collections.find((one) => one.name === name);
  const purges = purgeService({ credential: signedInCredential });
  return function KonziloDeletedPage() {
    const { createElement: h, useEffect, useRef, useState } = react();
    const [collection, setCollection] = useState('');
    const [opened, setOpened] = useState(null);
    const [standing, setStanding] = useState(null);
    const [purging, setPurging] = useState(null);

    const back = useRef(null);
    const purgeFrom = useRef(null);
    // Whether the one reading is an Admin, who may purge, and the purges made before.
    useEffect(() => {
      let gone = false;
      purges.status().then((now) => {
        if (!gone) setStanding(now);
      });
      return () => {
        gone = true;
      };
    }, []);
    const admin = standing?.admin === true;
    const purged = admin ? purgedBefore(standing.purge) : null;
    const onPurge = (row) => {
      purgeFrom.current = document.activeElement;
      setPurging(row);
    };
    const purgeClosed = () => {
      setPurging(null);
      purgeFrom.current?.focus?.();
    };
    useEffect(() => {
      if (opened !== null || back.current === null) return;
      document.querySelector(`.konzilo-deleted tr[data-path="${CSS.escape(back.current)}"] button`)?.focus();
      back.current = null;
    }, [opened]);
    return h('div', { className: 'konzilo-deleted' },
      purged ? h('p', { className: 'konzilo-deleted-told', role: 'status' }, wordsShown({ name: 'deleted.purgedNow', values: { title: purged } })) : null,
      purging ? h(PurgeDialog, { key: purging.path, row: purging, service: purges, collectionOf, onClose: purgeClosed }) : null,
      h('div', { hidden: opened !== null },
        h('p', { className: 'konzilo-deleted-note' }, say('deleted.about')),
        admin && purgesWords(standing.purges) ? h('p', { className: 'konzilo-deleted-note' }, purgesWords(standing.purges)) : null,
        h('label', { className: 'konzilo-deleted-filter' },
          h('span', null, say('deleted.type')),
          h('select', { value: collection, onChange: (event) => setCollection(event.target.value) },
            h('option', { value: '' }, say('deleted.allTypes')),
            collections.map(({ name, label }) => h('option', { key: name, value: name }, label)))),
        h(DeletedList, { collection, collectionOf, onOpen: setOpened, admin, onPurge })),
      opened === null ? null : h(DeletedEntry, {
        key: opened.path,
        row: opened,
        collection: collectionOf(opened.collection),
        history,
        lock,
        api,
        repository,
        branch,
        admin,
        onPurge,
        onBack: () => {
          back.current = opened.path;
          setOpened(null);
        },
      }));
  };
}
