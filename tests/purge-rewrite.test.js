// A purge's rewrite of a branch's history (ADR 0078), in a real Git repository: what it is told to
// remove is in no commit after it, what it is told to change is changed in every commit, a save
// that held nothing else is gone, and each save after the oldest one rewritten has a new identity,
// which the rewrite names for each old one, while those before it keep theirs.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';

import { gitRunner, rewriteHistory } from '../src/purge/rewrite.js';

const folders = [];
after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

// A repository whose commits are made one by one: each { files, message }, a file's text, or null
// for a file removed, at a moment a minute after the last, by one author.
function repository(commits) {
  const folder = mkdtempSync(join(tmpdir(), 'konzilo-rewrite-'));
  folders.push(folder);
  const environment = { PATH: process.env.PATH, HOME: folder, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' };
  const git = (...args) => execFileSync('git', args, { cwd: folder, env: environment, encoding: 'utf8' }).trim();
  git('init', '--quiet', '--initial-branch=main');
  const shas = [];
  commits.forEach(({ files, message = `Save ${shas.length + 1}` }, index) => {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) {
        git('rm', '--quiet', '--', path);
        continue;
      }
      mkdirSync(dirname(join(folder, path)), { recursive: true });
      writeFileSync(join(folder, path), text);
      git('add', '--', path);
    }
    const moment = `2026-11-0${1 + Math.floor(index / 9)}T08:0${index % 9}:00Z`;
    execFileSync('git', ['-c', 'user.name=Ebba', '-c', 'user.email=ebba@localhost.invalid', 'commit', '--quiet', '--allow-empty', '--message', message], {
      cwd: folder,
      env: { ...environment, GIT_AUTHOR_DATE: moment, GIT_COMMITTER_DATE: moment },
    });
    shas.push(git('rev-parse', 'HEAD'));
  });
  return { folder, git, shas, run: gitRunner(folder, environment) };
}

// Every path any commit of the branch holds, and every file's text at its head.
const everyPath = (git) => new Set(git('log', '--format=', '--name-only', 'main').split('\n').filter(Boolean));
const fileAt = (git, commit, path) => {
  try {
    return git('show', `${commit}:${path}`);
  } catch {
    return null;
  }
};

describe('a rewrite of the history', () => {
  test('takes a file from every commit, drops the saves that held it alone, and names each save\'s new identity', async () => {
    const { git, shas, run } = repository([
      { files: { 'articles/kept.md': 'Kept.\n' } },
      { files: { 'articles/gone.md': 'A secret.\n' } },
      { files: { 'articles/kept.md': 'Kept, and changed.\n' } },
      { files: { 'articles/gone.md': 'A secret, changed.\n', 'articles/other.md': 'Other.\n' } },
      { files: { 'articles/gone.md': null } },
    ]);
    const { head, renamed } = await rewriteHistory({ git: run, drop: (path) => path === 'articles/gone.md' });

    assert.equal(git('rev-parse', 'main'), head);
    assert.ok(!everyPath(git).has('articles/gone.md'), 'no commit holds it');
    assert.deepEqual(git('log', '--format=%s', 'main').split('\n'), ['Save 4', 'Save 3', 'Save 1'], 'the saves that held it alone are gone');
    assert.equal(fileAt(git, head, 'articles/kept.md'), 'Kept, and changed.');
    assert.equal(fileAt(git, head, 'articles/other.md'), 'Other.');

    // The first save, before the oldest one rewritten, keeps its identity; each later one has a
    // new one, and a save that is gone is named by the one that now stands in its place.
    const [first, second, third, fourth, fifth] = shas;
    const [newFourth, newThird] = git('log', '--format=%H', 'main').split('\n');
    assert.equal(renamed.get(first), first);
    assert.equal(renamed.get(second), first);
    assert.equal(renamed.get(third), newThird);
    assert.notEqual(newThird, third);
    assert.equal(renamed.get(fourth), newFourth);
    assert.equal(renamed.get(fifth), newFourth);
    // Each new save has its author, its moment and its message as before.
    assert.equal(git('log', '-1', '--format=%an %aI %cI %s', newThird), `Ebba ${git('log', '-1', '--format=%aI %cI %s', third)}`);
  });
});

describe('a rewrite that changes files', () => {
  // A ledger of posts by their IDs, as a content repository keeps one in every commit.
  const ledger = (...ids) => `${JSON.stringify({ posts: Object.fromEntries(ids.map((id) => [id, { path: `articles/${id}.md` }])) }, null, 2)}\n`;
  const withoutGone = (path, bytes) => {
    if (path !== '.post-ids.json') return null;
    const read = JSON.parse(bytes.toString('utf8'));
    if (!Object.hasOwn(read.posts, 'gone')) return null;
    delete read.posts.gone;
    return `${JSON.stringify(read, null, 2)}\n`;
  };

  test('changes a file in every commit, drops a commit whose change it undid, and changes the messages it is told to', async () => {
    const { git, shas, run } = repository([
      { files: { '.post-ids.json': ledger('kept'), 'articles/kept.md': 'Kept.\n' }, message: 'Publish 111111111111' },
      { files: { '.post-ids.json': ledger('kept', 'gone'), 'articles/gone.md': 'A secret.\n' }, message: 'Publish 222222222222' },
      { files: { '.post-ids.json': ledger('kept', 'gone', 'later'), 'articles/later.md': 'Later.\n' }, message: 'Publish 333333333333' },
      { files: { '.post-ids.json': ledger('kept', 'later'), 'articles/gone.md': null }, message: 'Publish 444444444444' },
    ]);
    const { head, renamed } = await rewriteHistory({
      git: run,
      drop: (path) => path === 'articles/gone.md',
      change: withoutGone,
      message: (text) => text.replace('333333333333', 'abcdefabcdef'),
    });
    assert.deepEqual(git('log', '--format=%s', 'main').split('\n'), ['Publish abcdefabcdef', 'Publish 111111111111']);
    assert.equal(renamed.get(shas[0]), shas[0], 'the first commit is as it was');
    assert.equal(renamed.get(shas[3]), head);
    for (const commit of git('rev-list', 'main').split('\n')) {
      assert.doesNotMatch(fileAt(git, commit, '.post-ids.json'), /gone/);
    }
    assert.equal(fileAt(git, head, '.post-ids.json'), ledger('kept', 'later').trim());
    assert.ok(!everyPath(git).has('articles/gone.md'));
  });

  test('drops a file only where it is told to, and keeps another\'s file at the same path', async () => {
    // A path the purged post had, and another post took after it.
    const { git, run } = repository([
      { files: { 'articles/hello.md': 'Purged hello.\n', '.owner': 'gone' } },
      { files: { 'articles/hello.md': null, '.owner': 'none' } },
      { files: { 'articles/hello.md': 'Another hello.\n', '.owner': 'other' } },
      { files: { 'articles/hello.md': 'Purged again.\n', '.owner': 'gone' } },
      { files: { 'articles/hello.md': null, '.owner': 'none' } },
    ]);
    const owner = async (at) => (await at.read('.owner'))?.toString('utf8');
    const { head } = await rewriteHistory({ git: run, drop: async (path, at) => path === 'articles/hello.md' && await owner(at) === 'gone' });
    const commits = git('rev-list', '--reverse', 'main').split('\n');
    assert.deepEqual(commits.map((commit) => fileAt(git, commit, 'articles/hello.md')), [null, null, 'Another hello.', null, null]);
    assert.equal(fileAt(git, head, '.owner'), 'none');
  });
});
