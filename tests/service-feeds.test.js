// The incoming feeds (ADR 0079), through the service in its role for editors, against a stand-in
// for Forgejo and stand-ins for the feeds, reaching no outside address: an Admin adds an RSS and an
// Atom feed on the *Feeds* page, an Editor cannot; the items a feed holds when it is added make no
// posts; each later item becomes a published post, saved by the feed reader's own credential, once;
// a corrected item corrects its post, its slug kept; a withdrawn item deletes its post, while one
// that fell out of a feed of its latest items stays; a read that fails, or of no items, deletes
// nothing, and a failure shows on the *Publishing* page until a read succeeds; a feed's post is
// read-only in every form; and a feed removed releases its posts, which are then posts like any
// other. A site with no feeds reads nothing.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { editorsService } from '../src/service/editors.js';
import { feedReader } from '../src/service/feeds.js';
import { openStore } from '../src/service/store.js';
import { siteDescription } from '../src/site-description.js';

const site = siteDescription({
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
    page: { collection: 'pages', address: '/pages/{slug}/', elements: ['paragraph'] },
    pictured: { label: 'Pictured', plural: 'Pictured', collection: 'pictured', address: '/pictured/{slug}/', elements: ['paragraph'], fields: { image: { required: true } } },
  },
});

const PEOPLE = {
  'token anna': { login: 'anna', is_admin: false, push: true },
  'token ebba': { login: 'ebba', is_admin: false, push: true },
  'token rut': { login: 'rut', is_admin: false, push: false },
};
const ADMIN = { authorization: 'token anna' };
const EDITOR = { authorization: 'token ebba' };
const READER = 'feed-reader-token';
const RSS = 'https://feeds.example.com/news.rss';
const ATOM = 'https://feeds.example.com/news.atom';

