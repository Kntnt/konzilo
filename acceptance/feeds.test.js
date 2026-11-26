// Incoming feeds (ADR 0079), in a site in Compose, with an Admin and an Editor signed in, in
// Chromium, against a stand-in for another site's feeds in a container of the project's own, so
// that nothing reaches an outside address: a site with no feeds reads none; an Admin adds an RSS
// and an Atom feed on the *Feeds* page, which an Editor cannot; their items then make no posts,
// and each later item a published post, saved by the feed reader, whom the History names, and
// published by the build, a post waiting for an article going out with it; read again, it makes
// no second post; corrected, its post follows at the same address; it opens read-only to the
// Admin and the Editor alike, and an Editor's change pushed outside the editor is refused by the
// build; withdrawn while older items remain, its post goes, and the *Deleted* page offers no
// *Restore*, while one that fell out of a feed of its latest three stays; a read that fails, and a
// feed of no items, delete nothing, and a failure shows on the *Publishing* page until a read
// succeeds; and a feed removed leaves its posts published, as posts an Editor may change.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { openEditor, seeded, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const USER = 'sveltia-cms.user';
const RSS = 'http://feed-stand-in:8080/news.rss';
const ATOM = 'http://feed-stand-in:8080/news.atom';
const version = (key) => execFileSync(join(core, 'scripts/versions'), [key], { encoding: 'utf8' }).trim();

const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000);
// An item is published as it is first served, so that a post waiting for one, saved before it,
// counts it (ADR 0076), and each later item is newer than the one before.
const dated = (item) => {
  item.date ??= new Date();
  return item;
};
const rssItem = ({ id, title, date }) => `<item><title>${title}</title><guid isPermaLink="false">${id}</guid><link>https://news.example.com/${id}</link><pubDate>${date.toUTCString()}</pubDate><description><![CDATA[<p>The text of ${title}.</p>]]></description></item>`;
const rss = (...items) => `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>News</title><link>https://news.example.com/</link>${items.map(dated).map(rssItem).join('')}</channel></rss>\n`;
const atom = (...entries) => `<?xml version="1.0" encoding="utf-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Notices</title><id>urn:notices</id><updated>${new Date().toISOString()}</updated>${entries.map(dated).map(({ id, title, date }) => `<entry><title>${title}</title><id>urn:notice:${id}</id><link href="https://notices.example.com/${id}"/><published>${date.toISOString()}</published><content type="html">&lt;p&gt;The notice ${title}.&lt;/p&gt;</content></entry>`).join('')}</feed>\n`;

// The items, oldest first: two the feed holds as it is added, and the rest as they come.
const A = { id: 'release-a', title: 'Release A', date: new Date('2026-11-01T08:00:00Z') };
const B = { id: 'release-b', title: 'Release B', date: new Date('2026-11-02T08:00:00Z') };
const C = { id: 'release-c', title: 'Harbour opens' };
const D = { id: 'release-d', title: 'Quay closes' };
const E = { id: 'release-e', title: 'Lanterns lit' };
const F = { id: 'release-f', title: 'Ferry returns' };
const G = { id: 'release-g', title: 'Market day' };

