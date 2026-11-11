// The form around the fields, in real Sveltia on its test repository, with no Compose: what it
// offers, and how the parts an editor rarely needs stay out of the way.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cmsConfig } from '../src/cms/config.js';
import { frontMatterOf } from '../src/cms/groups/source.js';
import { fieldNamed, named, say } from '../src/intake/words.js';
import { siteDescription } from '../src/site-description.js';
import { ENGINES, openNew } from './lib/editor.js';
import { openFieldPage } from './lib/field-page.js';

const core = fileURLToPath(new URL('../', import.meta.url));

describe('the form in Sveltia', () => {
  let site;
  let page;
  let seen;

  const bar = (name) => page.locator('button[aria-expanded]', { hasText: name }).first();
  const newEntry = (collection) => openNew(page, collection);
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

  test('a page cannot be made from another page, but an article can make a category and a topic, and has its authors in a field of the core\'s own', async () => {
    await newEntry('pages');
    assert.equal(await page.getByRole('button', { name: /Add.*page/i }).count(), 0);
    await newEntry('articles');
    for (const name of [/Add.*category/i, /Add.*topic/i]) await page.getByRole('button', { name }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: /Add.*article/i }).count(), 0);
    // A test repository has no Forgejo to read the authors from, or add one to (Compose has).
    await page.locator('section.field[data-key-path="group-terms.authors"]').getByRole('combobox', { name: 'Authors' }).waitFor({ state: 'attached' });
  });

  // Sveltia leaves the entry at an Escape, which it hears before anything on the page does.
  test('an Escape in the authors\' box closes its list, and then empties it, and leaves the entry open', async () => {
    await newEntry('articles');
    const box = page.locator('section.field[data-key-path="group-terms.authors"]').getByRole('combobox', { name: 'Authors' });
    await box.scrollIntoViewIfNeeded();
    await box.click();
    await page.keyboard.type('Ines', { delay: 20 });
    assert.equal(await box.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape');
    assert.equal(await box.getAttribute('aria-expanded'), 'false');
    assert.equal(await box.inputValue(), 'Ines');
    await page.keyboard.press('Escape');
    assert.equal(await box.inputValue(), '');
    await page.waitForTimeout(300);
    assert.match(await page.evaluate(() => window.location.hash), /\/new$/, 'still in the entry');
  });

  test('search, sharing and structured data are closed bars, with no box to tick', async () => {
    await newEntry('pages');
    assert.equal(await page.getByRole('checkbox', { name: /^Search$/ }).count(), 0);
    assert.equal(await page.locator('section[data-accordion][data-key-path="search"] > header > h4').isVisible(), false, 'its label is in the bar');
    assert.equal(await page.getByRole('textbox', { name: 'Title tag' }).count(), 0);
    await bar('Search').click();
    await page.getByRole('textbox', { name: 'Title tag' }).waitFor();
    assert.equal(await page.locator('.field[data-key-path="sharing.title"]').count(), 0);
    await bar('Structured data').click();
    await page.locator('.field[data-key-path="structured.schema"]').waitFor();
  });

  // A post's structured data type decides what it is, and is one its type offers: an article a
  // kind of article, a page any of them, each type's own first and shown as chosen.
  test('the structured data type offers the post\'s type\'s own types alone, its type\'s own shown as chosen', async () => {
    const every = ['AboutPage', 'ContactPage', 'CollectionPage', 'Article', 'BlogPosting', 'NewsArticle'];
    for (const [collection, options] of [['articles', ['Article (chosen for articles)', 'BlogPosting', 'NewsArticle']], ['pages', ['WebPage (chosen for pages)', ...every]], ['canvases', ['WebPage (chosen for canvases)', ...every]]]) {
      await newEntry(collection);
      await bar('Structured data').click();
      const select = page.locator('.field[data-key-path="structured.schema"] select');
      await select.waitFor();
      assert.deepEqual((await select.locator('option').allTextContents()).map((one) => one.trim()), options, collection);
      assert.equal(await select.inputValue(), '', collection);
    }
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

// A post's form in field groups, each one section with one menu over every field it covers,
// which reverts, restores the defaults and clears them all, and greys what would change nothing
// (ADR 0071).
describe('field groups in Sveltia', () => {
  let site;
  let page;
  let seen;

  const open = (collection) => openNew(page, collection);
  const group = (name) => page.locator(`section.field[data-key-path="${name}"]`);
  const textbox = (name) => page.getByRole('textbox', { name, exact: true });
  // A group's menu, opened, as an editor opens it: what it offers, and whether each is greyed.
  const menu = async (name) => {
    await group(name).scrollIntoViewIfNeeded();
    await group(name).hover();
    await group(name).getByRole('button', { name: 'Show Field Options' }).first().click();
    const items = page.getByRole('menu').getByRole('menuitem');
    return Object.fromEntries(await items.evaluateAll((all) => all.map((one) => [one.textContent, one.getAttribute('aria-disabled') !== 'true'])));
  };
  const choose = async (action) => {
    await page.getByRole('menu').getByRole('menuitem', { name: action }).click();
    await page.getByRole('menu').waitFor({ state: 'detached' });
  };

  before(async () => {
    const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
    const config = cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
    site = await openFieldPage({ config: { ...config, backend: { name: 'test-repo' } } });
    ({ page, seen } = await site.newPage({ viewport: { width: 1400, height: 1200 } }));
    await page.getByRole('button', { name: 'Work with Test Repository' }).click();
    await page.getByText('Articles', { exact: true }).first().waitFor();
  }, { timeout: 120_000 });

  after(() => site?.close());

  // The form's sections, in order, by their places in the post's values.
  const sections = () => page.evaluate(() => [...document.querySelectorAll('section.field[data-key-path]')].map((one) => one.dataset.keyPath).filter((key) => !key.includes('.')));
  // A group holds the fields by these labels, and has one menu.
  const holds = async (name, labels) => {
    for (const label of labels) assert.equal(await group(name).getByText(label, { exact: true }).count() > 0, true, `${name} holds ${label}`);
    await group(name).hover();
    assert.equal(await group(name).getByRole('button', { name: 'Show Field Options' }).filter({ visible: true }).count(), 1, `${name} has one menu`);
  };

  test('give the article its form in story 23\'s order, each group one section with one menu, and no publishing row', async () => {
    await open('articles');
    assert.deepEqual(await sections(), ['group-name', 'group-status', 'image', 'group-terms', 'group-headline', 'standfirst', 'body', 'teaser', 'search', 'sharing', 'structured', 'otherAddresses']);
    await holds('group-name', ['Working name', 'Breadcrumb', 'Slug']);
    await holds('group-status', ['Status', 'UTC']);
    await holds('group-terms', ['Authors', 'Category', 'Topics']);
    await holds('group-headline', ['+ Add an eyebrow', 'Main headline', '+ Add a subheadline']);
    await group('search').scrollIntoViewIfNeeded();
    await holds('search', []);
    assert.equal(await group('publishing').count(), 0);
  });

  // A page and a canvas take the article's sections that they have, in its order, beside their
  // parent and body; their status says whether they are published, as an article's does.
  test('give a page and a canvas the article\'s sections in its order, the date under the status and the canvas\'s name in breadcrumbs among them, and no publishing row', async () => {
    for (const [collection, order] of [
      ['pages', ['group-name', 'group-status', 'parent', 'body', 'teaser', 'search', 'sharing', 'structured', 'otherAddresses']],
      ['canvases', ['group-name', 'group-status', 'body', 'teaser', 'search', 'sharing', 'structured', 'otherAddresses']],
    ]) {
      await open(collection);
      assert.deepEqual(await sections(), order, collection);
      await holds('group-name', ['Title', 'Breadcrumb', 'Slug']);
      await holds('group-status', ['Status', 'UTC']);
      assert.equal(await group('group-status').getByLabel('Date', { exact: true }).getAttribute('type'), 'datetime-local');
      await group('teaser').scrollIntoViewIfNeeded();
      await page.locator('button[aria-expanded]', { hasText: 'Teaser' }).first().waitFor();
      assert.equal(await group('publishing').count(), 0, collection);
    }
  });

  // The headline's group: the main headline, a button above it that adds an eyebrow and one below
  // it that adds a subheadline, neither part with a label of its own. A part emptied, by the editor
  // or from the menu, is its button again.
  test('show a new article\'s main headline alone, between a button that adds an eyebrow and one that adds a subheadline, each a part with the focus in it until emptied', async () => {
    await open('articles');
    const headline = group('group-headline');
    await headline.scrollIntoViewIfNeeded();
    const top = async (locator) => (await locator.boundingBox()).y;
    const eyebrowButton = headline.getByRole('button', { name: '+ Add an eyebrow' });
    const subheadlineButton = headline.getByRole('button', { name: '+ Add a subheadline' });
    const main = textbox('Main headline');
    assert.deepEqual(await headline.getByRole('textbox').evaluateAll((all) => all.map((one) => one.getAttribute('aria-label'))), ['Main headline'], 'one text field, the main headline');
    assert.equal(await top(eyebrowButton) < await top(main), true, 'the eyebrow\'s button above');
    assert.equal(await top(subheadlineButton) > await top(main), true, 'the subheadline\'s below');
    for (const label of ['Eyebrow', 'Subheadline']) assert.equal(await headline.getByText(label, { exact: true }).filter({ visible: true }).count(), 0, `no label ${label}`);
    await headline.getByText('Main headline', { exact: true }).filter({ visible: true }).waitFor();

    // A click opens the eyebrow, above the main headline, with the focus in it.
    await eyebrowButton.click();
    const eyebrow = textbox('Eyebrow');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Eyebrow');
    assert.equal(await eyebrow.getAttribute('placeholder'), 'Eyebrow', 'its placeholder says what it is');
    assert.equal(await top(eyebrow) < await top(main), true);
    assert.equal(await headline.getByText('Eyebrow', { exact: true }).filter({ visible: true }).count(), 0, 'still no label');
    await page.keyboard.type('Coast');
    await page.keyboard.press('Tab');
    assert.equal(await eyebrow.inputValue(), 'Coast', 'a part with something in it stays open');
    // Emptied, it is its button again, once the focus has left it.
    await eyebrow.fill('');
    await page.keyboard.press('Tab');
    await eyebrowButton.waitFor();
    assert.equal(await textbox('Eyebrow').count(), 0);

    // The keyboard opens the subheadline, below the main headline, with the focus in it.
    await subheadlineButton.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Subheadline');
    assert.equal(await top(textbox('Subheadline')) > await top(main), true);
    await page.keyboard.type('A walk along the quay');
    await main.fill('Harbour lights');
    await eyebrowButton.click();
    await page.keyboard.type('Coast');

    // Clear, from the group's menu, empties all three, and leaves the two buttons.
    await menu('group-headline');
    await choose('Clear');
    await eyebrowButton.waitFor();
    await subheadlineButton.waitFor();
    assert.equal(await main.inputValue(), '');
    assert.deepEqual(await headline.getByRole('textbox').evaluateAll((all) => all.map((one) => one.getAttribute('aria-label'))), ['Main headline']);
  });

  test('revert, restore and clear every field a group covers, and never restore a required field without a default to nothing', async () => {
    await open('articles');
    await textbox('Working name').fill('Harbour lights');
    await page.getByRole('button', { name: '+ Add an eyebrow' }).click();
    await textbox('Eyebrow').fill('Coast');
    await textbox('Main headline').fill('Harbour lights at dusk');
    await page.getByRole('button', { name: '+ Add a subheadline' }).click();
    await textbox('Subheadline').fill('A walk along the quay');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => /\/entries\//.test(window.location.hash));
    await page.getByRole('button', { name: 'Cancel Editing' }).click();
    // Sveltia's list names the post by its working name, which its group holds.
    await page.getByText('Harbour lights', { exact: true }).first().click();
    await textbox('Main headline').waitFor();
    assert.equal(await textbox('Eyebrow').inputValue(), 'Coast', 'the source file read back into the group');

    assert.deepEqual(await menu('group-headline'), { 'Revert Changes': false, 'Restore Default': true, Clear: true }, 'nothing to revert yet');
    await page.keyboard.press('Escape');
    await textbox('Main headline').fill('Lights out');
    await textbox('Eyebrow').fill('Inland');
    assert.equal((await menu('group-headline'))['Revert Changes'], true);
    await choose('Revert Changes');
    assert.equal(await textbox('Main headline').inputValue(), 'Harbour lights at dusk');
    assert.equal(await textbox('Eyebrow').inputValue(), 'Coast');

    // The main headline is required and has no default, so restoring keeps it, and the optional
    // parts, emptied, are their buttons again.
    await menu('group-headline');
    await choose('Restore Default');
    assert.equal(await textbox('Main headline').inputValue(), 'Harbour lights at dusk');
    await page.getByRole('button', { name: '+ Add an eyebrow' }).waitFor();
    await page.getByRole('button', { name: '+ Add a subheadline' }).waitFor();
    assert.deepEqual(await menu('group-headline'), { 'Revert Changes': true, 'Restore Default': false, Clear: true }, 'restored, so greyed');
    await choose('Clear');
    assert.equal(await textbox('Main headline').inputValue(), '');
    assert.equal((await menu('group-headline')).Clear, false);
    await page.keyboard.press('Escape');

    // Saving with the main headline empty is stopped, naming it.
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Main headline needs to be filled in.').first().waitFor();
    assert.match(await page.evaluate(() => window.location.hash), /\/entries\//);
  });

  test('give the slug made from the name as its default, from Restore Default and Clear, and grey Restore Default while it is that', async () => {
    await open('articles');
    await textbox('Working name').fill('Quiet quay');
    const slug = group('group-name').locator('[data-key-path="group-name.slug"] input');
    await page.waitForFunction(() => document.querySelector('[data-key-path="group-name.slug"] input')?.value === 'quiet-quay');
    assert.equal((await menu('group-name'))['Restore Default'], false, 'the slug is the name\'s, and the working name is required');
    await page.keyboard.press('Escape');

    await group('group-name').getByRole('button', { name: 'Change' }).click();
    await slug.fill('a-quay-of-my-own');
    await group('group-name').getByRole('button', { name: 'Save' }).click();
    await textbox('Breadcrumb').fill('Quay');
    assert.equal(await slug.inputValue(), 'a-quay-of-my-own', 'changed on purpose, it follows nothing');
    assert.equal((await menu('group-name'))['Restore Default'], true);
    await choose('Restore Default');
    assert.equal(await textbox('Working name').inputValue(), 'Quiet quay', 'required, with no default, so kept');
    assert.equal(await textbox('Breadcrumb').inputValue(), '');
    assert.equal(await slug.inputValue(), 'quiet-quay', 'the slug made from the name');
    assert.equal((await menu('group-name'))['Restore Default'], false);

    // Clear empties the name too, and the slug is then the one made from the name as it is
    // written again.
    await choose('Clear');
    assert.equal(await textbox('Working name').inputValue(), '');
    assert.equal(await slug.inputValue(), '');
    assert.equal((await menu('group-name')).Clear, false);
    await page.keyboard.press('Escape');
    await textbox('Working name').fill('Harbour wall');
    await page.waitForFunction(() => document.querySelector('[data-key-path="group-name.slug"] input')?.value === 'harbour-wall');
  });

  test('work with the keyboard alone', async () => {
    await open('articles');
    await textbox('Working name').fill('Keys');
    await group('group-name').getByRole('button', { name: 'Show Field Options' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Revert Changes');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Clear');
    await page.keyboard.press('Enter');
    assert.equal(await textbox('Working name').inputValue(), '');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await page.getByRole('menu').waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Show Field Options', 'Escape leaves the focus on the menu\'s button');
  });

  test('has asked nothing outside, and broken no policy', () => {
    assert.deepEqual(seen.outside, []);
    assert.deepEqual(seen.refused, []);
    assert.deepEqual(seen.errors, []);
  });
});

// The editor's own check at Save, which stops a scheduled post whose moment is not ahead, so
// that a slip of the year publishes nothing early. The intake publishes such a post at once,
// with a warning, which is for a file saved some other way (ADR 0069).
describe('a scheduled post at Save in Sveltia', () => {
  let site;
  let page;
  let seen;

  before(async () => {
    const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
    const config = cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
    site = await openFieldPage({ config: { ...config, backend: { name: 'test-repo' } } });
    ({ page, seen } = await site.newPage({ viewport: { width: 1400, height: 1200 } }));
    await page.getByRole('button', { name: 'Work with Test Repository' }).click();
    await page.getByText('Articles', { exact: true }).first().waitFor();
  }, { timeout: 120_000 });

  after(() => site?.close());

  test('is refused with a moment in the past, saying why, and saves with one ahead', async () => {
    await openNew(page, 'articles');
    // An article needs its main headline, and nothing else but its moment can stop it here.
    await page.getByRole('textbox', { name: 'Working name', exact: true }).fill('Out on time');
    await page.getByRole('textbox', { name: 'Main headline', exact: true }).fill('Out on time');
    await page.getByRole('radio', { name: 'Scheduled' }).click();
    const date = page.locator('[data-key-path="group-status.date"] input[type="datetime-local"]');
    await date.scrollIntoViewIfNeeded();
    await date.fill('2020-01-01T09:00');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByText('The site cannot publish this, so nothing has been saved').waitFor();
    await dialog.getByText('A scheduled post is published at its moment, which needs to lie ahead. Change the date and time, or choose another status.').waitFor();
    assert.equal(await dialog.getByText('Please try again later').count(), 0);
    await dialog.getByRole('button', { name: 'OK' }).click();
    assert.match(await page.evaluate(() => window.location.hash), /\/new$/, 'nothing is saved');
    assert.equal(await date.inputValue(), '2020-01-01T09:00', 'and the form is as it was');

    await date.fill('2999-01-01T09:00');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForFunction(() => /\/entries\//.test(window.location.hash));
  });

  test('has asked nothing outside, and broken no policy', () => {
    assert.deepEqual(seen.outside, []);
    assert.deepEqual(seen.refused, []);
    // Sveltia logs the refusal it showed, and nothing else.
    assert.deepEqual(seen.errors.map((one) => one.split('\n')[0]), ['Error: A scheduled post is published at its moment, which needs to lie ahead. Change the date and time, or choose another status.']);
  });
});

describe('the interface language in Sveltia', () => {
  let site;
  let page;
  let seen;
  let description;

  const origin = () => new URL(page.url()).origin;
  const bar = (name) => page.locator('button[aria-expanded]', { hasText: name }).first();
  // The core's settings group of breadcrumbs, opened down to the setting of articles, which
  // shows its heading, help and label in `words`.
  const breadcrumbs = async (words) => {
    await page.goto(`${origin()}/#/collections/settings/entries/settings`);
    await bar(words.heading).click();
    await page.getByText(words.description).waitFor();
    await bar(words.perType).click();
    await bar(words.articles).click();
    await page.getByText(words.label, { exact: true }).waitFor();
    await page.getByText(words.help).waitFor();
  };
  const newArticle = () => openNew(page, 'articles');
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
    description = siteDescription(declared);
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
    await page.getByRole('textbox', { name: 'Arbetsnamn', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Spara', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Working name', exact: true }).count(), 0);
  });

  // The status and date group: the status's choices, then the date and time with no label of
  // their own, which still names them for a screen reader, then the time zone under them.
  test('shows the status and date group in it: the status\'s choices, then the date and time without a label, then the time zone under them', async () => {
    await newArticle();
    const status = page.locator('section.field[data-key-path="group-status"]');
    const below = async (lower, upper) => {
      const [one, other] = [await lower.boundingBox(), await upper.boundingBox()];
      return one.y >= other.y + other.height;
    };
    const choices = status.getByRole('radiogroup', { name: 'Status' });
    for (const choice of ['Utkast', 'Schemalagd', 'Publicerad']) await choices.getByRole('radio', { name: choice }).waitFor();
    assert.equal(await status.getByText('Status', { exact: true }).filter({ visible: true }).count(), 1, 'the status\'s label');
    const date = status.getByLabel('Datum', { exact: true });
    assert.equal(await date.getAttribute('type'), 'datetime-local');
    assert.equal(await status.getByText('Datum', { exact: true }).filter({ visible: true }).count(), 0, 'no label of its own');
    await status.getByRole('button', { name: 'Nu', exact: true }).waitFor();
    assert.equal(await below(date, choices), true, 'the date and time under the choices');
    assert.equal(await below(status.getByText('UTC', { exact: true }), date), true, 'the time zone under them');
    assert.equal(await status.getByText(/Draft|Scheduled|Published|Date|Now/).count(), 0, 'nothing in English');
  });

  // A page and a canvas take the article's sections that they have, in its order, the status and
  // date group among them, in the interface language as an article does.
  test('shows a page\'s and a canvas\'s sections in it, in the article\'s order, with the status and date group and the teaser', async () => {
    for (const [collection, order] of [
      ['pages', ['group-name', 'group-status', 'parent', 'body', 'teaser', 'search', 'sharing', 'structured', 'otherAddresses']],
      ['canvases', ['group-name', 'group-status', 'body', 'teaser', 'search', 'sharing', 'structured', 'otherAddresses']],
    ]) {
      await openNew(page, collection);
      const sections = await page.evaluate(() => [...document.querySelectorAll('section.field[data-key-path]')].map((one) => one.dataset.keyPath).filter((key) => !key.includes('.')));
      assert.deepEqual(sections, order, collection);
      const name = page.locator('section.field[data-key-path="group-name"]');
      for (const label of ['Titel', 'Brödsmula', 'Slug']) await name.getByText(label, { exact: true }).first().waitFor();
      const status = page.locator('section.field[data-key-path="group-status"]');
      const choices = status.getByRole('radiogroup', { name: 'Status' });
      for (const choice of ['Utkast', 'Schemalagd', 'Publicerad']) await choices.getByRole('radio', { name: choice }).waitFor();
      assert.equal(await status.getByLabel('Datum', { exact: true }).getAttribute('type'), 'datetime-local');
      assert.equal(await status.getByText('Datum', { exact: true }).filter({ visible: true }).count(), 0, 'no label of its own');
      await status.getByText('UTC', { exact: true }).waitFor();
      assert.equal(await status.getByText(/Draft|Scheduled|Published|Date|Now/).count(), 0, 'nothing in English');
      await page.locator('section.field[data-key-path="teaser"]').scrollIntoViewIfNeeded();
      await bar('Puff').waitFor();
      assert.equal(await bar('Teaser').count(), 0);
    }
  });

  test('shows the core\'s settings groups in it, Breadcrumbs and Related posts among them, with their headings, labels and help', async () => {
    await breadcrumbs({ heading: 'Brödsmulor', description: 'Om en sidas brödsmulor slutar med sidan själv', perType: 'Per inläggstyp', articles: 'Artiklar', label: 'Sidan själv sist', help: 'När den är av slutar brödsmulorna' });
    assert.equal(await bar('Breadcrumbs').count(), 0);
    // Related posts, their freshness and its half-life. Sveltia puts a long form's fields on
    // the page only as a person scrolls near them, so the wheel turns over the form until the
    // half-life is there.
    await bar('Relaterade inlägg').click();
    await page.getByText('Hur ”Rekommenderad läsning” under ett inlägg').waitFor();
    await page.getByRole('switch', { name: 'Färskhet' }).waitFor();
    const halfLife = page.locator('section.field[data-key-path="related.halfLife"]');
    const box = await page.locator('section.field[data-key-path="related"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, Math.min(Math.max(box.y + 5, 10), page.viewportSize().height - 10));
    for (let tries = 0; await halfLife.count() === 0 && tries < 40; tries += 1) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(250);
    }
    await halfLife.scrollIntoViewIfNeeded();
    await halfLife.getByText('Halveringstid i dagar', { exact: true }).waitFor();
    await halfLife.getByText('Antalet dagar på vilka ett inläggs färskhet halveras').waitFor();
    assert.equal(await bar('Related posts').count(), 0);
  });

  test('is the editor\'s own once chosen in Sveltia\'s preferences, which loads the editor again in it', async () => {
    await choose({ menu: 'Visa användarkontomeny', settings: 'Inställningar', language: 'Språk', select: 'Välj språk' }, /English \(UK\)/);
    await page.getByText('Articles', { exact: true }).first().waitFor();
    await newArticle();
    await page.getByRole('textbox', { name: 'Working name', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Save', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox', { name: 'Arbetsnamn', exact: true }).count(), 0);
    await breadcrumbs({ heading: 'Breadcrumbs', description: 'Whether a page\'s breadcrumbs end with the page itself', perType: 'By type of post', articles: 'Articles', label: 'The page itself last', help: 'Off, the breadcrumbs end at the level above the page.' });
    assert.equal(await bar('Brödsmulor').count(), 0);
  });

  test('stays the editor\'s at the next visit, and Automatic gives the site\'s again', async () => {
    await page.reload();
    await newArticle();
    await page.getByRole('textbox', { name: 'Working name', exact: true }).waitFor();
    await choose({ menu: 'Show Account Menu', settings: 'Settings', language: 'Language', select: 'Select Language' }, 'Automatic');
    await newArticle();
    await page.getByRole('textbox', { name: 'Arbetsnamn', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Spara', exact: true }).waitFor();
  });

  // A refusal at Save and in the publish status, in the interface language, naming the block,
  // the field or the file, for an editor who has chosen none and so has the site's, and for one
  // who has chosen English, each in a browser of their own, so the body field's toggle and the
  // Publishing page are found by either name. The status is the service's answer, as the intake
  // shapes each refusal in it: a file's among them, a menu's, a redirect rule's, whose reason
  // holds why its target cannot be, and a declared service's.
  test('refuses at Save and in the publish status in the interface language, naming what it is about', async () => {
    const answer = {
      posts: [{ file: 'pages/aaaaaaaaaaaa.md', version: 'v1', status: 'failed', stillShown: false, id: 'aaaaaaaaaaaa', type: 'page', title: 'Untitled', refusals: [named({ post: { id: 'aaaaaaaaaaaa', type: 'page', title: 'aaaaaaaaaaaa' }, file: 'pages/aaaaaaaaaaaa.md', field: fieldNamed(description.types.page, 'title'), reason: say('refusal.title-empty') })] }],
      others: {
        refusals: [
          named({ file: 'menus/main.json', entry: '1', reason: say('refusal.menu-title') }),
          named({ file: 'redirects.json', entry: '2', reason: say('refusal.rule-target', { source: '/old/', reason: say('about.target-form', { target: 'old' }) }) }),
          named({ file: 'services.json', setting: 'pixel.storage.1.kind', reason: say('refusal.service-storage-kind', { kind: '"flash"', kinds: { and: ['cookie', 'localStorage', 'sessionStorage', 'other'] } }) }),
        ],
        warnings: [],
      },
      reason: null,
      at: '2026-11-10T12:00:00Z',
    };
    const editors = [
      {
        locale: null, start: 'Arbeta med test-repo', title: 'Titel', save: 'Spara',
        refusal: 'Block 1: webbplatsen kan inte publicera en rubrik på nivå 1: inläggets titel är dess nivå 1; använd en nivå från 2 till 6',
        post: 'fältet Titel: webbplatsen kan inte publicera ett inlägg utan titel; ge det en',
        files: [
          'Filen menus/main.json, post 1: posten har ingen etikett; ge den en, eller välj ett inlägg',
          'Filen redirects.json, post 2: regeln från /old/ kan inte svara så: "old" är varken en adress på webbplatsen, med ett snedstreck först, eller en https://-adress',
          'Filen services.json, inställningen pixel.storage.1.kind: "flash" är ingen typ av lagring; typerna är cookie, localStorage, sessionStorage och other',
        ],
      },
      {
        locale: 'en-GB', start: 'Work with Test Repository', title: 'Title', save: 'Save',
        refusal: 'Block 1: the site cannot publish a heading at level 1: the post\'s title is its level 1; use a level from 2 to 6',
        post: 'the field Title: the site cannot publish a post without a title; give it one',
        files: [
          'The file menus/main.json, entry 1: the entry has no label; give it one, or choose a post',
          'The file redirects.json, entry 2: the rule from /old/ cannot answer so: "old" is neither an address on the site, starting with a slash, nor an https:// address',
          'The file services.json, the setting pixel.storage.1.kind: "flash" is no kind of storage; the kinds are cookie, localStorage, sessionStorage and other',
        ],
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
        for (const file of editor.files) await own.page.getByText(file).waitFor();
        assert.deepEqual(own.seen.outside, []);
        assert.deepEqual(own.seen.refused, []);
      } finally {
        await own.context.close();
      }
    }
  });

  // A scheduled post the intake published at once, since its moment had passed when it was
  // first read: live, with the warning, its moment in the interface language's own form and
  // in the browser's time zone.
  test('warns in the publish status, in the interface language, of a scheduled post published at once', async () => {
    const post = { id: 'bbbbbbbbbbbb', type: 'article', title: 'Imported long ago' };
    const answer = {
      posts: [{ file: 'articles/bbbbbbbbbbbb.md', version: 'v1', status: 'live', ...post, address: '/imported-long-ago/', warnings: [named({ post, file: 'articles/bbbbbbbbbbbb.md', field: fieldNamed(description.types.article, 'date'), reason: say('warning.scheduled-passed', { moment: { moment: '2026-01-01T12:00:00Z' } }) })] }],
      others: { refusals: [], warnings: [] },
      reason: null,
      at: '2026-11-10T12:00:00Z',
    };
    const editors = [
      {
        locale: null, start: 'Arbeta med test-repo', words: 'Publicerad på webbplatsen, men se över det här:',
        warning: /^fältet Datum: inlägget är schemalagt till 1 januari 2026 kl\. \d\d:00 \S+, en tidpunkt som redan hade passerat när webbplatsen först läste det, så det publiceras direkt, med den tidpunkten som datum$/,
      },
      {
        locale: 'en-GB', start: 'Work with Test Repository', words: 'Live on the site, with something to look at:',
        warning: /^the field Date: the post is scheduled for 1 January 2026 at \d\d:00 \S+, which had already passed when the site first read it, so it is published at once, with that moment as its date$/,
      },
    ];
    for (const editor of editors) {
      const own = await site.newPage({ language: 'en-US', viewport: { width: 1400, height: 1200 } });
      try {
        await own.context.route('**/_konzilo/status', (route) => route.fulfill({ json: answer }));
        await own.page.getByRole('button', { name: editors[0].start }).waitFor();
        if (editor.locale) {
          await own.page.evaluate((locale) => localStorage.setItem('sveltia-cms.prefs', JSON.stringify({ locale })), editor.locale);
          await own.page.reload();
        }
        await own.page.getByRole('button', { name: editor.start }).click();
        // The service asks Forgejo who is asking, so the page sends what Sveltia signed in with.
        await own.page.waitForFunction(() => localStorage.getItem('sveltia-cms.user') !== null);
        await own.page.evaluate(() => localStorage.setItem('sveltia-cms.user', JSON.stringify({ ...JSON.parse(localStorage.getItem('sveltia-cms.user')), token: 'a-token' })));
        await own.page.goto(`${new URL(own.page.url()).origin}/#/collections/pages`);
        await own.page.getByRole('radio', { name: /^(?:Publishing|Publicering)$/ }).click();
        const row = own.page.getByRole('row', { name: /Imported long ago/ });
        await row.getByText(editor.words).waitFor();
        await row.getByText(editor.warning).waitFor();
        assert.deepEqual(own.seen.outside, []);
        assert.deepEqual(own.seen.refused, []);
        assert.deepEqual(own.seen.errors, []);
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

describe('the body field, the preview and the publish status in the interface language', () => {
  const PREVIEW = 'http://localhost:3';
  // What each says, by the interface language, and Sveltia's own words for its menus there.
  const SWEDISH = {
    title: 'Titel',
    pages: 'Sidor',
    toggle: 'Visa Markdown',
    image: 'Välj bild…',
    find: 'Hitta en text på sidan',
    remove: 'Ta bort',
    removeAsk: 'Ta bort stycke?',
    notSaved: 'Inte sparad än.',
    refused: /^Webbplatsen kan inte publicera det här än, så sidan nedan är den senaste som gick\. Det här behöver ändras:/,
    frame: 'Sidan så som den skulle se ut',
    beside: 'Förhandsvisning: bredvid',
    sveltia: { options: 'Visa redigeringsalternativ', menu: 'Visa användarkontomeny', settings: 'Inställningar', language: 'Språk', select: 'Välj språk' },
  };
  const ENGLISH = {
    title: 'Title',
    pages: 'Pages',
    toggle: 'Show Markdown',
    image: 'Choose an image…',
    find: 'Find a text on the page',
    remove: 'Remove',
    removeAsk: 'Remove paragraph?',
    notSaved: 'Not saved yet.',
    refused: /^The site cannot publish this yet, so the page below is the last good one\. What to change:/,
    frame: 'The page as it would look',
    beside: 'Preview: beside',
    sveltia: { options: 'Show Editor Options', menu: 'Show Account Menu', settings: 'Settings', language: 'Language', select: 'Select Language' },
  };

  let site;
  let page;
  let seen;

  const origin = () => new URL(page.url()).origin;
  const open = (collection) => openNew(page, collection, '.konzilo-body-visual .ProseMirror, .konzilo-tree-host');
  // Sveltia's own choice of language, in its preferences, from the list of pages, which shows
  // again, named in the language chosen, `to`, once Sveltia has signed in anew.
  const choose = async ({ sveltia }, option, to) => {
    await page.goto(`${origin()}/#/collections/pages`);
    await page.getByRole('button', { name: sveltia.menu }).click();
    await page.getByRole('menuitem', { name: sveltia.settings }).click();
    await page.getByRole('tab', { name: sveltia.language }).click();
    await page.getByRole('combobox', { name: sveltia.select }).click();
    const loaded = page.waitForEvent('load');
    await page.getByRole('option', { name: option }).click();
    await loaded;
    await page.getByText(to.pages, { exact: true }).first().waitFor();
  };
  // Every text of the body field, the image field, the structure field, the preview and the
  // publish status in one language, `words`, beside Sveltia's own in it.
  const speaks = async (words) => {
    // The test repository signs in with no token, at each load, and the pane needs one to show.
    await page.evaluate(() => {
      const user = JSON.parse(localStorage.getItem('sveltia-cms.user'));
      localStorage.setItem('sveltia-cms.user', JSON.stringify({ ...user, token: 'a-token' }));
    });
    await open('articles');
    const body = page.locator('.konzilo-body').first();
    assert.equal(await body.locator('.konzilo-body-toggle').textContent(), words.toggle);
    assert.equal(await page.locator('.field[data-key-path="image"] .konzilo-pick-choose').first().textContent(), words.image);

    await open('landings');
    // The publishing row, which a type of the site's own keeps.
    await page.getByText(words.notSaved).first().waitFor();
    assert.equal(await page.locator('.konzilo-tree-search').first().getAttribute('placeholder'), words.find);
    // The question before a block goes names its kind in the middle of it, with a small letter.
    const tree = page.locator('.konzilo-tree-host').first();
    await tree.locator('.konzilo-tree-modes button').nth(1).click();
    await tree.locator('.konzilo-tree-source').fill('Ett stycke.');
    await tree.locator('.konzilo-tree-modes button').nth(0).click();
    const asked = new Promise((resolve) => {
      page.once('dialog', (dialog) => {
        resolve(dialog.message());
        void dialog.dismiss();
      });
    });
    // A row's buttons show while it is pointed at.
    const row = tree.locator('li[data-kind="paragraph"] > .konzilo-tree-row').first();
    await row.hover();
    await row.getByRole('button', { name: words.remove, exact: true }).click();
    assert.equal(await asked, words.removeAsk);

    await open('pages');
    await page.getByRole('textbox', { name: words.title, exact: true }).first().fill('En sida');
    const pane = page.frameLocator('iframe.preview');
    const alert = pane.getByRole('alert');
    await alert.waitFor();
    assert.match(await alert.textContent(), words.refused);
    assert.equal(await pane.locator('iframe').first().getAttribute('title'), words.frame);
    await page.getByRole('button', { name: words.sveltia.options }).click();
    await page.getByRole('menuitemradio', { name: words.beside }).waitFor();
    await page.keyboard.press('Escape');
  };

  // A Swedish site, opened in a browser in American English, which decides nothing, with a
  // live preview that answers each draft with a refusal and a page.
  before(async () => {
    const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
    declared.language = 'sv_SE';
    declared.types.landing = { label: 'Landing', plural: 'Landings', collection: 'landings', address: '/landings/{slug}/', elements: ['paragraph', 'heading', 'list'], editor: 'structure', fields: {} };
    const description = siteDescription(declared);
    const made = (language) => ({
      ...cmsConfig(description, { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2', preview: PREVIEW, language }),
      backend: { name: 'test-repo' },
    });
    site = await openFieldPage({ configs: { 'config.json': made(), 'config.sv.json': made('sv'), 'config.en.json': made('en') } });
    let context;
    ({ page, seen, context } = await site.newPage({ language: 'en-US', viewport: { width: 1600, height: 1000 } }));
    await context.route(`${PREVIEW}/**`, (route) => {
      const asked = route.request();
      const headers = { 'access-control-allow-origin': origin(), 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST' };
      if (asked.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (asked.url().endsWith('/session')) return route.fulfill({ status: 200, headers, json: {} });
      if (asked.url().endsWith('/draft')) return route.fulfill({ status: 200, headers, json: { address: '/a-page/', refusals: [{ field: 'title', reason: 'x' }] } });
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>The page</h1>', headers: { 'content-security-policy': `frame-ancestors ${origin()}` } });
    });
    await page.getByRole('button', { name: 'Arbeta med test-repo' }).click();
    // The built-in pages are named in the interface language.
    await page.getByText(SWEDISH.pages, { exact: true }).first().waitFor();
  }, { timeout: 120_000 });

  after(() => site?.close());

  test('are the site\'s, Swedish, for an editor in an English browser who has chosen none, as the form is', async () => {
    await speaks(SWEDISH);
  });

  test('are all in English once the editor chooses English', async () => {
    await choose(SWEDISH, /English \(UK\)/, ENGLISH);
    await speaks(ENGLISH);
  });

  test('are all in Swedish once the editor chooses Swedish, in the same English browser', async () => {
    await choose(ENGLISH, /svenska/i, SWEDISH);
    await speaks(SWEDISH);
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
      // Sveltia mounts a field as it comes into view, the one before it first.
      await inPane.locator('.field[data-key-path="search.description"]').scrollIntoViewIfNeeded();
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

// A label in the middle of a phrase starts with a small letter, as in "Lägg till annan adress", but
// for an abbreviation, and begins with a capital where Sveltia shows the same text alone (ADR
// 0066); and a site's own fields on the built-in article stand in a group of their own, while a
// type of the site's own keeps its order, and a required field standing alone has the core's menu
// (ADR 0071). Each engine draws a first letter itself.
for (const [engineName, engine] of Object.entries(ENGINES)) {
  describe(`labels in phrases and a site's own fields in Sveltia, in ${engineName}`, () => {
    let site;
    let page;
    let seen;

    const origin = () => new URL(page.url()).origin;
    const open = (collection) => openNew(page, collection);
    const group = (name) => page.locator(`section.field[data-key-path="${name}"]`);
    // What a person reads: the text as drawn, with the capital the stylesheet gives it, and
    // without the marks Sveltia keeps a name apart with, which nobody sees.
    const read = async (locator) => (await locator.innerText()).replace(/[\u2066-\u2069]/g, '').replace(/\s+/g, ' ').trim();
    const title = async () => (await page.title()).replace(/[\u2066-\u2069]/g, '');
    const sections = () => page.evaluate(() => [...document.querySelectorAll('section.field[data-key-path]')].map((one) => one.dataset.keyPath).filter((key) => !key.includes('.')));

    // A Swedish site, with fields of its own on the article, and a type of its own called FAQ,
    // which has a field of one of their names too, and a required question.
    before(async () => {
      const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
      declared.language = 'sv_SE';
      declared.types.article.fields = {
        rating: { label: { en: 'Rating', sv: 'Betyg' }, type: 'integer', control: 'number', required: true },
        mood: { label: { en: 'Mood', sv: 'Stämning' }, type: 'string', control: 'select', options: ['calm', 'stormy'] },
      };
      declared.types.faq = {
        label: 'FAQ',
        plural: 'FAQ',
        collection: 'faqs',
        address: '/faq/{slug}/',
        elements: ['paragraph'],
        fields: { question: { label: { en: 'Question', sv: 'Fråga' }, type: 'string', control: 'text', required: true }, headline: { required: true }, rating: { label: { en: 'Stars', sv: 'Stjärnor' }, type: 'integer', control: 'number' }, seo: {} },
      };
      const config = { ...cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' }), backend: { name: 'test-repo' } };
      site = await openFieldPage({ engine, configs: { 'config.json': config, 'config.sv.json': config } });
      ({ page, seen } = await site.newPage({ language: 'sv-SE', viewport: { width: 1400, height: 1200 } }));
      await page.getByRole('button', { name: 'Arbeta med test-repo' }).click();
      await page.getByText('Artiklar', { exact: true }).first().waitFor();
    }, { timeout: 120_000 });

    after(() => site?.close());

    test('reads "Lägg till annan adress" and "0 andra adresser" under the heading "Andra adresser", and adds a category and a topic with a small letter', async () => {
      await open('articles');
      assert.equal(await title(), 'Skapar artikel – Konzilo');
      const other = group('otherAddresses');
      await other.scrollIntoViewIfNeeded();
      const heading = other.locator(':scope > header > h4');
      assert.equal(await read(heading), 'Andra adresser');
      assert.equal(await read(other.locator('.summary')), '0 andra adresser');
      const add = other.getByRole('button', { name: /^Lägg till .?annan adress.?$/ });
      assert.equal(await read(add.locator('.label')), 'Lägg till annan adress');
      await add.click();
      assert.equal(await read(other.locator('.summary')), '1 annan adress');
      for (const name of ['Lägg till kategori', 'Lägg till ämne']) {
        assert.equal(await group('group-terms').locator('button .label').evaluateAll((all, one) => all.some((label) => label.innerText.replace(/[\u2066-\u2069]/g, '').trim() === one), name), true, name);
      }
    });

    test('keeps the capitals of an abbreviation, such as FAQ, and begins each kind of post with a capital in the menu that makes one', async () => {
      await page.goto(`${origin()}/#/collections/articles`);
      await page.getByRole('button', { name: 'Skapa post eller resurser' }).click();
      const items = page.getByRole('menu').getByRole('menuitem');
      await items.first().waitFor();
      const shown = await items.evaluateAll((all) => all.map((one) => one.innerText.trim()));
      for (const name of ['Artikel', 'Sida', 'FAQ', 'Kategori', 'Ämne', 'Bild']) assert.ok(shown.includes(name), `${name} in ${shown}`);
      await page.keyboard.press('Escape');
      await open('faqs');
      assert.equal(await title(), 'Skapar FAQ – Konzilo');
      await page.locator('button[aria-expanded]', { hasText: 'Strukturerad data' }).first().click();
      const preset = group('structured').locator('option[value=""]');
      await preset.waitFor({ state: 'attached' });
      assert.match(await preset.textContent(), /\(förvald för FAQ\)$/);
    });

    test('hold the article\'s own fields in a group of their own, after the body and before the teaser, with one menu that never restores a required field to nothing', async () => {
      await open('articles');
      assert.deepEqual(await sections(), ['group-name', 'group-status', 'image', 'group-terms', 'group-headline', 'standfirst', 'body', 'group-own', 'teaser', 'search', 'sharing', 'structured', 'otherAddresses']);
      const own = group('group-own');
      await own.scrollIntoViewIfNeeded();
      for (const label of ['Betyg', 'Stämning']) assert.equal(await own.getByText(label, { exact: true }).count(), 1, label);
      await own.hover();
      assert.equal(await own.getByRole('button', { name: 'Visa fältalternativ' }).filter({ visible: true }).count(), 1);
      await own.getByRole('spinbutton', { name: 'Betyg' }).fill('4');
      await own.getByRole('radio', { name: 'stormy' }).check();
      await own.getByRole('button', { name: 'Visa fältalternativ' }).click();
      await page.getByRole('menu').getByRole('menuitem', { name: 'Återställ standardvärde' }).click();
      await page.getByRole('menu').waitFor({ state: 'detached' });
      assert.equal(await own.getByRole('spinbutton', { name: 'Betyg' }).inputValue(), '4', 'required, with no default, so kept');
      assert.equal(await own.getByRole('radio', { name: 'stormy' }).isChecked(), false);

      // Saved, and read back into the group.
      await own.getByRole('radio', { name: 'calm' }).check();
      await page.getByRole('textbox', { name: 'Arbetsnamn', exact: true }).fill(`Lanterns in ${engineName}`);
      await page.getByRole('textbox', { name: 'Huvudrubrik', exact: true }).fill('Lanterns along the quay');
      await page.getByRole('button', { name: 'Spara', exact: true }).click();
      await page.waitForFunction(() => /\/entries\//.test(window.location.hash));
      await page.goto(`${origin()}/#/collections/articles`);
      await page.getByText(`Lanterns in ${engineName}`, { exact: true }).first().click();
      await group('group-own').scrollIntoViewIfNeeded();
      assert.equal(await group('group-own').getByRole('spinbutton', { name: 'Betyg' }).inputValue(), '4');
      assert.equal(await group('group-own').getByRole('radio', { name: 'calm' }).isChecked(), true);
    });

    test('keep a type of the site\'s own in the order it declares, with the core\'s fields in their groups and its field named as the article\'s own where it is, and save it', async () => {
      await open('faqs');
      assert.deepEqual(await sections(), ['group-name', 'group-status', 'publishing', 'body', 'question', 'group-headline', 'rating', 'search', 'sharing', 'structured', 'otherAddresses']);
      await group('rating').scrollIntoViewIfNeeded();
      await group('rating').getByRole('spinbutton', { name: 'Stjärnor' }).fill('3');
      await group('question').getByRole('textbox', { name: 'Fråga', exact: true }).fill('Var ligger hamnen?');
      await page.getByRole('textbox', { name: 'Arbetsnamn', exact: true }).fill(`Harbour in ${engineName}`);
      await page.getByRole('textbox', { name: 'Huvudrubrik', exact: true }).fill('Where the harbour is');
      await page.getByRole('button', { name: 'Spara', exact: true }).click();
      await page.waitForFunction(() => /\/entries\//.test(window.location.hash));
      await page.goto(`${origin()}/#/collections/faqs`);
      await page.getByText(`Harbour in ${engineName}`, { exact: true }).first().click();
      await group('rating').scrollIntoViewIfNeeded();
      assert.equal(await group('rating').getByRole('spinbutton', { name: 'Stjärnor' }).inputValue(), '3', 'read back where it stands');
      assert.equal(await group('question').getByRole('textbox', { name: 'Fråga', exact: true }).inputValue(), 'Var ligger hamnen?');
    });

    // Sveltia's own menu would restore it to nothing, so it stands in a group of the core's alone.
    test('give a required field standing alone one menu, which greys Restore Default and keeps what it holds, and stop a save without it, naming it', async () => {
      await open('faqs');
      const question = group('question');
      const box = question.getByRole('textbox', { name: 'Fråga', exact: true });
      await box.fill('Var ligger hamnen?');
      await question.hover();
      const options = question.getByRole('button', { name: 'Visa fältalternativ' }).filter({ visible: true });
      assert.equal(await options.count(), 1);
      await options.click();
      const items = page.getByRole('menu').getByRole('menuitem');
      const offered = Object.fromEntries(await items.evaluateAll((all) => all.map((one) => [one.textContent, one.getAttribute('aria-disabled') !== 'true'])));
      assert.deepEqual(offered, { 'Återställ ändringar': true, 'Återställ standardvärde': false, Rensa: true });
      await page.getByRole('menu').getByRole('menuitem', { name: 'Återställ standardvärde' }).click({ force: true });
      assert.equal(await box.inputValue(), 'Var ligger hamnen?', 'greyed, and does nothing');
      await page.getByRole('menu').getByRole('menuitem', { name: 'Rensa' }).click();
      await page.getByRole('menu').waitFor({ state: 'detached' });
      assert.equal(await box.inputValue(), '');

      await page.getByRole('textbox', { name: 'Arbetsnamn', exact: true }).fill(`No question in ${engineName}`);
      await page.getByRole('textbox', { name: 'Huvudrubrik', exact: true }).fill('No question');
      await page.getByRole('button', { name: 'Spara', exact: true }).click();
      await page.getByText('Fråga behöver fyllas i.').first().waitFor();
      assert.match(await page.evaluate(() => window.location.hash), /\/new/);
    });

    test('has asked nothing outside, and broken no policy', () => {
      assert.deepEqual(seen.outside, []);
      assert.deepEqual(seen.refused, []);
      assert.deepEqual(seen.errors, []);
    });
  });
}

// A setting the site's settings file holds no value for shows its default, and a save leaves the
// file holding only what differs from a default (ADR 0033). The test repository keeps its files in
// the browser's own file system, where the settings file is written before the editor reads it and
// read again after each save. Playwright's WebKit has no such file system, and its test repository
// keeps its files in memory alone, so the suite runs in the other two engines.
for (const [engineName, engine] of Object.entries(ENGINES).filter(([name]) => name !== 'webkit')) {
  describe(`a setting's default in Sveltia, in ${engineName}`, () => {
    let site;
    let page;
    let seen;

    // A site that has set its title and the half-life of related posts, and nothing else.
    const SETTINGS = `${JSON.stringify({ title: 'The Gentle Garden', related: { halfLife: 30 } }, null, 2)}\n`;
    const fileSystem = (write) => page.evaluate(async (text) => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('sveltia-cms-test', { create: true });
      const handle = await root.getFileHandle('settings.json', { create: true });
      if (text === null) return (await handle.getFile()).text();
      const writer = await handle.createWritable();
      await writer.write(text);
      await writer.close();
      return text;
    }, write);
    const settingsFile = () => fileSystem(null);
    const origin = () => new URL(page.url()).origin;
    const bar = (name) => page.locator('button[aria-expanded]', { hasText: name }).first();
    const field = (keyPath) => page.locator(`section.field[data-key-path="${keyPath}"]`);
    // Sveltia draws a field as it comes near the window, so the form is scrolled until it is there.
    const near = async (keyPath) => {
      const box = await field('title').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + 5);
      for (let tries = 0; await field(keyPath).count() === 0 && tries < 40; tries += 1) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(150);
      }
      await field(keyPath).scrollIntoViewIfNeeded();
      return field(keyPath);
    };
    const switchOf = async (keyPath) => (await near(keyPath)).getByRole('switch');
    const numberOf = async (keyPath) => (await near(keyPath)).getByRole('spinbutton');
    // The settings as Sveltia holds them, in a form of their own: from the file at the first
    // opening, and as last saved after that.
    const openSettings = async () => {
      await page.goto(`${origin()}/#/collections/pages`);
      await page.locator('section.field').first().waitFor({ state: 'detached' });
      await page.goto(`${origin()}/#/collections/settings/entries/settings`);
      await bar('AI visibility').waitFor();
    };
    const open = async (name) => {
      if (await bar(name).getAttribute('aria-expanded') === 'false') await bar(name).click();
    };
    // What the settings file holds once Sveltia has saved it, as its notice of the save says, which
    // stays a few seconds: the last save's is gone first.
    const save = async () => {
      const saved = page.getByText('Entry saved.');
      await saved.first().waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await saved.first().waitFor();
      return settingsFile();
    };

    before(async () => {
      const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
      const config = cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
      site = await openFieldPage({ engine, config: { ...config, backend: { name: 'test-repo' } } });
      ({ page, seen } = await site.newPage({ viewport: { width: 1400, height: 1200 } }));
      await fileSystem(SETTINGS);
      await page.getByRole('button', { name: 'Work with Test Repository' }).click();
      await page.getByText('Pages', { exact: true }).first().waitFor();
    }, { timeout: 120_000 });

    after(() => site?.close());

    test('shows each setting\'s default where the file holds none, in a bar that stays closed while nothing in it is set', async () => {
      await openSettings();
      // The file holds no AI visibility, so its bar is closed, and its switches show their defaults.
      assert.equal(await bar('AI visibility').getAttribute('aria-expanded'), 'false');
      await open('AI visibility');
      await open('Start page');
      assert.equal(await (await switchOf('ai.home.markdown')).getAttribute('aria-checked'), 'true');
      assert.equal(await (await switchOf('ai.home.llmsFull')).getAttribute('aria-checked'), 'true');
      // The file holds the half-life of related posts, so that bar is open, and freshness, which
      // it lacks, shows its default beside it.
      assert.equal(await bar('Related posts').getAttribute('aria-expanded'), 'true');
      assert.equal(await (await switchOf('related.freshness')).getAttribute('aria-checked'), 'true');
      assert.equal(await (await numberOf('related.halfLife')).inputValue(), '30');
    });

    test('leaves the file as it was at a save after settings were changed and changed back', async () => {
      await openSettings();
      await open('AI visibility');
      await open('Start page');
      for (const keyPath of ['ai.home.markdown', 'related.freshness']) {
        const toggle = await switchOf(keyPath);
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-checked'), 'false', keyPath);
        await toggle.click();
        assert.equal(await toggle.getAttribute('aria-checked'), 'true', keyPath);
      }
      const halfLife = await numberOf('related.halfLife');
      await halfLife.fill('45');
      await halfLife.fill('30');
      // A switch of a group the file lacks, switched back, is a change to Sveltia, which saves.
      assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isEnabled(), true);
      assert.equal(await save(), SETTINGS);
    });

    test('keeps only what differs from a default: a switch turned off, and no half-life once it is the default again', async () => {
      await openSettings();
      await (await switchOf('related.freshness')).click();
      const halfLife = await numberOf('related.halfLife');
      await halfLife.fill('');
      await halfLife.pressSequentially('90');
      assert.equal(await halfLife.inputValue(), '90', 'what is typed shows as it is typed');
      const expected = `${JSON.stringify({ title: 'The Gentle Garden', related: { freshness: false } }, null, 2)}\n`;
      assert.equal(await save(), expected);
      // Opened again, the half-life shows its default.
      await openSettings();
      assert.equal(await (await numberOf('related.halfLife')).inputValue(), '90');
      assert.equal(await (await switchOf('related.freshness')).getAttribute('aria-checked'), 'false');
    });

    test('has asked nothing outside, and broken no policy', () => {
      assert.deepEqual(seen.outside, []);
      assert.deepEqual(seen.refused, []);
      assert.deepEqual(seen.errors, []);
    });
  });
}

// A value written in a closed bar whose object the file does not hold yet is in the file after
// Save, in a settings group, in a new post and in a post whose file lacks the object, and a bar
// opened and left adds nothing to the file (ADR 0029). Sveltia keeps a saved entry in memory, so
// the file read back decides: the test repository keeps its files in the browser's own file
// system, which Playwright's WebKit lacks, as above.
for (const [engineName, engine] of Object.entries(ENGINES).filter(([name]) => name !== 'webkit')) {
  describe(`a value written in a closed bar whose object the file lacks, in ${engineName}`, () => {
    let site;
    let page;
    let seen;

    // A site that has set its title and nothing else, and a page with no search, sharing,
    // structured data or teaser.
    const PAGE = '0a1b2c3d4e5f';
    const SEEDED = {
      'settings.json': `${JSON.stringify({ title: 'Demo' }, null, 2)}\n`,
      [`pages/${PAGE}.md`]: '---\ntitle: Quiet quay\nstatus: draft\n---\n\nThe quiet quay keeps the boats.\n',
    };
    // Every file of the test repository, by its path, after writing `written`.
    const files = (written = {}) => page.evaluate(async (given) => {
      const root = await (await navigator.storage.getDirectory()).getDirectoryHandle('sveltia-cms-test', { create: true });
      for (const [path, text] of Object.entries(given)) {
        let folder = root;
        for (const name of path.split('/').slice(0, -1)) folder = await folder.getDirectoryHandle(name, { create: true });
        const writer = await (await folder.getFileHandle(path.split('/').at(-1), { create: true })).createWritable();
        await writer.write(text);
        await writer.close();
      }
      const read = {};
      const walk = async (folder, prefix) => {
        for await (const [name, handle] of folder.entries()) {
          if (handle.kind === 'directory') await walk(handle, `${prefix}${name}/`);
          else read[`${prefix}${name}`] = await (await handle.getFile()).text();
        }
      };
      await walk(root, '');
      return read;
    }, written);
    const origin = () => new URL(page.url()).origin;
    const textbox = (name) => page.getByRole('textbox', { name, exact: true });
    const bar = (name) => page.locator('button[aria-expanded]', { hasText: name }).first();
    const open = async (name) => {
      await bar(name).scrollIntoViewIfNeeded();
      if (await bar(name).getAttribute('aria-expanded') === 'false') await bar(name).click();
    };
    const field = (keyPath) => page.locator(`section.field[data-key-path="${keyPath}"]`);
    // Sveltia draws a field as it comes near the window, so the form is scrolled until it is there,
    // from wherever it stands.
    const near = async (keyPath) => {
      const box = await field('title').boundingBox();
      await page.mouse.move(box.x + box.width / 2, 600);
      for (let tries = 0; await field(keyPath).count() === 0 && tries < 40; tries += 1) {
        await page.mouse.wheel(0, 400);
        await page.waitForTimeout(150);
      }
      await field(keyPath).scrollIntoViewIfNeeded();
      return field(keyPath);
    };
    // What a post's file holds of its closed bars.
    const bars = (data) => Object.fromEntries(['teaser', 'search', 'sharing', 'structured'].filter((name) => Object.hasOwn(data, name)).map((name) => [name, data[name]]));
    // The files once Sveltia has saved, as its notice of the save says, which stays a few seconds:
    // the last save's is gone first.
    const save = async () => {
      const saved = page.getByText('Entry saved.');
      await saved.first().waitFor({ state: 'detached' });
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      await saved.first().waitFor();
      return files();
    };

    before(async () => {
      const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
      const config = cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' });
      site = await openFieldPage({ engine, config: { ...config, backend: { name: 'test-repo' } } });
      ({ page, seen } = await site.newPage({ viewport: { width: 1400, height: 1200 } }));
      await files(SEEDED);
      await page.getByRole('button', { name: 'Work with Test Repository' }).click();
      await page.getByText('Pages', { exact: true }).first().waitFor();
    }, { timeout: 120_000 });

    after(() => site?.close());

    test('keeps a setting written in groups the settings file lacks, one within another, and nothing of a group opened and left', async () => {
      await page.goto(`${origin()}/#/collections/settings/entries/settings`);
      await bar('AI visibility').waitFor();
      await near('related');
      await open('Related posts');
      await (await near('related.halfLife')).getByRole('spinbutton').fill('30');
      await near('ai');
      await open('AI visibility');
      await open('Start page');
      await (await near('ai.home.markdown')).getByRole('switch').click();
      await near('consent');
      await open('Consent texts');
      const saved = await save();
      assert.deepEqual(JSON.parse(saved['settings.json']), { title: 'Demo', ai: { home: { markdown: false } }, related: { halfLife: 30 } });
    });

    test('keeps a value written in a closed bar of a new post, and nothing of the bars opened and left', async () => {
      await openNew(page, 'pages');
      await field('group-name').getByRole('textbox', { name: 'Title', exact: true }).fill('Filled in');
      await open('Search');
      await textbox('Title tag').fill('A title tag');
      for (const name of ['Teaser', 'Sharing', 'Structured data']) await open(name);
      const before = Object.keys(await files());
      const saved = await save();
      const made = Object.keys(saved).filter((path) => path.startsWith('pages/') && !before.includes(path));
      assert.equal(made.length, 1, 'one new page');
      assert.deepEqual(bars(frontMatterOf(saved[made[0]])), { search: { title: 'A title tag' } });
    });

    test('keeps a value written in a closed bar of a post whose file lacks its object, and nothing of the bars opened and left', async () => {
      // The form left goes first, as a new post's does (openNew).
      await page.evaluate((hash) => {
        for (const one of document.querySelectorAll('section.field')) one.dataset.left = '';
        window.location.hash = hash;
      }, `#/collections/pages/entries/${PAGE}`);
      await page.locator('section.field[data-left]').first().waitFor({ state: 'detached' });
      const title = field('group-name').getByRole('textbox', { name: 'Title', exact: true });
      await title.waitFor();
      assert.equal(await title.inputValue(), 'Quiet quay');
      await open('Search');
      await textbox('Title tag').fill('A quay of its own');
      for (const name of ['Teaser', 'Sharing', 'Structured data']) await open(name);
      const data = frontMatterOf((await save())[`pages/${PAGE}.md`]);
      assert.equal(data.title, 'Quiet quay');
      assert.deepEqual(bars(data), { search: { title: 'A quay of its own' } });
      assert.match(data.body, /The quiet quay keeps the boats\./);
    });

    test('has asked nothing outside, and broken no policy', () => {
      assert.deepEqual(seen.outside, []);
      assert.deepEqual(seen.refused, []);
      assert.deepEqual(seen.errors, []);
    });
  });
}
