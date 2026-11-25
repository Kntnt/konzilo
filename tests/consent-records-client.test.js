// What the editor's *Consent records* page asks of the service and makes of its answers, before it
// is React: the choices per day of a span, a consent ID's records, and a span as CSV, every day in
// UTC. The service's side is proved in service-consent-records.test.js, and the two meet in a real
// browser in the Compose acceptance suite.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { consentIdOf, downloadRecords, findRecords, lastDays, readDays } from '../src/cms/consent-records/client.js';
import { useInterfaceLanguage } from '../src/cms/interface-language.js';

const DAYS = { days: [{ day: '2026-11-10', accept: 2, reject: 1, save: 0, allow: 0, withdraw: 0, notStored: 0 }] };
const RECORDS = { records: [{ id: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', chosen: '2026-11-10T08:00:00.000Z' }] };

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
  test('reads the choices per day of a span, with the editor\'s credential', async () => {
    const stand = service(200, DAYS);
    assert.deepEqual(await readDays({ credential: () => 'token mine', from: '2026-11-01', to: '2026-11-10', ask: stand.ask }), DAYS);
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/consent-records', query: { from: '2026-11-01', to: '2026-11-10' }, method: 'GET', authorization: 'token mine' }]);
  });

  test('finds a consent ID\'s records', async () => {
    const stand = service(200, RECORDS);
    assert.deepEqual(await findRecords({ credential: () => 'token mine', id: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b', ask: stand.ask }), RECORDS);
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/consent-records', query: { id: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' }, method: 'GET', authorization: 'token mine' }]);
  });

  test('tells an Editor that it is an Admin\'s, and cannot tell without a credential, a service, or an answer', async () => {
    for (const asking of [(options) => readDays({ ...options, from: '2026-11-01', to: '2026-11-10' }), (options) => findRecords({ ...options, id: '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b' })]) {
      assert.deepEqual(await asking({ credential: () => 'token erik', ask: service(403, {}).ask }), { adminOnly: true });
      assert.equal(await asking({ credential: () => null, ask: () => assert.fail('asks nothing') }), null);
      assert.equal(await asking({ credential: () => 'token mine', ask: async () => { throw new Error('away'); } }), null);
      assert.equal(await asking({ credential: () => 'token mine', ask: service(401, {}).ask }), null);
      assert.equal(await asking({ credential: () => 'token mine', ask: service(500, {}).ask }), null);
    }
  });
});

describe('the download', () => {
  test('asks for a span\'s records as CSV by the separator chosen, in the interface language, and saves it named by the day in UTC', async () => {
    const stand = service(200, '﻿Samtyckes-ID;Gjort (UTC)\r\n');
    const saved = [];
    try {
      useInterfaceLanguage('sv');
      assert.equal(await downloadRecords({
        credential: () => 'token mine',
        from: '2026-11-01',
        to: '2026-11-10',
        separator: 'semicolon',
        today: () => new Date('2026-11-11T23:30:00Z'),
        get: stand.ask,
        save: (blob, name) => saved.push({ blob, name }),
      }), true);
    } finally {
      useInterfaceLanguage('en');
    }
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/consent-records.csv', query: { from: '2026-11-01', to: '2026-11-10', separator: 'semicolon', timeZone: 'UTC', language: 'sv' }, method: 'GET', authorization: 'token mine' }]);
    assert.deepEqual(saved.map(({ name }) => name), ['consent-records-2026-11-11.csv']);
  });
});

describe('what the page reads', () => {
  test('the last days, today among them, in UTC', () => {
    assert.deepEqual(lastDays(30, () => new Date('2026-11-11T23:30:00Z')), { from: '2026-10-13', to: '2026-11-11' });
    assert.deepEqual(lastDays(1, () => new Date('2026-03-01T00:00:00Z')), { from: '2026-03-01', to: '2026-03-01' });
  });

  test('a consent ID as a visitor copies it, with space around it and in capitals, or null for what is none', () => {
    assert.equal(consentIdOf(' 6F1C2A3B-4D5E-4F60-8A7B-9C0D1E2F3A4B\n'), '6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b');
    for (const none of ['', 'ada@example.com', '6f1c2a3b-4d5e-4f60-8a7b', '6f1c2a3b4d5e4f608a7b9c0d1e2f3a4b']) assert.equal(consentIdOf(none), null, none);
  });
});
