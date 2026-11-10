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
  let wheres;
  let whereAnswer;

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
      if (asked.url().includes('/where?')) {
        wheres.push(new URL(asked.url()).searchParams.get('to'));
        return route.fulfill({ status: 200, headers, json: whereAnswer });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>The page</h1><button id="leave">Leave</button><script>document.getElementById("leave").onclick = () => parent.postMessage({ type: "konzilo-preview-stopped", to: `${location.origin}/x/`, how: "link" }, "*");</script>', headers: { 'content-security-policy': `frame-ancestors ${origin}` } });
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
    wheres = [];
    whereAnswer = { status: 200, redirect: null, loop: false };
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

  test('chooses a post\'s image from the image library, with no file of the post\'s own to send', async () => {
    await newEntry('articles');
    const field = page.locator('.field[data-key-path="image"]').first();
    await field.locator('.konzilo-pick-choose').waitFor();
    assert.equal(await field.locator('.konzilo-pick input[type=file]').count(), 0);
    assert.equal(await field.getByRole('checkbox').count(), 0, 'and none of Sveltia\'s own image field');
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

  describe('a page kept from leaving', () => {
    const shownPage = () => pane().frameLocator('iframe');
    const leave = async () => {
      await newEntry('pages');
      await page.getByRole('textbox', { name: 'Titel' }).first().fill('En sida');
      await shownPage().getByRole('heading', { name: 'The page' }).waitFor();
      await shownPage().locator('#leave').click();
      const note = pane().getByRole('status');
      await note.waitFor();
      return note;
    };
    const says = async (note, words) => {
      for (let waited = 0; waited < 5000 && !words.test(await note.textContent()); waited += 50) await page.waitForTimeout(50);
      assert.match(await note.textContent(), words);
    };

    test('says where it would have gone, over the page, which does not move', async () => {
      const box = () => pane().locator('iframe').evaluate((element) => {
        const { width, height } = element.getBoundingClientRect();
        return { width, height };
      });
      await newEntry('pages');
      await page.getByRole('textbox', { name: 'Titel' }).first().fill('En sida');
      await shownPage().getByRole('heading', { name: 'The page' }).waitFor();
      const before = await box();
      await shownPage().locator('#leave').click();
      const note = pane().getByRole('status');
      await note.waitFor();
      assert.match(await note.textContent(), /On the public site, this link goes to \/x\/\./);
      assert.deepEqual(await box(), before);
      assert.equal(await note.evaluate((element) => getComputedStyle(element).pointerEvents), 'none', 'a note in the way keeps nothing from a click');
    });

    test('says where a redirect would have taken a visitor', async () => {
      whereAnswer = { status: 200, redirect: { status: 301, to: '/y/' }, loop: false };
      await says(await leave(), /goes to \/x\/\. That address redirects to \/y\/ \(301\)\./);
      assert.equal(wheres.at(-1), '/x/');
    });

    test('says when there is nothing to arrive at', async () => {
      whereAnswer = { status: 404, redirect: null, loop: false };
      await says(await leave(), /There is no page there \(404\)\./);
    });

    test('says when a redirect goes round in a circle', async () => {
      whereAnswer = { status: null, redirect: null, loop: true };
      await says(await leave(), /round in a circle/);
    });

    test('hears only the page in its frame', async () => {
      await newEntry('pages');
      await page.getByRole('textbox', { name: 'Titel' }).first().fill('En sida');
      await shownPage().getByRole('heading', { name: 'The page' }).waitFor();
      await pane().locator('html').evaluate((element, target) => {
        element.ownerDocument.defaultView.postMessage({ type: 'konzilo-preview-stopped', to: `${target}/forged/`, how: 'link' }, '*');
      }, PREVIEW);
      await page.waitForTimeout(300);
      assert.equal(await pane().getByText('forged').count(), 0);
    });
  });

  describe('a draft at an address that redirects', () => {
    test('is never shown there, says where it leads, and asks once however long it is worked on', async () => {
      answer = { address: '/moved/', refusals: [] };
      whereAnswer = { status: 200, redirect: { status: 301, to: '/y/' }, loop: false };
      await newEntry('pages');
      await page.getByRole('textbox', { name: 'Titel' }).first().fill('Ett');
      const note = pane().getByText('/moved/ redirects to /y/ (301)');
      await note.waitFor();
      for (const title of ['Två', 'Tre']) {
        await page.getByRole('textbox', { name: 'Titel' }).first().fill(title);
        await draftWith(({ fields }) => fields.title === title);
      }
      assert.deepEqual(wheres, ['/moved/']);
      for (const frame of await pane().locator('iframe').all()) assert.doesNotMatch(await frame.getAttribute('src'), /moved/);
      assert.equal(await note.count(), 1);
    });
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
