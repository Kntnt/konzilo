// An image's focal point (ADR 0022, ADR 0055), in a real browser of each engine, alone on a page with
// no Sveltia and no Compose: placed, moved and cleared by pointer and by keyboard, as the image
// library entry's own field draws it, with the frames following it and a screen reader told where
// it stands; and copied into a post with the image, the body's and an image field's, where the
// post moves its own copy and the library stays as it was.

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { ENGINES } from './lib/editor.js';
import { openFieldPage } from './lib/field-page.js';

const KEY_DELAY = 20;
const SQUARE = { ratio: 1, text: '1:1', contexts: ['card'] };
const SHARING = { ratio: 1200 / 630, text: '1.91:1', contexts: ['sharing'] };
const FRAMES = [SQUARE, SHARING];
const near = (one, other) => Math.abs(one - other) < 0.02;

for (const [name, engine] of Object.entries(ENGINES)) {
  describe(`an image's focal point, in ${name}`, () => {
    let site;
    let page;
    let seen;

    const focal = (method, ...args) => page.evaluate(([one, values]) => globalThis.focalPage[one](...values), [method, args]);
    const point = () => page.locator('.the-focal-point').getByRole('slider', { name: 'Focal point' });
    const square = async () => (await focal('frames')).find(({ ratio }) => ratio === '1:1');
    const openPicker = async (options) => {
      await focal('open', options);
      // The frames are drawn once the picture is in, by its proportions.
      await page.locator('.the-focal-point .konzilo-focal-frame:not([hidden])').first().waitFor();
    };

    before(async () => {
      site = await openFieldPage({ engine });
      ({ page, seen } = await site.newPage());
    }, { timeout: 120_000 });

    after(async () => {
      assert.deepEqual(seen.errors, []);
      await site?.close();
    });

    test('is placed where the image is clicked, follows a drag, and has each frame follow it', async () => {
      await openPicker({ frames: FRAMES });
      assert.equal(await point().getAttribute('aria-valuetext'), 'not placed: every crop keeps the middle');
      assert.ok(near((await square()).left, 1 / 6), 'a square around the middle of a 3:2 image');
      assert.deepEqual((await focal('frames')).map(({ label }) => label), ['card 1:1', 'sharing 1.91:1']);
      const box = await page.locator('.the-focal-point img').boundingBox();
      await page.mouse.click(box.x + box.width * 0.1, box.y + box.height * 0.5);
      const placed = await focal('read');
      assert.ok(near(placed.x, 0.1) && near(placed.y, 0.5), JSON.stringify(placed));
      assert.equal((await square()).left, 0, 'the square held at the left edge, around the point');
      assert.match(await point().getAttribute('aria-valuetext'), /^1\d % from the left, 5\d % from the top$/);
      assert.equal(await page.locator('.the-focal-point [role="status"]').textContent(), await point().getAttribute('aria-valuetext'), 'and said once it is placed');
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.9, box.y + box.height * 0.3, { steps: 4 });
      await page.mouse.up();
      const dragged = await focal('read');
      assert.ok(near(dragged.x, 0.9) && near(dragged.y, 0.3), JSON.stringify(dragged));
      assert.ok(near((await square()).left, 1 / 3), 'the square held at the right edge');
      const sharing = (await focal('frames')).find(({ ratio }) => ratio === '1.91:1');
      assert.ok(near(sharing.width, 1) && near(sharing.top, 0), 'the sharing frame across the whole width, held at the top');
    });

    test('moves with the arrow keys, by a tenth with Shift, says where it stands, and is cleared by Delete and by its button', async () => {
      await openPicker({ focalPoint: { x: 0.5, y: 0.5 }, frames: FRAMES });
      await point().focus();
      await page.keyboard.press('ArrowRight', { delay: KEY_DELAY });
      await page.keyboard.press('ArrowUp', { delay: KEY_DELAY });
      assert.deepEqual(await focal('read'), { x: 0.51, y: 0.49 });
      assert.equal(await point().getAttribute('aria-valuetext'), '51 % from the left, 49 % from the top');
      await page.keyboard.press('Shift+ArrowLeft', { delay: KEY_DELAY });
      await page.keyboard.press('Shift+ArrowLeft', { delay: KEY_DELAY });
      assert.deepEqual(await focal('read'), { x: 0.31, y: 0.49 });
      for (let step = 0; step < 6; step += 1) await page.keyboard.press('Shift+ArrowLeft', { delay: KEY_DELAY });
      assert.deepEqual(await focal('read'), { x: 0, y: 0.49 }, 'and stops at the edge');
      assert.equal((await square()).left, 0);
      await page.keyboard.press('Delete');
      assert.equal(await focal('read'), null);
      assert.equal(await point().getAttribute('aria-valuetext'), 'not placed: every crop keeps the middle');
      assert.ok(near((await square()).left, 1 / 6), 'every frame back around the middle');
      await page.keyboard.press('ArrowDown', { delay: KEY_DELAY });
      assert.deepEqual(await focal('read'), { x: 0.5, y: 0.51 }, 'placed again from the middle');
      const clear = page.locator('.the-focal-point').getByRole('button', { name: 'Clear the focal point' });
      await clear.click();
      assert.equal(await focal('read'), null);
      assert.equal(await clear.isDisabled(), true);
      const told = await focal('told');
      assert.deepEqual(told.slice(0, 2), [{ x: 0.51, y: 0.5 }, { x: 0.51, y: 0.49 }], 'told of each move');
      assert.deepEqual(told.slice(-3), [null, { x: 0.5, y: 0.51 }, null]);
    });

    describe('in a post', () => {
      const field = (method, ...args) => page.evaluate(([one, values]) => globalThis.fieldPage[one](...values), [method, args]);
      const imageField = (method, ...args) => page.evaluate(([one, values]) => globalThis.imagePage[one](...values), [method, args]);
      const ENTRY = { src: '/media/wide-harbour.webp', alt: 'The harbour', caption: '', focalPoint: { x: 0.2, y: 0.4 } };
      const moving = () => page.getByRole('dialog', { name: 'Move the focal point' });

      test('is copied from the library into a body with the image, and moved there in the image\'s dialog, leaving the library as it was', async () => {
        await field('open', '', { library: { entries: [ENTRY] }, frames: FRAMES });
        await field('focusEnd');
        await page.keyboard.type('/image', { delay: KEY_DELAY });
        await page.locator('.milkdown-slash-menu li.hover', { hasText: 'Image' }).waitFor();
        await page.keyboard.press('Enter');
        await page.getByRole('dialog', { name: 'Choose an image' }).getByRole('button', { name: 'The harbour' }).click();
        await field('flush');
        assert.equal(await field('value'), '![The harbour](/media/wide-harbour.webp "focus=0.2,0.4")');
        await page.locator('.konzilo-image-picture[data-state="shown"] img').waitFor();
        await page.getByRole('button', { name: 'Edit the image' }).click();
        const editing = page.getByRole('dialog', { name: 'Edit the image' });
        await editing.locator('.konzilo-focal-frame:not([hidden])').first().waitFor();
        const slider = editing.getByRole('slider', { name: 'Focal point' });
        assert.equal(await slider.getAttribute('aria-valuetext'), '20 % from the left, 40 % from the top');
        await slider.focus();
        await page.keyboard.press('Shift+ArrowRight', { delay: KEY_DELAY });
        await editing.getByRole('button', { name: 'Done' }).click();
        await field('flush');
        assert.equal(await field('value'), '![The harbour](/media/wide-harbour.webp "focus=0.3,0.4")');
        assert.deepEqual(await field('libraryEntries'), [ENTRY], 'the library as it was');
      });

      test('in a gallery, is moved for one image in a dialog of its own', async () => {
        await field('open', '![One](/media/wide-one.webp "focus=0.1,0.1")\n![Two](/media/wide-two.webp)', { library: { entries: [] }, frames: FRAMES });
        await page.getByRole('button', { name: 'Edit the gallery' }).click();
        const gallery = page.getByRole('dialog', { name: 'Edit the gallery' });
        await gallery.getByRole('button', { name: 'Move the focal point' }).nth(1).click();
        await moving().locator('.konzilo-focal-frame:not([hidden])').first().waitFor();
        await page.keyboard.press('ArrowLeft', { delay: KEY_DELAY });
        await moving().getByRole('button', { name: 'Done' }).click();
        await gallery.getByRole('button', { name: 'Done' }).click();
        await field('flush');
        assert.equal(await field('value'), '![One](/media/wide-one.webp "focus=0.1,0.1")\n![Two](/media/wide-two.webp "focus=0.49,0.5")');
      });

      test('is copied into an image field with the image, and moved there, leaving the library as it was', async () => {
        await imageField('openChosen', { entries: [ENTRY], frames: FRAMES });
        await page.locator('.the-image-field').getByRole('button', { name: 'Choose an image…' }).click();
        await page.getByRole('dialog', { name: 'Choose an image' }).getByRole('button', { name: 'The harbour' }).click();
        assert.deepEqual((await imageField('record')).values.at(-1), { src: '/media/wide-harbour.webp', alt: 'The harbour', focalPoint: { x: 0.2, y: 0.4 } });
        await page.locator('.the-image-field').getByRole('button', { name: 'Focal point…' }).click();
        await moving().locator('.konzilo-focal-frame:not([hidden])').first().waitFor();
        await page.keyboard.press('Shift+ArrowDown', { delay: KEY_DELAY });
        await moving().getByRole('button', { name: 'Done' }).click();
        const { values, entries } = await imageField('record');
        assert.deepEqual(values.at(-1), { src: '/media/wide-harbour.webp', alt: 'The harbour', focalPoint: { x: 0.2, y: 0.5 } });
        assert.deepEqual(entries, [ENTRY], 'the library as it was');
        await page.locator('.the-image-field').getByRole('button', { name: 'Focal point…' }).click();
        await moving().getByRole('button', { name: 'Cancel' }).click();
        assert.equal((await imageField('record')).values.length, values.length, 'and nothing at Cancel');
      });
    });
  });
}
