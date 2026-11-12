// How the site mails each form's submissions, as an Admin sets it on the *Mail* page (ADR 0003,
// ADR 0045): the adapter, `none` until an Admin chooses another, its settings, and each form's
// recipients, all kept in the service's data and none in Git, since the one holds a password and
// the other where visitors' messages go. What the page is shown, and what it may save.

import { ADAPTERS, FAILURE_SETTING, isAddress, MAIL_OFF, MAIL_SETTING } from './mail.js';
import { SECURITIES } from './smtp.js';

// The most recipients a form has: a team, not a mailing list.
const RECIPIENTS_AT_MOST = 50;
// The longest a text of the settings may be.
const TEXT_AT_MOST = 256;

// A host as a name or an IPv4 address.
const HOST = /^(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;

const SMTP_UNSET = Object.freeze({ host: '', port: SECURITIES.starttls, security: 'starttls', username: '', password: '', sender: '' });

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const textOf = (value) => (typeof value === 'string' ? value.trim() : '');
const portOf = (value) => {
  if (Number.isInteger(value)) return value;
  return typeof value === 'string' && /^[0-9]{1,5}$/.test(value.trim()) ? Number(value) : null;
};

// What the page is shown: the adapter and its settings, the password by whether there is one;
// each form the site declares, by its name and label, with its recipients; whether this is a
// local copy, which writes each mail to its log and sends none; and the last mail that could not
// be sent, and why, or null.
export function mailSettingsShown({ store, forms, local }) {
  const mail = store.setting(MAIL_SETTING) ?? MAIL_OFF;
  const smtp = { ...SMTP_UNSET, ...mail.smtp };
  const kept = store.formSettings();
  return {
    local,
    adapter: mail.adapter,
    smtp: { ...smtp, password: smtp.password !== '' },
    forms: Object.values(forms).map(({ name, label }) => ({ name, label, recipients: kept[name]?.recipients ?? [] })),
    failure: store.setting(FAILURE_SETTING),
  };
}

// The SMTP settings as given, each text trimmed, and the password kept where none is given but a
// username is: { smtp, problems }, the problems by the setting's name, where mail goes by SMTP.
function smtpOf(given, kept, checked) {
  const smtp = {
    host: textOf(given.host),
    port: portOf(given.port),
    security: textOf(given.security) || SMTP_UNSET.security,
    username: textOf(given.username),
    password: typeof given.password === 'string' ? given.password : '',
    sender: textOf(given.sender),
  };
  if (smtp.username === '') smtp.password = '';
  else if (smtp.password === '') smtp.password = kept?.password ?? '';
  const problems = {};
  for (const [name, value] of Object.entries(smtp)) {
    if (typeof value === 'string' && (value.length > TEXT_AT_MOST || /[\0-\x1f\x7f]/.test(value))) problems[name] = 'malformed';
  }
  if (!Object.hasOwn(SECURITIES, smtp.security)) problems.security = 'unknown';
  if (checked) {
    if (smtp.host === '') problems.host = 'missing';
    else if (!HOST.test(smtp.host)) problems.host ??= 'not-host';
    if (given.port === undefined || given.port === null || given.port === '') problems.port = 'missing';
    else if (smtp.port === null || smtp.port < 1 || smtp.port > 65535) problems.port = 'not-port';
    if (smtp.username !== '' && smtp.security === 'none') problems.username ??= 'needs-encryption';
    if (smtp.sender === '') problems.sender = 'missing';
    else if (!isAddress(smtp.sender)) problems.sender ??= 'not-email';
  }
  return { smtp: { ...smtp, port: smtp.port ?? SMTP_UNSET.port }, problems };
}

// What an Admin saves, `given`, checked: { problems }, by where each is, such as `smtp.host` or
// `forms.contact.recipients.1`, or { mail, recipients }, the settings to keep and each form's
// recipients by its name, each address once. The SMTP settings are checked where mail goes by
// SMTP, and kept as they are given where it is off, for when it is turned on again.
export function checkMailSettings(given, { store, forms }) {
  if (!isObject(given)) return { problems: { '': 'malformed' } };
  const problems = {};
  const adapter = textOf(given.adapter);
  if (!ADAPTERS.includes(adapter)) problems.adapter = 'unknown';
  const kept = store.setting(MAIL_SETTING)?.smtp ?? null;
  const read = smtpOf(isObject(given.smtp) ? given.smtp : {}, kept, adapter === 'smtp');
  for (const [name, problem] of Object.entries(read.problems)) problems[`smtp.${name}`] = problem;

  const recipients = {};
  for (const [name, form] of Object.entries(isObject(given.forms) ? given.forms : {})) {
    if (!Object.hasOwn(forms, name)) {
      problems[`forms.${name}`] = 'unknown';
      continue;
    }
    const list = isObject(form) ? form.recipients : undefined;
    if (!Array.isArray(list) || !list.every((one) => typeof one === 'string')) {
      problems[`forms.${name}.recipients`] = 'malformed';
      continue;
    }
    const addresses = [...new Set(list.map((one) => one.trim()))].filter((one) => one !== '');
    if (addresses.length > RECIPIENTS_AT_MOST) problems[`forms.${name}.recipients`] = 'too-many';
    list.forEach((one, at) => {
      if (one.trim() !== '' && !isAddress(one.trim())) problems[`forms.${name}.recipients.${at}`] = 'not-email';
    });
    recipients[name] = addresses;
  }
  if (Object.keys(problems).length > 0) return { problems };
  return { mail: { adapter, smtp: read.smtp }, recipients };
}