describe('incoming feeds', () => {
  let site;
  let token;
  let standIn;
  const sessions = {};
  let anna;
  let ebba;

  const get = async (url, init) => {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (!['ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      return fetch(url, init);
    }
  };
  const repository = () => `/repos/${site.name}/source`;
  const api = async (path, init = {}) => {
    const answer = await get(`${site.origin.git}/api/v1${path}`, { ...init, headers: { authorization: `token ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
    assert.ok(answer.ok, `${path}: ${answer.status}`);
    const text = await answer.text();
    return text ? JSON.parse(text) : null;
  };
  const fileOf = async (path) => {
    const { content, sha } = await api(`${repository()}/contents/${path}`);
    return { text: Buffer.from(content, 'base64').toString(), sha };
  };
  const filesIn = async (folder) => (await api(`${repository()}/contents/${folder}`)).filter(({ name }) => name.endsWith('.md')).map(({ path }) => path);
  // The source file of the post made from an item, by its ID, or null.
  const postOf = async (item, folder = 'articles') => {
    for (const path of await filesIn(folder)) {
      if ((await fileOf(path)).text.includes(`"item":"${item}"`)) return path;
    }
    return null;
  };
  // A push from outside Sveltia, as `login`, of a file made or changed.
  const pushAs = async (login, path, change) => {
    const held = await get(`${site.origin.git}/api/v1${repository()}/contents/${path}`, { headers: { authorization: `token ${token}` } });
    const { content, sha } = held.ok ? await held.json() : { content: '', sha: undefined };
    const text = change(Buffer.from(content, 'base64').toString());
    await api(`${repository()}/contents/${path}?sudo=${login}`, { method: sha ? 'PUT' : 'POST', body: JSON.stringify({ content: Buffer.from(text).toString('base64'), ...(sha ? { sha } : {}), message: 'A push from outside the editor' }) });
  };
  const credentialOf = (login) => `token ${JSON.parse(sessions[login]).token}`;
  const service = async (path, login = 'anna') => {
    const answer = await get(`${site.origin.admin}${path}`, { headers: { authorization: credentialOf(login) } });
    assert.equal(answer.status, 200, path);
    return answer.json();
  };
  const until = async (what, check, within = 240_000) => {
    const deadline = Date.now() + within;
    for (;;) {
      const found = await check();
      if (found) return found;
      assert.ok(Date.now() < deadline, `waited in vain for ${what}`);
      await new Promise((go) => setTimeout(go, 2000));
    }
  };
  const pageText = async (address) => {
    const answer = await get(`${site.origin.site}${address}`);
    return answer.status === 200 ? answer.text() : null;
  };
  const serve = (name, text) => writeFileSync(join(standIn, 'feeds', name), text);
  const reads = () => (existsSync(join(standIn, 'asked.log')) ? readFileSync(join(standIn, 'asked.log'), 'utf8').split('\n').filter(Boolean).length : 0);
  // The next read of each feed, once it has begun after this moment, and the build after it.
  const nextRead = async () => {
    const from = reads();
    await until('the next read of the feeds', () => reads() >= from + 2);
    // The read's commit, and the build it asks for, a moment after.
    await new Promise((go) => setTimeout(go, 5000));
  };
  const go = (page, hash) => page.evaluate((to) => {
    window.location.hash = to;
  }, hash);
  const pageOf = async (login) => {
    const session = await openEditor('chromium', site);
    session.page.on('dialog', (dialog) => {
      session.dialogs = [...(session.dialogs ?? []), dialog.message()];
      return dialog.accept();
    });
    await session.page.evaluate(([key, user]) => localStorage.setItem(key, user), [USER, sessions[login]]);
    await session.page.reload();
    await session.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
    return session;
  };

  before(async () => {
    site = await makeSite({ name: `accept-feeds-${process.pid}`, people: 'anna:admin,ebba:editor' });
    // The stand-in, in the project's own network, where the service for editors reaches it.
    standIn = join(site.directory, 'feed-stand-in');
    mkdirSync(join(standIn, 'feeds'), { recursive: true });
    copyFileSync(join(core, 'acceptance/lib/feed-stand-in.mjs'), join(standIn, 'serve.mjs'));
    writeFileSync(join(standIn, 'asked.log'), '');
    writeFileSync(join(site.directory, 'compose.override.yaml'), [
      'services:',
      '  feed-stand-in:',
      `    image: node:${version('NODE_RELEASE')}-bookworm-slim@sha256:${version('NODE_DIGEST')}`,
      '    command: ["node", "/stand-in/serve.mjs"]',
      '    volumes:',
      '      - ./feed-stand-in:/stand-in',
      // On the project's own network, whose addresses are private, which the feed reader reads
      // from only where the setting names the host.
      '  editors:',
      '    environment:',
      '      KONZILO_FEED_PRIVATE_HOSTS: feed-stand-in',
      '',
    ].join('\n'));
    serve('news.rss', rss(B, A));
    serve('news.atom', atom(A));
    site.up('--build');
    token = site.state('instance-token');
    for (const login of ['anna', 'ebba']) {
      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site, seeded(site, login));
        await session.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
        sessions[login] = await session.page.evaluate((key) => localStorage.getItem(key), USER);
      } finally {
        await session.browser.close();
      }
    }
    anna = await pageOf('anna');
    ebba = await pageOf('ebba');
  }, { timeout: 1_200_000 });

  after(async () => {
    await anna?.browser.close();
    await ebba?.browser.close();
    site?.remove();
  });

  test('a site with no feeds reads none', async () => {
    await new Promise((go) => setTimeout(go, 65_000));
    assert.equal(reads(), 0);
    assert.deepEqual((await service('/_konzilo/status')).feeds, []);
  }, { timeout: 120_000 });

  test('an Admin adds an RSS and an Atom feed, which an Editor cannot, and their items make no posts', async () => {
    await go(ebba.page, '#/pages/feeds');
    await ebba.page.getByText('Only an Admin may see and change the feeds the site reads.').waitFor({ timeout: 30_000 });

    const before = { articles: await filesIn('articles'), pages: await filesIn('pages') };
    await go(anna.page, '#/pages/feeds');
    const adding = anna.page.getByRole('group', { name: 'Add a feed' });
    for (const [address, type] of [[RSS, 'Article'], [ATOM, 'Page']]) {
      await adding.getByLabel('Address').fill(address);
      await adding.getByLabel('Type of post').selectOption({ label: type });
      await adding.getByLabel('Minutes between reads').fill('1');
      await adding.getByRole('button', { name: 'Add the feed' }).click();
      await anna.page.getByRole('group', { name: address }).waitFor({ timeout: 30_000 });
    }
    await until('the first reads', () => reads() >= 2);
    await until('both feeds read', async () => (await service('/_konzilo/feeds')).feeds.every(({ readAt }) => readAt !== null));
    assert.deepEqual({ articles: await filesIn('articles'), pages: await filesIn('pages') }, before, 'no post of what the feeds held');
  }, { timeout: 300_000 });

  test('a new item in each becomes a published post, saved by the feed reader, and a post waiting for an article goes out with it', async () => {
    const waiting = 'pages/aaaa0000feed.md';
    await pushAs('ebba', waiting, () => `---\ntitle: "After the release"\nslug: "after-the-release"\nstatus: scheduled\ntriggers: [[{"published":[[{"type":"article"}]],"since":"${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}"}]]\n---\n\nIt waits for an article.\n`);
    await until('the post that waits', async () => (await service('/_konzilo/status')).posts.find(({ file }) => file === waiting)?.status === 'scheduled');

    serve('news.rss', rss(C, B, A));
    serve('news.atom', atom({ id: 'n1', title: 'Notice one', date: hoursAgo(1) }, A));
    const path = await until('the post of the new item', () => postOf(C.id));
    const { text } = await fileOf(path);
    assert.match(text, /^title: "Harbour opens"$/m);
    assert.match(text, /^status: published$/m);
    assert.match(text, /^originalAddress: "https:\/\/news\.example\.com\/release-c"$/m);
    assert.ok(await until('the post of the new entry', () => postOf('urn:notice:n1', 'pages')));

    const { revisions } = await service(`/_konzilo/revisions?path=${encodeURIComponent(path)}`);
    assert.equal(revisions[0].account?.login, 'feed-reader', 'the History names the feed reader');

    const shown = await until('the post on the site', () => pageText('/harbour-opens/'));
    assert.match(shown, /The text of Harbour opens\./);
    assert.ok(await pageText('/pages/after-the-release/'), 'the post that waited went out with it');
    assert.ok(await pageText('/pages/notice-one/'));
  }, { timeout: 600_000 });

  test('read again, a feed makes no second post, and a corrected item corrects its post at its address', async () => {
    const posts = await filesIn('articles');
    await nextRead();
    assert.deepEqual(await filesIn('articles'), posts);

    // The item stays corrected in every later read.
    C.title = 'Harbour opens at dawn';
    serve('news.rss', rss(C, B, A));
    await until('the corrected post on the site', async () => /Harbour opens at dawn/.test(await pageText('/harbour-opens/') ?? ''));
    assert.deepEqual(await filesIn('articles'), posts, 'the same post');
  }, { timeout: 600_000 });

  test('a feed\'s post opens read-only to an Admin and an Editor, and the build refuses an Editor\'s change pushed outside the editor', async () => {
    const path = await postOf(C.id);
    const id = path.split('/').at(-1).replace('.md', '');
    for (const { page } of [anna, ebba]) {
      await go(page, `#/collections/articles/entries/${id}`);
      await page.getByText('This post is made from a feed, and only the feed changes it.').first().waitFor({ timeout: 30_000 });
      assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).count(), 0, 'no Save');
      await go(page, '#/collections/articles');
    }

    await pushAs('ebba', path, (text) => text.replace(/^title: .*$/m, 'title: "Changed by an Editor"'));
    const refused = await until('the refusal', async () => (await service('/_konzilo/status')).posts.find(({ file }) => file === path)?.refusals?.find(({ name }) => name === 'refusal.feed-post'));
    assert.equal(refused.values.by, 'ebba');
    assert.match(await pageText('/harbour-opens/'), /Harbour opens at dawn/, 'visitors still see the feed\'s version');
  }, { timeout: 300_000 });

  test('an item withdrawn while older ones remain deletes its post, which the Deleted page offers no Restore of, and one that fell out of a feed of its latest three stays', async () => {
    serve('news.rss', rss(E, D, C, B, A));
    const withdrawn = await until('the post of a later item', () => postOf(D.id));
    await until('it on the site', () => pageText('/quay-closes/'));

    // The feed now keeps its latest three: D is gone while C, older, remains.
    serve('news.rss', rss(F, E, C));
    await until('the withdrawn post gone from the source', async () => !(await filesIn('articles')).includes(withdrawn));
    await until('the withdrawn post gone from the site', async () => (await pageText('/quay-closes/')) === null);

    await go(anna.page, '#/pages/deleted');
    const row = anna.page.locator(`tr[data-path="${withdrawn}"]`);
    await row.waitFor({ timeout: 60_000 });
    assert.equal(await row.getByRole('cell').nth(2).textContent(), 'feed-reader');
    await row.getByRole('button').click();
    const entry = anna.page.getByRole('article');
    await entry.getByText('only the feed brings it back').waitFor({ timeout: 30_000 });
    assert.equal(await entry.getByRole('button', { name: 'Restore', exact: true }).count(), 0);
    await go(anna.page, '#/collections/articles');

    // A fourth arrives, and C, older than every item the feed holds, falls out.
    serve('news.rss', rss(G, F, E));
    await until('the post of the fourth', () => postOf(G.id));
    await nextRead();
    assert.ok(await postOf(C.id), 'the post of the item that fell out stays');
    assert.match(await pageText('/harbour-opens/'), /Harbour opens at dawn/);
  }, { timeout: 900_000 });

  test('a read that fails, and a feed of no items, delete nothing, and a failure shows on the Publishing page until a read succeeds', async () => {
    const posts = await filesIn('articles');
    serve('news.rss', 'STATUS 500\n');
    await go(ebba.page, '#/pages/publishing');
    // The page asks how publishing stands again by itself, every 15 seconds.
    const failure = ebba.page.getByText(`The feed ${RSS} could not be read at`);
    await failure.waitFor({ timeout: 240_000 });
    assert.match(await failure.textContent(), /it answered with the status 500/);

    serve('news.rss', rss());
    await until('the failure cleared', async () => (await service('/_konzilo/status')).feeds.length === 0);
    await nextRead();
    assert.deepEqual(await filesIn('articles'), posts);
  }, { timeout: 600_000 });

  test('removing a feed asks first, and leaves its posts published, as posts an Editor may change', async () => {
    const path = await postOf(G.id);
    const id = path.split('/').at(-1).replace('.md', '');
    await go(anna.page, '#/pages/feeds');
    const group = anna.page.getByRole('group', { name: RSS });
    await group.waitFor({ timeout: 30_000 });
    await group.getByRole('button', { name: 'Remove' }).click();
    await anna.page.getByText('Removed. Its posts are posts like any other now.').waitFor({ timeout: 60_000 });
    assert.match(anna.dialogs.at(-1), /Its posts stay published, and become posts like any other/);
    const { text } = await fileOf(path);
    assert.doesNotMatch(text, /^feed: /m);
    assert.match(text, /^originalAddress: /m);

    await ebba.page.goto(`${site.origin.admin}/#/collections/articles`);
    await ebba.page.reload();
    await ebba.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
    await go(ebba.page, `#/collections/articles/entries/${id}`);
    const box = ebba.page.getByRole('textbox', { name: 'Working name' });
    await box.waitFor({ timeout: 30_000 });
    // Read-only only while the service is asked for the form's lock, which it now gives.
    await until('the form to edit', () => box.isEditable(), 30_000);
    assert.equal(await ebba.page.getByText('This post is made from a feed').count(), 0);
    assert.ok(await pageText('/market-day/'), 'still published');
  }, { timeout: 300_000 });

  test('asks nothing outside this copy of the site, and breaks no policy', () => {
    for (const session of [anna, ebba]) {
      assert.deepEqual(session.seen.outside, []);
      assert.deepEqual(session.seen.refused, []);
    }
  });
});
