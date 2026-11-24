// The locks of the editor's forms (ADR 0073), in the service's role for editors, against a stand-in
// for Forgejo: a form is held by one tab at a time, any other Editor's tab may take it over, a
// tab is told at once when the locks change, and a lock ends when its tab lets it go or stops
// answering. Only someone who may save a form locks it.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { editorsService } from '../src/service/editors.js';

const PEOPLE = {
  'token anna': { login: 'anna', full_name: 'Anna Admin', push: true },
  'token ebba': { login: 'ebba', full_name: 'Ebba Editor', push: true },
  'token rut': { login: 'rut', full_name: 'Rut Reviewer', push: false },
  'token nameless': { login: 'nameless', full_name: '', push: true },
};

const TAB_A = 'tab-aaaaaaaa';
const TAB_B = 'tab-bbbbbbbb';
const TAB_C = 'tab-cccccccc';

describe('the locks of the editor\'s forms', () => {
  let folder;
  let count = 0;

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-locks-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

  const running = async ({ clock = { at: Date.parse('2026-11-23T10:00:00Z') }, waitAtMost = 300 } = {}) => {
    const asked = [];
    const get = async (url, { headers }) => {
      const { pathname } = new URL(url);
      asked.push(pathname);
      const person = PEOPLE[headers.authorization];
      if (pathname === '/api/v1/user') return person ? answerOf({ login: person.login, full_name: person.full_name, is_admin: false }) : answerOf({}, 401);
      if (pathname === '/api/v1/repos/org/source') return person ? answerOf({ permissions: { push: person.push, pull: true } }) : answerOf({}, 404);
      if (pathname === '/api/v1/orgs/org/teams') return answerOf([{ id: 1, name: 'admins' }]);
      if (pathname === '/api/v1/teams/1/members') return answerOf([{ login: 'anna' }]);
      throw new Error(`nothing to say of ${pathname}`);
    };
    const service = editorsService({
      forgejo: 'http://forgejo',
      repository: 'org/source',
      token: 'read-token',
      rolesToken: 'roles-token',
      control: buildControl(join(folder, `control-${(count += 1)}`)),
      get,
      now: () => new Date(clock.at),
      locks: { waitAtMost },
    });
    const server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, path, who, query = {}) => {
      const address = new URL(`${origin}${path}`);
      for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value);
      const answer = await fetch(address, { method, headers: who ? { authorization: `token ${who}` } : {} });
      const text = await answer.text();
      return { status: answer.status, body: text ? JSON.parse(text) : null, headers: answer.headers };
    };
    const lockOf = (form) => `/_konzilo/locks/${encodeURIComponent(form)}`;
    return {
      service,
      clock,
      asked,
      call,
      lockOf,
      hold: (form, who, tab, more = {}) => call('PUT', lockOf(form), who, { tab, ...more }),
      release: (form, who, tab) => call('DELETE', lockOf(form), who, { tab }),
      locks: (who, tab, after) => call('GET', '/_konzilo/locks', who, after === undefined ? { tab } : { tab, after: String(after) }),
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

  test('gives a free form to the tab that asks, and says who holds what, the asking tab\'s own marked', withService({}, async ({ hold, locks }) => {
    const held = await hold('articles/aaaaaaaaaaaa', 'ebba', TAB_B);
    assert.equal(held.status, 200);
    assert.deepEqual(held.body, { held: true, since: '2026-11-23T10:00:00.000Z' });
    assert.equal(held.headers.get('cache-control'), 'no-store');

    const seenByB = await locks('ebba', TAB_B);
    assert.equal(seenByB.status, 200);
    assert.deepEqual(seenByB.body.locks, [{ form: 'articles/aaaaaaaaaaaa', name: 'Ebba Editor', since: '2026-11-23T10:00:00.000Z', mine: true, yours: true }]);
    const seenByA = await locks('anna', TAB_A);
    assert.deepEqual(seenByA.body.locks, [{ form: 'articles/aaaaaaaaaaaa', name: 'Ebba Editor', since: '2026-11-23T10:00:00.000Z', mine: false, yours: false }]);
  }));

  test('tells another tab who holds a form and since when, and its holder\'s own other tab that it is theirs', withService({}, async ({ hold, clock }) => {
    await hold('articles/aaaaaaaaaaaa', 'ebba', TAB_B);
    clock.at += 60_000;
    const refused = await hold('articles/aaaaaaaaaaaa', 'anna', TAB_A);
    assert.equal(refused.status, 409);
    assert.deepEqual(refused.body, { holder: { name: 'Ebba Editor', since: '2026-11-23T10:00:00.000Z', yours: false } });
    const own = await hold('articles/aaaaaaaaaaaa', 'ebba', TAB_C);
    assert.equal(own.status, 409);
    assert.deepEqual(own.body, { holder: { name: 'Ebba Editor', since: '2026-11-23T10:00:00.000Z', yours: true } });
    const again = await hold('articles/aaaaaaaaaaaa', 'ebba', TAB_B);
    assert.equal(again.status, 200, 'the holding tab asking again keeps it');
    assert.equal(again.body.since, '2026-11-23T10:00:00.000Z');
  }));

  test('names an account without a full name by its login', withService({}, async ({ hold }) => {
    await hold('articles/aaaaaaaaaaaa', 'nameless', TAB_B);
    assert.equal((await hold('articles/aaaaaaaaaaaa', 'anna', TAB_A)).body.holder.name, 'nameless');
  }));

  test('hands a form over at a takeover, from the moment of it', withService({}, async ({ hold, locks, clock }) => {
    await hold('articles/aaaaaaaaaaaa', 'ebba', TAB_B);
    clock.at += 5 * 60_000;
    const taken = await hold('articles/aaaaaaaaaaaa', 'anna', TAB_A, { takeOver: 'true' });
    assert.equal(taken.status, 200);
    assert.deepEqual(taken.body, { held: true, since: '2026-11-23T10:05:00.000Z' });
    assert.deepEqual((await locks('ebba', TAB_B)).body.locks, [{ form: 'articles/aaaaaaaaaaaa', name: 'Anna Admin', since: '2026-11-23T10:05:00.000Z', mine: false, yours: false }]);
    assert.equal((await hold('articles/aaaaaaaaaaaa', 'ebba', TAB_B)).status, 409, 'the tab it was taken from saves no more');
  }));

  test('tells a waiting tab at once when the locks change, and answers at once one that has not seen the latest', withService({ waitAtMost: 5000 }, async ({ hold, release, locks }) => {
    const first = await locks('ebba', TAB_B);
    const started = Date.now();
    const waiting = locks('ebba', TAB_B, first.body.version);
    await new Promise((go) => setTimeout(go, 100));
    await hold('articles/aaaaaaaaaaaa', 'anna', TAB_A);
    const told = await waiting;
    assert.ok(Date.now() - started < 2000, 'well before the wait is up');
    assert.notEqual(told.body.version, first.body.version);
    assert.equal(told.body.locks.length, 1);

    const behind = await locks('ebba', TAB_B, first.body.version);
    assert.equal(behind.body.version, told.body.version, 'a tab behind is answered at once');
    await release('articles/aaaaaaaaaaaa', 'anna', TAB_A);
    assert.deepEqual((await locks('ebba', TAB_B)).body.locks, []);
  }));

  test('answers a waiting tab when nothing changes within the wait, with the locks as they stand', withService({ waitAtMost: 200 }, async ({ locks }) => {
    const first = await locks('ebba', TAB_B);
    const again = await locks('ebba', TAB_B, first.body.version);
    assert.equal(again.status, 200);
    assert.equal(again.body.version, first.body.version);
  }));

  test('lets a lock go only by the tab that holds it', withService({}, async ({ hold, release, locks }) => {
    await hold('articles/aaaaaaaaaaaa', 'ebba', TAB_B);
    assert.equal((await release('articles/aaaaaaaaaaaa', 'anna', TAB_A)).status, 204);
    assert.equal((await locks('anna', TAB_A)).body.locks.length, 1);
    assert.equal((await release('articles/aaaaaaaaaaaa', 'ebba', TAB_B)).status, 204);
    assert.equal((await locks('anna', TAB_A)).body.locks.length, 0);
  }));

  // A page closed while its hold of a form is on its way: the end of its tab may reach the service
  // first, and the hold must not then make a lock that no tab will ever let go.
  test('ends a tab as its page is closed, letting go of every form it holds, and holds nothing for it after', withService({}, async ({ call, hold, locks }) => {
    await hold('articles/aaaaaaaaaaaa', 'anna', TAB_A);
    await hold('articles/bbbbbbbbbbbb', 'anna', TAB_A);
    await hold('articles/cccccccccccc', 'ebba', TAB_B);
    assert.equal((await call('DELETE', '/_konzilo/locks', 'anna', { tab: TAB_A })).status, 204);
    assert.deepEqual((await locks('ebba', TAB_B)).body.locks.map(({ form }) => form), ['articles/cccccccccccc'], 'only the forms of the tab that ended go');
    const late = await hold('articles/dddddddddddd', 'anna', TAB_A);
    assert.equal(late.status, 410);
    assert.deepEqual((await locks('ebba', TAB_B)).body.locks.map(({ form }) => form), ['articles/cccccccccccc'], 'a hold that comes after holds nothing');
    assert.equal((await hold('articles/dddddddddddd', 'ebba', TAB_B)).status, 200, 'the form is free for another tab');
    assert.equal((await call('DELETE', '/_konzilo/locks', 'rut', { tab: TAB_B })).status, 401, 'only someone who may write ends a tab');
    assert.equal((await locks('ebba', TAB_B)).body.locks.length, 2);
  }));

  test('ends a lock within two minutes of its tab stopping to answer, and never while it answers, however idle', withService({}, async ({ hold, locks, service, clock }) => {
    await hold('articles/aaaaaaaaaaaa', 'ebba', TAB_B);
    await hold('articles/bbbbbbbbbbbb', 'anna', TAB_A);
    for (let minute = 0; minute < 10; minute += 1) {
      clock.at += 30_000;
      await locks('ebba', TAB_B);
      service.sweepLocks();
    }
    assert.deepEqual((await locks('ebba', TAB_B)).body.locks.map(({ form }) => form), ['articles/aaaaaaaaaaaa'], 'B answered all along; A never did');
    clock.at += 119_000;
    service.sweepLocks();
    assert.deepEqual((await locks('anna', TAB_A)).body.locks, []);
  }));

  test('gives an Admin\'s forms to an Admin alone, and tells an Editor they are an Admin\'s', withService({}, async ({ hold, locks }) => {
    for (const form of ['settings/settings', 'menus/main-en']) {
      const editor = await hold(form, 'ebba', TAB_B);
      assert.equal(editor.status, 403, form);
      assert.deepEqual(editor.body, { adminOnly: true });
      assert.equal((await hold(form, 'ebba', TAB_B, { takeOver: 'true' })).status, 403, `${form}: no takeover either`);
      assert.equal((await hold(form, 'anna', TAB_A)).status, 200, form);
    }
    assert.equal((await locks('ebba', TAB_B)).body.locks.length, 2, 'an Editor sees them held all the same');
  }));

  test('tells nothing to whoever may not write, and takes no lock from them', withService({}, async ({ hold, locks, release }) => {
    assert.equal((await hold('articles/aaaaaaaaaaaa', 'rut', TAB_B)).status, 401);
    assert.equal((await hold('articles/aaaaaaaaaaaa', null, TAB_B)).status, 401);
    assert.equal((await locks('rut', TAB_B)).status, 401);
    assert.equal((await locks(null, TAB_B)).status, 401);
    assert.equal((await release('articles/aaaaaaaaaaaa', 'someone', TAB_B)).status, 401);
    assert.deepEqual((await locks('anna', TAB_A)).body.locks, []);
  }));

  test('refuses a form or a tab it cannot tell', withService({}, async ({ hold, locks }) => {
    assert.equal((await hold('articles', 'anna', TAB_A)).status, 400);
    assert.equal((await hold('articles/../settings', 'anna', TAB_A)).status, 400);
    assert.equal((await hold('articles/aaaaaaaaaaaa', 'anna', 'short')).status, 400);
    assert.equal((await hold('articles/aaaaaaaaaaaa', 'anna', '')).status, 400);
    assert.equal((await locks('anna', 'no tab at all')).status, 400);
  }));

  test('takes no method but those it names', withService({}, async ({ call, lockOf }) => {
    assert.equal((await call('POST', '/_konzilo/locks', 'anna', { tab: TAB_A })).status, 405);
    assert.equal((await call('POST', lockOf('articles/aaaaaaaaaaaa'), 'anna', { tab: TAB_A })).status, 405);
    assert.equal((await call('GET', lockOf('articles/aaaaaaaaaaaa'), 'anna', { tab: TAB_A })).status, 405);
  }));

  test('asks Forgejo about one credential once in a while, not at every call', withService({}, async ({ locks, asked }) => {
    for (let call = 0; call < 5; call += 1) await locks('ebba', TAB_B);
    assert.equal(asked.filter((path) => path === '/api/v1/user').length, 1);
  }));
});
