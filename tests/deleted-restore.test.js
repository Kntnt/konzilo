// Restoring a deleted post, term or image library entry (ADR 0077), as the editor does it, against
// stand-ins for Forgejo, the service and the lock: the entry's last revision saved at once, as a
// draft, at its own path, by one commit made with what Sveltia signed in with, under the lock of its
// form, and only where its deletion is still its latest save; then its form opens.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { asDraft, restoreDeleted } from '../src/cms/deleted/restore.js';

const API = 'http://git/api/v1';
const POST = 'articles/aaaaaaaaaaaa.md';
const POST_TEXT = '---\ntitle: The meadow\nstatus: published\ndate: 2026-11-01T08:00:00.000Z\n---\nGrass, and the word status: published.\n';

const fromBase64 = (content) => Buffer.from(content, 'base64');

// Forgejo as it stands: the newest commit of each path, the files on the branch, the originals by
// commit, and how each commit is answered in turn.
const forgejo = ({ newest = {}, files = {}, originals = {}, answers = [] } = {}) => {
  const asked = [];
  const commits = [];
  const ask = async (address, init = {}) => {
    const url = new URL(address);
    asked.push({ method: init.method ?? 'GET', path: `${url.pathname}${url.search}`, authorization: init.headers?.authorization });
    const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), arrayBuffer: async () => new TextEncoder().encode(body).buffer });
    if (url.pathname === '/api/v1/repos/org/source/commits') return json(newest[url.searchParams.get('path')] ? [{ sha: newest[url.searchParams.get('path')] }] : []);
    if (url.pathname === '/api/v1/repos/org/source/contents' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      const status = answers.shift() ?? 201;
      if (status === 201 || status === 'in') {
        commits.push(body);
        for (const { path, content } of body.files) {
          files[path] = fromBase64(content).toString();
          newest[path] = `restore-${commits.length}`;
        }
      }
      return json({}, status === 'in' ? 502 : status);
    }
    if (url.pathname.startsWith('/api/v1/repos/org/source/raw/')) {
      const path = decodeURIComponent(url.pathname.slice('/api/v1/repos/org/source/raw/'.length));
      return Object.hasOwn(files, path) ? json(files[path]) : json({}, 404);
    }
    if (url.pathname.startsWith('/api/v1/repos/org/source/media/')) {
      const path = decodeURIComponent(url.pathname.slice('/api/v1/repos/org/source/media/'.length));
      const original = originals[`${url.searchParams.get('ref')}:${path}`];
      return original === undefined ? json({}, 404) : json(original);
    }
    throw new Error(`nothing to say of ${url.pathname}`);
  };
  return { ask, asked, commits, files };
};

// The lock, as the keeper holds a form for a restore.
const lockOf = ({ holder = null } = {}) => {
  const said = [];
  return {
    said,
    async beforeRestoring(form) {
      said.push(['hold', form]);
      if (holder) return { refusal: { name: 'lock.refusedRestore', values: { name: holder } } };
      return { done: async () => said.push(['done', form]) };
    },
  };
};

const entryOf = (overrides = {}) => ({
  path: POST,
  collection: 'articles',
  commit: 'c4',
  last: { commit: 'c3', text: POST_TEXT },
  along: [],
  ...overrides,
});

const restoring = (stand, overrides = {}) => restoreDeleted({
  entry: entryOf(),
  api: API,
  repository: 'org/source',
  credential: () => 'token ebba',
  ask: stand.ask,
  lock: lockOf(),
  latestSave: async () => null,
  pause: async () => {},
  opened: async () => {},
  ...overrides,
});

