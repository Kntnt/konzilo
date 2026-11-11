// What the editor's Submissions page asks of the service and makes of its answers, before it is
// React: each form, a form's submissions a page at a time, the separator it offers, and the CSV
// download. The service's side is proved in service-submissions.test.js, and the two meet in a
// real browser in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { say, useInterfaceLanguage } from '../src/cms/interface-language.js';
import { downloadCsv, momentShown, offeredSeparator, readForms, readSubmissions, submissionPages, valueShown } from '../src/cms/submissions/client.js';

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

describe('a form\'s submissions a page at a time', () => {
  const submission = (id) => ({ id, sentAt: '2026-11-11T10:00:00.000Z', language: 'en-GB', fields: [] });
  // A service whose answers come only when told, each page of two before the one numbered.
  const slowService = () => {
    const asked = [];
    const waiting = [];
    const get = (address) => {
      const before = Number(new URL(address, 'http://admin').searchParams.get('before') ?? 7);
      asked.push(before);
      const ids = [before - 1, before - 2].filter((id) => id > 0);
      return new Promise((answer) => waiting.push(() => answer({ ok: true, json: async () => ({ submissions: ids.map(submission), more: ids.at(-1) > 1 }) })));
    };
    const answerAll = async () => {
      for (const answer of waiting.splice(0)) answer();
      await new Promise(setImmediate);
    };
    return { asked, get, answerAll };
  };

  test('asks once for the older ones however often it is asked before they come, and goes on from the last one it holds', async () => {
    const stand = slowService();
    const pages = submissionPages({ credential: () => 'token mine', form: 'contact', get: stand.get });
    const first = pages.first();
    await stand.answerAll();
    assert.deepEqual((await first).submissions.map(({ id }) => id), [6, 5]);
    const clicks = [pages.older(), pages.older()];
    await stand.answerAll();
    const [once, twice] = await Promise.all(clicks);
    assert.deepEqual(stand.asked, [7, 5], 'the older ones asked for once');
    assert.deepEqual(once.submissions.map(({ id }) => id), [6, 5, 4, 3]);
    assert.deepEqual(twice, once, 'the same, with nothing twice');
    const next = pages.older();
    await stand.answerAll();
    assert.deepEqual((await next).submissions.map(({ id }) => id), [6, 5, 4, 3, 2, 1]);
    assert.equal((await next).more, false);
    assert.deepEqual(stand.asked, [7, 5, 3], 'from the last one it holds');
  });

  test('gives nothing where the service cannot be told, and asks nothing for older ones where there are none', async () => {
    const pages = submissionPages({ credential: () => null, form: 'contact', get: () => assert.fail('asks nothing') });
    assert.equal(await pages.first(), null);
    assert.equal(await pages.older(), null);
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

describe('a moment shown', () => {
  // The page and the file give a moment in the reader's time zone, which each names in the
  // label beside it, its column's heading in the file.
  test('is in the interface language\'s own form, in the time zone it is shown in, which its label names', async () => {
    const at = '2026-11-11T10:00:00.000Z';
    assert.match(momentShown(at, 'Europe/Stockholm'), /^11 November 2026\b.*\b11:00$/);
    assert.match(momentShown(at, 'UTC'), /^11 November 2026\b.*\b10:00$/);
    await withLanguage('sv', () => {
      assert.match(momentShown(at, 'Europe/Stockholm'), /^11 november 2026\b.*\b11:00$/);
      assert.equal(say('submissions.sentAt', { timeZone: 'Europe/Stockholm' }), 'Skickat (Europe/Stockholm)');
    });
    assert.equal(say('submissions.sentAt', { timeZone: 'Europe/Stockholm' }), 'Sent at (Europe/Stockholm)');
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
