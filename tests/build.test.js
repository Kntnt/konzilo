// One build, with real Git repositories and the real intake command, and only Astro and who
// pushed what standing in: what a save becomes, and what it does not (ADR 0031).

import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { CHECK_BROKE, intakeCommand, NOT_BUILT, NOT_READ, NOT_RELEASED, siteBuild } from '../src/build/build.js';
import { buildControl } from '../src/build/record.js';
import { releases } from '../src/build/release.js';
import { contentRepository, sourceRepository } from '../src/build/repositories.js';
import { publishStatus } from '../src/build/status.js';
import { STOPPED } from '../src/intake/guard.js';
import { wordsIn } from '../src/refusals.js';
import { sourcePost } from './lib/intake.js';

const run = promisify(execFile);
const core = fileURLToPath(new URL('../', import.meta.url));
const ENV = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const description = {
  language: 'en_GB',
  types: { story: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: {} } },
};
// Git LFS is the builder's, and no file here needs it.
const noLfs = async (program, args, options) => (args[0] === 'lfs' ? { stdout: '' } : run(program, args, options));
const post = (slug, fields = {}, body = 'Text.') => sourcePost({ title: slug, slug, status: 'published', ...fields }, body);

describe('a build', () => {
  let folder;
  let count = 0;

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-build-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  // A site: a source repository with these files, an empty content repository, and a build.
  const newSite = (files, { astro: givenAstro, roles: givenRoles } = {}) => {
    const root = join(folder, `site-${(count += 1)}`);
    mkdirSync(root);
    const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: ENV });
    const bare = (name) => {
      const path = join(root, `${name}.git`);
      mkdirSync(path);
      git(path, 'init', '--quiet', '--bare', '--initial-branch=main');
      return path;
    };
    const remote = { source: bare('source'), content: bare('content') };
    const writing = join(root, 'writing');
    mkdirSync(writing);
    git(writing, 'init', '--quiet', '--initial-branch=main');
    git(writing, 'remote', 'add', 'origin', remote.source);
    const save = (changes) => {
      for (const [path, contents] of Object.entries(changes)) {
        if (contents === null) {
          rmSync(join(writing, path));
          continue;
        }
        mkdirSync(dirname(join(writing, path)), { recursive: true });
        writeFileSync(join(writing, path), contents);
      }
      git(writing, 'add', '--all');
      git(writing, '-c', 'user.name=Someone', '-c', 'user.email=someone@example.com', 'commit', '--quiet', '--message=A save');
      git(writing, 'push', '--quiet', 'origin', 'main');
      return git(writing, 'rev-parse', 'HEAD').trim();
    };
    const version = (path) => git(writing, 'rev-parse', `HEAD:${path}`).trim();
    save(files);

    const siteFolder = join(root, 'site');
    mkdirSync(siteFolder);
    writeFileSync(join(siteFolder, 'site-description.json'), JSON.stringify(description));
    const access = { user: 'builder', token: 'a-token', home: root };
    const source = sourceRepository({ remote: `file://${remote.source}`, folder: join(root, 'source'), access, command: noLfs });
    const content = contentRepository({ remote: `file://${remote.content}`, folder: join(siteFolder, 'content'), access });
    const control = buildControl(join(root, 'control'));
    const live = releases(join(root, 'public'));
    mkdirSync(join(root, 'public'));
    const seen = { astro: 0, warned: [] };
    const astro = givenAstro ?? (async () => {
      seen.astro += 1;
      const built = join(root, 'dist');
      rmSync(built, { recursive: true, force: true });
      mkdirSync(built);
      writeFileSync(join(built, 'index.html'), `built ${seen.astro}`);
      return built;
    });
    const rolesFile = join(root, 'roles');
    mkdirSync(rolesFile);
    const roles = givenRoles ?? {
      read: async () => {
        writeFileSync(join(rolesFile, 'admins.json'), '[]');
        writeFileSync(join(rolesFile, 'pushers.json'), '{}');
        return { admins: join(rolesFile, 'admins.json'), pushers: join(rolesFile, 'pushers.json') };
      },
    };
    const build = (options = {}) => siteBuild({
      site: 'a-site',
      origin: 'http://localhost:1',
      code: 'the code',
      source,
      content,
      roles,
      control,
      live,
      astro,
      intake: intakeCommand({ program: join(core, 'bin/konzilo-intake.js'), siteFolder, contentFolder: content.folder, environment: { PATH: process.env.PATH, HOME: root } }),
      warn: (words) => seen.warned.push(words),
      ...options,
    });
    const logged = () => readFileSync(join(root, 'control/build-log.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const pushed = () => git(remote.content, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n');
    return { root, save, version, build, control, live, seen, siteFolder, remote, logged, pushed, content };
  };

  const statusOf = (site, path) => publishStatus(site.control.record(), path, site.version(path));

  test('makes what was saved what visitors get, and only then says so', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    const commit = site.version('articles/aaaaaaaaaaaa.md') && execFileSync('git', ['rev-parse', 'main'], { cwd: site.remote.source, encoding: 'utf8', env: ENV }).trim();
    const record = await site.build()();
    assert.equal(record.source, commit);
    assert.equal(record.outcome, 'live');
    assert.equal(record.reason, null);
    assert.match(readlinkSync(join(site.root, 'public/current')), /^releases\/\d{8}T\d{6}Z-[0-9a-f]{12}$/);
    assert.equal(readFileSync(join(site.root, 'public/current/pages/index.html'), 'utf8'), 'built 1');
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'live');
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').address, '/first/');
    assert.ok(existsSync(join(site.siteFolder, 'content/articles/first.md')));
    assert.ok(site.pushed().includes('articles/first.md'), 'the content repository has it');
    assert.ok(site.pushed().includes('.post-ids.json'), 'and its ledger');
    const [line] = site.logged();
    assert.deepEqual(Object.keys(line), ['at', 'site', 'outcome', 'failures']);
    assert.equal(line.site, 'a-site');
    assert.equal(line.outcome, 'live');
    assert.deepEqual(line.failures, []);
  });

  test('says of a new version that it is being published, until a build has read it', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    await site.build()();
    site.save({ 'articles/aaaaaaaaaaaa.md': post('first', {}, 'New words.') });
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'being-published');
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').stillShown, true);
    await site.build()();
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'live');
  });

  test('keeps a draft and a post ahead of its date off the site, and takes off one made a draft', async () => {
    const site = newSite({
      'articles/aaaaaaaaaaaa.md': post('first'),
      'articles/bbbbbbbbbbbb.md': post('second', { status: 'draft' }),
      'articles/cccccccccccc.md': post('third', { status: 'scheduled', date: '2999-01-01T10:00:00Z' }),
    });
    const record = await site.build()();
    assert.equal(record.next, '2999-01-01T10:00:00Z');
    assert.deepEqual(readdirSync(join(site.siteFolder, 'content/articles')), ['first.md']);
    assert.equal(statusOf(site, 'articles/bbbbbbbbbbbb.md').status, 'draft');
    assert.equal(statusOf(site, 'articles/cccccccccccc.md').status, 'scheduled');
    assert.equal(statusOf(site, 'articles/cccccccccccc.md').at, '2999-01-01T10:00:00Z');
    site.save({ 'articles/aaaaaaaaaaaa.md': post('first', { status: 'draft' }) });
    await site.build()();
    assert.ok(!existsSync(join(site.siteFolder, 'content/articles/first.md')));
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'draft');
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').stillShown, false);
  });

  test('takes a scheduled post once its moment has passed', async () => {
    const moment = new Date(Math.ceil((Date.now() + 2000) / 1000) * 1000).toISOString().replace('.000', '');
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first', { status: 'scheduled', date: moment }), 'articles/bbbbbbbbbbbb.md': post('second') });
    const record = await site.build()();
    assert.equal(new Date(record.next).getTime(), new Date(moment).getTime());
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'scheduled');
    await new Promise((go) => setTimeout(go, Math.max(0, new Date(moment) - Date.now()) + 50));
    const later = await site.build()();
    assert.equal(later.next, null);
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'live');
    assert.equal(site.seen.astro, 2, 'what the clock has made visible is new content');
  });

  test('builds nothing again for the same content, code and origin, and still says live', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    await site.build()();
    const release = readlinkSync(join(site.root, 'public/current'));
    // Saved otherwise, the same post: a new version, with nothing new to show.
    site.save({ 'articles/aaaaaaaaaaaa.md': `${post('first')}\n` });
    const record = await site.build()();
    assert.equal(site.seen.astro, 1);
    assert.equal(readlinkSync(join(site.root, 'public/current')), release);
    assert.equal(record.source, execFileSync('git', ['rev-parse', 'main'], { cwd: site.remote.source, encoding: 'utf8', env: ENV }).trim());
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'live');
    await site.build({ code: 'new code' })();
    assert.equal(site.seen.astro, 2, 'new code is built');
    await site.build({ code: 'new code', origin: 'http://localhost:2' })();
    assert.equal(site.seen.astro, 3, 'and a new origin');
  });

  test('publishes the rest when one post is refused, and says that visitors still see its last version', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first'), 'articles/bbbbbbbbbbbb.md': post('second') });
    await site.build()();
    site.save({ 'articles/aaaaaaaaaaaa.md': post('first', { title: '' }), 'articles/bbbbbbbbbbbb.md': post('second', {}, 'New words.') });
    const record = await site.build()();
    assert.equal(record.outcome, 'failed', 'a standing refusal makes the build\'s outcome failed');
    assert.equal(record.reason, null, 'the build itself went well');
    const refused = statusOf(site, 'articles/aaaaaaaaaaaa.md');
    assert.equal(refused.status, 'failed');
    assert.equal(refused.stillShown, true);
    assert.equal(refused.refusals[0].field, 'title');
    assert.equal(refused.refusals[0].name, 'refusal.title-empty', 'by its name, which the publish status shows in the interface language');
    assert.equal(statusOf(site, 'articles/bbbbbbbbbbbb.md').status, 'live');
    assert.match(readFileSync(join(site.siteFolder, 'content/articles/second.md'), 'utf8'), /New words/);
    assert.ok(existsSync(join(site.siteFolder, 'content/articles/first.md')), 'the refused post keeps its file');
    assert.equal(site.logged().at(-1).failures[0].file, 'articles/aaaaaaaaaaaa.md');
    site.save({ 'articles/aaaaaaaaaaaa.md': post('first') });
    await site.build()();
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'live');
  });

  test('keeps the release when Astro cannot build, says why, and builds at the next request', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    await site.build()();
    const release = readlinkSync(join(site.root, 'public/current'));
    site.save({ 'articles/aaaaaaaaaaaa.md': post('first', {}, 'New words.') });
    const record = await site.build({ astro: async () => { throw Object.assign(new Error('no'), { stderr: 'it broke' }); } })();
    assert.equal(record.outcome, 'failed');
    assert.deepEqual(record.reason, NOT_BUILT);
    assert.equal(readlinkSync(join(site.root, 'public/current')), release);
    const status = statusOf(site, 'articles/aaaaaaaaaaaa.md');
    assert.equal(status.status, 'failed');
    assert.deepEqual(status.reason, NOT_BUILT);
    // By its name, which the publish status shows in the interface language, and in British
    // English in the build log.
    assert.equal(wordsIn('sv', status.reason), 'webbplatsen gick inte att bygga av det, så besökare ser fortfarande den senaste versionen');
    assert.deepEqual(site.logged().at(-1).failures[0], { name: 'failure.not-built', values: {}, reason: 'the site could not be built from it, so visitors still see the last version' });
    assert.equal(status.stillShown, true);
    assert.equal(record.source, execFileSync('git', ['rev-parse', 'main'], { cwd: site.remote.source, encoding: 'utf8', env: ENV }).trim(), 'it has taken its request, and does not start again by itself');
    assert.match(site.seen.warned.at(-1), /it broke/);
    await site.build()();
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'live');
    assert.notEqual(readlinkSync(join(site.root, 'public/current')), release);
  });

  test('keeps the release when what a build wrote for the web server cannot be taken', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    await site.build()();
    const release = readlinkSync(join(site.root, 'public/current'));
    site.save({ 'articles/aaaaaaaaaaaa.md': post('first', {}, 'New words.') });
    const built = join(site.root, 'dist-bad');
    mkdirSync(built);
    writeFileSync(join(built, '_headers'), '/*\n  Set-Cookie: nothing=good\n');
    const record = await site.build({ astro: async () => built })();
    assert.deepEqual(record.reason, NOT_RELEASED);
    assert.equal(readlinkSync(join(site.root, 'public/current')), release);
    assert.match(site.seen.warned.at(-1), /Set-Cookie is no header a release may set/);
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'failed');
  });

  test('says what it can when the source cannot be read, and goes on', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    const first = await site.build()();
    rmSync(site.remote.source, { recursive: true });
    const record = await site.build()();
    assert.deepEqual(record.reason, NOT_READ);
    assert.equal(record.source, first.source);
    assert.deepEqual(record.release, first.release);
    assert.deepEqual(record.posts, first.posts);
  });

  test('fails closed when the check itself breaks', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    await site.build()();
    const release = readlinkSync(join(site.root, 'public/current'));
    site.save({ 'articles/aaaaaaaaaaaa.md': post('first', {}, 'New words.') });
    writeFileSync(join(site.siteFolder, 'site-description.json'), '{ not json');
    const record = await site.build()();
    assert.deepEqual(record.reason, CHECK_BROKE);
    assert.equal(readlinkSync(join(site.root, 'public/current')), release);
    assert.doesNotMatch(readFileSync(join(site.siteFolder, 'content/articles/first.md'), 'utf8'), /New words/);
  });

  test('stops at a deletion of most of the site, until an operator confirms it with its code', async () => {
    const site = newSite({
      'articles/aaaaaaaaaaaa.md': post('first'),
      'articles/bbbbbbbbbbbb.md': post('second'),
      'articles/cccccccccccc.md': post('third'),
    });
    await site.build()();
    const release = readlinkSync(join(site.root, 'public/current'));
    site.save({ 'articles/aaaaaaaaaaaa.md': null, 'articles/bbbbbbbbbbbb.md': post('second', { status: 'draft' }) });
    const stopped = await site.build()();
    assert.deepEqual(stopped.reason, STOPPED);
    assert.equal(stopped.stopped.count, 2);
    assert.match(stopped.stopped.code, /^[0-9a-f]{8}$/);
    assert.equal(readlinkSync(join(site.root, 'public/current')), release);
    assert.ok(existsSync(join(site.siteFolder, 'content/articles/first.md')));
    const held = statusOf(site, 'articles/bbbbbbbbbbbb.md');
    assert.equal(held.status, 'failed');
    assert.deepEqual(held.reason, STOPPED);
    assert.equal(wordsIn('en', held.reason), 'the build would take most of the site\'s posts off it, so it waits until the deletion is confirmed');
    assert.equal(held.stillShown, true);
    assert.equal(site.logged().at(-1).outcome, 'failed');
    site.control.confirm('00000000');
    assert.deepEqual((await site.build()()).reason, STOPPED, 'another code confirms nothing');
    assert.equal(site.control.takeConfirmed(), null, 'and a code holds for one build');
    site.control.confirm(stopped.stopped.code);
    const confirmed = await site.build()();
    assert.equal(confirmed.reason, null);
    assert.ok(!existsSync(join(site.siteFolder, 'content/articles/first.md')));
    assert.equal(statusOf(site, 'articles/bbbbbbbbbbbb.md').status, 'draft');
  });

  test('costs visitors nothing when the content repository cannot be reached', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    await site.build()();
    site.save({ 'articles/aaaaaaaaaaaa.md': post('first', {}, 'New words.') });
    rmSync(site.remote.content, { recursive: true });
    const record = await site.build()();
    assert.equal(record.outcome, 'live');
    assert.equal(statusOf(site, 'articles/aaaaaaaaaaaa.md').status, 'live');
    assert.match(site.seen.warned.at(-1), /could not be pushed/);
  });

  test('comes back from the content repository when its checkout is lost, keeping the ledger', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    await site.build()();
    const ledger = readFileSync(join(site.siteFolder, 'content/.post-ids.json'), 'utf8');
    rmSync(join(site.siteFolder, 'content'), { recursive: true });
    const record = await site.build()();
    assert.equal(record.outcome, 'live');
    assert.equal(readFileSync(join(site.siteFolder, 'content/.post-ids.json'), 'utf8'), ledger);
    assert.equal(site.seen.astro, 1, 'the same content needs no new release');
  });

  test('replaces what a folder with no history holds, as a developer\'s copy of the demo content', async () => {
    const site = newSite({ 'articles/aaaaaaaaaaaa.md': post('first') });
    mkdirSync(join(site.siteFolder, 'content/articles'), { recursive: true });
    writeFileSync(join(site.siteFolder, 'content/articles/left-behind.md'), 'old');
    const record = await site.build()();
    assert.equal(record.outcome, 'live');
    assert.deepEqual(readdirSync(join(site.siteFolder, 'content/articles')), ['first.md']);
  });
});

