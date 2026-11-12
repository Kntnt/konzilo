// How the site mails each form's submissions, as an Admin sets it on the *Mail* page (ADR 0003,
// ADR 0045), through the service in its role for editors: the adapter, off until an Admin turns it
// on, its settings, and each form's recipients, kept in the service's data and in no file, for an
// Admin alone, as Forgejo says who is asking each time. Against a stand-in for Forgejo.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
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

// Who each credential is, to Forgejo: an Admin in the team `admins`, an Editor, the one who runs
// the instance, and a reader of the repository who may not write.
const PEOPLE = {
  'token anna': { login: 'anna', is_admin: false, push: true },
  'token erik': { login: 'erik', is_admin: false, push: true },
  'token instance': { login: 'konzilo', is_admin: true, push: true },
  'token rita': { login: 'rita', is_admin: false, push: false },
};
const ADMIN = { authorization: 'token anna' };
const ROLES = 'token roles';

const SMTP = { host: 'smtp.example.com', port: 587, security: 'starttls', username: 'site@example.com', password: 'a secret', sender: 'site@example.com' };

describe('the mail settings, for Admins', () => {
  let folder;
  let store;
  let server;
  let origin;
  let asked;

  const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const forgejo = async (url, { headers }) => {
    const { pathname } = new URL(url);
    asked.push({ path: pathname, authorization: headers.authorization });
    const person = PEOPLE[headers.authorization];
    if (pathname === '/api/v1/user') return person ? answerOf(person) : answerOf({}, 401);
    if (pathname === '/api/v1/repos/org/source') return person ? answerOf({ permissions: { push: person.push } }) : answerOf({}, 401);
    if (headers.authorization !== ROLES) return answerOf({}, 404);
    if (pathname === '/api/v1/orgs/org/teams') return answerOf([{ id: 8, name: 'editors' }, { id: 7, name: 'admins' }]);
    if (pathname === '/api/v1/teams/7/members/anna') return answerOf({ login: 'anna' });
    if (/^\/api\/v1\/teams\/\d+\/members\//.test(pathname)) return answerOf({}, 404);
    throw new Error(`nothing to say of ${pathname}`);
  };

  const ask = (method, headers = ADMIN, body = undefined) => fetch(`${origin}/_konzilo/mail`, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const read = async (headers = ADMIN) => {
    const answer = await ask('GET', headers);
    return { status: answer.status, body: await answer.json() };
  };
  const save = async (body, headers = ADMIN) => {
    const answer = await ask('PUT', headers, body);
    return { status: answer.status, body: await answer.json() };
  };

  const serving = async ({ local = false } = {}) => {
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', rolesToken: 'roles', control: buildControl(join(folder, 'control')), store, forms: () => forms, local, get: forgejo, now: () => new Date('2026-11-12T10:00:00Z') });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  };
  const stop = async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
  };

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-mail-settings-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));
  beforeEach(async () => {
    rmSync(join(folder, 'service.sqlite'), { force: true });
    store = openStore(join(folder, 'service.sqlite'));
    asked = [];
    await serving();
  });
  afterEach(async () => {
    await stop();
    store.close();
  });

  test('shows an Admin that mail is off until an Admin turns it on, with each form the site declares and no recipients yet', async () => {
    const { status, body } = await read();
    assert.equal(status, 200);
    assert.deepEqual(body, {
      local: false,
      adapter: 'none',
      smtp: { host: '', port: 587, security: 'starttls', username: '', password: false, sender: '' },
      forms: [{ name: 'contact', label: 'Contact us', recipients: [] }, { name: 'note', label: 'A note', recipients: [] }],
      failure: null,
    });
  });

  test('is an Admin\'s alone: an Editor is told only that, and whoever may not write nothing; Forgejo says who is in the team of Admins, by the service\'s own credential', async () => {
    assert.equal((await read({ authorization: 'token erik' })).status, 403);
    assert.deepEqual((await read({ authorization: 'token erik' })).body, {});
    assert.equal((await save({ adapter: 'smtp', smtp: SMTP, forms: {} }, { authorization: 'token erik' })).status, 403);
    for (const headers of [{}, { authorization: 'token rita' }, { authorization: 'token nobody' }, { authorization: 'not a credential' }]) {
      const { status, body } = await read(headers);
      assert.deepEqual([status, body], [401, {}], JSON.stringify(headers));
      assert.equal((await save({ adapter: 'smtp', smtp: SMTP, forms: {} }, headers)).status, 401);
    }
    assert.equal(store.setting('mail'), null, 'nothing kept');
    assert.equal((await read({ authorization: 'token instance' })).status, 200, 'the one who runs the instance');
    const teams = asked.filter(({ path }) => path.includes('/teams'));
    assert.ok(teams.length > 0);
    assert.ok(teams.every(({ authorization }) => authorization === ROLES), 'by the service\'s credential alone');
  });

  test('keeps what an Admin saves, the adapter, its settings and each form\'s recipients, and never gives the password back', async () => {
    const { status, body } = await save({
      adapter: 'smtp',
      smtp: { ...SMTP, host: ' smtp.example.com ', port: '465', security: 'tls' },
      forms: { contact: { recipients: [' anna@example.com', 'bo@example.com', 'anna@example.com'] } },
    });
    assert.equal(status, 200, JSON.stringify(body));
    const shown = { local: false, adapter: 'smtp', smtp: { ...SMTP, port: 465, security: 'tls', password: true }, forms: [{ name: 'contact', label: 'Contact us', recipients: ['anna@example.com', 'bo@example.com'] }, { name: 'note', label: 'A note', recipients: [] }], failure: null };
    assert.deepEqual(body, shown);
    assert.deepEqual((await read()).body, shown);
    assert.doesNotMatch(JSON.stringify((await read()).body), /a secret/);
    assert.deepEqual(store.setting('mail'), { adapter: 'smtp', smtp: { ...SMTP, port: 465, security: 'tls' } });
    assert.deepEqual(store.formSettings(), { contact: { recipients: ['anna@example.com', 'bo@example.com'] } });
  });

  test('keeps the password an Admin leaves empty, forgets it with the username, and keeps the settings of mail turned off', async () => {
    await save({ adapter: 'smtp', smtp: SMTP, forms: {} });
    await save({ adapter: 'smtp', smtp: { ...SMTP, password: '' }, forms: {} });
    assert.equal(store.setting('mail').smtp.password, 'a secret');
    await save({ adapter: 'smtp', smtp: { ...SMTP, password: 'another' }, forms: {} });
    assert.equal(store.setting('mail').smtp.password, 'another');
    await save({ adapter: 'smtp', smtp: { ...SMTP, username: '', password: '' }, forms: {} });
    assert.deepEqual([store.setting('mail').smtp.username, store.setting('mail').smtp.password], ['', '']);
    // Turned off, half filled in, it is kept as it is, for when it is turned on again.
    const { status } = await save({ adapter: 'none', smtp: { ...SMTP, host: '', sender: 'not yet' }, forms: {} });
    assert.equal(status, 200);
    assert.deepEqual(store.setting('mail'), { adapter: 'none', smtp: { ...SMTP, host: '', sender: 'not yet' } });
  });

  test('refuses settings it could not send by, naming each problem by its place, and keeps nothing', async () => {
    const { status, body } = await save({
      adapter: 'smtp',
      smtp: { host: 'smtp example', port: 70000, security: 'none', username: 'site', password: 'x', sender: 'site@localhost' },
      forms: { contact: { recipients: ['anna@example.com', 'bo@'] }, gone: { recipients: [] } },
    });
    assert.equal(status, 400);
    assert.deepEqual(body, {
      problems: {
        'smtp.host': 'not-host',
        'smtp.port': 'not-port',
        'smtp.username': 'needs-encryption',
        'smtp.sender': 'not-email',
        'forms.contact.recipients.1': 'not-email',
        'forms.gone': 'unknown',
      },
    });
    assert.deepEqual((await save({ adapter: 'smtp', smtp: { security: 'starttls' }, forms: {} })).body, {
      problems: { 'smtp.host': 'missing', 'smtp.port': 'missing', 'smtp.sender': 'missing' },
    });
    assert.deepEqual((await save({ adapter: 'postal pigeon', smtp: SMTP, forms: {} })).body, { problems: { adapter: 'unknown' } });
    assert.deepEqual((await save({ adapter: 'smtp', smtp: { ...SMTP, security: 'ssl' }, forms: {} })).body, { problems: { 'smtp.security': 'unknown' } });
    const many = Array.from({ length: 51 }, (_, at) => `person${at}@example.com`);
    assert.deepEqual((await save({ adapter: 'none', smtp: SMTP, forms: { contact: { recipients: many } } })).body, { problems: { 'forms.contact.recipients': 'too-many' } });
    assert.equal(store.setting('mail'), null);
    assert.deepEqual(store.formSettings(), {});
    for (const given of ['not json', '[]', '{"adapter":"smtp"}', JSON.stringify({ adapter: 'smtp', smtp: SMTP, forms: { contact: { recipients: 'anna@example.com' } } })]) {
      assert.equal((await save(given)).status, 400, given);
    }
  });

  test('takes GET and PUT alone, as JSON, and no body larger than settings need', async () => {
    assert.equal((await ask('POST', ADMIN, {})).status, 405);
    assert.equal((await ask('DELETE')).status, 405);
    const plain = await fetch(`${origin}/_konzilo/mail`, { method: 'PUT', headers: { ...ADMIN, 'content-type': 'text/plain' }, body: '{}' });
    assert.equal(plain.status, 415);
    const large = await ask('PUT', ADMIN, { adapter: 'none', smtp: SMTP, forms: {}, padding: 'x'.repeat(70_000) });
    assert.equal(large.status, 413);
    assert.equal(store.setting('mail'), null);
  });

  test('says that a local copy writes each mail to its log, and shows the last mail that could not be sent, and why', async () => {
    await stop();
    await serving({ local: true });
    store.setSetting('mail-failure', { at: '2026-11-12T09:00:00.000Z', reason: 'smtp.example.com answered 535 Wrong to signing in' });
    const { body } = await read();
    assert.equal(body.local, true);
    assert.deepEqual(body.failure, { at: '2026-11-12T09:00:00.000Z', reason: 'smtp.example.com answered 535 Wrong to signing in' });
  });

  test('tries at once, after a save, a mail that waits to be tried again', async () => {
    store.keep({ form: 'contact', sentAt: new Date('2026-11-12T09:50:00Z'), language: 'en-GB', spam: null, fields: [] });
    const [waiting] = store.mailDue(new Date('2026-11-12T10:00:00Z'));
    store.mailLater(waiting.id, new Date('2026-11-12T10:30:00Z'));
    assert.deepEqual(store.mailDue(new Date('2026-11-12T10:00:00Z')), []);
    await save({ adapter: 'smtp', smtp: SMTP, forms: { contact: { recipients: ['anna@example.com'] } } });
    assert.equal(store.mailDue(new Date('2026-11-12T10:00:00Z')).length, 1);
  });
});
