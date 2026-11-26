// The log of addresses not found (ADR 0040), in a site in Compose, with two people signed in, an
// Admin and an Editor: real Caddy writes a line for each 404 the public host answers a GET or a
// HEAD, with the time and the path without its query alone, and the service folds the lines into
// its counts; a POST, a path over 300 characters and one below /_konzilo/ are not counted, and
// nothing of the visitor is in any file. On the *Addresses not found* page, in each browser engine,
// an Admin redirects one address, answers 410 at another and hides a third, each of which leaves
// the page at once, and the next build serves the two rules. An Editor, and anyone signed out, is
// told nothing.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ENGINES, openEditor, seeded, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const USER = 'sveltia-cms.user';
// What a visitor's browser sends that no file may hold.
const VISITOR = { 'User-Agent': 'the-visitors-browser/1.0', Referer: 'https://referrer.example/page' };

describe('the log of addresses not found', () => {
  let site;
  let token;
  const sessions = {};
  const credentials = {};

  const get = async (url, init) => {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (!['ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      return fetch(url, init);
    }
  };
  const asked = async (path, method = 'GET') => {
    const answer = await get(`${site.origin.site}${path}`, { method, redirect: 'manual', headers: VISITOR });
    await answer.arrayBuffer();
    return answer.status;
  };
  // The addresses not found as the service lists them to `login`: { status, body }.
  const listed = async (login) => {
    const answer = await get(`${site.origin.admin}/_konzilo/not-found`, { headers: login ? { authorization: credentials[login] } : {} });
    return { status: answer.status, body: await answer.json() };
  };
  const countOf = async (address) => (await listed('anna')).body.addresses.find((one) => one.address === address)?.count;
  // What the public host answers at an address, without following it, once it answers this.
  const answeredWith = async (address, status, { within = 90_000 } = {}) => {
    const deadline = Date.now() + within;
    for (;;) {
      const answer = await get(`${site.origin.site}${address}`, { redirect: 'manual' });
      await answer.arrayBuffer();
      if (answer.status === status || Date.now() > deadline) return answer;
      await new Promise((go) => setTimeout(go, 500));
    }
  };
  const commitsOf = async (path) => {
    const answer = await get(`${site.origin.git}/api/v1/repos/${site.name}/source/commits?path=${encodeURIComponent(path)}&limit=1&stat=false&files=false&verification=false`, { headers: { authorization: `token ${token}` } });
    return answer.json();
  };
  const fileIn = (service, path) => site.compose('exec', '-T', service, 'cat', path);

  const pageOf = async (engine, login) => {
    const session = await openEditor(engine, site);
    await session.page.evaluate(([key, user]) => localStorage.setItem(key, user), [USER, sessions[login]]);
    await session.page.reload();
    await session.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
    return session;
  };
  const go = (page, hash) => page.evaluate((to) => {
    window.location.hash = to;
  }, hash);

  before(async () => {
    site = await makeSite({ name: `accept-not-found-${process.pid}`, people: 'anna:admin,ebba:editor' });
    site.up('--build');
    token = site.state('instance-token');
    for (const login of ['anna', 'ebba']) {
      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site, seeded(site, login));
        await session.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
        sessions[login] = await session.page.evaluate((key) => localStorage.getItem(key), USER);
        credentials[login] = `token ${JSON.parse(sessions[login]).token}`;
      } finally {
        await session.browser.close();
      }
    }
  }, { timeout: 1_200_000 });

  after(() => site?.remove());

  test('counts each address the public host answers 404 to a GET or a HEAD, by its path without its query, and writes nothing of the visitor', async () => {
    const longest = `/${'a/'.repeat(149)}b`;
    const tooLong = `${longest}c`;
    assert.equal(longest.length, 300);
    for (let n = 0; n < 3; n++) assert.equal(await asked('/nowhere/?email=someone@example.com'), 404);
    assert.equal(await asked('/headed/', 'HEAD'), 404);
    assert.equal(await asked(longest), 404);
    assert.equal(await asked(tooLong), 404);
    assert.equal(await asked('/posted/', 'POST'), 404);
    await asked('/_konzilo/nothing-here');
    assert.equal(await asked('/'), 200);
    const { status, body } = await listed('anna');
    assert.equal(status, 200);
    const counts = Object.fromEntries(body.addresses.map(({ address, count }) => [address, count]));
    assert.deepEqual(counts, { '/nowhere/': 3, '/headed/': 1, [longest]: 1 });

    // The log holds the time and the path alone, and neither it nor the counts anything of the
    // visitor: no query, address, browser or referrer.
    const lines = fileIn('web', '/srv/not-found/not-found.log').split('\n').filter(Boolean).map((line) => JSON.parse(line));
    assert.ok(lines.length >= 5);
    for (const line of lines) assert.deepEqual(Object.keys(line).sort(), ['path', 'ts'], JSON.stringify(line));
    const kept = fileIn('editors', '/not-found/counts.json');
    for (const text of [fileIn('web', '/srv/not-found/not-found.log'), kept]) {
      for (const secret of ['email', 'someone', 'the-visitors-browser', 'referrer.example', '127.0.0.1', 'remote_ip', 'client_ip', 'posted', '_konzilo']) assert.ok(!text.includes(secret), secret);
    }
    // And the web server writes nothing else of a visitor's anywhere.
    const logs = site.compose('logs', '--no-color', 'web');
    for (const secret of ['someone@example.com', 'the-visitors-browser', 'referrer.example']) assert.ok(!logs.includes(secret), secret);
  });

  test('is an Admin\'s alone: an Editor is told only that, and anyone signed out nothing', async () => {
    assert.deepEqual(await listed('ebba'), { status: 403, body: {} });
    assert.deepEqual(await listed(), { status: 401, body: {} });
    const hidden = await get(`${site.origin.admin}/_konzilo/not-found/hidden`, { method: 'POST', headers: { authorization: credentials.ebba, 'content-type': 'application/json' }, body: JSON.stringify({ address: '/nowhere/' }) });
    assert.equal(hidden.status, 403);
    const ebba = await pageOf('chromium', 'ebba');
    try {
      await go(ebba.page, '#/pages/not-found');
      await ebba.page.getByText('Only an Admin may see the addresses visitors found nothing at').waitFor({ timeout: 30_000 });
      assert.equal(await ebba.page.locator('.konzilo-not-found table').count(), 0);
    } finally {
      await ebba.browser.close();
    }
  });

  for (const engine of Object.keys(ENGINES)) {
    describe(engine, () => {
      let anna;
      const moved = `/${engine}-moved/`;
      const gone = `/${engine}-gone/`;
      const hidden = `/${engine}-hidden/`;
      const target = `https://www.example.com/${engine}/`;

      before(async () => {
        for (const address of [moved, moved, gone, hidden]) assert.equal(await asked(address), 404);
        anna = await pageOf(engine, 'anna');
      }, { timeout: 300_000 });

      after(async () => {
        await anna?.browser.close();
      });

      test('redirects one address, answers 410 at another and hides a third, each leaving the page at once, and the next build serves the rules', async () => {
        const { page } = anna;
        await go(page, '#/pages/not-found');
        const table = page.getByRole('table', { name: 'Addresses not found, most asked first' });
        const row = (address) => table.locator(`tr[data-address="${address}"]`);
        await row(moved).waitFor({ timeout: 30_000 });
        const [count, last] = await row(moved).getByRole('cell').allTextContents();
        assert.equal(count, '2');
        assert.match(last, /\d{1,2} \w+ \d{4}/);

        // Redirect…: a target asked for, and a rule the site would refuse told of and not saved.
        await row(moved).getByRole('button', { name: `Redirect ${moved}…` }).click();
        const field = page.getByLabel(`Redirect ${moved} to`);
        await field.fill('no-slash');
        await field.press('Enter');
        await page.getByRole('alert').filter({ hasText: /no-slash/ }).waitFor({ timeout: 30_000 });
        await field.fill(target);
        await field.press('Enter');
        await page.getByRole('status').filter({ hasText: `The rule is saved: ${moved} leads to ${target}` }).waitFor({ timeout: 30_000 });
        await row(moved).waitFor({ state: 'detached' });

        await row(gone).getByRole('button', { name: `Answer 410 at ${gone}` }).click();
        await page.getByRole('status').filter({ hasText: `The rule is saved: ${gone} answers` }).waitFor({ timeout: 30_000 });
        await row(gone).waitFor({ state: 'detached' });

        await row(hidden).getByRole('button', { name: `Hide ${hidden}` }).click();
        await page.getByRole('status').filter({ hasText: `${hidden} is hidden.` }).waitFor({ timeout: 30_000 });
        await row(hidden).waitFor({ state: 'detached' });

        // Each rule is the Admin's own save of the site's rules, which the next build serves.
        const [latest] = await commitsOf('redirects.json');
        assert.equal(latest.author?.login, 'anna');
        const redirected = await answeredWith(moved, 301);
        assert.equal(redirected.status, 301);
        assert.equal(redirected.headers.get('location'), target);
        assert.equal((await answeredWith(gone, 410)).status, 410);

        // A hidden address goes on being counted, off the page; and the page lists none of the three.
        assert.equal(await asked(hidden), 404);
        assert.equal((await listed('anna')).body.addresses.some(({ address }) => [moved, gone, hidden].includes(address)), false);
        assert.equal(JSON.parse(fileIn('editors', '/not-found/counts.json')).addresses[hidden].count, 2);
        assert.equal(await countOf(hidden), undefined);
      });

      test('asks nothing outside this copy of the site, and breaks no policy', () => {
        assert.deepEqual(anna.seen.outside, []);
        assert.deepEqual(anna.seen.refused, []);
      });
    });
  }
});
