// What the editor's *Personal data* page asks of the service and makes of its answers, before it
// is React: a person's submissions found by what they wrote, those an Admin chooses downloaded as
// CSV, and erased. The service's side is proved in service-personal-data.test.js, and the two
// meet in a real browser in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { useInterfaceLanguage } from '../src/cms/interface-language.js';
import { downloadTheirs, eraseTheirs, findTheirs } from '../src/cms/personal-data/client.js';

const FOUND = { submissions: [{ id: 3, form: 'contact', label: 'Contact us', sentAt: '2026-11-12T10:00:00.000Z', language: 'en-GB', spam: false, fields: [] }], more: false };

// A service that answers as it is told to, and notes what it was asked.
function service(status, body) {
  const asked = [];
  const ask = async (address, { method = 'GET', headers }) => {
    const url = new URL(address, 'http://admin');
    asked.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), method, authorization: headers.authorization });
    return { ok: status < 400, status, json: async () => body, blob: async () => new Blob([body]) };
  };
  return { asked, ask };
}

describe('asking the service', () => {
  test('finds a person\'s submissions by what they wrote, with the editor\'s credential', async () => {
    const stand = service(200, FOUND);
    assert.deepEqual(await findTheirs({ credential: () => 'token mine', text: 'ada@example.com', ask: stand.ask }), { found: FOUND });
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/personal-data', query: { text: 'ada@example.com' }, method: 'GET', authorization: 'token mine' }]);
  });

  test('erases the submissions chosen, and says how many', async () => {
    const stand = service(200, { erased: 2 });
    assert.deepEqual(await eraseTheirs({ credential: () => 'token mine', ids: [3, 7], ask: stand.ask }), { erased: 2 });
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/personal-data', query: { ids: '3,7' }, method: 'DELETE', authorization: 'token mine' }]);
  });

  test('tells an Editor that it is an Admin\'s, and cannot tell without a credential, a service, or an answer', async () => {
    for (const asking of [(options) => findTheirs({ ...options, text: 'ada' }), (options) => eraseTheirs({ ...options, ids: [3] })]) {
      assert.deepEqual(await asking({ credential: () => 'token erik', ask: service(403, {}).ask }), { adminOnly: true });
      assert.equal(await asking({ credential: () => null, ask: () => assert.fail('asks nothing') }), null);
      assert.equal(await asking({ credential: () => 'token mine', ask: async () => { throw new Error('away'); } }), null);
      assert.equal(await asking({ credential: () => 'token mine', ask: service(401, {}).ask }), null);
      assert.equal(await asking({ credential: () => 'token mine', ask: service(500, {}).ask }), null);
    }
  });
});

describe('the download', () => {
  test('asks for the submissions chosen as CSV by the separator chosen, in the browser\'s time zone and the interface language, and saves it named by the day', async () => {
    const stand = service(200, '﻿Skickat;Formulär\r\n');
    const saved = [];
    try {
      useInterfaceLanguage('sv');
      assert.equal(await downloadTheirs({
        credential: () => 'token mine',
        ids: [3, 7],
        separator: 'semicolon',
        timeZone: 'Europe/Stockholm',
        today: () => new Date('2026-11-11T23:30:00Z'),
        get: stand.ask,
        save: (blob, name) => saved.push({ blob, name }),
      }), true);
    } finally {
      useInterfaceLanguage('en');
    }
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/personal-data.csv', query: { ids: '3,7', separator: 'semicolon', timeZone: 'Europe/Stockholm', language: 'sv' }, method: 'GET', authorization: 'token mine' }]);
    assert.deepEqual(saved.map(({ name }) => name), ['personal-data-2026-11-12.csv']);
  });

  test('saves nothing, and says so, without a credential or an answer it may have', async () => {
    const save = () => assert.fail('saves nothing');
    const options = { ids: [3], separator: 'comma', timeZone: 'UTC', save };
    assert.equal(await downloadTheirs({ ...options, credential: () => null, get: () => assert.fail('asks nothing') }), false);
    assert.equal(await downloadTheirs({ ...options, credential: () => 'token erik', get: service(403, {}).ask }), false);
  });
});
