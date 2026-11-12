// What the *Mail* page asks of the service (ADR 0003, ADR 0045), and what it makes of the answers:
// how the site mails each form's submissions, saving it, the recipients as an Admin writes them,
// and each problem beside its field. The service asks Forgejo who is asking, so each request
// carries what Sveltia signed in with. It holds no React.

import { say } from '../interface-language.js';

const MAIL_PATH = '/_konzilo/mail';

const fetching = () => globalThis.fetch.bind(globalThis);

// What the service answers, as the page takes it: { settings }, { problems } for a save it
// refused, { adminOnly } for one who may write and is no Admin, or null where it cannot be told.
async function answered(init, { credential, ask }) {
  const held = credential();
  if (!held) return null;
  try {
    const answer = await ask(MAIL_PATH, { ...init, headers: { authorization: held, ...init.headers }, cache: 'no-store' });
    if (answer.status === 403) return { adminOnly: true };
    if (answer.status === 400) {
      const { problems } = await answer.json();
      return problems ? { problems } : null;
    }
    return answer.ok ? { settings: await answer.json() } : null;
  } catch {
    return null;
  }
}

// How the site sends mail, and to whom: { local, adapter, smtp, forms, failure }, as { settings }.
export const readMail = ({ credential, ask = fetching() }) => answered({ method: 'GET' }, { credential, ask });

// What an Admin gives, { adapter, smtp, forms: { <form>: { recipients } } }, saved.
export const saveMail = ({ credential, given, ask = fetching() }) => answered({ method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(given) }, { credential, ask });

// The addresses an Admin writes, one per line, or apart by commas, semicolons or spaces.
export const recipientsOf = (written) => written.split(/[\s,;]+/).filter((one) => one !== '');
export const recipientsText = (recipients) => recipients.join('\n');

const PROBLEMS = {
  missing: 'mail.problemMissing',
  'not-host': 'mail.problemNotHost',
  'not-port': 'mail.problemNotPort',
  'needs-encryption': 'mail.problemNeedsEncryption',
  'not-email': 'mail.problemNotEmail',
  'too-many': 'mail.problemTooMany',
  unknown: 'mail.problemUnknown',
  malformed: 'mail.problemMalformed',
};
const problemText = (problem) => say(PROBLEMS[problem] ?? PROBLEMS.malformed);

// The service's problems, by where each is, as the page shows them beside their fields: each SMTP
// setting's by its name, the adapter's, and each form's as a list, an address by what `given`
// held there.
export function problemsShown(problems, given) {
  const shown = {};
  for (const [place, problem] of Object.entries(problems)) {
    const [area, name, field, at] = place.split('.');
    if (area === 'smtp') shown[name] = problemText(problem);
    else if (area === 'forms') {
      const address = at === undefined ? undefined : given?.forms?.[name]?.recipients?.[Number(at)];
      shown.forms ??= {};
      (shown.forms[name] ??= []).push(address === undefined || field === undefined ? problemText(problem) : say('mail.problemNotEmailIn', { address }));
    } else shown.adapter = problemText(problem);
  }
  return shown;
}
