// The *Mail* page (ADR 0003, ADR 0045): how the site mails each form's submissions, and to whom,
// which an Admin alone sees and sets: the adapter, off until an Admin turns it on, its SMTP
// settings, and each form's recipients, all kept in the service and none in Git. It is React,
// since that is what Sveltia takes, with its styles on the elements.

import { signedInCredential } from '../credential.js';
import { say } from '../interface-language.js';
import { momentShown } from '../submissions/client.js';
import { problemsShown, readMail, recipientsOf, recipientsText, saveMail } from './client.js';

const TEXT = { font: '14px/1.4 system-ui, sans-serif', overflowWrap: 'anywhere' };
const LINE = { ...TEXT, margin: '4px 0 12px', maxWidth: '60em' };
const SET = { border: 0, margin: '0 0 20px', padding: 0, display: 'grid', gap: 10, maxWidth: '40em' };
const LEGEND = { ...TEXT, fontWeight: 600, padding: 0, marginBottom: 6 };
const FIELD = { ...TEXT, display: 'grid', gap: 4 };
const PROBLEM = { ...TEXT, margin: 0, color: '#b3261e' };

const react = () => globalThis.__SVELTIA_CMS_REACT__;

// What the page's fields hold, from what the service keeps: the password always empty, since the
// service never gives it back, and each form's recipients one per line.
const draftOf = ({ adapter, smtp, forms }) => ({
  adapter,
  smtp: { host: smtp.host, port: String(smtp.port), security: smtp.security, username: smtp.username, password: '', sender: smtp.sender },
  recipients: Object.fromEntries(forms.map(({ name, recipients }) => [name, recipientsText(recipients)])),
});
const givenOf = ({ adapter, smtp, recipients }) => ({
  adapter,
  smtp,
  forms: Object.fromEntries(Object.entries(recipients).map(([name, written]) => [name, { recipients: recipientsOf(written) }])),
});

// A text field with its label, and its problem beside it. The label names the field by `for`
// rather than around it, since a label around a field that holds text takes the text into its name.
function Field({ id, label, value, problem, onChange, ...rest }) {
  const { createElement: h } = react();
  return h('div', { style: FIELD },
    h('label', { htmlFor: id }, label),
    h('input', { id, value, onChange: (event) => onChange(event.target.value), 'aria-invalid': problem ? 'true' : undefined, 'aria-describedby': problem ? `${id}-problem` : undefined, ...rest }),
    problem ? h('p', { id: `${id}-problem`, style: PROBLEM }, problem) : null);
}

// Choices of one name, each a radio button with its words.
function Choices({ name, legend, value, options, problem, onChange }) {
  const { createElement: h } = react();
  return h('fieldset', { style: SET },
    h('legend', { style: LEGEND }, legend),
    options.map(([option, words]) => h('label', { key: option, style: TEXT },
      h('input', { type: 'radio', name, value: option, checked: value === option, onChange: () => onChange(option) }), ' ', words)),
    problem ? h('p', { style: PROBLEM }, problem) : null);
}

function Smtp({ smtp, kept, problems, onChange }) {
  const { createElement: h } = react();
  const set = (name) => (value) => onChange({ ...smtp, [name]: value });
  return h('div', { style: { display: 'grid', gap: 10, maxWidth: '40em', margin: '0 0 20px' } },
    h(Field, { id: 'konzilo-mail-host', label: say('mail.host'), value: smtp.host, problem: problems.host, onChange: set('host'), autoComplete: 'off' }),
    h(Field, { id: 'konzilo-mail-port', label: say('mail.port'), value: smtp.port, problem: problems.port, onChange: set('port'), inputMode: 'numeric', autoComplete: 'off' }),
    h(Choices, {
      name: 'konzilo-mail-security',
      legend: say('mail.security'),
      value: smtp.security,
      problem: problems.security,
      options: [['starttls', say('mail.starttls')], ['tls', say('mail.tls')], ['none', say('mail.unencrypted')]],
      onChange: set('security'),
    }),
    h(Field, { id: 'konzilo-mail-username', label: say('mail.username'), value: smtp.username, problem: problems.username, onChange: set('username'), autoComplete: 'off' }),
    h(Field, { id: 'konzilo-mail-password', label: say('mail.password'), type: 'password', value: smtp.password, problem: problems.password, onChange: set('password'), autoComplete: 'new-password', placeholder: kept ? say('mail.passwordKept') : '' }),
    h(Field, { id: 'konzilo-mail-sender', label: say('mail.sender'), type: 'email', value: smtp.sender, problem: problems.sender, onChange: set('sender'), autoComplete: 'off' }));
}

