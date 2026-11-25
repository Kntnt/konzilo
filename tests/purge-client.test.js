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
  ];
  const service = purgeService({ credential: () => 'token mine', ask: async (address, init) => {
    asked.push({ address, method: init.method ?? 'GET', authorization: init.headers.authorization, cache: init.cache });
    return answers.shift();
  } });
  assert.deepEqual(await service.status(), { admin: true, purge: null, purges: [{ at: '2026-11-26T10:00:00Z', by: { login: 'anna', name: 'Anna' } }], open: [] });
  assert.deepEqual(await service.status(), { admin: false });
  assert.equal(await service.status(), null);
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
