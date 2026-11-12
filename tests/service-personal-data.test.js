// A person's submissions, as privacy law asks (ADR 0045), through the service in its role for
// editors: an Admin finds them by what the person wrote, in every form, downloads them as CSV and
// erases them, after which no page or file of the service holds them. For an Admin alone, as
// Forgejo says who is asking each time. Against a stand-in for Forgejo.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { editorsService } from '../src/service/editors.js';
import { openStore } from '../src/service/store.js';

const forms = {
  contact: { name: 'contact', label: 'Contact us', fields: [] },
  note: { name: 'note', label: 'A note', fields: [] },
};

// Who each credential is, to Forgejo: an Admin in the team `admins`, an Editor, and a reader of
// the repository who may not write.
const PEOPLE = {
  'token anna': { login: 'anna', is_admin: false, push: true },
  'token erik': { login: 'erik', is_admin: false, push: true },
  'token rita': { login: 'rita', is_admin: false, push: false },
};
const ADMIN = { authorization: 'token anna' };
const ROLES = 'token roles';

const field = (name, label, value) => ({ name, label, value });
const sent = (at, fields, { form = 'contact', spam = null, language = 'en-GB' } = {}) => ({ form, sentAt: new Date(at), language, spam, fields });

describe('a person\'s submissions, for Admins', () => {
  let folder;
  let file;
  let store;
  let server;
  let origin;

  const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const forgejo = async (url, { headers }) => {
    const { pathname } = new URL(url);
    const person = PEOPLE[headers.authorization];
    if (pathname === '/api/v1/user') return person ? answerOf(person) : answerOf({}, 401);
    if (pathname === '/api/v1/repos/org/source') return person ? answerOf({ permissions: { push: person.push } }) : answerOf({}, 401);
    if (headers.authorization !== ROLES) return answerOf({}, 404);
    if (pathname === '/api/v1/orgs/org/teams') return answerOf([{ id: 7, name: 'admins' }]);
    if (pathname === '/api/v1/teams/7/members') return answerOf([{ login: 'anna' }]);
    throw new Error(`nothing to say of ${pathname}`);
  };

  const ask = (path, { method = 'GET', headers = ADMIN } = {}) => fetch(`${origin}${path}`, { method, headers });
  const find = async (text, headers = ADMIN) => {
    const answer = await ask(`/_konzilo/personal-data?${new URLSearchParams({ text })}`, { headers });
    return { status: answer.status, body: await answer.json() };
  };
  const words = ({ submissions }) => submissions.map(({ fields }) => fields.find(({ name }) => name === 'message')?.value);

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-personal-data-'));
    file = join(folder, 'service.sqlite');
  });
  after(() => rmSync(folder, { recursive: true, force: true }));
  beforeEach(async () => {
    rmSync(file, { force: true });
    store = openStore(file);
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', rolesToken: 'roles', control: buildControl(join(folder, 'control')), store, forms: () => forms, get: forgejo });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
    store.close();
  });

  // Ada wrote three times, once caught as spam, and once with a form the site no longer declares;
  // Bea once, naming Ada's address in her message.
  const keepAdaAndBea = () => {
    store.keep(sent('2026-11-01T10:00:00Z', [field('name', 'Name', 'Ada Lovelace'), field('email', 'Email', 'ada@example.com'), field('message', 'Message', 'First'), field('copy', 'Keep me posted', true)]));
    store.keep(sent('2026-11-02T10:00:00Z', [field('name', 'Name', 'Bea'), field('email', 'Email', 'bea@example.com'), field('message', 'Message', 'Ada is at ADA@example.com')]));
    store.keep(sent('2026-11-03T10:00:00Z', [field('note', 'Note', 'From ada@example.com'), field('message', 'Message', 'Spam?')], { form: 'note', spam: 'too-soon', language: 'sv-SE' }));
    store.keep(sent('2026-11-04T10:00:00Z', [field('topic', 'Topic', 'Old'), field('email', 'Email', 'Ada@Example.com'), field('message', 'Message', 'Retired')], { form: 'retired' }));
  };

  test('finds a person\'s submissions by what they wrote, in any case, in every form, spam among them, newest first, each with its form\'s label', async () => {
    keepAdaAndBea();
    const { status, body } = await find(' ada@example.com ');
    assert.equal(status, 200);
    assert.deepEqual(words(body), ['Retired', 'Spam?', 'Ada is at ADA@example.com', 'First']);
    assert.equal(body.more, false);
    const [retired, spam, , first] = body.submissions;
    assert.deepEqual([retired.form, retired.label, retired.spam], ['retired', 'retired', false]);
    assert.deepEqual([spam.form, spam.label, spam.spam, spam.language], ['note', 'A note', true, 'sv-SE']);
    assert.deepEqual(first, {
      id: 1,
      form: 'contact',
      label: 'Contact us',
      sentAt: '2026-11-01T10:00:00.000Z',
      language: 'en-GB',
      spam: false,
      fields: [field('name', 'Name', 'Ada Lovelace'), field('email', 'Email', 'ada@example.com'), field('message', 'Message', 'First'), field('copy', 'Keep me posted', true)],
    });
    assert.deepEqual(words((await find('lovelace')).body), ['First']);
    assert.deepEqual(words((await find('Email')).body), [], 'by what was written, not by a label');
  });

  test('finds what was written in any form of a letter, and at most a hundred, saying there are more', async () => {
    store.keep(sent('2026-11-01T10:00:00Z', [field('name', 'Name', 'Åsa Öberg'), field('message', 'Message', 'Hej')]));
    assert.deepEqual(words((await find('åSA ö')).body), ['Hej']);
    assert.deepEqual(words((await find('Åsa')).body), ['Hej'], 'a letter and its ring apart');
    for (let number = 0; number < 101; number += 1) store.keep(sent(new Date(Date.UTC(2026, 10, 2, 10, 0, number)), [field('message', 'Message', `Many ${number}`)]));
    const { body } = await find('many');
    assert.equal(body.submissions.length, 100);
    assert.equal(body.more, true);
    assert.equal(words(body)[0], 'Many 100');
  });

  test('downloads the submissions an Admin chooses as CSV, each row with its form, in the reader\'s time zone and language', async () => {
    keepAdaAndBea();
    const answer = await ask('/_konzilo/personal-data.csv?ids=1,4,3&separator=semicolon&timeZone=Europe/Stockholm&language=sv');
    assert.equal(answer.status, 200);
    assert.equal(answer.headers.get('content-type'), 'text/csv; charset=utf-8; header=present');
    assert.equal(answer.headers.get('content-disposition'), 'attachment; filename="personal-data.csv"');
    assert.equal(answer.headers.get('cache-control'), 'no-store');
    assert.equal(new TextDecoder('utf-8', { ignoreBOM: true }).decode(await answer.arrayBuffer()), [
      '﻿Skickat (Europe/Stockholm);Formulär;Topic;Email;Message;Note;Name;Keep me posted',
      '2026-11-04 11:00:00;retired;Old;Ada@Example.com;Retired;;;',
      '2026-11-03 11:00:00;A note;;;Spam?;From ada@example.com;;',
      '2026-11-01 11:00:00;Contact us;;ada@example.com;First;;Ada Lovelace;Ja',
      '',
    ].join('\r\n'));
  });

  test('erases the submissions an Admin chooses, which no page, file or search of the service holds after, and leaves the rest', async () => {
    keepAdaAndBea();
    const erased = await ask('/_konzilo/personal-data?ids=1,3,4', { method: 'DELETE' });
    assert.equal(erased.status, 200);
    assert.deepEqual(await erased.json(), { erased: 3 });
    assert.deepEqual(words((await find('ada@example.com')).body), ['Ada is at ADA@example.com']);
    const listed = await (await ask('/_konzilo/submissions')).json();
    assert.deepEqual(listed.forms.map(({ name, count }) => [name, count]), [['contact', 1], ['note', 0]]);
    assert.deepEqual(words(await (await ask('/_konzilo/submissions/contact')).json()), ['Ada is at ADA@example.com']);
    const csv = await (await ask('/_konzilo/submissions/contact.csv?separator=comma')).text();
    assert.doesNotMatch(csv, /Lovelace|First/);
    assert.equal((await ask('/_konzilo/submissions/retired')).status, 404, 'a form the site no longer declares, with nothing kept');
    assert.equal((await (await ask('/_konzilo/personal-data.csv?ids=1,3,4&separator=comma')).text()).split('\r\n').length, 2, 'the heading alone');
    assert.deepEqual(await (await ask('/_konzilo/personal-data?ids=1', { method: 'DELETE' })).json(), { erased: 0 });
    for (const held of [file, `${file}-wal`]) {
      if (existsSync(held)) assert.ok(!readFileSync(held).includes('Lovelace'), held);
    }
  });

  test('is an Admin\'s alone: an Editor is told only that, and whoever may not write nothing', async () => {
    keepAdaAndBea();
    const paths = ['/_konzilo/personal-data?text=ada', '/_konzilo/personal-data.csv?ids=1&separator=comma'];
    for (const path of paths) {
      const answer = await ask(path, { headers: { authorization: 'token erik' } });
      assert.deepEqual([answer.status, await answer.json()], [403, {}], path);
      for (const headers of [{}, { authorization: 'token rita' }, { authorization: 'token nobody' }]) {
        const refused = await ask(path, { headers });
        assert.deepEqual([refused.status, await refused.json()], [401, {}], `${path} ${JSON.stringify(headers)}`);
      }
    }
    assert.equal((await ask('/_konzilo/personal-data?ids=1', { method: 'DELETE', headers: { authorization: 'token erik' } })).status, 403);
    assert.equal((await ask('/_konzilo/personal-data?ids=1', { method: 'DELETE', headers: {} })).status, 401);
    assert.equal(store.submissions('contact').length, 2, 'nothing erased');
  });

  // Which the page asks as it opens, to tell an Editor at once that it is an Admin's.
  test('finds nothing by nothing, for an Admin alone', async () => {
    keepAdaAndBea();
    for (const path of ['/_konzilo/personal-data', '/_konzilo/personal-data?text=%20%20']) {
      const answer = await ask(path);
      assert.deepEqual([answer.status, await answer.json()], [200, { submissions: [], more: false }], path);
      assert.equal((await ask(path, { headers: { authorization: 'token erik' } })).status, 403, path);
    }
  });

  test('refuses a search of too much, ids that are not a hundred numbers at most, and a method or a path it does not take', async () => {
    for (const path of [`/_konzilo/personal-data?text=${'x'.repeat(257)}`,
      '/_konzilo/personal-data.csv?separator=comma', '/_konzilo/personal-data.csv?ids=1,two&separator=comma', '/_konzilo/personal-data.csv?ids=1', '/_konzilo/personal-data.csv?ids=1&separator=tab']) {
      assert.equal((await ask(path)).status, 400, path);
    }
    const many = Array.from({ length: 101 }, (_, at) => at + 1).join(',');
    for (const ids of ['', '0', '1,,2', '-1', many]) {
      assert.equal((await ask(`/_konzilo/personal-data?ids=${ids}`, { method: 'DELETE' })).status, 400, ids);
    }
    assert.equal((await ask('/_konzilo/personal-data?text=ada', { method: 'POST' })).status, 405);
    assert.equal((await ask('/_konzilo/personal-data.csv?ids=1&separator=comma', { method: 'DELETE' })).status, 405);
    assert.equal((await ask('/_konzilo/personal-data/more?text=ada')).status, 404);
  });
});