describe('releases', () => {
  let folder;

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-releases-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));

  test('keeps the one in use and the one before, and clears what else lies there', () => {
    const root = join(folder, 'public');
    mkdirSync(join(root, 'an-old-page'), { recursive: true });
    writeFileSync(join(root, 'index.html'), 'from before there were releases');
    const built = join(folder, 'dist');
    mkdirSync(built);
    const live = releases(root);
    assert.equal(live.current(), null);
    for (const name of ['1', '2', '3']) {
      writeFileSync(join(built, 'index.html'), name);
      live.publish(built, name);
      assert.equal(live.current(), name);
      assert.equal(readFileSync(join(root, 'current/pages/index.html'), 'utf8'), name);
    }
    assert.deepEqual(readdirSync(root).sort(), ['current', 'releases']);
    assert.deepEqual(readdirSync(join(root, 'releases')).sort(), ['2', '3']);
  });

  test('holds its rules beside its pages, where no visitor reaches them, and none of what they came from', () => {
    const root = join(folder, 'rules');
    const built = join(folder, 'dist-rules');
    mkdirSync(built);
    for (const file of ['index.html', '_headers', '_redirects', '_markdown']) writeFileSync(join(built, file), 'x');
    releases(root).publish(built, '1', 'the rules\n');
    assert.equal(readFileSync(join(root, 'current/web-rules.caddy'), 'utf8'), 'the rules\n');
    assert.deepEqual(readdirSync(join(root, 'current/pages')), ['index.html']);
  });

  test('clears a release a stop left half made', () => {
    const root = join(folder, 'stopped');
    mkdirSync(join(root, 'releases/.half'), { recursive: true });
    const built = join(folder, 'dist-two');
    mkdirSync(built);
    releases(root).publish(built, '1');
    assert.deepEqual(readdirSync(join(root, 'releases')), ['1']);
  });
});
