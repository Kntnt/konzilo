// A declared form on a page: the integration's form component, which
// a template places by the form's name, rendered from the site description
// into a small site's static build, in the site's language; and the form's
// script, part of the integration's script file of that build, run on the
// built page under jsdom with the endpoint stood in for. The acceptance
// suite sends the form to the real endpoint in a browser
// (tests/acceptance/tests/form-page.spec.js).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FORM_NOT_SENT } from '../src/astro/forms.js';
import { astroConfig, astroEnvironment, ORIGIN } from './lib/astro.js';
import { identity, siteSettingsArgs, writeContent } from './lib/content.js';

// The npm package, which a site installs beside Astro, and its command.
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');
const integration = join(core, 'src/astro/index.js');
const { JSDOM, VirtualConsole } = createRequire(join(core, 'package.json'))('jsdom');

const types = {
  post: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
};

// A form with a field of each kind, and one with a single field.
const forms = {
  contact: {
    label: 'Contact us',
    fields: [
      { name: 'name', label: 'Your name', kind: 'text', required: true, maxLength: 100 },
      { name: 'email', label: 'Email', kind: 'email', required: true, help: 'We answer within a day.' },
      { name: 'phone', label: 'Phone', kind: 'tel' },
      { name: 'message', label: 'Message', kind: 'textarea', required: true },
      { name: 'topic', label: 'Topic', kind: 'select', required: true, options: ['Sales', 'Support'] },
      { name: 'reach', label: 'Reach me by', kind: 'radio', options: ['Email', 'Phone'] },
      { name: 'copy', label: 'Keep me posted', kind: 'checkbox' },
      { name: 'interests', label: 'Interests', kind: 'checkboxes', required: true, options: ['Web', 'Print'] },
      { name: 'privacy', label: 'I have read the privacy policy', kind: 'acceptance' },
    ],
  },
  note: { label: 'A note', fields: [{ name: 'note', label: 'Note', kind: 'textarea', required: true }] },
};

// A page of the site's design that places a form by its name, imported from
// the package as a site's own form component does.
const pageWith = (name) => [
  '---',
  "import Form from '@kntnt/konzilo/astro/Form.astro';",
  `import { publicSite } from ${JSON.stringify(integration)};`,
  'const { languageTag } = publicSite();',
  '---',
  '<html lang={languageTag}>',
  '  <head><title>A page</title></head>',
  `  <body><main><h1>Write to us</h1><Form name=${JSON.stringify(name)} /></main></body>`,
  '</html>',
  '',
].join('\n');

const sources = {
  'src/content.config.mjs': `import { collections as konziloCollections } from ${JSON.stringify(integration)};\n\nexport const collections = konziloCollections();\n`,
  'src/pages/contact.astro': pageWith('contact'),
  'src/pages/note.astro': pageWith('note'),
};

// The site settings of a site whose Admin gave the contact form a
// confirmation text of its own, and whose publisher has an email address.
const withContact = {
  menus: {},
  settings: {
    forms: { contact: { confirmation: 'Thanks, we will be in touch.' } },
    search: { publisher: { email: 'hello@example.com' } },
  },
  identity,
};

