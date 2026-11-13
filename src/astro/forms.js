// A declared form on a page: what Form.astro renders of a form the
// site description declares, in the site's language, and the script,
// formClient(), that sends it with a fetch where JavaScript runs.
//
// The form is a plain HTML form that posts to its address on the site's
// endpoint, /_konzilo/forms/<form>, so it works without JavaScript: the endpoint leads the
// browser back to the page with the outcome in the fragment, which the page
// shows with :target. Where the script runs, it asks for the form's timing
// token once the form comes into use, sends the form as JSON and shows the
// outcome in place. The component renders every text a visitor reads into
// the page; the script only shows, hides and fills them. It is part of the
// integration's one script file of the site's own origin, and the form
// holds no inline code, so it works under a policy that allows no inline
// script, and reaches no host but the site's own.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inCatalogue, SOURCE_LANGUAGE, textsOf } from '../catalogues.js';
import groups from '../format/settings-groups.json' with { type: 'json' };
import { isPublicBuild } from './public-site.js';

// Where a form is taken on the site's own host.
export const FORMS_PATH = '/_konzilo/forms/';

// The core's texts of a form, in the catalogues (ADR 0066) under `site.form.`, in the
// page's language. A site gives its own in its language, by the same names, as
// `konzilo({ formTexts })`. `{max}`, `{time}`, `{email}` and `{contact}` stand for what
// each says.
const FORM_TEXTS = 'site.form.';

// The names of a form's texts, which a site may give its own of.
export const FORM_TEXT_NAMES = Object.freeze(Object.keys(textsOf(SOURCE_LANGUAGE, FORM_TEXTS)));

// The texts a site may give, checked as konzilo() is called: a key the core
// has not got, or a text that is no text, names itself.
export function siteFormTexts(given = {}) {
  if (given === null || typeof given !== 'object' || Array.isArray(given)) {
    throw new Error('Konzilo: formTexts must be an object of the form\'s texts by their keys');
  }
  const known = FORM_TEXT_NAMES;
  for (const [key, value] of Object.entries(given)) {
    if (!known.includes(key)) throw new Error(`Konzilo: formTexts.${key} is not one of the form's texts, which are ${known.join(', ')}`);
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`Konzilo: formTexts.${key} must be a text`);
  }
  return { ...given };
}

// The texts of a form in the language of a page in `locale`, null for a site that declares
// none, the site's own in place of the core's.
export function formTexts(locale, own = {}) {
  return { ...textsOf(locale, FORM_TEXTS), ...own };
}

// The HTML input type of each kind of field that is one input.
const INPUT_TYPES = { text: 'text', email: 'email', tel: 'tel' };

// What the endpoint takes as a phone number, as an input's pattern, which
// the browser reads with the `v` flag: every character of a class that is
// syntax there escaped.
export const TEL_PATTERN = '\\+?[0-9 \\(\\)\\.\\/\\-]*[0-9][0-9 \\(\\)\\.\\/\\-]*';

// A text with a link in it: the text around `{contact}` and the contact
// itself, `contactBy` with the site's email address as a mailto link where
// it has one, or `contactOther`. Gives parts, each a text or { href, text }.
function withContact(sentence, texts, email) {
  const [before, after = ''] = sentence.split('{contact}');
  const contact = email ? texts.contactBy.split('{email}') : [texts.contactOther];
  const parts = [before, contact[0]];
  if (email) parts.push({ href: `mailto:${email}`, text: email }, contact[1] ?? '');
  parts.push(after);
  return parts.filter((part) => part !== '');
}

