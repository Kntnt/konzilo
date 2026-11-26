// The *Purge a passage* page (ADR 0078), for an Admin alone: a passage, such as a person's name and
// telephone number, found in every revision of every file of the source that holds it, the files
// whose current version holds it first and marked, each linked to its form, every revision with the
// text around the passage, and the saves whose message names it. While a current version holds it,
// it cannot be purged: the Admin takes it out there by hand and saves, so that an editor sees the
// published text change, and finds it again. Then it is purged from every old revision, in the
// steps the purge of a deleted entry takes (deleted/purge-dialog.js), and once the editor has
// loaded again the page says how many revisions in how many files changed, and nothing of the
// passage itself. An Editor reads that the page is an Admin's, and finds nothing. It is React,
// since that is what Sveltia takes.

import { signedInCredential } from '../credential.js';
import { say } from '../interface-language.js';
import { wordsShown } from '../refusals.js';
import { savedWords } from '../history/words.js';
import { PurgeDialog } from '../deleted/purge-dialog.js';
import { purgeService } from '../deleted/purge.js';
import { formOfPath } from './forms.js';
import '../deleted/deleted.css';
import './passage.css';

const react = () => globalThis.__SVELTIA_CMS_REACT__;
const sveltia = () => globalThis.konziloSveltia;

// The shortest and the longest passage, as the service takes it (purge/passage.js).
const LEAST = 3;
const MOST = 500;
// The purge this tab asked for, by its name, whose outcome the page says once the tab has loaded
// again.
const PURGING_KEY = 'konzilo-purging-passage';

// The purge this tab asked for before it loaded again, or null: taken once from the tab's storage,
// and kept for as long as the page is open.
let purgingLast;
function purgingBefore() {
  if (purgingLast !== undefined) return purgingLast;
  try {
    purgingLast = globalThis.sessionStorage?.getItem(PURGING_KEY) ?? null;
    globalThis.sessionStorage?.removeItem(PURGING_KEY);
  } catch {
    purgingLast = null;
  }
  return purgingLast;
}

const normal = (text) => text.replace(/\s+/gu, ' ').trim();
const same = (one, other) => normal(one).toLocaleLowerCase() === normal(other).toLocaleLowerCase();

// What the purge changed, in words, nothing of the passage among them.
const changedWords = (name, changed) => wordsShown({ name, values: { revisions: changed?.revisions ?? 0, files: changed?.files ?? 0, messages: changed?.messages ?? 0 } });

// A passage as the purge's steps purge it, from every old revision.
function passageSubject(passage, service) {
  const failed = { current: 'passage.purgeFailed-current', 'not-found': 'passage.purgeFailed-not-found', unanswered: 'passage.purgeFailed-unanswered' };
  return {
    heading: say('passage.purgeTitle'),
    during: say('passage.purgeOf'),
    what: say('passage.purgeWhat'),
    noWayBack: say('passage.purgeNoWayBack'),
    write: say('passage.purgeWrite'),
    matches: (written) => same(written, passage),
    start: async (course) => {
      const answer = await service.startPassage(passage, course);
      if (answer.purge?.id && !answer.busy) {
        try {
          globalThis.sessionStorage?.setItem(PURGING_KEY, answer.purge.id);
        } catch { /* The page then does not say what changed. */ }
      }
      return answer;
    },
    failed: (purge) => wordsShown({ name: failed[purge?.reason] ?? 'passage.purgeFailed-broke', values: { count: purge?.paths?.length ?? 0 } }),
    doneWords: say('passage.purgeDone'),
    done: () => {},
  };
}

// A file's form, and what the editor calls it: { form, name, linked }, `linked` where the form can
// be opened, as one whose current version holds the passage always can.
function fileShown({ path, current }, collections) {
  const form = formOfPath(collections, path);
  if (form === null) return { form, name: wordsShown({ name: 'passage.fileOther', values: { path } }), linked: false };
  if (form.file) return { form, name: form.label, linked: true };
  const entry = (sveltia()?.entries() ?? []).find(({ slug, id }) => slug === form.entry || id === form.entry);
  const content = entry?.locales?._default?.content ?? Object.values(entry?.locales ?? {})[0]?.content ?? {};
  const title = [content.title, content['group-name.title'], content.name, content.alt].find((one) => typeof one === 'string' && one !== '');
  return {
    form,
    name: title ? wordsShown({ name: 'passage.fileNamed', values: { collection: form.label, title } }) : wordsShown({ name: 'passage.fileUnnamed', values: { collection: form.label, path } }),
    linked: current || entry !== undefined,
  };
}

