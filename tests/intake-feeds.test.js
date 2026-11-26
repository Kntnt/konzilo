// A post made from an incoming feed's item, through the intake (ADR 0079, ADR 0008): published as
// the feed reader pushed it, with the address of the original for a template and a warning of what
// its type could not hold; changed, unmarked or deleted by anyone else, it keeps the version the
// feed reader last left, as a Reviewer's change does; and released by the feed reader, as its feed
// is removed, it is a post like any other. A trigger that waits for a post of its type releases its
// post in the build that publishes it (ADR 0076).

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { FEED_READER } from '../src/format/feed-post.js';
import { feedPostFile } from '../src/feeds/post.js';
import { siteDescription } from '../src/site-description.js';
import { run, sourcePost, written } from './lib/intake.js';

const declared = {
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
    page: { collection: 'pages', address: '/pages/{slug}/', elements: ['paragraph'] },
  },
};
const site = siteDescription(declared);

const PATH = 'articles/f00d00000001.md';
const ITEM = { id: 'release-1', title: 'Harbour opens', text: { html: '<p>The harbour opens.</p><ul><li>At dawn</li></ul>' }, date: '2026-11-03T09:00:00Z', link: 'https://news.example.com/harbour' };
const fromFeed = (item = ITEM) => feedPostFile(item, { site, type: site.types.article, seen: '2026-11-03T09:01:00Z', now: '2026-11-03T09:01:00Z' }).text;
const by = (login) => ({ by: login, admin: false, reviewer: false, feedReader: login === FEED_READER });
const pushedBy = (login, ...paths) => Object.fromEntries(paths.map((path) => [path, by(login)]));
const stateOf = (result, file) => result.posts.find((one) => one.file === file)?.state;

// A history of builds, each from the ledger the last left.
function builds(...steps) {
  let ledger = null;
  return steps.map(([files, changes, options = {}]) => {
    const result = run(files, declared, { ledger, changes, ...options });
    ledger = result.ledger;
    return result;
  });
}

describe('a feed\'s post the feed reader pushed', () => {
  test('is published, with the item\'s title and date, the address of the original, and a warning of what its type could not hold', () => {
    const [result] = builds([{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)]);
    assert.deepEqual(result.refusals, []);
    assert.equal(written(result)['articles/harbour-opens.md'], [
      '---',
      'title: "Harbour opens"',
      'date: 2026-11-03T09:00:00Z',
      'modified: 2026-11-03T09:00:00Z',
      'headline: "Harbour opens"',
      'authors: []',
      'category: []',
      'topics: []',
      'originalAddress: "https://news.example.com/harbour"',
      '---',
      '',
      'The harbour opens.',
      '',
      'At dawn',
      '',
    ].join('\n'));
    const warning = result.warnings.find(({ post }) => post?.id === 'f00d00000001');
    assert.equal(warning.name, 'warning.feed-dropped');
    assert.equal(warning.file, PATH);
    assert.match(warning.message, /a list/);
  });

  test('is a feed\'s post in the ledger, for as long as its published version is', () => {
    const [result] = builds([{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)]);
    assert.equal(result.ledger.posts.f00d00000001.fromFeed, true);
  });
});

describe('a feed\'s post anyone else changed', () => {
  test('keeps the version the feed reader last left, naming who changed it', () => {
    const [, result] = builds(
      [{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)],
      [{ [PATH]: fromFeed().replace('The harbour opens.', 'The harbour opens, says an Editor.') }, pushedBy('ebba', PATH)],
    );
    assert.equal(stateOf(result, PATH), 'refused');
    assert.equal(result.refusals[0].name, 'refusal.feed-post');
    assert.deepEqual(result.refusals[0].values, { by: 'ebba' });
    assert.ok(result.keep.includes('articles/harbour-opens.md'));
    assert.equal(written(result)['articles/harbour-opens.md'], undefined);
  });

  test('keeps it where the change took away what marks it as the feed\'s', () => {
    const [, result] = builds(
      [{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)],
      [{ [PATH]: fromFeed().replace(/^feed: .*\n/m, '').replace('status: published', 'status: draft') }, pushedBy('ebba', PATH)],
    );
    assert.equal(stateOf(result, PATH), 'refused');
    assert.ok(result.keep.includes('articles/harbour-opens.md'));
  });

  test('stays on the site where anyone else deleted its file', () => {
    const [, result] = builds(
      [{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)],
      [{}, pushedBy('ebba', PATH)],
    );
    assert.equal(result.refusals[0].name, 'refusal.feed-post-gone');
    assert.ok(result.keep.includes('articles/harbour-opens.md'));
  });

  test('is refused where someone else wrote a file that says it is a feed\'s', () => {
    const [result] = builds([{ [PATH]: fromFeed() }, pushedBy('ebba', PATH)]);
    assert.equal(stateOf(result, PATH), 'refused');
    assert.deepEqual(result.refusals[0].values, { by: 'ebba' });
  });

  test('is published as it stands where the change is back at what was last accepted', () => {
    const [, result] = builds(
      [{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)],
      [{ [PATH]: fromFeed() }, pushedBy('ebba', PATH)],
    );
    assert.deepEqual(result.refusals, []);
  });
});

