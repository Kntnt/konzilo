// The live preview's toolbar in a tab of its own, in each browser engine, with the real gate and
// the real toolbar, and a site, a Forgejo and an editor that are small programs of this test:
// where it starts, what it says to a screen reader, how a mouse, a finger and the keyboard move it,
// how it tucks into an edge and comes back, where it is kept, and that the pane has none
// (ADR 0032). preview.test.js has it in a real site.

import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';

import { SESSION_PATH } from '../src/cms/preview/paths.js';
import { SANDBOX } from '../src/cms/preview/template.js';
import { previewGate } from '../src/preview/gate.js';
import { ENGINES } from './lib/editor.js';

const listen = (server) => new Promise((resolve) => {
  server.listen(0, '127.0.0.1', () => resolve(server.address().port));
});

// A page of the site, long enough to scroll, with a link to follow before the toolbar.
const pageOf = (title) => `<!doctype html><html lang="en"><head><title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body { margin: 0; font: 18px/1.5 sans-serif; } main { min-height: 2400px; padding: 16px; }</style>
</head><body><main><h1>${title}</h1><p><a id="on" href="/two/">On to another page</a></p></main></body></html>`;

// What each page is built from, as the preview's runner knows it.
const BUILT = {
  '/one/': { kind: 'post', file: 'pages/aaaaaaaaaaaa.md', title: 'One', status: 'draft', at: null, refusals: [] },
  '/two/': { kind: 'post', file: 'pages/bbbbbbbbbbbb.md', title: 'Two', status: 'published', at: null, refusals: [] },
};

