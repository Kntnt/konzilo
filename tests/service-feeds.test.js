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
import { isIP } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { editorsService } from '../src/service/editors.js';
import { feedReader, fetchFeed } from '../src/service/feeds.js';
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

// Where each host leads, as DNS would answer, with no outside address asked.
const HOSTS = {
  'feeds.example.com': ['93.184.215.14'],
  'other.example.com': ['93.184.215.15', '2606:2800:21f:cb07:6820:80da:af6b:8b2c'],
  'internal.example.com': ['10.0.0.5'],
  'mixed.example.com': ['93.184.215.16', '192.168.1.2'],
  'nat.example.com': ['100.64.0.7'],
  'mapped.example.com': ['::ffff:127.0.0.1'],
  'unique.example.com': ['fd12:3456::1'],
};
const lookup = async (host) => {
  if (!Object.hasOwn(HOSTS, host)) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
  return HOSTS[host].map((address) => ({ address, family: isIP(address) }));
};

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
  let control;

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
      if (Object.hasOwn(files, path)) return answerOf({ content: Buffer.from(files[path].text).toString('base64'), sha: files[path].sha });
      // A folder, as Forgejo lists one: what it holds, each without its content.
      const held = Object.keys(files).filter((one) => one.startsWith(`${path}/`)).sort();
      if (held.length === 0) return answerOf({ message: 'not found' }, 404);
      return answerOf([...new Set(held.map((one) => one.slice(path.length + 1).split('/')[0]))].map((name) => {
        const one = `${path}/${name}`;
        return Object.hasOwn(files, one) ? { type: 'file', name, path: one, sha: files[one].sha } : { type: 'dir', name, path: one, sha: `tree-${one}` };
      }));
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
    reader = feedReader({ store, site: () => site, forgejo: 'http://forgejo', repository: 'org/source', token: READER, get, lookup, now: () => clock, warn: () => {}, newId: () => `f00d0000000${(ids += 1).toString(16)}`, waitAtMost: 1000, pause: async () => {} });
    control = buildControl(join(folder, `control-${Date.now()}-${Math.random()}`));
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', rolesToken: 'roles', control, store, site: () => site, feeds: reader, get, now: () => clock, warn: () => {} });
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
      assert.deepEqual(await statusFeeds(), [{ address: RSS, failure: { at: clock.toISOString().replace(/\.\d{3}Z$/, 'Z'), ...failure }, refused: [] }], JSON.stringify(failure));
    }
    served[RSS] = rss();
    await later();
    assert.deepEqual(await statusFeeds(), []);
    assert.equal(commits.length, 1);
    assert.ok(pathOf('b'));
  });

  test('a feed whose address leads to a private network is not read, and its failure says so and nothing more', async () => {
    await add({ address: 'https://internal.example.com/news.rss', type: 'article' });
    assert.deepEqual(await statusFeeds(), [{ address: 'https://internal.example.com/news.rss', failure: { at: clock.toISOString().replace(/\.\d{3}Z$/, 'Z'), kind: 'not-public' }, refused: [] }]);
    assert.deepEqual(asked.filter((url) => url.includes('internal.example.com')), []);
  });

  test('items of the same title make posts of slugs of their own, after the slug a post of the type an Editor made holds', async () => {
    files['articles/aaaaaaaaaaaa.md'] = { text: '---\ntitle: "Ours"\nslug: "same"\nstatus: published\n---\n\nText.\n', sha: 'sha-ours' };
    files['articles/bbbbbbbbbbbb.md'] = { text: '---\ntitle: "Same again"\nstatus: draft\n---\n\nText.\n', sha: 'sha-draft' };
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss({ ...C, title: 'Same' }, { ...B, title: 'Same' }, A);
    await later();
    served[RSS] = rss({ ...D, title: 'Same again' }, { ...C, title: 'Same' }, { ...B, title: 'Same' }, A);
    await later();
    const slugOf = (id) => /^slug: "(.*)"$/m.exec(textOf(pathOf(id)))[1];
    assert.deepEqual(['b', 'c', 'd'].map(slugOf), ['same-2', 'same-3', 'same-again-2']);
  });

  test('an item whose title makes no slug takes one from the last step of its link, else item', async () => {
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss({ ...D, id: 'новости', title: 'Новости' }, { ...C, id: 'статья', title: 'Статья' }, { ...B, id: '2026/harbour-opens.html', title: 'Гавань' }, A);
    await later();
    const slugOf = (id) => /^slug: "(.*)"$/m.exec(textOf(pathOf(id)))[1];
    assert.deepEqual(['2026/harbour-opens.html', 'статья', 'новости'].map(slugOf), ['harbour-opens', 'item', 'item-2']);
  });

  test('a post the build refused at the version the feed reader wrote is a failure of its feed, naming its item, and not among its posts', async () => {
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss(C, B, A);
    await later();
    const refused = (name) => ({ state: 'refused', title: 'Release b', version: 'v', refusals: [{ field: 'slug', block: null, line: null, name, values: {}, reason: 'held', message: 'held' }] });
    control.writeRecord({ posts: { [pathOf('b')]: refused('refusal.address-search'), [pathOf('c')]: { state: 'live', title: 'Release c', version: 'v', refusals: [] } } });
    const [feed] = (await ask('GET', '/_konzilo/feeds')).body.feeds;
    assert.deepEqual([feed.posts, feed.refused], [1, [{ title: 'Release b' }]]);
    assert.deepEqual(await statusFeeds(), [{ address: RSS, failure: null, refused: [{ title: 'Release b' }] }]);

    // A change someone else pushed, which the build refuses, is no failure of the feed's.
    control.writeRecord({ posts: { [pathOf('b')]: refused('refusal.feed-post') } });
    assert.deepEqual(await statusFeeds(), []);
    assert.deepEqual((await ask('GET', '/_konzilo/feeds')).body.feeds[0].refused, []);
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

  test('a feed is removed without waiting for another feed\'s read, and stops its own read under way', async () => {
    const slow = feedReader({ store, site: () => site, forgejo: 'http://forgejo', repository: 'org/source', token: READER, get, lookup, now: () => clock, warn: () => {}, waitAtMost: 60_000, pause: async () => {} });
    const service = editorsService({ forgejo: 'http://forgejo', repository: 'org/source', token: 'read-token', rolesToken: 'roles', control: buildControl(join(folder, `control-${Date.now()}`)), store, site: () => site, feeds: slow, get, now: () => clock, warn: () => {} });
    const other = createServer((incoming, outgoing) => service.request(incoming, outgoing));
    await new Promise((go) => other.listen(0, '127.0.0.1', go));
    const remove = async (id) => (await fetch(`http://127.0.0.1:${other.address().port}/_konzilo/feeds/${id}`, { method: 'DELETE', headers: ADMIN })).status;
    const within = (what, promise) => Promise.race([promise, new Promise((_, late) => setTimeout(() => late(new Error(`${what} took too long`)), 5000).unref())]);
    try {
      const hanging = ({ signal }) => new Promise((_, refuse) => signal.addEventListener('abort', () => refuse(signal.reason)));
      served[RSS] = hanging;
      served[ATOM] = () => new Promise(() => {});
      const first = store.addFeed({ address: RSS, type: 'article', every: 5, at: clock });
      const second = store.addFeed({ address: ATOM, type: 'page', every: 5, at: clock });
      const running = slow.run();
      await new Promise((go) => setTimeout(go, 50));
      assert.equal(await within('removing the feed not read yet', remove(second)), 200);
      assert.equal(await within('removing the feed being read', remove(first)), 200);
      await within('the run', running);
      assert.deepEqual(store.feeds(), []);
      assert.deepEqual(asked.filter((url) => url === ATOM), [], 'the feed removed is not read after');
    } finally {
      other.closeAllConnections();
      await new Promise((go) => other.close(go));
    }
  });

  test('a feed whose posts cannot be released stays', async () => {
    served[RSS] = rss(A);
    await add({ address: RSS, type: 'article' });
    served[RSS] = rss(B, A);
    await later();
    const [{ id }] = store.feeds();
    const saving = get;
    const failing = async (url, init) => (init?.method === 'POST' ? new Response('{}', { status: 403 }) : saving(url, init));
    const stuck = feedReader({ store, site: () => site, forgejo: 'http://forgejo', repository: 'org/source', token: READER, get: failing, lookup, now: () => clock, warn: () => {}, pause: async () => {} });
    await assert.rejects(stuck.release(id));
    assert.equal(store.feeds().length, 1);
  });
});

