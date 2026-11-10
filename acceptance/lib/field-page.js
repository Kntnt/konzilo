// The body field in a real browser with no Compose, built as the editor is built and served
// under the admin host's own policy, read from the Caddyfile, so that what the policy refuses
// shows here too: on a page of its own, or in Sveltia on its test repository.

import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';

import { buildEditor } from '../../scripts/build-editor.js';

const core = fileURLToPath(new URL('../../', import.meta.url));
const pageFile = fileURLToPath(new URL('./field-page/index.html', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.wasm': 'application/wasm', '.json': 'application/json', '.woff2': 'font/woff2' };

const adminPolicy = () => {
  const caddyfile = readFileSync(join(core, 'compose/web/Caddyfile'), 'utf8');
  return /Content-Security-Policy "([^"]+)"/.exec(caddyfile)[1].replaceAll('{$KONZILO_FORGEJO_ORIGIN}', 'http://localhost:1').replaceAll('{$KONZILO_PREVIEW_ORIGIN}', 'http://localhost:3');
};

async function serve(folder, configs) {
  const policy = adminPolicy();
  const read = (path) => {
    try {
      return { path, body: readFileSync(join(folder, path)) };
    } catch {
      return null;
    }
  };
  const server = createServer((request, response) => {
    const asked = normalize(new URL(request.url, 'http://x').pathname);
    const found = configs && Object.hasOwn(configs, asked.slice(1))
      ? { path: asked, body: JSON.stringify(configs[asked.slice(1)]) }
      : read(asked === '/' ? '/index.html' : asked) ?? (configs ? read('/index.html') : null);
    if (found === null) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(found.path)] ?? 'application/octet-stream', 'Content-Security-Policy': policy });
    response.end(found.body);
  });
  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  return server;
}

// A browser on a built page. `config` makes it the editor itself, with that configuration,
// and `configs` with those, by file, as config.json and config.<language>.json.
export async function openFieldPage({ locale = 'en-GB', engine = chromium, config, configs = config ? { 'config.json': config } : null } = {}) {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-field-page-')));
  await buildEditor(folder, configs ? {} : { input: pageFile });
  const server = await serve(folder, configs);
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await engine.launch();

  const newPage = async ({ language = locale, block = () => false, viewport = { width: 1200, height: 900 } } = {}) => {
    const context = await browser.newContext({ locale: language, viewport });
    const seen = { outside: [], refused: [], errors: [] };
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (block(url)) return route.abort();
      if (url.origin === origin || !url.protocol.startsWith('http')) return route.continue();
      seen.outside.push(url.href);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (/content.security.policy|refused to/i.test(text)) seen.refused.push(text);
      else if (!/^Failed to load resource/.test(text)) seen.errors.push(text);
    });
    page.on('pageerror', (error) => seen.errors.push(error.message));
    await page.goto(`${origin}/`);
    if (!configs) await page.waitForFunction(() => globalThis.fieldPage !== undefined);
    return { page, seen, context };
  };

  return {
    newPage,
    async close() {
      await browser.close();
      await new Promise((resolve) => {
        server.close(resolve);
      });
      rmSync(folder, { recursive: true, force: true });
    },
  };
}
