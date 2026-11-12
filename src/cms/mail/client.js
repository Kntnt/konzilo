// What the *Mail* page asks of the service (ADR 0003, ADR 0045), and what it makes of the answers:
// how the site mails each form's submissions and how long it keeps them, saving it, the
// recipients as an Admin writes them, and each problem beside its field. It holds no React.

import { say } from '../interface-language.js';
import { askAsAdmin, fetching } from '../service.js';

const MAIL_PATH = '/_konzilo/mail';

// What the service answers, as the page takes it: { settings }, { problems } for a save it
// refused, { adminOnly } for one who may write and is no Admin, or null where it cannot be told.
const answered = (init, { credential, ask }) => askAsAdmin(MAIL_PATH, init, {
  credential,
  ask,
  read: async (answer) => {
    if (answer.status === 400) {
      const { problems } = await answer.json();
      return problems ? { problems } : null;
    }
    return answer.ok ? { settings: await answer.json() } : null;
  },
});

// How the site sends mail, and to whom: { local, adapter, smtp, forms, failure }, as { settings },
// `failure` the last mail that could not be sent, { at, kind, reply }, or null.
export const readMail = ({ credential, ask = fetching() }) => answered({ method: 'GET' }, { credential, ask });

// What an Admin gives, { adapter, smtp, forms: { <form>: { recipients, retention } } }, saved.
export const saveMail = ({ credential, given, ask = fetching() }) => answered({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(given) }, { credential, ask });

// Whether the password the service keeps, by `shown`, the SMTP settings it gave, signs in with
// `smtp`, as the page's fields hold them: one is kept, and they name the server, the port and the
// username it was kept for, since the service keeps it for no other.
export const passwordKeptFor = (smtp, shown) => shown.password === true && smtp.host.trim() === shown.host && smtp.port.trim() === String(shown.port) && smtp.username.trim() === shown.username;

// The addresses an Admin writes, one per line, or apart by commas, semicolons or spaces.
export const recipientsOf = (written) => written.split(/[\s,;]+/).filter((one) => one !== '');
export const recipientsText = (recipients) => recipients.join('\n');

// Why the last mail could not be sent, by its kind as the service keeps it (src/service/smtp.js),
// each a text of its own.
const FAILURES = {
  unreachable: 'mail.failureUnreachable',
  timeout: 'mail.failureTimeout',
  closed: 'mail.failureClosed',
  certificate: 'mail.failureCertificate',
  encryption: 'mail.failureEncryption',
  'no-starttls': 'mail.failureNoStarttls',
  'no-sign-in': 'mail.failureNoSignIn',
  unencrypted: 'mail.failureUnencrypted',
  greeting: 'mail.failureGreeting',
  starttls: 'mail.failureStarttls',
  'sign-in': 'mail.failureSignIn',
  sender: 'mail.failureSender',
  recipients: 'mail.failureRecipients',
  message: 'mail.failureMessage',
  other: 'mail.failureOther',
};

// Why the last mail could not be sent, { kind, reply }, as the page says it, in the interface
// language: its kind's text, with the server's reply, its code and its text, where it gave one.
export const failureShown = ({ kind, reply }) => say(Object.hasOwn(FAILURES, kind) ? FAILURES[kind] : FAILURES.other, { reply: reply ?? '' });

const PROBLEMS = {
  missing: 'mail.problemMissing',
  'not-host': 'mail.problemNotHost',
  'not-port': 'mail.problemNotPort',
  'needs-encryption': 'mail.problemNeedsEncryption',
  'not-email': 'mail.problemNotEmail',
  'too-many': 'mail.problemTooMany',
  'not-days': 'mail.problemNotDays',
  unknown: 'mail.problemUnknown',
  malformed: 'mail.problemMalformed',
};
const problemText = (problem) => say(PROBLEMS[problem] ?? PROBLEMS.malformed);

// The service's problems, by where each is, as the page shows them beside their fields: each SMTP
// setting's by its name, the adapter's, each form's recipients' as a list, an address by what
// `given` held there, and each form's retention's by the form's name.
export function problemsShown(problems, given) {
  const shown = {};
  for (const [place, problem] of Object.entries(problems)) {
    const [area, name, field, at] = place.split('.');
    if (area === 'smtp') shown[name] = problemText(problem);
    else if (area === 'forms' && field === 'retention') (shown.retention ??= {})[name] = problemText(problem);
    else if (area === 'forms') {
      const address = at === undefined ? undefined : given?.forms?.[name]?.recipients?.[Number(at)];
      shown.forms ??= {};
      (shown.forms[name] ??= []).push(address === undefined || field === undefined ? problemText(problem) : say('mail.problemNotEmailIn', { address }));
    } else shown.adapter = problemText(problem);
  }
  return shown;
}
