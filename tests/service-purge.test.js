// An Admin's purge of a deleted entry (ADR 0078), in the service's role for editors, against a
// stand-in for Forgejo: only an Admin asks for one, of an entry the *Deleted* page lists; others'
// open forms are run over, their tabs told to reload first, or waited for, while no form may be
// opened; the purge's own program is asked once they are; and every tab is told when it is done.
// A form's revisions name who pushed each save as the record of purges carried it over. The
// entry's addresses go from the counts of addresses not found once it is done (ADR 0040).

import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { recordFile } from '../src/purge/record.js';
import { deletableIn } from '../src/service/deleted.js';
import { editorsService } from '../src/service/editors.js';
import { LOG_FILE, notFoundLog } from '../src/service/not-found.js';

const PEOPLE = {
  'token anna': { login: 'anna', full_name: 'Anna Admin', push: true },
  'token ebba': { login: 'ebba', full_name: 'Ebba Editor', push: true },
  'token rut': { login: 'rut', full_name: 'Rut Reviewer', push: false },
};
const SITE = {
  languages: [{ locale: 'en_GB', tag: 'en-GB', main: true }],
  types: { article: { collection: 'articles' } },
  taxonomies: { topics: { collection: 'topics' } },
};
const ARTICLE = 'articles/aaaaaaaaaaaa.md';
const KEPT = 'articles/bbbbbbbbbbbb.md';
const TAB_A = 'tab-aaaaaaaa';
const TAB_B = 'tab-bbbbbbbb';
const TAB_C = 'tab-cccccccc';

const C1 = 'c1'.padEnd(40, '0');
const C2 = 'c2'.padEnd(40, '0');
const C3 = 'c3'.padEnd(40, '0');
const push = (id, login, name, at, after, before) => ({ id, op_type: 'commit_repo', act_user: { login, full_name: name }, created: at, content: JSON.stringify({ HeadCommit: { Sha1: after }, CompareURL: `org/source/compare/${before}...${after}` }) });

