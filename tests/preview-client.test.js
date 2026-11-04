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
    answers = { session: [json(200, {}), json(200, {})], draft: [json(200, { address: '/a/', refusals: [] }), json(200, { address: '/a/', refusals: [] }), json(200, { address: '/a/', refusals: [] })] };
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
    assert.deepEqual(states.at(-1), { phase: 'shown', address: '/a/', refusals: [] });
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
    assert.deepEqual(states.at(-1), { phase: 'shown', address: '/a/', refusals: [{ field: 'title', reason: 'a title' }] });
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
