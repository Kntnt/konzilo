// Comparing two revisions of a form (ADR 0074), field by field under the form's own labels, as the
// editor shows them: text marked word by word, an image or a file before and after, a list's items
// added, removed or moved, the body block by block, a field the form no longer has named with what
// it held; and what restoring a revision puts into the form.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { markdownToMdast } from 'satteri';

import { markdownFeatures } from '../src/astro/reader-features.js';
import { compareForms, restoredValues, statusOf } from '../src/cms/history/compare.js';
import { bodiesBetween, itemsBetween, wordsBetween } from '../src/cms/history/differences.js';

const reader = { tree: (markdown) => markdownToMdast(markdown, { features: markdownFeatures, position: true }) };

// A post's form, much as the configuration gives it, groups and all.
const FIELDS = [
  { name: 'group-name', widget: 'konzilo-group', label: 'Name and address', fields: [
    { name: 'title', widget: 'string', label: 'Working name' },
    { name: 'slug', widget: 'konzilo-slug', label: 'Slug' },
  ] },
  { name: 'group-status', widget: 'konzilo-group', label: 'Status and date', fields: [
    { name: 'status', widget: 'select', label: 'Status', options: [{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }] },
    { name: 'date', widget: 'datetime', label: 'Date' },
  ] },
  { name: 'image', widget: 'konzilo-image', label: 'Featured image' },
  { name: 'topics', widget: 'relation', label: 'Topics', multiple: true },
  { name: 'body', widget: 'konzilo-body', label: 'Body' },
  { name: 'teaser', widget: 'object', label: 'Teaser', fields: [
    { name: 'headline', widget: 'konzilo-text', label: 'Headline' },
  ] },
  { name: 'otherAddresses', widget: 'list', label: 'other addresses', fields: [
    { name: 'address', widget: 'string', label: 'Path' },
  ] },
];

const BEFORE = {
  'group-name.title': 'The quiet harbour',
  'group-name.slug': 'quiet-harbour',
  'group-status.status': 'draft',
  'group-status.date': '2026-11-01T08:00:00Z',
  'image.src': '/media/harbour.jpg',
  'image.alt': 'A harbour',
  'topics.0': 'aaa',
  'topics.1': 'bbb',
  'topics.2': 'ccc',
  body: 'First paragraph.',
  'teaser.headline': 'Same',
  'teaser.colour': 'blue',
  oldField: 'held this',
};

test('marks text word by word, with what is alike, removed and added', () => {
  assert.deepEqual(wordsBetween('The quiet harbour at night', 'The calm harbour at night'), [
    { change: 'alike', text: 'The ' },
    { change: 'removed', text: 'quiet' },
    { change: 'added', text: 'calm' },
    { change: 'alike', text: ' harbour at night' },
  ]);
  assert.deepEqual(wordsBetween('same', 'same'), [{ change: 'alike', text: 'same' }]);
  assert.deepEqual(wordsBetween('', 'new words'), [{ change: 'added', text: 'new words' }]);
});

test('marks a list\'s items added, removed and moved', () => {
  assert.deepEqual(itemsBetween(['a', 'b', 'c', 'd'], ['b', 'c', 'a', 'e']), [
    { change: 'alike', item: 'b' },
    { change: 'alike', item: 'c' },
    { change: 'moved', item: 'a' },
    { change: 'removed', item: 'd' },
    { change: 'added', item: 'e' },
  ]);
  assert.deepEqual(itemsBetween([{ x: 1 }], [{ x: 1 }]), [{ change: 'alike', item: { x: 1 } }], 'items are the same by what they hold');
});

test('compares the body block by block, marks a block\'s words, and one changed only in form, shown both ways', () => {
  const before = 'A quiet harbour at night.\n\nSee [the meadow](/aaa/) here.\n\nKept as it was.\n\nRemoved block.\n';
  const after = 'A calm harbour at night.\n\nSee [the meadow](/bbb/) here.\n\nKept as it was.\n\n## Added heading\n';
  const blocks = bodiesBetween(before, after, reader);
  assert.deepEqual(blocks.map(({ change }) => change), ['words', 'form', 'alike', 'removed', 'added']);
  assert.deepEqual(blocks[0].parts.filter(({ change }) => change !== 'alike').map(({ change, text }) => [change, text]), [['removed', 'quiet'], ['added', 'calm']]);
  assert.equal(blocks[1].before, 'See [the meadow](/aaa/) here.');
  assert.equal(blocks[1].after, 'See [the meadow](/bbb/) here.');
  assert.equal(blocks[3].before, 'Removed block.');
  assert.equal(blocks[4].after, '## Added heading');
  assert.equal(bodiesBetween('Only **bold** now.', 'Only bold now.', reader)[0].change, 'form', 'formatting alone is a change in form');
});

