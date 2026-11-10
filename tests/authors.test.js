// An article's authors, in the order its editor gave them: the intake keeps the order the
// source holds, each author once, while every other terms field stays sorted.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { siteDescription } from '../src/site-description.js';
import { run, sourcePost, written } from './lib/intake.js';

const declared = {
  language: 'en_GB',
  images: { smallestWidth: 1, displayWidth: 1 },
  types: {
    article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
  },
};
const site = siteDescription(declared);

// Two authors, Ada Lind and Ben Holm, and two topics.
const terms = {
  'authors/adaadaadaada.json': { name: 'Ada Lind', slug: 'ada-lind', description: 'Keeps the harbour\'s history.' },
  'authors/benbenbenben.json': { name: 'Ben Holm', slug: 'ben-holm' },
  'topics/harbourharbo.json': { name: 'Harbours', slug: 'harbours' },
  'topics/lanternlante.json': { name: 'Lanterns', slug: 'lanterns' },
};
const article = (fields) => run({ 'articles/111111111111.md': sourcePost({ title: 'Harbour lights', slug: 'harbour-lights', status: 'published', headline: 'Harbour lights', ...fields }, 'Text.'), ...terms }, site);
const fileOf = (result) => written(result)['articles/harbour-lights.md'];

describe('the intake', () => {
  test('writes an article\'s authors in the order the source gives them, each once, and its topics sorted', () => {
    const result = article({ authors: ['benbenbenben', 'adaadaadaada', 'benbenbenben'], topics: ['lanternlante', 'harbourharbo'] });
    assert.deepEqual(result.refusals, []);
    assert.match(fileOf(result), /\nauthors: \["ben-holm","ada-lind"\]\n/);
    assert.match(fileOf(result), /\ntopics: \["harbours","lanterns"\]\n/);
    const other = article({ authors: ['adaadaadaada', 'benbenbenben'], topics: ['harbourharbo', 'lanternlante'] });
    assert.match(fileOf(other), /\nauthors: \["ada-lind","ben-holm"\]\n/);
    assert.match(fileOf(other), /\ntopics: \["harbours","lanterns"\]\n/);
  });
});
