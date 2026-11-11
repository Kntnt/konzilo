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

test('without being asked it leaves them as they are', () => {
  const result = run({ 'pages/one.md': draft('One') }, site);
  assert.deepEqual(Object.keys(written(result)).filter((path) => path.startsWith('pages/')), []);
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
