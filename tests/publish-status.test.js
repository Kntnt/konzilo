// A post's publish status, by ADR 0031's order, and who pushed what, by Forgejo's own record.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { addPushers, eventsAfter } from '../src/build/pushers.js';
import { buildOnRequest } from '../src/build/requests.js';
import { buildControl } from '../src/build/record.js';
import { forgejoRoles } from '../src/build/roles.js';
import { publishStatus } from '../src/build/status.js';

const FILE = 'articles/aaaaaaaaaaaa.md';
const REASON = 'the build failed';
const post = (fields) => ({ id: 'aaaaaaaaaaaa', type: 'article', title: 'A post', state: 'live', at: null, address: '/a-post/', shown: true, version: 'v1', refusals: [], warnings: [], ...fields });
const record = ({ posts = { [FILE]: post() }, held = { [FILE]: 'v1' }, reason = null } = {}) => ({ posts, reason, release: held ? { held } : null });

describe('a post\'s publish status', () => {
  test('is failed, with each refusal, when its version is the one refused', () => {
    const refusals = [{ field: 'title', reason: 'give it a title' }];
    const status = publishStatus(record({ posts: { [FILE]: post({ state: 'refused', refusals, version: 'v2' }) } }), FILE, 'v2');
    assert.equal(status.status, 'failed');
    assert.deepEqual(status.refusals, refusals);
    assert.equal(status.stillShown, true);
  });

  test('is live when its version is the one the current release holds, with its warnings', () => {
    const warnings = [{ reason: 'narrow' }];
    const status = publishStatus(record({ posts: { [FILE]: post({ warnings }) } }), FILE, 'v1');
    assert.equal(status.status, 'live');
    assert.deepEqual(status.warnings, warnings);
    assert.equal(status.address, '/a-post/');
    assert.equal(status.title, 'A post');
  });

  test('is live again when a post comes back to the version the release holds', () => {
    const status = publishStatus(record({ posts: { [FILE]: post({ version: 'v2', state: 'refused' }) } }), FILE, 'v1');
    assert.equal(status.status, 'live');
  });

  test('is failed, with the build\'s reason, when the last build made no release and read that version', () => {
    const status = publishStatus(record({ posts: { [FILE]: post({ version: 'v2' }) }, reason: REASON }), FILE, 'v2');
    assert.equal(status.status, 'failed');
    assert.equal(status.reason, REASON);
    assert.equal(status.stillShown, true);
    const fresh = publishStatus(record({ posts: { [FILE]: post({ version: 'v2', shown: false }) }, held: {}, reason: REASON }), FILE, 'v2');
    assert.equal(fresh.status, 'failed');
    assert.equal(fresh.stillShown, false);
  });

  test('is not failed by a build that never read that version', () => {
    const status = publishStatus(record({ posts: { [FILE]: post({ version: 'v2' }) }, reason: REASON }), FILE, 'v3');
    assert.equal(status.status, 'being-published');
  });

  test('is being published when nothing has been recorded of its version, or at all', () => {
    assert.equal(publishStatus(record({ posts: {} }), FILE, 'v2').status, 'being-published');
    assert.equal(publishStatus(record(), FILE, 'v2').status, 'being-published');
    assert.equal(publishStatus(record(), FILE, 'v2').stillShown, true);
    assert.equal(publishStatus(null, FILE, 'v2').status, 'being-published');
    assert.equal(publishStatus(null, FILE, 'v2').stillShown, false);
  });

  test('is a draft or scheduled when that is what the build found', () => {
    const draft = publishStatus(record({ posts: { [FILE]: post({ state: 'off', shown: false, version: 'v2' }) }, held: {} }), FILE, 'v2');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.stillShown, false);
    const waiting = publishStatus(record({ posts: { [FILE]: post({ state: 'waiting', at: '2999-01-01T00:00:00Z', shown: false, version: 'v2' }) }, held: {} }), FILE, 'v2');
    assert.equal(waiting.status, 'scheduled');
    assert.equal(waiting.at, '2999-01-01T00:00:00Z');
  });

  test('stays a draft through a failed build, and is failed only for one the site still shows', () => {
    const draft = publishStatus(record({ posts: { [FILE]: post({ state: 'off', shown: false, version: 'v2' }) }, held: {}, reason: REASON }), FILE, 'v2');
    assert.equal(draft.status, 'draft');
    const held = publishStatus(record({ posts: { [FILE]: post({ state: 'off', version: 'v2' }) }, reason: REASON }), FILE, 'v2');
    assert.equal(held.status, 'failed');
    assert.equal(held.stillShown, true);
  });
});

