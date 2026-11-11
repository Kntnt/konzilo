// A form's submissions for Admins and Editors (ADR 0045), from the service in its role for
// editors, on the admin host: each form with how many it holds, a form's newest first, and a
// form's as CSV, against a stand-in for Forgejo that says who may write, and the service's own
// store, as the role for visitors keeps it.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { editorsService } from '../src/service/editors.js';
import { openStore } from '../src/service/store.js';
import { siteDescription } from '../src/site-description.js';

const contact = {
  label: 'Contact us',
  fields: [
    { name: 'name', label: 'Name', kind: 'text', required: true },
    { name: 'message', label: 'Message', kind: 'textarea', required: true },
    { name: 'copy', label: 'Keep me posted', kind: 'checkbox' },
    { name: 'interests', label: 'Interests', kind: 'checkboxes', options: ['Web', 'Print'] },
  ],
};
const note = { label: 'A note', fields: [{ name: 'note', label: 'Note', kind: 'textarea', required: true }] };
const type = { label: 'Note', plural: 'Notes', collection: 'notes', address: '/{slug}/', elements: ['paragraph', 'form'], fields: {} };
const site = siteDescription({ language: 'en_GB', types: { note: type }, forms: { contact, note } });

const MAY_WRITE = { authorization: 'token may-write' };

// A submission as the role for visitors keeps it.
const field = (name, label, value) => ({ name, label, value });
const sent = (at, fields, { form = 'contact', spam = null, language = 'en-GB' } = {}) => ({ form, sentAt: new Date(at), language, spam, fields });

