// The live preview's pane in real Sveltia, on a site in two languages, against a service that
// is this test's: what it sends, in which language, and an image that has not been saved.
// compose.test.js's neighbour preview.test.js has the real service.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, beforeEach, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cmsConfig } from '../src/cms/config.js';
import { siteDescription } from '../src/site-description.js';
import { openFieldPage } from './lib/field-page.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const PREVIEW = 'http://localhost:3';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==';

describe('the preview\'s pane, on a site in two languages', () => {
  let site;
  let page;
  let seen;
  let drafts;
  let sessions;
  let answer;

  const newEntry = async (collection) => {
    await page.goto(`${new URL(page.url()).origin}/#/collections/${collection}/new`);
    await page.locator('.konzilo-body-visual .ProseMirror').first().waitFor();
  };
  const draftWith = async (check) => {
    for (let waited = 0; waited < 10_000; waited += 100) {
      const found = drafts.findLast(check);
      if (found) return found;
      await page.waitForTimeout(100);
    }
    throw new Error(`no such draft among ${JSON.stringify(drafts.map(({ path, fields }) => ({ path, title: fields.title })))}`);
  };
  const pane = () => page.frameLocator('iframe.preview');

  before(async () => {
    const { language: _one, ...declared } = JSON.parse(readFileSync(join(core, 'site-template/files/site-description.json'), 'utf8'));
    declared.languages = ['sv_SE', 'en_GB'];
    for (const type of Object.values(declared.types)) {
      if (typeof type.address === 'string') type.address = { sv_SE: type.address, en_GB: type.address.replace(/^\/(?=[a-z]+\/)/, '/en-') };
    }
    const config = cmsConfig(siteDescription(declared), { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2', preview: PREVIEW });
    site = await openFieldPage({ config: { ...config, backend: { name: 'test-repo' } } });
    let context;
    ({ page, seen, context } = await site.newPage({ viewport: { width: 1600, height: 900 } }));
    await context.route(`${PREVIEW}/**`, (route) => {
      const asked = route.request();
      const origin = new URL(page.url()).origin;
      const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization, content-type', 'access-control-allow-methods': 'POST' };
      if (asked.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (asked.url().endsWith('/session')) {
        sessions.push(asked.headers().authorization);
        return route.fulfill({ status: 200, headers, json: {} });
      }
      if (asked.url().endsWith('/draft')) {
        drafts.push(asked.postDataJSON());
        return route.fulfill({ status: 200, headers, json: answer });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>The page</h1>', headers: { 'content-security-policy': `frame-ancestors ${origin}` } });
    });
    await page.getByRole('button', { name: 'Work with Test Repository' }).click();
    await page.getByText('Articles', { exact: true }).first().waitFor();
    // The test repository signs in with no token, and the pane needs one to show.
    await page.evaluate(() => {
      const user = JSON.parse(localStorage.getItem('sveltia-cms.user'));
      localStorage.setItem('sveltia-cms.user', JSON.stringify({ ...user, token: 'a-token' }));
    });
  }, { timeout: 120_000 });

  after(() => site?.close());

  beforeEach(() => {
    drafts = [];
    sessions = [];
    answer = { address: '/a-page/', refusals: [] };
  });

  test('asks for a session with the editor\'s token, and shows what it is told to', async () => {
    await newEntry('pages');
    await page.getByRole('textbox', { name: 'Titel' }).first().fill('En sida');
    await draftWith(({ fields }) => fields.title === 'En sida');
    assert.equal(sessions.at(-1), 'token a-token');
    await pane().frameLocator('iframe').getByRole('heading', { name: 'The page' }).waitFor();
  });

  test('sends the language it shows, from that language\'s folder', async () => {
    await newEntry('pages');
    await page.getByRole('textbox', { name: 'Titel' }).first().fill('En svensk titel');
    const swedish = await draftWith(({ fields }) => fields.title === 'En svensk titel');
    assert.match(swedish.path, /^pages\/sv-SE\/[0-9a-f]{12}\.md$/);
  });

  test('keeps to one file while a new post has none', async () => {
    await newEntry('pages');
    await page.getByRole('textbox', { name: 'Titel' }).first().fill('Ett');
    const one = await draftWith(({ fields }) => fields.title === 'Ett');
    await page.getByRole('textbox', { name: 'Titel' }).first().fill('Två');
    const two = await draftWith(({ fields }) => fields.title === 'Två');
    assert.equal(two.path, one.path);
  });

  test('sends an image not saved yet along with the draft', async () => {
    await newEntry('articles');
    const field = page.locator('.field[data-key-path="image"]').first();
    await field.getByRole('checkbox').click();
    await field.locator('input[type=file]').first().setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from(PNG, 'base64') });
    const { fields, images } = await draftWith(({ images: held }) => held.length > 0);
    assert.equal(images.length, 1);
    assert.equal(images[0].data, PNG);
    assert.equal(fields.image.src, `/media/${images[0].name}`);
    assert.match(images[0].name, /^preview-[A-Za-z0-9-]+\.png$/);
  });

  test('says why a draft cannot be published, and what becomes of the page', async () => {
    await newEntry('pages');
    answer = { address: '/a-page/', refusals: [{ field: 'title', reason: 'give it a title' }] };
    await page.getByRole('textbox', { name: 'Titel' }).first().fill('Ett');
    const alert = pane().getByRole('alert');
    await alert.waitFor();
    assert.match(await alert.textContent(), /last good one/);
    assert.match(await alert.textContent(), /title: give it a title/);
    answer = { address: '/a-page/', refusals: [] };
    await page.getByRole('textbox', { name: 'Titel' }).first().fill('Två');
    await draftWith(({ fields }) => fields.title === 'Två');
    await pane().getByRole('alert').waitFor({ state: 'detached' });
  });

  test('stays calm when the preview is away, and the entry can be written on', async () => {
    await newEntry('pages');
    answer = 'not json at all';
    await page.getByRole('textbox', { name: 'Titel' }).first().fill('Ett');
    const alert = pane().getByRole('alert');
    await alert.waitFor();
    assert.match(await alert.textContent(), /still here/);
    await page.getByRole('textbox', { name: 'Titel' }).first().fill('Två');
    assert.equal(await page.getByRole('textbox', { name: 'Titel' }).first().inputValue(), 'Två');
  });

  test('breaks no policy, and asks nothing outside', () => {
    assert.deepEqual(seen.refused, []);
    assert.deepEqual(seen.errors.filter((one) => !/preview/i.test(one)), []);
  });
});