describe('who pushed what', () => {
  const feedEntry = (id, login, after, before = null, op = 'commit_repo') => ({
    id,
    op_type: op,
    act_user: { login },
    content: JSON.stringify({ HeadCommit: { Sha1: after }, CompareURL: before ? `org/source/compare/${before}...${after}` : '', Len: 1, Commits: [] }),
  });
  // A little history: c1 <- c2 <- c3 <- c4.
  const ORDER = ['c1', 'c2', 'c3', 'c4'];
  const commitsOf = async (after, before) => {
    const end = ORDER.indexOf(after);
    if (end === -1) return [];
    return ORDER.slice(before ? ORDER.indexOf(before) + 1 : 0, end + 1).reverse();
  };

  test('goes by the account in the feed, for all a push brought', async () => {
    const found = await addPushers({}, [feedEntry(2, 'anna', 'c3', 'c1'), feedEntry(1, 'konzilo', 'c1')], commitsOf);
    assert.deepEqual(found, { c1: 'konzilo', c2: 'anna', c3: 'anna' });
  });

  test('gives a commit to whoever first brought it, so that pushing it again changes nothing', async () => {
    const found = await addPushers({}, [feedEntry(1, 'editor', 'c2'), feedEntry(2, 'admin', 'c2'), feedEntry(3, 'admin', 'c3', 'c2')], commitsOf);
    assert.equal(found.c1, 'editor');
    assert.equal(found.c2, 'editor');
    assert.equal(found.c3, 'admin');
    assert.deepEqual(await addPushers({ c1: 'first' }, [feedEntry(9, 'second', 'c1')], commitsOf), { c1: 'first' });
  });

  test('reads a new branch\'s comparison of nothing as a push of its whole history', async () => {
    const found = await addPushers({}, [feedEntry(1, 'anna', 'c2', '0'.repeat(40))], commitsOf);
    assert.deepEqual(found, { c1: 'anna', c2: 'anna' });
  });

  test('passes by what is no push, and what it cannot read', async () => {
    const found = await addPushers({}, [
      feedEntry(1, 'anna', 'c1', null, 'create_repo'),
      { id: 2, op_type: 'commit_repo', act_user: { login: 'anna' }, content: '' },
      { id: 3, op_type: 'commit_repo', act_user: { login: 'anna' }, content: 'not json' },
      feedEntry(4, 'anna', 'on-another-branch'),
      { ...feedEntry(5, 'anna', 'c4'), act_user: null },
    ], commitsOf);
    assert.deepEqual(found, {});
  });

  test('asks for page after page of the feed until it knows the rest', async () => {
    const pages = { 1: [{ id: 9 }, { id: 8 }], 2: [{ id: 7 }, { id: 6 }], 3: [{ id: 5 }, { id: 4 }] };
    const asked = [];
    const events = await eventsAfter(6, async (page) => {
      asked.push(page);
      return pages[page] ?? [];
    });
    assert.deepEqual(events.map(({ id }) => id), [9, 8, 7]);
    assert.deepEqual(asked, [1, 2]);
    assert.deepEqual((await eventsAfter(0, async (page) => pages[page] ?? [])).map(({ id }) => id), [9, 8, 7, 6, 5, 4]);
  });

  describe('as asked of Forgejo', () => {
    let folder;

    before(() => {
      folder = mkdtempSync(join(tmpdir(), 'konzilo-roles-'));
    });
    after(() => rmSync(folder, { recursive: true, force: true }));

    const standIn = (feed, reviewers = null) => {
      const seen = [];
      const respond = (body) => ({ ok: true, json: async () => body });
      return {
        seen,
        get: async (url) => {
          seen.push(new URL(url).pathname);
          if (url.includes('/orgs/')) return respond([{ id: 7, name: 'admins' }, { id: 8, name: 'editors' }, ...(reviewers ? [{ id: 9, name: 'reviewers' }] : [])]);
          if (url.includes('/teams/7/members')) return respond([{ login: 'anna' }]);
          if (url.includes('/teams/9/members')) return respond(reviewers);
          if (url.includes('/activities/feeds')) return respond(new URL(url).searchParams.get('page') === '1' ? feed() : []);
          throw new Error(`nothing to say of ${url}`);
        },
      };
    };
    const source = { commitsOf };
    const read = (where, { awaited = [], ...given }) => forgejoRoles({ forgejo: 'http://forgejo', repository: 'org/source', token: 'a-token', instance: 'konzilo', folder: where, ...given }).read({ source, awaited });

    test('writes who the Admins are and who pushed what, and keeps what it has learned', async () => {
      const where = join(folder, 'first');
      const feed = [feedEntry(1, 'konzilo', 'c1')];
      const forgejo = standIn(() => feed);
      const files = await read(where, { get: forgejo.get });
      assert.deepEqual(JSON.parse(readFileSync(files.admins, 'utf8')), ['konzilo', 'anna']);
      assert.deepEqual(JSON.parse(readFileSync(files.pushers, 'utf8')), { c1: 'konzilo' });
      feed.unshift(feedEntry(2, 'anna', 'c2', 'c1'));
      await read(where, { get: forgejo.get });
      assert.deepEqual(JSON.parse(readFileSync(files.pushers, 'utf8')), { c1: 'konzilo', c2: 'anna' });
    });

    test('writes who the Reviewers are, never the account the core pushes with, and none where the site has no such team', async () => {
      const files = await read(join(folder, 'reviewers'), { get: standIn(() => [], [{ login: 'rut' }, { login: 'konzilo' }, { login: 'olle' }]).get });
      assert.deepEqual(JSON.parse(readFileSync(files.reviewers, 'utf8')), ['rut', 'olle']);
      const none = await read(join(folder, 'no-reviewers'), { get: standIn(() => []).get });
      assert.deepEqual(JSON.parse(readFileSync(none.reviewers, 'utf8')), []);
    });

    test('reads every page of the organisation\'s teams and of each team\'s members, as Forgejo lists them a page at a time', async () => {
      const paged = (all, url) => {
        const { searchParams } = new URL(url);
        const limit = Math.min(Number(searchParams.get('limit') ?? 30), 50);
        const page = Number(searchParams.get('page') ?? 1);
        return all.slice((page - 1) * limit, page * limit);
      };
      const teams = [...Array.from({ length: 50 }, (_, at) => ({ id: 100 + at, name: `team-${at}` })), { id: 7, name: 'admins' }, { id: 9, name: 'reviewers' }];
      const admins = [...Array.from({ length: 60 }, (_, at) => ({ login: `admin-${at}` })), { login: 'anna' }];
      const get = async (url) => {
        const respond = (body) => ({ ok: true, json: async () => body });
        if (url.includes('/orgs/')) return respond(paged(teams, url));
        if (url.includes('/teams/7/members')) return respond(paged(admins, url));
        if (url.includes('/teams/9/members')) return respond(paged([{ login: 'rut' }], url));
        if (url.includes('/activities/feeds')) return respond([]);
        throw new Error(`nothing to say of ${url}`);
      };
      const files = await read(join(folder, 'crowded'), { get });
      assert.deepEqual(JSON.parse(readFileSync(files.admins, 'utf8')), ['konzilo', ...admins.map(({ login }) => login)]);
      assert.deepEqual(JSON.parse(readFileSync(files.reviewers, 'utf8')), ['rut']);
    });

    test('waits a moment for a new commit, which Forgejo writes down just after the push', async () => {
      const where = join(folder, 'waits');
      mkdirSync(where);
      const feed = [];
      let slept = 0;
      const files = await read(where, {
        awaited: ['c1'],
        get: standIn(() => feed).get,
        sleep: async () => {
          slept += 1;
          if (slept === 3) feed.push(feedEntry(1, 'anna', 'c1'));
        },
      });
      assert.equal(slept, 3);
      assert.deepEqual(JSON.parse(readFileSync(files.pushers, 'utf8')), { c1: 'anna' });
    });

    test('goes on without a commit that never shows, which is then no Admin\'s', async () => {
      const where = join(folder, 'never');
      let slept = 0;
      const files = await read(where, { awaited: ['c1'], settled: 100, step: 50, get: standIn(() => []).get, sleep: async () => { slept += 1; } });
      assert.equal(slept, 2);
      assert.deepEqual(JSON.parse(readFileSync(files.pushers, 'utf8')), {});
    });
  });
});

