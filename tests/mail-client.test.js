// What the editor's *Mail* page asks of the service and makes of its answers, before it is React:
// how the site mails each form's submissions, saving it, the recipients as an Admin writes them,
// and each problem beside its field. The service's side is proved in
// service-mail-settings.test.js, and the two meet in a real browser in the Compose acceptance
// suite.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { useInterfaceLanguage } from '../src/cms/interface-language.js';
import { problemsShown, readMail, recipientsOf, recipientsText, saveMail } from '../src/cms/mail/client.js';

const SETTINGS = {
  local: false,
  adapter: 'none',
  smtp: { host: '', port: 587, security: 'starttls', username: '', password: false, sender: '' },
  forms: [{ name: 'contact', label: 'Contact us', recipients: [] }],
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
    const given = { adapter: 'smtp', smtp: { host: 'smtp.example.com' }, forms: { contact: { recipients: ['anna@example.com'] } } };
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

describe('each problem', () => {
  test('is shown beside its field in the interface language, an address by what was written', () => {
    const given = { forms: { contact: { recipients: ['anna@example.com', 'bo@'] } } };
    const problems = { 'smtp.host': 'not-host', 'smtp.port': 'not-port', 'smtp.username': 'needs-encryption', 'smtp.sender': 'missing', 'forms.contact.recipients.1': 'not-email', 'forms.note.recipients': 'too-many', adapter: 'unknown' };
    assert.deepEqual(problemsShown(problems, given), {
      host: 'Give the mail server\'s name, such as smtp.example.com.',
      port: 'Give a port from 1 to 65535.',
      username: 'A username and a password are sent only encrypted: choose STARTTLS or TLS.',
      sender: 'Fill in this field.',
      forms: { contact: ['Not an email address: bo@'], note: ['At most 50 addresses.'] },
      adapter: 'Choose one of the options.',
    });
    try {
      useInterfaceLanguage('sv');
      assert.deepEqual(problemsShown({ 'smtp.sender': 'not-email', 'smtp.password': 'malformed' }, given), { sender: 'Ange en e-postadress, till exempel namn@exempel.se.', password: 'Kontrollera det här fältet.' });
    } finally {
      useInterfaceLanguage('en');
    }
  });
});
