// The address a post's form shows, from its values as they stand: its slug, its date and the
// term its type's address holds, whose slug and parents are read from the source repository's
// term files against a stand-in for Forgejo.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formAddress, termPathReader } from '../src/cms/parts/address.js';
import { termIdOf } from '../src/format/addresses.js';
import { run, sourcePost } from './lib/intake.js';

const encoded = (text) => Buffer.from(text).toString('base64');

// Forgejo's contents of the source repository, each file by its path, as an editor asks for them.
function forgejo(files) {
  const asked = [];
  const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const get = async (url) => {
    const path = decodeURIComponent(new URL(url).pathname.slice('/api/v1/repos/org/source/contents/'.length));
    asked.push(path);
    if (!Object.hasOwn(files, path)) return answer({ message: 'not found' }, 404);
    return answer({ type: 'file', path, content: encoded(`${JSON.stringify(files[path])}\n`), encoding: 'base64' });
  };
  return { asked, get };
}

const SITE = 'https://example.com/';

describe('the address a post\'s form shows', () => {
  test('follows its date, in UTC, and its term as they stand, and is none while a value is missing', () => {
    const data = { slug: 'lanterns', date: '2026-03-07T23:30:00Z', category: 'ptsdptsdptsd' };
    assert.equal(formAddress(SITE, '/{year}/{month}/{day}/{slug}/', data), 'https://example.com/2026/03/07/lanterns/');
    assert.equal(formAddress(SITE, '/{year}/{month}/{day}/{slug}/', { ...data, date: '2026-04-01T08:00:00Z' }), 'https://example.com/2026/04/01/lanterns/');
    assert.equal(formAddress(SITE, '/{category}/{slug}/', data, { terms: { category: 'health/ptsd' } }), 'https://example.com/health/ptsd/lanterns/');
    assert.equal(formAddress(SITE, '/{category}/{slug}/', data), '');
    assert.equal(formAddress(SITE, '/sv/{year}/{slug}/', data), 'https://example.com/sv/2026/lanterns/');
    assert.equal(formAddress(SITE, '/{slug}/', { slug: 'lanterns', parent: 'aaaaaaaaaaaa' }), '', 'a post below another');
    assert.equal(formAddress(SITE, '/{year}/{slug}/', { slug: 'lanterns' }, { now: new Date('2027-01-02T00:00:00Z') }), 'https://example.com/2027/lanterns/', 'a post with no date yet, from now');
  });

  // The intake dates a post without a date of its own by the moment it first took it, which the
  // form cannot know but by the address the current release has for the post.
  test('dates a live post without a date of its own as its live address does, and follows its slug and term from there', () => {
    const now = new Date('2027-01-02T00:00:00Z');
    const live = '/2025/03/lanterns/';
    assert.equal(formAddress(SITE, '/{year}/{month}/{slug}/', { slug: 'lanterns' }, { live, now }), 'https://example.com/2025/03/lanterns/');
    assert.equal(formAddress(SITE, '/{year}/{month}/{slug}/', { slug: 'lamps' }, { live, now }), 'https://example.com/2025/03/lamps/');
    assert.equal(formAddress(SITE, '/{year}/{month}/{day}/{slug}/', { slug: 'lanterns' }, { live: '/2025/03/07/lanterns/', now }), 'https://example.com/2025/03/07/lanterns/');
    assert.equal(formAddress(SITE, '/{category}/{year}/{slug}/', { slug: 'lanterns' }, { terms: { category: 'news' }, live: '/health/ptsd/2025/lanterns/', now }), 'https://example.com/news/2025/lanterns/', 'its term moved');
    assert.equal(formAddress(SITE, '/sv/{year}/{slug}/', { slug: 'lyktor' }, { live: '/sv/2025/lyktor/', now }), 'https://example.com/sv/2025/lyktor/');
    assert.equal(formAddress(SITE, '/{year}/{slug}/', { slug: 'lanterns', date: '2026-05-01T00:00:00Z' }, { live: '/2025/lanterns/', now }), 'https://example.com/2026/lanterns/', 'its own date first');
    assert.equal(formAddress(SITE, '/{year}/{slug}/', { slug: 'lanterns' }, { live: '/lanterns/', now }), 'https://example.com/2027/lanterns/', 'a live address its type\'s address cannot give');
    assert.equal(formAddress(SITE, '/{year}/{slug}/', { slug: 'lanterns' }, { live: null, now }), 'https://example.com/2027/lanterns/', 'a draft never taken');
  });

  test('reads a term\'s slug and its parents\' from their files, a slug made from a name where a file gives none', async () => {
    const stand = forgejo({
      'categories/healthhealth.json': { name: 'Health and care' },
      'categories/ptsdptsdptsd.json': { name: 'PTSD', slug: 'ptsd', parent: 'healthhealth' },
      'categories/sv-SE/newsnewsnews.json': { name: 'Nyheter', slug: 'nyheter' },
    });
    const pathOf = termPathReader({ api: 'http://git/api/v1', repository: 'org/source', branch: 'main', credential: () => 'token mine', get: stand.get });
    assert.equal(await pathOf('categories', 'ptsdptsdptsd'), 'health-and-care/ptsd');
    assert.equal(await pathOf('categories', 'newsnewsnews', 'sv-SE'), 'nyheter');
    assert.equal(await pathOf('categories', 'gonegonegone'), null);
    assert.equal(await pathOf('categories', null), null);
    const asked = stand.asked.length;
    await pathOf('categories', 'ptsdptsdptsd');
    assert.equal(stand.asked.length, asked, 'each file read once a while');
  });

  // The site is where the intake puts a post, so the form makes a term's missing slug as the
  // intake does, whatever letters its name holds.
  test('gives the address the site gives, for a term whose file has a name and no slug', async () => {
    const declared = {
      language: 'en_GB',
      images: { smallestWidth: 400, displayWidth: 1280 },
      types: { story: { label: 'Story', plural: 'Stories', collection: 'stories', address: '/{category}/{slug}/', elements: ['paragraph'], fields: { category: { taxonomy: 'category', most: 1, required: true } } } },
      taxonomies: { category: { label: 'Category', plural: 'Categories', collection: 'categories' } },
    };
    for (const name of ['Straße', 'Sjöfart_och_hamn']) {
      const term = { name };
      const published = run({ 'stories/aaaaaaaaaaaa.md': sourcePost({ title: 'Lanterns', slug: 'lanterns', status: 'published', category: 'termtermterm' }), 'categories/termtermterm.json': term }, declared);
      assert.deepEqual(published.refusals, [], name);
      const pathOf = termPathReader({ api: 'http://git/api/v1', repository: 'org/source', branch: 'main', credential: () => 'token mine', get: forgejo({ 'categories/termtermterm.json': term }).get });
      const shown = formAddress(SITE, '/{category}/{slug}/', { slug: 'lanterns' }, { terms: { category: await pathOf('categories', 'termtermterm') } });
      assert.equal(new URL(shown).pathname, published.ledger.posts.aaaaaaaaaaaa.address, name);
    }
  });

  test('takes the one term a field holds, as a list or alone, or as Astro\'s reference to it', () => {
    assert.equal(termIdOf(['aaaaaaaaaaaa']), 'aaaaaaaaaaaa');
    assert.equal(termIdOf('aaaaaaaaaaaa'), 'aaaaaaaaaaaa');
    assert.equal(termIdOf([{ id: 'sv-SE/news', collection: 'categories' }]), 'sv-SE/news');
    assert.equal(termIdOf([]), null);
    assert.equal(termIdOf(['']), null);
    assert.equal(termIdOf(undefined), null);
  });
});
