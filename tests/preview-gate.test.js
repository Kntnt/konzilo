// The live preview's gate, against a Forgejo and a dev server that are small programs of
// this test: who gets past it, what it says about every answer, and what it never passes on.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request as httpRequest } from 'node:http';
import { after, before, beforeEach, describe, test } from 'node:test';

import { JSDOM } from 'jsdom';

import { isLivePreview, isPublicBuild } from '../src/astro/public-site.js';
import { text } from '../src/catalogues.js';
import { DRAFT_PATH, HEALTH_PATH, SESSION_PATH, SIGN_IN_PATH, WHERE_PATH } from '../src/cms/preview/paths.js';
import { previewGate } from '../src/preview/gate.js';

const ADMIN = 'http://localhost:7002';
const FORGEJO = 'http://localhost:7003';
const PREVIEW = 'http://localhost:7004';
const CLIENT = 'the-previews-client';
const WRITER = 'token may-write';
const READER = 'Bearer may-read';
// What Forgejo gives a browser back after its sign-in, and the token the gate is given for each:
// an Editor's, which may write to the source, a Reviewer's, which may read it alone, and that of
// someone in none of the site's teams, to whom Forgejo does not say the repository is there.
const CODES = { 'code-writer': 'oauth.may-write', 'code-reviewer': 'oauth.may-read', 'code-stranger': 'oauth.stranger' };
// How often the right to see the preview is asked again, and how long a session lasts after it
// was last asked, for what is not a page of its own.
const CHECK_EVERY = 10 * 60 * 1000;
const SESSION_LIFE = 60 * 60 * 1000;
// A code that reaches Forgejo while it does not answer.
const DOWN = 'code-while-down';
// A page of the site, as the dev server answers it, and what shows that it is there.
const A_PAGE = '<!doctype html><html lang="en"><head><title>A page</title></head><body><p>a page</p></body></html>';
const showsThePage = (html) => html.includes('<p>a page</p>');
// The post the page at /a-page/ is built from, as the runner knows it.
const A_POST = { kind: 'post', file: 'pages/a-page.md', title: 'A page', status: 'draft', at: null, refusals: [] };

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
  let ready;
  let exchanged;
  let removed;
  // The runner's refreshes, whether one breaks, whether it breaks when asked what a page is built
  // from, and what it knows each page is built from, by its path, the post at /a-page/ where it is
  // told nothing else.
  let refreshes;
  let refreshFails;
  let readFails;
  let built;
  // The post an Admin chose as the 404 page, as the runner knows it, or null.
  let notFoundChosen;
  // What the gate has told of.
  let warned;

  before(async () => {
    forgejo = createServer(async (incoming, outgoing) => {
      if (incoming.url === '/login/oauth/access_token') {
        let body = '';
        for await (const part of incoming) body += part;
        const given = Object.fromEntries(new URLSearchParams(body));
        exchanged.push({ method: incoming.method, type: incoming.headers['content-type'], given });
        if (given.code === DOWN) {
          outgoing.writeHead(503);
          return outgoing.end();
        }
        const token = CODES[given.code];
        outgoing.writeHead(token ? 200 : 400, { 'Content-Type': 'application/json' });
        return outgoing.end(JSON.stringify(token ? { access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'never-kept' } : { error: 'invalid_grant' }));
      }
      const { authorization } = incoming.headers;
      const push = (authorization === WRITER || authorization === `Bearer ${CODES['code-writer']}`) && !removed;
      const pull = push || authorization === READER || authorization === `Bearer ${CODES['code-reviewer']}`;
      const known = pull || [WRITER, `Bearer ${CODES['code-writer']}`, `Bearer ${CODES['code-stranger']}`].includes(authorization);
      const status = !known ? 401 : !pull ? 404 : 200;
      outgoing.writeHead(status, { 'Content-Type': 'application/json' });
      return outgoing.end(JSON.stringify(status === 200 && incoming.url === '/api/v1/repos/a/source' ? { permissions: { admin: false, push, pull } } : {}));
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
      // The 404 page, which the dev server shows wherever nothing else answers, and where a rule
      // answers 410.
      if (incoming.url === '/nowhere/' || incoming.url === '/taken-away/') {
        outgoing.writeHead(incoming.url === '/nowhere/' ? 404 : 410, { 'Content-Type': 'text/html' });
        return outgoing.end(A_PAGE);
      }
      if (incoming.url === '/missing/' || incoming.url === '/gone/') {
        outgoing.writeHead(incoming.url === '/gone/' ? 410 : 404);
        return outgoing.end('no such page');
      }
      if (incoming.url === '/style.css') {
        outgoing.writeHead(200, { 'Content-Type': 'text/css' });
        return outgoing.end('p { color: red; }');
      }
      outgoing.writeHead(200, {
        'Content-Type': 'text/html',
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
        'Cache-Control': 'max-age=31536000,immutable',
        'Set-Cookie': 'theirs=1',
        'X-Site': 'kept',
      });
      return outgoing.end(A_PAGE);
    });
    inner.on('upgrade', (incoming, socket) => {
      asked.push({ url: incoming.url, method: 'UPGRADE', headers: incoming.headers });
      socket.end('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
    });
    const innerPort = await listen(inner);
    const gate = previewGate({
      origin: PREVIEW,
      adminOrigin: ADMIN,
      forgejo: `http://127.0.0.1:${forgejoPort}`,
      forgejoOrigin: FORGEJO,
      clientId: CLIENT,
      language: 'sv',
      repository: 'a/source',
      cookieName: 'a_preview',
      now: () => clock,
      warn: (message) => warned.push(message),
      runner: {
        problem: ({ path } = {}) => (path === 'wrong' ? 'not a path' : null),
        take: async (draft) => {
          if (takeFails) throw new Error('broke');
          taken.push(draft);
          return { address: '/a-page/', refusals: [] };
        },
        refresh: async () => {
          refreshes += 1;
          if (refreshFails) throw new Error('the run broke');
        },
        at: (path) => {
          if (readFails) throw new Error('the runner broke');
          return Object.hasOwn(built, path) ? built[path] : path === '/a-page/' ? A_POST : null;
        },
        notFoundAt: () => {
          if (readFails) throw new Error('the runner broke');
          return notFoundChosen;
        },
      },
      dev: {
        port: innerPort,
        ensure: async () => {
          starts += 1;
          if (startFails) throw new Error('did not start');
        },
        ready: () => ready,
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
    ready = true;
    exchanged = [];
    removed = false;
    refreshes = 0;
    refreshFails = false;
    readFails = false;
    built = {};
    notFoundChosen = null;
    warned = [];
  });

  const session = (authorization = WRITER, from = ADMIN) => fetch(`${origin}${SESSION_PATH}`, { method: 'POST', headers: { origin: from, authorization } });
  const signedIn = async () => {
    const answer = await session();
    assert.equal(answer.status, 200);
    [cookie] = answer.headers.get('set-cookie').split(';');
    return answer;
  };
  const draft = (body, headers = {}) => fetch(`${origin}${DRAFT_PATH}`, { method: 'POST', headers: { origin: ADMIN, cookie, 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

  // A browser's visit to a page in a tab of its own, with what it holds of this host.
  const visit = (path, held = null, headers = {}) => fetch(`${origin}${path}`, {
    redirect: 'manual',
    headers: { accept: 'text/html,*/*;q=0.8', 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate', ...(held ? { cookie: held } : {}), ...headers },
  });
  const pairOf = (answer, name) => answer.headers.getSetCookie().map((set) => set.split(';')[0]).find((pair) => pair.startsWith(`${name}`)) ?? null;
  // Whether an answer gives no session: none set, or one emptied.
  const givesNone = (answer) => [null, 'a_preview='].includes(pairOf(answer, 'a_preview='));

  // Forgejo's sign-in, as a browser goes through it for a visit to `path`, and the gate's answer
  // when Forgejo sends it back with `code`. Someone already signed in to Forgejo is sent back
  // at once; anyone else signs in first, which makes no difference to the gate.
  const signInAs = async (path, code, held = null) => {
    const away = await visit(path, held);
    assert.equal(away.status, 303, 'to Forgejo');
    const to = new URL(away.headers.get('location'));
    const state = to.searchParams.get('state');
    const binding = pairOf(away, 'a_preview_sign_in_');
    const back = await visit(`${SIGN_IN_PATH}?${new URLSearchParams({ code, state })}`, [binding, held].filter(Boolean).join('; '));
    return { away, to, state, binding, back };
  };

  describe('a visit in a tab of its own', () => {
    test('leads someone without a session to Forgejo\'s sign-in, as the preview\'s own client, and asks the dev server nothing', async () => {
      const away = await visit('/a-page/?x=1');
      assert.equal(away.status, 303);
      const to = new URL(away.headers.get('location'));
      assert.equal(`${to.origin}${to.pathname}`, `${FORGEJO}/login/oauth/authorize`);
      const query = Object.fromEntries(to.searchParams);
      assert.equal(query.client_id, CLIENT);
      assert.equal(query.redirect_uri, `${PREVIEW}${SIGN_IN_PATH}`);
      assert.equal(query.response_type, 'code');
      assert.equal(query.scope, 'read:repository');
      assert.equal(query.code_challenge_method, 'S256');
      assert.match(query.code_challenge, /^[\w-]{43}$/);
      assert.match(query.state, /^[\w-]{43}$/);
      assert.equal(query.code_verifier, undefined);
      // The sign-in is this browser's own: what it holds comes back with Forgejo's answer alone.
      const [binding] = away.headers.getSetCookie();
      assert.match(binding, new RegExp(`^a_preview_sign_in_[\\w-]+=${query.state};`));
      assert.match(binding, new RegExp(`; Path=${SIGN_IN_PATH}(;|$)`));
      assert.match(binding, /; HttpOnly/);
      assert.match(binding, /; SameSite=Lax/);
      assert.match(binding, /; Max-Age=600/);
      assert.deepEqual(asked, []);
      assert.equal(starts, 0);
    });

    test('leads no frame, nothing a page asks for itself and nothing but GET to a sign-in', async () => {
      for (const dest of ['iframe', 'image', 'script', 'empty']) assert.equal((await visit('/a-page/', null, { 'sec-fetch-dest': dest })).status, 403, dest);
      for (const method of ['HEAD', 'POST']) {
        assert.equal((await fetch(`${origin}/a-page/`, { method, redirect: 'manual', headers: { 'sec-fetch-dest': 'document' } })).status, 403, method);
      }
      // A browser that does not say what it asks for is taken at its word on what it takes.
      assert.equal((await fetch(`${origin}/a-page/`, { redirect: 'manual', headers: { accept: 'text/html,application/xhtml+xml' } })).status, 303);
      assert.equal((await fetch(`${origin}/a-page/`, { redirect: 'manual', headers: { accept: '*/*' } })).status, 403);
      assert.deepEqual(asked, []);
    });

    test('brings someone who may write back to the address asked for, with a session, and keeps nothing of what Forgejo gave', async () => {
      const { to, back } = await signInAs('/a-page/?x=1', 'code-writer');
      assert.equal(back.status, 303);
      assert.equal(back.headers.get('location'), '/a-page/?x=1');
      const held = pairOf(back, 'a_preview=');
      assert.match(held, /^a_preview=[\w-]{43}$/);
      const set = back.headers.getSetCookie().find((one) => one.startsWith('a_preview='));
      for (const attribute of [/; HttpOnly/, /; SameSite=Lax/, /; Path=\/(;|$)/]) assert.match(set, attribute);
      // The browser's own mark of its sign-in goes, used.
      assert.match(back.headers.getSetCookie().find((one) => one.startsWith('a_preview_sign_in_')), /Max-Age=0/);
      const shown = await visit('/a-page/?x=1', held);
      assert.equal(shown.status, 200);
      assert.ok(showsThePage(await shown.text()));

      // The code was exchanged by the gate itself, with the verifier its challenge was made from.
      assert.equal(exchanged.length, 1);
      const [{ method, given }] = exchanged;
      assert.equal(method, 'POST');
      assert.equal(given.grant_type, 'authorization_code');
      assert.equal(given.code, 'code-writer');
      assert.equal(given.client_id, CLIENT);
      assert.equal(given.redirect_uri, `${PREVIEW}${SIGN_IN_PATH}`);
      assert.equal(createHash('sha256').update(given.code_verifier).digest('base64url'), to.searchParams.get('code_challenge'));
      // Nothing of the token reaches the browser or the dev server.
      for (const answer of [back, shown]) assert.doesNotMatch(JSON.stringify([...answer.headers]), /may-write|never-kept/);
      assert.doesNotMatch(JSON.stringify(asked), /may-write|never-kept/);
    });

    test('brings a Reviewer, who may read the source and not write to it, back with a session, and shows them the page an Editor sees', async () => {
      const { back } = await signInAs('/a-page/?x=1', 'code-reviewer');
      assert.equal(back.status, 303);
      assert.equal(back.headers.get('location'), '/a-page/?x=1');
      const held = pairOf(back, 'a_preview=');
      assert.match(held, /^a_preview=[\w-]{43}$/);
      const shown = await visit('/a-page/?x=1', held);
      assert.equal(shown.status, 200);
      assert.ok(showsThePage(await shown.text()));
      assert.equal((await visit('/a-page/', held, { 'sec-fetch-dest': 'image' })).status, 200, 'and what the page asks for itself');
    });

    test('takes no draft from a Reviewer\'s session, which changes nothing anyone sees', async () => {
      const { back } = await signInAs('/', 'code-reviewer');
      const held = pairOf(back, 'a_preview=');
      const answer = await fetch(`${origin}${DRAFT_PATH}`, { method: 'POST', headers: { origin: ADMIN, cookie: held, 'content-type': 'application/json' }, body: JSON.stringify({ path: 'pages/a.md', fields: {} }) });
      assert.equal(answer.status, 403);
      assert.deepEqual(taken, []);
      // An Editor's tab is the session of someone who may write, as the pane's is.
      const editor = pairOf((await signInAs('/', 'code-writer')).back, 'a_preview=');
      assert.equal((await fetch(`${origin}${DRAFT_PATH}`, { method: 'POST', headers: { origin: ADMIN, cookie: editor, 'content-type': 'application/json' }, body: JSON.stringify({ path: 'pages/a.md', fields: {} }) })).status, 200);
    });

    test('meets someone signed in who may not see it with a plain page in the interface language, which says who can grant access, and nothing of the site', async () => {
      const { back } = await signInAs('/a-page/', 'code-stranger');
      assert.equal(back.status, 403);
      assert.match(back.headers.get('content-type'), /^text\/html; charset=utf-8$/);
      assert.ok(givesNone(back), 'no session');
      const page = await back.text();
      assert.match(page, /^<!doctype html>/i);
      assert.match(page, /<html lang="sv">/);
      assert.ok(page.includes(text('sv', 'previewTab.refusedTitle')));
      assert.ok(page.includes(text('sv', 'previewTab.refused')));
      assert.match(page, /Admin/);
      assert.doesNotMatch(page, /a page|<script|<a /);
      assert.deepEqual(asked, []);
      assert.equal(starts, 0);
    });

    // A page that says the sign-in did not complete, with a link back to where it set out for,
    // and no session.
    const unfinished = async (answer, again, says = 'previewTab.signInFailed') => {
      assert.ok(givesNone(answer), 'no session');
      const page = await answer.text();
      assert.ok(page.includes(text('sv', 'previewTab.signInFailedTitle')));
      assert.ok(page.includes(text('sv', says)));
      assert.ok(page.includes(`<a href="${again}">${text('sv', 'previewTab.tryAgain')}</a>`), page);
      assert.deepEqual(asked, []);
    };

    test('opens no session for a sign-in this browser did not start, and says how to sign in anew', async () => {
      const away = await visit('/a-page/');
      const state = new URL(away.headers.get('location')).searchParams.get('state');
      const back = await visit(`${SIGN_IN_PATH}?code=code-writer&state=${state}`);
      assert.equal(back.status, 400);
      await unfinished(back, '/a-page/');
      assert.deepEqual(exchanged, [], 'the code is never exchanged');
    });

    test('takes each sign-in back once', async () => {
      const { state, binding } = await signInAs('/a-page/', 'code-writer');
      const again = await visit(`${SIGN_IN_PATH}?code=code-writer&state=${state}`, binding);
      assert.equal(again.status, 400);
      await unfinished(again, '/');
      assert.equal(exchanged.length, 1);
    });

    test('opens no session where Forgejo gave no code, or one it does not know', async () => {
      const away = await visit('/a-page/');
      const state = new URL(away.headers.get('location')).searchParams.get('state');
      const cancelled = await visit(`${SIGN_IN_PATH}?error=access_denied&state=${state}`, pairOf(away, 'a_preview_sign_in_'));
      assert.equal(cancelled.status, 400);
      await unfinished(cancelled, '/a-page/');
      const { back } = await signInAs('/a-page/', 'code-nobody-gave');
      assert.equal(back.status, 400);
      await unfinished(back, '/a-page/');
      const unknown = await visit(`${SIGN_IN_PATH}?code=code-writer&state=never-given`);
      assert.equal(unknown.status, 400);
      await unfinished(unknown, '/');
    });

    test('takes no state but one of the shape it gives as a sign-in, and derives nothing from another', async () => {
      const { state, binding } = await (async () => {
        const away = await visit('/a-page/');
        return { state: new URL(away.headers.get('location')).searchParams.get('state'), binding: pairOf(away, 'a_preview_sign_in_') };
      })();
      for (const given of [`${state.slice(0, 6)}%0d%0aX-Given:%201${state.slice(6)}`, `${state.slice(0, 4)};Domain=example.com;${state.slice(4)}`, `${state.slice(0, 5)}=${state.slice(5)}`, `${state}x`, state.slice(1), `${state.slice(0, -1)}.`]) {
        const back = await visit(`${SIGN_IN_PATH}?code=code-writer&state=${given}`, binding);
        assert.equal(back.status, 400, given);
        assert.deepEqual(back.headers.getSetCookie(), [], given);
        assert.equal(back.headers.get('x-given'), null, given);
        await unfinished(back, '/');
      }
      assert.deepEqual(exchanged, [], 'no code is exchanged');
    });

    test('says so when Forgejo does not answer', async () => {
      const { back } = await signInAs('/a-page/?x=1', DOWN);
      assert.equal(back.status, 502);
      await unfinished(back, '/a-page/?x=1', 'previewTab.forgejoDown');
    });

    test('leads back to a path on this host alone', async () => {
      for (const asked of ['//elsewhere.example/a/', '/\\elsewhere.example/a/']) {
        const { back } = await signInAs(asked, 'code-writer');
        assert.equal(back.status, 303, asked);
        assert.match(back.headers.get('location'), /^\/(?![/\\])/, asked);
      }
    });

    test('asks Forgejo again at intervals whether its person may still see it, by the next page they open', async () => {
      const { back } = await signInAs('/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      clock += CHECK_EVERY - 1;
      assert.equal((await visit('/a-page/', held)).status, 200, 'within the interval');
      clock += 2;
      const asks = await visit('/a-page/', held);
      assert.equal(asks.status, 303);
      assert.ok(asks.headers.get('location').startsWith(`${FORGEJO}/login/oauth/authorize?`));
      // What a page asks for itself, and a frame, which cannot be led away, go on meanwhile.
      for (const dest of ['image', 'script', 'iframe']) assert.equal((await visit('/a-page/', held, { 'sec-fetch-dest': dest })).status, 200, dest);
      const again = await signInAs('/a-page/', 'code-writer', held);
      assert.equal(again.back.status, 303);
      assert.equal(again.back.headers.get('location'), '/a-page/');
      assert.equal((await visit('/a-page/', pairOf(again.back, 'a_preview='))).status, 200);
    });

    test('refuses someone removed from the site\'s teams at the next check, and ends their session', async () => {
      const { back } = await signInAs('/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      removed = true;
      clock += CHECK_EVERY + 1;
      const refused = await signInAs('/a-page/', 'code-writer', held);
      assert.equal(refused.back.status, 403);
      assert.ok((await refused.back.text()).includes(text('sv', 'previewTab.refused')));
      assert.match(refused.back.headers.getSetCookie().find((one) => one.startsWith('a_preview=')), /Max-Age=0/);
      assert.equal((await visit('/a-page/', held, { 'sec-fetch-dest': 'image' })).status, 403);
    });

    test('ends a session an hour after it was last asked', async () => {
      const { back } = await signInAs('/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      clock += SESSION_LIFE + 1;
      assert.equal((await visit('/a-page/', held, { 'sec-fetch-dest': 'iframe' })).status, 403);
    });

    test('starts a stopped preview at a visit, with a short notice in the interface language until the page is ready', async () => {
      const { back } = await signInAs('/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      ready = false;
      starts = 0;
      const notice = await visit('/a-page/', held);
      assert.equal(notice.status, 503);
      assert.equal(notice.headers.get('retry-after'), '2');
      const page = await notice.text();
      assert.ok(page.includes(text('sv', 'previewTab.startingTitle')));
      assert.ok(page.includes(text('sv', 'previewTab.starting')));
      assert.match(page, /<meta http-equiv="refresh" content="2">/);
      assert.doesNotMatch(page, /<script/);
      assert.equal(starts, 1);
      assert.deepEqual(asked, []);
      ready = true;
      const shown = await visit('/a-page/', held);
      assert.equal(shown.status, 200);
      assert.ok(showsThePage(await shown.text()));
    });

    test('says so when the preview did not start, and starts it anew at the next try', async () => {
      const { back } = await signInAs('/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      ready = false;
      startFails = true;
      assert.equal((await visit('/a-page/?x=1', held)).status, 503);
      const failed = await visit('/a-page/?x=1', held);
      assert.equal(failed.status, 503);
      const page = await failed.text();
      assert.ok(page.includes(text('sv', 'previewTab.notStartedTitle')));
      assert.ok(page.includes(text('sv', 'previewTab.notStarted')));
      assert.ok(page.includes(`<a href="/a-page/?x=1">${text('sv', 'previewTab.tryAgain')}</a>`));
      assert.doesNotMatch(page, /http-equiv="refresh"/, 'it waits for the person');
      startFails = false;
      starts = 0;
      assert.ok((await (await visit('/a-page/?x=1', held)).text()).includes(text('sv', 'previewTab.startingTitle')));
      assert.equal(starts, 1);
    });

    test('tells of a failed start only while someone may be waiting for it', async () => {
      const { back } = await signInAs('/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      ready = false;
      startFails = true;
      await visit('/a-page/', held);
      startFails = false;
      clock += 60 * 1000 + 1;
      assert.ok((await (await visit('/a-page/', held)).text()).includes(text('sv', 'previewTab.startingTitle')));
    });

    test('lets a frame and what a page asks for itself wait for a stopped preview, as before', async () => {
      await signedIn();
      ready = false;
      for (const dest of ['iframe', 'image']) {
        const answer = await visit('/a-page/', cookie, { 'sec-fetch-dest': dest });
        assert.equal(answer.status, 200, dest);
        assert.equal(await answer.text(), A_PAGE);
      }
    });

    test('keeps every answer from being indexed, kept by anyone else or framed but by the editor', async () => {
      const away = await visit('/a-page/');
      const { back } = await signInAs('/a-page/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      const refused = (await signInAs('/a-page/', 'code-stranger')).back;
      const unfinishedOne = await visit(`${SIGN_IN_PATH}?code=code-writer&state=never-given`);
      ready = false;
      const notice = await visit('/a-page/', held);
      for (const answer of [away, back, refused, unfinishedOne, notice]) {
        assert.equal(answer.headers.get('x-robots-tag'), 'noindex, nofollow', answer.status);
        assert.match(answer.headers.get('cache-control'), /^private/, answer.status);
        assert.equal(answer.headers.get('x-frame-options'), null);
        assert.match(answer.headers.get('content-security-policy'), new RegExp(`(^|; )frame-ancestors ${ADMIN}$`), answer.status);
      }
      // Its own pages load nothing and run nothing.
      for (const answer of [refused, unfinishedOne, notice]) assert.match(answer.headers.get('content-security-policy'), /^default-src 'none'; /);
    });

    // A saved post the intake refuses, as the runner holds it at the page it would have.
    const broken = {
      kind: 'post',
      file: 'pages/broken.md',
      status: 'draft',
      at: null,
      title: 'A <b>bold</b> title',
      refusals: [
        { field: { name: 'title', label: { en: 'Title', sv: 'Titel' } }, name: 'refusal.title-markup', values: {}, reason: 'the site cannot publish a title holding HTML; write it as plain text' },
        { field: null, block: { path: '2', name: 'list' }, reason: 'words of the site\'s own check' },
      ],
    };

    test('names a saved post\'s refusal where its page would be, in the interface language, and shows nothing of the site there', async () => {
      const { back } = await signInAs('/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      built['/pages/broken/'] = broken;
      asked = [];
      const shown = await visit('/pages/broken/?x=1', held);
      assert.equal(shown.status, 200);
      assert.match(shown.headers.get('content-type'), /^text\/html; charset=utf-8$/);
      assert.match(shown.headers.get('content-security-policy'), /^default-src 'none'; /);
      assert.equal(shown.headers.get('x-robots-tag'), 'noindex, nofollow');
      const page = await shown.text();
      assert.match(page, /<html lang="sv">/);
      assert.ok(page.includes(text('sv', 'previewTab.postRefusedTitle')));
      assert.ok(page.includes(text('sv', 'previewTab.postRefused', { title: 'A &#60;b&#62;bold&#60;/b&#62; title' })), page);
      assert.ok(page.includes(`<li>${text('sv', 'about.field', { field: 'Titel' })}: ${text('sv', 'refusal.title-markup')}</li>`), page);
      assert.ok(page.includes(`<li>${text('sv', 'about.block', { path: '2', name: 'list' })}: words of the site&#39;s own check</li>`), page);
      // Nothing runs there but the toolbar, which is the gate's own.
      assert.doesNotMatch(page.replace(/<script>\(function previewToolbar\([\s\S]*?<\/script>/, ''), /<script|<b>/);
      assert.deepEqual(asked.map(({ url }) => url), [], 'the dev server is asked nothing');
      assert.equal(refreshes, 1, 'what is saved is read first');
    });

    test('lets a frame show the last good page at a refused post\'s address, which its pane names the refusal above', async () => {
      await signedIn();
      built['/pages/broken/'] = broken;
      const shown = await visit('/pages/broken/', cookie, { 'sec-fetch-dest': 'iframe' });
      assert.equal(shown.status, 200);
      assert.equal(await shown.text(), A_PAGE);
    });

    test('reads what is saved before each page asked for in a tab, and shows what it has where that breaks', async () => {
      const { back } = await signInAs('/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      refreshes = 0;
      assert.equal((await visit('/a-page/', held)).status, 200);
      assert.equal(refreshes, 1);
      for (const dest of ['image', 'script', 'iframe']) await visit('/a-page/', held, { 'sec-fetch-dest': dest });
      assert.equal(refreshes, 1, 'not for what a page asks for itself, or a frame');
      refreshFails = true;
      const shown = await visit('/a-page/', held);
      assert.equal(shown.status, 200);
      assert.ok(showsThePage(await shown.text()));
    });

    // A browser that asked for a page is answered with it, whatever breaks on the way: it would
    // otherwise wait for an answer that never comes.
    test('shows the page where the runner cannot say what it is built from, and tells why', { timeout: 10_000 }, async () => {
      const { back } = await signInAs('/', 'code-writer');
      const held = pairOf(back, 'a_preview=');
      refreshFails = true;
      readFails = true;
      for (const [path, status] of [['/a-page/', 200], ['/nowhere/', 404]]) {
        const shown = await visit(path, held);
        assert.equal(shown.status, status, path);
        assert.ok(showsThePage(await shown.text()), path);
        assert.ok(warned.some((told) => told.includes(path) && told.includes('the runner broke')), `${path}: ${warned.join(' | ')}`);
      }
      assert.ok(warned.some((told) => told.includes('the run broke')), 'nor what is saved');
    });

    test('lets someone already signed in to Forgejo in without a word, starting the preview on the way', async () => {
      const { back } = await signInAs('/', 'code-writer');
      assert.equal(back.status, 303);
      assert.equal(starts, 1);
    });
  });

  // The toolbar on every page in a tab of its own: what the page is built from, and, for someone
  // who may write, the way to its form on the admin host (ADR 0032). The page is run here as a
  // browser runs it, scripts and all.
  describe('the toolbar in a tab of its own', () => {
    const shownText = (node) => [...node.childNodes].map((child) => (child.nodeType === 3 ? child.data : child.hidden ? '' : shownText(child))).join('');
    const toolbarIn = async (answer, path) => {
      const { window } = new JSDOM(await answer.text(), { url: `${PREVIEW}${path}`, runScripts: 'dangerously' });
      const hosts = window.document.querySelectorAll('konzilo-preview-toolbar');
      if (hosts.length === 0) return null;
      assert.equal(hosts.length, 1);
      const region = hosts[0].shadowRoot.querySelector('[role="region"]');
      return {
        window,
        name: region.getAttribute('aria-label'),
        lang: region.lang,
        says: shownText(region).replace(/\s+/g, ' ').trim(),
        links: [...region.querySelectorAll('a')].map((link) => ({ name: link.textContent.trim(), href: link.href })),
      };
    };
    const as = async (code) => pairOf((await signInAs('/', code)).back, 'a_preview=');

    test('says on a post\'s page its status, in the interface language, and leads someone who may write to its form on the admin host', async () => {
      const held = await as('code-writer');
      const shown = await visit('/a-page/', held);
      assert.equal(shown.status, 200);
      const toolbar = await toolbarIn(shown, '/a-page/');
      assert.equal(toolbar.name, text('sv', 'previewTab.toolbar.label'));
      assert.equal(toolbar.lang, 'sv');
      assert.ok(toolbar.says.startsWith(text('sv', 'previewTab.toolbar.draft')), toolbar.says);
      assert.deepEqual(toolbar.links, [{ name: text('sv', 'previewTab.toolbar.editPost'), href: `${ADMIN}/#/collections/pages/entries/a-page` }]);
      assert.ok(showsThePage(toolbar.window.document.body.outerHTML), 'and the page');
    });

    // The toolbar runs in the reader's browser, so a moment is said in the reader's own time zone,
    // which it names, as the Submissions page and a refusal say theirs.
    test('says a published post is, and when a scheduled post goes live, in the reader\'s own time zone, named', async () => {
      const held = await as('code-writer');
      built['/live/'] = { ...A_POST, file: 'articles/sv/aaaaaaaaaaaa.md', status: 'published' };
      built['/ahead/'] = { ...A_POST, status: 'scheduled', at: '2026-12-24T09:00:00Z' };
      const live = await toolbarIn(await visit('/live/', held), '/live/');
      assert.ok(live.says.startsWith(text('sv', 'previewTab.toolbar.published')), live.says);
      assert.equal(live.links[0].href, `${ADMIN}/#/collections/articles/entries/aaaaaaaaaaaa`, 'a translation\'s entry is its ID\'s');
      const zone = process.env.TZ;
      try {
        for (const [reader, moment] of [['America/New_York', '24 december 2026 kl. 04:00 GMT−5'], ['Europe/Stockholm', '24 december 2026 kl. 10:00 CET']]) {
          process.env.TZ = reader;
          const ahead = await toolbarIn(await visit('/ahead/', held), '/ahead/');
          assert.ok(ahead.says.startsWith(text('sv', 'previewTab.toolbar.scheduled', { moment })), `${reader}: ${ahead.says}`);
        }
      } finally {
        if (zone === undefined) delete process.env.TZ;
        else process.env.TZ = zone;
      }
    });

    test('leads from a term\'s page to the term, and from a page of many posts or of settings to the editor\'s start, which it says is not edited in one place', async () => {
      const held = await as('code-writer');
      built['/topics/harbours/'] = { kind: 'term', file: 'topics/tttttttttttt.json', title: 'Hamnar', refusals: [] };
      const term = await toolbarIn(await visit('/topics/harbours/', held), '/topics/harbours/');
      assert.ok(term.says.startsWith(text('sv', 'previewTab.toolbar.term', { name: 'Hamnar' })), term.says);
      assert.deepEqual(term.links, [{ name: text('sv', 'previewTab.toolbar.editTerm'), href: `${ADMIN}/#/collections/topics/entries/tttttttttttt` }]);
      const many = await toolbarIn(await visit('/', held), '/');
      assert.ok(many.says.startsWith(text('sv', 'previewTab.toolbar.many')), many.says);
      assert.deepEqual(many.links, [{ name: text('sv', 'previewTab.toolbar.editor'), href: `${ADMIN}/` }]);
    });

    test('leads from the 404 page to the post an Admin chose for it, and else says it is not edited in one place', async () => {
      const held = await as('code-writer');
      notFoundChosen = { kind: 'post', file: 'pages/gone.md', title: 'Not here', status: 'published', at: null, refusals: [] };
      for (const [path, status] of [['/nowhere/', 404], ['/taken-away/', 410]]) {
        const answer = await visit(path, held);
        assert.equal(answer.status, status, path);
        const toolbar = await toolbarIn(answer, path);
        assert.ok(toolbar.says.startsWith(text('sv', 'previewTab.toolbar.published')), toolbar.says);
        assert.deepEqual(toolbar.links, [{ name: text('sv', 'previewTab.toolbar.editPost'), href: `${ADMIN}/#/collections/pages/entries/gone` }], path);
      }
      const many = await toolbarIn(await visit('/', held), '/');
      assert.ok(many.says.startsWith(text('sv', 'previewTab.toolbar.many')), 'a page that is no 404 page');
      notFoundChosen = null;
      const plain = await toolbarIn(await visit('/nowhere/', held), '/nowhere/');
      assert.ok(plain.says.startsWith(text('sv', 'previewTab.toolbar.many')), plain.says);
      assert.deepEqual(plain.links, [{ name: text('sv', 'previewTab.toolbar.editor'), href: `${ADMIN}/` }]);
    });

    test('shows a Reviewer, who may not write, what the page is and no link', async () => {
      const held = await as('code-reviewer');
      built['/topics/harbours/'] = { kind: 'term', file: 'topics/tttttttttttt.json', title: 'Hamnar', refusals: [] };
      for (const path of ['/a-page/', '/topics/harbours/', '/']) {
        const toolbar = await toolbarIn(await visit(path, held), path);
        assert.ok(toolbar, path);
        assert.notEqual(toolbar.says, '', path);
        assert.deepEqual(toolbar.links, [], path);
      }
      const toolbar = await toolbarIn(await visit('/a-page/', held), '/a-page/');
      assert.ok(toolbar.says.startsWith(text('sv', 'previewTab.toolbar.draft')), toolbar.says);
    });

    test('is in no frame, in nothing a page asks for itself, and in nothing but a page', async () => {
      const held = await as('code-writer');
      for (const dest of ['iframe', 'image', 'script', 'empty']) {
        const answer = await visit('/a-page/', held, { 'sec-fetch-dest': dest });
        assert.equal(answer.status, 200, dest);
        assert.equal(await answer.text(), A_PAGE, dest);
      }
      const style = await visit('/style.css', held);
      assert.equal(await style.text(), 'p { color: red; }');
      assert.equal(await toolbarIn(await visit('/missing/', held), '/missing/'), null, 'an answer with no HTML');
    });

    test('asks the dev server for the whole page, unpacked and anew, and says how long it is with the toolbar', async () => {
      const held = await as('code-writer');
      asked = [];
      const answer = await visit('/a-page/', held, { 'accept-encoding': 'gzip, br', 'if-none-match': '"x"', 'if-modified-since': 'Tue, 03 Nov 2026 12:00:00 GMT' });
      const { headers } = asked.at(-1);
      for (const name of ['accept-encoding', 'if-none-match', 'if-modified-since']) assert.equal(headers[name], undefined, name);
      const body = Buffer.from(await answer.arrayBuffer());
      const length = answer.headers.get('content-length');
      if (length !== null) assert.equal(Number(length), body.length);
      assert.ok(body.toString('utf8').endsWith('</body></html>'), 'the toolbar is in the body');
    });

    test('shows on the page that names a saved post\'s refusal, its one script allowed by its hash, with the way to the post\'s form', async () => {
      const held = await as('code-writer');
      built['/pages/broken/'] = { kind: 'post', file: 'pages/broken.md', title: 'Broken', status: 'draft', at: null, refusals: [{ field: null, reason: 'words of the site\'s own check' }] };
      const shown = await visit('/pages/broken/', held);
      const policy = shown.headers.get('content-security-policy');
      const html = await shown.clone().text();
      const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(([, code]) => code);
      assert.equal(scripts.length, 1);
      assert.ok(policy.includes(`script-src 'sha256-${createHash('sha256').update(scripts[0]).digest('base64')}'`), policy);
      assert.match(policy, /^default-src 'none'; /);
      const toolbar = await toolbarIn(shown, '/pages/broken/');
      assert.ok(toolbar.says.startsWith(text('sv', 'previewTab.toolbar.draft')), toolbar.says);
      assert.deepEqual(toolbar.links, [{ name: text('sv', 'previewTab.toolbar.editPost'), href: `${ADMIN}/#/collections/pages/entries/broken` }]);
    });
  });

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

  test('gives the pane a session for a credential that may write, and for none other, a Reviewer\'s among them', async () => {
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

  test('the pane is asked again for its credential at intervals', async () => {
    await signedIn();
    clock += CHECK_EVERY + 1;
    assert.equal((await draft({ path: 'pages/a.md', fields: {} })).status, 401);
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
    assert.equal(await answer.text(), A_PAGE);
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
      assert.equal(await answer.text(), A_PAGE);
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
