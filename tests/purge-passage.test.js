// A purge of a passage from every old revision (ADR 0078): how a passage is found in the text as
// written, case-insensitively, through whitespace and the escapes that Markdown, YAML and JSON put
// into it, and taken out with nothing in its place.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { findPassage, passageMatcher, passageOf } from '../src/purge/passage.js';
import { cloneOf, remote } from './lib/repositories.js';

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
