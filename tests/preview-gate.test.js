// The live preview's gate, against a Forgejo and a dev server that are small programs of
// this test: who gets past it, what it says about every answer, and what it never passes on.

import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { isLivePreview, isPublicBuild } from '../src/astro/public-site.js';
import { DRAFT_PATH, HEALTH_PATH, SESSION_PATH, WHERE_PATH } from '../src/cms/preview/paths.js';
import { previewGate } from '../src/preview/gate.js';

const ADMIN = 'http://localhost:7002';
const WRITER = 'token may-write';
const READER = 'Bearer may-read';

const listen = (server) => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});
const closed = (server) => new Promise((resolve) => {
  server.closeAllConnections?.();
  server.close(resolve);
});

describe('the preview\'s gate', () => {
  let forgejo;
  let inner;
  let outer;
  let origin;
  let cookie;
  let asked;
  let taken;
  let starts;
  let clock;
  let forgejoDown;
  let takeFails;
  let startFails;

  before(async () => {
    forgejo = createServer((incoming, outgoing) => {
      const push = incoming.headers.authorization === WRITER;
      const known = push || incoming.headers.authorization === READER;
      outgoing.writeHead(known ? 200 : 401, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify(known && incoming.url === '/api/v1/repos/a/source' ? { permissions: { push } } : {}));
    });
    const forgejoPort = await listen(forgejo);
    inner = createServer((incoming, outgoing) => {
      asked.push({ url: incoming.url, method: incoming.method, headers: incoming.headers });
      if (incoming.url === '/redirects') {
        outgoing.writeHead(301, { Location: `http://${incoming.headers.host}/elsewhere/` });
        return outgoing.end();
      }
      const moved = {
        '/chain/': [301, '/chain/second/'],
        '/chain/second/': [302, '/elsewhere/'],
        '/to-nothing/': [307, '/missing/'],
        '/off-the-site/': [308, 'https://example.com/there/'],
        '/round/': [301, '/and-round/'],
        '/and-round/': [301, '/round/'],
        '/with-a-query/?a=1': [301, '/elsewhere/?b=2'],
      }[incoming.url];
      if (moved || incoming.url.startsWith('/on/')) {
        outgoing.writeHead(moved?.[0] ?? 301, { Location: moved?.[1] ?? `/on/${Number(incoming.url.slice(4)) + 1}` });
        return outgoing.end();
      }
      if (incoming.url === '/missing/' || incoming.url === '/gone/') {
        outgoing.writeHead(incoming.url === '/gone/' ? 410 : 404);
        return outgoing.end('no such page');
      }
      outgoing.writeHead(200, {
        'Content-Type': 'text/html',
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
        'Cache-Control': 'max-age=31536000,immutable',
        'Set-Cookie': 'theirs=1',
        'X-Site': 'kept',
      });
      return outgoing.end('a page');
    });
    inner.on('upgrade', (incoming, socket) => {
      asked.push({ url: incoming.url, method: 'UPGRADE', headers: incoming.headers });
      socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    });
    const innerPort = await listen(inner);
    const gate = previewGate({
      origin: 'http://localhost:7004',
      adminOrigin: ADMIN,
      forgejo: `http://127.0.0.1:${forgejoPort}`,
      repository: 'a/source',
      cookieName: 'a_preview',
      now: () => clock,
      warn: () => {},
      runner: {
        problem: ({ path } = {}) => (path === 'wrong' ? 'not a path' : null),
        take: async (draft) => {
          if (takeFails) throw new Error('broke');
          taken.push(draft);
          return { address: '/a-page/', refusals: [] };
        },
      },
      dev: {
        port: innerPort,
        ensure: async () => {
          starts += 1;
          if (startFails) throw new Error('did not start');
        },
      },
    });
    outer = createServer((incoming, outgoing) => {
      gate.request(incoming, outgoing);
    });
    outer.on('upgrade', (incoming, socket, head) => gate.upgrade(incoming, socket, head));
    origin = `http://127.0.0.1:${await listen(outer)}`;
    if (forgejoDown) await closed(forgejo);
  });

  after(async () => {
    await closed(outer);
    await closed(inner);
    await closed(forgejo);
  });

  beforeEach(() => {
    asked = [];
    taken = [];
    starts = 0;
    clock = 1_000_000;
    takeFails = false;
    startFails = false;
  });

  const session = (authorization = WRITER, from = ADMIN) => fetch(`${origin}${SESSION_PATH}`, { method: 'POST', headers: { origin: from, authorization } });
  const signedIn = async () => {
    const answer = await session();
    assert.equal(answer.status, 200);
    [cookie] = answer.headers.get('set-cookie').split(';');
    return answer;
  };
  const draft = (body, headers = {}) => fetch(`${origin}${DRAFT_PATH}`, { method: 'POST', headers: { origin: ADMIN, cookie, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  test('stands, and says so, with nobody signed in', async () => {
    assert.equal((await fetch(`${origin}${HEALTH_PATH}`)).status, 200);
  });

  test('shows nobody a page without a session, and starts nothing for them', async () => {
    for (const path of ['/', '/a-page/', '/src/secret.js', '/@fs/secret/read-token', '/robots.txt']) {
      const answer = await fetch(`${origin}${path}`);
      assert.equal(answer.status, 403, path);
      assert.doesNotMatch(await answer.text(), /a page/);
    }
    assert.equal(asked.length, 0);
    assert.equal(starts, 0);
  });

  test('gives a session to a credential that may write, and to none other', async () => {
    assert.equal((await session(READER)).status, 403, 'may read');
    assert.equal((await session('token nobody')).status, 403, 'unknown');
    assert.equal((await session('nonsense')).status, 401, 'no credential');
    assert.equal((await fetch(`${origin}${SESSION_PATH}`, { method: 'POST', headers: { origin: ADMIN } })).status, 401, 'nothing given');
    assert.equal((await session(WRITER, 'http://elsewhere.example')).status, 403, 'another origin');
    assert.equal((await fetch(`${origin}${SESSION_PATH}`, { method: 'POST', headers: { authorization: WRITER } })).status, 403, 'no origin');
    assert.equal((await fetch(`${origin}${SESSION_PATH}`, { headers: { origin: ADMIN, authorization: WRITER } })).status, 405, 'GET');
  });

  test('its cookie cannot be read by a page, or sent from elsewhere', async () => {
    const answer = await signedIn();
    const set = answer.headers.get('set-cookie');
    assert.match(set, /^a_preview=[\w-]{43};/);
    assert.match(set, /; HttpOnly/);
    assert.match(set, /; SameSite=Lax/);
    assert.match(set, /; Path=\//);
    assert.doesNotMatch(set, /Domain=/i);
    assert.doesNotMatch(set, /Secure/, 'Safari refuses one on a local address');
    assert.equal(answer.headers.get('access-control-allow-origin'), ADMIN);
    assert.equal(answer.headers.get('access-control-allow-credentials'), 'true');
  });

  test('starts the dev server when someone opens an entry', async () => {
    await signedIn();
    assert.equal(starts, 1);
  });

  test('a session ends, and a forged one is none', async () => {
    await signedIn();
    assert.equal((await fetch(`${origin}/`, { headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${origin}/`, { headers: { cookie: 'a_preview=forged' } })).status, 403);
    clock += 60 * 60 * 1000 + 1;
    assert.equal((await fetch(`${origin}/`, { headers: { cookie } })).status, 403);
    assert.equal((await draft({ path: 'pages/a.md', fields: {} })).status, 401);
  });

  test('every answer frames for the editor alone, is never indexed and is nobody else\'s to keep', async () => {
    await signedIn();
    const answers = [
      await fetch(`${origin}/`, { headers: { cookie } }),
      await fetch(`${origin}/`),
      await fetch(`${origin}${HEALTH_PATH}`),
      await draft({ path: 'pages/a.md', fields: {} }),
    ];
    for (const answer of answers) {
      assert.equal(answer.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.match(answer.headers.get('cache-control'), /^private/);
      assert.equal(answer.headers.get('x-frame-options'), null);
      assert.equal(answer.headers.get('content-security-policy'), `frame-ancestors ${ADMIN}`);
    }
  });

  test('passes the dev server\'s own headers on, but none it must not decide', async () => {
    await signedIn();
    const answer = await fetch(`${origin}/`, { headers: { cookie } });
    assert.equal(await answer.text(), 'a page');
    assert.equal(answer.headers.get('x-site'), 'kept');
    assert.equal(answer.headers.get('set-cookie'), null);
  });

  test('tells the dev server nothing of the session, or of where it was reached', async () => {
    await signedIn();
    await fetch(`${origin}/a-page/`, { headers: { cookie: `${cookie}; other=1`, origin: 'http://x.example', referer: 'http://x.example/' } });
    const { headers, url } = asked.at(-1);
    assert.equal(url, '/a-page/');
    assert.equal(headers.cookie, 'other=1');
    assert.equal(headers.origin, undefined);
    assert.equal(headers.referer, undefined);
    assert.match(headers.host, /^127\.0\.0\.1:\d+$/);
  });

  test('keeps a redirect on this host', async () => {
    await signedIn();
    const answer = await fetch(`${origin}/redirects`, { headers: { cookie }, redirect: 'manual' });
    assert.equal(answer.status, 301);
    assert.equal(answer.headers.get('location'), '/elsewhere/');
  });

  test('shows pages, and sends only what a form sends', async () => {
    await signedIn();
    assert.equal((await fetch(`${origin}/`, { method: 'POST', headers: { cookie } })).status, 405);
    assert.equal((await fetch(`${origin}/`, { method: 'PUT', headers: { cookie } })).status, 405);
    assert.equal((await fetch(`${origin}/`, { method: 'HEAD', headers: { cookie } })).status, 200);
    assert.equal((await fetch(`${origin}/_konzilo/forms/contact`, { method: 'POST', headers: { cookie } })).status, 200);
  });

  test('says so when the dev server does not start', async () => {
    await signedIn();
    startFails = true;
    assert.equal((await fetch(`${origin}/`, { headers: { cookie } })).status, 503);
  });

  test('takes a draft from the editor with a session, and answers what its pane shows', async () => {
    await signedIn();
    const given = { path: 'pages/a.md', fields: { title: 'A' } };
    const answer = await draft(given);
    assert.equal(answer.status, 200);
    assert.equal(answer.headers.get('access-control-allow-origin'), ADMIN);
    assert.deepEqual(await answer.json(), { address: '/a-page/', refusals: [] });
    assert.deepEqual(taken, [given]);
  });

  test('takes no draft from anywhere else, or that it cannot read', async () => {
    await signedIn();
    assert.equal((await draft({ path: 'pages/a.md', fields: {} }, { origin: 'http://x.example' })).status, 403);
    assert.equal((await draft({ path: 'wrong', fields: {} })).status, 400);
    const unreadable = await fetch(`${origin}${DRAFT_PATH}`, { method: 'POST', headers: { origin: ADMIN, cookie }, body: 'not json' });
    assert.equal(unreadable.status, 400);
    assert.deepEqual(taken, []);
  });

  describe('a frame, which keeps to the page its editor works on', () => {
    const asked_as = (path, dest) => fetch(`${origin}${path}`, { redirect: 'manual', headers: { cookie, 'sec-fetch-dest': dest, 'sec-fetch-mode': 'navigate' } });

    test('stays where it is, with nothing to follow, when an address redirects', async () => {
      await signedIn();
      const answer = await asked_as('/redirects', 'iframe');
      assert.equal(answer.status, 204);
      assert.equal(answer.headers.get('location'), null);
      assert.equal(answer.headers.get('content-security-policy'), `frame-ancestors ${ADMIN}`);
      assert.equal(await answer.text(), '');
    });

    test('is shown a page as before', async () => {
      await signedIn();
      const answer = await asked_as('/a-page/', 'iframe');
      assert.equal(answer.status, 200);
      assert.equal(await answer.text(), 'a page');
    });

    test('is the only one kept from a redirect: a tab and a page\'s own requests follow theirs', async () => {
      await signedIn();
      for (const dest of ['document', 'image', 'empty']) assert.equal((await asked_as('/redirects', dest)).status, 301, dest);
      assert.equal((await fetch(`${origin}/redirects`, { redirect: 'manual', headers: { cookie } })).status, 301);
    });
  });

  describe('where an address leads', () => {
    const where = (to, { from = ADMIN, held = cookie, method = 'GET' } = {}) => fetch(`${origin}${WHERE_PATH}?to=${encodeURIComponent(to)}`, { method, headers: { origin: from, ...(held ? { cookie: held } : {}) } });
    const found = async (to) => {
      const answer = await where(to);
      assert.equal(answer.status, 200, to);
      assert.equal(answer.headers.get('access-control-allow-origin'), ADMIN);
      assert.equal(answer.headers.get('access-control-allow-credentials'), 'true');
      return answer.json();
    };

    test('is told only to the editor with a session', async () => {
      await signedIn();
      assert.equal((await where('/a-page/', { held: null })).status, 401);
      assert.equal((await where('/a-page/', { held: 'a_preview=forged' })).status, 401);
      assert.equal((await where('/a-page/', { from: 'http://elsewhere.example' })).status, 403);
      assert.equal((await where('/a-page/', { method: 'POST' })).status, 405);
    });

    test('a page ends there', async () => {
      await signedIn();
      assert.deepEqual(await found('/a-page/'), { status: 200, redirect: null, loop: false });
    });

    test('an address with no page says so, with its status', async () => {
      await signedIn();
      assert.deepEqual(await found('/missing/'), { status: 404, redirect: null, loop: false });
      assert.deepEqual(await found('/gone/'), { status: 410, redirect: null, loop: false });
    });

    test('a redirect names its target on this host, whatever the dev server called itself', async () => {
      await signedIn();
      assert.deepEqual(await found('/redirects'), { status: 200, redirect: { status: 301, to: '/elsewhere/' }, loop: false });
    });

    test('a chain ends at its last target, with the status of the first step', async () => {
      await signedIn();
      assert.deepEqual(await found('/chain/'), { status: 200, redirect: { status: 301, to: '/elsewhere/' }, loop: false });
    });

    test('keeps the query, there and on the way', async () => {
      await signedIn();
      assert.deepEqual(await found('/with-a-query/?a=1'), { status: 200, redirect: { status: 301, to: '/elsewhere/?b=2' }, loop: false });
    });

    test('a redirect to nothing says both', async () => {
      await signedIn();
      assert.deepEqual(await found('/to-nothing/'), { status: 404, redirect: { status: 307, to: '/missing/' }, loop: false });
    });

    test('a target on another site is named, and never asked', async () => {
      await signedIn();
      assert.deepEqual(await found('/off-the-site/'), { status: null, redirect: { status: 308, to: 'https://example.com/there/' }, loop: false });
      assert.equal(asked.some(({ url }) => url.includes('there')), false);
    });

    test('a circle ends, and says it is one', async () => {
      await signedIn();
      assert.deepEqual(await found('/round/'), { status: null, redirect: null, loop: true });
      assert.equal(asked.filter(({ url }) => url === '/round/').length, 1);
    });

    test('a chain with no end is given up on, as a browser would', async () => {
      await signedIn();
      assert.deepEqual(await found('/on/1'), { status: null, redirect: null, loop: true });
      assert.ok(asked.length <= 10, String(asked.length));
    });

    test('is asked only of a path on this host', async () => {
      await signedIn();
      for (const to of ['', 'relative/', '//example.com/', 'https://example.com/', '/\\example.com/', 'javascript:alert(1)']) {
        assert.equal((await where(to)).status, 400, to);
      }
      assert.equal(asked.length, 0);
    });

    test('says so when the dev server does not start', async () => {
      await signedIn();
      startFails = true;
      assert.equal((await where('/a-page/')).status, 503);
    });
  });

  test('answers a question first asked before sending', async () => {
    const answer = await fetch(`${origin}${DRAFT_PATH}`, { method: 'OPTIONS', headers: { origin: ADMIN, 'access-control-request-method': 'POST' } });
    assert.equal(answer.status, 204);
    assert.equal(answer.headers.get('access-control-allow-origin'), ADMIN);
    assert.equal(answer.headers.get('access-control-allow-credentials'), 'true');
    assert.match(answer.headers.get('access-control-allow-headers'), /Authorization/);
  });

  test('says so when the check breaks, and gives away nothing of why', async () => {
    await signedIn();
    takeFails = true;
    const answer = await draft({ path: 'pages/a.md', fields: {} });
    assert.equal(answer.status, 500);
    assert.doesNotMatch(await answer.text(), /broke\b.*stack|at /);
  });

  const upgrade = (headers) => new Promise((resolve, reject) => {
    const asking = httpRequest(`${origin}/socket?token=abc`, { headers: { connection: 'Upgrade', upgrade: 'websocket', ...headers } });
    asking.on('upgrade', (answer, socket) => {
      socket.destroy();
      resolve(answer.statusCode);
    });
    asking.on('response', (answer) => {
      answer.resume();
      resolve(answer.statusCode);
    });
    asking.on('error', reject);
    asking.end();
  });

  test('opens a dev server\'s socket with a session, and none without', async () => {
    assert.equal(await upgrade({}), 403);
    assert.equal(asked.length, 0);
    await signedIn();
    assert.equal(await upgrade({ cookie }), 403, 'from no page');
    assert.equal(await upgrade({ cookie, origin: 'http://elsewhere.example' }), 403, 'from another site');
    assert.equal(await upgrade({ cookie, origin: 'http://localhost:7004' }), 101);
    const { url, headers } = asked.at(-1);
    assert.equal(url, '/socket?token=abc');
    assert.equal(headers.cookie, undefined);
  });
});

describe('a live preview\'s dev server', () => {
  test('is no public site, though it stands at the root of its host', () => {
    assert.equal(isLivePreview({ KONZILO_PREVIEW: '1' }), true);
    assert.equal(isPublicBuild('/', { KONZILO_PREVIEW: '1' }), false);
    assert.equal(isLivePreview({}), false);
    assert.equal(isPublicBuild('/', {}), true);
    assert.equal(isPublicBuild('/_preview/a/', {}), false);
  });
});
