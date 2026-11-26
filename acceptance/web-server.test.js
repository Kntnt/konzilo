// The public host's web server with the Markdown alternates of a release (ADR 0047): real Caddy of
// the pinned build, with the core's own Caddyfile, serving releases as the host makes them, from
// a build's pages, its `_markdown` and the rules a build gives. A page with an alternate links it
// and the files its row has on, varies by Accept, and answers with the alternate where the request
// prefers Markdown, by the dev server's rule, prefersMarkdown(); a publish that adds or removes an
// alternate needs no reload. One container, without Compose, removed by its name.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { prefersMarkdown } from '../src/astro/markdown-alternates.js';
import { releases } from '../src/build/release.js';
import { markdownMarks, webRules } from '../src/build/web-server.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const pinned = (key) => execFileSync('sh', [join(core, 'scripts/versions'), key], { encoding: 'utf8' }).trim();
const IMAGE = `caddy:${pinned('CADDY')}-alpine@sha256:${pinned('CADDY_DIGEST')}`;
const ORIGIN = 'https://www.example.com';
const NAME = `konzilo-web-server-${process.pid}`;

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
  probe.on('error', reject);
});

// A build's pages, by their paths, and its `_markdown`: the start page and two pages with an
// alternate, one at an address beyond ASCII, a page at /index/, and a page with none.
const page = (words) => `<!doctype html><html><head><title>${words}</title></head><body><main>${words}</main></body></html>\n`;
const BUILT = {
  'index.html': page('The start page'),
  'index.md': '# The start page\n',
  'about/index.html': page('About'),
  'about.md': '# About\n',
  'index/index.html': page('An index'),
  'index/index.md': '# An index\n',
  'öppet/index.html': page('Öppet'),
  'öppet.md': '# Öppet\n',
  'notes/jotting/index.html': page('A jotting'),
  'notes/jotting.md': '# A jotting\n',
  'llms.txt': '# The site\n',
  'llms-full.txt': '# The site\n',
  '404.html': page('Not found'),
};
const LIST = '/ /index.md /llms.txt /llms-full.txt\n/about/ /about.md /llms.txt\n/index/ /index/index.md /llms-full.txt\n/%C3%B6ppet/ /%C3%B6ppet.md\n';

const ALTERNATE = (address) => `<${ORIGIN}${address}>; rel="alternate"; type="text/markdown"`;
const LLMS = `<${ORIGIN}/llms.txt>; rel="related"; type="text/plain"`;
const LLMS_FULL = `<${ORIGIN}/llms-full.txt>; rel="related"; type="text/plain"`;
const CANONICAL = (address) => `<${ORIGIN}${address}>; rel="canonical"`;

// Headers built from ranges of these, seeded, so that each run asks the same.
function acceptHeaders(count) {
  let seed = 47;
  const random = () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return seed / 2_147_483_648;
  };
  const pick = (list) => list[Math.floor(random() * list.length)];
  const types = ['text/markdown', 'text/x-markdown', 'text/html', 'application/xhtml+xml', 'text/*', 'application/*', '*/*', 'TEXT/Markdown', 'Text/HTML', 'text/plain', 'q', ''];
  const parameters = ['q=0.5', 'q=1', 'q=0', 'q=1.0', 'q=0.123', 'q=0.1234', 'q=1.5', 'q', 'q =0.3', 'q= 0.7', 'Q=0.9', 'level=1', 'q=.5', 'q=0.', 'q=1.', 'q=0.9 x', 'q==1', 'qq=1', 'q=1.000', 'q\t=\t0.2'];
  const space = () => pick(['', ' ', '  ', '\t']);
  return Array.from({ length: count }, () => {
    const ranges = Array.from({ length: random() < 0.1 ? 30 + Math.floor(random() * 6) : 1 + Math.floor(random() * 5) }, () => {
      const range = space() + pick(types) + space();
      return range + Array.from({ length: Math.floor(random() * 3) }, () => `;${space()}${pick(parameters)}${space()}`).join('');
    });
    return ranges.join(',').trim();
  });
}