describe('the toolbar in the preview\'s tab', () => {
  let forgejo;
  let site;
  let admin;
  let gateServer;
  let adminOrigin;
  let preview;

  before(async () => {
    forgejo = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { 'Content-Type': 'application/json' });
      outgoing.end(JSON.stringify({ permissions: { push: true, pull: true } }));
    });
    site = createServer((incoming, outgoing) => {
      const { pathname } = new URL(incoming.url, 'http://x');
      outgoing.writeHead(200, { 'Content-Type': 'text/html' });
      outgoing.end(pageOf(BUILT[pathname]?.title ?? 'Start'));
    });
    // The editor: the place a session is opened from, a pane around a page, and where the
    // toolbar's link leads.
    admin = createServer((_incoming, outgoing) => {
      outgoing.writeHead(200, { 'Content-Type': 'text/html' });
      outgoing.end(`<!doctype html><title>The editor</title><iframe id="frame" sandbox="${SANDBOX}" style="display: block; border: 0; width: 800px; height: 600px"></iframe>`);
    });
    let gate;
    gateServer = createServer((incoming, outgoing) => gate.request(incoming, outgoing));
    const [forgejoPort, sitePort, adminPort, gatePort] = await Promise.all([forgejo, site, admin, gateServer].map(listen));
    adminOrigin = `http://localhost:${adminPort}`;
    preview = `http://localhost:${gatePort}`;
    gate = previewGate({
      origin: preview,
      adminOrigin,
      forgejo: `http://127.0.0.1:${forgejoPort}`,
      language: 'en',
      repository: 'a/source',
      cookieName: 'a_preview',
      runner: { refresh: async () => {}, at: (path) => BUILT[path] ?? null, notFoundAt: () => null },
      dev: { port: sitePort, ensure: async () => {}, ready: () => true },
    });
  });

  after(async () => {
    for (const server of [forgejo, site, admin, gateServer]) {
      server.closeAllConnections();
      await new Promise((resolve) => {
        server.close(resolve);
      });
    }
  });

  for (const engine of Object.keys(ENGINES)) {
    describe(`in ${engine}`, () => {
      let browser;

      before(async () => {
        browser = await ENGINES[engine].launch();
      });
      after(() => browser?.close());

      // A browser of its own, with a session the editor opened, as a tab of its own has one.
      // `storage`: whether the page may keep anything.
      const opened = async ({ viewport = { width: 1000, height: 800 }, touch = false, storage = true } = {}) => {
        const context = await browser.newContext({ viewport, hasTouch: touch, ...(touch && engine === 'chromium' ? { isMobile: true } : {}) });
        if (!storage) {
          await context.addInitScript(() => {
            Object.defineProperty(window, 'localStorage', { get: () => { throw new DOMException('No storage here', 'SecurityError'); } });
          });
        }
        const page = await context.newPage();
        await page.goto(`${adminOrigin}/`);
        assert.equal(await page.evaluate(async ([url]) => (await fetch(url, { method: 'POST', credentials: 'include', headers: { authorization: 'token a' } })).status, [`${preview}${SESSION_PATH}`]), 200);
        return { context, page };
      };
      const at = async (page, path = '/one/') => {
        await page.goto(`${preview}${path}`);
        await page.getByRole('heading', { level: 1 }).waitFor();
        return page;
      };
      const toolbar = (page) => page.getByRole('region', { name: 'Live preview' });
      const handle = (page) => toolbar(page).getByRole('button', { name: 'Move the toolbar' });
      const tab = (page) => toolbar(page).getByRole('button', { name: 'Show the toolbar' });
      // Where the bar stands, and the tab that brings it back while it is tucked away.
      const barBox = (page) => handle(page).evaluate((grip) => {
        const { x, y, width, height } = grip.parentElement.getBoundingClientRect();
        return { x, y, width, height };
      });
      const tabBox = (page) => tab(page).boundingBox();
      const windowOf = (page) => page.evaluate(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }));
      // A drag of the bar by its status, by `dx` and `dy`, with a mouse, which stops at the
      // window's edges, as it does in a window as wide as the screen.
      const dragged = async (page, dx, dy, by = toolbar(page).getByText(/Draft|Published/)) => {
        const box = await by.boundingBox();
        const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const { width, height } = page.viewportSize();
        const inside = (value, most) => Math.max(0, Math.min(most - 1, value));
        await page.mouse.move(from.x, from.y);
        await page.mouse.down();
        for (let step = 1; step <= 10; step += 1) await page.mouse.move(inside(from.x + (dx * step) / 10, width), inside(from.y + (dy * step) / 10, height));
        await page.mouse.up();
      };
      const near = (actual, expected, what) => assert.ok(Math.abs(actual - expected) <= 2, `${what}: ${actual}, not ${expected}`);

      test('starts in the bottom right corner, says the page\'s status and leads to its form, to a screen reader too', async () => {
        const { context, page } = await opened();
        try {
          await at(page);
          const box = await barBox(page);
          const size = await windowOf(page);
          near(box.x + box.width, size.width - 16, 'its right side');
          near(box.y + box.height, size.height - 16, 'its bottom');
          const snapshot = await toolbar(page).ariaSnapshot();
          assert.match(snapshot, /region "Live preview"/);
          assert.match(snapshot, /button "Move the toolbar"/);
          assert.match(snapshot, /Draft/);
          assert.match(snapshot, /link "Edit this page"/);
          const link = toolbar(page).getByRole('link', { name: 'Edit this page' });
          assert.equal(await link.getAttribute('href'), `${adminOrigin}/#/collections/pages/entries/aaaaaaaaaaaa`);
          assert.equal(await handle(page).evaluate((grip) => grip.getRootNode().getElementById(grip.getAttribute('aria-describedby')).textContent), 'Drag it, or move it with the arrow keys. Pushed against the left or right edge, it tucks away into a tab that brings it back.');
          // The link follows on a click, in the same tab.
          await link.click();
          await page.waitForURL(`${adminOrigin}/#/collections/pages/entries/aaaaaaaaaaaa`);
          assert.equal(context.pages().length, 1);
        } finally {
          await context.close();
        }
      });

      test('is dragged anywhere with a mouse, and kept there across pages and visits', async () => {
        const { context, page } = await opened();
        try {
          await at(page);
          const before = await barBox(page);
          await dragged(page, -150, -300);
          const after = await barBox(page);
          near(after.x, before.x - 150, 'across');
          near(after.y, before.y - 300, 'down');
          // A drag by its link follows nothing.
          await dragged(page, 0, 40, toolbar(page).getByRole('link', { name: 'Edit this page' }));
          await page.waitForTimeout(300);
          assert.equal(page.url(), `${preview}/one/`);
          near((await barBox(page)).y, after.y + 40, 'dragged by its link');
          await dragged(page, 0, -40);
          await page.locator('#on').click();
          await page.waitForURL(`${preview}/two/`);
          await toolbar(page).getByText('Published').waitFor();
          const there = await barBox(page);
          near(there.x + there.width, after.x + after.width, 'on another page, by its nearer side, the right');
          near(there.y, after.y, 'on another page, down');
          const again = await at(await context.newPage(), '/one/');
          const visited = await barBox(again);
          near(visited.x, after.x, 'at another visit, across');
          near(visited.y, after.y, 'at another visit, down');
        } finally {
          await context.close();
        }
      });

      test('tucks into the left or right edge it is pushed against, and comes back on a click', async () => {
        const { context, page } = await opened();
        try {
          await at(page);
          const size = await windowOf(page);
          const start = await barBox(page);
          await dragged(page, -size.width, 0);
          await tab(page).waitFor();
          assert.equal(await handle(page).isVisible(), false, 'the bar is away');
          const left = await tabBox(page);
          near(left.x, 0, 'the tab on the left edge');
          await page.reload();
          await tab(page).waitFor();
          await tab(page).click();
          await handle(page).waitFor();
          const back = await barBox(page);
          near(back.x, 16, 'back by the left edge');
          near(back.y, start.y, 'where it was, down');

          await dragged(page, size.width, 0);
          await tab(page).waitFor();
          const right = await tabBox(page);
          near(right.x + right.width, size.width, 'the tab on the right edge');
          await tab(page).click();
          const backRight = await barBox(page);
          near(backRight.x + backRight.width, size.width - 16, 'back by the right edge');
        } finally {
          await context.close();
        }
      });

      test('is reached and moved with the keyboard, and tucked and brought back with it', async () => {
        const { context, page } = await opened();
        try {
          await at(page);
          const focused = () => page.evaluate(() => {
            let at = document.activeElement;
            while (at?.shadowRoot?.activeElement) at = at.shadowRoot.activeElement;
            return at?.getAttribute('aria-label') ?? at?.textContent ?? null;
          });
          // WebKit, as Safari, moves to a button by Tab with Option held.
          let reached = false;
          for (let press = 0; press < 8 && !reached; press += 1) {
            await page.keyboard.press(engine === 'webkit' ? 'Alt+Tab' : 'Tab');
            reached = await focused() === 'Move the toolbar';
          }
          assert.ok(reached, 'Tab reaches its handle');
          const start = await barBox(page);
          await page.keyboard.press('ArrowUp');
          await page.keyboard.press('Shift+ArrowLeft');
          const moved = await barBox(page);
          near(moved.y, start.y - 16, 'up a step');
          near(moved.x, start.x - 64, 'left four steps');
          // Against the right edge, a step further tucks it, and the focus goes to its tab.
          for (let press = 0; press < 10; press += 1) await page.keyboard.press('Shift+ArrowRight');
          await tab(page).waitFor();
          assert.equal(await focused(), 'Show the toolbar');
          await page.keyboard.press('Enter');
          await handle(page).waitFor();
          assert.equal(await focused(), 'Move the toolbar');
        } finally {
          await context.close();
        }
      });

      test('is dragged with a finger, tucked by it and brought back by a tap, on a phone\'s screen', async () => {
        const { context, page } = await opened({ viewport: { width: 390, height: 700 }, touch: true });
        try {
          await at(page);
          const size = await windowOf(page);
          const box = await barBox(page);
          assert.ok(box.x >= 0 && box.x + box.width <= size.width, 'it fits the screen');
          // Chromium is given a finger through its own input; in the other engines, which take no
          // moving finger from here, the finger's pointer events are sent to the bar.
          const touchDrag = async (dx, dy) => {
            const status = await toolbar(page).getByText('Draft').boundingBox();
            const from = { x: status.x + status.width / 2, y: status.y + status.height / 2 };
            if (engine === 'chromium') {
              const input = await context.newCDPSession(page);
              const point = (x, y) => [{ x, y, id: 1 }];
              await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(from.x, from.y) });
              for (let step = 1; step <= 10; step += 1) await input.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(from.x + (dx * step) / 10, from.y + (dy * step) / 10) });
              await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
              return;
            }
            await toolbar(page).getByText('Draft').evaluate((says, [start, by]) => {
              const bar = says.parentElement;
              const send = (type, x, y) => bar.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: type === 'pointermove' ? -1 : 0, clientX: x, clientY: y }));
              send('pointerdown', start.x, start.y);
              for (let step = 1; step <= 10; step += 1) send('pointermove', start.x + (by.dx * step) / 10, start.y + (by.dy * step) / 10);
              send('pointerup', start.x + by.dx, start.y + by.dy);
            }, [from, { dx, dy }]);
          };
          const scrolled = await page.evaluate(() => window.scrollY);
          await touchDrag(-150, -300);
          const moved = await barBox(page);
          near(moved.y, box.y - 300, 'up');
          assert.equal(await page.evaluate(() => window.scrollY), scrolled, 'the page did not scroll with it');
          await touchDrag(-size.width, 0);
          await tab(page).waitFor();
          const left = await tabBox(page);
          await page.touchscreen.tap(left.x + left.width / 2, left.y + left.height / 2);
          await handle(page).waitFor();
          near((await barBox(page)).x, 16, 'back by the left edge');
          // A tap on its link follows it.
          const link = await toolbar(page).getByRole('link', { name: 'Edit this page' }).boundingBox();
          await page.touchscreen.tap(link.x + link.width / 2, link.y + link.height / 2);
          await page.waitForURL(`${adminOrigin}/#/collections/pages/entries/aaaaaaaaaaaa`);
        } finally {
          await context.close();
        }
      });

      test('works where the browser keeps nothing, starting in its corner on each page', async () => {
        const { context, page } = await opened({ storage: false });
        try {
          await at(page);
          const start = await barBox(page);
          await dragged(page, -300, -200);
          near((await barBox(page)).x, start.x - 300, 'it moves');
          await at(page, '/two/');
          await toolbar(page).getByText('Published').waitFor();
          const there = await barBox(page);
          near(there.y, start.y, 'in its corner again');
        } finally {
          await context.close();
        }
      });

      test('is not in the pane beside the form', async () => {
        const { context, page } = await opened();
        try {
          await page.evaluate((src) => {
            document.getElementById('frame').src = src;
          }, `${preview}/one/`);
          const frame = page.frameLocator('#frame');
          await frame.getByRole('heading', { level: 1, name: 'One' }).waitFor();
          assert.equal(await frame.locator('konzilo-preview-toolbar').count(), 0);
          assert.equal(await page.locator('konzilo-preview-toolbar').count(), 0);
        } finally {
          await context.close();
        }
      });
    });
  }
});
