// A post made from an incoming feed's item, as its source file (ADR 0079): published, with the
// item's title, its text as the type's body elements, its date, or the moment it was first read
// where it gives none or gives one ahead, and the address of the original; a slug made from its
// title as the editor makes one, kept when the title changes; the item's ID and what tells that it
// has changed; and an article's main headline, which an article requires, its title. Released, it
// is the same file without what marks it as the feed's.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { feedPostFile, itemVersion, releasedFile } from '../src/feeds/post.js';
import { siteDescription } from '../src/site-description.js';

const site = siteDescription({
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph', 'list'] },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'], fields: { date: {} } },
  },
});

const ITEM = { id: 'release-2', title: 'Harbour opens: lanterns lit', text: { html: '<p>The text.</p><ul><li>One</li></ul>' }, date: '2026-11-25T09:00:00Z', link: 'https://news.example.com/harbour' };
const NOW = '2026-11-25T09:04:00Z';

describe('a post made from an item', () => {
  test('is published, with the item\'s title, date, text and link, its slug made from its title, and the item\'s ID and version', () => {
    const made = feedPostFile(ITEM, { site, type: site.types.note, seen: NOW, now: NOW });
    assert.equal(made.slug, 'harbour-opens-lanterns-lit');
    assert.equal(made.date, '2026-11-25T09:00:00Z');
    assert.equal(made.version, itemVersion(ITEM));
    assert.equal(made.text, [
      '---',
      'title: "Harbour opens: lanterns lit"',
      'slug: "harbour-opens-lanterns-lit"',
      'status: published',
      'date: 2026-11-25T09:00:00Z',
      'originalAddress: "https://news.example.com/harbour"',
      `feed: {"item":"release-2","version":"${itemVersion(ITEM)}","dropped":["list"]}`,
      '---',
      '',
      'The text.',
      '',
      'One',
      '',
    ].join('\n'));
  });

  test('gives an article its main headline, which an article requires, as its title', () => {
    const { text } = feedPostFile({ ...ITEM, text: { html: '<p>Text.</p>' } }, { site, type: site.types.article, seen: NOW, now: NOW });
    assert.match(text, /^date: 2026-11-25T09:00:00Z\nheadline: "Harbour opens: lanterns lit"\noriginalAddress:/m);
    assert.match(text, /^feed: \{"item":"release-2","version":"[0-9a-f]{64}"\}$/m);
  });

  test('is dated when it was first read, where its item gives no date, or one ahead', () => {
    assert.equal(feedPostFile({ ...ITEM, date: null }, { site, type: site.types.note, seen: '2026-11-20T08:00:00Z', now: NOW }).date, '2026-11-20T08:00:00Z');
    assert.equal(feedPostFile({ ...ITEM, date: '2026-12-01T00:00:00Z' }, { site, type: site.types.note, seen: '2026-11-20T08:00:00Z', now: NOW }).date, '2026-11-20T08:00:00Z');
  });

  test('keeps the slug it is given, as a corrected item\'s post does', () => {
    const made = feedPostFile({ ...ITEM, title: 'Harbour opens late' }, { site, type: site.types.note, seen: NOW, now: NOW, slug: 'harbour-opens-lanterns-lit' });
    assert.equal(made.slug, 'harbour-opens-lanterns-lit');
    assert.match(made.text, /^title: "Harbour opens late"\nslug: "harbour-opens-lanterns-lit"$/m);
  });

  test('has no address of the original where its item gives none', () => {
    assert.doesNotMatch(feedPostFile({ ...ITEM, link: null }, { site, type: site.types.note, seen: NOW, now: NOW }).text, /originalAddress/);
  });

  test('is told changed by its item\'s title, text, date or link, and by nothing else', () => {
    const version = itemVersion(ITEM);
    for (const change of [{ title: 'Other' }, { text: { html: '<p>Other.</p>' } }, { date: '2026-11-25T10:00:00Z' }, { link: 'https://news.example.com/other' }]) {
      assert.notEqual(itemVersion({ ...ITEM, ...change }), version, JSON.stringify(change));
    }
    assert.equal(itemVersion({ ...ITEM, id: 'another' }), version);
  });
});

describe('a post released when its feed is removed', () => {
  test('keeps everything but what marks it as the feed\'s', () => {
    const { text } = feedPostFile(ITEM, { site, type: site.types.note, seen: NOW, now: NOW });
    const released = releasedFile(text);
    assert.equal(released, text.replace(/^feed: .*\n/m, ''));
  });

  test('is as it was where nothing marks it', () => {
    const text = '---\ntitle: "Mine"\nstatus: draft\n---\n\nText.\n';
    assert.equal(releasedFile(text), text);
  });
});
