// What a tab asks of the service about the locks (ADR 0073), against a stand-in for its fetch.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { lockClient } from '../src/cms/lock/client.js';

const answer = (status, body) => ({ status, ok: status < 400, json: async () => body });

const asking = (answers, { credential = 'token mine' } = {}) => {
  const asked = [];
  const ask = async (address, init) => {
    asked.push({ address, method: init.method, authorization: init.headers.authorization, keepalive: init.keepalive ?? false });
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { asked, client: lockClient({ tab: 'tab-aaaaaaaa', credential: () => credential, ask, pause: async () => {} }) };
};

test('holds a form by its name and the tab\'s, and takes one over when asked', async () => {
  const { asked, client } = asking([answer(200, { held: true, since: '2026-11-23T10:00:00.000Z' }), answer(200, { held: true, since: '2026-11-23T10:01:00.000Z' })]);
  assert.deepEqual(await client.hold('articles/aaaaaaaaaaaa'), { held: true, since: '2026-11-23T10:00:00.000Z' });
  await client.hold('articles/aaaaaaaaaaaa', { takeOver: true });
  assert.deepEqual(asked, [
    { address: '/_konzilo/locks/articles%2Faaaaaaaaaaaa?tab=tab-aaaaaaaa', method: 'PUT', authorization: 'token mine', keepalive: false },
    { address: '/_konzilo/locks/articles%2Faaaaaaaaaaaa?tab=tab-aaaaaaaa&takeOver=true', method: 'PUT', authorization: 'token mine', keepalive: false },
  ]);
});

test('says that the forms are shut while an Admin\'s purge waits or runs (ADR 0078)', async () => {
  const { client } = asking([answer(423, { purge: { id: 'p1', state: 'waiting', reload: false } })]);
  assert.deepEqual(await client.hold('articles/aaaaaaaaaaaa'), { shut: true });
});

test('says who holds a form, that it is an Admin\'s, or nothing where the service cannot tell', async () => {
  const { client } = asking([
    answer(409, { holder: { name: 'Ebba Editor', since: '2026-11-23T10:00:00.000Z', yours: false } }),
    answer(403, { adminOnly: true }),
    answer(403, { fromFeed: true }),
    answer(502, {}),
    new Error('offline'),
  ]);
  assert.deepEqual(await client.hold('a/b'), { holder: { name: 'Ebba Editor', since: '2026-11-23T10:00:00.000Z', yours: false } });
  assert.deepEqual(await client.hold('settings/settings'), { adminOnly: true });
  assert.deepEqual(await client.hold('articles/f00d00000001'), { fromFeed: true }, 'a post made from a feed (ADR 0079)');
  assert.equal(await client.hold('a/b'), null);
  assert.equal(await client.hold('a/b'), null);
});

test('asks nothing where nothing is signed in', async () => {
  const { asked, client } = asking([], { credential: null });
  assert.equal(await client.hold('a/b'), null);
  assert.equal(await client.locks(null), null);
  assert.deepEqual(asked, []);
});

test('lets a form go by a call that outlives the page, also where the page is left as the call is made', async () => {
  const { asked, client } = asking([answer(204), answer(204)]);
  await client.release('a/b');
  await client.release('a/b', { leaving: true });
  assert.deepEqual(asked.map(({ method, keepalive }) => [method, keepalive]), [['DELETE', true], ['DELETE', true]]);
});

test('watches the locks, asking each time after the version it last saw, and waits after an answer it cannot read', async () => {
  const seen = [];
  const { asked, client } = asking([answer(200, { version: 3, locks: [] }), answer(500, {}), answer(200, { version: 4, locks: [{ form: 'a/b' }] })]);
  await client.watch(async (locks) => {
    seen.push(locks.version);
    if (seen.length === 2) throw new Error('enough');
  }).catch(() => {});
  assert.deepEqual(seen, [3, 4]);
  assert.deepEqual(asked.map(({ address }) => address), ['/_konzilo/locks?tab=tab-aaaaaaaa', '/_konzilo/locks?tab=tab-aaaaaaaa&after=3', '/_konzilo/locks?tab=tab-aaaaaaaa&after=3']);
});

test('gives up on a hold the service does not answer in time, so that the Editor can work', async () => {
  const ask = (address, init) => new Promise((go, fail) => {
    init.signal?.addEventListener('abort', () => fail(init.signal.reason));
  });
  const client = lockClient({ tab: 'tab-aaaaaaaa', credential: () => 'token mine', ask, answersWithin: 20 });
  assert.equal(await client.hold('a/b'), null);
});

test('lets a form go with nothing that could cut the call short as the page goes', async () => {
  const inits = [];
  const client = lockClient({ tab: 'tab-aaaaaaaa', credential: () => 'token mine', ask: async (address, init) => {
    inits.push(init);
    return answer(204);
  } });
  await client.release('a/b', { leaving: true });
  await client.release('a/b');
  assert.deepEqual(inits.map(({ signal }) => signal), [undefined, undefined]);
});

test('ends the tab as its page is closed, by a call that outlives the page, with nothing that could cut it short', async () => {
  const inits = [];
  const client = lockClient({ tab: 'tab-aaaaaaaa', credential: () => 'token mine', ask: async (address, init) => {
    inits.push({ address, method: init.method, keepalive: init.keepalive, signal: init.signal });
    return answer(204);
  } });
  await client.end();
  assert.deepEqual(inits, [{ address: '/_konzilo/locks?tab=tab-aaaaaaaa', method: 'DELETE', keepalive: true, signal: undefined }]);
});
