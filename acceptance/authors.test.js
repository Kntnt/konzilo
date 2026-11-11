// The authors field in a real browser, alone on a page with no Sveltia and no Compose, in each
// engine, since a drag is each browser's own doing: suggestions as a name is typed, chips in the
// order given, dragged or moved by key, removed one by one, and a new author added in a dialog.
// Compose has it in Sveltia, against Forgejo, with the order saved.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ENGINES } from './lib/editor.js';
import { openFieldPage } from './lib/field-page.js';

const AUTHORS = [
  { id: 'ines-holm', name: 'Ines Holm' },
  { id: 'rafael-berg', name: 'Rafael Berg' },
  { id: 'asa-lind', name: 'Åsa Lind' },
  { id: 'ada-lind', name: 'Ada Lind' },
];

for (const [name, engine] of Object.entries(ENGINES)) {
  describe(`the authors field in ${name}`, () => {
    let site;
    let page;
    let seen;

    const call = (method, ...args) => page.evaluate(([one, values]) => globalThis.authorsPage[one](...values), [method, args]);
    const chips = () => page.locator('.konzilo-authors-chip .konzilo-authors-name').allTextContents();
    const combobox = () => page.getByRole('combobox', { name: 'Authors' });
    const options = () => page.getByRole('listbox').getByRole('option').allTextContents();
    const focusedText = () => page.evaluate(() => document.activeElement?.textContent ?? '');

    before(async () => {
      site = await openFieldPage({ engine });
      ({ page, seen } = await site.newPage());
    }, { timeout: 120_000 });

    after(() => site?.close());

    test('suggests the authors whose names hold what is typed, and lists them all when opened', async () => {
      await call('open', ['ines-holm'], { authors: AUTHORS });
      assert.deepEqual(await chips(), ['Ines Holm']);
      await combobox().click();
      await page.keyboard.type('lind', { delay: 20 });
      assert.deepEqual(await options(), ['Ada Lind', 'Åsa Lind'], 'by their names, whatever their marks');
      await page.getByRole('option', { name: 'Åsa Lind' }).click();
      assert.deepEqual(await chips(), ['Ines Holm', 'Åsa Lind']);
      assert.deepEqual(await call('value'), ['ines-holm', 'asa-lind']);
      assert.equal(await combobox().inputValue(), '', 'with the box empty for the next');
      assert.equal(await page.getByRole('listbox').isVisible(), false);

      await page.getByRole('button', { name: 'Show all authors' }).click();
      assert.deepEqual(await options(), ['Ada Lind', 'Rafael Berg'], 'each one not chosen yet');
      await page.keyboard.type('zz', { delay: 20 });
      assert.deepEqual(await options(), []);
      await page.getByText('No author is called that.').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('listbox').isVisible(), false);
    });

    test('moves a chip where it is dragged, and removes one with its own control, leaving the others in order', async () => {
      await call('open', ['ines-holm', 'rafael-berg', 'asa-lind'], { authors: AUTHORS });
      const chip = (text) => page.locator('.konzilo-authors-chip', { hasText: text });
      const from = await chip('Ines Holm').boundingBox();
      const to = await chip('Åsa Lind').boundingBox();
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 8, from.y + from.height / 2 + 2, { steps: 3 });
      await page.mouse.move(to.x + to.width - 6, to.y + to.height / 2, { steps: 8 });
      await page.locator('.konzilo-authors-chip[data-drop="after"]').waitFor();
      await page.mouse.up();
      await page.locator('.konzilo-authors-chip[data-drop]').waitFor({ state: 'detached' });
      assert.deepEqual(await chips(), ['Rafael Berg', 'Åsa Lind', 'Ines Holm']);
      assert.deepEqual(await call('value'), ['rafael-berg', 'asa-lind', 'ines-holm']);

      await page.getByRole('button', { name: 'Remove Åsa Lind' }).click();
      assert.deepEqual(await chips(), ['Rafael Berg', 'Ines Holm']);
      assert.deepEqual(await call('value'), ['rafael-berg', 'ines-holm']);
    });

    test('adds a new author from its button, in a dialog, and chooses it', async () => {
      await call('open', ['rafael-berg'], { authors: AUTHORS, throwing: { add: true } });
      await combobox().fill('Ben');
      await page.getByRole('button', { name: 'Add a new author' }).click();
      const dialog = page.getByRole('dialog', { name: 'A new author' });
      const named = dialog.getByRole('textbox', { name: 'Name' });
      assert.equal(await named.inputValue(), 'Ben', 'from what was typed');
      await named.fill('');
      await dialog.getByRole('button', { name: 'Add the author' }).click();
      await dialog.getByText('An author needs a name.').waitFor();
      await named.fill('Ben Holm');
      await dialog.getByRole('textbox', { name: 'Biography' }).fill('Writes of lighthouses.');
      await dialog.getByRole('button', { name: 'Add the author' }).click();
      await dialog.getByText('The author could not be added just now.', { exact: false }).waitFor();
      assert.deepEqual(await call('value'), null, 'nothing chosen while nothing is added');

      await call('stopThrowing');
      await dialog.getByRole('button', { name: 'Add the author' }).click();
      await dialog.waitFor({ state: 'detached' });
      assert.deepEqual(await call('added'), [{ name: 'Ben Holm', biography: 'Writes of lighthouses.' }]);
      assert.deepEqual(await chips(), ['Rafael Berg', 'Ben Holm']);
      assert.deepEqual(await call('value'), ['rafael-berg', 'new1']);
      assert.equal(await combobox().inputValue(), '');
      await page.getByRole('button', { name: 'Show all authors' }).click();
      assert.ok(!(await options()).includes('Ben Holm'), 'who is chosen, among the authors from now on');
      await page.keyboard.press('Escape');

      await page.getByRole('button', { name: 'Add a new author' }).click();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      assert.equal(await page.evaluate(() => document.activeElement?.textContent), '+ Add a new author', 'back where it was opened from');
      assert.deepEqual(await call('added'), [{ name: 'Ben Holm', biography: 'Writes of lighthouses.' }], 'and nothing added by leaving');
    });

    // Safari's Tab goes from field to field alone, and Option-Tab to every control.
    const next = () => page.keyboard.press(name === 'webkit' ? 'Alt+Tab' : 'Tab');
    const back = () => page.keyboard.press(name === 'webkit' ? 'Alt+Shift+Tab' : 'Shift+Tab');

    test('works with the keyboard alone', async () => {
      await call('open', ['ines-holm'], { authors: AUTHORS });
      await page.getByRole('textbox', { name: 'Before the field' }).focus();
      await next();
      assert.equal(await focusedText(), 'Ines Holm', 'a chip first');
      await next();
      await next();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox', 'then the box, past the chip\'s own control');

      await page.keyboard.type('berg', { delay: 20 });
      await page.keyboard.press('Enter');
      assert.deepEqual(await call('value'), ['ines-holm', 'rafael-berg'], 'the first suggestion, at Enter');
      await page.keyboard.press('ArrowDown');
      assert.deepEqual(await options(), ['Ada Lind', 'Åsa Lind'], 'and all the rest at an arrow');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      assert.deepEqual(await call('value'), ['ines-holm', 'rafael-berg', 'asa-lind']);

      // Back to the last chip, which an arrow moves earlier.
      await back();
      await back();
      assert.equal(await focusedText(), 'Åsa Lind');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      assert.deepEqual(await chips(), ['Åsa Lind', 'Ines Holm', 'Rafael Berg']);
      assert.equal(await focusedText(), 'Åsa Lind', 'and the keys stay with it');
      await page.getByText('Åsa Lind is now 1 of 3.').waitFor({ state: 'attached' });
      await page.keyboard.press('End');
      assert.deepEqual(await call('value'), ['ines-holm', 'rafael-berg', 'asa-lind']);
      await page.keyboard.press('Delete');
      assert.deepEqual(await call('value'), ['ines-holm', 'rafael-berg']);
      assert.equal(await focusedText(), 'Rafael Berg', 'the keys go to the one beside it');

      // A new author, from its button, with the keyboard.
      for (let tries = 0; tries < 6 && await focusedText() !== '+ Add a new author'; tries += 1) await next();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: 'A new author' });
      await dialog.waitFor();
      await page.keyboard.type('Cleo Berg', { delay: 20 });
      await page.keyboard.press('Enter');
      await dialog.waitFor({ state: 'detached' });
      assert.deepEqual(await call('value'), ['ines-holm', 'rafael-berg', 'new1']);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('role')), 'combobox', 'ready for the next');
    });

    test('speaks the interface language, and orders the names as it does', async () => {
      await call('open', [], { authors: AUTHORS, language: 'sv' });
      await page.getByRole('button', { name: 'Visa alla författare' }).click();
      assert.deepEqual(await options(), ['Ada Lind', 'Ines Holm', 'Rafael Berg', 'Åsa Lind']);
      assert.equal(await combobox().getAttribute('placeholder'), 'Skriv ett namn');
      await page.keyboard.press('Escape');
    });

    test('says when the authors cannot be read, and keeps the chosen ones', async () => {
      await call('open', ['ines-holm', 'gone'], { authors: AUTHORS, throwing: { list: true } });
      await page.getByText('The authors could not be read just now.', { exact: false }).waitFor();
      assert.deepEqual(await chips(), ['ines-holm', 'gone']);
      await call('open', ['ines-holm', 'gone'], { authors: AUTHORS });
      assert.deepEqual(await chips(), ['Ines Holm', 'gone']);
      assert.equal(await page.locator('.konzilo-authors-chip[data-missing]').getAttribute('title'), 'No author has the ID gone any more.');
    });

    test('has broken no policy', () => {
      assert.deepEqual(seen.outside, []);
      assert.deepEqual(seen.refused, []);
      assert.deepEqual(seen.errors, []);
    });
  });
}
