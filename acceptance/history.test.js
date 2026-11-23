// A form's revisions (ADR 0074), in a site in Compose, in each browser engine, with two people
// signed in, an Admin and an Editor: the form's History lists its revisions newest first, each with
// its moment, the account that pushed it as Forgejo recorded it, not as the commit says, and a
// post's status; two revisions compare field by field, the body block by block, by the keyboard;
// a revision is restored into the form as unsaved changes, after asking where it replaces some,
// with the status as it was; saving it makes a new revision and leaves every earlier one; and the
// refusal of a save older than the latest offers to compare the latest save with the form. That an
// Editor sees the history of an Admin's forms and restores nothing there is held in one engine.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { ENGINES, openEditor, seeded, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const USER = 'sveltia-cms.user';

describe('a form\'s revisions', () => {
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
  // A push from outside Sveltia, as `login`, of the file with `change` made to it, by a commit that
  // names someone else as its author.
  const pushAs = async (login, path, change) => {
    const { text, sha } = await fileOf(path);
    await api(`${repository()}/contents/${path}?sudo=${login}`, {
      method: 'PUT',
      body: JSON.stringify({ content: Buffer.from(change(text)).toString('base64'), sha, message: 'A push from outside the editor', author: { name: 'Someone Else', email: 'someone@example.invalid' } }),
    });
  };
  const commitsOf = async (path) => (await api(`${repository()}/commits?path=${encodeURIComponent(path)}&limit=50&stat=false&files=false&verification=false`)).map(({ sha }) => sha);
  const fileHolding = async (path, words, { within = 30_000 } = {}) => {
    const deadline = Date.now() + within;
    for (;;) {
      const { text } = await fileOf(path);
      if (text.includes(words) || Date.now() > deadline) return text;
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
  const openForm = async (page, form, ready = { role: 'textbox', name: 'Working name' }) => {
    await go(page, `#/collections/${form}`);
    await page.getByRole(ready.role, { name: ready.name }).first().waitFor({ timeout: 30_000 });
  };
  const toList = async (page) => {
    await go(page, '#/collections/articles');
    await page.getByRole('textbox', { name: 'Working name' }).waitFor({ state: 'detached' });
  };
  // The form's History, in the panel beside it, once it has read the revisions.
  const historyOf = async (page) => {
    const panel = page.locator('.konzilo-history');
    if (await panel.count() === 0) await page.locator('.sidebar [aria-label="History"]').first().click();
    await panel.locator('.konzilo-history-list').waitFor({ timeout: 30_000 });
    return panel;
  };
  const revisionsIn = (panel) => panel.locator('.konzilo-history-list > li');
  const saveButton = (page) => page.getByRole('button', { name: 'Save', exact: true });
  const comparison = (page) => page.getByRole('dialog', { name: 'Compare revisions' });

  before(async () => {
    site = await makeSite({ name: `accept-history-${process.pid}`, people: 'anna:admin,ebba:editor' });
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
      const article = (n) => articles[(index * 2 + n) % articles.length];

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

      test('lists the revisions with the account that pushed each, compares two by the keyboard, and restores one, which a save keeps as a new revision', async () => {
        const name = article(0);
        const path = `articles/${name}.md`;
        const status = /^status: "?(.*?)"?$/m.exec((await fileOf(path)).text)?.[1];
        // Two pushes by ebba, whose commits name someone else: the first an old title and a link,
        // the second a new title and the link's target alone changed.
        await pushAs('ebba', path, (text) => `${text.replace(/^title: .*$/m, `title: Old title ${engine}`).trimEnd()}\n\nSee [the meadow](/aaaaaaaaaaaa/) here.\n`);
        await pushAs('ebba', path, (text) => text.replace(/^title: .*$/m, `title: New title ${engine}`).replace('/aaaaaaaaaaaa/', '/bbbbbbbbbbbb/'));
        const [newest, older] = await commitsOf(path);

        await openForm(anna.page, `articles/entries/${name}`);
        const panel = await historyOf(anna.page);
        const revisions = revisionsIn(panel);
        await anna.page.waitForFunction(() => document.querySelectorAll('.konzilo-history-list > li').length >= 3);
        assert.equal(await revisions.nth(0).getAttribute('data-commit'), newest, 'newest first');
        assert.equal(await revisions.nth(1).getAttribute('data-commit'), older);
        for (const at of [0, 1]) {
          const words = await revisions.nth(at).textContent();
          assert.match(words, /Saved on \d{1,2} \w+ \d{4} at \d{2}:\d{2}/);
          assert.match(words, /by ebba/, 'the account that pushed it');
          assert.doesNotMatch(words, /Someone Else/, 'not the author the commit names');
          if (status) assert.match(words, /Status: \w+/);
        }

        // Compare the older revision by the keyboard, then the two revisions with each other.
        const compare = revisions.nth(1).getByRole('button', { name: /^Compare the revision saved on .* with the form$/ });
        await compare.focus();
        await anna.page.keyboard.press('Enter');
        const dialog = comparison(anna.page);
        await dialog.waitFor();
        assert.equal(await dialog.evaluate((element) => element.contains(document.activeElement)), true, 'the focus moves into the dialog');
        const title = dialog.locator('.konzilo-history-field').filter({ has: anna.page.getByRole('heading', { name: 'Name and address › Working name' }) });
        await title.waitFor();
        assert.match(await title.locator('del').first().textContent(), /Removed:\s*Old/);
        assert.match(await title.locator('ins').first().textContent(), /Added:\s*New/);
        await dialog.getByLabel('From').selectOption(older);
        await dialog.getByLabel('To').selectOption(newest);
        const form = dialog.locator('.konzilo-history-block[data-change="form"]');
        await form.waitFor({ timeout: 15_000 });
        const shown = await form.locator('pre').allTextContents();
        assert.ok(shown[0].includes('/aaaaaaaaaaaa/') && shown[1].includes('/bbbbbbbbbbbb/'), 'a link\'s target alone changed, shown both ways');
        assert.match(await dialog.locator('details > summary').first().textContent(), /^Fields alike: \d+$/);
        await anna.page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });

        // Restore the older revision over unsaved changes, after saying yes to replacing them.
        const field = anna.page.getByRole('textbox', { name: 'Working name' });
        await field.fill(`Unsaved by anna in ${engine}`);
        await revisions.nth(1).getByRole('button', { name: /^Restore the revision saved on / }).click();
        const question = anna.page.getByRole('dialog', { name: 'Replace your unsaved changes?' });
        await question.waitFor();
        await question.getByRole('button', { name: 'Replace them' }).click();
        await anna.page.waitForFunction((words) => [...document.querySelectorAll('input')].some((input) => input.value === words), `Old title ${engine}`, { timeout: 15_000 });
        await panel.getByText(/^The revision saved on .* is in the form/).waitFor();
        await panel.getByText(/^Your unsaved changes, replaced on /).waitFor();

        await saveButton(anna.page).click();
        const saved = await fileHolding(path, `title: Old title ${engine}`);
        assert.match(saved, new RegExp(`title: Old title ${engine}`));
        assert.match(saved, /\/aaaaaaaaaaaa\//, 'the body restored too');
        if (status) assert.match(saved, new RegExp(`^status: "?${status}"?$`, 'm'), 'the status as it was');
        const after = await commitsOf(path);
        assert.equal(after[1], newest, 'the save a new revision');
        assert.equal(after[2], older, 'every earlier one left');
        await anna.page.waitForFunction((commit) => document.querySelector('.konzilo-history-list > li[data-commit]')?.dataset.commit === commit, after[0], { timeout: 30_000 });
        assert.match(await panel.locator('.konzilo-history-list > li[data-commit]').first().textContent(), /by anna/);
        await toList(anna.page);
      });

      test('offers, at the refusal of a save older than the latest, to compare the latest save with the form', async () => {
        const name = article(1);
        const path = `articles/${name}.md`;
        await openForm(anna.page, `articles/entries/${name}`);
        await anna.page.getByRole('textbox', { name: 'Working name' }).fill(`Anna's words in ${engine}`);
        await pushAs('ebba', path, (text) => text.replace(/^title: .*$/m, `title: Ebba's words in ${engine}`));
        await saveButton(anna.page).click();

        const refusal = anna.page.getByRole('alertdialog').filter({ hasText: 'Reload' });
        await refusal.waitFor({ timeout: 30_000 });
        await refusal.getByRole('button', { name: 'Compare the latest save with your changes' }).click();
        const dialog = comparison(anna.page);
        await dialog.waitFor();
        assert.match(await dialog.getByLabel('From').locator('option:checked').textContent(), /^The latest save, by ebba on /);
        const title = dialog.locator('.konzilo-history-field').filter({ has: anna.page.getByRole('heading', { name: 'Name and address › Working name' }) });
        assert.match(await title.textContent(), /Ebba's/);
        assert.match(await title.textContent(), /Anna's/);
        await dialog.getByRole('button', { name: 'Close' }).click();
        await refusal.getByRole('button', { name: 'Reload' }).click();
        await toList(anna.page);
      });

      if (engine !== 'chromium') return;

      test('shows an Editor the history of the site settings and a menu, and restores nothing there', async () => {
        for (const form of ['settings/entries/settings', 'menus/entries/main']) {
          await go(ebba.page, `#/collections/${form}`);
          await ebba.page.locator('.konzilo-lock-line').filter({ hasText: 'This form is for Admins.' }).waitFor({ timeout: 30_000 });
          const panel = await historyOf(ebba.page);
          await revisionsIn(panel).first().waitFor();
          await panel.getByText('You can compare revisions here, but restore one only in a form you can change.').waitFor();
          assert.equal(await panel.getByRole('button', { name: /^Restore/ }).count(), 0);
          await revisionsIn(panel).first().getByRole('button', { name: /^Compare/ }).click();
          const dialog = comparison(ebba.page);
          await dialog.waitFor();
          assert.equal(await dialog.getByRole('button', { name: /^Restore/ }).count(), 0);
          await dialog.getByRole('button', { name: 'Close' }).click();
        }
      });

      test('asks nothing outside this copy of the site, and breaks no policy', () => {
        for (const session of [anna, ebba]) {
          assert.deepEqual(session.seen.outside, []);
          assert.deepEqual(session.seen.refused, []);
        }
      });
    });
  }
});
