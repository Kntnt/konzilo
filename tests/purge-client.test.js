// What the *Deleted* page asks of the service about an Admin's purge (ADR 0078), against a stand-in
// for its fetch: whether the one asking is an Admin, who may purge, how a purge stands, with who
// has which form open, and the purges made before; a purge asked for by the entry's path and the
// course chosen; and one that waits stopped.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { purgeService } from '../src/cms/deleted/purge.js';

const answer = (status, body) => ({ status, ok: status < 400, json: async () => body });

test('tells an Admin how a purge stands, and an Editor nothing but that it is for Admins', async () => {
  const asked = [];
  const answers = [
    answer(200, { purge: null, purges: [{ at: '2026-11-26T10:00:00Z', by: { login: 'anna', name: 'Anna' } }], open: [] }),
    answer(403, {}),
    answer(502, {}),
    // A page the web server gives where the service is not reached.
    { status: 200, ok: true, json: async () => { throw new SyntaxError('not JSON'); } },
  ];
  const service = purgeService({ credential: () => 'token mine', ask: async (address, init) => {
    asked.push({ address, method: init.method ?? 'GET', authorization: init.headers.authorization, cache: init.cache });
    return answers.shift();
  } });
  assert.deepEqual(await service.status(), { admin: true, purge: null, purges: [{ at: '2026-11-26T10:00:00Z', by: { login: 'anna', name: 'Anna' } }], open: [] });
  assert.deepEqual(await service.status(), { admin: false });
  assert.equal(await service.status(), null);
  assert.equal(await service.status(), null, 'what is not the service\'s answer makes no one an Admin');
  assert.deepEqual(asked[0], { address: '/_konzilo/purge', method: 'GET', authorization: 'token mine', cache: 'no-store' });
});

test('asks for a purge by the entry\'s path and the course, and stops one that waits', async () => {
  const asked = [];
  const answers = [
    answer(202, { purge: { id: 'p1', state: 'waiting', path: 'articles/a.md', forms: [] } }),
    answer(409, { purge: { id: 'p0', state: 'running', path: 'articles/b.md', forms: [] } }),
    answer(404, {}),
    answer(200, { purge: null }),
    answer(409, { purge: { id: 'p1', state: 'running' } }),
  ];
  const service = purgeService({ credential: () => 'token mine', ask: async (address, init) => {
    asked.push({ address, method: init.method, body: init.body, type: init.headers['content-type'] });
    return answers.shift();
  } });
  assert.deepEqual(await service.start('articles/a.md', 'wait'), { purge: { id: 'p1', state: 'waiting', path: 'articles/a.md', forms: [] } });
  assert.deepEqual(asked[0], { address: '/_konzilo/purge', method: 'POST', body: '{"path":"articles/a.md","course":"wait"}', type: 'application/json' });
  assert.deepEqual(await service.start('articles/a.md', 'anyway'), { busy: true, purge: { id: 'p0', state: 'running', path: 'articles/b.md', forms: [] } });
  assert.deepEqual(await service.start('articles/a.md', 'anyway'), { gone: true });
  assert.equal(await service.stop(), true);
  assert.equal(await service.stop(), false);
  assert.equal(asked.at(-1).method, 'DELETE');
});

test('says what this tab purged once the page loads again, by the purge it asked for, and once that is done', async () => {
  const kept = new Map();
  globalThis.sessionStorage = { getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => kept.set(key, value), removeItem: (key) => kept.delete(key) };
  try {
    const { purgedBefore } = await import('../src/cms/deleted/purge-dialog.js');
    kept.set('konzilo-purged', JSON.stringify({ id: 'p1', title: 'The meadow' }));
    assert.equal(purgedBefore({ id: 'p0', state: 'done' }), null, 'another purge');
    assert.equal(purgedBefore({ id: 'p1', state: 'running' }), null, 'not before it is done');
    assert.equal(purgedBefore({ id: 'p1', state: 'done' }), 'The meadow');
    assert.equal(kept.has('konzilo-purged'), false, 'said once');
    assert.equal(purgedBefore({ id: 'p1', state: 'done' }), 'The meadow', 'for as long as the page is open');
  } finally {
    delete globalThis.sessionStorage;
  }
});
