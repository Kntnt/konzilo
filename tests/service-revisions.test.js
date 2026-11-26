// A form's revisions (ADR 0074), in the service's role for editors, against a stand-in for
// Forgejo: each commit that changed the form's file, newest first, with the moment and the account
// of its push as Forgejo's feed recorded them, not as the commit says, and the file as that
// commit left it. Only someone who may write sees them, and only what the history holds is shown.

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
};

const FILE = 'articles/aaaaaaaaaaaa.md';

// The source as Forgejo holds it: commits oldest first, each with what it says of itself and the
// files it leaves, and the pushes its feed recorded, each by the account that did it.
const history = () => {
  const commits = [
    { sha: 'c1', says: 'Someone Else', date: '2026-11-01T08:00:00Z', files: { [FILE]: 'title: First\n' } },
    { sha: 'c2', says: 'Someone Else', date: '2026-11-02T08:00:00Z', files: { 'articles/bbbbbbbbbbbb.md': 'title: Other\n' } },
    { sha: 'c3', says: 'Anna Admin', date: '2026-11-03T08:00:00Z', files: { [FILE]: 'title: Second\n' } },
    { sha: 'c4', says: 'Anna Admin', date: '2026-11-04T08:00:00Z', files: { [FILE]: 'title: Third\n' } },
  ];
  const feed = [
    { id: 1, op_type: 'commit_repo', act_user: { login: 'konzilo', full_name: '' }, created: '2026-11-02T09:00:00Z', content: JSON.stringify({ HeadCommit: { Sha1: 'c2' }, CompareURL: '' }) },
    { id: 2, op_type: 'commit_repo', act_user: { login: 'ebba', full_name: 'Ebba Editor' }, created: '2026-11-03T08:00:05Z', content: JSON.stringify({ HeadCommit: { Sha1: 'c3' }, CompareURL: 'org/source/compare/c2...c3' }) },
    { id: 3, op_type: 'comment_issue', act_user: { login: 'anna', full_name: 'Anna Admin' }, created: '2026-11-03T09:00:00Z', content: '' },
  ];
  return { commits, feed };
};

