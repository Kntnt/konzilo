// The forms' kind (ADR 0045): a site's declared forms, taken at /_konzilo/forms/<form>. The page's
// script asks for the form's timing token at /_konzilo/forms/<form>/token once the form comes
// into use, and sends the form as JSON; a browser without JavaScript posts it as a form's own
// encoding and is led back to the page with the outcome in the fragment, where the page shows it
// (src/astro/forms.js).

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { pageLanguage } from '../astro/languages.js';
import { languageTag } from '../site-description.js';

export const FORMS_PATH = '/_konzilo/forms';

// The most a submission's body takes: a form's text fields take 20 000 characters together
// (FORM_CHARACTERS), which a browser writes in at most twelve bytes each, as JSON or as a form's
// own encoding, and the rest is names and choices.
export const BODY_LIMIT = 512 * 1024;

// The site's own fields of a submission, beside the form's.
const PAGE = '_page';
const TRAP = '_website';
const TOKEN = '_token';

const JSON_TYPE = 'application/json';

// The path a submission came from, or the site's root where it names none a browser could be led
// back to: a path on the site's own host, with no fragment, written as a browser writes one, in
// printable ASCII, with no space or backslash.
const pageOf = (given) => {
  const page = typeof given === 'string' ? given.split('#')[0] : '';
  return /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]*$/.test(page) && page.length <= 2048 ? page : '/';
};

// An email address as the browser checks one, with a dot in its domain, as every address mail
// reaches has, and a phone number as the page's script checks one (src/astro/forms.js). The
// script lets an address with no dot in its domain through, as the browser does, and names
// it beside its field when the service refuses it.
const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
const TEL = /^\+?[0-9 ().\/-]*[0-9][0-9 ().\/-]*$/;

const CHOICES = ['select', 'radio'];
const BOXES = ['checkbox', 'acceptance'];

// A field's value as a submission gives it, as JSON, or as a form's own encoding, where a box
// ticked is there and one left is not: a text, its lines ended alike and nothing around it; a box
// ticked or not; or the boxes ticked. Gives { value } or, for a value the page's script would not
// send, { problem }, as the page names it beside the field.
function given(field, fields, encoded) {
  if (encoded) {
    const values = fields.getAll(field.name);
    if (field.kind === 'checkboxes') return { value: values };
    if (values.length > 1) return { problem: 'malformed' };
    if (BOXES.includes(field.kind)) return { value: values.length > 0 };
    return { value: (values[0] ?? '').replace(/\r\n?/g, '\n') };
  }
  const value = fields[field.name];
  if (field.kind === 'checkboxes') {
    if (value === undefined) return { value: [] };
    return Array.isArray(value) && value.every((one) => typeof one === 'string') ? { value } : { problem: 'malformed' };
  }
  if (BOXES.includes(field.kind)) {
    if (value === undefined) return { value: false };
    return typeof value === 'boolean' ? { value } : { problem: 'malformed' };
  }
  if (value === undefined) return { value: '' };
  return typeof value === 'string' ? { value: value.replace(/\r\n?/g, '\n') } : { problem: 'malformed' };
}

// A field's value as it is kept, or the problem the page names beside the field, as the page's
// script checks it: { value } or { problem }.
function checked(field, fields, encoded) {
  const read = given(field, fields, encoded);
  if (read.problem) return read;
  const { value } = read;
  if (field.kind === 'checkbox') return read;
  if (field.kind === 'acceptance') return value ? read : { problem: 'missing' };
  if (field.kind === 'checkboxes') {
    const ticked = [...new Set(value)];
    if (ticked.some((one) => !field.options.includes(one))) return { problem: 'not-an-option' };
    return field.required && ticked.length === 0 ? { problem: 'missing' } : { value: ticked };
  }
  const text = value.trim();
  if (text === '') return field.required ? { problem: 'missing' } : { value: text };
  if (CHOICES.includes(field.kind)) return field.options.includes(text) ? { value: text } : { problem: 'not-an-option' };
  if ([...text].length > field.maxLength) return { problem: 'too-long' };
  if (field.kind === 'email' && !(EMAIL.test(text) && text.split('@')[1].includes('.'))) return { problem: 'not-email' };
  if (field.kind === 'tel' && !TEL.test(text)) return { problem: 'not-tel' };
  return { value: text };
}

// An outcome as the page shows it (src/astro/forms.js): to the page's script, as JSON with the
// status given; to a browser without JavaScript, by leading it back to the page it came from,
// with the outcome's id in the fragment, `konzilo-form-<form>-<outcome>`.
function outcome(name, { status, outcome: said, ...more }, { encoded, page }) {
  if (encoded) return { status: 303, location: `${page}#konzilo-form-${name}-${said}` };
  return { status, json: { outcome: said, ...more } };
}

// `site()`: the site description in use. `store`: as store.js opens it. `now()`: the moment.
export function formsKind({ site, store, now }) {
  const tokenKey = createHmac('sha256', store.key).update('timing tokens').digest();
  const signed = (form, issued, nonce) => createHmac('sha256', tokenKey).update(`${form}\n${issued}\n${nonce}`).digest('base64url');

  const token = (form) => {
    const issued = Math.floor(now().getTime() / 1000);
    const nonce = randomBytes(12).toString('base64url');
    return `${issued}.${nonce}.${signed(form, issued, nonce)}`;
  };

  return {
    path: FORMS_PATH,
    methods: ['GET', 'POST'],
    types: [JSON_TYPE, 'application/x-www-form-urlencoded'],
    limit: BODY_LIMIT,

    take({ method, below, body, type }) {
      const [, name, rest] = /^\/([^/]+)(\/.*)?$/.exec(below) ?? [];
      const { forms, languages } = site();
      const form = name === undefined ? undefined : forms[name];
      if (method === 'GET') {
        if (form && rest === '/token') return { status: 200, json: { token: token(name) } };
        return { status: 404 };
      }
      const encoded = type !== JSON_TYPE;
      const fields = encoded ? new URLSearchParams(body.toString('utf8')) : JSON.parse(body.toString('utf8'));
      const page = pageOf(encoded ? fields.get(PAGE) : fields[PAGE]);
      const language = languageTag(pageLanguage(new URL(page, 'http://site').pathname, languages)?.locale ?? null);
      const read = form.fields.map((field) => ({ field, ...checked(field, fields, encoded) }));
      const wrong = read.filter(({ problem }) => problem !== undefined);
      if (wrong.length > 0) {
        return outcome(name, { status: 400, outcome: 'invalid', fields: Object.fromEntries(wrong.map(({ field, problem }) => [field.name, problem])) }, { encoded, page });
      }
      store.keep({
        form: name,
        sentAt: now(),
        language,
        spam: null,
        fields: read.map(({ field, value }) => ({ name: field.name, label: field.label, value })),
      });
      return outcome(name, { status: 200, outcome: 'sent' }, { encoded, page });
    },
  };
}
