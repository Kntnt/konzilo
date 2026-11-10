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
  // A saved entry stays open, under an address of its own, and an editor leaves it for the list.
  const save = async () => {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => /\/entries\//.test(window.location.hash));
    await page.getByRole('button', { name: 'Cancel Editing' }).click();
    await page.getByRole('button', { name: 'Create New Entry' }).first().waitFor();
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

  test('search, sharing and structured data are closed bars, with no box to tick', async () => {
    await newEntry('pages');
    assert.equal(await page.getByRole('checkbox', { name: /^Search$/ }).count(), 0);
    assert.equal(await page.locator('section[data-accordion][data-key-path="search"] > header').isVisible(), false, 'its label is in the bar');
    assert.equal(await page.getByRole('textbox', { name: 'Title tag' }).count(), 0);
    await bar('Search').click();
    await page.getByRole('textbox', { name: 'Title tag' }).waitFor();
    assert.equal(await page.locator('.field[data-key-path="sharing.title"]').count(), 0);
    await bar('Structured data').click();
    await page.locator('.field[data-key-path="structured.schema"]').waitFor();
  });

  test('a form left closed saves with nothing to fill in, and a filled part is open when it comes back', async () => {
    await newEntry('pages');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Left closed');
    await save();

    await newEntry('pages');
    await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Filled in');
    await bar('Search').click();
    await page.getByRole('textbox', { name: 'Title tag' }).fill('A title tag');
    await save();

    await page.getByText('Filled in').first().click();
    await page.getByRole('textbox', { name: 'Title tag' }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Title tag' }).inputValue(), 'A title tag');
    assert.equal(await page.locator('.field[data-key-path="sharing.title"]').count(), 0, 'a group with nothing in it stays closed');
  });

  test('a canonical address under Search shows the post\'s own address while it is empty, following the slug, and takes a whole web address alone', async () => {
    await newEntry('pages');
    await bar('Search').click();
    await page.getByRole('textbox', { name: 'Title tag' }).waitFor();
    const title = page.getByRole('textbox', { name: 'Title', exact: true });
    await title.fill('Ferry times');
    // Sveltia mounts a field as it comes into view.
    const canonical = page.getByRole('textbox', { name: 'Canonical address' });
    await page.locator('.field[data-key-path="search.canonical"]').scrollIntoViewIfNeeded();
    await canonical.waitFor();
    const placeholder = (shown) => page.waitForFunction((address) => document.querySelector('input[aria-label="Canonical address"]')?.placeholder === address, shown);
    await placeholder('http://localhost:2/pages/ferry-times/');
    await title.fill('Ferry times in winter');
    await placeholder('http://localhost:2/pages/ferry-times-in-winter/');

    await canonical.fill('/ferry-times/');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Write a whole web address, starting with https:// or http://').waitFor();
    assert.match(await page.evaluate(() => window.location.hash), /\/new$/, 'a path is not saved');

    await canonical.fill('https://ferries.example.org/timetable/ferry-times');
    await save();
    await page.getByText('Ferry times in winter').first().click();
    await page.locator('.field[data-key-path="search.canonical"]').scrollIntoViewIfNeeded();
    assert.equal(await canonical.inputValue(), 'https://ferries.example.org/timetable/ferry-times');
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

describe('the interface language in Sveltia', () => {
  let site;
  let page;
  let seen;

  const origin = () => new URL(page.url()).origin;
  const newArticle = async () => {
    await page.goto(`${origin()}/#/collections/articles/new`);
    await page.locator('.konzilo-body-visual .ProseMirror').waitFor();
  };
  // Sveltia's own choice of language, in its preferences, from the list of articles.
  const choose = async (words, option) => {
    await page.goto(`${origin()}/#/collections/articles`);
    await page.getByRole('button', { name: words.menu }).click();
    await page.getByRole('menuitem', { name: words.settings }).click();
    await page.getByRole('tab', { name: words.language }).click();
    await page.getByRole('combobox', { name: words.select }).click();
    const loaded = page.waitForEvent('load');
    await page.getByRole('option', { name: option }).click();
    await loaded;
  };

  // A Swedish site, whose articles are named in each interface language, opened in a
  // browser in American English, which decides nothing.
  before(async () => {
    const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
    declared.language = 'sv_SE';
    declared.types.article.plural = { en: 'Articles', sv: 'Artiklar' };
    const description = siteDescription(declared);
    const made = (language) => ({
      ...cmsConfig(description, { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2', language }),
      backend: { name: 'test-repo' },
    });
    site = await openFieldPage({ configs: { 'config.json': made(), 'config.sv.json': made('sv'), 'config.en.json': made('en') } });
    ({ page, seen } = await site.newPage({ language: 'en-US', viewport: { width: 1400, height: 1200 } }));
  }, { timeout: 120_000 });

  after(() => site?.close());

  test('is the site\'s for an editor who has chosen none, in the form\'s labels and in Sveltia\'s own interface alike', async () => {
    await page.getByRole('button', { name: 'Arbeta med test-repo' }).click();
    await page.getByText('Artiklar', { exact: true }).first().waitFor();
    await newArticle();
    await page.getByRole('textbox', { name: 'Titel', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Spara', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Title', exact: true }).count(), 0);
  });

  test('is the editor\'s own once chosen in Sveltia\'s preferences, which loads the editor again in it', async () => {
    await choose({ menu: 'Visa användarkontomeny', settings: 'Inställningar', language: 'Språk', select: 'Välj språk' }, /English \(UK\)/);
    await page.getByText('Articles', { exact: true }).first().waitFor();
    await newArticle();
    await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Titel', exact: true }).count(), 0);
  });

  test('stays the editor\'s at the next visit, and Automatic gives the site\'s again', async () => {
    await page.reload();
    await newArticle();
    await page.getByRole('textbox', { name: 'Title', exact: true }).waitFor();
    await choose({ menu: 'Show Account Menu', settings: 'Settings', language: 'Language', select: 'Select Language' }, 'Automatic');
    await newArticle();
    await page.getByRole('textbox', { name: 'Titel', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Spara', exact: true }).waitFor();
  });

  test('has asked nothing outside, and broken no policy', () => {
    assert.deepEqual(seen.outside, []);
    assert.deepEqual(seen.refused, []);
    assert.deepEqual(seen.errors, []);
  });
});

// Real Sveltia on a site in two languages, each with a pane of its own.
describe('the canonical address in Sveltia, on a site in two languages', () => {
  let site;
  let page;
  let seen;

  before(async () => {
    const { language: _one, ...declared } = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
    declared.languages = ['sv_SE', 'en_GB'];
    declared.interfaceLanguage = 'en';
    declared.types.page.address = { sv_SE: '/sidor/{path}/', en_GB: '/pages/{path}/' };
    const config = cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
    site = await openFieldPage({ config: { ...config, backend: { name: 'test-repo' } } });
    ({ page, seen } = await site.newPage({ viewport: { width: 1600, height: 1200 } }));
    await page.getByRole('button', { name: 'Work with Test Repository' }).click();
    await page.getByText('Pages', { exact: true }).first().click();
    await page.getByRole('button', { name: 'Create New Entry' }).first().click();
    await page.getByRole('radio', { name: 'English (UK)' }).last().click();
    await page.locator('.konzilo-body-visual .ProseMirror').nth(1).waitFor();
  }, { timeout: 120_000 });

  after(() => site?.close());

  test('shows in each pane the post\'s own address in that pane\'s language', async () => {
    await page.getByRole('textbox', { name: 'Title' }).first().fill('Färjetider');
    await page.getByRole('textbox', { name: 'Title' }).last().fill('Ferry times');
    // Sveltia opens a group in every pane at once.
    await page.locator('.pane[data-locale="sv-SE"] button[aria-expanded]', { hasText: 'Search' }).first().click();
    for (const pane of ['sv-SE', 'en-GB']) {
      const inPane = page.locator(`.pane[data-locale="${pane}"]`);
      await inPane.getByRole('textbox', { name: 'Title tag' }).waitFor();
      await inPane.locator('.field[data-key-path="search.canonical"]').scrollIntoViewIfNeeded();
      await inPane.getByRole('textbox', { name: 'Canonical address' }).waitFor();
    }
    // The slug is one in both languages, and the address each language's, after its prefix.
    const slug = await page.locator('.pane[data-locale="sv-SE"] input[aria-label="Slug"]').inputValue();
    assert.match(slug, /^(farjetider|ferry-times)$/);
    for (const [pane, address] of [['sv-SE', `http://localhost:2/sv/sidor/${slug}/`], ['en-GB', `http://localhost:2/en/pages/${slug}/`]]) {
      await page.waitForFunction(([locale, shown]) => document.querySelector(`.pane[data-locale="${locale}"] input[aria-label="Canonical address"]`)?.placeholder === shown, [pane, address]);
    }
  });

  test('has asked nothing outside, and broken no policy', () => {
    assert.deepEqual(seen.outside, []);
    assert.deepEqual(seen.refused, []);
    assert.deepEqual(seen.errors, []);
  });
});
