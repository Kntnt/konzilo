// The *Deleted* page's list (ADR 0077), in the service's role for editors, against a stand-in for
// Forgejo: each post, term and image library entry whose source file a save removed, newest
// deletion first, with the moment and the account of the push that removed it as Forgejo's feed
// recorded them, and the file as its last revision left it. Only someone who may write sees it, and
// only what the history holds is listed: nothing is stored beside it.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { deletableIn } from '../src/service/deleted.js';
import { editorsService } from '../src/service/editors.js';

const PEOPLE = {
  'token anna': { login: 'anna', full_name: 'Anna Admin', push: true },
  'token ebba': { login: 'ebba', full_name: 'Ebba Editor', push: true },
  'token rut': { login: 'rut', full_name: 'Rut Reviewer', push: false },
};

// A site in one language, with articles, the article's taxonomies and the image library.
const SITE = {
  languages: [{ locale: 'en_GB', tag: 'en-GB', main: true }],
  types: { article: { collection: 'articles' }, page: { collection: 'pages' } },
  taxonomies: { authors: { collection: 'authors' }, topics: { collection: 'topics' } },
};

const ARTICLE = 'articles/aaaaaaaaaaaa.md';
const KEPT = 'articles/bbbbbbbbbbbb.md';
const AGAIN = 'articles/cccccccccccc.md';
const TOPIC = 'topics/dddddddddddd.json';
const IMAGE = 'image-library/eeeeeeeeeeee.json';
const PICTURE = 'media/meadow.jpg';
const SHARED = 'image-library/ffffffffffff.json';

const push = (id, login, name, at, after, before) => ({ id, op_type: 'commit_repo', act_user: { login, full_name: name }, created: at, content: JSON.stringify({ HeadCommit: { Sha1: after }, CompareURL: `org/source/compare/${before}...${after}` }) });

// The source as Forgejo holds it: commits oldest first, each with the files it wrote, a file it
// removed as undefined, and the pushes its feed recorded, each by the account that did it.
const history = () => {
  const commits = [
    { sha: 'c1', date: '2026-11-01T08:00:00Z', files: { [ARTICLE]: '---\ntitle: The meadow\nstatus: published\n---\nGrass.\n', [KEPT]: '---\ntitle: Kept\n---\n', [AGAIN]: '---\ntitle: Again\n---\n', [TOPIC]: '{ "name": "Meadows" }', 'settings.json': '{}', 'menus/main.json': '{ "items": [] }' } },
    { sha: 'c2', date: '2026-11-02T08:00:00Z', files: { [IMAGE]: '{ "src": "/media/meadow.jpg", "alt": "A meadow" }', [PICTURE]: 'version https://git-lfs.github.com/spec/v1\n', [SHARED]: '{ "src": "/media/shared.jpg", "alt": "Shared" }', 'media/shared.jpg': 'lfs' } },
    { sha: 'c3', date: '2026-11-03T08:00:00Z', files: { [ARTICLE]: '---\ntitle: The meadow in May\nstatus: published\n---\nGrass.\n' } },
    { sha: 'c4', date: '2026-11-04T08:00:00Z', files: { [ARTICLE]: undefined, 'menus/main.json': undefined } },
    { sha: 'c5', date: '2026-11-05T08:00:00Z', files: { [TOPIC]: undefined, [AGAIN]: undefined } },
    { sha: 'c6', date: '2026-11-06T08:00:00Z', files: { [AGAIN]: '---\ntitle: Again, restored\n---\n' } },
    { sha: 'c7', date: '2026-11-07T08:00:00Z', files: { [IMAGE]: undefined, [PICTURE]: undefined, [SHARED]: undefined } },
    { sha: 'c8', date: '2026-11-08T08:00:00Z', files: { [AGAIN]: undefined } },
  ];
  const feed = [
    push(1, 'konzilo', '', '2026-11-02T09:00:00Z', 'c2', '0000000000000000000000000000000000000000'),
    push(2, 'ebba', 'Ebba Editor', '2026-11-04T08:00:05Z', 'c4', 'c2'),
    push(3, 'anna', 'Anna Admin', '2026-11-07T08:00:05Z', 'c7', 'c6'),
  ];
  return { commits, feed };
};

