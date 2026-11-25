// A scheduled post's triggers in real Sveltia on its test repository, with no Compose, in the three
// browser engines (ADR 0076): added beside the date by the keyboard alone, each control named for a
// screen reader, saved as rows in the source file, a moment alone kept in the date as it always
// was; a window wholly passed and a cycle stopped at Save, in words of the catalogues; and each
// trigger ticked on the Publishing page where it has happened.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cmsConfig } from '../src/cms/config.js';
import { frontMatterOf } from '../src/cms/groups/source.js';
import { siteDescription } from '../src/site-description.js';
import { ENGINES, openNew } from './lib/editor.js';
import { openFieldPage } from './lib/field-page.js';

const core = fileURLToPath(new URL('../', import.meta.url));

for (const [engineName, engine] of Object.entries(ENGINES)) {
  describe(`a scheduled post's triggers in Sveltia, in ${engineName}`, () => {
    let site;
    let page;
    let seen;

    // One file of the test repository, by its path. WebKit may fail a read while Sveltia is still
    // at the file, and the read is made again.
    const fileAt = async (path, tries = 10) => {
      try {
        return await page.evaluate(async (parts) => {
          let folder = await (await navigator.storage.getDirectory()).getDirectoryHandle('sveltia-cms-test');
          for (const name of parts.slice(0, -1)) folder = await folder.getDirectoryHandle(name);
          return (await (await folder.getFileHandle(parts.at(-1))).getFile()).text();
        }, path.split('/'));
      } catch (error) {
        if (tries <= 1) throw error;
        await page.waitForTimeout(300);
        return fileAt(path, tries - 1);
      }
    };
    const status = () => page.locator('section.field[data-key-path="group-status"]');
    const date = () => status().locator('[data-key-path="group-status.date"]');
    // A keyboard's press of a button, found by what a screen reader calls it.
    const press = async (within, name) => {
      await within.getByRole('button', { name, exact: true }).focus();
      await page.keyboard.press('Enter');
    };
    // What the last save wrote of the post, as its notice says, which stays a few seconds. The test
    // repository keeps its files in the browser's own file system, which Playwright's WebKit has
    // not, its test repository keeping them in memory alone, so there the file is not read, and
    // null stands for it (form.test.js).
    const readable = engineName !== 'webkit';
    const saved = async () => {
      const notice = page.getByText('Entry saved.');
      await notice.first().waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await notice.first().waitFor();
      if (!readable) return null;
      const id = /\/entries\/([^/?#]+)/.exec(await page.evaluate(() => window.location.hash))[1];
      return frontMatterOf(await fileAt(`articles/${id}.md`));
    };
    const refusedWith = async (words) => {
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      const dialog = page.getByRole('alertdialog');
      await dialog.getByText(words).waitFor();
      await dialog.getByRole('button', { name: 'OK' }).click();
    };
    const scheduled = async (title) => {
      await openNew(page, 'articles');
      await page.getByRole('textbox', { name: 'Working name', exact: true }).fill(title);
      await page.getByRole('textbox', { name: 'Main headline', exact: true }).fill(title);
      await page.getByRole('radio', { name: 'Scheduled' }).click();
    };

    before(async () => {
      const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
      const config = cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
      site = await openFieldPage({ engine, config: { ...config, backend: { name: 'test-repo' } } });
      ({ page, seen } = await site.newPage({ viewport: { width: 1400, height: 1200 } }));
      await page.getByRole('button', { name: 'Work with Test Repository' }).click();
      await page.getByText('Articles', { exact: true }).first().waitFor();
    }, { timeout: 120_000 });

    after(() => site?.close());

    test('adds triggers beside the date by the keyboard alone, each named for a screen reader, saves them as rows, and keeps a moment alone in the date', async () => {
      await scheduled('After the launch');
      const moment = date().locator('input[type="datetime-local"]');
      await moment.scrollIntoViewIfNeeded();
      await moment.fill('2999-01-01T09:00');

      // An alternative beside the date's moment, on its row: the date goes into the row with it.
      await press(status(), '+ Or another trigger');
      await date().waitFor({ state: 'detached' });
      const row = status().getByRole('group', { name: 'Row 1: one of these' });
      const first = row.getByRole('group', { name: 'Trigger 1 on row 1' });
      const second = row.getByRole('group', { name: 'Trigger 2 on row 1' });
      assert.equal(await first.getByRole('combobox', { name: 'Trigger', exact: true }).inputValue(), 'moment');
      assert.equal(await first.getByLabel('Date and time (UTC)').inputValue(), '2999-01-01T09:00');
      assert.equal(await second.getByRole('combobox', { name: 'Trigger', exact: true }).inputValue(), 'published');

      // Its conditions: an article, or words in its title.
      const conditions = second.getByRole('group', { name: 'Conditions, row 1' });
      await conditions.getByRole('combobox', { name: 'Type', exact: true }).selectOption('article');
      await press(conditions, '+ Or another condition');
      const condition = conditions.getByRole('combobox', { name: 'Condition', exact: true }).nth(1);
      await condition.selectOption('words');
      await conditions.getByRole('textbox', { name: 'Words', exact: true }).focus();
      await page.keyboard.type('launch');
      // And a row of its own: a term, as a second row of the same post's conditions.
      await press(second, '+ And another row of conditions');
      assert.equal(await second.getByRole('group', { name: 'Conditions, row 2' }).count(), 1);
      await press(second.getByRole('group', { name: 'Conditions, row 2' }), 'Remove the condition');
      assert.equal(await second.getByRole('group', { name: 'Conditions, row 2' }).count(), 0);

      // A post published before the save does not count, so the trigger counts from the save.
      await page.waitForTimeout(1100);
      const pressed = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const held = await saved();
      // What the form shows once saved, in every engine, and what the file holds, where it is read.
      assert.equal(await conditions.getByRole('textbox', { name: 'Words', exact: true }).inputValue(), 'launch');
      if (held) {
        assert.equal(held.status, 'scheduled');
        assert.equal(held.date, undefined, 'the moment is among the triggers');
        assert.deepEqual(held.triggers.map((one) => one.map(({ since, ...trigger }) => trigger)), [[{ moment: '2999-01-01T09:00:00Z' }, { published: [[{ type: 'article' }, { words: 'launch' }]] }]]);
        assert.match(held.triggers[0][1].since, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
        assert.ok(held.triggers[0][1].since >= pressed, `it counts from the save, not from its last change: ${held.triggers[0][1].since} before ${pressed}`);
      }

      // The post trigger taken away leaves the moment alone, which the date holds again.
      await press(second, 'Remove the trigger');
      await date().waitFor();
      assert.equal(await date().locator('input[type="datetime-local"]').inputValue(), '2999-01-01T09:00');
      const alone = await saved();
      if (alone) {
        assert.equal(alone.triggers, undefined);
        assert.match(String(alone.date), /^2999-01-01T09:00:00(?:\.000)?Z$/);
      }
    });

    test('stops a save whose window has wholly passed, and one whose posts wait for each other in a cycle, naming the post', async () => {
      await scheduled('Opening night');
      await press(status(), '+ And another row');
      // With no moment on the date, the trigger added is the only one.
      const trigger = status().getByRole('group', { name: 'Trigger 1 on row 1' });
      const conditions = trigger.getByRole('group', { name: 'Conditions, row 1' });
      await conditions.getByRole('combobox', { name: 'Condition', exact: true }).selectOption('window');
      await conditions.getByLabel('To (UTC)').fill('2020-01-01T09:00');
      await refusedWith('A trigger\'s window has passed: its end needs to lie ahead. Change it, remove it, or choose another status.');
      assert.match(await page.evaluate(() => window.location.hash), /\/new$/, 'nothing is saved');

      // Another post waits for this one, as the last build read it, and this one for it.
      await conditions.getByRole('combobox', { name: 'Condition', exact: true }).selectOption('words');
      await conditions.getByRole('textbox', { name: 'Words', exact: true }).fill('programme');
      const answer = {
        posts: [{ file: 'articles/bbbbbbbbbbbb.md', version: 'v1', status: 'scheduled', at: null, stillShown: false, id: 'bbbbbbbbbbbb', type: 'article', title: 'The programme', terms: [], triggers: [[{ published: [[{ words: 'opening' }]], since: '2026-11-20T00:00:00Z', happened: false }]] }],
        others: { refusals: [], warnings: [] },
        reason: null,
        at: '2026-11-25T12:00:00Z',
      };
      await page.context().route('**/_konzilo/status', (route) => route.fulfill({ json: answer }));
      // The service asks Forgejo who is asking, so the page sends what Sveltia signed in with.
      await page.evaluate(() => localStorage.setItem('sveltia-cms.user', JSON.stringify({ ...JSON.parse(localStorage.getItem('sveltia-cms.user') ?? '{}'), token: 'a-token' })));
      await refusedWith('This post waits for “The programme”, which in turn waits for this one, so neither would ever go out. Change a trigger of one of them.');
      await page.context().unroute('**/_konzilo/status');
    });

    test('shows each trigger of a waiting post on the Publishing page, in its rows, ticked where it has happened', async () => {
      const answer = {
        posts: [{
          file: 'articles/cccccccccccc.md', version: 'v1', status: 'scheduled', at: null, stillShown: false, id: 'cccccccccccc', type: 'article', title: 'Waits for the launch', terms: [],
          triggers: [
            [{ moment: '2026-11-01T09:00:00Z', happened: true }],
            [{ published: [[{ type: 'article', label: 'Article' }], [{ words: 'launch' }]], since: '2026-11-20T00:00:00Z', happened: false }, { moment: '2999-01-01T09:00:00Z', happened: false }],
          ],
        }],
        others: { refusals: [], warnings: [] },
        reason: null,
        at: '2026-11-25T12:00:00Z',
      };
      await page.context().route('**/_konzilo/status', (route) => route.fulfill({ json: answer }));
      await page.evaluate(() => localStorage.setItem('sveltia-cms.user', JSON.stringify({ ...JSON.parse(localStorage.getItem('sveltia-cms.user') ?? '{}'), token: 'a-token' })));
      await page.goto(`${new URL(page.url()).origin}/#/collections/articles`);
      await page.getByRole('radio', { name: 'Publishing' }).click();
      const row = page.getByRole('row', { name: /Waits for the launch/ });
      await row.getByText('Scheduled: goes live once a trigger on each row has happened.').waitFor();
      const rows = await row.locator('[data-triggers] > li').evaluateAll((items) => items.map((item) => item.textContent));
      assert.equal(rows.length, 2);
      assert.match(rows[0], /^✓Has happened: on 1 November 2026/);
      assert.match(rows[1], /^and ○Has not happened yet: once a post is published that is of the type article, and has “launch” in its title or ○Has not happened yet: on 1 January 2999/);
      await page.context().unroute('**/_konzilo/status');
    });

    test('has asked nothing outside, and broken no policy', () => {
      assert.deepEqual(seen.outside, []);
      assert.deepEqual(seen.refused, []);
      // Sveltia logs each refusal it showed, and nothing else, in the words, or not, that the engine
      // logs an error with.
      const refusals = ['A trigger\'s window has passed: its end needs to lie ahead. Change it, remove it, or choose another status.', 'This post waits for “The programme”, which in turn waits for this one, so neither would ever go out. Change a trigger of one of them.'];
      assert.deepEqual(seen.errors.map((one) => one.split('\n')[0]).map((one, at) => one.replace(`: ${refusals[at]}`, '')), ['Error', 'Error']);
    });
  });
}
