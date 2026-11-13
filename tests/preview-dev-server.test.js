// When a live preview's dev server runs: from the first who needs it, once, until nobody
// has looked for a while.

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { devServer } from '../src/preview/dev-server.js';

function made({ answers = () => true, idle = 10_000, before } = {}) {
  const children = [];
  const server = devServer({
    root: '/site',
    port: 4001,
    environment: { PATH: '/bin', KONZILO_PREVIEW: '1' },
    idle,
    before,
    ask: async () => answers(),
    wait: async () => {},
    startsWithin: 1000,
    spawn: (command, args, options) => {
      const child = new EventEmitter();
      child.kill = (signal) => {
        child.killed = signal;
        child.emit('exit');
      };
      child.call = { command, args, options };
      children.push(child);
      return child;
    },
  });
  return { server, children };
}

describe('the dev server', () => {
  test('does not run until someone needs it', () => {
    const { server, children } = made();
    assert.equal(server.running(), false);
    assert.equal(children.length, 0);
  });

  test('starts once, however many ask', async () => {
    const { server, children } = made();
    await Promise.all([server.ensure(), server.ensure()]);
    await server.ensure();
    assert.equal(children.length, 1);
    assert.equal(server.running(), true);
    server.stop();
  });

  test('runs from the site\'s folder, on its own address, with what it is given and no more', async () => {
    const { server, children } = made();
    await server.ensure();
    const { args, options } = children[0].call;
    assert.deepEqual(args, ['node_modules/.bin/astro', 'dev', '--host', '127.0.0.1', '--port', '4001', '--ignore-lock']);
    assert.equal(options.cwd, '/site');
    assert.deepEqual(options.env, { PATH: '/bin', KONZILO_PREVIEW: '1' });
    server.stop();
  });

  test('does what must come first, first', async () => {
    const order = [];
    const { server, children } = made({ before: async () => { order.push(`before, ${children.length} started`); } });
    await server.ensure();
    assert.deepEqual(order, ['before, 0 started']);
    server.stop();
  });

  test('stops with nobody looking, and starts again for the next', async () => {
    const { server, children } = made({ idle: 5 });
    await server.ensure();
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    assert.equal(children[0].killed, 'SIGTERM');
    assert.equal(server.running(), false);
    await server.ensure();
    assert.equal(children.length, 2);
    server.stop();
  });

  test('stays while someone looks', async () => {
    const { server, children } = made({ idle: 40 });
    await server.ensure();
    for (let looks = 0; looks < 4; looks += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, 15);
      });
      server.touch();
    }
    assert.equal(children[0].killed, undefined);
    server.stop();
  });

  test('starts again after it has fallen over', async () => {
    const { server, children } = made();
    await server.ensure();
    children[0].emit('exit');
    assert.equal(server.running(), false);
    await server.ensure();
    assert.equal(children.length, 2);
    server.stop();
  });

  test('says so when it never answers, and the next who asks tries again', async () => {
    let answering = false;
    const { server, children } = made({ answers: () => answering });
    await assert.rejects(server.ensure(), /did not answer/);
    assert.equal(children[0].killed, 'SIGTERM');
    answering = true;
    await server.ensure();
    assert.equal(children.length, 2);
    server.stop();
  });

  test('is ready once it answers, and not before it starts, while it starts or after it stops', async () => {
    let answering = false;
    const { server } = made({ answers: () => answering });
    assert.equal(server.ready(), false, 'before');
    const starting = server.ensure();
    assert.equal(server.ready(), false, 'while it starts');
    answering = true;
    await starting;
    assert.equal(server.ready(), true, 'once it answers');
    server.stop();
    assert.equal(server.ready(), false, 'after');
  });

  test('is not ready once it has fallen over', async () => {
    const { server, children } = made();
    await server.ensure();
    children[0].emit('exit');
    assert.equal(server.ready(), false);
  });

  test('says so when it stops as it starts', async () => {
    let child;
    const { server, children } = made({ answers: () => {
      child = children[0];
      child.emit('exit');
      return false;
    } });
    await assert.rejects(server.ensure(), /stopped as it started/);
  });
});

const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer().listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
  probe.on('error', reject);
});

// A site whose `predev` makes a file before its dev server starts, as one that writes its logos
// from a design file does: `npm run dev` runs it, and so does the preview, before each start.
test('runs the site\'s predev before the dev server starts, so that it serves what predev made', { timeout: 180_000 }, async () => {
  const core = fileURLToPath(new URL('../', import.meta.url));
  const site = mkdtempSync(join(tmpdir(), 'konzilo-predev-'));
  try {
    symlinkSync(join(core, 'node_modules'), join(site, 'node_modules'));
    mkdirSync(join(site, 'src/pages'), { recursive: true });
    writeFileSync(join(site, 'package.json'), JSON.stringify({ name: 'a-site', private: true, type: 'module', scripts: { predev: 'node make.js', dev: 'astro dev' } }));
    writeFileSync(join(site, 'make.js'), "import { mkdirSync, writeFileSync } from 'node:fs';\nmkdirSync('public', { recursive: true });\nwriteFileSync('public/made-before.txt', 'made by predev');\n");
    writeFileSync(join(site, 'astro.config.mjs'), 'export default {};\n');
    writeFileSync(join(site, 'src/pages/index.astro'), '<p>A page</p>\n');
    const port = await freePort();
    const server = devServer({ root: site, port, environment: { PATH: process.env.PATH, HOME: site, ASTRO_TELEMETRY_DISABLED: '1', ASTRO_DISABLE_UPDATE_CHECK: 'true' } });
    try {
      await server.ensure();
      const answer = await fetch(`http://127.0.0.1:${port}/made-before.txt`);
      assert.equal(answer.status, 200);
      assert.equal(await answer.text(), 'made by predev');
    } finally {
      server.stop();
    }
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});