describe('the deleted posts, terms and image library entries', () => {
  let folder;
  let count = 0;

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-deleted-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  const answerOf = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });

  const running = async ({ source = history(), perPage, now } = {}) => {
    const asked = [];
    const upTo = (sha) => source.commits.slice(0, source.commits.findIndex((one) => one.sha === sha) + 1);
    // What a commit leaves of a file: the last commit at or before it that wrote or removed it.
    const fileAt = (sha, path) => [...upTo(sha)].reverse().find((one) => Object.hasOwn(one.files, path))?.files[path];
    const treeAt = (sha) => {
      const files = {};
      for (const one of upTo(sha)) for (const [path, text] of Object.entries(one.files)) files[path] = text;
      return Object.entries(files).filter(([, text]) => text !== undefined).map(([path]) => ({ path, type: 'blob', sha: `blob-${path}` }));
    };
    const head = () => source.commits.at(-1).sha;
    const get = async (url, { headers }) => {
      const address = new URL(url);
      const { pathname, searchParams } = address;
      asked.push(`${pathname}${address.search}`);
      const person = PEOPLE[headers.authorization];
      if (pathname === '/api/v1/user') return person ? answerOf({ login: person.login, full_name: person.full_name, is_admin: false }) : answerOf({}, 401);
      if (pathname === '/api/v1/repos/org/source') return person ? answerOf({ permissions: { push: person.push, pull: true } }) : answerOf({}, 404);
      assert.ok(['token read-token', 'token pushes-token'].includes(headers.authorization), `${pathname} is asked with the service's own credential`);
      if (pathname === '/api/v1/repos/org/source/activities/feeds') {
        const page = Number(searchParams.get('page'));
        const limit = Number(searchParams.get('limit'));
        return answerOf([...source.feed].reverse().slice((page - 1) * limit, page * limit));
      }
      if (pathname === '/api/v1/repos/org/source/branches/main') return answerOf({ name: 'main', commit: { id: head() } });
      if (pathname === '/api/v1/repos/org/source/commits') {
        const page = Number(searchParams.get('page'));
        const limit = Number(searchParams.get('limit'));
        const path = searchParams.get('path');
        let list = source.commits.map((one, at) => ({ ...one, parent: source.commits[at - 1]?.sha })).reverse();
        if (searchParams.has('sha')) {
          const from = list.findIndex((one) => one.sha === searchParams.get('sha'));
          if (from === -1) return answerOf({}, 404);
          list = list.slice(from);
        }
        if (searchParams.has('not')) {
          const until = list.findIndex((one) => one.sha === searchParams.get('not'));
          if (until !== -1) list = list.slice(0, until);
        }
        if (path) list = list.filter((one) => Object.hasOwn(one.files, path));
        const withFiles = searchParams.get('files') !== 'false';
        const shown = list.slice((page - 1) * limit, page * limit).map((one) => ({
          sha: one.sha,
          commit: { author: { name: 'Someone Else', date: one.date }, committer: { name: 'Someone Else', date: one.date } },
          parents: one.parent ? [{ sha: one.parent }] : [],
          ...(withFiles ? { files: Object.entries(one.files).map(([filename, text]) => ({ filename, status: text === undefined ? 'removed' : 'modified' })) } : {}),
        }));
        return answerOf(shown);
      }
      if (pathname.startsWith('/api/v1/repos/org/source/git/trees/')) {
        const ref = decodeURIComponent(pathname.slice('/api/v1/repos/org/source/git/trees/'.length));
        return answerOf({ tree: treeAt(ref === 'main' ? head() : ref), truncated: false });
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
      deletable: () => deletableIn(SITE),
      revisions: { ...(perPage ? { perPage } : {}), now: now ?? (() => new Date('2026-11-23T10:00:00Z')), sleep: async () => {} },
    });
    const server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const deleted = async (who, query = {}, method = 'GET') => {
      const address = new URL(`${origin}/_konzilo/deleted`);
      for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value);
      const answer = await fetch(address, { method, headers: who ? { authorization: `token ${who}` } : {} });
      const text = await answer.text();
      return { status: answer.status, body: text ? JSON.parse(text) : null, headers: answer.headers };
    };
    return {
      source,
      asked,
      deleted,
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

  test('lists each deleted post, term and image library entry, newest deletion first, with the push that deleted it and its last revision', withService({}, async ({ deleted }) => {
    const answer = await deleted('ebba');
    assert.equal(answer.status, 200);
    assert.equal(answer.headers.get('cache-control'), 'no-store');
    assert.deepEqual(answer.body, {
      deleted: [
        { path: AGAIN, collection: 'articles', commit: 'c8', moment: '2026-11-08T08:00:00Z', account: null, last: { commit: 'c7', text: '---\ntitle: Again, restored\n---\n' }, along: [] },
        { path: IMAGE, collection: 'image-library', commit: 'c7', moment: '2026-11-07T08:00:05Z', account: { login: 'anna', name: 'Anna Admin' }, last: { commit: 'c6', text: '{ "src": "/media/meadow.jpg", "alt": "A meadow" }' }, along: [PICTURE] },
        { path: SHARED, collection: 'image-library', commit: 'c7', moment: '2026-11-07T08:00:05Z', account: { login: 'anna', name: 'Anna Admin' }, last: { commit: 'c6', text: '{ "src": "/media/shared.jpg", "alt": "Shared" }' }, along: [] },
        { path: TOPIC, collection: 'topics', commit: 'c5', moment: '2026-11-05T08:00:00Z', account: null, last: { commit: 'c4', text: '{ "name": "Meadows" }' }, along: [] },
        { path: ARTICLE, collection: 'articles', commit: 'c4', moment: '2026-11-04T08:00:05Z', account: { login: 'ebba', name: 'Ebba Editor' }, last: { commit: 'c3', text: '---\ntitle: The meadow in May\nstatus: published\n---\nGrass.\n' }, along: [] },
      ],
      more: false,
    });
  }));

  test('lists one type at a time, and a page at a time', withService({ perPage: 2 }, async ({ deleted }) => {
    assert.deepEqual((await deleted('anna', { collection: 'articles' })).body.deleted.map(({ path }) => path), [AGAIN, ARTICLE]);
    assert.deepEqual((await deleted('anna', { collection: 'authors' })).body, { deleted: [], more: false });
    const first = await deleted('anna');
    assert.deepEqual(first.body.deleted.map(({ path }) => path), [AGAIN, IMAGE]);
    assert.equal(first.body.more, true);
    const third = await deleted('anna', { page: '3' });
    assert.deepEqual(third.body.deleted.map(({ path }) => path), [ARTICLE]);
    assert.equal(third.body.more, false);
  }));

  test('learns the history once, and after that only what is new', withService({}, async ({ deleted, source, asked }) => {
    await deleted('ebba');
    asked.length = 0;
    await deleted('ebba');
    assert.deepEqual(asked.filter((one) => one.startsWith('/api/v1/repos/org/source/commits?') && one.includes('files=true')), [], 'nothing new, nothing walked');

    source.commits.push({ sha: 'c9', date: '2026-11-09T08:00:00Z', files: { [KEPT]: undefined } });
    asked.length = 0;
    const answer = await deleted('ebba');
    const walked = asked.filter((one) => one.startsWith('/api/v1/repos/org/source/commits?') && one.includes('files=true')).map((one) => new URL(one, 'http://x').searchParams);
    assert.deepEqual(walked.map((one) => [one.get('sha'), one.get('not')]), [['c9', 'c8']], 'only the commits after the last one learned');
    assert.equal(answer.body.deleted[0].path, KEPT);
  }));

  test('lists nothing the history no longer holds, as after a purge', withService({}, async ({ deleted, source }) => {
    assert.ok((await deleted('ebba')).body.deleted.some(({ path }) => path === ARTICLE));
    // The history written anew without the article, every commit after its first a new one.
    const purged = history().commits.map((one) => ({ ...one, sha: `p${one.sha}`, files: Object.fromEntries(Object.entries(one.files).filter(([path]) => path !== ARTICLE)) }));
    source.commits.splice(0, source.commits.length, ...purged);
    const answer = await deleted('ebba');
    assert.deepEqual(answer.body.deleted.map(({ path }) => path), [AGAIN, IMAGE, SHARED, TOPIC]);
    assert.equal(answer.body.deleted[0].commit, 'pc8');
  }));

  test('answers only someone who may write, and nothing but GET', withService({}, async ({ deleted }) => {
    assert.equal((await deleted(null)).status, 401);
    assert.equal((await deleted('rut')).status, 401);
    assert.equal((await deleted('ebba', { page: '0' })).status, 400);
    assert.equal((await deleted('ebba', { page: 'x' })).status, 400);
    assert.equal((await deleted('ebba', { collection: '../x' })).status, 400);
    assert.equal((await deleted('ebba', {}, 'POST')).status, 405);
  }));
});

