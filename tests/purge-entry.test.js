// A purge of a deleted post, term or image library entry (ADR 0078), against two repositories that
// stand in for Forgejo's, the source and the content: afterwards neither, cloned anew, holds any
// revision of it, of its content files or of the rules that led to it; an image library entry's
// original goes unless another entry or a current file names it; each save after the oldest one
// rewritten has a new identity, and the record of purges carries over who pushed it; a save that
// comes while the purge runs makes it start again rather than be lost.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';

import { purgeEntry, PurgeRefusal } from '../src/purge/entry.js';
import { PURGES_BRANCH, PURGES_FILE, purgeRecord } from '../src/purge/record.js';
import { gitIn } from '../src/purge/rewrite.js';

const folders = [];
after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});
const newFolder = () => {
  const folder = mkdtempSync(join(tmpdir(), 'konzilo-purge-'));
  folders.push(folder);
  return folder;
};
const environmentOf = (home) => ({ PATH: process.env.PATH, HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });

// A repository as Forgejo holds it, and a working copy that saves to it, commit by commit, each
// { files, message }, a file's text, or null for one removed, a minute after the last.
function remote() {
  const home = newFolder();
  const bare = join(home, 'remote.git');
  const work = join(home, 'work');
  const environment = environmentOf(home);
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', bare], { env: environment });
  execFileSync('git', ['clone', '--quiet', bare, work], { env: environment, stdio: 'ignore' });
  const git = (...args) => execFileSync('git', args, { cwd: work, env: environment, encoding: 'utf8' }).trim();
  git('checkout', '--quiet', '-B', 'main');
  let count = 0;
  const save = ({ files, message = `Save ${count + 1}` }) => {
    for (const [path, text] of Object.entries(files)) {
      if (text === null) {
        git('rm', '--quiet', '--', path);
        continue;
      }
      mkdirSync(dirname(join(work, path)), { recursive: true });
      writeFileSync(join(work, path), text);
      git('add', '--', path);
    }
    const moment = new Date(Date.UTC(2026, 10, 1, 8, count)).toISOString();
    count += 1;
    execFileSync('git', ['-c', 'user.name=Someone', '-c', 'user.email=someone@localhost.invalid', 'commit', '--quiet', '--allow-empty', '--message', message], {
      cwd: work,
      env: { ...environment, GIT_AUTHOR_DATE: moment, GIT_COMMITTER_DATE: moment },
    });
    git('push', '--quiet', 'origin', 'main');
    return git('rev-parse', 'HEAD');
  };
  return { bare, save, git };
}

// A clone of a repository as the purge makes one, bare, with every branch.
function cloneOf(bare) {
  const folder = join(newFolder(), 'clone.git');
  const environment = environmentOf(dirname(folder));
  execFileSync('git', ['init', '--quiet', '--bare', '--initial-branch=main', folder], { env: environment });
  execFileSync('git', ['remote', 'add', 'origin', bare], { cwd: folder, env: environment });
  return { git: gitIn(folder, environment) };
}

// A fresh clone of a repository, as one cloned anew from Forgejo, with everything it holds.
function cloned(bare) {
  const folder = join(newFolder(), 'fresh');
  const environment = environmentOf(dirname(folder));
  execFileSync('git', ['clone', '--quiet', '--mirror', bare, folder], { env: environment });
  return (...args) => execFileSync('git', args, { cwd: folder, env: environment, encoding: 'utf8', maxBuffer: 1 << 26 }).trim();
}
// Every path any commit of any branch holds, and every blob's text.
const everyPath = (git) => new Set(git('log', '--all', '--format=', '--name-only').split('\n').filter(Boolean));
const everyText = (git) => git('rev-list', '--all', '--objects').split('\n').map((line) => line.split(' ')[0]).filter((sha) => git('cat-file', '-t', sha) === 'blob').map((sha) => git('cat-file', 'blob', sha));
const fileAt = (git, commit, path) => {
  try {
    return git('show', `${commit}:${path}`);
  } catch {
    return null;
  }
};

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const pointer = (text) => `version https://git-lfs.github.com/spec/v1\noid sha256:${createHash('sha256').update(text).digest('hex')}\nsize ${text.length}\n`;
const oidOf = (text) => createHash('sha256').update(text).digest('hex');
const ADMIN = { login: 'anna', name: 'Anna Admin' };