describe('an Admin\'s purge', () => {
  let folder;
  let count = 0;
  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-service-purge-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), arrayBuffer: async () => new ArrayBuffer(0) });

  // The source: KEPT and ARTICLE made, ARTICLE changed by ebba, then deleted by ebba; or, with
  // `record`, as a purge left it, its record naming who pushed C3 before. With `notFound`, a log of
  // addresses not found, and its counts; with `ended`, how the purge's program said a purge stands
  // before the service started.
  const running = async ({ record = null, clock = { at: Date.parse('2026-11-26T10:00:00Z') }, notFound = false, ended = null } = {}) => {
    const commits = [
      { sha: C1, date: '2026-11-01T08:00:00Z', files: { [ARTICLE]: '---\ntitle: The meadow\n---\n', [KEPT]: '---\ntitle: Kept\n---\n' } },
      { sha: C2, date: '2026-11-02T08:00:00Z', files: { [KEPT]: '---\ntitle: Kept, changed\n---\n' } },
      { sha: C3, date: '2026-11-03T08:00:00Z', files: { [ARTICLE]: undefined } },
    ];
    // After a purge, the instance's account pushed every rewritten save anew.
    const feed = record
      ? [push(1, 'konzilo', '', '2026-11-01T09:00:00Z', C1, '0'.repeat(40)), push(2, 'konzilo', '', '2026-11-26T09:00:00Z', C3, 'f'.repeat(40))]
      : [push(1, 'konzilo', '', '2026-11-01T09:00:00Z', C1, '0'.repeat(40)), push(2, 'ebba', 'Ebba Editor', '2026-11-02T08:00:05Z', C2, C1), push(3, 'ebba', 'Ebba Editor', '2026-11-03T08:00:05Z', C3, C2)];
    const upTo = (sha) => commits.slice(0, commits.findIndex((one) => one.sha === sha) + 1);
    const fileAt = (sha, path) => [...upTo(sha)].reverse().find((one) => Object.hasOwn(one.files, path))?.files[path];
    const head = C3;
    const get = async (url, { headers }) => {
      const address = new URL(url);
      const { pathname, searchParams } = address;
      const person = PEOPLE[headers.authorization];
      if (pathname === '/api/v1/user') return person ? answerOf({ login: person.login, full_name: person.full_name, is_admin: false }) : answerOf({}, 401);
      if (pathname === '/api/v1/repos/org/source') return person ? answerOf({ permissions: { push: person.push, pull: true } }) : answerOf({}, 404);
      if (pathname === '/api/v1/orgs/org/teams') return answerOf([{ id: 1, name: 'admins' }]);
      if (pathname === '/api/v1/teams/1/members') return answerOf([{ login: 'anna' }]);
      if (pathname === '/api/v1/repos/org/source/activities/feeds') return answerOf(Number(searchParams.get('page')) === 1 ? [...feed].reverse() : []);
      if (pathname === '/api/v1/repos/org/source/branches/main') return answerOf({ name: 'main', commit: { id: head } });
      if (pathname === '/api/v1/repos/org/source/branches/konzilo-purges') return record ? answerOf({ name: 'konzilo-purges', commit: { id: 'r1'.padEnd(40, '0') } }) : answerOf({}, 404);
      if (pathname === '/api/v1/repos/org/source/raw/purges.json') return record ? answerOf(recordFile(record)) : answerOf({}, 404);
      if (pathname === '/api/v1/repos/org/source/commits') {
        // The purge's push named a head that is no more, which Forgejo cannot list from.
        if (searchParams.get('not') === 'f'.repeat(40)) return answerOf({ message: 'object not found' }, 500);
        let list = commits.map((one, at) => ({ ...one, parent: commits[at - 1]?.sha })).reverse();
        if (searchParams.has('sha')) list = list.slice(list.findIndex((one) => one.sha === searchParams.get('sha')));
        if (searchParams.has('not')) {
          const until = list.findIndex((one) => one.sha === searchParams.get('not'));
          if (until !== -1) list = list.slice(0, until);
        }
        const path = searchParams.get('path');
        if (path) list = list.filter((one) => Object.hasOwn(one.files, path));
        // Forgejo answers so for a file no commit holds.
        if (path && list.length === 0) return answerOf({ message: 'not found' }, 404);
        if (Number(searchParams.get('page')) > 1) list = [];
        return answerOf(list.map((one) => ({
          sha: one.sha,
          commit: { committer: { date: one.date } },
          parents: one.parent ? [{ sha: one.parent }] : [],
          files: Object.keys(one.files).map((filename) => ({ filename })),
        })));
      }
      if (pathname.startsWith('/api/v1/repos/org/source/git/trees/')) {
        const files = {};
        for (const one of upTo(head)) Object.assign(files, one.files);
        return answerOf({ tree: Object.entries(files).filter(([, text]) => text !== undefined).map(([path]) => ({ path, type: 'blob' })), truncated: false });
      }
      if (pathname.startsWith('/api/v1/repos/org/source/raw/')) {
        const text = fileAt(searchParams.get('ref'), decodeURIComponent(pathname.slice('/api/v1/repos/org/source/raw/'.length)));
        return text === undefined ? answerOf({}, 404) : answerOf(text);
      }
      throw new Error(`nothing to say of ${pathname}`);
    };
    const control = buildControl(join(folder, `control-${(count += 1)}`));
    if (ended) control.writePurgeState(ended);
    let notFoundShown = null;
    if (notFound) {
      const place = join(folder, `not-found-${count}`);
      mkdirSync(join(place, 'log'), { recursive: true });
      mkdirSync(join(place, 'public/current/pages'), { recursive: true });
      const log = notFoundLog({ log: join(place, 'log'), counts: join(place, 'counts.json'), release: join(place, 'public/current'), now: () => Math.floor(clock.at / 1000) });
      notFoundShown = {
        log,
        // A line as the web server writes it.
        asked: (path) => appendFileSync(join(place, 'log', LOG_FILE), `${JSON.stringify({ ts: clock.at / 1000, path })}\n`),
        counts: () => JSON.parse(readFileSync(join(place, 'counts.json'), 'utf8')).addresses,
      };
    }
    const forgotten = [];
    const service = editorsService({
      forgejo: 'http://forgejo',
      repository: 'org/source',
      token: 'read-token',
      rolesToken: 'roles-token',
      pushesToken: 'pushes-token',
      control,
      get,
      now: () => new Date(clock.at),
      deletable: () => deletableIn(SITE),
      pictures: { of: async () => ({ status: 404 }), forget: () => forgotten.push(true) },
      locks: { waitAtMost: 200 },
      revisions: { now: () => new Date(clock.at), sleep: async () => {} },
      purge: { reloadWithin: 20_000 },
      notFound: notFoundShown?.log ?? null,
    });
    const server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, path, who, { query = {}, body } = {}) => {
      const address = new URL(`${origin}${path}`);
      for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value);
      const answer = await fetch(address, { method, headers: { ...(who ? { authorization: `token ${who}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
      const text = await answer.text();
      return { status: answer.status, body: text ? JSON.parse(text) : null };
    };
    return {
      service,
      control,
      clock,
      forgotten,
      notFound: notFoundShown,
      call,
      purge: (who, body) => call('POST', '/_konzilo/purge', who, { body }),
      shown: (who) => call('GET', '/_konzilo/purge', who),
      cancel: (who) => call('DELETE', '/_konzilo/purge', who),
      hold: (form, who, tab) => call('PUT', `/_konzilo/locks/${encodeURIComponent(form)}`, who, { query: { tab } }),
      release: (form, who, tab) => call('DELETE', `/_konzilo/locks/${encodeURIComponent(form)}`, who, { query: { tab } }),
      end: (who, tab) => call('DELETE', '/_konzilo/locks', who, { query: { tab } }),
      locks: (who, tab) => call('GET', '/_konzilo/locks', who, { query: { tab } }),
      step: () => service.purgeStep(),
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

  test('is for an Admin alone', withService({}, async ({ purge, shown, cancel }) => {
    assert.equal((await shown('ebba')).status, 403);
    assert.equal((await shown('rut')).status, 401);
    assert.equal((await shown(null)).status, 401);
    assert.equal((await purge('ebba', { path: ARTICLE, course: 'anyway' })).status, 403);
    assert.equal((await cancel('ebba')).status, 403);
    const own = await shown('anna');
    assert.equal(own.status, 200);
    assert.deepEqual(own.body, { purge: null, purges: [], open: [] });
  }));

  test('purges an entry the Deleted page lists, and no other', withService({}, async ({ purge }) => {
    assert.equal((await purge('anna', { path: KEPT, course: 'anyway' })).status, 404, 'one that is not deleted');
    assert.equal((await purge('anna', { path: 'articles/cccccccccccc.md', course: 'anyway' })).status, 404, 'one the history never held');
    assert.equal((await purge('anna', { path: ARTICLE, course: 'now' })).status, 400);
  }));

  test('with no form open, asks the purge\'s program at once, keeps every form shut while it runs, and tells every tab once it is done', withService({}, async ({ purge, control, step, hold, locks, shown, forgotten }) => {
    const asked = await purge('anna', { path: ARTICLE, course: 'anyway' });
    assert.equal(asked.status, 202);
    assert.equal(asked.body.purge.state, 'running');
    const request = control.purgeRequest();
    assert.deepEqual({ ...request, id: undefined }, { id: undefined, path: ARTICLE, collection: 'articles', kind: 'post', by: { login: 'anna', name: 'Anna Admin' }, at: '2026-11-26T10:00:00.000Z' });
    assert.equal((await purge('anna', { path: ARTICLE, course: 'anyway' })).status, 409, 'one purge at a time');

    const refused = await hold('articles/bbbbbbbbbbbb', 'ebba', TAB_B);
    assert.equal(refused.status, 423, 'no form opens while it runs');
    assert.equal(refused.body.purge.state, 'running');
    assert.equal((await locks('ebba', TAB_B)).body.purge.state, 'running');

    control.writePurgeState({ id: request.id, state: 'done', at: '2026-11-26T10:00:30Z' });
    await step();
    const told = await locks('ebba', TAB_B);
    assert.deepEqual(told.body.purge, { id: request.id, state: 'done' }, 'every tab is told, and reloads');
    assert.equal((await hold('articles/bbbbbbbbbbbb', 'ebba', TAB_B)).status, 200, 'forms open again');
    assert.equal(forgotten.length, 1, 'the small pictures of what may be gone are forgotten');
    assert.deepEqual((await shown('anna')).body.purge, { id: request.id, state: 'done' });
  }));

  test('run anyway: tells each tab with a form open to reload, and purges once they have, or after a while', withService({}, async ({ purge, control, step, hold, locks, end, clock }) => {
    await hold(KEPT.replace(/\.md$/, ''), 'ebba', TAB_B);
    await hold('articles/dddddddddddd', 'anna', TAB_C);
    const asked = await purge('anna', { path: ARTICLE, course: 'anyway' });
    assert.equal(asked.body.purge.state, 'warning');
    assert.equal((await locks('ebba', TAB_B)).body.purge.reload, true, 'the tab with a form open reloads');
    assert.equal((await locks('anna', TAB_A)).body.purge.reload, false, 'a tab with none does not');
    assert.equal((await hold('articles/eeeeeeeeeeee', 'anna', TAB_A)).status, 423);
    await step();
    assert.equal(control.purgeRequest(), null, 'not while a form is open');
    await end('ebba', TAB_B);
    await step();
    assert.equal(control.purgeRequest(), null, 'nor while another is');
    clock.at += 20_000;
    await step();
    assert.equal(control.purgeRequest()?.path, ARTICLE, 'a tab that does not reload is not waited for long');
    assert.deepEqual((await locks('anna', TAB_A)).body.locks, [], 'and its form is let go');
  }));

  test('wait: keeps every form shut until the last one open closes, then purges, and an Admin may stop waiting', withService({}, async ({ purge, control, step, hold, release, locks, cancel, shown }) => {
    await hold('articles/bbbbbbbbbbbb', 'ebba', TAB_B);
    assert.deepEqual((await shown('anna')).body.open, [{ form: 'articles/bbbbbbbbbbbb', name: 'Ebba Editor', since: '2026-11-26T10:00:00.000Z' }], 'an Admin sees who has which form open before choosing');
    const asked = await purge('anna', { path: ARTICLE, course: 'wait' });
    assert.equal(asked.body.purge.state, 'waiting');
    assert.deepEqual(asked.body.purge.forms, [{ form: 'articles/bbbbbbbbbbbb', name: 'Ebba Editor', since: '2026-11-26T10:00:00.000Z' }]);
    assert.equal((await locks('ebba', TAB_B)).body.purge.reload, false, 'a tab waited for is not told to reload');
    assert.equal((await hold('articles/cccccccccccc', 'ebba', TAB_C)).status, 423, 'nobody may open a form');
    assert.equal((await hold('articles/bbbbbbbbbbbb', 'ebba', TAB_B)).status, 200, 'the form that is open stays so');
    assert.equal((await cancel('anna')).status, 200);
    assert.equal((await shown('anna')).body.purge, null);
    assert.equal((await hold('articles/cccccccccccc', 'ebba', TAB_C)).status, 200, 'forms open again once it is stopped');
    await release('articles/cccccccccccc', 'ebba', TAB_C);

    await purge('anna', { path: ARTICLE, course: 'wait' });
    await step();
    assert.equal(control.purgeRequest(), null);
    await release('articles/bbbbbbbbbbbb', 'ebba', TAB_B);
    await step();
    assert.equal(control.purgeRequest()?.path, ARTICLE);
    assert.equal((await cancel('anna')).status, 409, 'a purge that runs is not stopped');
  }));

  test('takes the entry\'s addresses out of the counts of addresses not found once it is done, with and without their last slash, and keeps them no longer', withService({ notFound: true }, async ({ purge, control, step, notFound }) => {
    for (const path of ['/the-meadow/', '/the-meadow', '/old-meadow/', '/kept/']) notFound.asked(path);
    notFound.log.fold();
    await purge('anna', { path: ARTICLE, course: 'anyway' });
    const { id } = control.purgeRequest();
    notFound.asked('/the-meadow/');
    control.writePurgeState({ id, state: 'done', at: '2026-11-26T10:00:30Z', addresses: ['/the-meadow', '/old-meadow'] });
    await step();
    assert.deepEqual(Object.keys(notFound.counts()), ['/kept/']);
    notFound.log.fold();
    assert.deepEqual(Object.keys(notFound.counts()), ['/kept/'], 'nor is what was asked for before it ended counted at the next fold');
    assert.deepEqual(control.purgeState(), { id, state: 'done', at: '2026-11-26T10:00:30Z' }, 'and what its program said names them no longer');
  }));

  test('takes them out at its first step where the purge ended while the service was stopped', withService({ notFound: true, ended: { id: 'p1', state: 'done', at: '2026-11-26T09:59:00Z', addresses: ['/the-meadow'] } }, async ({ control, step, notFound, shown }) => {
    for (const path of ['/the-meadow/', '/kept/']) notFound.asked(path);
    await step();
    assert.deepEqual(Object.keys(notFound.counts()), ['/kept/']);
    assert.deepEqual(control.purgeState(), { id: 'p1', state: 'done', at: '2026-11-26T09:59:00Z' });
    assert.equal((await shown('anna')).body.purge, null, 'a purge it did not see is no news to an Admin');
  }));

  test('says a purge that failed, and opens the forms again', withService({}, async ({ purge, control, step, hold, shown }) => {
    await purge('anna', { path: ARTICLE, course: 'anyway' });
    const { id } = control.purgeRequest();
    control.writePurgeState({ id, state: 'failed', reason: 'broke', at: '2026-11-26T10:00:30Z' });
    await step();
    assert.deepEqual((await shown('anna')).body.purge, { id, state: 'failed', reason: 'broke' });
    assert.equal((await hold('articles/bbbbbbbbbbbb', 'ebba', TAB_B)).status, 200);
  }));

  test('names who pushed each save as the record of purges carried it over, not the purge\'s push', withService({
    record: {
      purges: [{ at: '2026-11-26T09:00:00Z', by: { login: 'anna', name: 'Anna Admin' } }],
      pushes: { [C2]: { login: 'ebba', name: 'Ebba Editor', at: '2026-11-02T08:00:05Z' }, [C3]: null },
    },
  }, async ({ call, shown }) => {
    const { status, body } = await call('GET', '/_konzilo/revisions', 'ebba', { query: { path: KEPT } });
    assert.equal(status, 200);
    assert.deepEqual(body.revisions.map(({ commit, account, moment }) => [commit, account?.login ?? null, moment]), [
      [C2, 'ebba', '2026-11-02T08:00:05Z'],
      [C1, 'konzilo', '2026-11-01T09:00:00Z'],
    ]);
    assert.deepEqual((await call('GET', '/_konzilo/revisions', 'ebba', { query: { path: 'articles/cccccccccccc.md' } })).body, { revisions: [], more: false }, 'a file purged has no revisions');
    const deleted = await call('GET', '/_konzilo/deleted', 'ebba');
    assert.deepEqual(deleted.body.deleted.map(({ path, account, moment }) => [path, account, moment]), [[ARTICLE, null, '2026-11-03T08:00:00Z']], 'a save Forgejo had no record of the account of before');
    assert.deepEqual((await shown('anna')).body.purges, [{ at: '2026-11-26T09:00:00Z', by: { login: 'anna', name: 'Anna Admin' } }], 'an Admin sees who purged and when');
  }));
});