describe('reading a feed\'s address', () => {
  const RSS_TEXT = rss(A);
  const answerOf = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'application/rss+xml', ...headers } });
  const moved = (to, status = 301) => () => new Response(null, { status, headers: { location: to } });
  // The feeds, as `served` holds each address's answer, and each address asked.
  const reading = (served) => {
    const asked = [];
    const get = async (url, init) => {
      asked.push(url);
      assert.equal(init.redirect, 'manual');
      if (!Object.hasOwn(served, url)) throw new TypeError('fetch failed');
      return typeof served[url] === 'function' ? served[url](init) : answerOf(served[url]);
    };
    return { asked, read: (address, options = {}) => fetchFeed(address, { get, lookup, waitAtMost: 1000, ...options }) };
  };

  test('reads an address whose host leads to public addresses alone', async () => {
    const { read } = reading({ 'https://other.example.com/news.rss': RSS_TEXT, 'http://93.184.215.14/news.rss': RSS_TEXT });
    assert.deepEqual(await read('https://other.example.com/news.rss'), { text: RSS_TEXT });
    assert.deepEqual(await read('http://93.184.215.14/news.rss'), { text: RSS_TEXT });
  });

  test('reads nothing from the loopback, a private, link-local, unique-local, carrier-grade NAT or unspecified address, by name or written out', async () => {
    const addresses = [
      'http://127.0.0.1/news.rss', 'http://localhost.example/news.rss', 'http://10.1.2.3/news.rss', 'http://172.16.0.1/news.rss', 'http://192.168.0.10:8080/news.rss',
      'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/news.rss', 'http://0.0.0.0/news.rss', 'http://[::1]/news.rss', 'http://[::]/news.rss',
      'http://[fe80::1]/news.rss', 'http://[fd00::5]/news.rss', 'http://[::ffff:10.0.0.1]/news.rss',
      'https://internal.example.com/news.rss', 'https://mixed.example.com/news.rss', 'https://nat.example.com/news.rss', 'https://mapped.example.com/news.rss', 'https://unique.example.com/news.rss',
    ];
    HOSTS['localhost.example'] = ['127.0.0.1'];
    try {
      const { asked, read } = reading(Object.fromEntries(addresses.map((address) => [address, RSS_TEXT])));
      for (const address of addresses) assert.deepEqual(await read(address), { failure: { kind: 'not-public' } }, address);
      assert.deepEqual(asked, []);
    } finally {
      delete HOSTS['localhost.example'];
    }
  });

  test('follows at most five redirects by hand, each to a public address, and reads nothing a redirect leads to a private one', async () => {
    const hops = Object.fromEntries(Array.from({ length: 6 }, (_, at) => [`https://feeds.example.com/${at}`, moved(`/${at + 1}`, [301, 302, 303, 307, 308][at % 5])]));
    const { asked, read } = reading({
      ...hops,
      'https://feeds.example.com/5': RSS_TEXT,
      'https://feeds.example.com/inward': moved('http://internal.example.com/news.rss', 302),
      'https://feeds.example.com/loop': moved('http://127.0.0.1:3000/api/v1/version', 307),
      'http://internal.example.com/news.rss': RSS_TEXT,
    });
    assert.deepEqual(await read('https://feeds.example.com/0'), { text: RSS_TEXT });
    assert.deepEqual(await read('https://feeds.example.com/inward'), { failure: { kind: 'not-public' } });
    assert.deepEqual(await read('https://feeds.example.com/loop'), { failure: { kind: 'not-public' } });
    assert.ok(!asked.some((url) => url.includes('internal.example.com') || url.includes('127.0.0.1')));
    const { read: further } = reading({ ...hops, 'https://feeds.example.com/6': moved('/7'), 'https://feeds.example.com/7': RSS_TEXT });
    assert.deepEqual(await further('https://feeds.example.com/1'), { failure: { kind: 'unreachable' } }, 'six redirects');
  });

  test('reads a host a setting names despite its private address, and a redirect to it', async () => {
    const { read } = reading({ 'http://internal.example.com/news.rss': RSS_TEXT, 'https://feeds.example.com/inward': moved('http://internal.example.com/news.rss', 302) });
    const privateHosts = ['internal.example.com'];
    assert.deepEqual(await read('http://internal.example.com/news.rss', { privateHosts }), { text: RSS_TEXT });
    assert.deepEqual(await read('https://feeds.example.com/inward', { privateHosts }), { text: RSS_TEXT });
    assert.deepEqual(await read('http://internal.example.com/news.rss'), { failure: { kind: 'not-public' } });
  });

  test('says a host no name leads to is unreachable', async () => {
    const { read } = reading({});
    assert.deepEqual(await read('https://nowhere.example.com/news.rss'), { failure: { kind: 'unreachable' } });
  });
});