describe('the public host\'s web server', () => {
  let folder;
  let live;
  let site;
  let count = 0;

  // A release made of a build's files, as the builder makes it (src/build/build.js), and then made
  // what the web server serves, in a volume of Docker's, as in Compose: a folder this machine
  // shares with a container shows a link replaced by a rename late, if at all.
  const publish = (files, list) => {
    const built = join(folder, `built-${(count += 1)}`);
    for (const [path, contents] of Object.entries({ ...files, _markdown: list })) {
      mkdirSync(dirname(join(built, path)), { recursive: true });
      writeFileSync(join(built, path), contents);
    }
    const holds = (path) => statSync(join(built, path), { throwIfNoEntry: false })?.isFile() === true;
    const name = `release-${count}`;
    live.publish(built, name, webRules({ origin: ORIGIN }), markdownMarks(list, holds));
    execFileSync('docker', ['exec', NAME, 'mkdir', '-p', '/srv/site/releases'], { stdio: 'pipe' });
    execFileSync('docker', ['cp', join(folder, 'site/releases', name), `${NAME}:/srv/site/releases/${name}`], { stdio: 'pipe' });
    execFileSync('docker', ['exec', NAME, 'ln', '-sfn', `releases/${name}`, '/srv/site/current'], { stdio: 'pipe' });
  };

  before(async () => {
    folder = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-web-server-')));
    mkdirSync(join(folder, 'site'));
    live = releases(join(folder, 'site'));
    const port = await freePort();
    site = `http://127.0.0.1:${port}`;
    const ports = ['SITE', 'ADMIN', 'GIT', 'PREVIEW'].flatMap((host, at) => ['--env', `KONZILO_PORT_${host}=${at === 0 ? port : 9000 + at}`]);
    execFileSync('docker', ['run', '--detach', '--rm', '--name', NAME, '--publish', `127.0.0.1:${port}:${port}`, ...ports,
      '--volume', `${NAME}:/srv/site`, '--volume', `${join(core, 'compose/web/Caddyfile')}:/etc/caddy/Caddyfile:ro`,
      IMAGE, 'caddy', 'run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile', '--watch'], { stdio: 'pipe' });
    publish(BUILT, LIST);
    // Once it has taken the release's rules, which it looks for each second.
    const deadline = Date.now() + 60_000;
    for (;;) {
      try {
        if ((await fetch(`${site}/`)).headers.has('link')) break;
      } catch {
        // Not answering yet.
      }
      if (Date.now() > deadline) throw new Error(`the web server did not answer:\n${spawnSync('docker', ['logs', NAME], { encoding: 'utf8' }).stderr}`);
      await new Promise((go) => setTimeout(go, 250));
    }
  });

  after(() => {
    spawnSync('docker', ['rm', '--force', NAME], { stdio: 'ignore' });
    spawnSync('docker', ['volume', 'rm', NAME], { stdio: 'ignore' });
    rmSync(folder, { recursive: true, force: true });
  });

  // An answer's type, its Link values, the fields it varies by and its text.
  const asked = async (address, { accept, method = 'GET' } = {}) => {
    const response = await fetch(`${site}${address}`, { method, headers: accept === undefined ? {} : { accept }, redirect: 'manual' });
    const links = response.headers.get('link')?.split(/, (?=<)/) ?? [];
    const varies = response.headers.get('vary')?.split(/,\s*/) ?? [];
    return { status: response.status, type: response.headers.get('content-type'), links, varies, text: await response.text() };
  };
  const reloads = () => (spawnSync('docker', ['logs', NAME], { encoding: 'utf8' }).stderr.match(/config file changed; reloading/g) ?? []).length;

  test('links a page\'s alternate, then the files its row has on, varies by Accept, and links the page from its alternate', async () => {
    for (const [address, links] of [
      ['/', [ALTERNATE('/index.md'), LLMS, LLMS_FULL]],
      ['/about/', [ALTERNATE('/about.md'), LLMS]],
      ['/about/?from=a-link', [ALTERNATE('/about.md'), LLMS]],
      ['/index/', [ALTERNATE('/index/index.md'), LLMS_FULL]],
      ['/%C3%B6ppet/', [ALTERNATE('/%C3%B6ppet.md')]],
    ]) {
      const answer = await asked(address);
      assert.deepEqual([answer.status, answer.type, answer.links], [200, 'text/html; charset=utf-8', links], address);
      assert.ok(answer.varies.includes('Accept'), address);
      assert.deepEqual((await asked(address, { method: 'HEAD' })).links, links, `${address}, asked with HEAD`);
    }
    for (const [address, page, text] of [['/about.md', '/about/', '# About\n'], ['/index.md', '/', '# The start page\n'], ['/index/index.md', '/index/', '# An index\n'], ['/%C3%B6ppet.md', '/%C3%B6ppet/', '# Öppet\n']]) {
      const answer = await asked(address);
      assert.deepEqual([answer.status, answer.type, answer.links, answer.text], [200, 'text/markdown; charset=utf-8', [CANONICAL(page)], text], address);
      assert.ok(!answer.varies.includes('Accept'), address);
    }
  });

  test('answers a page\'s own address with its alternate only where the request prefers Markdown', async () => {
    const ranges = (count) => [...Array.from({ length: count - 1 }, () => 'text/plain;q=0.1'), 'text/markdown'].join(',');
    for (const [accept, markdown] of [
      ['text/markdown', true],
      ['text/x-markdown', true],
      ['text/html;q=0.8, text/markdown;q=0.9', true],
      [ranges(32), true],
      ['text/html, text/markdown', false],
      ['*/*', false],
      [ranges(33), false],
      [`text/markdown;x=${'a'.repeat(1025 - 'text/markdown;x='.length)}`, false],
      ['text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', false],
      [undefined, false],
    ]) {
      const answer = await asked('/about/', { accept });
      assert.equal(answer.status, 200, accept);
      assert.equal(answer.type, markdown ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8', accept);
      assert.deepEqual(answer.links, markdown ? [CANONICAL('/about/')] : [ALTERNATE('/about.md'), LLMS], accept);
      assert.ok(answer.varies.includes('Accept'), accept);
      if (markdown) assert.equal(answer.text, '# About\n', accept);
    }
    const head = await asked('/', { accept: 'text/markdown', method: 'HEAD' });
    assert.deepEqual([head.status, head.type, head.links, head.text], [200, 'text/markdown; charset=utf-8', [CANONICAL('/')], '']);
  });

  test('weighs every header as the dev server does', async () => {
    const differ = [];
    let markdown = 0;
    for (const accept of acceptHeaders(600)) {
      const answer = await asked('/about/', { accept });
      const caddy = answer.type.startsWith('text/markdown');
      if (caddy) markdown += 1;
      if (caddy !== prefersMarkdown(accept)) differ.push(accept);
    }
    assert.deepEqual(differ, []);
    assert.ok(markdown > 50, `${markdown} of them prefer Markdown`);
  });

  test('gives a page without an alternate none of it, nor an address no page has', async () => {
    for (const accept of [undefined, 'text/markdown']) {
      const answer = await asked('/notes/jotting/', { accept });
      assert.deepEqual([answer.status, answer.type, answer.links], [200, 'text/html; charset=utf-8', []], accept);
      assert.ok(!answer.varies.includes('Accept'), accept);
    }
    // A Markdown file of the release that is no alternate is a file, linking nothing.
    assert.deepEqual((await asked('/notes/jotting.md')).links, []);
    const missing = await asked('/missing/', { accept: 'text/markdown' });
    assert.deepEqual([missing.status, missing.links], [404, []]);
    assert.ok(!missing.varies.includes('Accept'));
    assert.deepEqual((await asked('/llms.txt')).links, []);
  });

  test('changes its answers with a publish that adds or removes an alternate, without a reload', async () => {
    const before = reloads();
    publish(BUILT, '/ /index.md /llms.txt /llms-full.txt\n/notes/jotting/ /notes/jotting.md /llms.txt\n');
    assert.deepEqual((await asked('/notes/jotting/')).links, [ALTERNATE('/notes/jotting.md'), LLMS]);
    assert.equal((await asked('/notes/jotting/', { accept: 'text/markdown' })).text, '# A jotting\n');
    const about = await asked('/about/', { accept: 'text/markdown' });
    assert.deepEqual([about.type, about.links], ['text/html; charset=utf-8', []]);
    assert.deepEqual((await asked('/about.md')).links, []);
    // The web server looks for a change of its configuration each second.
    await new Promise((go) => setTimeout(go, 3000));
    assert.equal(reloads(), before);
  });
});
