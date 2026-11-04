// What the preview's pane says to the service, and what it makes of the answers. No browser
// and no React: its timing is given, and so are its answers.

import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';

import { previewClient } from '../src/cms/preview/client.js';
import { draftOf } from '../src/cms/preview/draft.js';

const ORIGIN = 'http://localhost:7004';

const json = (status, value) => ({ status, ok: status < 400, json: async () => value });

describe('the pane\'s client', () => {
  let calls;
  let answers;
  let states;
  let timers;
  let credential;

  const client = () => previewClient({
    origin: ORIGIN,
    credential: () => credential,
    changed: (state) => states.push(state),
    send: async (url, init) => {
      calls.push({ url, init });
      if (url.includes('/where')) {
        const told = answers.where.shift() ?? json(200, { status: 200, redirect: null, loop: false });
        if (told instanceof Error) throw told;
        return told;
      }
      const next = answers[url.endsWith('session') ? 'session' : 'draft'].shift();
      if (next instanceof Error) throw next;
      return next;
    },
    later: (work) => {
      timers.push(work);
      return timers.length;
    },
    cancel: (id) => {
      if (id) timers[id - 1] = null;
    },
  });
  const run = async () => {
    const waiting = timers.filter(Boolean);
    timers = [];
    for (const work of waiting) await work();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
  };
  const draft = (title) => async () => ({ path: 'pages/a.md', fields: { title } });
  const drafts = () => calls.filter(({ url }) => url.endsWith('draft')).map(({ init }) => JSON.parse(init.body).fields.title);

  beforeEach(() => {
    calls = [];
    states = [];
    timers = [];
    credential = 'token abc';
    answers = { session: [json(200, {}), json(200, {})], draft: [json(200, { address: '/a/', refusals: [] }), json(200, { address: '/a/', refusals: [] }), json(200, { address: '/a/', refusals: [] })], where: [] };
  });

  test('starts by saying so', () => {
    assert.equal(client().state().phase, 'starting');
  });

  test('opens a session with the editor\'s credential, and sends a draft with its cookie', async () => {
    const one = client();
    one.update(draft('A'));
    await run();
    assert.equal(calls[0].url, `${ORIGIN}/_konzilo/preview/session`);
    assert.equal(calls[0].init.headers.authorization, 'token abc');
    assert.equal(calls[0].init.credentials, 'include');
    assert.equal(calls[1].url, `${ORIGIN}/_konzilo/preview/draft`);
    assert.equal(calls[1].init.credentials, 'include');
    assert.equal(calls[1].init.headers.authorization, undefined, 'a draft carries no token');
    assert.deepEqual(states.at(-1), { phase: 'shown', address: '/a/', refusals: [], leads: null, stopped: null });
  });

  test('waits for a pause, and sends only the newest', async () => {
    const one = client();
    one.update(draft('A'));
    one.update(draft('B'));
    one.update(draft('C'));
    assert.equal(calls.length, 0);
    await run();
    assert.deepEqual(drafts(), ['C']);
  });

  test('never sends two at once, and sends what came while one was out', async () => {
    let release;
    const one = previewClient({
      origin: ORIGIN,
      credential: () => credential,
      changed: (state) => states.push(state),
      later: (work) => {
        timers.push(work);
        return timers.length;
      },
      cancel: () => {},
      send: async (url, init) => {
        calls.push({ url, init });
        if (url.endsWith('session')) return json(200, {});
        if (url.includes('/where')) return json(200, { status: 200, redirect: null, loop: false });
        await new Promise((resolve) => {
          release = resolve;
        });
        return json(200, { address: '/a/', refusals: [] });
      },
    });
    one.update(draft('A'));
    const first = timers.shift();
    first();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    one.update(draft('B'));
    const second = timers.shift();
    second();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    assert.deepEqual(drafts(), ['A']);
    release();
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    await new Promise((resolve) => {
      setImmediate(resolve);
    });
    assert.deepEqual(drafts(), ['A', 'B']);
    release();
  });

  test('keeps the last address through a refusal that has none', async () => {
    const one = client();
    one.update(draft('A'));
    await run();
    answers.draft = [json(200, { address: null, refusals: [{ field: 'title', reason: 'a title' }] })];
    one.update(draft(''));
    await run();
    assert.deepEqual(states.at(-1), { phase: 'shown', address: '/a/', refusals: [{ field: 'title', reason: 'a title' }], leads: null, stopped: null });
  });

  test('opens a new session when one has ended, and sends the draft again', async () => {
    answers.draft = [json(401, {}), json(200, { address: '/a/', refusals: [] })];
    const one = client();
    one.update(draft('A'));
    await run();
    assert.deepEqual(drafts(), ['A', 'A']);
    assert.equal(calls.filter(({ url }) => url.endsWith('session')).length, 2);
    assert.equal(states.at(-1).phase, 'shown');
  });

  for (const [name, set] of [
    ['a session refused', () => { answers.session = [json(403, {})]; }],
    ['nobody signed in', () => { credential = null; }],
    ['a service that does not answer', () => { answers.session = [new Error('down')]; }],
    ['a draft that breaks', () => { answers.draft = [json(500, {})]; }],
    ['an answer it cannot read', () => { answers.draft = [json(200, 'not an answer')]; }],
  ]) {
    test(`says the preview is off at ${name}, and goes on trying`, async () => {
      set();
      const warned = console.warn;
      console.warn = () => {};
      try {
        const one = client();
        one.update(draft('A'));
        await run();
        assert.equal(states.at(-1).phase, 'off');
        credential = 'token abc';
        answers.session = [json(200, {})];
        answers.draft = [json(200, { address: '/a/', refusals: [] })];
        one.update(draft('B'));
        await run();
        assert.equal(states.at(-1).phase, 'shown');
      } finally {
        console.warn = warned;
      }
    });
  }

  test('says nothing once closed', async () => {
    const one = client();
    one.update(draft('A'));
    one.close();
    await run();
    assert.deepEqual(states, []);
  });

  const lookups = () => calls.filter(({ url }) => url.includes('/where')).map(({ url }) => decodeURIComponent(url.split('?to=')[1]));

  describe('when the page\'s own address leads elsewhere', () => {
    test('looks where an address leads before it is shown, with its cookie', async () => {
      const one = client();
      one.update(draft('A'));
      await run();
      const asked = calls.find(({ url }) => url.includes('/where'));
      assert.equal(asked.url, `${ORIGIN}/_konzilo/preview/where?to=%2Fa%2F`);
      assert.equal(asked.init.credentials, 'include');
      assert.equal(states.at(-1).address, '/a/');
      assert.equal(states.at(-1).leads, null);
    });

    test('never asks the frame to go there, and says where it leads', async () => {
      answers.where = [json(200, { status: 200, redirect: { status: 301, to: '/b/' }, loop: false })];
      const one = client();
      one.update(draft('A'));
      await run();
      assert.equal(states.at(-1).address, null);
      assert.deepEqual(states.at(-1).leads, { address: '/a/', status: 301, to: '/b/', loop: false });
    });

    test('keeps the last good page, and asks once for each address, so nothing goes round', async () => {
      answers.draft = [json(200, { address: '/a/', refusals: [] }), json(200, { address: '/moved/', refusals: [] }), json(200, { address: '/moved/', refusals: [] }), json(200, { address: '/moved/', refusals: [] })];
      answers.where = [json(200, { status: 200, redirect: null, loop: false }), json(200, { status: null, redirect: null, loop: true })];
      const one = client();
      for (const title of ['A', 'B', 'C', 'D']) {
        one.update(draft(title));
        await run();
      }
      assert.equal(states.at(-1).address, '/a/');
      assert.deepEqual(states.at(-1).leads, { address: '/moved/', status: null, to: null, loop: true });
      assert.deepEqual(lookups(), ['/a/', '/moved/']);
    });

    test('shows the page again when its address stops leading elsewhere', async () => {
      answers.draft = [json(200, { address: '/moved/', refusals: [] }), json(200, { address: '/b/', refusals: [] })];
      answers.where = [json(200, { status: 200, redirect: { status: 301, to: '/b/' }, loop: false }), json(200, { status: 200, redirect: null, loop: false })];
      const one = client();
      one.update(draft('A'));
      await run();
      one.update(draft('B'));
      await run();
      assert.equal(states.at(-1).address, '/b/');
      assert.equal(states.at(-1).leads, null);
    });

    test('shows the page when it cannot tell, since the gate keeps the frame from following anything', async () => {
      answers.where = [new Error('away')];
      const one = client();
      one.update(draft('A'));
      await run();
      assert.equal(states.at(-1).address, '/a/');
      assert.equal(states.at(-1).leads, null);
      assert.equal(states.at(-1).phase, 'shown');
    });
  });

  describe('when the page tries to leave', () => {
    const fire = async (one) => {
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      return one;
    };

    test('says where a link goes, as an address on the site', async () => {
      const one = client();
      one.stopped({ to: `${ORIGIN}/x/?a=1#b`, how: 'link' });
      assert.deepEqual(states.at(-1).stopped, { to: '/x/?a=1#b', how: 'link', where: null });
      await fire(one);
      assert.deepEqual(lookups(), ['/x/?a=1']);
      assert.deepEqual(states.at(-1).stopped, { to: '/x/?a=1#b', how: 'link', where: { status: 200, redirect: null, loop: false } });
    });

    test('adds what it finds there', async () => {
      answers.where = [json(200, { status: 200, redirect: { status: 302, to: '/y/' }, loop: false })];
      const one = client();
      one.stopped({ to: `${ORIGIN}/x/`, how: 'link' });
      await fire(one);
      assert.deepEqual(states.at(-1).stopped.where.redirect, { status: 302, to: '/y/' });
    });

    test('names an address on another site whole, and asks nothing of it', async () => {
      const one = client();
      one.stopped({ to: 'https://example.com/x/', how: 'link' });
      await fire(one);
      assert.deepEqual(states.at(-1).stopped, { to: 'https://example.com/x/', how: 'link', where: null });
      assert.deepEqual(lookups(), []);
    });

    test('asks nothing of where a form is sent, which only takes what is sent', async () => {
      const one = client();
      one.stopped({ to: `${ORIGIN}/_konzilo/forms/a`, how: 'form' });
      await fire(one);
      assert.equal(states.at(-1).stopped.to, '/_konzilo/forms/a');
      assert.deepEqual(lookups(), []);
    });

    test('a step in the browser\'s history has no address', async () => {
      const one = client();
      one.stopped({ to: '', how: 'history' });
      await fire(one);
      assert.deepEqual(states.at(-1).stopped, { to: '', how: 'history', where: null });
      assert.deepEqual(lookups(), []);
    });

    test('goes away by itself, and only the newest counts', async () => {
      const one = client();
      one.stopped({ to: `${ORIGIN}/x/`, how: 'link' });
      await fire(one);
      one.stopped({ to: `${ORIGIN}/y/`, how: 'link' });
      assert.equal(timers.filter(Boolean).length, 1, 'the first one\'s time is over');
      await run();
      assert.equal(states.at(-1).stopped, null);
    });

    test('a slow answer about an earlier link changes nothing', async () => {
      let answerFirst;
      const one = previewClient({
        origin: ORIGIN,
        credential: () => credential,
        changed: (state) => states.push(state),
        later: () => 0,
        cancel: () => {},
        send: (url) => (url.includes('%2Fx%2F')
          ? new Promise((resolve) => {
            answerFirst = resolve;
          })
          : Promise.resolve(json(200, { status: 404, redirect: null, loop: false }))),
      });
      one.stopped({ to: `${ORIGIN}/x/`, how: 'link' });
      one.stopped({ to: `${ORIGIN}/y/`, how: 'link' });
      await fire(one);
      answerFirst(json(200, { status: 410, redirect: null, loop: false }));
      await fire(one);
      assert.equal(states.at(-1).stopped.to, '/y/');
      assert.equal(states.at(-1).stopped.where.status, 404);
    });

    test('says what it knows when nobody can say more', async () => {
      answers.where = [new Error('away')];
      const one = client();
      one.stopped({ to: `${ORIGIN}/x/`, how: 'link' });
      await fire(one);
      assert.deepEqual(states.at(-1).stopped, { to: '/x/', how: 'link', where: null });
    });

    test('takes nothing else from a page', async () => {
      const one = client();
      for (const told of [null, 'text', {}, { to: 5, how: 'link' }, { to: `${ORIGIN}/x/`, how: 'anything' }, { to: 'not an address', how: 'link' }, { to: `${ORIGIN}/${'x'.repeat(5000)}`, how: 'link' }]) one.stopped(told);
      assert.deepEqual(states, []);
      assert.deepEqual(calls, []);
    });

    test('says nothing once closed', async () => {
      const one = client();
      one.stopped({ to: `${ORIGIN}/x/`, how: 'link' });
      const count = states.length;
      one.close();
      await fire(one);
      assert.equal(states.length, count);
    });
  });
});

