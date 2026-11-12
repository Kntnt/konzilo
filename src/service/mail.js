// A form's submissions mailed to its recipients (ADR 0045), by a timed duty of the service in its
// role for editors (ADR 0044), which alone has a way out: each submission once, in its page's
// language, through the adapter an Admin chooses on the *Mail* page (ADR 0003). Mail is off until
// an Admin turns it on, and a submission whose turn comes while it is off, or while its form has
// no recipients, is mailed to no one, then or later; spam never is.

import { catalogueFor, labelIn, text } from '../catalogues.js';
import { valueText } from '../submission-values.js';

// The adapters an Admin chooses among, `none` the one there is until an Admin chooses another.
export const ADAPTERS = Object.freeze(['none', 'smtp']);

// The service's settings these are kept under (store.js): the adapter with its settings, and the
// last mail that could not be sent, with why, which the *Mail* page shows.
export const MAIL_SETTING = 'mail';
export const FAILURE_SETTING = 'mail-failure';

// The settings there are before an Admin keeps any.
export const MAIL_OFF = Object.freeze({ adapter: 'none', smtp: null });

// A mail that could not be sent is tried again after a minute, then after twice as long each
// time, an hour at most, until a day after its submission was sent, when it is given up.
const FIRST_WAIT = 60_000;
const LONGEST_WAIT = 60 * 60_000;
const GIVEN_UP_AFTER = 24 * 60 * 60_000;

// An email address as the forms' kind takes one (forms.js), which a header may hold as it is.
const ADDRESS = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
export const isAddress = (value) => typeof value === 'string' && value.length <= 254 && ADDRESS.test(value);

// The mail of a submission, in its page's language: { from, to, replyTo, subject, language, date,
// text }. `form`: the form as the site declares it, or null for one it no longer does. `sender`:
// the address an Admin names. `recipients`: the form's. It answers to the address the visitor gave
// in the form's first email field, where there is one, and is dated when the submission was sent.
export function submissionMail({ submission, form, sender, recipients }) {
  const language = catalogueFor(submission.language);
  const say = (name, values) => text(language, name, values);
  const label = String(labelIn(form?.label ?? submission.form, submission.language));
  const box = { yes: say('submissions.yes'), no: say('submissions.no') };
  const emails = new Set((form?.fields ?? []).filter(({ kind }) => kind === 'email').map(({ name }) => name));
  const replyTo = submission.fields.find(({ name, value }) => emails.has(name) && isAddress(value))?.value ?? null;
  const fields = submission.fields.map(({ label: named, value }) => `${named}\n${valueText(value, box)}\n`);
  return {
    from: sender,
    to: recipients,
    replyTo,
    subject: say('notification.subject', { form: label }),
    language: submission.language,
    date: new Date(submission.sentAt),
    text: [`${say('notification.intro', { form: label })}\n`, ...fields, `${say('notification.more')}\n`].join('\n'),
  };
}

// The duty. `store`: as store.js opens it. `forms()`: the forms the site description in use
// declares. `deliver(settings, mail)`: hands a mail to the adapter `settings` name, and gives
// { refused }, the recipients it was not given to, or throws, saying why it was given to none.
//
// Gives { run() }, which mails each submission whose mail is due, one after another.
export function mailDuty({ store, forms, deliver, now = () => new Date(), warn = console.error }) {
  return {
    async run() {
      const settings = store.setting(MAIL_SETTING) ?? MAIL_OFF;
      const kept = store.formSettings();
      const declared = forms();
      for (const submission of store.mailDue(now())) {
        const { id, form, sentAt, tries } = submission;
        if (settings.adapter === 'none' || !ADAPTERS.includes(settings.adapter)) {
          store.mailDone(id, 'off');
          continue;
        }
        const recipients = kept[form]?.recipients ?? [];
        if (recipients.length === 0) {
          store.mailDone(id, 'unaddressed');
          continue;
        }
        const mail = submissionMail({ submission, form: Object.hasOwn(declared, form) ? declared[form] : null, sender: settings[settings.adapter].sender, recipients });
        try {
          const { refused } = await deliver(settings, mail);
          store.mailDone(id, 'sent');
          store.setSetting(FAILURE_SETTING, null);
          if (refused.length > 0) warn(`The mail server took the mail of submission ${id} of ${form}, but not for ${refused.join(', ')}`);
        } catch (error) {
          const at = now();
          store.setSetting(FAILURE_SETTING, { at: at.toISOString(), reason: error.message });
          if (at.getTime() - new Date(sentAt).getTime() >= GIVEN_UP_AFTER) {
            store.mailDone(id, 'failed');
            warn(`The service gave up mailing submission ${id} of ${form}, a day after it was sent: ${error.message}`);
          } else {
            const next = new Date(at.getTime() + Math.min(FIRST_WAIT * 2 ** tries, LONGEST_WAIT));
            store.mailLater(id, next);
            warn(`The service could not mail submission ${id} of ${form}, and tries again at ${next.toISOString()}: ${error.message}`);
          }
        }
      }
    },
  };
}
