// Sveltia in a real browser, signing in as a person does, with both factors, and
// watching for what a strict policy would stop.

import { chromium, firefox, webkit } from 'playwright-core';

export const ENGINES = { chromium, firefox, webkit };

const LOCAL = new Set(['localhost', '127.0.0.1']);

export async function openEditor(engine, site, { locale = 'en-GB' } = {}) {
  const browser = await ENGINES[engine].launch();
  const context = await browser.newContext({ locale, viewport: { width: 1400, height: 900 } });
  const seen = { outside: [], refused: [], errors: [] };

  // Nothing may leave this copy of the site: what is asked for outside is noted and
  // stopped, as a strict policy would.
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (LOCAL.has(url.hostname) || !url.protocol.startsWith('http')) return route.continue();
    seen.outside.push(url.href);
    return route.abort();
  });

  const watch = (page) => {
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (/content.security.policy|refused to/i.test(text)) seen.refused.push(text);
      else if (!/^Failed to load resource/.test(text)) seen.errors.push(text);
    });
    page.on('pageerror', (error) => seen.errors.push(error.message));
    // WebKit reports a refused address only as a line with no address, so note it here.
    // Forgejo's pages link a web app manifest, which WebKit alone asks for, and which
    // the proxy rightly leaves closed.
    page.on('response', (response) => {
      if (response.status() >= 400 && new URL(response.url()).pathname !== '/manifest.json') {
        seen.errors.push(`${response.status()} ${response.url()}`);
      }
    });
  };

  const page = await context.newPage();
  watch(page);
  await page.goto(`${site.origin.admin}/`);
  return { browser, context, page, seen, watch };
}

const lastCodes = new Map();

// A code once used is refused until the next one, so wait for a new one, each person's own.
export async function freshCode(login, make) {
  for (;;) {
    const code = make();
    if (code !== lastCodes.get(login)) {
      lastCodes.set(login, code);
      return code;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

// The account the seed makes, which a site's teams have as an Admin.
const seeded = (site) => ({ login: 'anna', password: 'local-only-account-password', code: () => site.code() });

// A new post of `collection` in Sveltia, once its own form is shown, with `ready` in it. Sveltia
// changes its view inside a view transition, a frame or more after the address changes, and
// until then the form it leaves is still there and takes what is typed. So the fields shown are
// marked first, and the new form is the one shown once none of them is left. A new post of the
// collection that is already shown stays, with what it holds: Playwright's goto to the address
// shown would open it anew a moment later, or in WebKit load the page again.
export async function openNew(page, collection, ready = '.konzilo-body-visual .ProseMirror') {
  const left = await page.evaluate((hash) => {
    if (window.location.hash === hash) return false;
    for (const field of document.querySelectorAll('section.field')) field.dataset.left = '';
    window.location.hash = hash;
    return true;
  }, `#/collections/${collection}/new`);
  if (left) await page.locator('section.field[data-left]').first().waitFor({ state: 'detached' });
  await page.locator(ready).first().waitFor();
}

// Forgejo's sign-in on `page`, as a person goes through it, with both factors: the seeded
// account's, or `person`'s, { login, password, code() }. `through` settles once it has gone
// through, which is all that says a code was taken.
export async function throughForgejo(page, site, through, person = seeded(site)) {
  let done = false;
  through.then(() => {
    done = true;
  }, () => {});
  await page.locator('#user_name').waitFor();
  await page.locator('#user_name').fill(person.login);
  await page.locator('#password').fill(person.password);
  await page.locator('#password').press('Enter');
  await page.waitForURL(/two_factor/);
  // A code from the seconds around a change of period can miss, so it may take two.
  for (let attempt = 0; attempt < 3 && !done; attempt += 1) {
    await page.locator('input[name=passcode]').fill(await freshCode(person.login, person.code));
    await page.locator('input[name=passcode]').press('Enter');
    await Promise.race([through, new Promise((resolve) => setTimeout(resolve, 8000))]);
  }
  await through;
}

export async function signIn({ context, page, watch }, site) {
  const button = page.getByRole('button', { name: /Forgejo/ });
  await button.waitFor();
  // Safari opened no popup for a click right after a load (ADR 0007).
  await page.waitForTimeout(1000);
  const [popup] = await Promise.all([context.waitForEvent('page'), button.click()]);
  watch(popup);
  await throughForgejo(popup, site, popup.waitForEvent('close', { timeout: 120_000 }));
}