describe('restoring a deleted entry', () => {
  test('saves a post\'s last revision as a draft at its own path, in one commit made by the Editor, under its form\'s lock, and then opens its form', async () => {
    const stand = forgejo({ newest: { [POST]: 'c4' } });
    const lock = lockOf();
    const answer = await restoring(stand, { lock, opened: async () => lock.said.push(['opened']) });
    assert.deepEqual(answer, { restored: true });
    assert.equal(stand.commits.length, 1);
    const [made] = stand.commits;
    assert.equal(made.branch, 'main');
    assert.equal(made.message, 'Restore articles “aaaaaaaaaaaa”');
    assert.deepEqual(made.files.map(({ operation, path }) => [operation, path]), [['create', POST]]);
    assert.equal(stand.files[POST], POST_TEXT.replace('status: published', 'status: draft'));
    assert.ok(stand.asked.every(({ authorization }) => authorization === 'token ebba'), 'asked as the Editor signed in');
    assert.deepEqual(lock.said, [['hold', 'articles/aaaaaaaaaaaa'], ['opened'], ['done', 'articles/aaaaaaaaaaaa']], 'its form opens once it is saved, before the lock held for it goes');
  });

  test('saves a term as its last revision left it, a translation at its language\'s path, under the form of its entry', async () => {
    const path = 'topics/sv-SE/bbbbbbbbbbbb.json';
    const stand = forgejo({ newest: { [path]: 'c5' } });
    const lock = lockOf();
    const text = '{\n  "name": "Ängar"\n}\n';
    assert.deepEqual(await restoring(stand, { lock, entry: entryOf({ path, collection: 'topics', commit: 'c5', last: { commit: 'c4', text } }) }), { restored: true });
    assert.equal(stand.files[path], text);
    assert.equal(stand.commits[0].message, 'Restore topics “bbbbbbbbbbbb”');
    assert.deepEqual(lock.said[0], ['hold', 'topics/bbbbbbbbbbbb']);
  });

  test('saves an image library entry with its original, as it stood before the deletion, in the same commit', async () => {
    const path = 'image-library/eeeeeeeeeeee.json';
    const text = '{\n  "src": "/media/meadow.jpg",\n  "alt": "A meadow"\n}\n';
    const stand = forgejo({ newest: { [path]: 'c7' }, originals: { 'c6:media/meadow.jpg': 'the picture\'s bytes' } });
    const answer = await restoring(stand, { entry: entryOf({ path, collection: 'image-library', commit: 'c7', last: { commit: 'c6', text }, along: ['media/meadow.jpg'] }) });
    assert.deepEqual(answer, { restored: true });
    assert.deepEqual(stand.commits[0].files.map(({ path: one }) => one), [path, 'media/meadow.jpg']);
    assert.equal(stand.files['media/meadow.jpg'], 'the picture\'s bytes');
    assert.equal(stand.files[path], text);
  });

  test('restores an entry alone, whatever it names that is still deleted, which publishing it meets as any post\'s', async () => {
    const text = '---\ntitle: Child\nstatus: published\nparent: aaaaaaaaaaaa\ntopics:\n  - dddddddddddd\nimage:\n  src: /media/gone.jpg\n---\nSee [the parent](konzilo:aaaaaaaaaaaa).\n';
    const path = 'pages/ffffffffffff.md';
    const stand = forgejo({ newest: { [path]: 'c8' } });
    assert.deepEqual(await restoring(stand, { entry: entryOf({ path, collection: 'pages', commit: 'c8', last: { commit: 'c7', text } }) }), { restored: true });
    assert.deepEqual(stand.commits[0].files.map(({ path: one }) => one), [path], 'nothing it names comes with it');
    assert.equal(stand.files[path], text.replace('status: published', 'status: draft'));
  });

  test('refuses where another tab holds its form, and saves nothing', async () => {
    const stand = forgejo({ newest: { [POST]: 'c4' } });
    const answer = await restoring(stand, { lock: lockOf({ holder: 'Anna Admin' }) });
    assert.deepEqual(answer, { refusal: { name: 'lock.refusedRestore', values: { name: 'Anna Admin' } } });
    assert.equal(stand.commits.length, 0);
  });

  test('refuses where the entry was saved after its deletion, naming who pushed that save, and saves nothing', async () => {
    const stand = forgejo({ newest: { [POST]: 'c9' } });
    const lock = lockOf();
    const answer = await restoring(stand, { lock, latestSave: async (path) => (path === POST ? { account: { name: 'Anna Admin' }, moment: '2026-11-09T08:00:00Z' } : null) });
    assert.deepEqual(answer, { refusal: { name: 'deleted.refusedLater', values: { account: 'Anna Admin', moment: { moment: '2026-11-09T08:00:00.000Z' } } } });
    assert.equal(stand.commits.length, 0);
    assert.deepEqual(lock.said.at(-1), ['done', 'articles/aaaaaaaaaaaa'], 'what was held for it let go');

    const unknown = await restoring(forgejo({ newest: { [POST]: 'c9' } }), { latestSave: async () => ({ account: null, moment: '2026-11-09T08:00:00Z' }) });
    assert.deepEqual(unknown, { refusal: { name: 'deleted.refusedLaterAt', values: { moment: { moment: '2026-11-09T08:00:00.000Z' } } } });
    const unnamed = await restoring(forgejo({ newest: { [POST]: 'c9' } }));
    assert.deepEqual(unnamed, { refusal: { name: 'deleted.refusedLaterUnnamed' } });
  });

  test('tries again where another commit came first, and is done where a save answered with a server error went in all the same', async () => {
    const turnedAway = forgejo({ newest: { [POST]: 'c4' }, answers: [409, 422] });
    assert.deepEqual(await restoring(turnedAway), { restored: true });
    assert.equal(turnedAway.commits.length, 1);
    assert.equal(turnedAway.asked.filter(({ method }) => method === 'POST').length, 3);

    const wentIn = forgejo({ newest: { [POST]: 'c4' }, answers: ['in'] });
    assert.deepEqual(await restoring(wentIn), { restored: true });
    assert.equal(wentIn.commits.length, 1, 'not saved twice');
  });

  test('gives up after four tries, and at once where Forgejo forbids the save', async () => {
    const busy = forgejo({ newest: { [POST]: 'c4' }, answers: [409, 409, 409, 409, 409] });
    await assert.rejects(restoring(busy));
    assert.equal(busy.asked.filter(({ method }) => method === 'POST').length, 4);
    const forbidden = forgejo({ newest: { [POST]: 'c4' }, answers: [403] });
    await assert.rejects(restoring(forbidden));
    assert.equal(forbidden.asked.filter(({ method }) => method === 'POST').length, 1);
  });
});

describe('a post\'s file as a draft', () => {
  test('says draft in place of published or scheduled, in its front matter alone', () => {
    assert.equal(asDraft(POST_TEXT), POST_TEXT.replace('status: published', 'status: draft'));
    assert.equal(asDraft('---\ntitle: Soon\nstatus: "scheduled"\n---\n'), '---\ntitle: Soon\nstatus: draft\n---\n');
    assert.equal(asDraft('---\nstatus: draft\ntitle: Kept\n---\nText\n'), '---\nstatus: draft\ntitle: Kept\n---\nText\n');
  });

  test('leaves a file without a status as it is, since it is a draft already', () => {
    const text = '---\ntitle: Untold\n---\nstatus: published\n';
    assert.equal(asDraft(text), text);
  });

  test('writes the status anew where its line holds more than the word', () => {
    const made = asDraft('---\ntitle: Odd\nstatus:\n  published\n---\nBody\n');
    assert.match(made, /^---\n/);
    assert.match(made, /\nstatus: draft\n/);
    assert.match(made, /\ntitle: Odd\n/);
    assert.match(made, /\n---\nBody\n$/);
  });
});