describe('which source files are posts, terms and image library entries', () => {
  test('on a site in one language: a post, a term or a library entry in its collection\'s folder', () => {
    const deletable = deletableIn(SITE);
    assert.deepEqual(deletable('articles/aaaaaaaaaaaa.md'), { collection: 'articles' });
    assert.deepEqual(deletable('topics/aaaaaaaaaaaa.json'), { collection: 'topics' });
    assert.deepEqual(deletable('image-library/aaaaaaaaaaaa.json'), { collection: 'image-library' });
    for (const path of ['articles/aaaaaaaaaaaa.json', 'topics/aaaaaaaaaaaa.md', 'articles/.gitkeep', 'articles/en-GB/aaaaaaaaaaaa.md', 'menus/main.json', 'settings.json', 'media/meadow.jpg', 'redirects.json', 'start.page.md', 'other/aaaaaaaaaaaa.md']) {
      assert.equal(deletable(path), null, path);
    }
  });

  test('on a site in several languages: each translation in its language\'s folder', () => {
    const deletable = deletableIn({ ...SITE, languages: [{ tag: 'sv-SE', main: true }, { tag: 'en-GB', main: false }] });
    assert.deepEqual(deletable('articles/en-GB/aaaaaaaaaaaa.md'), { collection: 'articles' });
    assert.deepEqual(deletable('topics/sv-SE/aaaaaaaaaaaa.json'), { collection: 'topics' });
    assert.deepEqual(deletable('image-library/aaaaaaaaaaaa.json'), { collection: 'image-library' }, 'the library is in one language');
    for (const path of ['articles/aaaaaaaaaaaa.md', 'articles/de-DE/aaaaaaaaaaaa.md', 'image-library/sv-SE/aaaaaaaaaaaa.json']) assert.equal(deletable(path), null, path);
  });
});
