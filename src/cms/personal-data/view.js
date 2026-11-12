// The *Personal data* page (ADR 0045): a person's submissions, as privacy law asks, which an Admin
// alone finds by what the person wrote, in every form, spam among them, each ticked until the
// Admin unticks one that is not theirs, and then downloads as CSV for the person, or erases once
// asked whether for good. It is React, since that is what Sveltia takes, with its styles on the
// elements.

import { signedInCredential } from '../credential.js';
import { say } from '../interface-language.js';
import { momentShown } from '../submissions/client.js';
import { Download, SubmissionFields } from '../submissions/view.js';
import { downloadTheirs, eraseTheirs, findTheirs } from './client.js';

const TEXT = { font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
const LINE = { ...TEXT, margin: '4px 0 12px', maxWidth: '60em' };
const ROW = { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end', margin: '0 0 16px' };
const SUBMISSION = { borderTop: '1px solid rgba(128, 128, 128, 0.3)', padding: '12px 0' };
const PROBLEM = { ...TEXT, color: '#b3261e' };

const react = () => globalThis.__SVELTIA_CMS_REACT__;

// What was found, each ticked until unticked, and the erasure: asked whether for good, then done.
function Found({ found, credential, onErased }) {
  const { createElement: h, useState } = react();
  const [ticked, setTicked] = useState(() => new Set(found.submissions.map(({ id }) => id)));
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  if (found.submissions.length === 0) return h('p', { role: 'status', style: LINE }, say('personalData.none'));
  const ids = found.submissions.map(({ id }) => id).filter((id) => ticked.has(id));
  const tick = (id, on) => {
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
    setAsking(false);
  };
  const erase = async () => {
    const result = await eraseTheirs({ credential, ids });
    setAsking(false);
    if (result?.erased === undefined) setFailed(true);
    else onErased(result.erased);
  };
  return h('div', null,
    h('p', { role: 'status', style: LINE }, say('personalData.found', { count: found.submissions.length })),
    found.more ? h('p', { style: LINE }, say('personalData.more')) : null,
    h(Download, { download: (separator) => downloadTheirs({ credential, ids, separator }), disabled: ids.length === 0 }),
    h('div', { style: ROW },
      asking
        ? h('div', { role: 'alertdialog', 'aria-labelledby': 'konzilo-personal-data-sure', style: { display: 'grid', gap: 8 } },
          h('p', { id: 'konzilo-personal-data-sure', style: { ...LINE, margin: 0 } }, say('personalData.eraseSure')),
          h('div', { style: { display: 'flex', gap: 8 } },
            h('button', { type: 'button', onClick: erase }, say('personalData.eraseForGood')),
            h('button', { type: 'button', onClick: () => setAsking(false) }, say('personalData.cancel'))))
        : h('button', { type: 'button', disabled: ids.length === 0, onClick: () => setAsking(true) }, say('personalData.erase')),
      failed ? h('p', { role: 'alert', style: { ...LINE, ...PROBLEM } }, say('personalData.eraseFailed')) : null),
    h('ol', { style: { listStyle: 'none', margin: 0, padding: 0 } }, found.submissions.map((submission) => {
      const id = `konzilo-personal-data-${submission.id}`;
      return h('li', { key: submission.id, style: SUBMISSION },
        h('label', { htmlFor: id, style: { ...TEXT, fontWeight: 600, display: 'block', marginBottom: 6 } },
          h('input', { id, type: 'checkbox', checked: ticked.has(submission.id), onChange: (event) => tick(submission.id, event.target.checked) }),
          ' ', `${submission.label}, ${momentShown(submission.sentAt)}`,
          submission.spam ? ` (${say('personalData.spam')})` : ''),
        h(SubmissionFields, { submission }));
    })));
}

export function personalDataPage({ credential = signedInCredential } = {}) {
  return function KonziloPersonalDataPage() {
    const { createElement: h, useState } = react();
    const [text, setText] = useState('');
    // What the last search was by, which a search after an erasure is by again.
    const [sought, setSought] = useState('');
    // What the last search found: undefined before any, null where the service could not be told.
    const [answer, setAnswer] = useState(undefined);
    const [searching, setSearching] = useState(false);
    const [erased, setErased] = useState(null);
    // A new search draws its results anew, every one ticked.
    const [round, setRound] = useState(0);
    const search = async (by) => {
      setSought(by);
      setSearching(true);
      const given = await findTheirs({ credential, text: by });
      setSearching(false);
      setAnswer(given);
      setRound((one) => one + 1);
    };
    const page = (...children) => h('div', { style: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' } }, ...children);
    if (answer?.adminOnly) return page(h('p', { style: LINE }, say('personalData.adminOnly')));
    return page(
      h('p', { style: LINE }, say('personalData.intro')),
      h('form', {
        role: 'search',
        style: ROW,
        onSubmit: (event) => {
          event.preventDefault();
          if (text.trim() === '') return;
          setErased(null);
          search(text);
        },
      },
      h('div', { style: { ...TEXT, display: 'grid', gap: 4 } },
        h('label', { htmlFor: 'konzilo-personal-data-text' }, say('personalData.text')),
        h('input', { id: 'konzilo-personal-data-text', type: 'search', value: text, maxLength: 256, onChange: (event) => setText(event.target.value), style: { minWidth: '20em' } })),
      h('button', { type: 'submit', disabled: searching }, say('personalData.find'))),
      erased === null ? null : h('p', { role: 'status', style: LINE }, say('personalData.erased', { count: erased })),
      answer === null ? h('p', { role: 'alert', style: LINE }, say('personalData.unknown')) : null,
      answer?.found ? h(Found, {
        key: round,
        found: answer.found,
        credential,
        onErased: (count) => {
          setErased(count);
          search(sought);
        },
      }) : null);
  };
}
