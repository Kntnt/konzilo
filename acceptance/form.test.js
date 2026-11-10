// The form around the fields, in real Sveltia on its test repository, with no Compose: what it
// offers, and how the parts an editor rarely needs stay out of the way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cmsConfig } from '../src/cms/config.js';
import { named, say } from '../src/intake/words.js';
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

  // A refusal at Save and in the publish status, in the interface language, naming the block,
  // the field or the file, for an editor who has chosen none and so has the site's, and for one
  // who has chosen English, each in a browser of their own. The words of the body field and of
  // the publish status around them follow the browser until they move to the catalogues, so
  // those are found by either. The status is the service's answer, as the intake shapes each
  // refusal in it.
  test('refuses at Save and in the publish status in the interface language, naming what it is about', async () => {
    const answer = {
      posts: [{ file: 'pages/aaaaaaaaaaaa.md', version: 'v1', status: 'failed', stillShown: false, id: 'aaaaaaaaaaaa', type: 'page', title: 'Untitled', refusals: [named({ post: { id: 'aaaaaaaaaaaa', type: 'page', title: 'aaaaaaaaaaaa' }, file: 'pages/aaaaaaaaaaaa.md', field: 'title', reason: say('refusal.title-empty') })] }],
      others: { refusals: [named({ file: 'menus/main.json', entry: '1', reason: say('refusal.menu-title') })], warnings: [] },
      reason: null,
      at: '2026-11-10T12:00:00Z',
    };
    const editors = [
      {
        locale: null, start: 'Arbeta med test-repo', title: 'Titel', save: 'Spara',
        refusal: 'Block 1: webbplatsen kan inte publicera en rubrik på nivå 1: inläggets titel är dess nivå 1; använd en nivå från 2 till 6',
        post: 'fältet title: webbplatsen kan inte publicera ett inlägg utan titel; ge det en',
        file: 'Filen menus/main.json, post 1: posten har ingen etikett; ge den en, eller välj ett inlägg',
      },
      {
        locale: 'en-GB', start: 'Work with Test Repository', title: 'Title', save: 'Save',
        refusal: 'Block 1: the site cannot publish a heading at level 1: the post\'s title is its level 1; use a level from 2 to 6',
        post: 'the field title: the site cannot publish a post without a title; give it one',
        file: 'The file menus/main.json, entry 1: the entry has no label; give it one, or choose a post',
      },
    ];
    for (const editor of editors) {
      const own = await site.newPage({ language: 'en-US', viewport: { width: 1400, height: 1200 } });
      try {
        await own.context.route('**/_konzilo/status', (route) => route.fulfill({ json: answer }));
        // Once Sveltia has settled in the site's language, which it keeps in its preferences.
        await own.page.getByRole('button', { name: editors[0].start }).waitFor();
        if (editor.locale) {
          await own.page.evaluate((locale) => localStorage.setItem('sveltia-cms.prefs', JSON.stringify({ locale })), editor.locale);
          await own.page.reload();
        }
        await own.page.getByRole('button', { name: editor.start }).click();
        await own.page.goto(`${new URL(own.page.url()).origin}/#/collections/pages/new`);
        await own.page.locator('.konzilo-body-visual .ProseMirror').waitFor();
        await own.page.getByRole('textbox', { name: editor.title, exact: true }).fill('Refused');
        await own.page.getByRole('button', { name: /^(?:Show|Visa) Markdown$/ }).click();
        await own.page.locator('.konzilo-body-source').fill('# A title in the body\n\nText.');
        await own.page.getByRole('button', { name: editor.save, exact: true }).click();
        await own.page.getByRole('alertdialog').getByText(editor.refusal).waitFor();

        // The service asks Forgejo who is asking, so the page sends what Sveltia signed in with.
        await own.page.evaluate(() => localStorage.setItem('sveltia-cms.user', JSON.stringify({ ...JSON.parse(localStorage.getItem('sveltia-cms.user') ?? '{}'), token: 'a-token' })));
        await own.page.goto(`${new URL(own.page.url()).origin}/#/collections/pages`);
        await own.page.getByRole('radio', { name: /^(?:Publishing|Publicering)$/ }).click();
        await own.page.getByRole('row', { name: /Untitled/ }).getByText(editor.post).waitFor();
        await own.page.getByText(editor.file).waitFor();
        assert.deepEqual(own.seen.outside, []);
        assert.deepEqual(own.seen.refused, []);
      } finally {
        await own.context.close();
      }
    }
  });

  test('has asked nothing outside, and broken no policy', () => {
    assert.deepEqual(seen.outside, []);
    assert.deepEqual(seen.refused, []);
    assert.deepEqual(seen.errors, []);
  });
});
