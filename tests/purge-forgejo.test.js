// A purge in the site's Forgejo (ADR 0078), step by step, against repositories that stand in for
// Forgejo's: once the source is pushed, each step it takes is recorded, so that a purge stopped or
// broken after that push is finished where it was, rather than refused as though nothing were left
// to purge; the content push is tried again, and a step that fails, the removal of Forgejo's
// archives among them, leaves the purge unfinished rather than done.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';

import { buildControl } from '../src/build/record.js';
import { progressOf, purgeControl } from '../src/purge/control.js';
import { forgejoPurge } from '../src/purge/forgejo.js';
import { cloned, everyPath, everyText, remote } from './lib/repositories.js';

const folders = [];
after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});
const newFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), 'konzilo-purge-forgejo-'));
  folders.push(folder);
  return folder;
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const ID = 'aaaaaaaaaaaa';
const PATH = `articles/${ID}.md`;
const REQUEST = { id: 'p-1', path: PATH, collection: 'articles', kind: 'post', by: { login: 'anna', name: 'Anna Admin' }, at: '2026-11-26T10:00:00Z' };

// The site's Forgejo: its source and content repositories, at the paths Forgejo serves them by, a
// post made, published and deleted; and its API, which answers the cron tasks, `failing` the one
// named there with a 500, and holds none of the commits a purge asks about, as once collected.
function site() {
  const forgejo = newFolder();
  mkdirSync(join(forgejo, 'org'));
  const source = remote();
  const content = remote();
  symlinkSync(source.bare, join(forgejo, 'org', 'source.git'));
  symlinkSync(content.bare, join(forgejo, 'org', 'content.git'));
  const kept = source.save({ files: { 'articles/kept.md': '---\ntitle: Kept\n---\n' } });
  content.save({ files: { 'articles/kept.md': 'Kept.\n', '.post-ids.json': json({ posts: { kept: { path: 'articles/kept.md' } } }) }, message: `Publish ${kept.slice(0, 12)}` });
  const made = source.save({ files: { [PATH]: '---\ntitle: The secret\n---\n' } });
  content.save({ files: { 'articles/the-secret.md': 'The secret.\n', '.post-ids.json': json({ posts: { kept: { path: 'articles/kept.md' }, [ID]: { path: 'articles/the-secret.md', address: '/the-secret/' } } }) }, message: `Publish ${made.slice(0, 12)}` });
  const deleted = source.save({ files: { [PATH]: null } });
  content.save({ files: { 'articles/the-secret.md': null, '.post-ids.json': json({ posts: { kept: { path: 'articles/kept.md' }, [ID]: { path: null, address: '/the-secret/' } } }) }, message: `Publish ${deleted.slice(0, 12)}` });
  const asked = [];
  const api = { failing: null };
  const get = async (url, { method = 'GET' } = {}) => {
    // Forgejo here is a folder, which its API's addresses begin with.
    const { pathname } = new URL(url.slice(url.indexOf('/api/v1/')), 'http://forgejo');
    asked.push(`${method} ${pathname}`);
    const answer = (status, body = {}) => ({ ok: status < 400, status, json: async () => body, arrayBuffer: async () => new ArrayBuffer(0), text: async () => JSON.stringify(body) });
    if (pathname.endsWith('/activities/feeds')) return answer(200, []);
    if (pathname.includes('/git/commits/')) return answer(404);
    if (pathname.startsWith('/api/v1/admin/cron/')) return answer(pathname.endsWith(`/${api.failing}`) ? 500 : 204);
    throw new Error(`nothing to say of ${method} ${pathname}`);
  };
  return { forgejo, source, content, get, asked, api };
}

// A content repository that turns every push away, until `open()`.
const refusing = (content) => {
  const hook = join(content.bare, 'hooks', 'pre-receive');
  writeFileSync(hook, '#!/bin/sh\necho no >&2\nexit 1\n');
  chmodSync(hook, 0o755);
  return { open: () => rmSync(hook) };
};

