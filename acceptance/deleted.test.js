// The *Deleted* page (ADR 0077), in a site in Compose, in each browser engine, with two people
// signed in, an Admin and an Editor: a post the Editor deletes in the editor is listed with its
// name, its type, its moment and the account that pushed the deletion, newest first and by type;
// it opens read-only at its last revision, with its earlier revisions to read and compare by the
// keyboard; and *Restore* saves it again as a draft under its own ID and opens its form, whose
// History holds its revisions from before the deletion, the deletion among them. That the page's
// list is the service's, which answers no one signed out, is held in one engine.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { ENGINES, openEditor, seeded, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const USER = 'sveltia-cms.user';

describe('the Deleted page', () => {
  let site;
  let token;
  const sessions = {};
  let articles;

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
  // A push from outside Sveltia, as `login`, of the file with `change` made to it.
  const pushAs = async (login, path, change) => {
    const { text, sha } = await fileOf(path);
    await api(`${repository()}/contents/${path}?sudo=${login}`, {
      method: 'PUT',
      body: JSON.stringify({ content: Buffer.from(change(text)).toString('base64'), sha, message: 'A push from outside the editor' }),
    });
  };
  const commitsOf = async (path) => (await api(`${repository()}/commits?path=${encodeURIComponent(path)}&limit=50&stat=false&files=false&verification=false`)).map(({ sha }) => sha);
  const goneFrom = async (path, { within = 30_000 } = {}) => {
    const deadline = Date.now() + within;
    for (;;) {
      const answer = await get(`${site.origin.git}/api/v1${repository()}/contents/${path}`, { headers: { authorization: `token ${token}` } });
      await answer.arrayBuffer();
      if (answer.status === 404) return;
      assert.ok(Date.now() < deadline, `${path} is still there`);
      await new Promise((go) => setTimeout(go, 500));
    }
  };

  const pageOf = async (engine, login) => {
    const session = await openEditor(engine, site);
    session.page.on('dialog', (dialog) => dialog.accept());
    await session.page.evaluate(([key, user]) => localStorage.setItem(key, user), [USER, sessions[login]]);
    await session.page.reload();
    await session.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
    return session;
  };
  const go = (page, hash) => page.evaluate((to) => {
    window.location.hash = to;
  }, hash);
  const toList = async (page) => {
    await go(page, '#/collections/articles');
    await page.getByRole('textbox', { name: 'Working name' }).waitFor({ state: 'detached' });
  };
  const historyOf = async (page) => {
    const panel = page.locator('.konzilo-history');
    if (await panel.count() === 0) await page.locator('.sidebar [aria-label="History"]').first().click();
    await panel.locator('.konzilo-history-list').waitFor({ timeout: 30_000 });
    return panel;
  };
  const workingName = (page) => page.getByRole('heading', { name: 'Name and address › Working name' });

  before(async () => {
    site = await makeSite({ name: `accept-deleted-${process.pid}`, people: 'anna:admin,ebba:editor' });
    site.up('--build');
    token = site.state('instance-token');
    articles = (await api(`${repository()}/contents/articles`)).filter(({ name }) => name.endsWith('.md')).map(({ name }) => name.replace(/\.md$/, ''));
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
    describe(engine, () => {
      let anna;
      let ebba;
      const index = Object.keys(ENGINES).indexOf(engine);
      const nameOf = () => articles[index % articles.length];

      before(async () => {
        anna = await pageOf(engine, 'anna');
        ebba = await pageOf(engine, 'ebba');
      }, { timeout: 300_000 });

      after(async () => {
        await anna?.browser.close();
        await ebba?.browser.close();
      });

      beforeEach(async () => {
        for (const { page } of [anna, ebba]) {
          await page.goto(`${site.origin.admin}/#/collections/articles`);
          await page.reload();
          await page.getByText('Articles').first().waitFor({ timeout: 60_000 });
        }
      });

      test('finds a post deleted in the editor, reads it with its revisions, and restores it as a draft under its own ID', async () => {
        const name = nameOf();
        const path = `articles/${name}.md`;
        // Two saves by ebba before the deletion: an earlier title, then the last.
        await pushAs('ebba', path, (text) => text.replace(/^title: .*$/m, `title: Earlier ${engine}`));
        await pushAs('ebba', path, (text) => text.replace(/^title: .*$/m, `title: Deleted ${engine}`));
        await ebba.page.reload();
        await ebba.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
        const row = ebba.page.locator(`[aria-label^="Deleted ${engine}"]`).first();
        await row.waitFor({ timeout: 30_000 });
        await row.getByRole('checkbox').check();
        await ebba.page.getByRole('button', { name: 'Delete Selected Entry' }).click();
        await ebba.page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await goneFrom(path);
        const [deletion, last, earlier] = await commitsOf(path);

        // Listed, newest first, with its name, its type, when and by whom, and by type.
        await go(anna.page, '#/pages/deleted');
        const page = anna.page.locator('.konzilo-deleted');
        const listed = page.locator(`tr[data-path="${path}"]`);
        await listed.waitFor({ timeout: 30_000 });
        assert.equal(await page.locator('tbody tr').first().getAttribute('data-path'), path, 'the newest deletion first');
        assert.equal(await listed.getByRole('rowheader').textContent(), `Deleted ${engine}`);
        const [type, when, who] = await listed.getByRole('cell').allTextContents();
        assert.equal(type, 'Articles');
        assert.match(when, /\d{1,2} \w+ \d{4}/);
        assert.equal(who, 'ebba', 'the account that pushed the deletion');
        await page.getByLabel('Type').selectOption({ label: 'Topics' });
        await page.getByText('Nothing of this type has been deleted.').waitFor({ timeout: 30_000 });
        await page.getByLabel('Type').selectOption({ label: 'Articles' });
        await listed.waitFor({ timeout: 30_000 });

        // Read-only at its last revision, by the keyboard, with its revisions.
        await listed.getByRole('button', { name: `Deleted ${engine}` }).focus();
        await anna.page.keyboard.press('Enter');
        const entry = anna.page.getByRole('article', { name: `Deleted ${engine}` });
        await entry.waitFor();
        assert.match(await entry.textContent(), /Deleted on .* by ebba\./);
        assert.equal(await anna.page.evaluate(() => document.activeElement?.id), 'konzilo-deleted-title', 'the heading has the focus');
        const field = entry.locator('.konzilo-deleted-fields .konzilo-history-field').filter({ has: workingName(anna.page) });
        assert.match(await field.textContent(), new RegExp(`Deleted ${engine}`));
        assert.equal(await entry.getByRole('textbox').count(), 0, 'nothing to change');
        const revisions = entry.locator('.konzilo-history-list > li');
        await anna.page.waitForFunction(() => document.querySelectorAll('.konzilo-deleted .konzilo-history-list > li').length >= 3, null, { timeout: 30_000 });
        assert.equal(await revisions.nth(0).getAttribute('data-commit'), deletion);
        assert.match(await revisions.nth(0).textContent(), /The file was removed in this save\./);
        assert.match(await revisions.nth(0).textContent(), /by ebba/);
        assert.equal(await revisions.nth(1).getAttribute('data-commit'), last);
        assert.equal(await revisions.nth(2).getAttribute('data-commit'), earlier);

        // The earlier revision compared with the last, by the keyboard.
        await revisions.nth(2).getByRole('button', { name: /^Compare the revision saved on .* with the last one$/ }).focus();
        await anna.page.keyboard.press('Enter');
        const dialog = anna.page.getByRole('dialog', { name: 'Compare revisions' });
        await dialog.waitFor();
        const title = dialog.locator('.konzilo-history-field').filter({ has: workingName(anna.page) });
        assert.match(await title.textContent(), new RegExp(`Earlier ${engine}`));
        assert.match(await title.textContent(), new RegExp(`Deleted ${engine}`));
        assert.equal(await dialog.getByRole('button', { name: /^Restore/ }).count(), 0, 'restored from its form, once it is back');
        await anna.page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });

        // Restored as a draft, under its own ID, and its form opened.
        await entry.getByRole('button', { name: 'Restore', exact: true }).click();
        await anna.page.waitForURL(new RegExp(`#/collections/articles/entries/${name}$`), { timeout: 30_000 });
        const box = anna.page.getByRole('textbox', { name: 'Working name' });
        await box.waitFor({ timeout: 30_000 });
        assert.equal(await box.inputValue(), `Deleted ${engine}`);
        const restored = (await fileOf(path)).text;
        assert.match(restored, /^status: "?draft"?$/m, 'a draft');
        assert.match(restored, new RegExp(`^title: Deleted ${engine}$`, 'm'));
        const now = await commitsOf(path);
        assert.deepEqual(now.slice(1, 4), [deletion, last, earlier], 'its revisions follow it back');

        // Its form's History shows its whole history, the deletion and the restore among them.
        const panel = await historyOf(anna.page);
        await anna.page.waitForFunction((commit) => [...document.querySelectorAll('.konzilo-history .konzilo-history-list > li')].some((item) => item.dataset.commit === commit), earlier, { timeout: 30_000 });
        assert.match(await panel.locator(`li[data-commit="${now[0]}"]`).textContent(), /by anna/);
        assert.match(await panel.locator(`li[data-commit="${deletion}"]`).textContent(), /The file was removed in this save\./);

        // And the page lists it no more.
        await toList(anna.page);
        await go(anna.page, '#/pages/deleted');
        await page.locator('table, .konzilo-deleted-state').first().waitFor({ timeout: 30_000 });
        await anna.page.waitForFunction(() => !document.querySelector('.konzilo-deleted-state[role="status"]')?.textContent.startsWith('Reading'), null, { timeout: 30_000 });
        assert.equal(await page.locator(`tr[data-path="${path}"]`).count(), 0);
      });

      if (engine === 'chromium') {
        test('lists nothing to anyone signed out', async () => {
          const answer = await get(`${site.origin.admin}/_konzilo/deleted`);
          await answer.arrayBuffer();
          assert.equal(answer.status, 401);
        });
      }

      test('asks nothing outside this copy of the site, and breaks no policy', () => {
        for (const session of [anna, ebba]) {
          assert.deepEqual(session.seen.outside, []);
          assert.deepEqual(session.seen.refused, []);
        }
      });
    });
  }
});
