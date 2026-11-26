// A purge of a passage from every old revision (ADR 0078): how a passage is found in the text as
// written, case-insensitively, through whitespace and the escapes that Markdown, YAML and JSON put
// into it, and taken out with nothing in its place; every file and revision of the source that
// holds it, as an Admin is shown them; and its purge, against two repositories that stand in for
// Forgejo's, refused while a current version holds it, or the content repository's head does,
// after which neither, cloned anew, holds it
// in any file or message, every save stays at its moment, and who pushed each is carried over.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { PurgeRefusal } from '../src/purge/histories.js';
import { findPassage, passageMatcher, passageOf, purgePassage } from '../src/purge/passage.js';
import { PURGES_BRANCH, PURGES_FILE, purgeRecord } from '../src/purge/record.js';
import { cloned, cloneOf, everyText, fileAt, remote } from './lib/repositories.js';

describe('a passage as it is found', () => {
  test('is taken trimmed, its whitespace one space, and refused where it is too short or too long', () => {
    assert.equal(passageOf('  Ebba   Svensson\t070-123 45 67 '), 'Ebba Svensson 070-123 45 67');
    assert.equal(passageOf('ab'), null);
    assert.equal(passageOf('   '), null);
    assert.equal(passageOf('x'.repeat(501)), null);
    assert.equal(passageOf(42), null);
  });

  test('is found whatever its case, across any whitespace, and taken out with nothing in its place', () => {
    const { holds, without } = passageMatcher('ebba svensson');
    assert.equal(holds('Call Ebba  Svensson today.'), true);
    assert.equal(holds('Call EBBA\nSVENSSON today.'), true);
    assert.equal(holds('Call Ebba Svenson today.'), false);
    assert.equal(without('Call Ebba  Svensson today, or ebba svensson.'), 'Call  today, or .');
    assert.equal(holds('Åsa Öberg'), false);
    assert.equal(passageMatcher('åsa öberg').holds('ÅSA ÖBERG'), true);
  });

  test('is found through the escapes Markdown, YAML and JSON write, which go with it', () => {
    const { holds, without } = passageMatcher('snake_case "quoted" 1*2');
    assert.equal(without('a snake\\_case \\"quoted\\" 1\\*2 b'), 'a  b');
    assert.equal(holds('{ "title": "snake_case \\"quoted\\" 1*2" }'), true);
    const mail = passageMatcher('ebba@example.com');
    assert.equal(mail.without('Mail ebba<!-- -->@example.com now.'), 'Mail  now.');
    assert.equal(mail.without('[ebba@example.com](mailto:ebba@example.com)'), '[](mailto:)');
    assert.equal(passageMatcher('line one line two').without('{ "text": "line one\\nline two" }'), '{ "text": "" }');
    assert.equal(passageMatcher('line one line two').without('line one\\\nline two'), '');
  });

  test('leaves nothing of it where taking it out joins it anew', () => {
    assert.equal(passageMatcher('abc').without('aabcbc and ABC'), ' and ');
  });

  test('says the text around each place it is found, up to the place before and the place after', () => {
    const { around } = passageMatcher('Ebba Svensson');
    const text = `${'x'.repeat(100)} Call Ebba\nSvensson on 070 or write to ebba svensson.`;
    assert.deepEqual(around(text), [
      { before: `${'x'.repeat(54)} Call `, match: 'Ebba Svensson', after: ' on 070 or write to ' },
      { before: ' on 070 or write to ', match: 'ebba svensson', after: '.' },
    ]);
  });
});

const ADMIN = { login: 'anna', name: 'Anna Admin' };
const PASSAGE = 'Ebba Svensson, 070-123 45 67';
const post = (title, body) => `---\ntitle: ${JSON.stringify(title)}\nstatus: published\n---\n${body}\n`;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const pointer = 'version https://git-lfs.github.com/spec/v1\noid sha256:0000000000000000000000000000000000000000000000000000000000000000\nsize 12\n';
const at = (minute) => new Date(Date.UTC(2026, 10, 1, 8, minute)).toISOString();

