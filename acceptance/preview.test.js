// The live preview in a site in Compose, as an editor, a Reviewer and a stranger meet it: nothing
// without a session but the way to Forgejo's sign-in, the site as a visitor browses it in a tab of
// its own once signed in there, the page itself in the pane, a draft on the page within seconds
// of a pause, drawn again in place, in the pane and in the window of its own alike, a refusal
// above the last good page, and none of what the public site offers the world (ADR 0032,
// ADR 0067).

import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import { idOf } from '../src/demo-source.js';
import { sharp } from '../tests/lib/images.js';
import { ENGINES, freshCode, openEditor, openNew, signIn, throughForgejo, usedCode } from './lib/editor.js';
import { framesWhile, isBlank } from './lib/frames.js';
import { makeSite } from './lib/site.js';

const POST = 'Northern islands and the meadow';
const ON_THE_PAGE = 30_000;
// An article of the demo content, as a tab of its own is opened at it.
const ARTICLE = '/golden-harbours-and-the-harbour/';
const ARTICLE_TITLE = 'Golden harbours and the harbour';

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
  // Where the page is shown: in the pane, in the editor's page, or in the preview's window of its
  // own, a page of its own with the page in a frame.
  const inPane = (page) => ({ on: page, frame: frameOf(page), element: paneOf(page).locator('iframe') });
  const inWindow = (popup) => ({ on: popup, frame: popup.frameLocator('iframe'), element: popup.locator('iframe') });
  // The editor's choice of where the preview stands, from its menu.
  const viewIn = async (page, words) => {
    await page.getByRole('button', { name: 'Show Editor Options' }).click();
    await page.getByRole('menuitemradio', { name: words }).click();
  };
  // A new main headline typed in an article's form, which its page's heading shows, with the page
  // scrolled a little, and every frame of where it is shown
  // while the page is drawn again with it, until a moment after it shows. The draft the pane sends
  // on opening reloads the page once, at a moment of its own, so a first change goes before.
  const drawnAgain = async (page, changed, view = inPane(page)) => {
    const title = page.getByRole('textbox', { name: 'Main headline', exact: true });
    const shown = view.frame.locator('html');
    await title.fill(`${changed}, at first`);
    await view.frame.getByRole('heading', { level: 1, name: `${changed}, at first` }).waitFor({ timeout: ON_THE_PAGE });
    await shown.evaluate(() => new Promise((resolve) => {
      if (document.readyState === 'complete') resolve();
      else window.addEventListener('load', resolve, { once: true });
    }));
    await shown.evaluate(() => window.scrollTo(0, 200));
    const scrolled = await shown.evaluate(() => window.scrollY);
    const frames = await framesWhile(view.on, view.element, async () => {
      await title.fill(changed);
      await view.frame.getByRole('heading', { level: 1, name: changed }).waitFor({ timeout: ON_THE_PAGE });
      await page.waitForTimeout(800);
    });
    return { scrolled, frames, now: await shown.evaluate(() => window.scrollY), transitions: await shown.evaluate(() => 'CSSViewTransitionRule' in window) };
  };
  // Where the browser has view transitions across documents, no frame is blank; without them, the
  // page is reloaded on the white behind it, and never goes transparent.
  const noEmptyFrame = ({ frames, transitions }) => {
    assert.ok(frames.length > 0, 'frames were caught');
    const blank = frames.filter(isBlank);
    if (transitions) assert.deepEqual(blank, []);
    else assert.deepEqual(blank.filter(({ brightness }) => brightness < 250), []);
  };

  // The preview's toolbar on a page in a tab of its own: what it says, and the links it holds,
  // each by its name and where it leads (ADR 0032).
  const toolbarOn = async (page) => {
    const region = page.getByRole('region', { name: 'Live preview' });
    await region.waitFor({ timeout: ON_THE_PAGE });
    const links = await region.getByRole('link').evaluateAll((all) => all.map((link) => [link.textContent.trim(), link.href]));
    return { says: (await region.textContent()).replace(/\s+/g, ' ').trim(), links };
  };

  // Forgejo's sign-in in a tab, in place, until the tab is back on the preview's host.
  const signInInTab = (page) => throughForgejo(page, site, page.waitForURL((url) => url.origin === site.origin.preview, { timeout: 120_000 }));

  describe('to someone without a session', () => {
    test('stands, and shows nothing but the way to sign in', async () => {
      assert.equal((await fetch(`${site.origin.preview}/_konzilo/preview/health`)).status, 200);
      const visit = await fetch(`${site.origin.preview}${ARTICLE}`, { redirect: 'manual', headers: { 'sec-fetch-dest': 'document', accept: 'text/html' } });
      assert.equal(visit.status, 303);
      const to = visit.headers.get('location');
      assert.ok(to.startsWith(`${site.origin.git}/login/oauth/authorize?`), to);
      assert.equal(visit.headers.get('x-robots-tag'), 'noindex, nofollow');
      // The proxy lets the way through, and Forgejo asks for a sign-in.
      const forgejo = await fetch(to, { redirect: 'manual' });
      assert.ok([302, 303].includes(forgejo.status), String(forgejo.status));
      assert.match(forgejo.headers.get('location'), /\/user\/login/);
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

  describe('in a tab of its own', () => {
    let browser;
    let context;
    let page;
    // Every address the tab has been at, in order.
    const went = [];

    before(async () => {
      browser = await ENGINES.chromium.launch();
      context = await browser.newContext({ locale: 'en-GB' });
      page = await context.newPage();
      page.on('framenavigated', (frame) => {
        if (frame === page.mainFrame()) went.push(frame.url());
      });
    });

    after(() => browser?.close());

    const noSession = () => context.clearCookies({ name: `${site.name}_preview` });

    test('leads a visit through Forgejo\'s sign-in and back to the address asked for, starting the preview with a notice until the page is ready', async () => {
      const notices = [];
      page.on('response', (answer) => {
        if (answer.status() === 503 && answer.url().startsWith(site.origin.preview)) notices.push(answer.url());
      });
      await page.goto(`${site.origin.preview}${ARTICLE}?from=a-tab`);
      assert.ok(page.url().startsWith(`${site.origin.git}/user/login`), page.url());
      await signInInTab(page);
      await page.getByRole('heading', { level: 1, name: ARTICLE_TITLE }).waitFor({ timeout: 240_000 });
      assert.equal(page.url(), `${site.origin.preview}${ARTICLE}?from=a-tab`);
      assert.ok(notices.length > 0, 'a notice while the preview started');
    });

    test('keeps noindex, private caching and its framing rule, and holds no token where a page could read it', async () => {
      const answer = await page.goto(`${site.origin.preview}${ARTICLE}`);
      assert.equal(answer.status(), 200);
      const headers = answer.headers();
      assert.equal(headers['x-robots-tag'], 'noindex, nofollow');
      assert.match(headers['cache-control'], /^private/);
      assert.equal(headers['content-security-policy'], `frame-ancestors ${site.origin.admin}`);
      const held = (await context.cookies(site.origin.preview)).find(({ name }) => name === `${site.name}_preview`);
      assert.equal(held.httpOnly, true);
      const readable = await page.evaluate(() => JSON.stringify([document.cookie, { ...localStorage }, { ...sessionStorage }]));
      assert.doesNotMatch(readable, new RegExp(`${site.name}_preview|eyJ|token`, 'i'));
    });

    test('leads on by its links and the browser\'s history, as the public site does', async () => {
      await page.goto(`${site.origin.preview}${ARTICLE}`);
      const to = await page.evaluate((here) => [...document.querySelectorAll('main a[href^="/"], header a[href^="/"]')]
        .map((link) => new URL(link.href))
        .find((url) => url.pathname !== here && url.hash === '')?.pathname, ARTICLE);
      assert.ok(to, 'a link to follow');
      await page.locator(`a[href="${to}"]`).first().click();
      await page.waitForURL(`${site.origin.preview}${to}`);
      await page.goBack();
      await page.waitForURL(`${site.origin.preview}${ARTICLE}`);
      await page.getByRole('heading', { level: 1, name: ARTICLE_TITLE }).waitFor({ timeout: ON_THE_PAGE });
      await page.goForward();
      await page.waitForURL(`${site.origin.preview}${to}`);
    });

    test('still says that a form cannot send', async () => {
      await page.goto(`${site.origin.preview}/pages/contact/`);
      await page.getByText('This is a preview: the form sends nothing.').waitFor({ timeout: ON_THE_PAGE });
    });

    test('shows every saved post, a draft and a scheduled one in the lists that will hold them, and a refused one\'s refusal at its page, while the public site shows none of them', async () => {
      const token = site.state('instance-token');
      const contents = `${site.origin.git}/api/v1/repos/${site.name}/source/contents`;
      const headers = { authorization: `token ${token}`, 'content-type': 'application/json' };
      // A save as anna makes it, from the source of an article of the demo content.
      const save = async (path, text) => {
        const answer = await fetch(`${contents}/${path}?sudo=anna`, { method: 'POST', headers, body: JSON.stringify({ content: Buffer.from(text).toString('base64'), message: 'A save' }) });
        assert.equal(answer.status, 201, path);
      };
      const golden = Buffer.from((await (await fetch(`${contents}/articles/${idOf('articles', 'golden-harbours-and-the-harbour')}.md`, { headers })).json()).content, 'base64').toString('utf8');
      const article = (title, slug, status, date) => golden
        .replace(/^title: .*$/m, `title: ${JSON.stringify(title)}`)
        .replace(/^headline: .*$/m, `headline: ${JSON.stringify(title)}`)
        .replace(/^slug: .*$/m, `slug: ${JSON.stringify(slug)}`)
        .replace(/^status: .*$/m, `status: ${JSON.stringify(status)}`)
        .replace(/^date: .*\n/m, date ? `date: ${date}\n` : '')
        // A teaser's headline follows an eyebrow, which would stand before the title.
        .replace(/^eyebrow: .*\n/m, '');
      const DRAFT = 'A draft of the harbours';
      const SCHEDULED = 'The harbours to come';
      const saved = {
        'articles/a42d0000000a.md': ['draft', article(DRAFT, 'a-draft-of-the-harbours', 'draft', null)],
        'articles/a42d0000000b.md': ['scheduled', article(SCHEDULED, 'the-harbours-to-come', 'scheduled', '2099-03-01T08:00:00Z')],
        'pages/a42d0000000c.md': ['draft', '---\ntitle: "A <b>bold</b> page"\nslug: "a-refused-page"\nstatus: "draft"\n---\n\nWords of a page.\n'],
      };
      for (const [path, [, text]] of Object.entries(saved)) await save(path, text);

      // Once the public site has been built from them, it shows none of them.
      const deadline = Date.now() + 180_000;
      for (;;) {
        const answer = await fetch(`${site.origin.admin}/_konzilo/status`, { headers });
        const { posts } = answer.status === 200 ? await answer.json() : { posts: [] };
        if (Object.entries(saved).every(([file, [status]]) => posts.find((one) => one.file === file)?.status === status)) break;
        assert.ok(Date.now() < deadline, `the public site was never built from them: ${JSON.stringify(posts.filter(({ file }) => file in saved))}`);
        await new Promise((go) => setTimeout(go, 1000));
      }
      for (const path of ['/a-draft-of-the-harbours/', '/the-harbours-to-come/', '/pages/a-refused-page/']) assert.equal((await fetch(`${site.origin.site}${path}`)).status, 404, path);
      for (const path of ['/', ARTICLE]) {
        const answer = await fetch(`${site.origin.site}${path}`);
        assert.equal(answer.status, 200, path);
        assert.doesNotMatch(await answer.text(), new RegExp(`${DRAFT}|${SCHEDULED}`), path);
      }
      // The articles' feed, as the release holds it.
      const feed = site.compose('exec', '-T', 'web', 'cat', '/srv/site/current/pages/feed/index.rss');
      assert.ok(feed.includes(ARTICLE_TITLE), 'the feed of the published articles');
      assert.doesNotMatch(feed, new RegExp(`${DRAFT}|${SCHEDULED}`));

      // The preview reads what is saved at the next page asked for in a tab, and its dev server
      // draws the page again once it has the change.
      const shown = async (path, locator) => {
        const until = Date.now() + ON_THE_PAGE * 2;
        for (;;) {
          await page.goto(`${site.origin.preview}${path}`);
          if (await locator().count() > 0) return;
          assert.ok(Date.now() < until, `${path} never showed it`);
          await page.waitForTimeout(2000);
        }
      };
      await shown('/a-draft-of-the-harbours/', () => page.getByRole('heading', { level: 1, name: DRAFT, exact: true }));
      await shown('/the-harbours-to-come/', () => page.getByRole('heading', { level: 1, name: SCHEDULED, exact: true }));
      for (const title of [DRAFT, SCHEDULED]) {
        await shown('/', () => page.locator('main .post-list').getByRole('link', { name: title, exact: true }));
        await shown(ARTICLE, () => page.locator('aside.recommended-reading').getByText(title, { exact: true }));
      }
      await page.goto(`${site.origin.preview}/pages/a-refused-page/`);
      await page.getByRole('heading', { level: 1, name: 'This page cannot be published yet' }).waitFor({ timeout: ON_THE_PAGE });
      const said = await page.locator('main').textContent();
      assert.match(said, /what is saved of “A <b>bold<\/b> page”/);
      assert.match(said, /the field Title: the site cannot publish a title holding HTML/);

      // Each page's toolbar says its status, and leads an Admin to its form, or, where the page is
      // built from many posts, to the editor's start.
      const forms = `${site.origin.admin}/#/collections`;
      const refusedOne = await toolbarOn(page);
      assert.match(refusedOne.says, /^Draft/);
      assert.deepEqual(refusedOne.links, [['Edit this page', `${forms}/pages/entries/a42d0000000c`]]);
      for (const [path, says, entry] of [
        ['/a-draft-of-the-harbours/', /^Draft/, 'articles/entries/a42d0000000a'],
        ['/the-harbours-to-come/', /^Scheduled: goes live 1 March 2099 at 08:00 UTC/, 'articles/entries/a42d0000000b'],
        [ARTICLE, /^Published/, `articles/entries/${idOf('articles', 'golden-harbours-and-the-harbour')}`],
      ]) {
        await page.goto(`${site.origin.preview}${path}`);
        const toolbar = await toolbarOn(page);
        assert.match(toolbar.says, says, path);
        assert.deepEqual(toolbar.links, [['Edit this page', `${forms}/${entry}`]], path);
      }
      await page.goto(`${site.origin.preview}/`);
      const start = await toolbarOn(page);
      assert.match(start.says, /^Not edited in one place/);
      assert.deepEqual(start.links, [['Open the editor', `${site.origin.admin}/`]]);
      await page.goto(`${site.origin.preview}${ARTICLE}`);
      await page.getByRole('heading', { level: 1, name: ARTICLE_TITLE }).waitFor({ timeout: ON_THE_PAGE });
    });

    test('lets someone already signed in to Forgejo in without typing anything', async () => {
      await noSession();
      const from = went.length;
      await page.goto(`${site.origin.preview}${ARTICLE}`, { waitUntil: 'commit' });
      await page.getByRole('heading', { level: 1, name: ARTICLE_TITLE }).waitFor({ timeout: ON_THE_PAGE });
      assert.equal(page.url(), `${site.origin.preview}${ARTICLE}`);
      const since = went.slice(from);
      assert.ok(since.some((url) => url.startsWith(`${site.origin.git}/login/oauth/authorize`)), since.join('\n'));
      assert.ok(!since.some((url) => url.startsWith(`${site.origin.git}/user/`)), since.join('\n'));
    });

    test('refuses someone removed from the site\'s teams with a page that says who can give access, and nothing of the site', async () => {
      const token = site.state('instance-token');
      const api = (method, path) => fetch(`${site.origin.git}/api/v1${path}`, { method, headers: { authorization: `token ${token}` } });
      const teams = await (await api('GET', `/orgs/${site.name}/teams`)).json();
      const { id } = teams.find(({ name }) => name === 'admins');
      assert.equal((await api('DELETE', `/teams/${id}/members/anna`)).status, 204);
      try {
        await noSession();
        const back = page.waitForResponse((answer) => answer.url().startsWith(`${site.origin.preview}/_konzilo/preview/sign-in`));
        await page.goto(`${site.origin.preview}${ARTICLE}`, { waitUntil: 'commit' });
        assert.equal((await back).status(), 403);
        await page.getByRole('heading', { level: 1, name: 'This account may not see the preview' }).waitFor({ timeout: ON_THE_PAGE });
        assert.match(await page.locator('body').textContent(), /The site's Admins can give it access\./);
        assert.equal(await page.getByText(ARTICLE_TITLE).count(), 0);
        assert.equal((await context.cookies(site.origin.preview)).some(({ name }) => name === `${site.name}_preview`), false, 'no session');
      } finally {
        assert.equal((await api('PUT', `/teams/${id}/members/anna`)).status, 204);
      }
    });
  });

  // A Reviewer, who reads what is coming and changes nothing (ADR 0008): an account of their own,
  // in the site's team that reads the source.
  describe('to a Reviewer', () => {
    let browser;
    let context;
    let page;
    let reviewer;

    before(async () => {
      reviewer = await site.account('rut', 'reviewers');
      usedCode(reviewer.login, reviewer.enrolledWith);
      browser = await ENGINES.chromium.launch();
      context = await browser.newContext({ locale: 'en-GB' });
      page = await context.newPage();
    }, { timeout: 120_000 });

    after(() => browser?.close());

    test('has an account of their own, with a second factor, which may read the source and write nothing to it', async () => {
      const basic = `Basic ${Buffer.from(`${reviewer.login}:${reviewer.password}`).toString('base64')}`;
      const source = `${site.origin.git}/api/v1/repos/${site.name}/source`;
      assert.notEqual((await fetch(source, { headers: { authorization: basic } })).status, 200, 'not without the second factor');
      const code = await freshCode(reviewer.login, reviewer.code);
      const as = (path, init = {}) => fetch(`${source}${path}`, { ...init, headers: { authorization: basic, 'x-forgejo-otp': code, 'content-type': 'application/json' } });
      const asked = await as('');
      assert.equal(asked.status, 200);
      const { permissions } = await asked.json();
      assert.deepEqual([permissions.pull, permissions.push], [true, false]);
      const writing = await as('/contents/pages/a-reviewers.md', { method: 'POST', body: JSON.stringify({ content: 'eA==', message: 'A Reviewer\'s change' }) });
      assert.ok([403, 404].includes(writing.status), String(writing.status));
    });

    test('signs in to the preview\'s tab, and sees the page an Editor sees there', async () => {
      await page.goto(`${site.origin.preview}${ARTICLE}`);
      assert.ok(page.url().startsWith(`${site.origin.git}/user/login`), page.url());
      await throughForgejo(page, site, page.waitForURL((url) => url.origin === site.origin.preview, { timeout: 120_000 }), reviewer);
      await page.getByRole('heading', { level: 1, name: ARTICLE_TITLE }).waitFor({ timeout: 240_000 });
      assert.equal(page.url(), `${site.origin.preview}${ARTICLE}`);
    });

    test('sees each page\'s status in the preview\'s toolbar, and no link to edit it', async () => {
      await page.goto(`${site.origin.preview}${ARTICLE}`);
      const toolbar = await toolbarOn(page);
      assert.match(toolbar.says, /^Published/);
      assert.deepEqual(toolbar.links, []);
    });

    test('is told on the admin host that the account reads the preview only and can save nothing there, and is signed out', async () => {
      const editor = await context.newPage();
      await editor.goto(`${site.origin.admin}/`);
      const button = editor.getByRole('button', { name: /Forgejo/ });
      await button.waitFor();
      // Safari opened no popup for a click right after a load (ADR 0007).
      await editor.waitForTimeout(1000);
      // Signed in to Forgejo by the tab, the sign-in passes without a word.
      const [popup] = await Promise.all([context.waitForEvent('page'), button.click()]);
      await popup.waitForEvent('close', { timeout: 120_000 });
      await editor.getByText(`This account reads the site's live preview only, and can save nothing here. The preview is at ${site.origin.preview}.`).waitFor({ timeout: 60_000 });
      assert.equal(await editor.locator('.konzilo-body-visual').count(), 0);
      const held = await editor.evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem('sveltia-cms.user'))?.token ?? null;
        } catch {
          return null;
        }
      });
      assert.equal(held, null, 'the browser keeps no token of theirs');
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

    test('shows what is typed, after a pause, drawn again with no empty frame, and keeps the scroll position', async () => {
      const drawn = await drawnAgain(page, `${POST}, changed`);
      assert.ok(drawn.scrolled > 0, 'the page could be scrolled');
      assert.equal(drawn.now, drawn.scrolled);
      noEmptyFrame(drawn);
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
      const title = page.getByRole('textbox', { name: 'Main headline', exact: true });
      await title.fill('');
      const refused = paneOf(page).getByRole('alert');
      await refused.waitFor({ timeout: ON_THE_PAGE });
      assert.match(await refused.textContent(), /headline/);
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
      const title = page.getByRole('textbox', { name: 'Main headline', exact: true });
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
      const title = page.getByRole('textbox', { name: 'Main headline', exact: true });
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

    test('leads from a page in a tab of its own to its post\'s form, by the toolbar the pane does not show', async () => {
      assert.equal(await frameOf(page).locator('konzilo-preview-toolbar').count(), 0, 'none in the pane');
      // Signed in to Forgejo, the editor's browser passes its sign-in without a word.
      const tab = await session.context.newPage();
      try {
        await tab.goto(`${site.origin.preview}${ARTICLE}`);
        await tab.getByRole('heading', { level: 1, name: ARTICLE_TITLE }).waitFor({ timeout: 120_000 });
        await tab.getByRole('region', { name: 'Live preview' }).getByRole('link', { name: 'Edit this page' }).click();
        await tab.waitForURL(`${site.origin.admin}/#/collections/articles/entries/${idOf('articles', 'golden-harbours-and-the-harbour')}`);
        const headline = tab.getByRole('textbox', { name: 'Main headline', exact: true });
        await headline.waitFor({ timeout: 60_000 });
        assert.equal(await headline.inputValue(), ARTICLE_TITLE);
        assert.equal(session.context.pages().length, 2, 'in the same tab');
      } finally {
        await tab.close();
      }
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

    const newEntry = (collection) => openNew(page, collection);

    test('has a page before it has been saved', async () => {
      await newEntry('pages');
      await page.getByRole('textbox', { name: 'Title', exact: true }).fill('A page nobody has saved');
      await frameOf(page).getByRole('heading', { level: 1, name: 'A page nobody has saved' }).waitFor({ timeout: ON_THE_PAGE });
    });

    test('says what it lacks while it can have no page, and shows none', async () => {
      await newEntry('articles');
      await page.getByRole('textbox', { name: 'Working name', exact: true }).fill('An article with no main headline');
      const refused = paneOf(page).getByRole('alert');
      await refused.waitFor({ timeout: ON_THE_PAGE });
      assert.match(await refused.textContent(), /no page to show/);
      assert.match(await refused.textContent(), /headline/);
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

          // A change is drawn again in place, on a page long enough to be scrolled in the pane.
          await page.goto(`${site.origin.admin}/#/collections/articles`);
          await openPost(page, 'Every element of body text');
          await frameOf(page).getByRole('heading', { level: 1, name: 'Every element of body text' }).waitFor({ timeout: ON_THE_PAGE * 2 });
          const drawn = await drawnAgain(page, 'Every element, drawn again');
          assert.ok(drawn.scrolled > 0, 'the page could be scrolled');
          assert.equal(drawn.now, drawn.scrolled);
          noEmptyFrame(drawn);
        } finally {
          await session.browser.close();
        }
      });
    });
  }

  // A tab of its own signs in through Forgejo in every engine, with its cookies.
  for (const engine of Object.keys(ENGINES).filter((name) => name !== 'chromium')) {
    describe(`in a tab of its own, in ${engine}`, () => {
      test('signs in through Forgejo and shows the page asked for', async () => {
        const browser = await ENGINES[engine].launch();
        try {
          const page = await (await browser.newContext({ locale: 'en-GB' })).newPage();
          await page.goto(`${site.origin.preview}${ARTICLE}`);
          await signInInTab(page);
          await page.getByRole('heading', { level: 1, name: ARTICLE_TITLE }).waitFor({ timeout: ON_THE_PAGE * 2 });
          assert.equal(page.url(), `${site.origin.preview}${ARTICLE}`);
        } finally {
          await browser.close();
        }
      });
    });
  }

  // The preview's window of its own draws a page again as the pane does (ADR 0064, ADR 0067).
  for (const engine of Object.keys(ENGINES)) {
    describe(`in its window of its own, in ${engine}`, () => {
      test('draws the page again with no empty frame, at the scroll it had', async () => {
        const session = await openEditor(engine, site);
        try {
          await signIn(session, site);
          const { page } = session;
          await openPost(page, 'Every element of body text');
          const [popup] = await Promise.all([page.context().waitForEvent('page'), viewIn(page, /own window/)]);
          try {
            await inWindow(popup).frame.getByRole('heading', { level: 1, name: 'Every element of body text' }).waitFor({ timeout: ON_THE_PAGE * 2 });
            const drawn = await drawnAgain(page, 'Every element, drawn again in its window', inWindow(popup));
            assert.ok(drawn.scrolled > 0, 'the page could be scrolled');
            assert.equal(drawn.now, drawn.scrolled);
            noEmptyFrame(drawn);
          } finally {
            await viewIn(page, /beside/);
            if (!popup.isClosed()) await popup.waitForEvent('close');
          }
        } finally {
          await session.browser.close();
        }
      });
    });
  }
});