// Sveltia's entries fetched anew, so that a file saved since the editor loaded is named by its
// form; the page goes on without, where they cannot be.
async function refreshed() {
  try {
    await sveltia()?.refresh();
  } catch (error) {
    console.warn(`The entries could not be fetched: ${error.message}`);
  }
}

// One place the passage is found, with the text around it.
const Around = ({ around }) => {
  const { createElement: h } = react();
  return h('p', { className: 'konzilo-passage-around' }, around.before, h('mark', null, around.match), around.after);
};

// A file that holds the passage, with its revisions that do, newest first.
function FileFound({ file, collections }) {
  const { createElement: h } = react();
  const { form, name, linked } = fileShown(file, collections);
  return h('li', { className: 'konzilo-passage-file', 'data-path': file.path },
    h('h3', null, name),
    linked ? h('p', null, h('a', { href: form.hash, className: 'konzilo-passage-link' }, wordsShown({ name: 'passage.openForm', values: { name } }))) : null,
    h('ol', { className: 'konzilo-passage-revisions', 'aria-label': wordsShown({ name: 'passage.revisionsOf', values: { name } }) }, file.revisions.map((revision) => h('li', { key: revision.commit, 'data-commit': revision.commit },
      h('p', { className: 'konzilo-passage-when' }, h('time', { dateTime: revision.moment }, savedWords(revision.moment)), revision.current ? h('strong', { className: 'konzilo-passage-current' }, ` ${say('passage.currentVersion')}`) : null),
      ...revision.around.map((around, at) => h(Around, { key: at, around })),
      revision.count > revision.around.length ? h('p', { className: 'konzilo-deleted-note' }, wordsShown({ name: 'passage.morePlaces', values: { count: revision.count - revision.around.length } })) : null))),
    file.more > 0 ? h('p', { className: 'konzilo-deleted-note' }, wordsShown({ name: 'passage.moreRevisions', values: { count: file.more } })) : null);
}

// What the search found: the files whose current version holds the passage, those whose old
// revisions alone do, and the saves whose message names it, and the way to purge it, where no
// current version holds it.
function Found({ found, collections, onPurge }) {
  const { createElement: h } = react();
  const current = found.files.filter((file) => file.current);
  const old = found.files.filter((file) => !file.current);
  const { counted } = found;
  if (counted.files === 0 && counted.messages === 0) return h('p', { className: 'konzilo-deleted-state', role: 'status' }, say('passage.none'));
  return h('div', { className: 'konzilo-passage-found' },
    h('p', { role: 'status' }, changedWords('passage.found', counted)),
    current.length > 0
      ? h('section', { 'aria-labelledby': 'konzilo-passage-current' },
        h('h2', { id: 'konzilo-passage-current' }, say('passage.currentHeading')),
        h('p', { role: 'alert', className: 'konzilo-passage-refusal' }, say('passage.currentWords')),
        h('ul', { className: 'konzilo-passage-files' }, current.map((file) => h(FileFound, { key: file.path, file, collections }))))
      : h('div', { className: 'konzilo-deleted-ways' },
        h('button', { type: 'button', className: 'konzilo-deleted-button konzilo-purge-open', onClick: onPurge }, say('passage.purge'))),
    old.length > 0
      ? h('section', { 'aria-labelledby': 'konzilo-passage-old' },
        h('h2', { id: 'konzilo-passage-old' }, say('passage.oldHeading')),
        h('ul', { className: 'konzilo-passage-files' }, old.map((file) => h(FileFound, { key: file.path, file, collections }))))
      : null,
    counted.files > found.files.length ? h('p', { className: 'konzilo-deleted-note' }, wordsShown({ name: 'passage.moreFiles', values: { count: counted.files - found.files.length } })) : null,
    found.messages.length > 0
      ? h('section', { 'aria-labelledby': 'konzilo-passage-messages' },
        h('h2', { id: 'konzilo-passage-messages' }, say('passage.messagesHeading')),
        h('ul', { className: 'konzilo-passage-files' }, found.messages.map((one) => h('li', { key: one.commit, className: 'konzilo-passage-file', 'data-commit': one.commit },
          h('p', { className: 'konzilo-passage-when' }, h('time', { dateTime: one.moment }, savedWords(one.moment))),
          ...one.around.map((around, at) => h(Around, { key: at, around }))))))
      : null,
    counted.messages > found.messages.length ? h('p', { className: 'konzilo-deleted-note' }, wordsShown({ name: 'passage.moreMessages', values: { count: counted.messages - found.messages.length } })) : null);
}

