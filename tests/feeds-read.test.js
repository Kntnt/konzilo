// An incoming feed read (ADR 0079): RSS 2.0 and Atom, each item with what a post is made of, its
// ID in the feed, its title, its text, its date and its link, and an answer that is no feed told
// apart from one that holds no items.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { readFeed } from '../src/feeds/read.js';

const ADDRESS = 'https://news.example.com/feed.xml';

describe('an RSS 2.0 feed', () => {
  test('gives each item its ID, title, full content, date and link, in the feed\'s order', () => {
    const read = readFeed(`<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>News</title>
          <link>https://news.example.com/</link>
          <item>
            <title>Harbour opens &amp; lanterns lit</title>
            <link>https://news.example.com/harbour</link>
            <guid isPermaLink="false">release-2</guid>
            <pubDate>Wed, 25 Nov 2026 10:00:00 +0100</pubDate>
            <description>A summary.</description>
            <content:encoded><![CDATA[<p>The <b>whole</b> text.</p>]]></content:encoded>
          </item>
          <item>
            <title>Quay closed</title>
            <link>/quay</link>
            <description>&lt;p&gt;Only a summary.&lt;/p&gt;</description>
          </item>
        </channel>
      </rss>`, ADDRESS);
    assert.deepEqual(read, {
      items: [
        { id: 'release-2', title: 'Harbour opens & lanterns lit', text: { html: '<p>The <b>whole</b> text.</p>' }, date: '2026-11-25T09:00:00Z', link: 'https://news.example.com/harbour' },
        { id: 'https://news.example.com/quay', title: 'Quay closed', text: { html: '<p>Only a summary.</p>' }, date: null, link: 'https://news.example.com/quay' },
      ],
    });
  });

  test('takes an item\'s date from Dublin Core where it has no pubDate, and leaves out one that cannot be read', () => {
    const read = readFeed(`<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel>
      <item><title>One</title><guid>a</guid><dc:date>2026-11-20T08:30:00Z</dc:date></item>
      <item><title>Two</title><guid>b</guid><pubDate>someday</pubDate></item>
    </channel></rss>`, ADDRESS);
    assert.deepEqual(read.items.map(({ id, date }) => [id, date]), [['a', '2026-11-20T08:30:00Z'], ['b', null]]);
  });

  test('keeps a link only where it is a whole http or https address, and an item with neither ID nor link out', () => {
    const read = readFeed(`<rss version="2.0"><channel>
      <item><title>Mail</title><guid>c</guid><link>mailto:press@example.com</link></item>
      <item><title>Nowhere</title></item>
    </channel></rss>`, ADDRESS);
    assert.deepEqual(read.items, [{ id: 'c', title: 'Mail', text: { html: '' }, date: null, link: null }]);
  });

  test('gives an item without a title the start of its text, and its markup as text', () => {
    const read = readFeed(`<rss version="2.0"><channel>
      <item><guid>d</guid><description>&lt;p&gt;The board met on Monday and agreed on everything that was on the long agenda of the evening, and more.&lt;/p&gt;</description></item>
      <item><guid>e</guid><title>Use &lt;b&gt; for bold</title></item>
    </channel></rss>`, ADDRESS);
    assert.equal(read.items[0].title, 'The board met on Monday and agreed on everything that was on the long agenda of…');
    assert.equal(read.items[1].title, 'Use for bold');
  });

  test('holds no items where its channel has none', () => {
    assert.deepEqual(readFeed('<rss version="2.0"><channel><title>Quiet</title></channel></rss>', ADDRESS), { items: [] });
  });
});

describe('an Atom feed', () => {
  test('gives each entry its ID, title, content, published moment and alternate link', () => {
    const read = readFeed(`<?xml version="1.0" encoding="utf-8"?>
      <feed xmlns="http://www.w3.org/2005/Atom" xml:base="https://news.example.com/">
        <title>News</title>
        <id>urn:news</id>
        <entry>
          <title type="html">Harbour &lt;em&gt;opens&lt;/em&gt;</title>
          <id>urn:release:1</id>
          <link rel="self" href="https://news.example.com/api/1"/>
          <link href="releases/1"/>
          <published>2026-11-24T08:00:00+01:00</published>
          <updated>2026-11-25T08:00:00Z</updated>
          <summary>A summary.</summary>
          <content type="html">&lt;p&gt;The text.&lt;/p&gt;</content>
        </entry>
        <entry>
          <title>Quay</title>
          <id>urn:release:2</id>
          <link rel="alternate" type="text/html" href="https://news.example.com/releases/2"/>
          <updated>2026-11-25T09:00:00Z</updated>
          <content type="xhtml"><div xmlns="http://www.w3.org/1999/xhtml"><p>Some <strong>strong</strong> words &amp; more.</p></div></content>
        </entry>
        <entry>
          <title>Plain</title>
          <id>urn:release:3</id>
          <summary type="text">Line one &lt;not a tag&gt;</summary>
        </entry>
      </feed>`, ADDRESS);
    assert.deepEqual(read, {
      items: [
        { id: 'urn:release:1', title: 'Harbour opens', text: { html: '<p>The text.</p>' }, date: '2026-11-24T07:00:00Z', link: 'https://news.example.com/releases/1' },
        { id: 'urn:release:2', title: 'Quay', text: { html: '<p>Some <strong>strong</strong> words &amp; more.</p>' }, date: '2026-11-25T09:00:00Z', link: 'https://news.example.com/releases/2' },
        { id: 'urn:release:3', title: 'Plain', text: { plain: 'Line one <not a tag>' }, date: null, link: null },
      ],
    });
  });
});

describe('an answer that is no feed', () => {
  for (const [what, text] of [
    ['an HTML page', '<!doctype html><html><head><title>News</title></head><body><p>Hello</p></body></html>'],
    ['another kind of XML', '<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://example.com/</loc></url></urlset>'],
    ['XML cut short', '<rss version="2.0"><channel><item><title>Half'],
    ['nothing', ''],
    ['JSON', '{"items": []}'],
  ]) {
    test(`is told apart: ${what}`, () => {
      assert.deepEqual(readFeed(text, ADDRESS), { problem: 'not-a-feed' });
    });
  }
});
