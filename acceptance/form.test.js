// The form around the fields, in real Sveltia on its test repository, with no Compose: what it
// offers, and how the parts an editor rarely needs stay out of the way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cmsConfig } from '../src/cms/config.js';
import { siteDescription } from '../src/site-description.js';
import { openFieldPage } from './lib/field-page.js';

const core = fileURLToPath(new URL('../', import.meta.url));

describe('the form in Sveltia', () => {
  let site;
  let page;
  let seen;

  const bar = (name) => page.locator('button[aria-expanded]', { hasText: name }).first();
  const newEntry = async (collection) => {
    await page.goto(`${new URL(page.url()).origin}/#/collections/${collection}/new`);
    await page.locator('.konzilo-body-visual .ProseMirror').waitFor();
  };

  before(async () => {
    const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
    const config = cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
    site = await openFieldPage({ config: { ...config, backend: { name: 'test-repo' } } });
    ({ page, seen } = await site.newPage({ viewport: { width: 1400, height: 1200 } }));
    await page.getByRole('button', { name: 'Work with Test Repository' }).click();
    await page.getByText('Pages', { exact: true }).first().waitFor();
  }, { timeout: 120_000 });

  after(() => site?.close());

  test('a page cannot be made from another page, but an article can make a category', async () => {
    await newEntry('pages');
    assert.equal(await page.getByRole('button', { name: /Add.*Page/ }).count(), 0);
    await newEntry('articles');
    await page.getByRole('button', { name: /Add.*Category/ }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: /Add.*Article/ }).count(), 0);
  });

  test('search and sharing is a closed bar, with no box to tick, that opens to closed parts', async () => {
    await newEntry('pages');
    assert.equal(await page.getByRole('checkbox', { name: /Search and sharing/ }).count(), 0);
    assert.equal(await page.locator('section[data-accordion][data-key-path="seo"] > header').isVisible(), false, 'its label is in the bar');
    assert.equal(await page.getByRole('textbox', { name: 'Title tag' }).count(), 0);
    assert.equal(await bar('In search results').count(), 0);
    await bar('Search and sharing').click();
    assert.equal(await page.getByRole('textbox', { name: 'Title tag' }).count(), 0);
    await bar('In search results').click();
    await page.getByRole('textbox', { name: 'Title tag' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Sharing title' }).count(), 0);
    await bar('Advanced').click();
    await page.locator('.field[data-key-path="seo.advanced.schema"]').waitFor();
  });

  test('a form left closed saves with nothing to fill in, and a filled part is open when it comes back', async () => {
    await newEntry('pages');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Left closed');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Create New Entry' }).first().waitFor();

    await newEntry('pages');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Filled in');
    await bar('Search and sharing').click();
    await bar('In search results').click();
    await page.getByRole('textbox', { name: 'Title tag' }).fill('A title tag');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('button', { name: 'Create New Entry' }).first().waitFor();

    await page.getByText('Filled in').first().click();
    await page.getByRole('textbox', { name: 'Title tag' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Title tag' }).inputValue(), 'A title tag');
    assert.equal(await page.getByRole('textbox', { name: 'Sharing title' }).count(), 0, 'a part with nothing in it stays closed');
  });

  test('settings are closed bars too, whose long hints wait until they are open', async () => {
    await page.goto(`${new URL(page.url()).origin}/#/collections/settings/entries/settings`);
    await bar('Consent texts').waitFor();
    assert.equal(await page.getByRole('checkbox', { name: /Consent texts/ }).count(), 0);
    const hint = page.getByText('What the privacy banner');
    assert.equal(await hint.isVisible(), false);
    await bar('Consent texts').click();
    await hint.waitFor();
  });

  test('has asked nothing outside, and broken no policy', () => {
    assert.deepEqual(seen.outside, []);
    assert.deepEqual(seen.refused, []);
    assert.deepEqual(seen.errors, []);
  });
});
