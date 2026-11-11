// A live preview's run of the intake: the posts it shows are checked and written whatever
// their status and date, and every other draft stays out of it (ADR 0032).

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NOW, run, sourcePost, written } from './lib/intake.js';

const site = {
  language: 'en_GB',
  images: { smallestWidth: 1, displayWidth: 1 },
  types: {
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph'] },
  },
};

const draft = (title, more = {}) => sourcePost({ title, status: 'draft', ...more }, 'Some words.');
const later = new Date(NOW.getTime() + 86_400_000).toISOString();

test('writes the draft it is given, and no other', () => {
  const result = run({ 'pages/one.md': draft('One'), 'pages/two.md': draft('Two') }, site, { preview: ['pages/one.md'] });
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(Object.keys(written(result)).filter((path) => path.startsWith('pages/')), ['pages/one.md']);
  assert.equal(result.ledger.posts.one.address, '/pages/one/');
});

test('writes a post whose date has not come, and a post with no status', () => {
  const result = run({ 'pages/one.md': draft('One', { status: 'scheduled', date: later }), 'pages/two.md': sourcePost({ title: 'Two' }, 'Words.') }, site, { preview: ['pages/one.md', 'pages/two.md'] });
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(Object.keys(written(result)).filter((path) => path.startsWith('pages/')), ['pages/one.md', 'pages/two.md']);
});

test('without being asked, as a build for the public site is not, it leaves a draft and a post ahead of its moment out', () => {
  const result = run({ 'pages/one.md': draft('One'), 'pages/two.md': draft('Two', { status: 'scheduled', date: later }), 'pages/three.md': sourcePost({ title: 'Three', status: 'published', date: later }, 'Words.') }, site);
  assert.deepEqual(result.refusals, []);
  assert.deepEqual(Object.keys(written(result)).filter((path) => path.startsWith('pages/')), []);
  assert.deepEqual(result.posts.map(({ state }) => state), ['off', 'waiting', 'waiting']);
});

test('places a draft below a draft parent, as saving would', () => {
  const result = run({ 'pages/one.md': draft('One'), 'pages/two.md': draft('Two', { parent: 'one' }) }, site, { preview: ['pages/two.md'] });
  assert.deepEqual(result.refusals, []);
  assert.equal(result.ledger.posts.two.address, '/pages/one/two/');
});

test('refuses a draft as it would a published post, and leaves its last good file standing', () => {
  const good = run({ 'pages/one.md': draft('One') }, site, { preview: ['pages/one.md'] });
  const bad = sourcePost({ title: '', status: 'draft' }, 'Words.');
  const result = run({ 'pages/one.md': bad }, site, { preview: ['pages/one.md'], ledger: good.ledger });
  assert.ok(result.refusals.some((one) => one.file === 'pages/one.md' && one.field?.name === 'title'), JSON.stringify(result.refusals));
  assert.ok(result.keep.includes('pages/one.md'));
  assert.equal(written(result)['pages/one.md'], undefined);
});

test('gives an address a published post and a draft both want to the published post, as publishing the draft would', () => {
  const files = {
    'pages/a-draft.md': draft('A draft', { slug: 'same' }),
    'pages/b-live.md': sourcePost({ title: 'Live', slug: 'same', status: 'published' }, 'Words.'),
  };
  const all = Object.keys(files);
  const first = run(files, site, { preview: all });
  assert.ok(first.refusals.some((one) => one.file === 'pages/a-draft.md' && one.field?.name === 'slug'), JSON.stringify(first.refusals));
  assert.equal(first.ledger.posts['b-live'].address, '/pages/same/');
  assert.match(written(first)['pages/same.md'], /title: "Live"/);

  // Even where the preview showed the draft there before the other was published.
  const before = run({ 'pages/a-draft.md': files['pages/a-draft.md'] }, site, { preview: ['pages/a-draft.md'] });
  assert.equal(before.ledger.posts['a-draft'].address, '/pages/same/');
  const after = run(files, site, { preview: all, ledger: before.ledger });
  assert.ok(after.refusals.some((one) => one.file === 'pages/a-draft.md' && one.field?.name === 'slug'), JSON.stringify(after.refusals));
  assert.equal(after.ledger.posts['b-live'].address, '/pages/same/');
  assert.match(written(after)['pages/same.md'], /title: "Live"/);
});
