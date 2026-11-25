// The start of a sign-in in a real browser, with no Compose, in each engine: the editor as it is
// built, and a stand-in for Forgejo that answers its sign-in page alone. The window the editor
// opens goes to Forgejo's page with what the sign-in needs, and nothing a page asks for on the way
// is refused. Compose has the sign-in whole, with both factors.
//
// WebKit refuses whatever a page asks for once that page has started for another, a read of a Blob
// among it, which WebKit loads from a blob address of its own making, and says of each that it
// cannot be loaded "due to access control checks". A sign-in window that opens with the editor in
// it has the editor at work as it leaves for Forgejo, reading the two icons it makes of its logo
// among other things, and which comes first, the leaving or a read, is a matter of milliseconds.
// So the window is opened several times, with each picture the editor loads from memory held a
// little longer each time, as machines of different speeds would hold it, and Forgejo takes a
// moment to answer, as a real one does.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cmsConfig } from '../src/cms/config.js';
import { siteDescription } from '../src/site-description.js';
import { ENGINES } from './lib/editor.js';
import { openFieldPage } from './lib/field-page.js';

const core = fileURLToPath(new URL('../', import.meta.url));

// How long each picture loaded from memory is held, in ms, one opening of the window for each.
const HELD = [0, 10, 20, 30, 40, 50, 60, 70];
// How long Forgejo takes to answer, in ms.
const FORGEJO_TAKES = 300;

for (const [name, engine] of Object.entries(ENGINES)) {
  describe(`a sign-in in ${name}`, () => {
    let site;
    let forgejo;
    let forgejoOrigin;

    before(async () => {
      forgejo = createServer((request, response) => {
        setTimeout(() => {
          response.writeHead(200, { 'Content-Type': 'text/html' });
          response.end('<!doctype html><html lang="en"><title>Sign in</title><h1>Sign in</h1></html>');
        }, FORGEJO_TAKES);
      });
      await new Promise((resolve) => {
        forgejo.listen(0, '127.0.0.1', resolve);
      });
      forgejoOrigin = `http://127.0.0.1:${forgejo.address().port}`;
      const declared = JSON.parse(readFileSync(`${core}site-template/files/site-description.json`, 'utf8'));
      const config = cmsConfig(siteDescription(declared), { forgejo: forgejoOrigin, repository: 'a/b', clientId: 'the-client', site: 'http://localhost:2' });
      site = await openFieldPage({ engine, config, forgejo: forgejoOrigin });
    }, { timeout: 120_000 });

    after(async () => {
      await site?.close();
      await new Promise((resolve) => {
        forgejo.close(resolve);
      });
    });

    test('sends its window to Forgejo\'s page with what the sign-in needs, and nothing asked for on the way is refused', async () => {
      for (const held of HELD) {
        const { page, seen, context, watch } = await site.newPage({ viewport: { width: 1400, height: 900 } });
        await context.route(/^blob:/, async (route) => {
          await new Promise((resolve) => {
            setTimeout(resolve, held);
          });
          await route.fallback();
        });
        const button = page.getByRole('button', { name: /Forgejo/ });
        await button.waitFor();
        // Safari opened no popup for a click right after a load (ADR 0007).
        await page.waitForTimeout(1000);
        const [popup] = await Promise.all([context.waitForEvent('page'), button.click()]);
        watch(popup);
        await popup.getByRole('heading', { name: 'Sign in' }).waitFor();

        const address = new URL(popup.url());
        assert.equal(`${address.origin}${address.pathname}`, `${forgejoOrigin}/login/oauth/authorize`);
        const asked = Object.fromEntries(address.searchParams);
        assert.equal(asked.client_id, 'the-client');
        assert.equal(asked.redirect_uri, new URL(page.url()).origin + new URL(page.url()).pathname, 'to come back to the editor');
        assert.equal(asked.response_type, 'code');
        assert.equal(asked.code_challenge_method, 'S256');
        assert.match(asked.code_challenge ?? '', /^[A-Za-z0-9_-]{43}$/);
        assert.match(asked.state ?? '', /^[0-9a-f]{32}$/);
        // The editor knows its sign-in window, when it comes back, by its name and by who opened it.
        assert.deepEqual(await popup.evaluate(() => [window.name, window.opener !== null]), ['auth', true]);

        assert.deepEqual(seen, { outside: [], refused: [], errors: [] }, `with each picture held ${held} ms`);
        await context.close();
      }
    });
  });
}
