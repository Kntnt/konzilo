// The Submissions page (ADR 0045): each form's submissions, newest first, with their fields as they
// came, a page at a time, and a form's as CSV by the separator the reader chooses. It is React,
// since that is what Sveltia takes, with its styles on the elements, and it writes nothing.

import { signedInCredential } from '../credential.js';
import { say } from '../interface-language.js';
import { browserTimeZone, downloadCsv, momentShown, offeredSeparator, readForms, submissionPages, valueShown } from './client.js';

const TEXT = { font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
const LINE = { ...TEXT, margin: '4px 0' };
const CONTROLS = { display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'end', margin: '0 0 16px' };
const SUBMISSION = { borderTop: '1px solid rgba(128, 128, 128, 0.3)', padding: '12px 0' };
const FIELDS = { display: 'grid', gridTemplateColumns: 'minmax(8em, max-content) 1fr', gap: '4px 16px', margin: 0, ...TEXT };
const LABEL = { fontWeight: 600 };
const VALUE = { margin: 0, whiteSpace: 'pre-wrap' };

const react = () => globalThis.__SVELTIA_CMS_REACT__;

// What the service answers, kept in the page's state while it is shown, and none once it is gone.
function useAnswer(read, deps) {
  const { useEffect, useState } = react();
  const [answer, setAnswer] = useState(undefined);
  useEffect(() => {
    let gone = false;
    setAnswer(undefined);
    read().then((given) => {
      if (!gone) setAnswer(given);
    });
    return () => {
      gone = true;
    };
  }, deps);
  return [answer, setAnswer];
}

function Submission({ submission }) {
  const { createElement: h } = react();
  return h('li', { style: SUBMISSION },
    h('dl', { style: FIELDS },
      h('dt', { style: LABEL }, say('submissions.sentAt', { timeZone: browserTimeZone() })),
      h('dd', { style: VALUE }, momentShown(submission.sentAt)),
      submission.fields.flatMap(({ name, label, value }, at) => [
        h('dt', { key: `${at}-${name}-label`, style: LABEL }, label),
        h('dd', { key: `${at}-${name}-value`, style: VALUE }, valueShown(value)),
      ])));
}

function Download({ form, credential }) {
  const { createElement: h, useState } = react();
  const [separator, setSeparator] = useState(offeredSeparator);
  const [failed, setFailed] = useState(false);
  const choice = (value, words) => h('label', { style: { ...TEXT, marginInlineEnd: 12 } },
    h('input', { type: 'radio', name: 'konzilo-separator', value, checked: separator === value, onChange: () => setSeparator(value) }), ' ', words);
  return h('div', { style: CONTROLS },
    h('fieldset', { style: { border: 0, margin: 0, padding: 0 } },
      h('legend', { style: { ...TEXT, padding: 0 } }, say('submissions.separator')),
      choice('comma', say('submissions.comma')),
      choice('semicolon', say('submissions.semicolon'))),
    h('button', { type: 'button', onClick: async () => setFailed(!await downloadCsv({ credential, form, separator })) }, say('submissions.download')),
    failed ? h('p', { role: 'alert', style: LINE }, say('submissions.downloadFailed')) : null);
}

// A form's submissions, its own pages for as long as it is shown: a click on *Show older* while
// they are on their way asks for nothing more (submissionPages()).
function FormSubmissions({ form, credential }) {
  const { createElement: h, useRef } = react();
  const pages = useRef(null);
  pages.current ??= submissionPages({ credential, form });
  const [shown, setShown] = useAnswer(() => pages.current.first(), [form]);
  if (shown === undefined) return null;
  if (shown === null) return h('p', { style: LINE }, say('submissions.unknown'));
  const older = async () => {
    const next = await pages.current.older();
    if (next) setShown(next);
  };
  return h('div', null,
    shown.submissions.length === 0 ? h('p', { style: LINE }, say('submissions.none')) : null,
    h('ol', { style: { listStyle: 'none', margin: 0, padding: 0 } }, shown.submissions.map((submission) => h(Submission, { key: submission.id, submission }))),
    shown.more ? h('button', { type: 'button', onClick: older }, say('submissions.older')) : null);
}

export function submissionsPage({ credential = signedInCredential } = {}) {
  return function KonziloSubmissionsPage() {
    const { createElement: h, useState } = react();
    const [answer] = useAnswer(() => readForms({ credential }), []);
    const [chosen, setChosen] = useState(null);
    const page = (...children) => h('div', { style: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' } }, ...children);
    if (answer === undefined) return null;
    if (answer === null) return page(h('p', { style: LINE }, say('submissions.unknown')));
    const { forms } = answer;
    if (forms.length === 0) return page(h('p', { style: LINE }, say('submissions.noForms')));
    // The first form anything was sent with, where none is chosen yet.
    const form = chosen ?? (forms.find(({ count }) => count > 0) ?? forms[0]).name;
    return page(
      h('div', { style: CONTROLS },
        h('label', { style: { ...TEXT, display: 'grid', gap: 4 } },
          say('submissions.form'),
          h('select', { value: form, onChange: (event) => setChosen(event.target.value) },
            forms.map(({ name, label, count }) => h('option', { key: name, value: name }, `${label} (${count})`))))),
      h(Download, { key: `${form}-download`, form, credential }),
      h(FormSubmissions, { key: form, form, credential }));
  };
}
