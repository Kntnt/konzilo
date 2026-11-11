// A fresh clone of a site repository starts with fictional demo content: the
// site's own, in its demo-content/, else the core's. No live site may ever show
// either: `npm run build` runs the same command on a server, so a public host
// with no content is a fault, not a site to fill.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const command = fileURLToPath(new URL('../bin/konzilo-demo-content.js', import.meta.url));

describe('konzilo-demo-content', () => {
  let folder;
  let count = 0;

  const run = (origin, prepare = () => {}) => {
    const cwd = join(folder, `site-${(count += 1)}`);
    mkdirSync(cwd);
    prepare(cwd);
    const env = { ...process.env };
    delete env.KONZILO_ORIGIN;
    delete env.KONZILO_CONTENT;
    if (origin) env.KONZILO_ORIGIN = origin;
    return { ...spawnSync(process.execPath, [command], { cwd, env, encoding: 'utf8' }), content: join(cwd, 'content') };
  };

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-demo-content-'));
  });

  after(() => rmSync(folder, { recursive: true, force: true }));

  for (const origin of [undefined, 'http://localhost:4321']) {
    test(`fills a local copy with no content, ${origin ?? 'with no origin given'}`, () => {
      const { status, content, stderr } = run(origin);
      assert.equal(status, 0, stderr);
      assert.ok(readdirSync(content).length > 0);
    });
  }

  // A site repository's own, in demo-content/, as the core's is shaped.
  const ownDemoContent = (cwd) => {
    mkdirSync(join(cwd, 'demo-content/articles'), { recursive: true });
    writeFileSync(join(cwd, 'demo-content/articles/lamps-along-the-quay.md'), '---\ntitle: "Lamps along the quay"\n---\n\nThe lamps are lit.\n');
    writeFileSync(join(cwd, 'demo-content/settings.json'), '{\n  "title": "The Lamplighters\' Almanac"\n}\n');
  };

  test('fills a local copy with no content from the site\'s own demo content, and with nothing of the core\'s', () => {
    const { status, content, stderr } = run(undefined, ownDemoContent);
    assert.equal(status, 0, stderr);
    assert.deepEqual(readdirSync(content, { recursive: true }).sort(), ['articles', 'articles/lamps-along-the-quay.md', 'settings.json']);
    assert.match(readFileSync(join(content, 'settings.json'), 'utf8'), /The Lamplighters' Almanac/);
  });

  test('refuses a public host with no content, and copies nothing, of the site\'s own demo content as of the core\'s', () => {
    for (const prepare of [undefined, ownDemoContent]) {
      const { status, content, stderr } = run('https://www.example.com', prepare);
      assert.equal(status, 1);
      assert.match(stderr, /demo content is not for a public host: https:\/\/www\.example\.com/);
      assert.equal(existsSync(content), false);
    }
  });

  test('leaves a site that has content as it is, on any host', () => {
    for (const origin of [undefined, 'https://www.example.com']) {
      const { status, content, stderr } = run(origin, (cwd) => mkdirSync(join(cwd, 'content')));
      assert.equal(status, 0, stderr);
      assert.deepEqual(readdirSync(content), []);
    }
  });
});