const rssItem = ({ id, title = `Release ${id}`, text = `<p>Text of ${id}.</p>`, date }) => `<item><title>${title}</title><guid>${id}</guid><link>https://news.example.com/${id}</link>${date ? `<pubDate>${new Date(date).toUTCString()}</pubDate>` : ''}<description><![CDATA[${text}]]></description></item>`;
const rss = (...items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>News</title>${items.map(rssItem).join('')}</channel></rss>`;
const atom = (...entries) => `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>News</title><id>urn:news</id>${entries.map(({ id, title = `Entry ${id}`, date }) => `<entry><title>${title}</title><id>urn:${id}</id><link href="https://news.example.com/atom/${id}"/><published>${date}</published><content type="html">&lt;p&gt;Entry ${id}.&lt;/p&gt;</content></entry>`).join('')}</feed>`;

const A = { id: 'a', date: '2026-11-20T08:00:00Z' };
const B = { id: 'b', date: '2026-11-21T08:00:00Z' };
const C = { id: 'c', date: '2026-11-22T08:00:00Z' };
const D = { id: 'd', date: '2026-11-23T08:00:00Z' };

describe('the incoming feeds', () => {
  let folder;
  let store;
  let server;
  let origin;
  let clock;
  let served;
  let files;
  let commits;
  let asked;
  let reader;
  let ids;
  // Whether an Admin's purge waits or runs (ADR 0078).
  let purging;

  const answerOf = (body, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': typeof body === 'string' ? 'application/rss+xml' : 'application/json' } });

  // Forgejo's source repository, and the feeds, as the service reaches them.
  const get = async (url, init = {}) => {
    const { origin: from, pathname, searchParams } = new URL(url);
    asked.push(url);
    const headers = init.headers ?? {};
    if (from === 'https://feeds.example.com') {
      const answer = served[url];
      if (answer === undefined) throw new TypeError('fetch failed');
      if (typeof answer === 'function') return answer(init);
      return answerOf(answer.body ?? answer, answer.status ?? 200);
    }
    const person = PEOPLE[headers.authorization];
    if (pathname === '/api/v1/user') return person ? answerOf({ ...person }) : answerOf({}, 401);
    if (pathname === '/api/v1/repos/org/source') return person ? answerOf({ permissions: { push: person.push } }) : answerOf({}, 401);
    if (pathname === '/api/v1/orgs/org/teams') return answerOf([{ id: 7, name: 'admins' }]);
    if (pathname === '/api/v1/teams/7/members') return answerOf([{ login: 'anna' }]);
    if (pathname === '/api/v1/repos/org/source/git/trees/main') return answerOf({ tree: [], truncated: false });
    if (pathname.startsWith('/api/v1/repos/org/source/contents/')) {
      assert.equal(headers.authorization, `token ${READER}`);
      assert.equal(searchParams.get('ref'), 'main');
      const path = decodeURIComponent(pathname.slice('/api/v1/repos/org/source/contents/'.length));
      return Object.hasOwn(files, path) ? answerOf({ content: Buffer.from(files[path].text).toString('base64'), sha: files[path].sha }) : answerOf({ message: 'not found' }, 404);
    }
    if (pathname === '/api/v1/repos/org/source/contents' && init.method === 'POST') {
      const body = JSON.parse(init.body);
      commits.push({ authorization: headers.authorization, ...body });
      for (const file of body.files) {
        if (file.operation === 'create') files[file.path] = { text: Buffer.from(file.content, 'base64').toString(), sha: `sha-${commits.length}-${file.path}` };
        else if (file.operation === 'update') files[file.path] = { text: Buffer.from(file.content, 'base64').toString(), sha: `sha-${commits.length}-${file.path}` };
        else delete files[file.path];
      }
      return answerOf({}, 201);
    }
    throw new Error(`nothing to say of ${url}`);
  };

  const ask = async (method, path, { headers = ADMIN, body } = {}) => {
    const answer = await fetch(`${origin}${path}`, { method, headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: answer.status, body: await answer.json().catch(() => null) };
  };
  const add = (feed, headers = ADMIN) => ask('POST', '/_konzilo/feeds', { headers, body: feed });
  const later = async (minutes = 5) => {
    clock = new Date(clock.getTime() + minutes * 60_000);
    await reader.run();
  };
  const postFiles = () => Object.keys(files).filter((path) => path.endsWith('.md')).sort();
  const textOf = (path) => files[path].text;
  const pathOf = (id) => postFiles().find((path) => textOf(path).includes(`"item":"${id}"`));
  const statusFeeds = async () => (await ask('GET', '/_konzilo/status', { headers: EDITOR })).body.feeds;

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-feeds-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));
  beforeEach(async () => {
    rmSync(join(folder, 'service.sqlite'), { force: true });
    store = openStore(join(folder, 'service.sqlite'));
    clock = new Date('2026-11-25T10:00:00Z');
    served = {};
    files = {};
    commits = [];
    asked = [];
    ids = 0;
    purging = false;
    reader = feedReader({ store, site: () => site, forgejo: 'http://forgejo', repository: 'org/source', token: READER, get, now: () => clock, warn: () => {}, newId: () => `f00d0000000${(ids += 1).toString(16)}`, waitAtMost: 1000, pause: async () => {}, paused: () => purging });
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', rolesToken: 'roles', control: buildControl(join(folder, `control-${Date.now()}-${Math.random()}`)), store, site: () => site, feeds: reader, get, now: () => clock, warn: () => {} });
    server = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => server.listen(0, '127.0.0.1', go));
    origin = `http://127.0.0.1:${server.address().port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise((go) => server.close(go));
    store.close();
  });

  test('a site with no feeds reads nothing, and reaches neither a feed nor the source', async () => {
    await later(60);
    assert.deepEqual(asked, []);
  });

  test('an Admin adds an RSS feed and an Atom feed, each into a type, and an Editor cannot', async () => {
    served[RSS] = rss(B, A);
    served[ATOM] = atom(A);
    assert.equal((await add({ address: RSS, type: 'article' }, EDITOR)).status, 403);
    assert.equal((await add({ address: RSS, type: 'article' }, { authorization: 'token rut' })).status, 401);
    assert.equal((await ask('GET', '/_konzilo/feeds', { headers: EDITOR })).status, 403);
    assert.equal((await add({ address: RSS, type: 'article' })).status, 201);
    const added = await add({ address: ATOM, type: 'page', every: '15' });
    assert.equal(added.status, 201);
    assert.deepEqual(added.body.feeds.map(({ address, type, every }) => [address, type, every]), [[RSS, 'article', 5], [ATOM, 'page', 15]]);
    assert.deepEqual(added.body.types, [{ name: 'article', label: { en: 'Article', sv: 'Artikel' }, choosable: true }, { name: 'page', label: { en: 'Page', sv: 'Sida' }, choosable: true }, { name: 'pictured', label: 'Pictured', choosable: false }]);
  });

  test('a type that cannot be published from what a feed gives cannot be chosen, nor an address that is none, or taken', async () => {
    assert.deepEqual((await add({ address: RSS, type: 'pictured' })).body, { problems: { type: 'not-choosable' } });
    assert.deepEqual((await add({ address: 'feeds.example.com/news', type: 'nothing' })).body, { problems: { address: 'not-address', type: 'unknown' } });
    assert.deepEqual((await add({ address: RSS, type: 'article', every: 0 })).body, { problems: { every: 'not-minutes' } });
    served[RSS] = rss();
    await add({ address: RSS, type: 'article' });
    assert.deepEqual((await add({ address: RSS, type: 'page' })).body, { problems: { address: 'taken' } });
  });

  test('the items a feed holds when it is added make no posts, and each later item a published post, saved by the feed reader, once', async () => {
    served[RSS] = rss(B, A);
    served[ATOM] = atom(A);
    await add({ address: RSS, type: 'article' });
    await add({ address: ATOM, type: 'page' });
    await reader.run();
    assert.deepEqual(commits, []);

    served[RSS] = rss(C, B, A);
    served[ATOM] = atom({ id: 'e', date: '2026-11-24T08:00:00Z' }, A);
    await later();
    assert.equal(commits.length, 2);
    assert.ok(commits.every(({ authorization, branch }) => authorization === `token ${READER}` && branch === 'main'));
    assert.deepEqual(postFiles(), ['articles/f00d00000001.md', 'pages/f00d00000002.md']);
    assert.equal(textOf('articles/f00d00000001.md'), [
      '---',
      'title: "Release c"',
      'slug: "release-c"',
      'status: published',
      'date: 2026-11-22T08:00:00Z',
      'headline: "Release c"',
      'originalAddress: "https://news.example.com/c"',
      `feed: ${textOf('articles/f00d00000001.md').match(/^feed: (.*)$/m)[1]}`,
      '---',
      '',
      'Text of c.',
      '',
    ].join('\n'));
    assert.match(textOf('articles/f00d00000001.md'), /^feed: \{"item":"c","version":"[0-9a-f]{64}"\}$/m);
    assert.match(textOf('pages/f00d00000002.md'), /^title: "Entry e"$/m);

    await later();
    assert.equal(commits.length, 2, 'the same feed read again makes no second post');
  });

  test('reads and saves nothing while an Admin\'s purge waits or runs, and catches up once it has ended', async () => {
    served[RSS] = rss(B, A);
    await add({ address: RSS, type: 'article' });
    await reader.run();
    served[RSS] = rss(C, B, A);
    purging = true;
    asked.length = 0;
    await later();
    await reader.read((await ask('GET', '/_konzilo/feeds')).body.feeds[0].id);
    assert.ok(!asked.includes(RSS), 'the feed is not even read');
    purging = false;
    await later(1);
    assert.equal(commits.length, 1, 'what came meanwhile is saved at the first run after');

    // A purge that comes while a feed is read.
    served[RSS] = () => {
      purging = true;
      return answerOf(rss(D, C, B, A));
    };
    await later();
    assert.equal(commits.length, 1, 'nothing is saved once it has come');
    purging = false;
    served[RSS] = rss(D, C, B, A);
    await later();
    assert.equal(commits.length, 2);
    await assert.rejects((async () => {
      purging = true;
      await reader.release((await ask('GET', '/_konzilo/feeds')).body.feeds[0].id);
    })(), 'nor are a removed feed\'s posts released meanwhile');
    purging = false;
  });

  test('a corrected item corrects its post at the next read, under the same ID, its slug kept', async () => {
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss(B, A);
    await later();
    const path = pathOf('b');
    served[RSS] = rss({ ...B, title: 'Release b, corrected', text: '<p>Corrected text.</p>' }, A);
    await later();
    assert.equal(commits.length, 2);
    assert.deepEqual(postFiles(), [path]);
    assert.match(textOf(path), /^title: "Release b, corrected"\nslug: "release-b"$/m);
    assert.match(textOf(path), /\n\nCorrected text\.\n$/);
  });

  test('an item withdrawn while older ones remain deletes its post at the next read, and one back becomes a post again', async () => {
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss(C, B, A);
    await later();
    const path = pathOf('b');
    served[RSS] = rss(C, A);
    await later();
    assert.equal(files[path], undefined);
    assert.deepEqual(commits.at(-1).files.map(({ operation, path: one }) => [operation, one]), [['delete', path]]);
    served[RSS] = rss(C, B, A);
    await later();
    assert.match(textOf(path), /^title: "Release b"$/m);
  });

  test('a feed that keeps its latest three, read after a fourth arrives, leaves the post of the item that fell out', async () => {
    served[RSS] = rss();
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss(C, B, A);
    await later();
    assert.equal(postFiles().length, 3);
    served[RSS] = rss(D, C, B);
    await later();
    assert.equal(postFiles().length, 4);
    assert.ok(pathOf('a'));
  });

  test('a read that fails, and a feed with no items, delete nothing; a failure shows on the Publishing page until a read succeeds', async () => {
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss(B, A);
    await later();
    assert.deepEqual(await statusFeeds(), []);
    for (const [answer, failure] of [
      [{ status: 503, body: 'down' }, { kind: 'status', status: 503 }],
      [undefined, { kind: 'unreachable' }],
      ['<html><body>Moved</body></html>', { kind: 'not-a-feed' }],
      [{ body: 'x'.repeat(5 * 1024 * 1024 + 1) }, { kind: 'too-large' }],
      [({ signal }) => new Promise((_, refuse) => signal.addEventListener('abort', () => refuse(signal.reason))), { kind: 'timeout' }],
      [() => new Promise(() => {}), { kind: 'timeout' }],
    ]) {
      served[RSS] = answer;
      await later();
      assert.deepEqual(await statusFeeds(), [{ address: RSS, failure: { at: clock.toISOString().replace(/\.\d{3}Z$/, 'Z'), ...failure } }], JSON.stringify(failure));
    }
    served[RSS] = rss();
    await later();
    assert.deepEqual(await statusFeeds(), []);
    assert.equal(commits.length, 1);
    assert.ok(pathOf('b'));
  });

  test('a feed is read at its interval, and an Admin changes its type and interval', async () => {
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article', every: 10 });
    const reads = () => asked.filter((url) => url === RSS).length;
    await later(5);
    assert.equal(reads(), 1);
    await later(5);
    assert.equal(reads(), 2);
    const [{ id }] = store.feeds();
    const changed = await ask('PUT', `/_konzilo/feeds/${id}`, { body: { type: 'page', every: 30 } });
    assert.equal(changed.status, 200);
    assert.deepEqual(changed.body.feeds.map(({ address, type, every }) => [address, type, every]), [[RSS, 'page', 30]]);
    served[RSS] = rss(B, A);
    await later(30);
    assert.deepEqual(postFiles(), ['pages/f00d00000001.md']);
  });

  test('a feed\'s post is read-only in every form, and a removed feed\'s posts are released, as posts like any other', async () => {
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss(B, A);
    await later();
    const path = pathOf('b');
    const form = `articles/${path.split('/').at(-1).replace('.md', '')}`;
    const hold = (headers) => ask('PUT', `/_konzilo/locks/${encodeURIComponent(form)}?tab=tab-aaaaaaaa`, { headers });
    assert.deepEqual(await hold(EDITOR), { status: 403, body: { fromFeed: true } });
    assert.deepEqual(await hold(ADMIN), { status: 403, body: { fromFeed: true } });

    const [{ id }] = store.feeds();
    assert.equal((await ask('DELETE', `/_konzilo/feeds/${id}`, { headers: EDITOR })).status, 403);
    const before = textOf(path);
    const removed = await ask('DELETE', `/_konzilo/feeds/${id}`);
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body.feeds, []);
    assert.equal(textOf(path), before.replace(/^feed: .*\n/m, ''));
    assert.match(commits.at(-1).message, /^Release the posts of the feed /);
    assert.equal(commits.at(-1).authorization, `token ${READER}`);
    assert.equal((await hold(EDITOR)).status, 200);
  });

  test('a feed whose posts cannot be released stays', async () => {
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss(B, A);
    await later();
    const [{ id }] = store.feeds();
    const saving = get;
    const failing = async (url, init) => (init?.method === 'POST' ? new Response('{}', { status: 403 }) : saving(url, init));
    const stuck = feedReader({ store, site: () => site, forgejo: 'http://forgejo', repository: 'org/source', token: READER, get: failing, now: () => clock, warn: () => {}, pause: async () => {} });
    await assert.rejects(stuck.release(id));
    assert.equal(store.feeds().length, 1);
  });
});
