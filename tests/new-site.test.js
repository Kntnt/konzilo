// What a developer does from a fresh clone: bin/new-site makes a site
// repository, `npm install` installs the core and Astro, `npm run build` builds
// the demo content into a static site, and `npm run dev` serves it, following
// every change of the site's content and code. It needs no PHP, no database and
// no container.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../', import.meta.url));
const environment = { ...process.env, ASTRO_TELEMETRY_DISABLED: '1' };
delete environment.KONZILO_ORIGIN;

function run(command, args, cwd, env = environment) {
  return spawnSync(command, args, { cwd, encoding: 'utf8', env });
}

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
  probe.on('error', reject);
});

async function until(check, timeout = 60_000) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      if (await check()) return;
    } catch {
      // Not answering yet.
    }
    if (Date.now() > end) throw new Error(`still not so after ${timeout / 1000} seconds`);
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe('new-site', () => {
  let folder;
  let site;

  before(() => {
    folder = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-new-site-')));
    site = join(folder, 'lantern');
  });

  after(() => rmSync(folder, { recursive: true, force: true }));

  test('refuses a name that is no hostname label, and makes nothing', () => {
    const made = run(join(core, 'bin/new-site'), ['Not A Name'], folder);
    assert.equal(made.status, 2, made.stderr);
    assert.match(made.stderr, /lowercase letters, digits and inner hyphens/);
    assert.deepEqual(readdirSync(folder), []);
  });

  test('makes a git repository of the template, with the core pinned and no token left', () => {
    const made = run(join(core, 'bin/new-site'), ['lantern'], folder);
    assert.equal(made.status, 0, made.stderr);
    assert.equal(run('git', ['-C', site, 'log', '--format=%s'], folder).stdout.trim(), 'Create the site lantern with new-site');
    assert.equal(run('git', ['-C', site, 'status', '--porcelain'], folder).stdout, '');
    const pinned = JSON.parse(readFileSync(join(site, 'package.json'), 'utf8'));
    assert.equal(pinned.name, 'lantern');
    assert.match(pinned.dependencies['@kntnt/konzilo'], /^file:/);
    assert.match(pinned.dependencies.astro, /^\d+\.\d+\.\d+$/);
    for (const file of run('git', ['-C', site, 'ls-files'], folder).stdout.trim().split('\n')) {
      assert.doesNotMatch(readFileSync(join(site, file), 'utf8'), /@[A-Z][A-Z0-9_]*@/, file);
    }
  });

  test('refuses to make a site over a folder that is there', () => {
    const again = run(join(core, 'bin/new-site'), ['lantern'], folder);
    assert.equal(again.status, 1);
    assert.match(again.stderr, /already exists/);
  });

  describe('the site', () => {
    let dist;

    before(() => {
      const installed = run('npm', ['install', '--no-audit', '--no-fund'], site);
      assert.equal(installed.status, 0, installed.stderr);
      const built = run('npm', ['run', 'build'], site);
      assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
      dist = join(site, 'dist');
    });

    const read = (path) => readFileSync(join(dist, path), 'utf8');
    const pages = () => readdirSync(dist, { recursive: true }).filter((path) => path.endsWith('.html'));

    test('builds the demo content, which Git ignores, into a static site', () => {
      assert.ok(existsSync(join(site, 'content/articles')));
      assert.equal(run('git', ['-C', site, 'status', '--porcelain'], folder).stdout.includes('content/'), false);
      assert.ok(pages().length >= 10, pages().join());
      assert.match(read('index.html'), /The Gentle Garden/);
      assert.match(read('quiet-harbours-and-the-lantern/index.html'), /<h1>Quiet harbours and the lantern<\/h1>/);
    });

    test('writes the files a web server and a search engine read', () => {
      for (const file of ['_headers', '_redirects', '_markdown', 'robots.txt', 'sitemap.xml', 'llms.txt', 'llms-full.txt', 'favicon.ico', 'site.webmanifest', 'feed/index.rss', '404.html', '_konzilo/form-not-sent.html']) {
        assert.ok(existsSync(join(dist, file)), file);
      }
      assert.match(read('sitemap.xml'), /<loc>http:\/\/localhost:4321\/quiet-harbours-and-the-lantern\/<\/loc>/);
      assert.match(read('_headers'), /Content-Security-Policy: default-src 'self'/);
      assert.match(read('quiet-harbours-and-the-lantern.md'), /^# Quiet harbours and the lantern$/m);
      assert.match(read('feed/index.rss'), /<title>Quiet harbours and the lantern<\/title>/);
    });

    test('writes the site\'s theme colours from its tokens into every page and the manifest', () => {
      assert.match(read('index.html'), /<meta name="theme-color" content="#0b57d0">/);
      const manifest = JSON.parse(read('site.webmanifest'));
      assert.equal(manifest.theme_color, '#0b57d0');
      assert.equal(manifest.background_color, '#ffffff');
      for (const page of pages()) assert.doesNotMatch(read(page), /konzilo:(?:theme-color|markdown)/, page);
    });

    test('writes body text with no class of the core\'s but its own', () => {
      const body = /<article class="body-text">([\s\S]*?)<\/article>/.exec(read('quiet-harbours-and-the-lantern/index.html'))?.[1] ?? '';
      assert.notEqual(body, '');
      for (const [, classes] of body.matchAll(/<(?:h[2-6]|p|ul|ol|li|blockquote|figure|figcaption)\b[^>]* class="([^"]*)"/g)) assert.match(classes, /^(?:konzilo-|terms|categories|tags)/);
    });

    test('is built for the host KONZILO_ORIGIN names', () => {
      const built = run('npx', ['astro', 'build'], site, { ...environment, KONZILO_ORIGIN: 'https://www.example.com' });
      assert.equal(built.status, 0, built.stderr);
      assert.match(read('sitemap.xml'), /<loc>https:\/\/www\.example\.com\/quiet-harbours-and-the-lantern\/<\/loc>/);
    });

    test('refuses a host that is not https, but for localhost', () => {
      const built = run('npx', ['astro', 'build'], site, { ...environment, KONZILO_ORIGIN: 'http://www.example.com' });
      assert.notEqual(built.status, 0);
      assert.match(`${built.stdout}${built.stderr}`, /KONZILO_ORIGIN must be the origin of the public host/);
    });

    describe('npm run dev', () => {
      let server;
      let origin;

      before(async () => {
        const port = await freePort();
        origin = `http://localhost:${port}`;
        server = spawn('npm', ['run', 'dev', '--', '--host', 'localhost', '--port', String(port), '--ignore-lock'], { cwd: site, env: environment, stdio: 'ignore', detached: true });
        await until(async () => (await (await fetch(`${origin}/`)).text()).includes('The Gentle Garden'));
      });

      after(() => {
        // The dev server and what it started, as one process group.
        try {
          process.kill(-server.pid);
        } catch {
          // It has ended already.
        }
      });

      const text = async (path) => (await fetch(`${origin}${path}`)).text();

      test('serves the pages, with the alternates and the sitemap', async () => {
        assert.match(await text('/quiet-harbours-and-the-lantern/'), /<h1>Quiet harbours and the lantern<\/h1>/);
        assert.match(await text('/quiet-harbours-and-the-lantern.md'), /^# Quiet harbours and the lantern$/m);
        assert.match(await text('/sitemap.xml'), /quiet-harbours-and-the-lantern/);
      });

      test('follows a change of a content file', async () => {
        const file = join(site, 'content/articles/quiet-harbours-and-the-lantern.md');
        writeFileSync(file, readFileSync(file, 'utf8').replace(/\n\n/, '\n\nA sentence written just now.\n\n'));
        await until(async () => (await text('/quiet-harbours-and-the-lantern/')).includes('A sentence written just now.'));
      });

      test('follows a change of the site\'s code', async () => {
        const file = join(site, 'src/pages/[...article].astro');
        writeFileSync(file, readFileSync(file, 'utf8').replaceAll('<main>', '<main data-changed="yes">'));
        await until(async () => (await text('/quiet-harbours-and-the-lantern/')).includes('data-changed="yes"'));
      });
    });
  });
});
