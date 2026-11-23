// A form locked to the tab that has it open, and a save older than the latest refused (ADR 0073),
// in a site in Compose, in each browser engine, with two people signed in at once, an Admin and an
// Editor: the question where another tab holds a form, the read-only state, the takeover and the
// notice of it, the form taken back, the mark in the list, the refusal of a save from a form older
// than a push, naming the account that pushed it, and two saves of two entries at one moment, which
// both go through. What else ADR 0073 asks of the editor is held in one engine: the Editor's own
// other tab, a lock that ends as its form is left or closed, also from a draft backup, a form
// read-only until the service answers for its lock, an Admin's form an Editor opens, a deletion
// from the list of an entry another tab holds, and a save Forgejo answers with an error.

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';

import { ENGINES, openEditor, seeded, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const USER = 'sveltia-cms.user';

describe('a form locked to the tab that has it open', () => {
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
      body: JSON.stringify({ content: Buffer.from(change(text)).toString('base64'), sha, message: 'A push from outside the editor', author: { name: 'Ada Author', email: 'ada@example.invalid' } }),
    });
  };
  const fileHolding = async (path, words, { within = 30_000 } = {}) => {
    const deadline = Date.now() + within;
    for (;;) {
      const { text } = await fileOf(path);
      if (text.includes(words) || Date.now() > deadline) return text;
      await new Promise((go) => setTimeout(go, 500));
    }
  };

  // A page signed in as one of the two, in an engine, by what that person's sign-in left in the
  // browser, as a tab opened later finds it.
  const pageOf = async (engine, login) => {
    const session = await openEditor(engine, site);
    // A page left with changes unsaved asks first, and the suite leaves it.
    session.page.on('dialog', (dialog) => dialog.accept());
    await session.page.evaluate(([key, user]) => localStorage.setItem(key, user), [USER, sessions[login]]);
    await session.page.reload();
    await session.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
    return session;
  };
  // The editor at an address of its own, as a link within it leads there, without loading the page.
  const go = (page, hash) => page.evaluate((to) => {
    window.location.hash = to;
  }, hash);
  const openForm = async (page, form) => {
    await go(page, `#/collections/${form}`);
    await page.getByRole('textbox', { name: 'Working name' }).waitFor({ timeout: 30_000 });
  };
  const toList = async (page) => {
    await go(page, '#/collections/articles');
    await page.getByRole('textbox', { name: 'Working name' }).waitFor({ state: 'detached' });
  };
  // The row of an article in the list, by its working name as the file holds it now.
  const rowOf = async (page, name) => {
    const title = /^title: "?(.*?)"?$/m.exec((await fileOf(`articles/${name}.md`)).text)[1];
    return page.locator(`[aria-label^="${title.replaceAll('"', '\\"')}"]`).first();
  };
  // The line above a read-only form, which Sveltia's bar holds.
  const lineOf = (page, words) => page.locator('.konzilo-lock-line').filter({ hasText: words });
  const saveButton = (page) => page.getByRole('button', { name: 'Save', exact: true });
  const errorDialog = (page) => page.getByRole('alertdialog', { name: /^Error$/ });

  before(async () => {
    site = await makeSite({ name: `accept-lock-${process.pid}`, people: 'anna:admin,ebba:editor' });
    site.up('--build');
    token = site.state('instance-token');
    articles = (await api(`${repository()}/contents/articles`)).filter(({ name }) => name.endsWith('.md')).map(({ name }) => name.replace(/\.md$/, ''));
    // Each person signs in once, as they would, and every other tab of theirs finds the sign-in.
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
      // Each engine its own articles, so that what one leaves behind is no other's.
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

      // Each test from the list of a page loaded anew, whatever the one before left, as a person
      // comes back to the editor.
      beforeEach(async () => {
        for (const { page } of [anna, ebba]) {
          await page.goto(`${site.origin.admin}/#/collections/articles`);
          await page.reload();
          await page.getByText('Articles').first().waitFor({ timeout: 60_000 });
        }
      });

      test('tells who holds a form and since when, lets it be read without a change, marks it in the list, and takes it over', async () => {
        const form = `articles/entries/${article(0)}`;
        await openForm(ebba.page, form);
        const ebbasField = ebba.page.getByRole('textbox', { name: 'Working name' });
        await ebbasField.fill('Unsaved words in the first tab');

        await toList(anna.page);
        const row = await rowOf(anna.page, article(0));
        await anna.page.waitForFunction((one) => one.getAttribute('data-konzilo-held') === 'ebba is editing', await row.elementHandle(), { timeout: 15_000 });
        assert.match(await row.getAttribute('aria-label'), /\(ebba is editing\)$/);

        await go(anna.page, `#/collections/${form}`);
        const question = anna.page.getByRole('dialog', { name: 'This form is open in another tab' });
        await question.waitFor({ timeout: 15_000 });
        assert.match(await question.textContent(), /ebba has had this form open since \d{1,2} \w+ \d{4} at \d{2}:\d{2}/);
        for (const name of ['Back to the list', 'Read only', 'Take over']) await question.getByRole('button', { name }).waitFor();
        await question.getByRole('button', { name: 'Read only' }).click();

        const line = lineOf(anna.page, 'You can read it here, but not change it.');
        await line.waitFor();
        const annasField = anna.page.getByRole('textbox', { name: 'Working name' });
        assert.equal(await annasField.isEditable(), false, 'every field inert');
        assert.equal(await saveButton(anna.page).count(), 0, 'no Save');

        await line.getByRole('button', { name: 'Take over' }).click();
        await anna.page.waitForFunction(() => document.querySelector('.konzilo-lock-line') === null);
        assert.equal(await annasField.isEditable(), true);

        // The first tab is told at once, by name, keeps its changes to read, and saves nothing.
        const notice = ebba.page.getByRole('dialog', { name: 'Your form was taken over' });
        await notice.waitFor({ timeout: 10_000 });
        assert.match(await notice.textContent(), /anna took over this form at /);
        await notice.getByRole('button', { name: 'OK' }).click();
        assert.equal(await ebbasField.inputValue(), 'Unsaved words in the first tab');
        assert.equal(await ebbasField.isEditable(), false);
        assert.equal(await saveButton(ebba.page).count(), 0);
        const takenLine = lineOf(ebba.page, 'anna took over this form');
        await takenLine.waitFor();

        // Taking it back sets the changes aside, to read from the latest save and never to save.
        const latest = /^title: "?(.*?)"?$/m.exec((await fileOf(`articles/${article(0)}.md`)).text)[1];
        await takenLine.getByRole('button', { name: 'Take over' }).click();
        const aside = lineOf(ebba.page, 'These are your unsaved changes from before this form was taken over');
        await aside.waitFor({ timeout: 15_000 });
        assert.equal(await ebbasField.inputValue(), 'Unsaved words in the first tab');
        assert.equal(await ebbasField.isEditable(), false);
        assert.equal(await saveButton(ebba.page).count(), 0);
        const annasNotice = anna.page.getByRole('dialog', { name: 'Your form was taken over' });
        await annasNotice.waitFor({ timeout: 10_000 });
        await annasNotice.getByRole('button', { name: 'OK' }).click();
        await aside.getByRole('button', { name: 'Open the latest save' }).click();
        await ebba.page.waitForFunction((words) => [...document.querySelectorAll('input')].some((input) => input.value === words), latest, { timeout: 15_000 });
        assert.equal(await ebbasField.isEditable(), true);

        await toList(anna.page);
        await toList(ebba.page);
      });

      test('refuses a save from a form older than a push from outside, naming its account and moment, overwrites nothing, and reloads keeping the changes to read', async () => {
        const name = article(1);
        const path = `articles/${name}.md`;
        await openForm(anna.page, `articles/entries/${name}`);
        await anna.page.getByRole('textbox', { name: 'Working name' }).fill(`Anna's change in ${engine}`);

        const pushed = `Pushed in ${engine}`;
        await pushAs('ebba', path, (text) => text.replace(/^title: .*$/m, `title: ${pushed}`));
        await saveButton(anna.page).click();

        const refusal = anna.page.getByRole('alertdialog').filter({ hasText: 'Reload' });
        await refusal.waitFor({ timeout: 30_000 });
        assert.match(await refusal.textContent(), /ebba saved this entry on \d{1,2} \w+ \d{4} at \d{2}:\d{2} \S+, after you opened it\./, 'the account that pushed it');
        assert.doesNotMatch(await refusal.textContent(), /Ada Author/, 'not the author the commit names');
        assert.equal(await refusal.getByRole('button', { name: /Save Anyway/ }).count(), 0);
        const text = (await fileOf(path)).text;
        assert.match(text, new RegExp(`title: ${pushed}`), 'the push stands');
        assert.doesNotMatch(text, /Anna's change/);

        await refusal.getByRole('button', { name: 'Reload' }).click();
        const line = lineOf(anna.page, 'These are your unsaved changes from');
        await line.waitFor({ timeout: 15_000 });
        const field = anna.page.getByRole('textbox', { name: 'Working name' });
        assert.equal(await field.inputValue(), `Anna's change in ${engine}`, 'the changes kept to read and copy');
        assert.equal(await field.isEditable(), false);

        await line.getByRole('button', { name: 'Open the latest save' }).click();
        await anna.page.waitForFunction((words) => [...document.querySelectorAll('input')].some((input) => input.value === words), pushed, { timeout: 15_000 });
        assert.equal(await field.isEditable(), true);
        await toList(anna.page);
      });

      test('saves two entries two people save at the same moment, both, with no error dialog', async () => {
        for (let round = 0; round < 2; round += 1) {
          // Two articles no one has changed in this engine's other tests.
          const [one, two] = [article(round * 2 + 2), article(round * 2 + 3)];
          await openForm(anna.page, `articles/entries/${one}`);
          await openForm(ebba.page, `articles/entries/${two}`);
          const words = { anna: `Saved at once by anna, ${engine} ${round}`, ebba: `Saved at once by ebba, ${engine} ${round}` };
          await anna.page.getByRole('textbox', { name: 'Working name' }).fill(words.anna);
          await ebba.page.getByRole('textbox', { name: 'Working name' }).fill(words.ebba);
          await Promise.all([saveButton(anna.page).click(), saveButton(ebba.page).click()]);
          assert.match(await fileHolding(`articles/${one}.md`, words.anna), new RegExp(words.anna));
          assert.match(await fileHolding(`articles/${two}.md`, words.ebba), new RegExp(words.ebba));
          await anna.page.waitForTimeout(1000);
          assert.equal(await errorDialog(anna.page).count(), 0);
          assert.equal(await errorDialog(ebba.page).count(), 0);
          await toList(anna.page);
          await toList(ebba.page);
        }
      });

      if (engine !== 'chromium') return;

      test('names the Editor\'s own other tab as such', async () => {
        const form = `articles/entries/${article(0)}`;
        await openForm(anna.page, form);
        const other = await anna.context.newPage();
        anna.watch(other);
        try {
          await other.goto(`${site.origin.admin}/#/collections/${form}`);
          const question = other.getByRole('dialog', { name: 'This form is open in another tab' });
          await question.waitFor({ timeout: 30_000 });
          assert.match(await question.textContent(), /You have had this form open in another tab since /);
          await question.getByRole('button', { name: 'Back to the list' }).click();
          await other.waitForURL(/#\/collections\/articles$/);
        } finally {
          await other.close();
        }
        await toList(anna.page);
      });

      test('ends a lock as its form is left, and the list marks it no more', async () => {
        await openForm(ebba.page, `articles/entries/${article(1)}`);
        await toList(anna.page);
        const row = await rowOf(anna.page, article(1));
        const held = () => row.getAttribute('data-konzilo-held');
        for (let waited = 0; await held() !== 'ebba is editing' && waited < 15_000; waited += 250) await anna.page.waitForTimeout(250);
        assert.equal(await held(), 'ebba is editing');
        await toList(ebba.page);
        for (let waited = 0; await held() !== null && waited < 15_000; waited += 250) await anna.page.waitForTimeout(250);
        assert.equal(await held(), null);
      });

      test('ends a lock at once as a form showing a draft backup that can no longer be saved is left or closed', async () => {
        const name = article(1);
        const form = `articles/entries/${name}`;
        await toList(ebba.page);
        const row = await rowOf(ebba.page, name);
        const held = () => row.getAttribute('data-konzilo-held');
        const waitFor = async (mark) => {
          for (let waited = 0; await held() !== mark && waited < 15_000; waited += 250) await ebba.page.waitForTimeout(250);
          assert.equal(await held(), mark);
        };

        await openForm(anna.page, form);
        await anna.page.getByRole('textbox', { name: 'Working name' }).fill('Anna\'s words set aside');
        await pushAs('ebba', `articles/${name}.md`, (text) => text.replace(/^title: .*$/m, 'title: Pushed while Anna wrote'));
        await saveButton(anna.page).click();
        const refusal = anna.page.getByRole('alertdialog').filter({ hasText: 'Reload' });
        await refusal.waitFor({ timeout: 30_000 });
        await refusal.getByRole('button', { name: 'Reload' }).click();
        await lineOf(anna.page, 'These are your unsaved changes from').waitFor({ timeout: 15_000 });
        await waitFor('anna is editing');
        await toList(anna.page);
        await waitFor(null);

        // The same backup in a tab of its own, closed.
        const other = await anna.context.newPage();
        anna.watch(other);
        other.on('dialog', (dialog) => dialog.accept());
        await other.goto(`${site.origin.admin}/#/collections/${form}`);
        await lineOf(other, 'These are your unsaved changes from').waitFor({ timeout: 30_000 });
        await waitFor('anna is editing');
        await other.close({ runBeforeUnload: true });
        await waitFor(null);
      });

      test('keeps a form read-only until the service has answered for its lock, and lets the Editor work where it does not answer', async () => {
        let release;
        const held = new Promise((go) => {
          release = go;
        });
        await anna.page.route('**/_konzilo/locks/**', async (route) => {
          if (route.request().method() !== 'PUT') return route.fallback();
          await held;
          return route.fallback();
        });
        try {
          await go(anna.page, `#/collections/articles/entries/${article(0)}`);
          const field = anna.page.getByRole('textbox', { name: 'Working name' });
          await field.waitFor({ timeout: 30_000 });
          await lineOf(anna.page, 'Checking that no other tab has this form open.').waitFor();
          assert.equal(await field.isEditable(), false, 'read-only while the service is asked');
          assert.equal(await saveButton(anna.page).count(), 0);
          release();
          await anna.page.waitForFunction(() => document.querySelector('.konzilo-lock-line') === null, null, { timeout: 15_000 });
          assert.equal(await field.isEditable(), true);
          await toList(anna.page);

          // A service that never answers is given up on, and the Editor works on.
          await anna.page.unroute('**/_konzilo/locks/**');
          await anna.page.route('**/_konzilo/locks/**', (route) => (route.request().method() === 'PUT' ? undefined : route.fallback()));
          await go(anna.page, `#/collections/articles/entries/${article(0)}`);
          await field.waitFor({ timeout: 30_000 });
          assert.equal(await field.isEditable(), false);
          await anna.page.waitForFunction(() => document.querySelector('.konzilo-lock-line') === null, null, { timeout: 20_000 });
          assert.equal(await field.isEditable(), true);
        } finally {
          release();
          await anna.page.unroute('**/_konzilo/locks/**');
        }
        await toList(anna.page);
      });

      test('saves once where Forgejo answers an error after the commit is in, and tries no save again that Forgejo forbids', async () => {
        const name = article(0);
        const path = `articles/${name}.md`;
        const commits = (url) => url.pathname.endsWith('/contents');
        let posts = 0;
        await anna.page.route(commits, async (route) => {
          if (route.request().method() !== 'POST') return route.fallback();
          posts += 1;
          if (posts > 1) return route.fallback();
          // The commit goes in, and the answer is lost on the way back.
          await route.fetch();
          return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'the answer was lost' }) });
        });
        try {
          await openForm(anna.page, `articles/entries/${name}`);
          const words = `Saved through a lost answer in ${engine}`;
          await anna.page.getByRole('textbox', { name: 'Working name' }).fill(words);
          await saveButton(anna.page).click();
          assert.match(await fileHolding(path, words), new RegExp(words));
          await anna.page.waitForTimeout(3000);
          assert.equal(await anna.page.getByRole('alertdialog').filter({ hasText: 'Reload' }).count(), 0, 'the Editor\'s own save is not refused as older than itself');
          assert.equal(posts, 1, 'not sent again, since it is in');
          const again = `${words}, and again`;
          await anna.page.getByRole('textbox', { name: 'Working name' }).fill(again);
          await saveButton(anna.page).click();
          assert.match(await fileHolding(path, again), new RegExp(again), 'the form saves on from its own save');
          await toList(anna.page);
        } finally {
          await anna.page.unroute(commits);
        }

        posts = 0;
        await anna.page.route(commits, (route) => {
          if (route.request().method() !== 'POST') return route.fallback();
          posts += 1;
          return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'forbidden' }) });
        });
        try {
          await openForm(anna.page, `articles/entries/${name}`);
          await anna.page.getByRole('textbox', { name: 'Working name' }).fill(`Forbidden in ${engine}`);
          await saveButton(anna.page).click();
          await errorDialog(anna.page).or(anna.page.getByRole('alertdialog')).first().waitFor({ timeout: 30_000 });
          assert.equal(posts, 1, 'a forbidden save is not tried again');
          assert.doesNotMatch((await fileOf(path)).text, /Forbidden in/);
        } finally {
          await anna.page.unroute(commits);
        }
        await anna.page.reload();
        await anna.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
      });

      test('opens an Admin\'s form read-only to an Editor, saying it is for Admins, with no takeover', async () => {
        await go(ebba.page, '#/collections/settings/entries/settings');
        const line = lineOf(ebba.page, 'This form is for Admins.');
        await line.waitFor({ timeout: 30_000 });
        assert.equal(await line.getByRole('button', { name: 'Take over' }).count(), 0);
        assert.equal(await saveButton(ebba.page).count(), 0);
        assert.equal(await ebba.page.getByRole('dialog', { name: 'This form is open in another tab' }).count(), 0);
        await line.getByRole('button', { name: 'Back to the list' }).click();
        await ebba.page.waitForURL(/#\/collections\/settings$/);
      });

      test('deletes no entry from the list that another tab holds, and says who has it', async () => {
        const name = article(0);
        await openForm(ebba.page, `articles/entries/${name}`);
        await toList(anna.page);
        const row = await rowOf(anna.page, name);
        await anna.page.waitForFunction((one) => one.getAttribute('data-konzilo-held') === 'ebba is editing', await row.elementHandle(), { timeout: 15_000 });
        await row.getByRole('checkbox').check();
        await anna.page.getByRole('button', { name: 'Delete Selected Entry' }).click();
        await anna.page.getByRole('alertdialog').getByRole('button', { name: 'Delete', exact: true }).click();
        await anna.page.getByText('ebba has this entry open, so it was not deleted.').waitFor({ timeout: 15_000 });
        assert.ok((await fileOf(`articles/${name}.md`)).text.length > 0, 'the entry stands');
        await toList(ebba.page);
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