describe('a purge of a deleted post', () => {
  const ID = 'aaaaaaaaaaaa';
  const PATH = `articles/${ID}.md`;
  const post = (title, other = []) => `---\ntitle: ${title}\nstatus: published\n${other.length > 0 ? `otherAddresses: ${JSON.stringify(other.map((address) => ({ address, answer: 301 })))}\n` : ''}---\nA story about ${title}.\n`;
  const ledger = (posts) => json({ posts, awaited: {}, terms: {}, files: {}, chosen: { legalPages: [], notFound: null } });
  const entryOf = (path, address, addresses) => ({ path, paths: [path], address, addresses, title: 'x', source: null, published: null, taken: '2026-11-01T08:00:00Z', modified: null, names: {} });
  const rules = (list) => json({ rules: list });

  // The source's history and the content repository's, with who pushed each source commit.
  const sites = () => {
    const source = remote();
    const content = remote();
    const pushers = {};
    const saved = (by, files) => {
      const commit = source.save({ files });
      pushers[commit] = by;
      return commit;
    };
    const published = (commit, files) => content.save({ files, message: `Publish ${commit.slice(0, 12)}` });
    const ebba = { login: 'ebba', name: 'Ebba Editor', at: '2026-11-01T09:00:00Z' };
    const anna = { login: 'anna', name: 'Anna Admin', at: '2026-11-01T09:05:00Z' };
    const first = saved(anna, { 'articles/kept.md': post('Kept'), 'redirects.json': rules([{ from: '/elsewhere/', to: '/kept/', status: 301 }]) });
    published(first, { '.post-ids.json': ledger({ kept: entryOf('articles/kept.md', '/kept/', ['/kept/']) }), 'articles/kept.md': 'Kept.\n', 'redirects.json': rules([{ from: '/elsewhere/', to: '/kept/', status: 301 }]) });
    const made = saved(ebba, { [PATH]: post('The secret', ['/campaign/']) });
    published(made, { '.post-ids.json': ledger({ kept: entryOf('articles/kept.md', '/kept/', ['/kept/']), [ID]: entryOf('articles/the-secret.md', '/the-secret/', ['/the-secret/']) }), 'articles/the-secret.md': 'The secret.\n' });
    const ruled = saved(anna, { 'redirects.json': rules([{ from: '/another/', to: '/kept/', status: 301 }, { from: '/elsewhere/', to: '/kept/', status: 301 }, { from: '/old-secret/', post: ID, status: 301 }, { from: '/the-secret/', status: 410 }, { from: '/to-secret/', to: '/campaign/', status: 302 }]) });
    published(ruled, { 'redirects.json': rules([{ from: '/another/', to: '/kept/', status: 301 }, { from: '/elsewhere/', to: '/kept/', status: 301 }, { from: '/the-secret/', status: 410 }]) });
    const moved = saved(ebba, { [PATH]: post('The secret moved') });
    const entry = { ...entryOf('articles/the-secret-moved.md', '/the-secret-moved/', ['/the-secret/', '/the-secret-moved/']), paths: ['articles/the-secret.md', 'articles/the-secret-moved.md'] };
    published(moved, { '.post-ids.json': ledger({ kept: entryOf('articles/kept.md', '/kept/', ['/kept/']), [ID]: entry }), 'articles/the-secret.md': null, 'articles/the-secret-moved.md': 'The secret moved.\n' });
    const changed = saved(ebba, { 'articles/kept.md': post('Kept, changed') });
    published(changed, { 'articles/kept.md': 'Kept, changed.\n' });
    const deleted = saved(ebba, { [PATH]: null });
    published(deleted, { '.post-ids.json': ledger({ kept: entryOf('articles/kept.md', '/kept/', ['/kept/']), [ID]: { ...entry, path: null } }), 'articles/the-secret-moved.md': null });
    return { source, content, pushers, commits: { first, made, ruled, moved, changed, deleted } };
  };

  test('takes it from every revision of both repositories, with its rules, and carries over who pushed each save', async () => {
    const { source, content, pushers, commits } = sites();
    const result = await purgeEntry({
      source: cloneOf(source.bare),
      content: cloneOf(content.bare),
      entry: { path: PATH, kind: 'post', collection: 'articles' },
      by: ADMIN,
      at: '2026-11-26T10:00:00Z',
      pushedBy: async (shas) => Object.fromEntries(shas.map((sha) => [sha, pushers[sha] ?? null])),
    });

    const fresh = cloned(source.bare);
    assert.ok(!everyPath(fresh).has(PATH), 'no source commit holds it');
    assert.ok(everyText(fresh).every((text) => !/secret|campaign/i.test(text)), 'no file of any commit names it, nor any of its addresses');
    for (const commit of fresh('rev-list', 'main').split('\n')) {
      const redirects = fileAt(fresh, commit, 'redirects.json');
      assert.doesNotMatch(redirects ?? '', /secret|campaign/, 'no rule from or to its addresses, nor to it');
    }
    assert.deepEqual(JSON.parse(fileAt(fresh, 'main', 'redirects.json')).rules.map(({ from }) => from), ['/another/', '/elsewhere/'], 'the other rules stay');
    assert.equal(fileAt(fresh, 'main', 'articles/kept.md'), post('Kept, changed').trim());

    const freshContent = cloned(content.bare);
    assert.ok(!everyPath(freshContent).has('articles/the-secret.md'));
    assert.ok(!everyPath(freshContent).has('articles/the-secret-moved.md'));
    for (const commit of freshContent('rev-list', 'main').split('\n')) {
      assert.doesNotMatch(fileAt(freshContent, commit, '.post-ids.json') ?? '', new RegExp(ID));
      assert.doesNotMatch(fileAt(freshContent, commit, 'redirects.json') ?? '', /secret/);
    }

    // Each save before the oldest one rewritten keeps its identity; the content repository's
    // commits name the source commit they publish by its new one.
    const now = fresh('rev-list', '--reverse', 'main').split('\n');
    assert.equal(now[0], commits.first);
    assert.equal(now.length, 3, 'the first save, the rules and the change of the kept post');
    assert.equal(result.source.renamed.get(commits.deleted), now[2]);
    const published = freshContent('log', '--format=%s', 'main').split('\n');
    for (const line of published) {
      const [, prefix] = /^Publish ([0-9a-f]{12})$/.exec(line);
      assert.ok(now.some((commit) => commit.startsWith(prefix)), `${line} names a commit of the source`);
    }

    // Who pushed each save is carried over to its new identity, and the purge is noted, who and
    // when, with nothing of what.
    const record = purgeRecord(fileAt(fresh, PURGES_BRANCH, PURGES_FILE));
    assert.deepEqual(record.purges, [{ at: '2026-11-26T10:00:00Z', by: ADMIN }]);
    assert.deepEqual(record.pushes[now[1]], pushers[commits.ruled]);
    assert.deepEqual(record.pushes[now[2]], pushers[commits.changed]);
    assert.equal(Object.hasOwn(record.pushes, now[0]), false, 'a save that kept its identity keeps it in the feed');
    assert.doesNotMatch(fileAt(fresh, PURGES_BRANCH, PURGES_FILE), new RegExp(ID));
  });

  test('refuses an entry that is not deleted, and one the history no longer holds', async () => {
    const { source, content } = sites();
    const run = (path) => purgeEntry({
      source: cloneOf(source.bare),
      content: cloneOf(content.bare),
      entry: { path, kind: 'post', collection: 'articles' },
      by: ADMIN,
      at: '2026-11-26T10:00:00Z',
      pushedBy: async () => ({}),
    });
    await assert.rejects(run('articles/kept.md'), (error) => error instanceof PurgeRefusal && error.reason === 'not-deleted');
    await assert.rejects(run('articles/never.md'), (error) => error instanceof PurgeRefusal && error.reason === 'not-found');
  });

  test('starts again where a save came while it ran, and loses nothing of that save', async () => {
    const { source, content, pushers } = sites();
    let late = null;
    await purgeEntry({
      source: cloneOf(source.bare),
      content: cloneOf(content.bare),
      entry: { path: PATH, kind: 'post', collection: 'articles' },
      by: ADMIN,
      at: '2026-11-26T10:00:00Z',
      pushedBy: async (shas) => {
        if (late === null) {
          late = source.save({ files: { 'articles/late.md': post('Late') } });
          pushers[late] = { login: 'ebba', name: 'Ebba Editor', at: '2026-11-26T10:00:01Z' };
        }
        return Object.fromEntries(shas.map((sha) => [sha, pushers[sha] ?? null]));
      },
    });
    const fresh = cloned(source.bare);
    assert.equal(fileAt(fresh, 'main', 'articles/late.md'), post('Late').trim());
    assert.ok(!everyPath(fresh).has(PATH));
    const record = purgeRecord(fileAt(fresh, PURGES_BRANCH, PURGES_FILE));
    assert.deepEqual(record.pushes[fresh('rev-parse', 'main')], pushers[late]);
  });
});