describe('the build request', () => {
  let folder;

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-requests-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  // Builds on request until there is no more to do, and says how many it made.
  const buildsFor = async (control, during = () => {}) => {
    let builds = 0;
    let going = true;
    await buildOnRequest({
      control,
      build: async () => {
        builds += 1;
        during(builds);
      },
      sleep: async () => {
        going = false;
      },
      going: () => going,
    });
    return builds;
  };

  test('many before a build are one', async () => {
    const control = buildControl(join(folder, 'many'));
    control.request();
    control.request();
    assert.equal(await buildsFor(control), 1);
    assert.equal(control.requested(), false);
  });

  test('many during a build give one more, and only one', async () => {
    const control = buildControl(join(folder, 'during'));
    control.request();
    assert.equal(await buildsFor(control, (build) => {
      if (build === 1) {
        control.request();
        control.request();
      }
    }), 2);
  });

  test('nothing is built without one', async () => {
    assert.equal(await buildsFor(buildControl(join(folder, 'none'))), 0);
  });

  test('a build that throws is not the end of the builder\'s world, if the caller says so', async () => {
    const control = buildControl(join(folder, 'throws'));
    control.request();
    await assert.rejects(buildOnRequest({ control, build: async () => { throw new Error('no'); }, sleep: async () => {} }), /no/);
    assert.equal(control.requested(), false, 'it has taken its request');
  });
});