// A site repository with Astro and Konzilo's package installed, the pages
// above, the integration given `options`, its content exported as a build
// writes it with `siteSettings`, and built by Astro, with `base` when
// given. A repository whose content or build fails is removed, unless
// `fails` says the build is to fail, when it gives what Astro printed.
function build({ language = 'en_GB', languages, declared = forms, siteSettings = withContact, options, base, pages = {}, fails = false } = {}) {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-form-component-'));
  try {
    mkdirSync(join(repository, 'node_modules/@kntnt'), { recursive: true });
    for (const entry of readdirSync(join(core, 'node_modules'))) {
      if (!entry.startsWith('.')) symlinkSync(join(core, 'node_modules', entry), join(repository, 'node_modules', entry));
    }
    symlinkSync(core, join(repository, 'node_modules/@kntnt/konzilo'));
    const config = astroConfig(integration, options).replace('export default {', `export default {${base ? ` base: ${JSON.stringify(base)},` : ''}`);
    const files = {
      ...sources,
      ...pages,
      'astro.config.mjs': config,
      'site-description.json': JSON.stringify({ ...(languages ? { languages } : { language }), types, forms: declared }),
    };
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(repository, path)), { recursive: true });
      writeFileSync(join(repository, path), contents);
    }
    siteSettingsArgs(repository, siteSettings);
    const exported = writeContent(repository, []);
    assert.equal(exported.status, 0, exported.stderr);
    const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    if (fails) {
      rmSync(repository, { recursive: true, force: true });
      assert.notEqual(built.status, 0, 'the build fails');
      return { log: `${built.stdout}\n${built.stderr}` };
    }
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
  } catch (error) {
    rmSync(repository, { recursive: true, force: true });
    throw error;
  }
  const output = (path) => readFileSync(join(repository, 'dist', path), 'utf8');
  return { repository, output, page: (slug) => new JSDOM(output(`${slug}/index.html`)).window.document };
}

const text = (element) => element?.textContent.trim().replace(/\s+/g, ' ');