// What Form.astro renders of the form `name`.
//
// `forms`: the declared forms, as the site description's read form gives
// them. `settings`: the site settings, whose forms' confirmation texts the
// page shows once a form is sent, and whose publisher's email address the
// page offers when a form cannot be sent. `site`: { locale, languageTag, base,
// page, texts, button }: the site's locale and language tag, the base the
// page is below, the page's own path, the site's own texts, and the button's
// text an editor gives where the form is placed, if any. A page
// below a base of its own is a preview's or a share's,
// whose form sends nothing.
//
// Gives { name, label, action, id, preview, page, texts, button, fields, outcomes,
// data }: the button's text, the editor's where the form lets an editor change
// it, else the form's own in the page's language, else the site's word for
// sending; each field with its label as parts of text and links, `labelParts`,
// the ids of its control, help and problem, its HTML type and its rules; each
// outcome by its id, as parts of text and links; and what the script reads, as
// JSON. Throws for a form the site description does not declare.
export function formView(name, { forms, settings, locale, languageTag, base = '/', page = '/', texts: own = {}, button: given }) {
  const form = forms?.[name];
  if (!form) {
    const declared = Object.keys(forms ?? {});
    throw new Error(`Konzilo: a template places the form ${JSON.stringify(name)}, which the site description does not declare${declared.length ? `; it declares ${declared.join(', ')}` : '; it declares no form'}`);
  }
  const texts = formTexts(locale, own);
  const id = `konzilo-form-${name}`;
  const email = settings?.search?.publisher?.email || null;
  const preview = !isPublicBuild(base);
  // A text the form does not let an editor change is a post's last file's, from before the
  // site took that from editors, which the intake now refuses: the form's own stands.
  const editors = (form.editable ?? []).includes('button') && typeof given === 'string' && given.trim() !== '' ? given : null;
  const declared = typeof form.button === 'string' ? form.button : (form.button?.[locale] ?? null);
  const button = editors ?? declared ?? texts.send;
  const fields = form.fields.map((field) => {
    const at = `${id}-${field.name}`;
    const group = ['radio', 'checkboxes'].includes(field.kind);
    return {
      ...field,
      id: at,
      group,
      type: INPUT_TYPES[field.kind] ?? null,
      pattern: field.kind === 'tel' ? TEL_PATTERN : null,
      autocomplete: field.kind === 'email' ? 'email' : field.kind === 'tel' ? 'tel' : null,
      helpId: field.help ? `${at}-help` : null,
      problemId: `${at}-problem`,
      options: (field.options ?? []).map((option, index) => ({ value: option, id: `${at}-${index + 1}` })),
    };
  });
  // The Admin's confirmation text, as the site settings hold it, or the core's
  // default in the site's language.
  const confirmation = settings?.forms?.[name]?.confirmation ?? inCatalogue(groups.forms.settings.confirmation.default, locale);
  const outcomes = [
    ['sent', [confirmation]],
    ['invalid', [texts.invalid]],
    ['too-many', [texts.tooMany]],
    ['refused', withContact(texts.refused, texts, email)],
    ['unavailable', withContact(texts.unavailable, texts, email)],
  ].map(([outcome, parts]) => ({ outcome, id: `${id}-${outcome}`, parts }));
  const problems = {
    missing: texts.missing,
    missingChoice: texts.missingChoice,
    missingBox: texts.missingBox,
    tooLong: texts.tooLong,
    notEmail: texts.notEmail,
    notTel: texts.notTel,
    notAnOption: texts.notAnOption,
    malformed: texts.malformed,
  };
  const data = {
    name,
    token: `${FORMS_PATH}${name}/token`,
    languageTag,
    fields: fields.map((field) => ({ name: field.name, kind: field.kind, required: field.required, maxLength: field.maxLength ?? null })),
    texts: { sending: texts.sending, tooManyIn: texts.tooManyIn, problems },
  };
  return {
    name,
    label: form.label,
    action: `${FORMS_PATH}${name}`,
    id,
    preview,
    page,
    texts,
    button,
    fields,
    outcomes,
    data: JSON.stringify(data),
  };
}