describe('a purge in the site\'s Forgejo', () => {
  const purgeOf = ({ forgejo, get }, { work, control }) => forgejoPurge({ forgejo, repository: 'org/source', token: 't', work, control, get, sleep: async () => {} });
  const parts = () => {
    const folder = newFolder();
    return { work: join(folder, 'work'), control: buildControl(join(folder, 'control')), shared: purgeControl(join(folder, 'purge-control')) };
  };
  const anew = (shared) => progressOf(shared, { id: REQUEST.id, request: REQUEST, steps: [] });
  const kept = (shared) => progressOf(shared, shared.progress());
  const gone = (bare) => {
    const fresh = cloned(bare);
    return !everyPath(fresh).has(PATH) && !everyPath(fresh).has('articles/the-secret.md') && everyText(fresh).every((text) => !/secret/i.test(text));
  };

  test('finishes a purge stopped after the source was pushed, before it said so, rather than refuse it as not found', async () => {
    const one = site();
    const { work, control, shared } = parts();
    // The program stops as it would write that the source is pushed.
    const stopping = { ...shared, writeProgress: (progress) => {
      if (progress.steps.includes('source')) throw new Error('stopped');
      shared.writeProgress(progress);
    } };
    await assert.rejects(purgeOf(one, { work, control })(REQUEST, anew(stopping)), /stopped/);
    assert.deepEqual(shared.progress().steps, ['planned']);
    assert.ok(gone(one.source.bare), 'the source was pushed');
    assert.ok(!gone(one.content.bare), 'the content was not');

    const made = await purgeOf(one, { work, control })(REQUEST, kept(shared));
    assert.deepEqual(made.addresses, ['/the-secret'], 'what it gives once done, as it would have');
    assert.ok(gone(one.content.bare), 'the content repository holds none of it now');
    assert.deepEqual(shared.progress().steps, ['planned', 'source', 'content', 'collected', 'archives', 'log']);
    assert.ok(!existsSync(join(work, REQUEST.id)), 'its clones go once it is done');
  });

  test('keeps its clones and what it did where the content push fails, and pushes the content when it is run again', async () => {
    const one = site();
    const { work, control, shared } = parts();
    const shut = refusing(one.content);
    await assert.rejects(purgeOf(one, { work, control })(REQUEST, anew(shared)));
    assert.ok(gone(one.source.bare));
    assert.ok(!gone(one.content.bare));
    assert.deepEqual(shared.progress().steps, ['planned', 'source'], 'unfinished, at the content push');
    assert.ok(existsSync(join(work, REQUEST.id)), 'the content rewritten is kept to push');
    assert.ok(!one.asked.some((line) => line.includes('/admin/cron/')), 'nothing is collected before the content is pushed');

    shut.open();
    await purgeOf(one, { work, control })(REQUEST, kept(shared));
    assert.ok(gone(one.content.bare));
    assert.deepEqual(shared.progress().steps, ['planned', 'source', 'content', 'collected', 'archives', 'log']);
  });

  test('says that Forgejo\'s archives could not be removed, and removes them, not collecting again, when it is run again', async () => {
    const one = site();
    const { work, control, shared } = parts();
    one.api.failing = 'delete_repo_archives';
    await assert.rejects(purgeOf(one, { work, control })(REQUEST, anew(shared)), /500/);
    assert.deepEqual(shared.progress().steps, ['planned', 'source', 'content', 'collected']);
    one.api.failing = null;
    one.asked.length = 0;
    await purgeOf(one, { work, control })(REQUEST, kept(shared));
    assert.deepEqual(one.asked.filter((line) => line.includes('/admin/cron/')), ['POST /api/v1/admin/cron/delete_repo_archives']);
    assert.deepEqual(shared.progress().steps, ['planned', 'source', 'content', 'collected', 'archives', 'log']);
  });

  test('takes nothing of a purge refused before it pushed, and keeps no clone', async () => {
    const one = site();
    const { work, control, shared } = parts();
    await assert.rejects(purgeOf(one, { work, control })({ ...REQUEST, path: 'articles/kept.md' }, progressOf(shared, { id: REQUEST.id, request: { ...REQUEST, path: 'articles/kept.md' }, steps: [] })), /not-deleted/);
    assert.equal(shared.progress(), null);
    assert.ok(!existsSync(join(work, REQUEST.id)));
  });
});