describe('a declared form placed on a page', () => {
  let site;
  let form;

  before(() => {
    site = build();
    form = site.page('contact').querySelector('form');
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('is a plain HTML form that posts to the form\'s address on the endpoint, named by the form\'s label', () => {
    assert.equal(form.getAttribute('method'), 'post');
    assert.equal(form.getAttribute('action'), '/_konzilo/forms/contact');
    assert.equal(form.getAttribute('aria-label'), 'Contact us');
  });

  test('labels every field, each of its kind\'s input type, with required, maxlength and the options as declared', () => {
    const control = (name) => form.querySelector(`[name="${name}"]`);
    const label = (element) => text(form.querySelector(`label[for="${element.id}"]`));
    assert.deepEqual(
      ['name', 'email', 'phone'].map((name) => [label(control(name)), control(name).tagName, control(name).type, control(name).required, control(name).getAttribute('maxlength')]),
      [
        ['Your name (required)', 'INPUT', 'text', true, '100'],
        ['Email (required)', 'INPUT', 'email', true, '254'],
        ['Phone', 'INPUT', 'tel', false, '50'],
      ],
    );
    assert.deepEqual([label(control('message')), control('message').tagName, control('message').required, control('message').getAttribute('maxlength')], ['Message (required)', 'TEXTAREA', true, '5000']);
    const topic = control('topic');
    assert.deepEqual([label(topic), topic.tagName, topic.required], ['Topic (required)', 'SELECT', true]);
    assert.deepEqual([...topic.options].map((option) => [option.value, option.textContent]), [['', 'Choose…'], ['Sales', 'Sales'], ['Support', 'Support']]);

    // Choices are a group, named by its legend, each with a label of its own.
    const group = (name) => form.querySelector(`[name="${name}"]`).closest('fieldset');
    assert.equal(text(group('reach').querySelector('legend')), 'Reach me by');
    assert.equal(group('reach').getAttribute('role'), 'radiogroup');
    assert.deepEqual([...group('reach').querySelectorAll('input')].map((input) => [input.type, input.value, label(input), input.required]), [['radio', 'Email', 'Email', false], ['radio', 'Phone', 'Phone', false]]);
    assert.equal(text(group('interests').querySelector('legend')), 'Interests (required)');
    assert.deepEqual([...group('interests').querySelectorAll('input')].map((input) => [input.type, input.name, input.value, label(input)]), [['checkbox', 'interests', 'Web', 'Web'], ['checkbox', 'interests', 'Print', 'Print']]);
    assert.deepEqual([control('copy').type, label(control('copy')), control('copy').required], ['checkbox', 'Keep me posted', false]);
    assert.deepEqual([control('privacy').type, label(control('privacy')), control('privacy').required], ['checkbox', 'I have read the privacy policy (required)', true]);
  });

  test('ties each help text to its field, and holds the trap field out of sight of people and assistive technology, out of the tab order', () => {
    const email = form.querySelector('[name="email"]');
    assert.equal(text(form.querySelector(`#${email.getAttribute('aria-describedby')}`)), 'We answer within a day.');
    assert.equal(form.querySelector('[name="name"]').getAttribute('aria-describedby'), null);

    const trap = form.querySelector('[name="_website"]');
    assert.equal(trap.closest('[aria-hidden="true"]')?.className, 'konzilo-form-trap');
    assert.deepEqual([trap.type, trap.getAttribute('tabindex'), trap.getAttribute('autocomplete'), trap.value], ['text', '-1', 'off', '']);
    assert.equal(text(form.querySelector(`label[for="${trap.id}"]`)), 'Leave this field empty');
  });

  test('tells the endpoint the page\'s path, to lead a browser without JavaScript back to, and has one button that sends it', () => {
    assert.deepEqual([...form.querySelectorAll('input[type="hidden"]')].map((input) => [input.name, input.value]), [['_page', '/contact/']]);
    assert.deepEqual([...form.querySelectorAll('button')].map((button) => [button.type, text(button), button.disabled]), [['submit', 'Send', false]]);
  });

  test('holds each outcome the endpoint leads back with, hidden, at the id of its fragment, the Admin\'s confirmation text once sent', () => {
    const outcome = (name) => form.querySelector(`#konzilo-form-contact-${name}`);
    for (const name of ['sent', 'invalid', 'too-many', 'refused', 'unavailable']) {
      assert.ok(outcome(name)?.hidden, `${name} is there, hidden`);
      assert.equal(outcome(name).getAttribute('tabindex'), '-1', `${name} takes the focus`);
    }
    assert.equal(text(outcome('sent')), 'Thanks, we will be in touch.');
    assert.equal(text(outcome('invalid')), 'Your message was not sent. Check the fields and send it again.');
    assert.equal(text(outcome('too-many')), 'Your message was not sent, since many messages have come from here just now. Try again later.');
  });

  test('offers the publisher\'s email address where the form cannot be sent', () => {
    const outcome = form.querySelector('#konzilo-form-contact-unavailable');
    assert.equal(text(outcome), 'Your message could not be sent just now. Try again later, or write to us at hello@example.com.');
    assert.equal(outcome.querySelector('a').getAttribute('href'), 'mailto:hello@example.com');
    assert.equal(text(form.querySelector('#konzilo-form-contact-refused')), 'Your message could not be sent from here. Reload the page and try again, or write to us at hello@example.com.');
  });

  test('shows the core\'s confirmation text in the site\'s language where the Admin keeps the default', () => {
    const note = site.page('note').querySelector('form');
    assert.equal(note.getAttribute('action'), '/_konzilo/forms/note');
    assert.equal(text(note.querySelector('#konzilo-form-note-sent')), 'Thank you. Your message has been sent.');
  });

  test('every build holds the page a browser gets in place of the form\'s answer when the endpoint does not answer: in the site\'s language, with the publisher\'s email address, and no code', () => {
    const document = new JSDOM(site.output('_konzilo/form-not-sent.html')).window.document;
    assert.equal(document.documentElement.lang, 'en-GB');
    assert.equal(document.title, 'Your message was not sent');
    assert.equal(text(document.querySelector('h1')), 'Your message was not sent');
    assert.deepEqual([...document.querySelectorAll('p')].map(text), [
      'Your message could not be sent just now. Try again later, or write to us at hello@example.com.',
      'Go back with your browser\'s back button: what you wrote is usually still there.',
      'Go to the start page',
    ]);
    assert.deepEqual([...document.querySelectorAll('a')].map((link) => link.getAttribute('href')), ['mailto:hello@example.com', '/']);
    assert.deepEqual([...document.querySelectorAll('script, style, [style]')], []);
  });

  test('holds no inline code: the page\'s one script is a file of the site\'s own, and no element has an event handler or a style', () => {
    const document = site.page('contact');
    assert.deepEqual([...document.querySelectorAll('script')].map((script) => Boolean(script.getAttribute('src'))), [true]);
    const handlers = [...document.querySelectorAll('*')].flatMap((element) => element.getAttributeNames().filter((name) => name.startsWith('on') || name === 'style'));
    assert.deepEqual(handlers, []);
  });
});

describe('a declared form on a page of a site in Swedish that gives some texts of its own', () => {
  let site;
  let form;

  before(() => {
    site = build({ language: 'sv_SE', siteSettings: { menus: {}, settings: {}, identity }, options: { formTexts: { send: 'Skicka in' } } });
    form = site.page('contact').querySelector('form');
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('shows the core\'s texts in Swedish, the site\'s own in their place, and asks to reach the site another way where it has no email address', () => {
    assert.equal(text(form.querySelector('label[for="konzilo-form-contact-name"]')), 'Your name (obligatoriskt)');
    assert.equal(form.querySelector('[name="topic"] option').textContent, 'Välj…');
    assert.equal(text(form.querySelector('button')), 'Skicka in');
    assert.equal(text(form.querySelector('#konzilo-form-contact-sent')), 'Tack! Ditt meddelande är skickat.');
    assert.equal(text(form.querySelector('#konzilo-form-contact-invalid')), 'Ditt meddelande skickades inte. Kontrollera fälten och skicka igen.');
    assert.equal(text(form.querySelector('#konzilo-form-contact-unavailable')), 'Ditt meddelande kunde inte skickas just nu. Försök igen senare, eller kontakta oss på annat sätt.');
    assert.equal(form.querySelector('#konzilo-form-contact-unavailable a'), null);
    assert.equal(text(form.querySelector('label[for="konzilo-form-contact-website"]')), 'Lämna det här fältet tomt');
  });

  test('the page a browser gets when the endpoint does not answer is in Swedish too, and asks to reach the site another way', () => {
    const document = new JSDOM(site.output('_konzilo/form-not-sent.html')).window.document;
    assert.equal(document.documentElement.lang, 'sv-SE');
    assert.equal(text(document.querySelector('h1')), 'Ditt meddelande skickades inte');
    assert.equal(text(document.querySelector('p')), 'Ditt meddelande kunde inte skickas just nu. Försök igen senare, eller kontakta oss på annat sätt.');
  });
});

describe('a declared form on a site in several languages', () => {
  let site;

  before(() => {
    site = build({
      languages: ['sv_SE', 'en_GB'],
      siteSettings: {
        menus: {},
        settings: {
          forms: { contact: { confirmation: 'Tack, vi hör av oss.' } },
          search: { publisher: { email: 'hej@example.com' } },
        },
        identity,
        languages: { en_GB: { title: 'The Lantern', menus: {}, settings: { forms: { contact: { confirmation: 'Thanks, we will be in touch.' } } } } },
      },
      pages: { 'src/pages/sv/contact.astro': pageWith('contact'), 'src/pages/en/contact.astro': pageWith('contact') },
    });
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('shows the confirmation text of the page\'s language', () => {
    assert.equal(text(site.page('sv/contact').querySelector('#konzilo-form-contact-sent')), 'Tack, vi hör av oss.');
    assert.equal(text(site.page('en/contact').querySelector('#konzilo-form-contact-sent')), 'Thanks, we will be in touch.');
  });

  test('the page a browser gets when the endpoint does not answer offers the publisher\'s email address from the main language\'s settings', () => {
    const document = new JSDOM(site.output('_konzilo/form-not-sent.html')).window.document;
    assert.equal(document.documentElement.lang, 'sv-SE');
    assert.equal(document.querySelector('a').getAttribute('href'), 'mailto:hej@example.com');
  });
});

describe('a declared form in a preview', () => {
  test('shows, says it is a preview, and sends nothing: no address to send to, no script\'s data, and a button that cannot be pressed', () => {
    const site = build({ base: '/preview/' });
    try {
      const form = site.page('contact').querySelector('form');
      assert.equal(text(form.querySelector('.konzilo-form-preview')), 'This is a preview: the form sends nothing.');
      assert.equal(form.getAttribute('action'), null);
      assert.equal(form.getAttribute('data-konzilo-form'), null);
      assert.ok(form.hasAttribute('data-konzilo-form-preview'));
      assert.equal(form.querySelector('button').disabled, true);
      assert.ok(form.querySelector('[name="message"]'), 'its fields show');
    } finally {
      rmSync(site.repository, { recursive: true, force: true });
    }
  });
});

test('a template that places a form the site description does not declare fails the build, naming it', () => {
  const { log } = build({ pages: { 'src/pages/quote.astro': pageWith('quote') }, fails: true });
  assert.match(log, /a template places the form "quote", which the site description does not declare; it declares contact, note/);
});

test('a site that gives a text the form has not got fails at once, naming it', () => {
  const { log } = build({ options: { formTexts: { submit: 'Go' } }, fails: true });
  assert.match(log, /formTexts\.submit is not one of the form's texts/);
});

// A visit to a built page under jsdom, at its address on the public host
// with a query and the `fragment` given: the page's script file run on it,
// every request it makes recorded and answered by `answer(request)`, the
// endpoint's answer as { status, headers, body }, or an error, as a request
// that gets no answer at all throws. jsdom has no fetch of its own: the
// endpoint is stood in for in the page's own.
function visit(site, slug, answer = () => new Error('no endpoint'), fragment = '') {
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (error) => {
    throw error;
  });
  const { window } = new JSDOM(site.output(`${slug}/index.html`), { url: `${ORIGIN}/${slug}/?from=menu${fragment}`, runScripts: 'outside-only', virtualConsole });
  const requests = [];
  window.fetch = async (url, init = {}) => {
    const request = { url: String(url), method: init.method ?? 'GET', headers: { ...init.headers }, body: init.body };
    requests.push(request);
    const given = answer(request);
    if (given instanceof Error) throw new window.TypeError(given.message);
    const { status = 200, headers = {}, body = '' } = given;
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return {
      status,
      ok: status >= 200 && status < 300,
      headers: { get: (name) => headers[name.toLowerCase()] ?? null },
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  };
  // The script file, below the page's base as Astro writes it, from the
  // build's output, where it is at the root.
  window.eval(site.output(`_astro/${window.document.querySelector('script[src]').getAttribute('src').split('/_astro/')[1]}`));
  const { document } = window;
  const form = document.querySelector('form');
  const field = (name) => form.querySelector(`[name="${name}"]`);
  // Fill in the fields as a visitor does: a text by its value, a choice by
  // its option.
  const fill = (values) => {
    for (const [name, value] of Object.entries(values)) {
      for (const control of form.querySelectorAll(`[name="${name}"]`)) {
        if (control.type === 'checkbox' || control.type === 'radio') {
          control.checked = typeof value === 'boolean' ? value : [value].flat().includes(control.value);
        } else {
          control.value = value;
        }
      }
    }
  };
  const use = () => field('name').dispatchEvent(new window.FocusEvent('focusin', { bubbles: true }));
  const send = () => form.requestSubmit();
  const posts = () => requests.filter((request) => request.method === 'POST');
  const shown = () => [...form.querySelectorAll('.konzilo-form-outcome')].filter((element) => !element.hidden).map((element) => element.id);
  const problem = (name) => {
    const control = field(name);
    const id = `${form.id}-${name}-problem`;
    const element = form.querySelector(`#${id}`);
    return {
      text: element.hidden ? null : text(element),
      invalid: control.getAttribute('aria-invalid'),
      described: (control.getAttribute('aria-describedby') ?? '').split(' ').includes(id),
    };
  };
  return { window, document, form, field, fill, use, send, posts, requests, shown, problem };
}

// Until the page's script has done what it does after an answer.
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

// A visitor's contact form, filled in as the endpoint takes it.
const filledIn = { name: 'Ada Lovelace', email: 'ada@example.com', message: 'Hello, I would like a quote.', topic: 'Sales', reach: 'Email', copy: true, interests: ['Web'], privacy: true };

const TOKEN = '1793000000.abcdefghijklmnop.0123456789012345678901234567890123456789abc';
const endpoint = (outcome) => (request) => (request.method === 'GET' ? { body: { token: TOKEN } } : outcome);

describe('the form\'s script on a page', () => {
  let site;

  before(() => {
    site = build();
  });

  after(() => rmSync(site.repository, { recursive: true, force: true }));

  test('asks for the form\'s timing token once, when the form comes into use, and not before', async () => {
    const page = visit(site, 'contact', endpoint({ body: { outcome: 'sent' } }));
    await settle();
    assert.deepEqual(page.requests, []);

    page.use();
    page.use();
    await settle();

    assert.deepEqual(page.requests.map((request) => [request.method, request.url]), [['GET', '/_konzilo/forms/contact/token']]);
  });

  test('sends the form as JSON to its address, with its token, the page\'s path, the trap and each field as the endpoint takes it', async () => {
    const page = visit(site, 'contact', endpoint({ body: { outcome: 'sent' } }));
    page.use();
    page.fill(filledIn);

    page.send();
    await settle();

    const [post] = page.posts();
    assert.equal(post.url, '/_konzilo/forms/contact');
    assert.equal(post.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(post.body), {
      _page: '/contact/?from=menu',
      _token: TOKEN,
      _website: '',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      phone: '',
      message: 'Hello, I would like a quote.',
      topic: 'Sales',
      reach: 'Email',
      copy: true,
      interests: ['Web'],
      privacy: true,
    });
  });

  test('once sent, shows the confirmation text in place of the fields, with the focus on it, and stores nothing', async () => {
    const page = visit(site, 'contact', endpoint({ body: { outcome: 'sent' } }));
    page.fill(filledIn);

    page.send();
    await settle();

    assert.deepEqual(page.shown(), ['konzilo-form-contact-sent']);
    assert.equal(page.document.activeElement.id, 'konzilo-form-contact-sent');
    assert.equal(page.form.querySelector('.konzilo-form-fields').hidden, true);
    assert.deepEqual([page.window.localStorage.length, page.window.sessionStorage.length, page.document.cookie], [0, 0, '']);
  });

  test('shows each wrong field\'s message beside it, with the focus on the first, and says the message was not sent', async () => {
    // The endpoint refuses the first, and takes the next.
    let posts = 0;
    const page = visit(site, 'contact', (request) => {
      if (request.method === 'GET') return { body: { token: TOKEN } };
      posts += 1;
      return posts === 1 ? { status: 400, body: { outcome: 'invalid', fields: { message: 'missing', email: 'not-email' } } } : { body: { outcome: 'sent' } };
    });
    page.fill({ ...filledIn, email: 'ada@example' });

    page.send();
    await settle();

    assert.deepEqual(page.shown(), ['konzilo-form-contact-invalid']);
    assert.deepEqual(page.problem('email'), { text: 'Give an email address, such as name@example.com.', invalid: 'true', described: true });
    assert.deepEqual(page.problem('message'), { text: 'Fill in this field.', invalid: 'true', described: true });
    assert.deepEqual(page.problem('name'), { text: null, invalid: null, described: false });
    assert.equal(page.document.activeElement, page.field('email'));
    assert.equal(page.form.querySelector('.konzilo-form-fields').hidden, false);

    // Corrected and sent again, the messages go.
    page.fill({ email: 'ada@example.com' });
    page.send();
    await settle();
    assert.deepEqual(page.problem('email'), { text: null, invalid: null, described: false });
  });

  test('checks the fields before it sends: a required field left empty, an address that is no address and no required box ticked, each named beside it, and nothing sent', async () => {
    const page = visit(site, 'contact', endpoint({ body: { outcome: 'sent' } }));
    page.fill({ ...filledIn, name: '   ', email: 'ada', interests: [], privacy: false, phone: 'call me' });

    page.send();
    await settle();

    assert.deepEqual(page.posts(), []);
    assert.deepEqual(page.shown(), ['konzilo-form-contact-invalid']);
    assert.equal(page.problem('name').text, 'Fill in this field.');
    assert.equal(page.problem('email').text, 'Give an email address, such as name@example.com.');
    assert.equal(page.problem('phone').text, 'Give a phone number in digits, such as +46 8 123 45 67.');
    assert.equal(page.problem('interests').text, 'Choose an option.');
    assert.equal(page.problem('privacy').text, 'Tick this box to send the form.');
    assert.equal(page.document.activeElement, page.field('name'));
  });

  test('when too many messages have come, asks to try again in the time the endpoint gives', async () => {
    const page = visit(site, 'contact', endpoint({ status: 429, headers: { 'retry-after': '120' }, body: { outcome: 'too-many', retryAfter: 120 } }));
    page.fill(filledIn);

    page.send();
    await settle();

    assert.deepEqual(page.shown(), ['konzilo-form-contact-too-many']);
    assert.equal(text(page.form.querySelector('#konzilo-form-contact-too-many')), 'Your message was not sent, since many messages have come from here just now. Try again in 2 minutes.');
    assert.equal(page.document.activeElement.id, 'konzilo-form-contact-too-many');
  });

  test('when the endpoint does not answer, or answers with no outcome of its own, shows the plain message with the site\'s email address, and the form can be sent again', async () => {
    for (const answer of [new Error('Failed to fetch'), { status: 502, headers: { 'content-type': 'text/html' }, body: '<h1>Bad gateway</h1>' }]) {
      const page = visit(site, 'contact', (request) => (request.method === 'GET' ? new Error('Failed to fetch') : answer));
      page.use();
      page.fill(filledIn);

      page.send();
      await settle();

      assert.deepEqual(page.shown(), ['konzilo-form-contact-unavailable']);
      assert.equal(page.document.activeElement.id, 'konzilo-form-contact-unavailable');
      assert.equal(page.form.querySelector('.konzilo-form-fields').hidden, false);
      // Sent without a token, which never came.
      assert.equal(JSON.parse(page.posts()[0].body)._token, undefined);
    }
  });

  test('a page the endpoint led back to with an outcome, sent again with JavaScript, leaves that outcome\'s fragment', async () => {
    const page = visit(site, 'contact', endpoint({ status: 403, body: { outcome: 'refused' } }), '#konzilo-form-contact-invalid');
    page.fill(filledIn);

    page.send();
    await settle();

    assert.equal(page.window.location.hash, '');
    assert.equal(page.window.location.search, '?from=menu');
    assert.deepEqual(page.shown(), ['konzilo-form-contact-refused']);
  });

  test('a message from somewhere the endpoint refuses says so', async () => {
    const page = visit(site, 'contact', endpoint({ status: 403, body: { outcome: 'refused' } }));
    page.fill(filledIn);

    page.send();
    await settle();

    assert.deepEqual(page.shown(), ['konzilo-form-contact-refused']);
  });
});

test('the form\'s script leaves a preview\'s form alone: it asks for nothing and sends nothing', async () => {
  const site = build({ base: '/preview/' });
  try {
    const page = visit(site, 'contact');
    page.use();
    page.fill(filledIn);
    page.form.dispatchEvent(new page.window.Event('submit', { cancelable: true }));
    await settle();
    assert.deepEqual(page.requests, []);
  } finally {
    rmSync(site.repository, { recursive: true, force: true });
  }
});
