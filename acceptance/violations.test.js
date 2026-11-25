// The policy's violations (ADR 0051), in a site in Compose: in each browser engine, a page of the
// site's own that loads what its policy does not allow has the browser report it, by the policy's
// `report-uri` or `report-to`, as that engine does; the service counts it by the page's path
// without its query, the directive and the origin blocked; and an Admin finds it on the editor's
// *Policy violations* page, which an Editor is told is an Admin's, and the service answers no one
// signed out.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ENGINES, openEditor, seeded, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const USER = 'sveltia-cms.user';
const PAGE = '/pages/contact/';

// What each engine's page loads that its policy blocks, an image from an origin of its own.
const blockedIn = (engine) => `https://${engine}.blocked.example`;

describe('the policy\'s violations', () => {
  let site;
  let token;
  const sessions = {};

  const get = async (url, init) => {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (!['ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      return fetch(url, init);
    }
  };

  // The counts, as the instance's administrator reads them, who may use the Admin's pages.
  const counts = async () => {
    const answer = await get(`${site.origin.admin}/_konzilo/violations`, { headers: { authorization: `token ${token}` } });
    assert.equal(answer.status, 200);
    return answer.json();
  };
  // The entry of what `engine`'s page had blocked, once it is counted, or null when the time is up.
  const countedFrom = async (engine, { within = 150_000 } = {}) => {
    const deadline = Date.now() + within;
    for (;;) {
      const found = (await counts()).violations.find(({ blocked }) => blocked === blockedIn(engine));
      if (found || Date.now() > deadline) return found ?? null;
      await new Promise((go) => setTimeout(go, 1000));
    }
  };

  const pageOf = async (login) => {
    const session = await openEditor('chromium', site);
    await session.page.evaluate(([key, user]) => localStorage.setItem(key, user), [USER, sessions[login]]);
    await session.page.reload();
    await session.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
    await session.page.evaluate(() => {
      window.location.hash = '#/pages/violations';
    });
    return session;
  };

  before(async () => {
    site = await makeSite({ name: `accept-violations-${process.pid}`, people: 'anna:admin,ebba:editor' });
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
  }, { timeout: 1_200_000 });

  after(() => site?.remove());

  for (const engine of Object.keys(ENGINES)) {
    test(`are reported by ${engine} from a page of the site's own, and counted by its path, the directive and the origin blocked`, async () => {
      // Chromium sends what `report-to` names by the Reporting API, a minute later unless told
      // otherwise, and only while it runs.
      const browser = await ENGINES[engine].launch(engine === 'chromium' ? { args: ['--short-reporting-delay'] } : {});
      try {
        const context = await browser.newContext({ locale: 'en-GB' });
        const outside = [];
        await context.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.hostname === 'localhost') return route.continue();
          outside.push(url.href);
          return route.abort();
        });
        const page = await context.newPage();
        await page.goto(`${site.origin.site}${PAGE}?from=${engine}`);
        await page.evaluate((source) => {
          const image = document.createElement('img');
          image.src = `${source}/pixel.gif?visitor=4711`;
          image.alt = '';
          document.body.append(image);
        }, blockedIn(engine));
        const found = await countedFrom(engine);
        assert.ok(found, `${engine} reported nothing that was counted`);
        assert.equal(found.page, PAGE, 'the path without its query');
        assert.equal(found.directive, 'img-src');
        assert.ok(found.count >= 1);
        assert.deepEqual(outside, [], 'the policy blocked it before it was asked for');
      } finally {
        await browser.close();
      }
    }, { timeout: 300_000 });
  }

  test('shows what each engine reported to an Admin on the Policy violations page', async () => {
    const anna = await pageOf('anna');
    try {
      const table = anna.page.getByRole('table', { name: 'Blocked on the site\'s pages, the most recent first' });
      await table.waitFor({ timeout: 30_000 });
      for (const engine of Object.keys(ENGINES)) {
        const row = table.getByRole('row').filter({ hasText: blockedIn(engine) });
        assert.equal(await row.count(), 1, engine);
        assert.equal(await row.getByRole('rowheader').textContent(), PAGE);
        const [directive, blocked, times] = await row.getByRole('cell').allTextContents();
        assert.deepEqual([directive, blocked], ['img-src', blockedIn(engine)]);
        assert.match(times, /^\d+$/);
      }
      assert.deepEqual(anna.seen.outside, []);
      assert.deepEqual(anna.seen.refused, []);
      assert.deepEqual(anna.seen.errors, []);
    } finally {
      await anna.browser.close();
    }
  });

  test('tells an Editor that the page is an Admin\'s, and answers no one signed out', async () => {
    const ebba = await pageOf('ebba');
    try {
      await ebba.page.getByText('Only an Admin may see what the site\'s Content Security Policy has blocked.').waitFor({ timeout: 30_000 });
      assert.equal(await ebba.page.getByRole('table').count(), 0);
      assert.deepEqual(ebba.seen.outside, []);
      assert.deepEqual(ebba.seen.refused, []);
    } finally {
      await ebba.browser.close();
    }
    const answer = await get(`${site.origin.admin}/_konzilo/violations`);
    await answer.arrayBuffer();
    assert.equal(answer.status, 401);
  });
});
