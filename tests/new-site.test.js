// What a developer does from a fresh clone: bin/new-site makes a site
// repository, `npm install` installs the core and Astro, `npm run build` builds
// the demo content into a static site, the core's or the site's own, and
// `npm run dev` serves it, following every change of the site's content and
// code. It needs no PHP, no database and no container.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { OWN_DEMO, writeOwnDemoContent } from './lib/demo-content.js';

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

async function until(check, timeout = 90_000) {
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

// `npm run dev` in a site, once its start page holds `words`: its origin, and how to stop it.
async function startDev(site, words) {
  const port = await freePort();
  // An address, not `localhost`: in a Linux container the server binds that name
  // to ::1 alone, while Node's fetch reaches for 127.0.0.1 and is refused.
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(port), '--ignore-lock'], { cwd: site, env: environment, stdio: 'ignore', detached: true });
  const stop = () => {
    // The dev server and what it started, as one process group.
    try {
      process.kill(-server.pid);
    } catch {
      // It has ended already.
    }
  };
  try {
    await until(async () => (await (await fetch(`${origin}/`)).text()).includes(words));
  } catch (error) {
    stop();
    throw error;
  }
  return { origin, stop, text: async (path) => (await fetch(`${origin}${path}`)).text() };
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
    assert.equal(pinned.dependencies['@kntnt/konzilo'], `file:${realpathSync(core).replace(/\/$/, '')}`, 'this checkout, by its path');
    assert.equal(existsSync(join(site, 'vendor')), false, 'no packed core');
    assert.match(pinned.dependencies.astro, /^\d+\.\d+\.\d+$/);
    for (const file of run('git', ['-C', site, 'ls-files'], folder).stdout.trim().split('\n')) {
      assert.doesNotMatch(readFileSync(join(site, file), 'utf8'), /@[A-Z][A-Z0-9_]*@/, file);
    }
  });

  test('gives the site its own ports, with the same three every time, and points Compose at this core', () => {
    const settings = readFileSync(join(site, '.env'), 'utf8');
    const port = (key) => Number(new RegExp(`^KONZILO_PORT_${key}=(\\d+)$`, 'm').exec(settings)[1]);
    assert.ok(port('SITE') >= 20000 && port('SITE') < 30000);
    assert.equal(port('ADMIN'), port('SITE') + 1);
    assert.equal(port('GIT'), port('SITE') + 2);
    assert.match(settings, /^KONZILO_SITE=lantern$/m);
    assert.ok(readFileSync(join(site, 'compose.yaml'), 'utf8').includes(`path: ${realpathSync(core).replace(/\/$/, '')}/compose/compose.yaml`));
    assert.match(run('git', ['-C', site, 'ls-files'], folder).stdout, /^\.env$/m);
    assert.match(run('git', ['-C', site, 'ls-files'], folder).stdout, /^local-secrets\/account-password$/m);
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

    test('builds the demo content, which Git ignores, on the built-in types, into a static site', () => {
      assert.ok(existsSync(join(site, 'content/articles')));
      assert.equal(run('git', ['-C', site, 'status', '--porcelain'], folder).stdout.includes('content/'), false);
      assert.ok(pages().length >= 10, pages().join());
      assert.match(read('index.html'), /The Gentle Garden/);
      assert.match(read('quiet-harbours-and-the-lantern/index.html'), /<h1>Quiet harbours and the lantern<\/h1>/);
      assert.match(read('golden-harbours-and-the-harbour/index.html'), /<p class="eyebrow">Harbours<\/p>\s*<h1>Golden harbours and the harbour<\/h1>\s*<p class="subheadline">/);
      assert.match(read('golden-harbours-and-the-harbour/index.html'), /<ul class="topics"><li>Orchards<\/li><li>Rivers<\/li><\/ul>/);
      assert.match(read('landing/spring-in-the-valley/index.html'), /<h2[^>]*>Spring in the valley<\/h2>/);
      assert.doesNotMatch(read('landing/spring-in-the-valley/index.html'), /<header>|<footer>/, 'a canvas has neither header nor footer');
      assert.ok(existsSync(join(site, 'content/authors/ines-holm.json')));
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
      for (const [, classes] of body.matchAll(/<(?:h[2-6]|p|ul|ol|li|blockquote|figure|figcaption)\b[^>]* class="([^"]*)"/g)) assert.match(classes, /^(?:konzilo-|eyebrow|subheadline|standfirst|meta-line|terms|topics)/);
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

      before(async () => {
        server = await startDev(site, 'The Gentle Garden');
      });

      after(() => server?.stop());

      const text = (path) => server.text(path);

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

    // A site that shows itself with posts of its own keeps them in its demo-content/, which
    // Git tracks, and a local copy with no content folder starts from them in place of the core's.
    describe('with demo content of its own', () => {
      const withoutContent = () => rmSync(join(site, 'content'), { recursive: true, force: true });

      before(async () => {
        await writeOwnDemoContent(join(site, 'demo-content'));
      });

      test('builds it when the site has no content folder, and nothing of the core\'s', () => {
        withoutContent();
        rmSync(dist, { recursive: true, force: true });
        const built = run('npm', ['run', 'build'], site);
        assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
        assert.match(read('index.html'), new RegExp(OWN_DEMO.title));
        assert.doesNotMatch(read('index.html'), /The Gentle Garden/);
        assert.match(read(`${OWN_DEMO.article.address}index.html`), new RegExp(`<h1>${OWN_DEMO.article.title}</h1>`));
        assert.match(read(`${OWN_DEMO.page.address}index.html`), new RegExp(OWN_DEMO.page.words));
        assert.equal(existsSync(join(dist, 'quiet-harbours-and-the-lantern')), false, 'no article of the core\'s');
        assert.match(run('git', ['-C', site, 'status', '--porcelain'], folder).stdout, /^\?\? demo-content\/$/m, 'Git does not ignore it: it is the site\'s own to commit');
      });

      test('refuses a build for a public host with no content', () => {
        withoutContent();
        const built = run('npm', ['run', 'build'], site, { ...environment, KONZILO_ORIGIN: 'https://www.example.com' });
        assert.notEqual(built.status, 0);
        assert.match(built.stderr, /demo content is not for a public host/);
        assert.equal(existsSync(join(site, 'content')), false);
      });

      describe('npm run dev', () => {
        let server;

        before(async () => {
          withoutContent();
          server = await startDev(site, OWN_DEMO.title);
        });

        after(() => server?.stop());

        test('serves it from a site with no content folder, and nothing of the core\'s', async () => {
          assert.match(await server.text(OWN_DEMO.article.address), new RegExp(OWN_DEMO.article.words));
          assert.doesNotMatch(await server.text('/'), /The Gentle Garden/);
          assert.equal((await fetch(`${server.origin}/quiet-harbours-and-the-lantern/`)).status, 404);
        });
      });
    });
  });
});