// A clone of a repository as the purge's program fetches it.
const fetched = async (bare) => {
  const clone = cloneOf(bare);
  await clone.git(['fetch', '--quiet', 'origin', '+refs/heads/*:refs/heads/*']);
  return clone;
};

// The source: a post that held the passage, and was saved without it by hand; an author's term
// that held it, and was deleted; a post whose current version holds it; a save whose message
// names it; and an image, which is never searched.
const sources = () => {
  const source = remote();
  const commits = [];
  const save = (files, message) => {
    commits.push(source.save({ files, ...(message ? { message } : {}) }));
    return commits.at(-1);
  };
  save({ 'articles/aaaaaaaaaaaa.md': post('Opening hours', 'Call Ebba Svensson, 070-123 45 67, about the opening.'), 'authors/bbbbbbbbbbbb.json': json({ name: 'Ebba Svensson, 070-123 45 67' }) }, 'Add the author Ebba Svensson, 070-123 45 67');
  save({ 'articles/aaaaaaaaaaaa.md': post('Opening hours, changed', 'Call Ebba\nSvensson, 070-123 45 67, about the opening.'), 'articles/cccccccccccc.md': post('Kept', 'Nothing here.') });
  save({ 'articles/cccccccccccc.md': post('Kept', 'Ask ebba svensson, 070-123 45 67.') });
  save({ 'media/drawing.svg': '<svg><text>Ebba Svensson, 070-123 45 67</text></svg>', 'media/photo.jpg': pointer });
  save({ 'articles/aaaaaaaaaaaa.md': post('Opening hours, changed', 'Call the office about the opening.') });
  save({ 'authors/bbbbbbbbbbbb.json': null });
  return { source, commits };
};

describe('finding a passage', () => {
  test('lists every file and revision that holds it, the current versions first and marked, with the text around it, and the saves whose message names it', async () => {
    const { source, commits } = sources();
    const found = await findPassage({ git: (await fetched(source.bare)).git, passage: PASSAGE });
    assert.deepEqual(found.counted, { files: 3, revisions: 4, messages: 1 });
    assert.deepEqual(found.files.map(({ path, current }) => [path, current]), [
      ['articles/cccccccccccc.md', true],
      ['articles/aaaaaaaaaaaa.md', false],
      ['authors/bbbbbbbbbbbb.json', false],
    ]);
    assert.deepEqual(found.files[0].revisions, [{ commit: commits[2], moment: at(2), current: true, count: 1, around: [{ before: '--- title: "Kept" status: published --- Ask ', match: 'ebba svensson, 070-123 45 67', after: '. ' }] }]);
    assert.deepEqual(found.files[1].revisions.map(({ commit, current, around }) => [commit, current, around[0].match]), [
      [commits[1], false, 'Ebba Svensson, 070-123 45 67'],
      [commits[0], false, 'Ebba Svensson, 070-123 45 67'],
    ]);
    assert.equal(found.files[1].more, 0);
    assert.deepEqual(found.messages, [{ commit: commits[0], moment: at(0), around: [{ before: 'Add the author ', match: 'Ebba Svensson, 070-123 45 67', after: '' }] }]);
  });

  test('lists twenty revisions of a file at most, and says how many more hold it', async () => {
    const source = remote();
    for (let count = 0; count < 23; count += 1) source.save({ files: { 'articles/aaaaaaaaaaaa.md': post(`Version ${count}`, PASSAGE) } });
    const found = await findPassage({ git: (await fetched(source.bare)).git, passage: PASSAGE });
    assert.deepEqual(found.counted, { files: 1, revisions: 23, messages: 0 });
    assert.equal(found.files[0].revisions.length, 20);
    assert.equal(found.files[0].more, 3);
    assert.equal(found.files[0].revisions[0].current, true);
  });

  test('finds nothing where no revision holds it', async () => {
    const { source } = sources();
    const found = await findPassage({ git: (await fetched(source.bare)).git, passage: 'nobody at all' });
    assert.deepEqual(found, { files: [], messages: [], counted: { files: 0, revisions: 0, messages: 0 } });
  });
});