// The script of every declared form on a page, which the integration puts
// into every page's script file. It runs in the visitor's browser, so it
// uses nothing from this module: it reads what Form.astro wrote into the
// page, each form's `data-konzilo-form`.
//
// Once a form comes into use, it asks the endpoint for the form's timing
// token, once. On Send, it checks the fields itself, as the endpoint does,
// and names each wrong one beside it, with the focus on the first; then it
// sends the form as JSON, with the token where it came, and shows the
// outcome in place, the focus on it: the confirmation text in place of the
// fields, each wrong field's message, a message to try later, from the
// time the endpoint gives, or, when the endpoint does not answer, or
// answers with no outcome of its own, a plain message with another way to
// reach the site. It stores nothing in the browser and reaches nothing but
// the site's own host. A preview's form has no `data-konzilo-form`, and is
// left alone.
export function formClient() {
  // An email address as the browser checks one, and a phone number as the
  // endpoint does.
  const EMAIL = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  const TEL = /^\+?[0-9 ().\/-]*[0-9][0-9 ().\/-]*$/;
  // How long a send waits for the token before it goes without one.
  const PATIENCE = 5000;
  const CHOICES = ['select', 'radio', 'checkboxes'];

  for (const form of document.querySelectorAll('form[data-konzilo-form]')) {
    let data;
    try {
      data = JSON.parse(form.dataset.konziloForm);
    } catch {
      continue;
    }
    const { texts } = data;
    const fieldsBox = form.querySelector('.konzilo-form-fields');
    const button = form.querySelector('button[type="submit"]');
    const controls = (name) => [...form.querySelectorAll(`[name="${name}"]`)];
    const problemOf = (name) => document.getElementById(`${form.id}-${name}-problem`);
    const outcomeOf = (outcome) => document.getElementById(`${form.id}-${outcome}`);
    const outcomes = [...form.querySelectorAll('.konzilo-form-outcome')];

    // The browser's own checks give way to the script's, in the site's
    // language.
    form.noValidate = true;

    // The timing token, asked for once, the first time the form comes into
    // use: null when the endpoint gives none.
    let token = null;
    const ask = () => {
      token ??= fetch(data.token, { headers: { Accept: 'application/json' }, cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((answer) => (typeof answer?.token === 'string' ? answer.token : null))
        .catch(() => null);
      return token;
    };
    for (const type of ['focusin', 'input', 'pointerdown']) form.addEventListener(type, ask, { once: true });

    // Each field's value as the endpoint takes it, beside the page the form
    // was sent from and the trap.
    const values = () => {
      const body = { _page: `${location.pathname}${location.search}`, _website: form.querySelector('[name="_website"]')?.value ?? '' };
      for (const { name, kind } of data.fields) {
        const own = controls(name);
        if (kind === 'checkbox' || kind === 'acceptance') body[name] = own.some((control) => control.checked);
        else if (kind === 'checkboxes') body[name] = own.filter((control) => control.checked).map((control) => control.value);
        else if (kind === 'radio') body[name] = own.find((control) => control.checked)?.value ?? '';
        else body[name] = own[0]?.value ?? '';
      }
      return body;
    };

    // The problem of each field the endpoint would refuse, as it names it.
    const check = (body) => {
      const problems = {};
      for (const { name, kind, required, maxLength } of data.fields) {
        const value = body[name];
        if (kind === 'checkbox') continue;
        if (kind === 'acceptance' || kind === 'checkboxes') {
          if (required && (value === false || value.length === 0)) problems[name] = 'missing';
          continue;
        }
        const text = value.trim();
        if (text === '') {
          if (required) problems[name] = 'missing';
        } else if (maxLength !== null && [...text].length > maxLength) {
          problems[name] = 'too-long';
        } else if (kind === 'email' && !EMAIL.test(text)) {
          problems[name] = 'not-email';
        } else if (kind === 'tel' && !TEL.test(text)) {
          problems[name] = 'not-tel';
        }
      }
      return problems;
    };

    // What a problem says beside its field.
    const message = ({ kind, maxLength }, problem) => {
      const { problems } = texts;
      if (problem === 'missing') return CHOICES.includes(kind) ? problems.missingChoice : kind === 'acceptance' ? problems.missingBox : problems.missing;
      if (problem === 'too-long') return problems.tooLong.replaceAll('{max}', String(maxLength));
      if (problem === 'not-email') return problems.notEmail;
      if (problem === 'not-tel') return problems.notTel;
      if (problem === 'not-an-option') return problems.notAnOption;
      return problems.malformed;
    };

    // A field's message beside it, or none: the field marked invalid and
    // described by it while it has one. A group of radio buttons is marked
    // as one.
    const mark = (field, text) => {
      const problem = problemOf(field.name);
      if (!problem) return;
      problem.textContent = text ?? '';
      problem.hidden = text === null;
      const own = controls(field.name);
      const marked = field.kind === 'radio' ? [own[0]?.closest('fieldset')].filter(Boolean) : own;
      for (const element of marked) {
        if (text === null) element.removeAttribute('aria-invalid');
        else element.setAttribute('aria-invalid', 'true');
      }
      for (const control of own) {
        const ids = (control.getAttribute('aria-describedby') ?? '').split(' ').filter((id) => id !== '' && id !== problem.id);
        if (text !== null) ids.push(problem.id);
        if (ids.length > 0) control.setAttribute('aria-describedby', ids.join(' '));
        else control.removeAttribute('aria-describedby');
      }
    };

    // No outcome shown, not even one the endpoint led the browser back
    // with, which the page shows while its fragment names it.
    const clear = () => {
      for (const outcome of outcomes) outcome.hidden = true;
      for (const field of data.fields) mark(field, null);
      if (location.hash.startsWith(`#${form.id}-`)) history.replaceState(history.state, '', `${location.pathname}${location.search}`);
    };

    // An outcome shown, with the focus on it, its text first replaced where
    // given.
    const show = (outcome, text) => {
      const element = outcomeOf(outcome);
      if (!element) return;
      if (text !== undefined) element.querySelector('p').textContent = text;
      element.hidden = false;
      element.focus();
    };

    // Each wrong field's message, the form's message that it was not sent,
    // and the focus on the first wrong field. Gives whether a field of the
    // form's own was wrong.
    const invalid = (problems) => {
      const wrong = data.fields.filter((field) => Object.hasOwn(problems, field.name));
      if (wrong.length === 0) return false;
      for (const field of wrong) mark(field, message(field, problems[field.name]));
      show('invalid');
      controls(wrong[0].name)[0]?.focus();
      return true;
    };

    // A time to wait, in the site's language: seconds below a minute, else
    // whole minutes.
    const time = (seconds) => {
      const [number, unit] = seconds < 60 ? [Math.max(1, Math.ceil(seconds)), 'second'] : [Math.ceil(seconds / 60), 'minute'];
      try {
        return new Intl.NumberFormat(data.languageTag, { style: 'unit', unit, unitDisplay: 'long' }).format(number);
      } catch {
        return String(number);
      }
    };

    let sending = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (sending) return;
      clear();
      const body = values();
      if (invalid(check(body))) return;
      sending = true;
      const label = button?.textContent;
      if (button) button.textContent = texts.sending;
      form.setAttribute('aria-busy', 'true');
      try {
        const given = await Promise.race([ask(), new Promise((resolve) => setTimeout(resolve, PATIENCE, null))]);
        if (given) body._token = given;
        let answer = null;
        let wait = null;
        try {
          const response = await fetch(form.getAttribute('action'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            cache: 'no-store',
          });
          wait = response.headers.get('Retry-After');
          answer = await response.json().catch(() => null);
        } catch {
          // The endpoint does not answer.
        }
        const outcome = answer?.outcome;
        if (outcome === 'sent') {
          form.reset();
          fieldsBox.hidden = true;
          show('sent');
        } else if (outcome === 'invalid' && answer.fields && invalid(answer.fields)) {
          // Each wrong field is named beside it.
        } else if (outcome === 'too-many') {
          const seconds = Number(answer.retryAfter ?? wait);
          show('too-many', Number.isFinite(seconds) && seconds > 0 ? texts.tooManyIn.replaceAll('{time}', time(seconds)) : undefined);
        } else if (outcome === 'refused') {
          show('refused');
        } else {
          show('unavailable');
        }
      } finally {
        sending = false;
        if (button) button.textContent = label;
        form.removeAttribute('aria-busy');
      }
    });
  }
}