describe('a purge of a deleted image library entry', () => {
  const ENTRY = 'image-library/eeeeeeeeeeee.json';
  test('takes its original, and the masters made of it, unless another entry or a current file names it', async () => {
    const source = remote();
    const content = remote();
    const own = 'the meadow';
    const kept = 'a current post names it';
    const shared = 'another entry names it';
    const first = source.save({ files: {
      [ENTRY]: json({ src: '/media/meadow.jpg', alt: 'A meadow' }),
      'media/meadow.jpg': pointer(own),
      'media/named.jpg': pointer(kept),
      'media/shared.jpg': pointer(shared),
      'image-library/ffffffffffff.json': json({ src: '/media/shared.jpg', alt: 'Shared' }),
      'articles/kept.md': '---\ntitle: Kept\n---\n![A picture](/media/named.jpg)\n',
    } });
    content.save({ files: { [`media/meadow-${oidOf(own).slice(0, 10)}.webp`]: 'master of the meadow', [`media/kept-${oidOf(kept).slice(0, 10)}.webp`]: 'master named' }, message: `Publish ${first.slice(0, 12)}` });
    const second = source.save({ files: { [ENTRY]: json({ src: '/media/named.jpg', alt: 'Named' }) } });
    const third = source.save({ files: { [ENTRY]: json({ src: '/media/shared.jpg', alt: 'Shared' }) } });
    const fourth = source.save({ files: { [ENTRY]: null, 'media/meadow.jpg': null, 'image-library/ffffffffffff.json': null } });
    for (const commit of [second, third, fourth]) content.save({ files: {}, message: `Publish ${commit.slice(0, 12)}` });

    const result = await purgeEntry({
      source: cloneOf(source.bare),
      content: cloneOf(content.bare),
      entry: { path: ENTRY, kind: 'image', collection: 'image-library' },
      by: ADMIN,
      at: '2026-11-26T10:00:00Z',
      pushedBy: async () => ({}),
    });
    const fresh = cloned(source.bare);
    const paths = everyPath(fresh);
    assert.ok(!paths.has(ENTRY));
    assert.ok(!paths.has('media/meadow.jpg'), 'its own original goes');
    assert.ok(paths.has('media/named.jpg'), 'a current file names it');
    assert.ok(paths.has('media/shared.jpg'), 'another entry names it, deleted or not');
    assert.deepEqual(result.originals, [oidOf(own)]);
    const freshContent = cloned(content.bare);
    assert.ok(![...everyPath(freshContent)].some((path) => path.startsWith('media/meadow-')), 'the masters made of it go');
    assert.ok(everyPath(freshContent).has(`media/kept-${oidOf(kept).slice(0, 10)}.webp`));
  });
});