describe('the submissions, for editors', () => {
  let folder;
  let store;
  let server;
  let origin;
  let asked;

  const get = (path, headers = MAY_WRITE) => fetch(`${origin}${path}`, { headers });

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-submissions-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  beforeEach(async () => {
    rmSync(join(folder, 'service.sqlite'), { force: true });
    store = openStore(join(folder, 'service.sqlite'));
    asked = [];
    const forgejo = async (url, { headers }) => {
      const { pathname } = new URL(url);
      asked.push({ path: pathname, authorization: headers.authorization });
      if (pathname !== '/api/v1/repos/org/source') throw new Error(`nothing to say of ${pathname}`);
      const known = ['token may-write', 'token may-read'].includes(headers.authorization);
      return { ok: known, status: known ? 200 : 401, json: async () => ({ permissions: { push: headers.authorization === 'token may-write' } }) };
    };
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', control: buildControl(join(folder, 'control')), store, forms: () => site.forms, get: forgejo });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
    store.close();
  });

  describe('each form', () => {
    test('is named with its label and how many it holds, the declared forms in their order, then any other the store holds, and spam is not counted', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('name', 'Name', 'Ada'), field('message', 'Message', 'Hello')]));
      store.keep(sent('2026-11-02T10:00:00Z', [field('name', 'Name', 'Bea'), field('message', 'Message', 'Hi')]));
      store.keep(sent('2026-11-03T10:00:00Z', [field('name', 'Name', 'Spam'), field('message', 'Message', 'Buy')], { spam: 'trap' }));
      store.keep(sent('2026-11-03T10:00:00Z', [field('topic', 'Topic', 'Old')], { form: 'retired' }));
      store.keep(sent('2026-11-03T10:00:00Z', [field('topic', 'Topic', 'Spam')], { form: 'only-spam', spam: 'too-soon' }));
      const answer = await get('/_konzilo/submissions');
      assert.equal(answer.status, 200);
      assert.equal(answer.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await answer.json(), {
        forms: [
          { name: 'contact', label: 'Contact us', count: 2 },
          { name: 'note', label: 'A note', count: 0 },
          { name: 'retired', label: 'retired', count: 1 },
        ],
      });
    });
  });

  describe('a form\'s submissions', () => {
    test('are newest first, each with its moment, its page\'s language and its fields as they came, and spam is not shown', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('name', 'Name', 'Ada'), field('message', 'Message', 'Hello\nagain'), field('copy', 'Keep me posted', true)]));
      store.keep(sent('2026-11-03T10:00:00Z', [field('name', 'Name', 'Spam'), field('message', 'Message', 'Buy')], { spam: 'trap' }));
      store.keep(sent('2026-11-02T10:00:00Z', [field('name', 'Your name', 'Bea'), field('interests', 'Interests', ['Web', 'Print'])], { language: 'sv-SE' }));
      store.keep(sent('2026-11-02T11:00:00Z', [field('note', 'Note', 'Elsewhere')], { form: 'note' }));
      const answer = await get('/_konzilo/submissions/contact');
      assert.equal(answer.status, 200);
      assert.equal(answer.headers.get('cache-control'), 'no-store');
      const { submissions, more } = await answer.json();
      assert.equal(more, false);
      assert.deepEqual(submissions.map(({ id, ...rest }) => {
        assert.ok(Number.isSafeInteger(id));
        return rest;
      }), [
        { sentAt: '2026-11-02T10:00:00.000Z', language: 'sv-SE', fields: [field('name', 'Your name', 'Bea'), field('interests', 'Interests', ['Web', 'Print'])] },
        { sentAt: '2026-11-01T10:00:00.000Z', language: 'en-GB', fields: [field('name', 'Name', 'Ada'), field('message', 'Message', 'Hello\nagain'), field('copy', 'Keep me posted', true)] },
      ]);
    });

    test('come a page at a time, the next from before the last one shown', async () => {
      for (let number = 0; number < 52; number += 1) {
        store.keep(sent(new Date(Date.UTC(2026, 10, 1, 10, 0, number)), [field('name', 'Name', `Number ${number}`)]));
      }
      const names = ({ submissions }) => submissions.map(({ fields }) => fields[0].value);
      const first = await (await get('/_konzilo/submissions/contact')).json();
      assert.equal(first.submissions.length, 50);
      assert.equal(first.more, true);
      assert.deepEqual(names(first).slice(0, 2), ['Number 51', 'Number 50']);
      const next = await (await get(`/_konzilo/submissions/contact?before=${first.submissions.at(-1).id}`)).json();
      assert.deepEqual(names(next), ['Number 1', 'Number 0']);
      assert.equal(next.more, false);
      assert.equal((await get('/_konzilo/submissions/contact?before=soon')).status, 400);
    });

    test('of a form the site declares and none was sent to are none, and of a form neither declared nor kept are not found', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('topic', 'Topic', 'Old')], { form: 'retired' }));
      assert.deepEqual(await (await get('/_konzilo/submissions/note')).json(), { submissions: [], more: false });
      assert.equal((await (await get('/_konzilo/submissions/retired')).json()).submissions.length, 1);
      assert.equal((await get('/_konzilo/submissions/no-such-form')).status, 404);
      assert.equal((await get('/_konzilo/submissions/contact/more')).status, 404);
      assert.equal((await fetch(`${origin}/_konzilo/submissions/contact`, { method: 'DELETE', headers: MAY_WRITE })).status, 405);
    });
  });

  describe('whoever may not write', () => {
    test('is told nothing, not even which forms there are, asking Forgejo each time', async () => {
      store.keep(sent('2026-11-01T10:00:00Z', [field('name', 'Name', 'Ada'), field('message', 'Message', 'Hello')]));
      for (const path of ['/_konzilo/submissions', '/_konzilo/submissions/contact', '/_konzilo/submissions/contact.csv', '/_konzilo/submissions/no-such-form']) {
        for (const headers of [{}, { authorization: 'nonsense' }, { authorization: 'token someone-else' }, { authorization: 'token may-read' }]) {
          const answer = await get(path, headers);
          assert.equal(answer.status, 401, `${path} ${JSON.stringify(headers)}`);
          assert.deepEqual(await answer.json(), {});
        }
      }
      assert.equal(asked.length, 8, 'each time there is a credential to ask about');
    });
  });
});
