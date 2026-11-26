// What the editor's *Policy violations* page asks of the service and makes of its answers, before
// it is React: the counts of what the site's policy blocked, an Admin's alone, and what was blocked
// in words where it had no address. The service's side is proved in service-violations.test.js,
// and the two meet in a real browser in the acceptance suite's violations.test.js.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { useInterfaceLanguage } from '../src/cms/interface-language.js';
import { blockedShown, readViolations } from '../src/cms/violations/client.js';

const COUNTS = {
  days: 30,
  most: 1000,
  violations: [{ page: '/one/', directive: 'img-src', blocked: 'https://tracker.example', count: 3, lastSeen: '2026-11-25T10:00:00.000Z' }],
  rest: null,
};

// A service that answers as it is told to, and notes what it was asked.
function service(status, body) {
  const asked = [];
  const ask = async (address, { method = 'GET', headers }) => {
    asked.push({ path: new URL(address, 'http://admin').pathname, method, authorization: headers.authorization });
    return { ok: status < 400, status, json: async () => body };
  };
  return { asked, ask };
}

describe('asking the service', () => {
  test('reads the counts with the editor\'s credential', async () => {
    const stand = service(200, COUNTS);
    assert.deepEqual(await readViolations({ credential: () => 'token mine', ask: stand.ask }), { counts: COUNTS });
    assert.deepEqual(stand.asked, [{ path: '/_konzilo/violations', method: 'GET', authorization: 'token mine' }]);
  });

  test('tells an Editor that they are an Admin\'s, and cannot tell without a credential, a service, or an answer', async () => {
    assert.deepEqual(await readViolations({ credential: () => 'token erik', ask: service(403, {}).ask }), { adminOnly: true });
    assert.equal(await readViolations({ credential: () => null, ask: () => assert.fail('asks nothing') }), null);
    assert.equal(await readViolations({ credential: () => 'token mine', ask: async () => { throw new Error('away'); } }), null);
    assert.equal(await readViolations({ credential: () => 'token mine', ask: service(401, {}).ask }), null);
    assert.equal(await readViolations({ credential: () => 'token mine', ask: service(500, {}).ask }), null);
  });
});

describe('what was blocked', () => {
  test('is said in the interface language where it had no address, and shown as it is where it had one', () => {
    try {
      assert.equal(blockedShown('inline'), 'Code written into the page');
      assert.equal(blockedShown('eval'), 'Code made from text (eval)');
      useInterfaceLanguage('sv');
      assert.equal(blockedShown('inline'), 'Kod skriven i sidan');
      assert.equal(blockedShown('https://tracker.example'), 'https://tracker.example');
      assert.equal(blockedShown('data:'), 'data:');
    } finally {
      useInterfaceLanguage('en');
    }
  });
});