function Recipients({ forms, recipients, problems, onChange }) {
  const { createElement: h } = react();
  return h('fieldset', { style: SET },
    h('legend', { style: LEGEND }, say('mail.recipients')),
    h('p', { style: { ...LINE, margin: 0 } }, say('mail.recipientsHelp')),
    forms.map(({ name, label }) => {
      const id = `konzilo-mail-recipients-${name}`;
      const wrong = problems[name] ?? [];
      return h('div', { key: name, style: FIELD },
        h('label', { htmlFor: id }, label),
        h('textarea', { id, rows: 3, value: recipients[name] ?? '', onChange: (event) => onChange({ ...recipients, [name]: event.target.value }), 'aria-invalid': wrong.length > 0 ? 'true' : undefined, 'aria-describedby': wrong.length > 0 ? `${id}-problem` : undefined }),
        wrong.length > 0 ? h('div', { id: `${id}-problem` }, wrong.map((problem) => h('p', { key: problem, style: PROBLEM }, problem))) : null);
    }));
}

export function mailPage({ credential = signedInCredential } = {}) {
  return function KonziloMailPage() {
    const { createElement: h, useEffect, useState } = react();
    const [answer, setAnswer] = useState(undefined);
    const [draft, setDraft] = useState(null);
    const [problems, setProblems] = useState({});
    const [said, setSaid] = useState(null);
    useEffect(() => {
      let gone = false;
      readMail({ credential }).then((given) => {
        if (gone) return;
        setAnswer(given);
        if (given?.settings) setDraft(draftOf(given.settings));
      });
      return () => {
        gone = true;
      };
    }, []);
    const page = (...children) => h('div', { style: { padding: 16, overflow: 'auto', height: '100%', boxSizing: 'border-box' } }, ...children);
    if (answer === undefined) return null;
    if (answer === null) return page(h('p', { style: LINE }, say('mail.unknown')));
    if (answer.adminOnly) return page(h('p', { style: LINE }, say('mail.adminOnly')));
    if (draft === null) return null;
    const { settings } = answer;

    const save = async (event) => {
      event.preventDefault();
      setSaid('mail.saving');
      const given = givenOf(draft);
      const result = await saveMail({ credential, given });
      if (result?.settings) {
        setAnswer(result);
        setDraft(draftOf(result.settings));
        setProblems({});
        setSaid('mail.saved');
      } else if (result?.problems) {
        setProblems(problemsShown(result.problems, given));
        setSaid('mail.notSaved');
      } else if (result?.adminOnly) {
        setAnswer(result);
      } else {
        setSaid('mail.saveFailed');
      }
    };

    return page(
      h('p', { style: LINE }, say('mail.intro')),
      settings.local ? h('p', { style: LINE }, say('mail.local')) : null,
      settings.failure ? h('p', { role: 'alert', style: { ...LINE, ...PROBLEM } }, say('mail.failure', { at: momentShown(settings.failure.at), reason: settings.failure.reason })) : null,
      h('form', { onSubmit: save, noValidate: true },
        h(Choices, {
          name: 'konzilo-mail-adapter',
          legend: say('mail.sending'),
          value: draft.adapter,
          problem: problems.adapter,
          options: [['none', say('mail.off')], ['smtp', say('mail.smtp')]],
          onChange: (adapter) => setDraft({ ...draft, adapter }),
        }),
        draft.adapter === 'smtp' ? h(Smtp, { smtp: draft.smtp, kept: settings.smtp.password, problems, onChange: (smtp) => setDraft({ ...draft, smtp }) }) : null,
        h(Recipients, { forms: settings.forms, recipients: draft.recipients, problems: problems.forms ?? {}, onChange: (recipients) => setDraft({ ...draft, recipients }) }),
        h('button', { type: 'submit', disabled: said === 'mail.saving' }, say('mail.save')),
        said ? h('p', { role: said === 'mail.saving' || said === 'mail.saved' ? 'status' : 'alert', style: LINE }, say(said)) : null));
  };
}