// `config`: Sveltia's configuration, whose collections name the forms.
export function passagePage({ config }) {
  const collections = config.collections ?? [];
  const collectionOf = (name) => collections.find((one) => one.name === name);
  const service = purgeService({ credential: signedInCredential });
  return function KonziloPassagePage() {
    const { createElement: h, useEffect, useRef, useState } = react();
    const [standing, setStanding] = useState(undefined);
    const [text, setText] = useState('');
    const [sought, setSought] = useState(null);
    const [answer, setAnswer] = useState(undefined);
    const [searching, setSearching] = useState(false);
    const [purging, setPurging] = useState(false);
    const [purged] = useState(() => purgingBefore());
    const purgeFrom = useRef(null);
    // Whether the one reading is an Admin, and how the purge this tab asked for went.
    useEffect(() => {
      let gone = false;
      service.status().then((now) => {
        if (!gone) setStanding(now);
      });
      return () => {
        gone = true;
      };
    }, []);
    const page = (...children) => h('div', { className: 'konzilo-deleted konzilo-passage' }, ...children);
    if (standing === undefined) return page(h('p', { className: 'konzilo-deleted-state', role: 'status' }, say('passage.loading')));
    if (standing === null) return page(h('p', { className: 'konzilo-deleted-state', role: 'alert' }, say('passage.unknown')));
    if (!standing.admin) return page(h('p', { className: 'konzilo-deleted-note' }, say('passage.adminOnly')));

    const outcome = purged !== null && standing.purge?.id === purged && standing.purge.state === 'done' ? standing.purge : null;
    const search = async (event) => {
      event.preventDefault();
      const passage = normal(text);
      if ([...passage].length < LEAST || [...passage].length > MOST) {
        setAnswer({ refused: true });
        return;
      }
      setSearching(true);
      setAnswer(undefined);
      const [given] = await Promise.all([service.search(passage), refreshed()]);
      setSearching(false);
      setSought(passage);
      setAnswer(given);
    };
    const openPurge = () => {
      purgeFrom.current = document.activeElement;
      setPurging(true);
    };
    const closePurge = () => {
      setPurging(false);
      purgeFrom.current?.focus?.();
    };
    let told = null;
    if (searching) told = h('p', { className: 'konzilo-deleted-state', role: 'status' }, say('passage.searching'));
    else if (answer === null) told = h('p', { className: 'konzilo-deleted-state', role: 'alert' }, say('passage.failed'));
    else if (answer?.refused) told = h('p', { className: 'konzilo-deleted-state', role: 'alert' }, wordsShown({ name: 'passage.refused', values: { least: LEAST, most: MOST } }));
    else if (answer?.busy) told = h('p', { className: 'konzilo-deleted-state', role: 'alert' }, say('passage.busy'));
    return page(
      outcome ? h('p', { className: 'konzilo-deleted-told', role: 'status' }, changedWords('passage.purgedNow', outcome.changed)) : null,
      purging ? h(PurgeDialog, { subject: passageSubject(sought, service), service, collectionOf, onClose: closePurge }) : null,
      h('p', { className: 'konzilo-deleted-note' }, say('passage.about')),
      h('form', { role: 'search', className: 'konzilo-passage-search', onSubmit: search },
        h('label', { htmlFor: 'konzilo-passage-text' }, say('passage.text')),
        h('div', { className: 'konzilo-passage-row' },
          h('input', { id: 'konzilo-passage-text', type: 'search', value: text, maxLength: MOST, autoComplete: 'off', spellCheck: false, onChange: (event) => setText(event.target.value) }),
          h('button', { type: 'submit', className: 'konzilo-deleted-button', disabled: searching }, say('passage.find')))),
      told,
      answer?.found ? h(Found, { key: sought, found: answer.found, collections, onPurge: openPurge }) : null);
  };
}