describe('a purge of a passage', () => {
  // The source and the content repository: a first save without the passage, then the source's
  // saves above, each published but the last, the hand-made one, which no build has read yet; with
  // who pushed each source commit.
  const sites = () => {
    const source = remote();
    const content = remote();
    const pushers = {};
    const commits = [];
    const ebba = (minute) => ({ login: 'ebba', name: 'Ebba Editor', at: at(minute) });
    const save = (files, message) => {
      const commit = source.save({ files, ...(message ? { message } : {}) });
      pushers[commit] = ebba(commits.length);
      commits.push(commit);
      return commit;
    };
    const publish = (commit, files) => content.save({ files, message: `Publish ${commit.slice(0, 12)}` });
    publish(save({ 'articles/dddddddddddd.md': post('Untouched', 'Nothing to see.') }), { 'articles/untouched.md': 'Nothing to see.\n' });
    publish(save({ 'articles/aaaaaaaaaaaa.md': post('Opening hours', 'Call Ebba Svensson, 070-123 45 67, about the opening.'), 'authors/bbbbbbbbbbbb.json': json({ name: 'Ebba Svensson, 070-123 45 67' }) }, 'Add the author Ebba Svensson, 070-123 45 67'), {
      'articles/opening-hours.md': 'Call Ebba Svensson, 070-123 45 67, about the opening.\n',
      'authors/ebba-svensson-070-123-45-67.json': json({ name: 'Ebba Svensson, 070-123 45 67' }),
      '.post-ids.json': json({ posts: { aaaaaaaaaaaa: { title: 'Opening hours' } } }),
    });
    publish(save({ 'articles/cccccccccccc.md': post('Kept', 'Ask ebba svensson, 070-123 45 67.') }), { 'articles/kept.md': 'Ask ebba svensson, 070-123 45 67.\n' });
    publish(save({ 'articles/aaaaaaaaaaaa.md': post('Opening hours', 'Call the office about the opening.'), 'authors/bbbbbbbbbbbb.json': null }), {
      'articles/opening-hours.md': 'Call the office about the opening.\n',
      'authors/ebba-svensson-070-123-45-67.json': null,
    });
    return { source, content, pushers, commits };
  };
  const purging = ({ source, content, pushers }, passage = PASSAGE) => purgePassage({
    source: cloneOf(source.bare),
    content: cloneOf(content.bare),
    passage,
    by: ADMIN,
    at: '2026-11-26T10:00:00Z',
    pushedBy: async (shas) => Object.fromEntries(shas.map((sha) => [sha, pushers[sha] ?? null])),
  });
  const { holds } = passageMatcher(PASSAGE);
  const messagesOf = (git) => git('log', '--all', '--format=%B').split('\n');

  test('refuses while a current version holds it, and names each', async () => {
    const sites1 = sites();
    await assert.rejects(purging(sites1), (error) => error instanceof PurgeRefusal && error.reason === 'current' && JSON.stringify(error.paths) === '["articles/cccccccccccc.md"]');
    assert.equal(cloned(sites1.source.bare)('rev-parse', 'main'), sites1.commits.at(-1), 'nothing is pushed');
  });

  test('refuses while the content repository\'s head holds it, as a file the build has not yet made again from the Admin\'s save, and names each', async () => {
    const site = sites();
    const hand = site.source.save({ files: { 'articles/cccccccccccc.md': post('Kept', 'Ask the office.') } });
    const published = cloned(site.content.bare)('rev-parse', 'main');
    await assert.rejects(purging(site), (error) => error instanceof PurgeRefusal && error.reason === 'published' && JSON.stringify(error.paths) === '["articles/kept.md"]');
    assert.equal(cloned(site.source.bare)('rev-parse', 'main'), hand, 'nothing is pushed');
    assert.equal(cloned(site.content.bare)('rev-parse', 'main'), published);
  });

  test('once the current versions are saved without it, and published, takes it from every revision of both repositories with nothing in its place, and carries over every save', async () => {
    const site = sites();
    const { source, content, pushers, commits } = site;
    const hand = source.save({ files: { 'articles/cccccccccccc.md': post('Kept', 'Ask the office.') } });
    pushers[hand] = { login: 'anna', name: 'Anna Admin', at: at(9) };
    commits.push(hand);
    content.save({ files: { 'articles/kept.md': 'Ask the office.\n' }, message: `Publish ${hand.slice(0, 12)}` });
    const publishedTree = cloned(content.bare)('rev-parse', 'main^{tree}');
    const before = { moments: cloned(source.bare)('log', '--format=%cI %s', 'main'), files: cloned(source.bare)('log', '--format=%H', '--', 'articles/cccccccccccc.md').split('\n').length };

    const result = await purging(site);
    assert.deepEqual(result.changed, { files: 3, revisions: 3, messages: 1 });

    const fresh = cloned(source.bare);
    const freshContent = cloned(content.bare);
    for (const git of [fresh, freshContent]) {
      assert.ok(everyText(git).every((text) => !holds(text)), 'no file of any commit holds it');
      assert.ok(messagesOf(git).every((text) => !holds(text)), 'nor any message');
    }
    const now = fresh('rev-list', '--reverse', 'main').split('\n');
    assert.equal(now[0], commits[0], 'a save before the oldest that held it keeps its identity');
    assert.equal(fileAt(fresh, now[1], 'articles/aaaaaaaaaaaa.md'), post('Opening hours', 'Call , about the opening.').trim(), 'nothing marks where it was');
    assert.equal(fileAt(fresh, now[1], 'authors/bbbbbbbbbbbb.json'), json({ name: '' }).trim());
    assert.equal(fresh('log', '-1', '--format=%B', now[1]), 'Add the author');
    assert.equal(fresh('log', '--format=%cI %s', 'main'), before.moments.replace(/Add the author Ebba Svensson, 070-123 45 67/, 'Add the author'), 'every save stays, at its moment');
    assert.equal(fresh('log', '--format=%H', '--', 'articles/cccccccccccc.md').split('\n').length, before.files, 'and every revision of each form');
    assert.equal(fileAt(fresh, 'main', 'articles/cccccccccccc.md'), post('Kept', 'Ask the office.').trim(), 'the current versions are as the Admin saved them');

    assert.equal(freshContent('rev-parse', 'main^{tree}'), publishedTree, 'the published files are as the build left them');
    for (const line of freshContent('log', '--format=%s', 'main').split('\n')) {
      const [, prefix] = /^Publish ([0-9a-f]{12})$/.exec(line);
      assert.ok(now.some((commit) => commit.startsWith(prefix)), `${line} names a commit of the source`);
    }

    const record = purgeRecord(fileAt(fresh, PURGES_BRANCH, PURGES_FILE));
    assert.deepEqual(record.purges, [{ at: '2026-11-26T10:00:00Z', by: ADMIN }]);
    for (const [index, commit] of commits.entries()) {
      if (index === 0) continue;
      assert.deepEqual(record.pushes[now[index]], pushers[commit], `who pushed save ${index}`);
    }
    assert.ok(!holds(fileAt(fresh, PURGES_BRANCH, PURGES_FILE)), 'the record says nothing of what');
  });

  test('keeps a save that took out nothing but the passage, at its moment and by its account, though it then changes nothing', async () => {
    const site = sites();
    const { source, pushers, commits } = site;
    const hand = source.save({ files: { 'articles/cccccccccccc.md': post('Kept', 'Ask .') } });
    pushers[hand] = { login: 'anna', name: 'Anna Admin', at: at(9) };
    site.content.save({ files: { 'articles/kept.md': 'Ask .\n' }, message: `Publish ${hand.slice(0, 12)}` });
    const before = cloned(source.bare)('log', '--format=%cI', 'main');
    await purging(site);
    const fresh = cloned(source.bare);
    assert.equal(fresh('log', '--format=%cI', 'main'), before);
    const record = purgeRecord(fileAt(fresh, PURGES_BRANCH, PURGES_FILE));
    assert.deepEqual(record.pushes[fresh('rev-parse', 'main')], pushers[hand]);
    assert.equal(fresh('rev-list', '--count', 'main'), String(commits.length + 1));
  });

  test('refuses where neither repository holds it', async () => {
    const site = sites();
    await assert.rejects(purging(site, 'nobody at all'), (error) => error instanceof PurgeRefusal && error.reason === 'not-found');
  });
});
