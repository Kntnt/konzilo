// The service's part in publishing, against a stand-in for Forgejo: what asks for a build, and
// who is told how publishing stands.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { editorsService, nextMinute } from '../src/service/editors.js';

describe('the service, for editors', () => {
  let folder;
  let count = 0;

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-service-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

  // A service on a port of its own, with a Forgejo that answers as it is told to.
  const running = async ({ head = 'c2', files = { 'articles/aaaaaaaaaaaa.md': 'v1', 'media/photo.jpg': 'p1', 'settings.json': 's1' }, now, forgejoDown = false } = {}) => {
    const control = buildControl(join(folder, `control-${(count += 1)}`));
    const asked = [];
    const get = async (url, { headers }) => {
      asked.push({ path: new URL(url).pathname, authorization: headers.authorization });
      if (forgejoDown) throw new Error('nobody home');
      const { pathname } = new URL(url);
      if (pathname === '/api/v1/repos/org/source') return answerOf({ permissions: { push: headers.authorization === 'token may-write' } }, ['token may-write', 'token may-read'].includes(headers.authorization) ? 200 : 401);
      if (pathname.endsWith('/branches/main')) return answerOf({ commit: { id: head } });
      if (pathname.endsWith('/git/trees/main')) return answerOf({ tree: Object.entries(files).map(([path, sha]) => ({ path, sha, type: 'blob' })), truncated: false });
      throw new Error(`nothing to say of ${pathname}`);
    };
    const warned = [];
    const service = editorsService({
      forgejo: 'http://forgejo',
      repository: 'org/source',
      token: 'read-token',
      control,
      get,
      isPost: (file) => file.startsWith('articles/'),
      warn: (words) => warned.push(words),
      ...(now ? { now } : {}),
    });
    const server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    return {
      service,
      control,
      asked,
      warned,
      origin: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((go) => {
        server.closeAllConnections();
        server.close(go);
      }),
    };
  };

  const withService = (options, work) => async () => {
    const one = await running(options);
    try {
      await work(one);
    } finally {
      await one.close();
    }
  };

  test('asks for a build at a webhook, whatever it says, since the build looks for itself', withService({}, async ({ origin, control }) => {
    const answer = await fetch(`${origin}/webhook`, { method: 'POST', body: '{"anything":"at all"}' });
    assert.equal(answer.status, 202);
    assert.equal(control.requested(), true);
  }));

  test('takes a webhook only by POST', withService({}, async ({ origin, control }) => {
    assert.equal((await fetch(`${origin}/webhook`)).status, 405);
    assert.equal(control.requested(), false);
  }));

  test('tells only those who may write how publishing stands, asking Forgejo each time', withService({}, async ({ origin, asked }) => {
    const status = async (headers) => (await fetch(`${origin}/_konzilo/status`, { headers })).status;
    assert.equal(await status({}), 401);
    assert.equal(await status({ authorization: 'nonsense' }), 401);
    assert.equal(await status({ authorization: 'token someone-else' }), 401);
    assert.equal(await status({ authorization: 'token may-read' }), 401);
    assert.equal(await status({ authorization: 'token may-write' }), 200);
    assert.equal(await status({ authorization: 'token may-write' }), 200);
    assert.equal(asked.filter(({ path }) => path === '/api/v1/repos/org/source').length, 4, 'each time there is a credential to ask about');
  }));

  test('says how each post stands, of the versions in the source now, and what else was refused', withService({}, async ({ origin, control }) => {
    control.writeRecord({
      source: 'c1',
      reason: null,
      at: '2026-11-04T10:00:00.000Z',
      posts: { 'articles/aaaaaaaaaaaa.md': { id: 'aaaaaaaaaaaa', type: 'article', title: 'A post', state: 'live', address: '/a-post/', shown: true, version: 'v1', warnings: [], refusals: [] } },
      release: { held: { 'articles/aaaaaaaaaaaa.md': 'v1' } },
      refusals: [{ file: 'settings.json', reason: 'no' }],
      warnings: [],
    });
    const answer = await fetch(`${origin}/_konzilo/status`, { headers: { authorization: 'token may-write' } });
    assert.equal(answer.headers.get('cache-control'), 'no-store');
    const { posts, others, at } = await answer.json();
    assert.equal(at, '2026-11-04T10:00:00.000Z');
    assert.deepEqual(posts.map(({ file, status, title }) => ({ file, status, title })), [{ file: 'articles/aaaaaaaaaaaa.md', status: 'live', title: 'A post' }]);
    assert.deepEqual(others.refusals, [{ file: 'settings.json', reason: 'no' }]);
  }));

  test('answers for nothing else', withService({}, async ({ origin }) => {
    assert.equal((await fetch(`${origin}/`)).status, 404);
    assert.equal((await fetch(`${origin}/_konzilo/other`)).status, 404);
    assert.equal((await fetch(`${origin}/health`)).status, 200);
    assert.equal((await fetch(`${origin}/_konzilo/status`, { method: 'POST' })).status, 405);
  }));

  describe('at the start of each minute', () => {
    test('finds the start of the next minute', () => {
      assert.equal(nextMinute(Date.UTC(2026, 10, 4, 10, 5, 0)), 60_000);
      assert.equal(nextMinute(Date.UTC(2026, 10, 4, 10, 5, 59, 500)), 500);
    });

    test('asks for a build when the source stands at a commit no build has read', withService({ head: 'c2' }, async ({ service, control }) => {
      control.writeRecord({ source: 'c1', next: null });
      await service.tick();
      assert.equal(control.requested(), true, 'as after a webhook that never came');
    }));

    test('asks for nothing when the last build read what stands, also when it failed', withService({ head: 'c2' }, async ({ service, control }) => {
      control.writeRecord({ source: 'c2', next: null, reason: 'it failed' });
      await service.tick();
      assert.equal(control.requested(), false);
    }));

    test('asks for nothing before there is a first build, which the builder starts itself', withService({}, async ({ service, control }) => {
      await service.tick();
      assert.equal(control.requested(), false);
    }));

    test('asks for a build when a scheduled moment has passed, also one passed while it was away', withService({ head: 'c2', now: () => new Date('2026-11-04T10:05:00Z') }, async ({ service, control }) => {
      control.writeRecord({ source: 'c2', next: '2026-11-04T10:06:00Z' });
      await service.tick();
      assert.equal(control.requested(), false, 'not yet');
      control.writeRecord({ source: 'c2', next: '2026-11-04T10:05:00Z' });
      await service.tick();
      assert.equal(control.requested(), true, 'to the second');
      control.takeRequest();
      control.writeRecord({ source: 'c2', next: '2026-11-01T00:00:00Z' });
      await service.tick();
      assert.equal(control.requested(), true, 'and later');
    }));

    test('stays calm when Forgejo does not answer', withService({ forgejoDown: true }, async ({ service, control, warned }) => {
      control.writeRecord({ source: 'c1', next: null });
      await service.tick();
      assert.equal(control.requested(), false);
      assert.match(warned[0], /could not see where the source stands/);
    }));
  });
});