test('compares two revisions field by field under the form\'s labels, alike fields marked, a vanished field named with what it held', () => {
  const after = {
    ...BEFORE,
    'group-name.title': 'The calm harbour',
    'image.src': '/media/meadow.jpg',
    'topics.0': 'bbb',
    'topics.1': 'aaa',
    'topics.2': 'ddd',
    'teaser.colour': undefined,
    oldField: undefined,
  };
  for (const key of Object.keys(after)) if (after[key] === undefined) delete after[key];
  const rows = compareForms({ fields: FIELDS, before: BEFORE, after });
  const byPath = Object.fromEntries(rows.map((row) => [row.path, row]));

  assert.deepEqual(byPath['group-name.title'].labels, ['Name and address', 'Working name']);
  assert.equal(byPath['group-name.title'].kind, 'text');
  assert.equal(byPath['group-name.title'].change, 'changed');
  assert.deepEqual(byPath['group-name.title'].parts.filter(({ change }) => change !== 'alike').map(({ text }) => text), ['quiet', 'calm']);

  assert.equal(byPath['group-name.slug'].change, 'alike');
  assert.equal(byPath['group-status.status'].change, 'alike');

  assert.equal(byPath.image.kind, 'image');
  assert.equal(byPath.image.change, 'changed');
  assert.deepEqual(byPath.image.before, { src: '/media/harbour.jpg', alt: 'A harbour' });
  assert.deepEqual(byPath.image.after, { src: '/media/meadow.jpg', alt: 'A harbour' });

  assert.equal(byPath.topics.kind, 'list');
  assert.deepEqual(byPath.topics.items, [
    { change: 'alike', item: 'bbb' },
    { change: 'moved', item: 'aaa' },
    { change: 'removed', item: 'ccc' },
    { change: 'added', item: 'ddd' },
  ]);

  assert.equal(byPath.body.kind, 'body');
  assert.equal(byPath.body.change, 'alike');
  assert.deepEqual(byPath['teaser.headline'].labels, ['Teaser', 'Headline']);

  assert.equal(byPath['teaser.colour'].kind, 'vanished');
  assert.deepEqual(byPath['teaser.colour'].labels, ['Teaser', 'colour']);
  assert.equal(byPath['teaser.colour'].before, 'blue');
  assert.equal(byPath['teaser.colour'].after, undefined);
  assert.equal(byPath.oldField.kind, 'vanished');
  assert.deepEqual(byPath.oldField.labels, ['oldField']);
  assert.equal(byPath.oldField.before, 'held this');

  assert.ok(!Object.hasOwn(byPath, 'otherAddresses') || byPath.otherAddresses.change === 'alike', 'a list empty on both sides is alike');
  assert.deepEqual(rows.map(({ path }) => path).slice(0, 4), ['group-name.title', 'group-name.slug', 'group-status.status', 'group-status.date'], 'in the form\'s order');
});

test('compares a list of objects by each item whole', () => {
  const rows = compareForms({
    fields: FIELDS,
    before: { 'otherAddresses.0.address': '/old/' },
    after: { 'otherAddresses.0.address': '/old/', 'otherAddresses.1.address': '/new/' },
  });
  const row = rows.find(({ path }) => path === 'otherAddresses');
  assert.deepEqual(row.items.map(({ change, item }) => [change, item]), [['alike', { address: '/old/' }], ['added', { address: '/new/' }]]);
});

test('restores only the fields the form has today, and keeps the status and the date as they are', () => {
  const current = {
    'group-name.title': 'Now',
    'group-name.slug': 'now',
    'group-status.status': 'published',
    'group-status.date': '2026-11-20T08:00:00Z',
    body: 'Now.',
    'topics.0': 'zzz',
    unknown: 'kept',
  };
  assert.deepEqual(restoredValues({ fields: FIELDS, current, revision: BEFORE }), {
    'group-name.title': 'The quiet harbour',
    'group-name.slug': 'quiet-harbour',
    'group-status.status': 'published',
    'group-status.date': '2026-11-20T08:00:00Z',
    'image.src': '/media/harbour.jpg',
    'image.alt': 'A harbour',
    'topics.0': 'aaa',
    'topics.1': 'bbb',
    'topics.2': 'ccc',
    body: 'First paragraph.',
    'teaser.headline': 'Same',
    unknown: 'kept',
  });
});

test('names a post\'s status by its option\'s label, and a form with no status by none', () => {
  assert.equal(statusOf({ fields: FIELDS, values: BEFORE }), 'Draft');
  assert.equal(statusOf({ fields: [{ name: 'title', widget: 'string' }], values: { title: 'x' } }), null);
});

test('keeps only the post\'s own status and date as they are, and restores a field so named within another', () => {
  const fields = [
    { name: 'group-status', widget: 'konzilo-group', label: 'Status and date', fields: [
      { name: 'status', widget: 'select', label: 'Status' },
      { name: 'date', widget: 'datetime', label: 'Date' },
    ] },
    { name: 'event', widget: 'object', label: 'Event', fields: [
      { name: 'date', widget: 'datetime', label: 'Date' },
      { name: 'status', widget: 'string', label: 'Status' },
    ] },
  ];
  const current = { 'group-status.status': 'published', 'group-status.date': '2026-11-20T08:00:00Z', 'event.date': '2026-12-01T18:00:00Z', 'event.status': 'Sold out' };
  const revision = { 'group-status.status': 'draft', 'group-status.date': '2026-11-01T08:00:00Z', 'event.date': '2026-11-15T18:00:00Z', 'event.status': 'Open' };
  assert.deepEqual(restoredValues({ fields, current, revision }), {
    'group-status.status': 'published',
    'group-status.date': '2026-11-20T08:00:00Z',
    'event.date': '2026-11-15T18:00:00Z',
    'event.status': 'Open',
  });
  const notAPost = [{ name: 'event', widget: 'object', label: 'Event', fields: [{ name: 'status', widget: 'string' }, { name: 'date', widget: 'datetime' }] }];
  assert.deepEqual(restoredValues({ fields: notAPost, current: { 'event.status': 'a', 'event.date': 'x' }, revision: { 'event.status': 'b', 'event.date': 'y' } }), { 'event.status': 'b', 'event.date': 'y' });
});