describe('a feed\'s post the feed reader withdrew or released', () => {
  test('goes off the site where the feed reader deleted its file', () => {
    const [, result] = builds(
      [{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)],
      [{}, pushedBy(FEED_READER, PATH)],
    );
    assert.deepEqual(result.refusals, []);
    assert.deepEqual(result.keep, []);
    assert.equal(written(result)['articles/harbour-opens.md'], undefined);
  });

  test('is a post like any other once the feed reader took away what marks it, which an Editor may then change', () => {
    const released = fromFeed().replace(/^feed: .*\n/m, '');
    const [, second, third] = builds(
      [{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)],
      [{ [PATH]: released }, pushedBy(FEED_READER, PATH)],
      [{ [PATH]: released.replace('The harbour opens.', 'The harbour opens, says an Editor.') }, pushedBy('ebba', PATH)],
    );
    assert.deepEqual(second.refusals, []);
    assert.equal(second.ledger.posts.f00d00000001.fromFeed, undefined);
    assert.deepEqual(third.refusals, []);
    assert.match(written(third)['articles/harbour-opens.md'], /says an Editor/);
    assert.match(written(third)['articles/harbour-opens.md'], /^originalAddress: "https:\/\/news\.example\.com\/harbour"$/m);
  });
});

// The feed reader's release and a change after it, both pushed before the next build: the last
// change is someone else's, but the release is among the changes since the version last accepted,
// which the command tells by `released` (bin/konzilo-intake.js).
describe('a feed\'s post the feed reader released and someone changed before the next build', () => {
  const released = fromFeed().replace(/^feed: .*\n/m, '');
  const after = (login) => ({ [PATH]: { ...by(login), admin: login === 'anna', released: true } });

  test('takes the change, by an Admin or an Editor, as a post like any other', () => {
    for (const login of ['anna', 'ebba']) {
      const [, result] = builds(
        [{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)],
        [{ [PATH]: released.replace('The harbour opens.', `The harbour opens, says ${login}.`) }, after(login)],
      );
      assert.deepEqual(result.refusals, [], login);
      assert.match(written(result)['articles/harbour-opens.md'], new RegExp(`says ${login}`));
      assert.equal(result.ledger.posts.f00d00000001.fromFeed, undefined);
    }
  });

  test('takes its file deleted', () => {
    const [, result] = builds(
      [{ [PATH]: fromFeed() }, pushedBy(FEED_READER, PATH)],
      [{}, after('ebba')],
    );
    assert.deepEqual(result.refusals, []);
    assert.deepEqual(result.keep, []);
  });
});

describe('a feed\'s post with no one known to have pushed it', () => {
  test('is not held to the feed reader in a developer\'s own checkout, which holds nothing to a role', () => {
    const [result] = builds([{ [PATH]: fromFeed() }, {}]);
    assert.deepEqual(result.refusals, []);
  });
});

describe('the address of the original', () => {
  test('is refused where it is no whole web address', () => {
    const [result] = builds([{ 'pages/aaaaaaaaaaaa.md': sourcePost({ title: 'Page', status: 'published', originalAddress: 'not an address' }, 'Text.') }, {}]);
    assert.equal(result.refusals[0].name, 'refusal.original-address');
  });
});

describe('a post waiting for a post of the feed\'s type', () => {
  test('goes out in the build that publishes the feed\'s post', () => {
    const WAITING = 'pages/bbbbbbbbbbbb.md';
    const waiting = sourcePost({ title: 'After the release', slug: 'after', status: 'scheduled', triggers: [[{ published: [[{ type: 'article' }]], since: '2026-11-02T00:00:00Z' }]] }, 'Text.');
    const [before, after] = builds(
      [{ [WAITING]: waiting }, pushedBy('ebba', WAITING)],
      [{ [WAITING]: waiting, [PATH]: fromFeed() }, { ...pushedBy('ebba', WAITING), ...pushedBy(FEED_READER, PATH) }],
    );
    assert.equal(stateOf(before, WAITING), 'waiting');
    assert.equal(stateOf(after, PATH), 'live');
    assert.equal(stateOf(after, WAITING), 'live');
    assert.match(written(after)['pages/after.md'], /^date: 2026-11-03T09:00:00Z$/m);
  });
});

describe('a feed\'s post of a type whose address holds the date', () => {
  test('moves with a corrected date, its old address leading to the new, and keeps it with a corrected title', () => {
    const dated = { ...declared, types: { ...declared.types, page: { collection: 'pages', address: '/{year}/{month}/{slug}/', elements: ['paragraph'] } } };
    const datedSite = siteDescription(dated);
    const PAGE = 'pages/f00d00000002.md';
    const file = (item) => feedPostFile(item, { site: datedSite, type: datedSite.types.page, seen: '2026-11-03T09:01:00Z', now: '2026-12-03T09:01:00Z', slug: 'harbour-opens' }).text;
    let ledger = null;
    const build = (item) => {
      const result = run({ [PAGE]: file(item) }, dated, { ledger, changes: pushedBy(FEED_READER, PAGE), now: new Date('2026-12-03T09:02:00Z') });
      ledger = result.ledger;
      return result;
    };
    assert.equal(build(ITEM).posts[0].address, '/2026/11/harbour-opens/');
    const moved = build({ ...ITEM, date: '2026-12-01T09:00:00Z' });
    assert.equal(moved.posts[0].address, '/2026/12/harbour-opens/');
    assert.match(written(moved)['pages/harbour-opens.md'], /^oldAddresses: \["\/2026\/11\/harbour-opens\/"\]$/m);
    assert.equal(build({ ...ITEM, date: '2026-12-01T09:00:00Z', title: 'Harbour opens late' }).posts[0].address, '/2026/12/harbour-opens/');
  });
});
