// What the editor's Submissions page asks of the service and makes of its answers, before it is
// React: each form, a form's submissions a page at a time, the separator it offers, and the CSV
// download. The service's side is proved in service-submissions.test.js, and the two meet in a
// real browser in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { useInterfaceLanguage } from '../src/cms/interface-language.js';
import { downloadCsv, offeredSeparator, readForms, readSubmissions, valueShown } from '../src/cms/submissions/client.js';

// A service that answers each path as it is told to, and notes what it was asked.
function service(answers) {
  const asked = [];
  const get = async (address, { headers }) => {
    const url = new URL(address, 'http://admin');
    asked.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), authorization: headers.authorization });
    const [status, body] = answers[url.pathname] ?? [404, {}];
    return { ok: status < 400, status, json: async () => body, blob: async () => new Blob([body]) };
  };
  return { asked, get };
}

const withLanguage = async (language, work) => {
  try {
    useInterfaceLanguage(language);
    await work();
  } finally {
    useInterfaceLanguage('en');
  }
};

describe('asking the service', () => {
  test('sends the editor\'s credential for each form, and for a form\'s submissions, a page at a time', async () => {
    const forms = { forms: [{ name: 'contact', label: 'Contact us', count: 1 }] };
    const page = { submissions: [{ id: 7, sentAt: '2026-11-11T10:00:00.000Z', language: 'en-GB', fields: [] }], more: false };
    const stand = service({ '/_konzilo/submissions': [200, forms], '/_konzilo/submissions/contact': [200, page] });
    assert.deepEqual(await readForms({ credential: () => 'token mine', get: stand.get }), forms);
    assert.deepEqual(await readSubmissions({ credential: () => 'token mine', form: 'contact', get: stand.get }), page);
    await readSubmissions({ credential: () => 'token mine', form: 'contact', before: 7, get: stand.get });
    assert.deepEqual(stand.asked, [
      { path: '/_konzilo/submissions', query: {}, authorization: 'token mine' },
      { path: '/_konzilo/submissions/contact', query: {}, authorization: 'token mine' },
      { path: '/_konzilo/submissions/contact', query: { before: '7' }, authorization: 'token mine' },
    ]);
  });

  test('cannot tell without a credential, a service, or an answer it may have', async () => {
    const away = async () => {
      throw new Error('away');
    };
    for (const read of [readForms, (options) => readSubmissions({ ...options, form: 'contact' })]) {
      assert.equal(await read({ credential: () => null, get: () => assert.fail('asks nothing') }), null);
      assert.equal(await read({ credential: () => 'token mine', get: away }), null);
      assert.equal(await read({ credential: () => 'token mine', get: service({}).get }), null);
      assert.equal(await read({ credential: () => 'token someone', get: service({ '/_konzilo/submissions': [401, {}], '/_konzilo/submissions/contact': [401, {}] }).get }), null);
    }
  });
});

describe('the separator offered', () => {
  test('is the semicolon where the interface language writes a decimal comma, and the comma elsewhere', async () => {
    await withLanguage('sv', () => assert.equal(offeredSeparator(), 'semicolon'));
    await withLanguage('en', () => assert.equal(offeredSeparator(), 'comma'));
  });
});

describe('a value shown', () => {
  test('is a text as it came, a box ticked or not in the interface language, and the boxes ticked', async () => {
    assert.equal(valueShown('Hello\nagain'), 'Hello\nagain');
    assert.equal(valueShown(true), 'Yes');
    assert.equal(valueShown(false), 'No');
    assert.equal(valueShown(['Web', 'Print']), 'Web, Print');
    await withLanguage('sv', () => {
      assert.equal(valueShown(true), 'Ja');
      assert.equal(valueShown(false), 'Nej');
    });
  });
});

describe('the download', () => {
  test('asks for a form\'s CSV by the separator chosen, in the browser\'s time zone and the interface language, with the credential, and saves it named by the form and the day', async () => {
    const stand = service({ '/_konzilo/submissions/contact.csv': [200, '\uFEFFSent at;Form\r\n'] });
    const saved = [];
    await withLanguage('sv', async () => {
      const done = await downloadCsv({
        credential: () => 'token mine',
        form: 'contact',
        separator: 'semicolon',
        timeZone: 'Europe/Stockholm',
        today: () => new Date('2026-11-11T23:30:00Z'),
        get: stand.get,
        save: (blob, name) => saved.push({ blob, name }),
      });
      assert.equal(done, true);
    });
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/submissions/contact.csv', query: { separator: 'semicolon', timeZone: 'Europe/Stockholm', language: 'sv' }, authorization: 'token mine' }]);
    assert.equal(saved.length, 1);
    assert.equal(saved[0].name, 'contact-2026-11-12.csv', 'the day in the time zone');
    assert.deepEqual(Buffer.from(await saved[0].blob.arrayBuffer()), Buffer.from('\uFEFFSent at;Form\r\n'), 'as the service wrote it, byte-order mark and all');
  });

  test('saves nothing, and says so, without a credential, a service, or an answer it may have', async () => {
    const save = () => assert.fail('saves nothing');
    const options = { form: 'contact', separator: 'comma', timeZone: 'UTC', save };
    assert.equal(await downloadCsv({ ...options, credential: () => null, get: () => assert.fail('asks nothing') }), false);
    assert.equal(await downloadCsv({ ...options, credential: () => 'token mine', get: service({ '/_konzilo/submissions/contact.csv': [401, {}] }).get }), false);
    assert.equal(await downloadCsv({ ...options, credential: () => 'token mine', get: async () => { throw new Error('away'); } }), false);
  });
});
