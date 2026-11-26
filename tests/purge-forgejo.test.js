// A purge in the site's Forgejo (ADR 0078), against repositories on disk and a stand-in for
// Forgejo's API: Forgejo takes a push in from a queue after the push, and cannot once the commit
// the push replaced is gone, so the purge asks it to let go of what went only once its branches
// read the purge's heads, and says it failed where they never do.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

import { forgejoPurge } from '../src/purge/forgejo.js';

const folder = mkdtempSync(join(tmpdir(), 'konzilo-purge-forgejo-'));
after(() => rmSync(folder, { recursive: true, force: true }));
const environment = { PATH: process.env.PATH, HOME: folder, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
let count = 0;

// Forgejo's repositories on disk, `<root>/org/source.git` and `<root>/org/content.git`, each saved
// to once with a passage, then once without it.
function forgejoOnDisk() {
  count += 1;
  const root = join(folder, `forgejo-${count}`);
  const heads = {};
  for (const name of ['source', 'content']) {
    const bare = join(root, 'org', `${name}.git`);
    const work = join(root, `${name}-work`);
    execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', bare], { env: environment });
    execFileSync('git', ['clone', '--quiet', bare, work], { env: environment, stdio: 'ignore' });
    const git = (...args) => execFileSync('git', args, { cwd: work, env: environment, encoding: 'utf8' }).trim();
    git('checkout', '--quiet', '-B', 'main');
    for (const text of ['Call Ebba Svensson today.\n', 'Call the office today.\n']) {
      mkdirSync(join(work, 'articles'), { recursive: true });
      writeFileSync(join(work, 'articles', 'aaaaaaaaaaaa.md'), text);
      git('add', '.');
      git('-c', 'user.name=Someone', '-c', 'user.email=someone@localhost.invalid', 'commit', '--quiet', '-m', 'Save');
    }
    git('push', '--quiet', 'origin', 'main');
    heads[name] = git('rev-parse', 'HEAD');
  }
  const headOf = (name, branch) => {
    try {
      return execFileSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: join(root, 'org', `${name}.git`), env: environment, encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  };
  return { root, heads, headOf };
}

// Forgejo's API: each branch as Forgejo read it from the last push it took in, which it takes in
// once it has been asked `lag` times since; each commit held until Forgejo was asked to let go.
function api({ headOf, heads, lag = 2, takesIn = true }) {
  const asked = [];
  const read = { 'source/main': heads.source, 'content/main': heads.content };
  const behind = {};
  let collected = false;
  const answer = (status, body) => ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0) });
  const get = async (url, { method = 'GET' } = {}) => {
    const pathname = new URL(url).pathname.replace(/^.*?(?=\/api\/v1\/)/, '');
    asked.push(`${method} ${pathname}`);
    if (pathname === '/api/v1/repos/org/source/activities/feeds') return answer(200, []);
    if (pathname.startsWith('/api/v1/admin/cron/')) {
      if (pathname.endsWith('/git_gc_repos')) collected = true;
      return answer(204, {});
    }
    const branch = /^\/api\/v1\/repos\/org\/(source|content)\/branches\/(.+)$/.exec(pathname);
    if (branch) {
      const key = `${branch[1]}/${decodeURIComponent(branch[2])}`;
      const now = headOf(branch[1], decodeURIComponent(branch[2]));
      if (now !== read[key] && takesIn) {
        behind[key] = (behind[key] ?? 0) + 1;
        if (behind[key] > lag) read[key] = now;
      }
      return read[key] ? answer(200, { commit: { id: read[key] } }) : answer(404, {});
    }
    if (/\/git\/commits\//.test(pathname)) return answer(collected ? 404 : 200, {});
    throw new Error(`nothing to say of ${method} ${pathname}`);
  };
  return { get, asked };
}

const request = { id: 'p1', passage: 'Ebba Svensson', by: { login: 'anna', name: 'Anna Admin' }, at: '2026-11-26T10:00:00Z' };

test('asks Forgejo to let go of what went only once its branches read the purge\'s heads', async () => {
  const disk = forgejoOnDisk();
  const forgejo = api(disk);
  const purge = forgejoPurge({ forgejo: `file://${disk.root}`, repository: 'org/source', token: 'token', work: join(disk.root, 'work'), get: forgejo.get, sleep: async () => {} });
  const result = await purge(request);
  assert.deepEqual(result.changed, { files: 1, revisions: 1, messages: 0 });
  const collected = forgejo.asked.indexOf('POST /api/v1/admin/cron/git_gc_repos');
  assert.ok(collected > 0, 'Forgejo is asked to let go');
  const lastRead = (key) => forgejo.asked.lastIndexOf(`GET /api/v1/repos/org/${key}`);
  for (const key of ['source/branches/main', 'source/branches/konzilo-purges', 'content/branches/main']) {
    assert.ok(lastRead(key) !== -1 && lastRead(key) < collected, `${key} is read as the purge left it first`);
  }
});

test('says it failed where Forgejo never takes the push in, and lets go of nothing', async () => {
  const disk = forgejoOnDisk();
  const forgejo = api({ ...disk, takesIn: false });
  let clock = 0;
  const purge = forgejoPurge({ forgejo: `file://${disk.root}`, repository: 'org/source', token: 'token', work: join(disk.root, 'work'), get: forgejo.get, sleep: async (ms) => {
    clock += ms;
  }, now: () => clock });
  await assert.rejects(purge(request), /did not take in/);
  assert.equal(forgejo.asked.includes('POST /api/v1/admin/cron/git_gc_repos'), false);
});
