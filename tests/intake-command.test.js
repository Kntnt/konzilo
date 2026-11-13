// konzilo-intake, the command: it reads a checkout, and writes the content folder.

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sourcePost } from './lib/intake.js';
import { sharp } from './lib/images.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const command = join(core, 'bin/konzilo-intake.js');
const description = {
  language: 'en_GB',
  images: { smallestWidth: 10, displayWidth: 10 },
  taxonomies: { tag: { label: 'Tag', plural: 'Tags', collection: 'tags' } },
  types: { story: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'image'], fields: { tags: { taxonomy: 'tag' }, image: {} } } },
  menus: { main: { label: 'Main' } },
};
const post = (slug, fields = {}, body = 'Text.') => sourcePost({ title: slug, slug, status: 'published', ...fields }, body);

describe('konzilo-intake', () => {
  let folder;
  let count = 0;

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-intake-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  const put = (root, files) => {
    for (const [path, contents] of Object.entries(files)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), contents);
    }
  };

  // A new site: its description, an empty content folder and a checkout of these files.
  const newSite = (files = {}) => {
    const root = join(folder, `site-${(count += 1)}`);
    const site = { root, checkout: join(root, 'source'), content: join(root, 'content') };
    mkdirSync(site.content, { recursive: true });
    mkdirSync(site.checkout, { recursive: true });
    writeFileSync(join(root, 'site-description.json'), JSON.stringify(description));
    put(site.checkout, files);
    return site;
  };

  const intake = ({ root, checkout }, ...args) => {
    const env = { ...process.env };
    delete env.KONZILO_CONTENT;
    delete env.KONZILO_ADMIN_ORIGIN;
    const roles = args.includes('--admins') ? ['--pushers', join(root, 'pushers.json'), '--reviewers', join(root, 'reviewers.json')] : args.includes('--bare') ? [] : ['--no-roles'];
    const result = spawnSync(process.execPath, [command, checkout, ...roles, ...args.filter((arg) => arg !== '--bare')], { cwd: root, env, encoding: 'utf8' });
    return { ...result, report: result.status === 0 || result.status === 3 ? JSON.parse(result.stdout) : null };
  };

  const listing = (root) => (existsSync(root) ? readdirSync(root, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => relative(root, join(entry.parentPath, entry.name))).sort() : []);

  test('writes the content folder, and reports what it did', async () => {
    const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#a33' } }).jpeg().toBuffer();
    const site = newSite({
      'articles/aaaaaaaaaaaa.md': post('first', { tags: ['tagtagtagtag'], image: { src: '/media/photo.jpg', alt: 'A photo' } }),
      'tags/tagtagtagtag.json': '{"name":"A tag"}',
      'media/photo.jpg': photo,
    });
    const { status, stderr, report } = intake(site);
    assert.equal(status, 0, stderr);
    assert.deepEqual(report.refusals, []);
    const files = listing(site.content);
    assert.ok(files.includes('articles/first.md'));
    assert.ok(files.includes('tags/a-tag.json'));
    assert.ok(files.includes('settings.json') && files.includes('consent.json') && files.includes('redirects.json') && files.includes('menus/main.json') && files.includes('.post-ids.json'));
    const master = files.find((path) => path.startsWith('media/'));
    assert.match(master, /^media\/first-[0-9a-f]{10}\.webp$/);
    assert.equal((await sharp(readFileSync(join(site.content, master))).metadata()).format, 'webp');
    assert.deepEqual(report.written.sort(), files);
  });

  test('a second run changes nothing, and leaves alone what is not its own', () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    intake(site);
    put(site.content, { '.keep': 'mine', 'notes/readme.txt': 'mine', 'articles/notes.txt': 'mine', 'media/readme.txt': 'mine' });
    const { report } = intake(site);
    assert.deepEqual(report.written, []);
    assert.deepEqual(report.removed, []);
    for (const path of ['.keep', 'notes/readme.txt', 'articles/notes.txt', 'media/readme.txt']) assert.ok(existsSync(join(site.content, path)), path);
  });

  test('a post that moves leaves no file behind, and a folder it empties goes', () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first'), 'articles/bbbbbbbbbbbb.md': post('second') });
    intake(site);
    put(site.checkout, { 'articles/aaaaaaaaaaaa.md': post('moved') });
    const { report } = intake(site);
    assert.deepEqual(report.removed, ['articles/first.md']);
    assert.ok(existsSync(join(site.content, 'articles/moved.md')));
    assert.match(readFileSync(join(site.content, 'articles/moved.md'), 'utf8'), /oldAddresses: \["\/first\/"\]/);
  });

  test('takes off what no post names now: a post\'s file, a term\'s and a master', async () => {
    const photo = await sharp({ create: { width: 40, height: 30, channels: 3, background: '#a33' } }).jpeg().toBuffer();
    const site = newSite({
      'articles/aaaaaaaaaaaa.md': post('first', { tags: ['tagtagtagtag'], image: { src: '/media/photo.jpg', alt: 'A photo' } }),
      'articles/bbbbbbbbbbbb.md': post('second'),
      'articles/cccccccccccc.md': post('third'),
      'tags/tagtagtagtag.json': '{"name":"A tag"}',
      'media/photo.jpg': photo,
    });
    intake(site);
    put(site.content, { 'articles/stray.md': 'another tool wrote this' });
    put(site.checkout, { 'articles/aaaaaaaaaaaa.md': post('first') });
    const { report } = intake(site);
    assert.deepEqual(report.removed.map((path) => path.replace(/-[0-9a-f]{10}/, '')), ['articles/stray.md', 'media/first.webp', 'tags/a-tag.json']);
  });

  // The start page an Admin chooses is the post's file at the content folder's root, which
  // goes back to its collection's folder when the choice does, and counts as a post's file.
  test('moves the start page\'s file to the root and back, and counts it among the posts\' files', () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first'), 'articles/bbbbbbbbbbbb.md': post('second'), 'settings.json': '{"startPage":{"page":"aaaaaaaaaaaa"}}' });
    const chosen = intake(site);
    assert.deepEqual(chosen.report.refusals, []);
    assert.ok(existsSync(join(site.content, 'start.story.md')));
    assert.equal(existsSync(join(site.content, 'articles/first.md')), false);
    put(site.checkout, { 'settings.json': '{}' });
    const back = intake(site);
    assert.deepEqual(back.report.removed, ['start.story.md']);
    assert.ok(existsSync(join(site.content, 'articles/first.md')));
    put(site.checkout, { 'settings.json': '{"startPage":{"page":"aaaaaaaaaaaa"}}' });
    intake(site);
    rmSync(join(site.checkout, 'articles/aaaaaaaaaaaa.md'));
    rmSync(join(site.checkout, 'articles/bbbbbbbbbbbb.md'));
    const stopped = intake(site);
    assert.equal(stopped.status, 3, 'the start page is one of the two posts the run would take off');
    assert.deepEqual(stopped.report.stopped.paths, ['articles/second.md', 'start.story.md']);
  });

  test('a refused post keeps its file, and the command goes on', () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first'), 'articles/bbbbbbbbbbbb.md': post('second') });
    intake(site);
    const before = readFileSync(join(site.content, 'articles/first.md'), 'utf8');
    put(site.checkout, { 'articles/aaaaaaaaaaaa.md': post('renamed', {}, '# Not allowed') });
    const { status, report } = intake(site);
    assert.equal(status, 0);
    assert.equal(report.refusals[0].block.name, 'heading');
    assert.equal(readFileSync(join(site.content, 'articles/first.md'), 'utf8'), before);
    assert.equal(existsSync(join(site.content, 'articles/renamed.md')), false);
  });

  test('exits 3 when the guard stops it, having written and removed nothing, and goes on with its code', () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first'), 'articles/bbbbbbbbbbbb.md': post('second'), 'articles/cccccccccccc.md': post('third') });
    intake(site);
    const before = listing(site.content);
    const ledger = readFileSync(join(site.content, '.post-ids.json'), 'utf8');
    rmSync(join(site.checkout, 'articles'), { recursive: true });
    const stopped = intake(site);
    assert.equal(stopped.status, 3);
    assert.equal(stopped.report.stopped.count, 3);
    assert.match(stopped.report.stopped.reason, /would take most of the site's posts off it/);
    assert.match(stopped.report.stopped.code, /^[0-9a-f]{8}$/);
    assert.deepEqual(listing(site.content), before);
    assert.equal(readFileSync(join(site.content, '.post-ids.json'), 'utf8'), ledger);
    assert.equal(intake(site, '--confirm', 'deadbeef').status, 3);
    const confirmed = intake(site, '--confirm', stopped.report.stopped.code);
    assert.equal(confirmed.status, 0, confirmed.stderr);
    assert.deepEqual(confirmed.report.removed, ['articles/first.md', 'articles/second.md', 'articles/third.md']);
  });

  test('exits 1 when the check itself breaks, with nothing written', () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    writeFileSync(join(site.content, '.post-ids.json'), '{ not json');
    const { status, stderr } = intake(site);
    assert.equal(status, 1);
    assert.match(stderr, /nothing was written/);
    assert.deepEqual(listing(site.content), ['.post-ids.json']);
  });

  test('exits 1 for a site description the checker refuses', () => {
    const site = newSite();
    writeFileSync(join(site.root, 'site-description.json'), '{ "types": {} }');
    assert.equal(intake(site).status, 1);
  });

  test('exits 2 for a wrong call', () => {
    const { status, stderr } = spawnSync(process.execPath, [command], { encoding: 'utf8' });
    assert.equal(status, 2);
    assert.match(stderr, /usage/);
  });

  test('exits 2 when it is not told how to hold roles, and writes nothing', () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    const { status, stderr } = intake(site, '--bare');
    assert.equal(status, 2);
    assert.match(stderr, /--no-roles/);
    assert.deepEqual(listing(site.content), []);
    const admins = join(site.root, 'admins.json');
    writeFileSync(admins, '[]');
    assert.equal(intake(site, '--admins', admins, '--no-roles').status, 2);
    const asked = spawnSync(process.execPath, [command, site.checkout, '--admins', admins], { cwd: site.root, encoding: 'utf8' });
    assert.equal(asked.status, 2, 'a list of Admins says nothing without who pushed what');
    writeFileSync(join(site.root, 'pushers.json'), '{}');
    const noReviewers = spawnSync(process.execPath, [command, site.checkout, '--admins', admins, '--pushers', join(site.root, 'pushers.json')], { cwd: site.root, encoding: 'utf8' });
    assert.equal(noReviewers.status, 2, 'nor without who the Reviewers are');
    assert.match(noReviewers.stderr, /--reviewers/);
    assert.deepEqual(listing(site.content), []);
  });

  // A checkout with Git history: `commit` adds what is there as pushed by this person, whose
  // commit may say it is someone else's, and `unseen` as pushed by nobody the host names.
  const inGit = (site) => {
    const env = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
    const git = (...args) => execFileSync('git', args, { cwd: site.checkout, stdio: ['ignore', 'pipe', 'ignore'], env, encoding: 'utf8' });
    git('init', '--quiet');
    const admins = join(site.root, 'admins.json');
    writeFileSync(admins, '["admin"]');
    writeFileSync(join(site.root, 'reviewers.json'), '["reviewer"]');
    const pushers = {};
    const made = (address) => {
      git('add', '--all');
      git('-c', 'user.name=Someone', '-c', `user.email=${address}`, 'commit', '--quiet', '--message=A change');
      return git('rev-parse', 'HEAD').trim();
    };
    const write = () => writeFileSync(join(site.root, 'pushers.json'), JSON.stringify(pushers));
    write();
    return {
      git,
      admins,
      commit: (who, { address = `${who}@example.com` } = {}) => {
        pushers[made(address)] = who;
        write();
      },
      unseen: () => made('admin@example.com'),
    };
  };

  test('a file moved away by a non-Admin is theirs, also where Git would see a rename', () => {
    const settings = '{"title":"A long enough title for Git to call a move of this file a rename"}\n';
    const site = newSite({ 'settings.json': settings, 'articles/aaaaaaaaaaaa.md': post('first') });
    const { git, admins, commit } = inGit(site);
    commit('admin');
    assert.deepEqual(intake(site, '--admins', admins).report.refusals, []);
    git('mv', 'settings.json', 'elsewhere.json');
    commit('editor');
    const { report } = intake(site, '--admins', admins);
    assert.equal(report.refusals[0].file, 'settings.json');
    assert.match(report.refusals[0].reason, /^editor is no Admin/);
  });

  test('a legal page a non-Admin deleted stays on the site, in Git\'s own words', () => {
    const settings = '{"legalPages":{"privacyPolicy":"aaaaaaaaaaaa"}}\n';
    const site = newSite({ 'settings.json': settings, 'articles/aaaaaaaaaaaa.md': post('privacy'), 'articles/bbbbbbbbbbbb.md': post('other') });
    const { git, admins, commit } = inGit(site);
    commit('admin');
    assert.deepEqual(intake(site, '--admins', admins).report.refusals, []);
    assert.ok(existsSync(join(site.content, 'articles/privacy.md')));
    git('rm', '--quiet', 'articles/aaaaaaaaaaaa.md');
    commit('editor');
    const { status, report } = intake(site, '--admins', admins);
    assert.equal(status, 0);
    assert.match(report.refusals[0].reason, /^editor is no Admin, and only an Admin may take a post chosen as a legal page off the site/);
    assert.deepEqual(report.removed, []);
    assert.ok(existsSync(join(site.content, 'articles/privacy.md')));
  });

  test('the logo stays on disk while the settings that name it are refused', () => {
    const logo = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
    const site = newSite({ 'settings.json': '{"logo":{"src":"/media/logo.svg","alt":"A logo"}}', 'media/logo.svg': logo, 'articles/aaaaaaaaaaaa.md': post('first') });
    const { report } = intake(site);
    assert.deepEqual(report.refusals, []);
    const master = report.written.find((path) => path.startsWith('media/'));
    assert.ok(master);
    put(site.checkout, { 'settings.json': '{ not json' });
    const second = intake(site);
    assert.equal(second.status, 0);
    assert.deepEqual(second.report.removed, []);
    assert.ok(existsSync(join(site.content, master)));
    assert.match(readFileSync(join(site.content, 'settings.json'), 'utf8'), /logo/);
  });

  test('stops at a shallow clone, which cannot say who changed what', () => {
    const whole = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    const { admins, commit } = inGit(whole);
    commit('admin');
    put(whole.checkout, { 'articles/bbbbbbbbbbbb.md': post('second') });
    commit('admin');
    const site = newSite();
    writeFileSync(join(site.root, 'pushers.json'), '{}');
    writeFileSync(join(site.root, 'reviewers.json'), '[]');
    rmSync(site.checkout, { recursive: true });
    execFileSync('git', ['clone', '--quiet', '--depth=1', `file://${whole.checkout}`, site.checkout], { stdio: 'ignore', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
    const { status, stderr } = intake(site, '--admins', admins);
    assert.equal(status, 1);
    assert.match(stderr, /shallow clone/);
    assert.deepEqual(listing(site.content), []);
  });

  test('reads who pushed the last change to each file, against the list of Admins', () => {
    const site = newSite({ 'menus/main.json': '{"items":[]}', 'articles/aaaaaaaaaaaa.md': post('first') });
    const { admins, commit } = inGit(site);
    commit('admin');
    assert.deepEqual(intake(site, '--admins', admins).report.refusals, []);
    put(site.checkout, { 'menus/main.json': '{"items":[{"title":"Mine","url":"/"}]}' });
    commit('editor');
    const { report } = intake(site, '--admins', admins);
    assert.equal(report.refusals[0].file, 'menus/main.json');
    assert.match(report.refusals[0].reason, /^editor is no Admin/);
    assert.equal(readFileSync(join(site.content, 'menus/main.json'), 'utf8'), '{\n  "items": []\n}\n');
  });

  test('refuses whatever a Reviewer pushed, a post, its deletion or a menu, and keeps what was published', () => {
    const site = newSite({ 'menus/main.json': '{"items":[]}', 'articles/aaaaaaaaaaaa.md': post('first'), 'articles/bbbbbbbbbbbb.md': post('second') });
    const { git, admins, commit } = inGit(site);
    commit('admin');
    assert.deepEqual(intake(site, '--admins', admins).report.refusals, []);
    put(site.checkout, { 'articles/aaaaaaaaaaaa.md': post('first', {}, 'Theirs.'), 'articles/cccccccccccc.md': post('third'), 'menus/main.json': '{"items":[{"title":"Mine","url":"/"}]}' });
    git('rm', '--quiet', 'articles/bbbbbbbbbbbb.md');
    commit('reviewer', { address: 'editor@example.com' });
    const { status, report } = intake(site, '--admins', admins);
    assert.equal(status, 0);
    assert.deepEqual(report.refusals.map((one) => [one.file, one.reason.split(',')[0]]), [
      ['menus/main.json', 'reviewer is a Reviewer'],
      ['articles/aaaaaaaaaaaa.md', 'reviewer is a Reviewer'],
      ['articles/bbbbbbbbbbbb.md', 'reviewer is a Reviewer'],
      ['articles/cccccccccccc.md', 'reviewer is a Reviewer'],
    ]);
    assert.doesNotMatch(readFileSync(join(site.content, 'articles/first.md'), 'utf8'), /Theirs/);
    assert.ok(existsSync(join(site.content, 'articles/second.md')));
    assert.ok(!existsSync(join(site.content, 'articles/third.md')));
    assert.deepEqual(report.removed, []);
    // An Editor who makes the change makes it theirs.
    put(site.checkout, { 'articles/aaaaaaaaaaaa.md': post('first', {}, 'Mine.') });
    commit('editor');
    const later = intake(site, '--admins', admins).report;
    assert.ok(!later.refusals.some((one) => one.file === 'articles/aaaaaaaaaaaa.md'));
    assert.match(readFileSync(join(site.content, 'articles/first.md'), 'utf8'), /Mine\./);
  });

  test('believes nothing a commit says of who made it', () => {
    const site = newSite({ 'menus/main.json': '{"items":[]}' });
    const { admins, commit } = inGit(site);
    commit('admin');
    put(site.checkout, { 'menus/main.json': '{"items":[{"title":"Mine","url":"/"}]}' });
    commit('editor', { address: 'admin@example.com' });
    const { report } = intake(site, '--admins', admins);
    assert.match(report.refusals[0].reason, /^editor is no Admin/);
    put(site.checkout, { 'menus/main.json': '{"items":[{"title":"Theirs","url":"/"}]}' });
    commit('admin', { address: 'editor@example.com' });
    assert.deepEqual(intake(site, '--admins', admins).report.refusals, [], 'and an Admin is an Admin, whatever the commit says');
  });

  test('holds a commit nobody is known to have pushed to no Admin\'s rights', () => {
    const site = newSite({ 'menus/main.json': '{"items":[]}' });
    const { admins, commit, unseen } = inGit(site);
    commit('admin');
    put(site.checkout, { 'menus/main.json': '{"items":[{"title":"Mine","url":"/"}]}' });
    unseen();
    const { report } = intake(site, '--admins', admins);
    assert.equal(report.refusals[0].file, 'menus/main.json');
    assert.match(report.refusals[0].reason, /^this person is no Admin/);
  });

  test('says what became of each post', () => {
    const site = newSite({
      'articles/aaaaaaaaaaaa.md': post('first'),
      'articles/bbbbbbbbbbbb.md': post('second', { status: 'draft' }),
      'articles/cccccccccccc.md': post('third', { status: 'scheduled', date: '2999-01-01T10:00:00Z' }),
      'articles/dddddddddddd.md': post('fourth', { tags: ['nosuchtermxxx'] }),
    });
    const { report } = intake(site);
    const by = Object.fromEntries(report.posts.map((one) => [one.file, one]));
    assert.deepEqual(by['articles/aaaaaaaaaaaa.md'], { file: 'articles/aaaaaaaaaaaa.md', id: 'aaaaaaaaaaaa', type: 'story', title: 'first', state: 'live', status: 'published', at: null, address: '/first/', shown: true });
    assert.equal(by['articles/bbbbbbbbbbbb.md'].state, 'off');
    assert.equal(by['articles/bbbbbbbbbbbb.md'].status, 'draft');
    assert.equal(by['articles/bbbbbbbbbbbb.md'].shown, false);
    assert.equal(by['articles/cccccccccccc.md'].state, 'waiting');
    assert.equal(by['articles/cccccccccccc.md'].at, '2999-01-01T10:00:00Z');
    assert.equal(by['articles/dddddddddddd.md'].state, 'refused');
    assert.equal(report.next, '2999-01-01T10:00:00Z');
  });

  // The moment the command runs at, given, so that a site that makes its
  // content files with it makes the same bytes on any day: the registry's
  // `revised` among them, and which posts wait.
  test('runs at the moment it is given, and writes the same bytes each time it is given it', () => {
    const files = {
      'articles/aaaaaaaaaaaa.md': post('first', { date: '2025-12-01T10:00:00Z' }),
      'articles/bbbbbbbbbbbb.md': post('second', { status: 'scheduled', date: '2026-02-01T10:00:00Z' }),
    };
    const one = newSite(files);
    const other = newSite(files);
    const ran = [one, other].map((site) => intake(site, '--now', '2026-01-15T08:00:00Z'));
    for (const { status, stderr } of ran) assert.equal(status, 0, stderr);

    assert.equal(JSON.parse(readFileSync(join(one.content, 'consent.json'), 'utf8')).revised, '2026-01-15');
    assert.equal(ran[0].report.next, '2026-02-01T10:00:00Z');
    assert.deepEqual(listing(other.content), listing(one.content));
    for (const path of listing(one.content)) assert.ok(readFileSync(join(other.content, path)).equals(readFileSync(join(one.content, path))), path);
  });

  test('exits 2 for a moment it cannot read', () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    const { status, stderr } = intake(site, '--now', 'tomorrow');
    assert.equal(status, 2);
    assert.match(stderr, /usage/);
    assert.deepEqual(listing(site.content), []);
  });

  test('takes the content folder from where it is told', () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    const { status, stderr } = intake(site, '--content', 'elsewhere', '--site', site.root);
    assert.equal(status, 0, stderr);
    assert.ok(existsSync(join(site.root, 'elsewhere/articles/first.md')));
  });
});

test('runs where Astro is not installed, as the builder has it', () => {
  const seen = new Set();
  const bare = new Set();
  const visit = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const [, specifier] of text.matchAll(/^\s*(?:import|export)\b[^'"\n]*?from\s+['"]([^'"]+)['"]/gm)) {
      if (specifier.startsWith('.')) {
        if (specifier.endsWith('.js')) visit(resolve(dirname(file), specifier));
      } else bare.add(specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/'));
    }
  };
  visit(command);
  assert.deepEqual([...bare].filter((name) => !name.startsWith('node:')).sort(), ['satteri', 'sax', 'sharp', 'svgo', 'yaml']);
});