describe('a purge of a deleted term', () => {
  const TERM = 'topics/dddddddddddd.json';
  test('takes its file and its page\'s file, but not another term\'s that took its slug after it', async () => {
    const source = remote();
    const content = remote();
    const ledger = (terms) => json({ posts: {}, awaited: {}, terms, files: {}, chosen: { legalPages: [], notFound: null } });
    const made = source.save({ files: { [TERM]: json({ name: 'Meadows', description: 'A secret meadow.' }) } });
    content.save({ files: { 'topics/meadows.json': json({ name: 'Meadows', description: 'A secret meadow.' }), '.post-ids.json': ledger({ dddddddddddd: { address: '/topics/meadows/', addresses: ['/topics/meadows/'] } }) }, message: `Publish ${made.slice(0, 12)}` });
    const deleted = source.save({ files: { [TERM]: null } });
    content.save({ files: { 'topics/meadows.json': null }, message: `Publish ${deleted.slice(0, 12)}` });
    const other = source.save({ files: { 'topics/ffffffffffff.json': json({ name: 'Meadows', description: 'Another.' }) } });
    content.save({ files: { 'topics/meadows.json': json({ name: 'Meadows', description: 'Another.' }), '.post-ids.json': ledger({ dddddddddddd: { address: '/topics/meadows/', addresses: ['/topics/meadows/'] }, ffffffffffff: { address: '/topics/meadows/', addresses: ['/topics/meadows/'] } }) }, message: `Publish ${other.slice(0, 12)}` });

    await purgeEntry({
      source: cloneOf(source.bare),
      content: cloneOf(content.bare),
      entry: { path: TERM, kind: 'term', collection: 'topics' },
      by: ADMIN,
      at: '2026-11-26T10:00:00Z',
      pushedBy: async () => ({}),
    });
    const fresh = cloned(source.bare);
    assert.ok(!everyPath(fresh).has(TERM));
    const freshContent = cloned(content.bare);
    assert.ok(everyText(freshContent).every((text) => !/secret|dddddddddddd/.test(text)), 'no content file names it');
    assert.equal(fileAt(freshContent, 'main', 'topics/meadows.json'), json({ name: 'Meadows', description: 'Another.' }).trim());
  });
});
