// What the editor's *Mail* page asks of the service and makes of its answers, before it is React:
// how the site mails each form's submissions and how long it keeps them, saving it, the
// recipients as an Admin writes them, and each problem beside its field. The service's side is proved in
// service-mail-settings.test.js, and the two meet in a real browser in the Compose acceptance
// suite.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { useInterfaceLanguage } from '../src/cms/interface-language.js';
import { passwordKeptFor, problemsShown, readMail, recipientsOf, recipientsText, saveMail } from '../src/cms/mail/client.js';

const SETTINGS = {
  local: false,
  adapter: 'none',
  smtp: { host: '', port: 587, security: 'starttls', username: '', password: false, sender: '' },
  forms: [{ name: 'contact', label: 'Contact us', recipients: [], retention: 30 }],
  failure: null,
};

// A service that answers as it is told to, and notes what it was asked.
function service(status, body) {
  const asked = [];
  const ask = async (address, { method = 'GET', headers, body: sent }) => {
    asked.push({ path: new URL(address, 'http://admin').pathname, method, headers, body: sent === undefined ? undefined : JSON.parse(sent) });
    return { ok: status < 400, status, json: async () => body };
  };
  return { asked, ask };
}

describe('asking the service', () => {
  test('reads how the site sends mail, with the editor\'s credential', async () => {
    const stand = service(200, SETTINGS);
    assert.deepEqual(await readMail({ credential: () => 'token mine', ask: stand.ask }), { settings: SETTINGS });
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/mail', method: 'GET', headers: { authorization: 'token mine' }, body: undefined }]);
  });

  test('saves what an Admin gives as JSON, and gives what is then kept, or the problems by their places', async () => {
    const given = { adapter: 'smtp', smtp: { host: 'smtp.example.com' }, forms: { contact: { recipients: ['anna@example.com'], retention: '90' } } };
    const stand = service(200, { ...SETTINGS, adapter: 'smtp' });
    assert.deepEqual(await saveMail({ credential: () => 'token mine', given, ask: stand.ask }), { settings: { ...SETTINGS, adapter: 'smtp' } });
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/mail', method: 'PUT', headers: { authorization: 'token mine', 'content-type': 'application/json' }, body: given }]);
    const refused = service(400, { problems: { 'smtp.port': 'missing' } });
    assert.deepEqual(await saveMail({ credential: () => 'token mine', given, ask: refused.ask }), { problems: { 'smtp.port': 'missing' } });
  });

  test('tells an Editor that it is an Admin\'s, and cannot tell without a credential, a service, or an answer', async () => {
    for (const asking of [readMail, (options) => saveMail({ ...options, given: {} })]) {
      assert.deepEqual(await asking({ credential: () => 'token erik', ask: service(403, {}).ask }), { adminOnly: true });
      assert.equal(await asking({ credential: () => null, ask: () => assert.fail('asks nothing') }), null);
      assert.equal(await asking({ credential: () => 'token mine', ask: async () => { throw new Error('away'); } }), null);
      assert.equal(await asking({ credential: () => 'token mine', ask: service(401, {}).ask }), null);
      assert.equal(await asking({ credential: () => 'token mine', ask: service(500, {}).ask }), null);
    }
  });
});

describe('the recipients', () => {
  test('are each address an Admin writes, one per line or apart by commas, spaces or semicolons', () => {
    assert.deepEqual(recipientsOf(' anna@example.com,bo@example.com\n\ncecilia@example.com; david@example.com  \n'), ['anna@example.com', 'bo@example.com', 'cecilia@example.com', 'david@example.com']);
    assert.deepEqual(recipientsOf('  \n'), []);
    assert.equal(recipientsText(['anna@example.com', 'bo@example.com']), 'anna@example.com\nbo@example.com');
  });
});

describe('the password kept', () => {
  // The service keeps a password for the server, port and username it was given with alone, so the
  // page says it is kept only while the fields name those.
  test('is said to be kept while the server, its port and the username are those it was kept for', () => {
    const shown = { host: 'smtp.example.com', port: 587, security: 'starttls', username: 'site@example.com', password: true, sender: 'site@example.com' };
    const draft = { host: 'smtp.example.com', port: '587', security: 'tls', username: 'site@example.com', password: '', sender: 'other@example.com' };
    assert.equal(passwordKeptFor(draft, shown), true);
    assert.equal(passwordKeptFor({ ...draft, host: ' smtp.example.com ', port: ' 587' }, shown), true);
    for (const changed of [{ host: 'mail.example.net' }, { port: '465' }, { username: 'other@example.com' }]) assert.equal(passwordKeptFor({ ...draft, ...changed }, shown), false, JSON.stringify(changed));
    assert.equal(passwordKeptFor(draft, { ...shown, password: false }), false, 'none kept');
  });
});

describe('each problem', () => {
  test('is shown beside its field in the interface language, an address by what was written', () => {
    const given = { forms: { contact: { recipients: ['anna@example.com', 'bo@'] } } };
    const problems = { 'smtp.host': 'not-host', 'smtp.port': 'not-port', 'smtp.username': 'needs-encryption', 'smtp.sender': 'missing', 'forms.contact.recipients.1': 'not-email', 'forms.note.recipients': 'too-many', 'forms.note.retention': 'not-days', adapter: 'unknown' };
    assert.deepEqual(problemsShown(problems, given), {
      host: 'Give the mail server\'s name, such as smtp.example.com.',
      port: 'Give a port from 1 to 65535.',
      username: 'A username and a password are sent only encrypted: choose STARTTLS or TLS.',
      sender: 'Fill in this field.',
      forms: { contact: ['Not an email address: bo@'], note: ['At most 50 addresses.'] },
      retention: { note: 'Give a whole number of days, from 1 to 3650.' },
      adapter: 'Choose one of the options.',
    });
    try {
      useInterfaceLanguage('sv');
      assert.deepEqual(problemsShown({ 'smtp.sender': 'not-email', 'smtp.password': 'malformed' }, given), { sender: 'Ange en e-postadress, till exempel namn@exempel.se.', password: 'Kontrollera det här fältet.' });
      assert.deepEqual(problemsShown({ 'forms.contact.retention': 'not-days' }, given), { retention: { contact: 'Ange ett helt antal dagar, från 1 till 3650.' } });
    } finally {
      useInterfaceLanguage('en');
    }
  });
});