// A site that anyone can install pins a release: new-site fetches the release's package, the
// tarball `npm pack` makes, into the site's vendor/ and pins it there. A tarball packed from this
// checkout, in a folder laid out as GitHub lays out a release's files, stands in for the release.
describe('new-site --release', () => {
  const { version } = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8'));
  const release = `v${version}`;
  const file = `kntnt-konzilo-${version}.tgz`;
  let folder;
  let releases;
  let site;
  let env;

  before(() => {
    folder = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-new-site-release-')));
    releases = join(folder, 'releases');
    mkdirSync(join(releases, release), { recursive: true });
    const packed = run('npm', ['pack', '--pack-destination', join(releases, release)], core);
    assert.equal(packed.status, 0, packed.stderr);
    site = join(folder, 'sites', 'beacon');
    mkdirSync(join(folder, 'sites'));
    env = { ...environment, KONZILO_RELEASES: pathToFileURL(releases).href };
  });

  after(() => rmSync(folder, { recursive: true, force: true }));

  test('refuses a release that is no version tag, and makes nothing', () => {
    const made = run(join(core, 'bin/new-site'), ['--release', version, 'beacon'], join(folder, 'sites'), env);
    assert.equal(made.status, 2, made.stderr);
    assert.match(made.stderr, /a release is a tag such as v1\.2\.3/);
    assert.deepEqual(readdirSync(join(folder, 'sites')), []);
  });

  test('refuses a release whose package it cannot fetch, and makes nothing', () => {
    const made = run(join(core, 'bin/new-site'), ['--release', 'v0.0.1', 'beacon'], join(folder, 'sites'), env);
    assert.equal(made.status, 1, made.stderr);
    assert.match(made.stderr, /cannot fetch .*v0\.0\.1\/kntnt-konzilo-0\.0\.1\.tgz/);
    assert.deepEqual(readdirSync(join(folder, 'sites')), []);
  });

  test('refuses a file that is not the release\'s package, and makes nothing', () => {
    mkdirSync(join(releases, 'v9.9.9'));
    copyFileSync(join(releases, release, file), join(releases, 'v9.9.9', 'kntnt-konzilo-9.9.9.tgz'));
    const made = run(join(core, 'bin/new-site'), ['--release', 'v9.9.9', 'beacon'], join(folder, 'sites'), env);
    assert.equal(made.status, 1, made.stderr);
    assert.match(made.stderr, /is not the package of @kntnt\/konzilo 9\.9\.9/);
    assert.deepEqual(readdirSync(join(folder, 'sites')), []);
  });

  test('keeps the release\'s package in the site\'s vendor/, pinned by that path and committed', () => {
    const made = run(join(core, 'bin/new-site'), ['--release', release, 'beacon'], join(folder, 'sites'), env);
    assert.equal(made.status, 0, made.stderr);
    assert.deepEqual(readFileSync(join(site, 'vendor', file)), readFileSync(join(releases, release, file)));
    assert.equal(JSON.parse(readFileSync(join(site, 'package.json'), 'utf8')).dependencies['@kntnt/konzilo'], `file:vendor/${file}`);
    assert.match(run('git', ['-C', site, 'ls-files'], folder).stdout, new RegExp(`^vendor/${file.replaceAll('.', '\\.')}$`, 'm'));
    assert.equal(run('git', ['-C', site, 'status', '--porcelain'], folder).stdout, '');
  });

  test('installs the package with its integrity in the lock, and builds the demo content', () => {
    const installed = run('npm', ['install', '--no-audit', '--no-fund'], site);
    assert.equal(installed.status, 0, installed.stderr);
    const locked = JSON.parse(readFileSync(join(site, 'package-lock.json'), 'utf8')).packages['node_modules/@kntnt/konzilo'];
    assert.equal(locked.resolved, `file:vendor/${file}`);
    assert.match(locked.integrity, /^sha512-/);
    assert.equal(existsSync(join(site, 'node_modules/@kntnt/konzilo/tests')), false, 'the package, not the checkout');
    const built = run('npm', ['run', 'build'], site);
    assert.equal(built.status, 0, `${built.stdout}\n${built.stderr}`);
    assert.match(readFileSync(join(site, 'dist/index.html'), 'utf8'), /The Gentle Garden/);
    assert.match(readFileSync(join(site, 'dist/quiet-harbours-and-the-lantern/index.html'), 'utf8'), /<h1>Quiet harbours and the lantern<\/h1>/);
  });
});