// The page a browser without JavaScript gets in place of the endpoint's
// answer to a form, below the reserved prefix in every release, when the
// endpoint does not answer at all: online Caddy serves it in place of its
// own error, locally the dev server (reserved.js). The browser stays at
// the form's address, so its back button leads to the form with what the
// visitor wrote. Caddy serves it as it is, below no base.
export const FORM_NOT_SENT = '_konzilo/form-not-sent.html';

const escaped = (text) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

// The page that says a form's message was not sent, in the site's language:
// `locale` and `languageTag`, its locale and language tag, `texts`, the
// site's own texts, and `email`, the publisher's email address, which the
// page offers where there is one. A plain page with no code and no style.
export function formNotSentPage({ locale, languageTag, texts: own = {}, email = null }) {
  const texts = formTexts(locale, own);
  const sentence = withContact(texts.unavailable, texts, email)
    .map((part) => (typeof part === 'string' ? escaped(part) : `<a href="${escaped(part.href)}">${escaped(part.text)}</a>`))
    .join('');
  return [
    '<!DOCTYPE html>',
    `<html lang="${escaped(languageTag)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width">',
    '<meta name="robots" content="noindex">',
    `<title>${escaped(texts.notSent)}</title>`,
    '</head>',
    '<body>',
    '<main>',
    `<h1>${escaped(texts.notSent)}</h1>`,
    `<p>${sentence}</p>`,
    `<p>${escaped(texts.back)}</p>`,
    `<p><a href="/">${escaped(texts.startPage)}</a></p>`,
    '</main>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

// The page for the site at `root`, as its last export left its settings:
// the publisher's email address from content/settings.json, or, in a
// preview build, the preview's own (`folder`); on a site in several
// `languages`, from the main language's settings file,
// content/settings/<tag>.json, since the publisher is not translated.
export function siteFormNotSentPage(root, { locale, languageTag, texts, folder = './content', languages = [] }) {
  const file = languages.length > 1 ? `settings/${languages[0].tag}.json` : 'settings.json';
  let email = null;
  try {
    email = JSON.parse(readFileSync(resolve(root, folder, file), 'utf8'))?.search?.publisher?.email || null;
  } catch {
    // No settings yet: no email address to offer.
  }
  return formNotSentPage({ locale, languageTag, texts, email });
}