describe('a form\'s revisions', () => {
  let folder;
  let count = 0;

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-revisions-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

  const running = async ({ source = history(), perPage, now, onSleep } = {}) => {
    const asked = [];
    // What a commit's file holds: the last commit at or before it that wrote the file.
    const fileAt = (sha, path) => {
      const upTo = source.commits.slice(0, source.commits.findIndex((one) => one.sha === sha) + 1);
      return upTo.reverse().find((one) => Object.hasOwn(one.files, path))?.files[path];
    };
    const get = async (url, { headers }) => {
      const address = new URL(url);
      const { pathname, searchParams } = address;
      asked.push(`${pathname}${address.search}`);
      const person = PEOPLE[headers.authorization];
      if (pathname === '/api/v1/user') return person ? answerOf({ login: person.login, full_name: person.full_name, is_admin: false }) : answerOf({}, 401);
      if (pathname === '/api/v1/repos/org/source') return person ? answerOf({ permissions: { push: person.push, pull: true } }) : answerOf({}, 404);
      // A private account's pushes the feed shows only to the instance's account, whose token
      // lists a push's commits too.
      const feedOrPush = pathname.endsWith('/activities/feeds') || searchParams.has('sha');
      assert.equal(headers.authorization, feedOrPush ? 'token pushes-token' : 'token read-token', `${pathname} is asked with the service's own credential`);
      // No purge was made (ADR 0078).
      if (pathname === '/api/v1/repos/org/source/branches/konzilo-purges') return answerOf({}, 404);
      if (pathname === '/api/v1/repos/org/source/activities/feeds') {
        const page = Number(searchParams.get('page'));
        const limit = Number(searchParams.get('limit'));
        const newest = [...source.feed].reverse();
        return answerOf(newest.slice((page - 1) * limit, page * limit));
      }
      if (pathname === '/api/v1/repos/org/source/commits') {
        const page = Number(searchParams.get('page'));
        const limit = Number(searchParams.get('limit'));
        const path = searchParams.get('path');
        let list = [...source.commits].reverse();
        if (searchParams.has('sha')) list = list.slice(list.findIndex((one) => one.sha === searchParams.get('sha')));
        if (searchParams.has('not')) list = list.slice(0, list.findIndex((one) => one.sha === searchParams.get('not')));
        if (path) list = list.filter((one) => Object.hasOwn(one.files, path));
        const shown = list.slice((page - 1) * limit, page * limit).map((one) => ({ sha: one.sha, commit: { author: { name: one.says, date: one.date }, committer: { name: one.says, date: one.date } } }));
        return answerOf(shown);
      }
      if (pathname.startsWith('/api/v1/repos/org/source/raw/')) {
        const path = decodeURIComponent(pathname.slice('/api/v1/repos/org/source/raw/'.length));
        const text = fileAt(searchParams.get('ref'), path);
        return text === undefined ? answerOf({}, 404) : answerOf(text);
      }
      throw new Error(`nothing to say of ${pathname}`);
    };
    const service = editorsService({
      forgejo: 'http://forgejo',
      repository: 'org/source',
      token: 'read-token',
      pushesToken: 'pushes-token',
      control: buildControl(join(folder, `control-${(count += 1)}`)),
      get,
      revisions: { ...(perPage ? { perPage } : {}), now: now ?? (() => new Date('2026-11-23T10:00:00Z')), sleep: async () => onSleep?.(source) },
    });
    const server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const revisions = async (who, query = {}, method = 'GET') => {
      const address = new URL(`${origin}/_konzilo/revisions`);
      for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value);
      const answer = await fetch(address, { method, headers: who ? { authorization: `token ${who}` } : {} });
      const text = await answer.text();
      return { status: answer.status, body: text ? JSON.parse(text) : null, headers: answer.headers };
    };
    return {
      source,
      asked,
      revisions,
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

  test('lists each commit that changed the file, newest first, with its text, the account and moment of its push as the feed has them', withService({}, async ({ revisions }) => {
    const answer = await revisions('ebba', { path: FILE });
    assert.equal(answer.status, 200);
    assert.equal(answer.headers.get('cache-control'), 'no-store');
    assert.deepEqual(answer.body, {
      revisions: [
        { commit: 'c4', moment: '2026-11-04T08:00:00Z', account: null, text: 'title: Third\n' },
        { commit: 'c3', moment: '2026-11-03T08:00:05Z', account: { login: 'ebba', name: 'Ebba Editor' }, text: 'title: Second\n' },
        { commit: 'c1', moment: '2026-11-02T09:00:00Z', account: { login: 'konzilo', name: 'konzilo' }, text: 'title: First\n' },
      ],
      more: false,
    });
  }));

  test('learns a push recorded after an earlier answer, and asks the feed only for what is new', withService({}, async ({ revisions, source, asked }) => {
    await revisions('ebba', { path: FILE });
    source.feed.push({ id: 4, op_type: 'commit_repo', act_user: { login: 'anna', full_name: 'Anna Admin' }, created: '2026-11-04T08:00:03Z', content: JSON.stringify({ HeadCommit: { Sha1: 'c4' }, CompareURL: 'org/source/compare/c3...c4' }) });
    asked.length = 0;
    const answer = await revisions('anna', { path: FILE });
    assert.deepEqual(answer.body.revisions[0], { commit: 'c4', moment: '2026-11-04T08:00:03Z', account: { login: 'anna', name: 'Anna Admin' }, text: 'title: Third\n' });
    const commitsAsked = asked.filter((one) => one.startsWith('/api/v1/repos/org/source/commits?') && one.includes('sha='));
    assert.deepEqual(commitsAsked.map((one) => new URL(one, 'http://x').searchParams.get('sha')), ['c4'], 'only the new push\'s commits are asked for');
  }));

  test('waits a moment for the push of a commit just made, which the feed records a moment after it', withService({
    now: () => new Date('2026-11-04T08:00:20Z'),
    onSleep: (source) => {
      if (source.feed.length === 3) source.feed.push({ id: 4, op_type: 'commit_repo', act_user: { login: 'anna', full_name: 'Anna Admin' }, created: '2026-11-04T08:00:03Z', content: JSON.stringify({ HeadCommit: { Sha1: 'c4' }, CompareURL: 'org/source/compare/c3...c4' }) });
    },
  }, async ({ revisions }) => {
    const [latest] = (await revisions('ebba', { path: FILE })).body.revisions;
    assert.deepEqual(latest.account, { login: 'anna', name: 'Anna Admin' });
  }));

  test('gives a page at a time, and says where there are more', withService({ perPage: 2 }, async ({ revisions }) => {
    const first = await revisions('ebba', { path: FILE });
    assert.deepEqual(first.body.revisions.map(({ commit }) => commit), ['c4', 'c3']);
    assert.equal(first.body.more, true);
    const second = await revisions('ebba', { path: FILE, page: '2' });
    assert.deepEqual(second.body.revisions.map(({ commit }) => commit), ['c1']);
    assert.equal(second.body.more, false);
  }));

  test('gives a commit that removed the file with no text', withService({}, async ({ revisions, source }) => {
    source.commits.push({ sha: 'c5', says: 'Anna Admin', date: '2026-11-05T08:00:00Z', files: { [FILE]: undefined } });
    const [latest] = (await revisions('ebba', { path: FILE })).body.revisions;
    assert.equal(latest.commit, 'c5');
    assert.equal(latest.text, null);
  }));

  test('shows nothing of a commit the history no longer holds, as after a purge', withService({}, async ({ revisions, source }) => {
    assert.equal((await revisions('ebba', { path: FILE })).body.revisions.length, 3);
    source.commits.splice(0, source.commits.length, ...source.commits.filter((one) => one.sha === 'c2'));
    assert.deepEqual((await revisions('ebba', { path: FILE })).body.revisions, []);
  }));

  test('answers only someone who may write, a file in the source alone, and nothing but GET', withService({}, async ({ revisions }) => {
    assert.equal((await revisions(null, { path: FILE })).status, 401);
    assert.equal((await revisions('rut', { path: FILE })).status, 401);
    for (const path of ['', '/etc/passwd', '../secret', 'articles/../../x', 'articles//x.md', 'a\\b']) {
      assert.equal((await revisions('ebba', { path })).status, 400, path);
    }
    assert.equal((await revisions('ebba', { path: FILE, page: '0' })).status, 400);
    assert.equal((await revisions('ebba', { path: FILE }, 'POST')).status, 405);
  }));
});
