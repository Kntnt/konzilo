// The live preview in a site in Compose, as an editor and a stranger meet it: nothing without
// a session, the page itself in the pane once signed in, a draft on the page within seconds
// of a pause, a refusal above the last good page, and none of what the public site offers
// the world (ADR 0032).

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { sharp } from '../tests/lib/images.js';
import { ENGINES, openEditor, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const POST = 'Northern islands and the meadow';
const ON_THE_PAGE = 30_000;

describe('the live preview', () => {
  let site;

  before(async () => {
    site = await makeSite();
    site.up('--build');
  }, { timeout: 900_000 });

  after(() => site?.remove());

  const frameOf = (page) => page.frameLocator('iframe.preview').frameLocator('iframe');
  const paneOf = (page) => page.frameLocator('iframe.preview');
  const openPost = async (page, title = POST) => {
    await page.getByText(title).first().click();
    await page.locator('.konzilo-body-visual .ProseMirror').waitFor({ timeout: 30_000 });
  };

  describe('to someone without a session', () => {
    test('stands, and shows nothing', async () => {
      assert.equal((await fetch(`${site.origin.preview}/_konzilo/preview/health`)).status, 200);
      for (const path of ['/', '/robots.txt', '/@fs/secret/read-token', '/site-description.json']) {
        const answer = await fetch(`${site.origin.preview}${path}`);
        assert.equal(answer.status, 403, path);
        assert.equal(answer.headers.get('x-robots-tag'), 'noindex, nofollow');
        assert.match(answer.headers.get('cache-control'), /private/);
      }
    });

    test('gives no session to a credential that cannot write, or from another origin', async () => {
      const session = (headers) => fetch(`${site.origin.preview}/_konzilo/preview/session`, { method: 'POST', headers });
      assert.equal((await session({ origin: site.origin.admin, authorization: 'token nothing-of-the-kind' })).status, 403);
      assert.equal((await session({ origin: site.origin.site, authorization: 'token nothing-of-the-kind' })).status, 403);
      const reader = site.compose('exec', '-T', 'preview', 'cat', '/secret/read-token').trim();
      assert.equal((await session({ origin: site.origin.admin, authorization: `token ${reader}` })).status, 403, 'its own credential can only read');
    });

    test('its credential can read the source, and nothing else', async () => {
      const reader = site.compose('exec', '-T', 'preview', 'cat', '/secret/read-token').trim();
      const api = (path, init) => fetch(`${site.origin.git}/api/v1${path}`, { ...init, headers: { authorization: `token ${reader}`, 'content-type': 'application/json' } });
      assert.equal((await api(`/repos/${site.name}/source`)).status, 200);
      const { permissions } = await (await api(`/repos/${site.name}/source`)).json();
      assert.equal(permissions.push, false);
      const writing = await api(`/repos/${site.name}/source/contents/pages/not-allowed.md`, { method: 'POST', body: JSON.stringify({ content: 'eA==', message: 'no' }) });
      assert.ok(writing.status === 403 || writing.status === 404, String(writing.status));
    });
  });

  describe('to an editor', () => {
    let session;
    let page;

    before(async () => {
      session = await openEditor('chromium', site);
      ({ page } = session);
      await signIn(session, site);
      await openPost(page);
    }, { timeout: 300_000 });

    after(() => session?.browser.close());

    test('shows the page itself, on an origin of its own, in the pane', async () => {
      await frameOf(page).getByRole('heading', { level: 1, name: POST }).waitFor({ timeout: 240_000 });
      const frame = paneOf(page).locator('iframe');
      assert.ok((await frame.getAttribute('src')).startsWith(`${site.origin.preview}/`));
      assert.doesNotMatch(await frame.getAttribute('sandbox'), /allow-top-navigation/);
    });

    test('scales the page from a desktop\'s width to the pane', async () => {
      const { width, offered } = await paneOf(page).locator('iframe').evaluate((element) => ({ width: element.getBoundingClientRect().width, offered: element.offsetWidth }));
      assert.equal(offered, 1280);
      assert.ok(width < 1280 && width > 0, String(width));
    });

    test('shows what is typed, after a pause, and keeps the scroll position', async () => {
      const title = page.getByRole('textbox', { name: 'Title', exact: true });
      // The draft the pane sends on opening reloads the page once, at a moment of its own. A first
      // change shows when that has passed.
      await title.fill(`${POST}, at first`);
      await frameOf(page).getByRole('heading', { level: 1, name: `${POST}, at first` }).waitFor({ timeout: ON_THE_PAGE });
      await frameOf(page).locator('html').evaluate(() => window.scrollTo(0, 200));
      const scrolled = await frameOf(page).locator('html').evaluate(() => window.scrollY);
      await title.fill(`${POST}, changed`);
      await frameOf(page).getByRole('heading', { level: 1, name: `${POST}, changed` }).waitFor({ timeout: ON_THE_PAGE });
      assert.equal(await frameOf(page).locator('html').evaluate(() => window.scrollY), scrolled);
    });

    test('shows a change in the body', async () => {
      const paragraph = page.locator('.konzilo-body-visual .ProseMirror p').last();
      await paragraph.click();
      await page.keyboard.press('End');
      await page.keyboard.type(' Words only this draft holds.', { delay: 50 });
      await frameOf(page).getByText('Words only this draft holds.').waitFor({ timeout: ON_THE_PAGE });
    });

    test('shows an image the moment it is uploaded, from the file now in the repository', async () => {
      const editor = page.locator('.konzilo-body-visual .ProseMirror');
      await editor.locator('> p').last().click();
      // A paragraph runs over several lines, where End goes to the end of one.
      await editor.locator('> p').last().evaluate((paragraph) => {
        const range = document.createRange();
        range.selectNodeContents(paragraph);
        range.collapse(false);
        const selection = document.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      });
      await page.waitForTimeout(100);
      await page.keyboard.press('Enter');
      await page.keyboard.type('/image', { delay: 30 });
      await page.locator('.milkdown-slash-menu li.hover', { hasText: 'Image' }).waitFor();
      await page.keyboard.press('Enter');
      const chooser = page.getByRole('dialog', { name: 'Choose an image' });
      await chooser.getByRole('button', { name: 'Upload a new image' }).click();
      const bytes = await sharp({ create: { width: 1400, height: 900, channels: 3, background: '#883366' } }).png().toBuffer();
      await chooser.locator('input[type=file]').setInputFiles({ name: 'just-uploaded.png', mimeType: 'image/png', buffer: bytes });
      await chooser.getByRole('textbox', { name: 'Alt text' }).fill('Uploaded this moment');
      await chooser.getByRole('button', { name: 'Upload and use' }).click();
      await chooser.waitFor({ state: 'detached', timeout: 30_000 });
      const shown = frameOf(page).locator('figure img[alt="Uploaded this moment"]').first();
      await shown.waitFor({ timeout: ON_THE_PAGE });
      assert.equal(await shown.evaluate((image) => image.decode().then(() => image.naturalWidth > 0)), true);
      assert.equal(await paneOf(page).getByRole('alert').count(), 0);

      // Its lightbox opens in the pane, and Escape there closes that, not the form.
      await shown.click();
      const large = frameOf(page).locator('dialog.konzilo-lightbox[open]');
      await large.waitFor();
      await page.keyboard.press('Escape');
      await large.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.konzilo-body-visual').count(), 1);
      await page.locator('.konzilo-image').last().getByRole('button', { name: 'Edit the image' }).click();
      const editing = page.getByRole('dialog', { name: 'Edit the image' });
      await editing.getByRole('button', { name: 'Remove the image' }).click();
      await editing.getByRole('button', { name: 'Remove', exact: true }).click();
      await editing.waitFor({ state: 'detached' });
    });

    test('frames the block in the field where the page is clicked, and leaves the focus in the preview', async () => {
      const sentence = frameOf(page).getByText('Words only this draft holds.');
      await sentence.waitFor({ timeout: ON_THE_PAGE });
      const field = page.locator('.konzilo-body-visual .ProseMirror');
      const text = await field.textContent();
      const cursor = () => page.evaluate(() => {
        const { anchorNode, anchorOffset } = document.getSelection();
        return { text: anchorNode?.textContent ?? null, anchorOffset };
      });
      const before = await cursor();
      await sentence.click();
      const ring = page.locator('.konzilo-body-ring');
      await ring.waitFor();
      const [around, paragraph] = await Promise.all([ring.boundingBox(), field.locator('p', { hasText: 'Words only this draft holds.' }).boundingBox()]);
      assert.ok(around.x <= paragraph.x && around.y <= paragraph.y && around.x + around.width >= paragraph.x + paragraph.width && around.y + around.height >= paragraph.y + paragraph.height, 'around the paragraph clicked');
      assert.equal(await page.evaluate(() => document.activeElement?.matches('iframe.preview') ?? false), true, 'the focus stays in the preview');
      assert.deepEqual(await cursor(), before, 'the cursor has not moved');
      await page.keyboard.type('§', { delay: 30 });
      await page.waitForTimeout(200);
      assert.equal(await field.textContent(), text, 'a key goes nowhere into the text');
    });

    test('says why it cannot publish a draft, above the last good page', async () => {
      const title = page.getByRole('textbox', { name: 'Title', exact: true });
      await title.fill('');
      const refused = paneOf(page).getByRole('alert');
      await refused.waitFor({ timeout: ON_THE_PAGE });
      assert.match(await refused.textContent(), /title/);
      assert.ok(await frameOf(page).getByRole('heading', { level: 1, name: `${POST}, changed` }).isVisible(), 'the last good page stands');
      await title.fill(`${POST}, again`);
      await frameOf(page).getByRole('heading', { level: 1, name: `${POST}, again` }).waitFor({ timeout: ON_THE_PAGE });
      assert.equal(await refused.count(), 0);
    });

    test('stays on the page when a link on it is followed, and says where it would have gone', async () => {
      const frame = frameOf(page);
      const here = () => frame.locator('html').evaluate(() => location.pathname);
      const before = await here();
      const link = frame.locator('main a[href^="/"], header a[href^="/"]').first();
      const to = await link.getAttribute('href');
      await link.click();
      const note = paneOf(page).getByRole('status');
      await note.waitFor({ timeout: ON_THE_PAGE });
      assert.match(await note.textContent(), new RegExp(`this link goes to ${to}`));
      assert.equal(await here(), before);
      assert.equal(new URL(await paneOf(page).locator('iframe').getAttribute('src')).pathname, before);
    });

    test('goes on showing what is typed after that', async () => {
      const title = page.getByRole('textbox', { name: 'Title', exact: true });
      await title.fill(`${POST}, still here`);
      await frameOf(page).getByRole('heading', { level: 1, name: `${POST}, still here` }).waitFor({ timeout: ON_THE_PAGE });
    });

    test('says where a link leads when a rule of the site redirects it, and follows nothing', async () => {
      // A rule, saved as an Admin saves one, as the preview's next run reads it.
      const token = await page.evaluate(() => JSON.parse(localStorage.getItem('sveltia-cms.user')).token);
      const headers = { authorization: `token ${token}`, 'content-type': 'application/json' };
      const file = `${site.origin.git}/api/v1/repos/${site.name}/source/contents/redirects.json`;
      const { sha } = await (await fetch(file, { headers })).json();
      const content = Buffer.from(JSON.stringify({ rules: [{ from: '/an-old-address/', to: '/a-new-address/', status: 302 }] })).toString('base64');
      assert.equal((await fetch(file, { method: 'PUT', headers, body: JSON.stringify({ content, sha, message: 'A rule' }) })).status, 200);
      const { request } = page.context();
      const title = page.getByRole('textbox', { name: 'Title', exact: true });
      for (let tried = 0; ; tried += 1) {
        await title.fill(`${POST}, ${tried}`);
        await page.waitForTimeout(3000);
        if ((await request.get(`${site.origin.preview}/an-old-address/`, { maxRedirects: 0 })).status() === 302) break;
        assert.ok(tried < 20, 'the preview never read the rule');
      }

      const frame = frameOf(page);
      await frame.getByRole('heading', { level: 1 }).waitFor({ timeout: ON_THE_PAGE });
      const before = await frame.locator('html').evaluate(() => location.pathname);
      await frame.locator('body').evaluate((body) => {
        const link = document.createElement('a');
        link.id = 'to-a-rule';
        link.href = '/an-old-address/';
        link.textContent = 'To a rule';
        link.style.cssText = 'position: fixed; top: 0; left: 0; z-index: 100000; background: white;';
        body.append(link);
      });
      await frame.locator('#to-a-rule').click();
      const note = paneOf(page).getByRole('status');
      await note.getByText('That address redirects to /a-new-address/ (302).').waitFor({ timeout: ON_THE_PAGE });
      assert.match(await note.textContent(), /this link goes to \/an-old-address\//);
      assert.equal(await frame.locator('html').evaluate(() => location.pathname), before);
    });

    test('has no sitemap, robots, feeds, llms.txt or Markdown alternates, whoever asks', async () => {
      const { request } = page.context();
      const address = new URL(await paneOf(page).locator('iframe').getAttribute('src')).pathname;
      for (const path of ['/robots.txt', '/sitemap.xml', '/sitemap-1.xml', '/llms.txt', '/llms-full.txt', '/feed.xml', '/index.xml', `${address}index.md`]) {
        const answer = await request.get(`${site.origin.preview}${path}`);
        assert.ok(answer.status() >= 400, `${path}: ${answer.status()}`);
      }
      const shown = await request.get(`${site.origin.preview}${address}`);
      assert.equal(shown.status(), 200);
      assert.equal(shown.headers()['x-robots-tag'], 'noindex, nofollow');
      assert.equal(shown.headers()['x-frame-options'], undefined);
      assert.equal(shown.headers()['content-security-policy'], `frame-ancestors ${site.origin.admin}`);
      assert.doesNotMatch(await shown.text(), /rel="alternate"[^>]*text\/markdown/);
    });

    test('keeps every secret out of a dev server\'s reach', async () => {
      const { request } = page.context();
      const secret = site.compose('exec', '-T', 'preview', 'cat', '/secret/read-token').trim();
      const paths = [
        '/@fs/secret/read-token',
        '/@fs//secret/read-token',
        '/@fs/secret/read-token?raw',
        '/@fs/secret/read-token?import&raw',
        '/@fs/site/local-secrets/account-password',
        '/@fs/work/source/.git/config',
        '/@fs/proc/self/environ',
        '/@fs/run/secrets/instance-password',
        '/local-secrets/account-password',
        '/.env',
        '/.git/config',
        '/../secret/read-token',
        '/..%2fsecret/read-token',
      ];
      for (const path of paths) {
        const answer = await request.get(`${site.origin.preview}${path}`);
        const text = await answer.text();
        assert.ok(!text.includes(secret), `${path} shows the credential`);
        assert.notEqual(answer.status() === 200 && /export default "/.test(text) && text.includes('read-token'), true, path);
      }
      const environment = site.compose('exec', '-T', 'preview', 'node', '-e', `
        const { readdirSync, readFileSync } = require('node:fs');
        for (const id of readdirSync('/proc').filter((name) => /^[0-9]+$/.test(name))) {
          try {
            if (id !== String(process.pid) && readFileSync(\`/proc/\${id}/cmdline\`, 'utf8').includes('.bin/astro')) console.log(readFileSync(\`/proc/\${id}/environ\`, 'utf8').replaceAll('\\0', '\\n'));
          } catch {}
        }`);
      assert.doesNotMatch(environment, /TOKEN|PASSWORD|SECRET|KONZILO_ADMIN|KONZILO_REPOSITORY/);
      assert.match(environment, /KONZILO_PREVIEW=1/);
    });

    test('leaves the page that has been saved, and what is published, as they are', async () => {
      const answer = await fetch(`${site.origin.site}/`);
      assert.equal(answer.status, 200);
      assert.doesNotMatch(await answer.text(), /Words only this draft holds/);
      const held = await fetch(`${site.origin.site}/pages/`);
      assert.doesNotMatch(await held.text(), /Words only this draft holds/);
    });
  });

  describe('a new post', () => {
    let session;
    let page;

    before(async () => {
      session = await openEditor('chromium', site);
      ({ page } = session);
      await signIn(session, site);
    }, { timeout: 300_000 });

    after(() => session?.browser.close());

    const newEntry = async (collection) => {
      await page.goto(`${site.origin.admin}/#/collections/${collection}/new`);
      await page.locator('.konzilo-body-visual .ProseMirror').waitFor({ timeout: 30_000 });
    };

    test('has a page before it has been saved', async () => {
      await newEntry('pages');
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill('A page nobody has saved');
      await frameOf(page).getByRole('heading', { level: 1, name: 'A page nobody has saved' }).waitFor({ timeout: ON_THE_PAGE });
    });

    test('says what it lacks while it can have no page, and shows none', async () => {
      await newEntry('articles');
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill('An article with no category');
      const refused = paneOf(page).getByRole('alert');
      await refused.waitFor({ timeout: ON_THE_PAGE });
      assert.match(await refused.textContent(), /no page to show/);
      assert.match(await refused.textContent(), /categories/);
      assert.equal(await paneOf(page).locator('iframe').count(), 0);
    });
  });

  for (const engine of Object.keys(ENGINES).filter((name) => name !== 'chromium')) {
    describe(`in ${engine}`, () => {
      test('shows the page, with its cookie in a frame, and keeps to it', async () => {
        const session = await openEditor(engine, site);
        try {
          await signIn(session, site);
          const { page } = session;
          await openPost(page, 'Golden harbours and the harbour');
          await frameOf(page).getByRole('heading', { level: 1, name: 'Golden harbours and the harbour' }).waitFor({ timeout: ON_THE_PAGE * 2 });
          const here = () => frameOf(page).locator('html').evaluate(() => location.pathname);
          const before = await here();
          await frameOf(page).locator('main a[href^="/"], header a[href^="/"]').first().click();
          await paneOf(page).getByRole('status').waitFor({ timeout: ON_THE_PAGE });
          assert.equal(await here(), before);

          // A click on the body's text frames that block in the field, and the focus stays in the
          // preview.
          const paragraph = frameOf(page).locator('p[data-konzilo-block]').first();
          const words = (await paragraph.textContent()).trim();
          const box = await paragraph.boundingBox();
          await paragraph.click({ position: { x: Math.min(box.width / 3, 120), y: Math.min(box.height / 2, 8) } });
          await page.locator('.konzilo-body-ring').waitFor({ timeout: 10_000 });
          const framed = await page.evaluate(() => {
            const around = document.querySelector('.konzilo-body-ring').getBoundingClientRect();
            return [...document.querySelectorAll('.konzilo-body-visual .ProseMirror :is(p, li, h2, h3, h4, h5, h6)')].find((one) => {
              const { left, top, right, bottom } = one.getBoundingClientRect();
              return left >= around.left && top >= around.top && right <= around.right && bottom <= around.bottom;
            })?.textContent ?? '';
          });
          assert.equal(framed.trim().slice(0, 40), words.slice(0, 40));
          assert.equal(await page.evaluate(() => document.activeElement?.matches('iframe.preview') ?? false), true, 'the focus stays in the preview');
        } finally {
          await session.browser.close();
        }
      });
    });
  }
});
