// A post's source file in the editor's field groups (ADR 0071): read into the groups the form
// shows, and written back with its fields flat, as content-format.md has them, whatever the
// groups.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cmsConfig } from '../src/cms/config.js';
import { formValues, sourceFormat } from '../src/cms/groups/source.js';
import { siteDescription } from '../src/site-description.js';

const description = siteDescription(JSON.parse(readFileSync(fileURLToPath(new URL('../site-template/files/site-description.json', import.meta.url)), 'utf8')));
const { groups: { 'yaml-frontmatter': groups } } = cmsConfig(description, { forgejo: 'http://git', repository: 'a/b', clientId: 'c', site: 'http://site' }).konzilo;
const format = sourceFormat(groups);

const SOURCE = `---
title: Quiet harbours
slug: quiet-harbours
status: published
date: 2026-03-01T09:00:00.000Z
headline: Quiet harbours and the lantern
topics:
  - 5f2a9c1e0b3d
search:
  noindex: true
---

The harbour at dawn.
`;

// What Sveltia's own formatter is given, which is what the file then holds.
const written = async (data) => {
  let given = null;
  await format.toFile(data, { serialize: async (fields) => { given = fields; return ''; } });
  return given;
};

test('reads a source file into the groups the form shows, with its body below', () => {
  const data = format.fromFile(SOURCE);
  assert.deepEqual(data['group-name'], { title: 'Quiet harbours', slug: 'quiet-harbours' });
  assert.deepEqual(data['group-status'], { status: 'published', date: '2026-03-01T09:00:00.000Z' });
  assert.deepEqual(data['group-headline'], { headline: 'Quiet harbours and the lantern' });
  assert.deepEqual(data['group-terms'], { topics: ['5f2a9c1e0b3d'] });
  assert.deepEqual(data.search, { noindex: true });
  assert.equal(data.body, 'The harbour at dawn.');
  assert.deepEqual(Object.keys(data), ['group-name', 'group-status', 'group-headline', 'group-terms', 'search', 'body'], 'each group in its first field\'s place, and no field twice');
});

test('writes the fields flat, as the groups hold them now, in the form\'s order, and nothing of a group', async () => {
  // As Sveltia gives a post to be written: the form's fields in its order, then the rest, which
  // here are fields of the groups, as a file written otherwise might hold them beside the groups.
  const flat = await written({
    'group-name': { title: 'Calm harbours', breadcrumb: 'Harbours', slug: 'calm-harbours' },
    'group-status': { status: 'published', date: '2026-03-01T09:00:00.000Z' },
    'group-terms': { topics: ['5f2a9c1e0b3d'] },
    'group-headline': { eyebrow: '', headline: 'Calm harbours', subheadline: '' },
    search: { noindex: true },
    body: 'The harbour at dawn.',
    date: '2026-03-01T09:00:00.000Z',
    headline: 'Quiet harbours and the lantern',
    slug: 'quiet-harbours',
    status: 'published',
    title: 'Quiet harbours',
    topics: ['5f2a9c1e0b3d'],
  });
  assert.deepEqual(Object.entries(flat), Object.entries({
    title: 'Calm harbours',
    breadcrumb: 'Harbours',
    slug: 'calm-harbours',
    status: 'published',
    date: '2026-03-01T09:00:00.000Z',
    topics: ['5f2a9c1e0b3d'],
    headline: 'Calm harbours',
    search: { noindex: true },
    body: 'The harbour at dawn.',
  }));
});

test('leaves a field emptied in its group out of the file, as an empty optional field is', async () => {
  const data = format.fromFile(SOURCE);
  data['group-terms'] = {};
  data['group-status'] = { status: 'draft', date: '' };
  const flat = await written(data);
  assert.equal(Object.hasOwn(flat, 'topics'), false);
  assert.equal(Object.hasOwn(flat, 'date'), false);
  assert.equal(flat.status, 'draft');
});

test('reads a file with no front matter as a body alone, and one with a text that is all front matter as no body', () => {
  assert.deepEqual(format.fromFile('Just words.'), { body: 'Just words.' });
  assert.deepEqual(format.fromFile('---\ntitle: Only a title\n---'), { 'group-name': { title: 'Only a title' }, body: undefined });
});

test('shows the rest of the editor a post\'s values flat, as they are now', () => {
  const data = format.fromFile(SOURCE);
  data['group-name'] = { title: 'Calm harbours', breadcrumb: '', slug: 'calm-harbours' };
  const values = formValues(data, groups);
  assert.equal(values.title, 'Calm harbours');
  assert.equal(values.breadcrumb, '');
  assert.equal(values.headline, 'Quiet harbours and the lantern');
  assert.equal(Object.keys(values).some((key) => key.startsWith('group-')), false);
});

// A site's own fields on a built-in type are a group of their own in the form. The built-in types'
// files are read in one format and a type of the site's own's in another, so a field of that name
// on a type of the site's own stays where it is (ADR 0071).
test('reads a site\'s own fields into their group in an article\'s file, leaves a field of that name in a file of the site\'s own type where it is, and writes both flat', async () => {
  const declared = JSON.parse(readFileSync(fileURLToPath(new URL('../site-template/files/site-description.json', import.meta.url)), 'utf8'));
  declared.types.article.fields = { rating: { label: 'Rating', type: 'integer', control: 'number' } };
  declared.types.review = { label: 'Review', plural: 'Reviews', collection: 'reviews', address: '/reviews/{slug}/', elements: ['paragraph'], fields: { rating: { label: 'Stars', type: 'integer', control: 'number' }, verdict: { label: 'Verdict', type: 'string', control: 'text' } } };
  const made = cmsConfig(siteDescription(declared), { forgejo: 'http://git', repository: 'a/b', clientId: 'c', site: 'http://site' });
  const formatOf = (collection) => sourceFormat(made.konzilo.groups[made.collections.find((one) => one.name === collection).format]);
  const written = async (format, data) => {
    let given = null;
    await format.toFile(data, { serialize: async (fields) => { given = fields; return ''; } });
    return given;
  };

  const article = formatOf('articles').fromFile(SOURCE.replace('headline:', 'rating: 4\nheadline:'));
  assert.deepEqual(article['group-own'], { rating: 4 });
  assert.equal(Object.hasOwn(article, 'rating'), false);
  const fromArticle = await written(formatOf('articles'), { ...article, 'group-own': { rating: 5 } });
  assert.equal(fromArticle.rating, 5);
  assert.equal(Object.hasOwn(fromArticle, 'group-own'), false);

  const review = formatOf('reviews').fromFile('---\ntitle: A fair\nslug: a-fair\nstatus: draft\nrating: 4\nverdict: Worth the trip\n---\n\nThe fair.\n');
  assert.equal(review.rating, 4);
  assert.equal(Object.hasOwn(review, 'group-own'), false);
  assert.deepEqual(review['group-name'], { title: 'A fair', slug: 'a-fair' });
  const fromReview = await written(formatOf('reviews'), { ...review, rating: 5 });
  assert.deepEqual([fromReview.rating, fromReview.title, fromReview.verdict], [5, 'A fair', 'Worth the trip']);
});