describe('a draft as the pane sends it', () => {
  const read = async () => ({ type: 'image/png', arrayBuffer: async () => new TextEncoder().encode('bytes').buffer });

  test('lies in its collection\'s folder, in its language\'s on a site in several', async () => {
    assert.equal((await draftOf({ collection: 'pages', id: 'abc', data: {} })).path, 'pages/abc.md');
    assert.equal((await draftOf({ collection: 'pages', id: 'abc', tag: 'sv-SE', data: {} })).path, 'pages/sv-SE/abc.md');
  });

  test('takes data as Sveltia may hold it', async () => {
    const data = { toJS: () => ({ title: 'A' }) };
    assert.deepEqual((await draftOf({ collection: 'pages', id: 'abc', data })).fields, { title: 'A' });
  });

  test('carries an unsaved image along, under a name of its own, wherever it lies', async () => {
    const address = 'blob:http://localhost:7002/1a2b-3c';
    const { fields, images } = await draftOf({ collection: 'pages', id: 'abc', data: { title: 'A', image: { src: address, alt: 'x' }, list: [address, '/media/kept.png'] } }, read);
    assert.deepEqual(fields, { title: 'A', image: { src: '/media/preview-1a2b-3c.png', alt: 'x' }, list: ['/media/preview-1a2b-3c.png', '/media/kept.png'] });
    assert.deepEqual(images, [{ name: 'preview-1a2b-3c.png', data: Buffer.from('bytes').toString('base64') }]);
  });
});
