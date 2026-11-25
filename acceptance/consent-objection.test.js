// The right to object to counting without storage, placed in a post's body by
// `::consent-objection` (ADR 0049), as a visitor meets it in each browser engine, from the
// static build of a small site that counts visits without storage before consent: shown beside
// the paragraphs around it while the visitor allows no statistics, its link opens the
// confirmation, confirming objects, the paragraph that takes the objection back shows, on the
// next page too, and its link takes it back; and once the visitor allows statistics it hides.
// tests/consent-objection.test.js has what the build writes, and the site that counts no
// visits so, where it writes nothing.

import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { AFTER, BEFORE, COUNTING, objectionSite, POST } from '../tests/lib/objection-site.js';
import { ENGINES } from './lib/editor.js';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };

// The build's files, as the public host serves them.
function serve(dist) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = join(dist, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe('the right to object in a body, as a visitor meets it', () => {
  let site;
  let server;
  let origin;

  before(async () => {
    site = objectionSite(COUNTING);
    server = await serve(site.dist);
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  // A build that failed has no server to close.
  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    site?.remove();
  });

  for (const engine of Object.keys(ENGINES)) {
    test(`${engine}: shows it in the body while no statistics are allowed, objects through the confirmation, keeps the objection to the next page, takes it back, and hides once statistics are allowed`, async () => {
      const browser = await ENGINES[engine].launch();
      try {
        const context = await browser.newContext({ locale: 'en-GB' });
        // Matomo's tracker, which counts before consent here, is outside: it is given nothing.
        const outside = [];
        await context.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.hostname === '127.0.0.1') return route.continue();
          outside.push(url.href);
          return route.fulfill({ status: 200, contentType: 'text/javascript', body: '' });
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${origin}${POST}`);

        // The right to object in the body, between its paragraphs, and not the dialog's.
        const objection = page.locator('main > .konzilo-consent-controls > [data-konzilo-consent-objection]');
        const explanation = objection.locator('.konzilo-consent-objection-text');
        const object = explanation.locator('a[data-konzilo-consent-action="objection"]');
        const objected = objection.locator('[data-konzilo-consent-objected]');
        const resume = objected.locator('a[data-konzilo-consent-action="resume"]');
        const confirmation = page.locator('dialog#konzilo-consent-objection');

        await objection.waitFor({ state: 'visible' });
        const body = await page.locator('main').evaluate((main) => [...main.children].map((child) => [child.tagName, child.className, child.textContent.trim()]));
        assert.deepEqual(body.map(([tag, className]) => [tag, className]), [['P', ''], ['DIV', 'konzilo-consent-controls'], ['P', '']]);
        assert.deepEqual([body[0][2], body[2][2]], [BEFORE, AFTER]);
        assert.match(await explanation.innerText(), /you have the right to object\.$/);
        assert.equal(await objected.isVisible(), false);

        await object.click();
        await confirmation.waitFor({ state: 'visible' });
        assert.equal(await confirmation.evaluate((dialog) => dialog.matches(':modal')), true, 'a modal confirmation');
        await confirmation.locator('button[data-konzilo-consent-action="object"]').click();
        await confirmation.waitFor({ state: 'hidden' });
        await objected.waitFor({ state: 'visible' });
        assert.equal(await resume.innerText(), 'Undo your objection');
        assert.equal(await object.getAttribute('href'), null, 'the word that objected is plain text');

        await page.reload();
        await objected.waitFor({ state: 'visible' });
        await resume.click();
        await objected.waitFor({ state: 'hidden' });
        assert.equal(await object.getAttribute('href'), '#konzilo-consent-objection', 'a link again');

        await page.locator('.konzilo-consent-banner button[data-konzilo-consent-action="accept"]').click();
        await objection.waitFor({ state: 'hidden' });
        await page.reload();
        await page.waitForFunction(() => window.konziloConsent?.choice()?.categories?.statistics === true);
        assert.equal(await objection.isVisible(), false, 'hidden on the next page while statistics are allowed');

        assert.deepEqual(errors, []);
        assert.ok(outside.every((address) => address.startsWith('https://matomo.example.com/')), outside.join(', '));
      } finally {
        await browser.close();
      }
    });
  }
});
