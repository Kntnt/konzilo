// The ledger, `.post-ids.json`: which post each file is, by its ID, and what the intake
// remembers of it. It makes an old address's 301 also after an unpublish, a rename and a
// republish, keeps a refused post's last file even after its slug has changed, and decides
// who holds an address. The guard counts what leaves the site by it.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, test } from 'node:test';
import { postIdsByPath } from '../src/format/write.js';
import { deletion } from '../src/intake/index.js';
import { NOW, run, sourcePost, written } from './lib/intake.js';

const site = {
  language: 'en_GB',
  types: {
    article: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { date: {}, modified: {} } },
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph'] },
  },
};
const THE_POST = 'articles/aaaaaaaaaaaa.md';
const OTHER_POST = 'articles/bbbbbbbbbbbb.md';
const post = (fields = {}, body = 'Text.') => sourcePost({ title: 'A post', slug: 'first', status: 'published', date: '2026-10-01T08:00:00Z', ...fields }, body);
const at = (day) => new Date(`2026-11-${day}T12:00:00Z`);
const entry = (result, id = 'aaaaaaaaaaaa') => result.ledger.posts[id];
// What a build warns of in its posts, beside what it warns of in the site's files.
const warned = (result) => result.warnings.filter(({ post: about }) => about);
const frontmatter = (text) => Object.fromEntries(text.split('---\n')[1].trim().split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)]));

// A history of builds, each from what the last left.
function history(...steps) {
  let ledger = null;
  const results = [];
  steps.forEach((files, index) => {
    const result = run(files, site, { ledger, now: at(String(index + 1).padStart(2, '0')) });
    ledger = JSON.parse(written(result)['.post-ids.json']);
    results.push(result);
  });
  return results;
}

describe('an old address', () => {
  test('a rename leaves the address it was live at as an old address', () => {
    const [, second] = history({ [THE_POST]: post() }, { [THE_POST]: post({ slug: 'second' }) });
    assert.equal(frontmatter(written(second)['articles/second.md']).oldAddresses, '["/first/"]');
    assert.equal(written(second)['articles/first.md'], undefined);
    assert.deepEqual(entry(second).paths, ['articles/first.md', 'articles/second.md']);
    assert.deepEqual(entry(second).addresses, ['/first/', '/second/']);
    assert.equal(entry(second).address, '/second/');
  });

  test('a rename while it is off the site makes no old address of what was never live', () => {
    const [, , , fourth] = history(
      { [THE_POST]: post() },
      { [THE_POST]: post({ status: 'draft' }) },
      { [THE_POST]: post({ status: 'draft', slug: 'never-live' }) },
      { [THE_POST]: post({ slug: 'third' }) },
    );
    assert.equal(frontmatter(written(fourth)['articles/third.md']).oldAddresses, '["/first/"]');
  });

  test('an unpublish keeps the live address, and takes the file off', () => {
    const [, second] = history({ [THE_POST]: post() }, { [THE_POST]: post({ status: 'draft' }) });
    assert.equal(written(second)['articles/first.md'], undefined);
    assert.equal(entry(second).path, null);
    assert.equal(entry(second).address, '/first/');
  });

  test('going back to an old address makes it the post\'s own again', () => {
    const [, , third] = history({ [THE_POST]: post() }, { [THE_POST]: post({ slug: 'second' }) }, { [THE_POST]: post() });
    assert.equal(frontmatter(written(third)['articles/first.md']).oldAddresses, '["/second/"]');
  });

  test('gives way to a post that goes live there, for good', () => {
    const [, , third, fourth] = history(
      { [THE_POST]: post() },
      { [THE_POST]: post({ slug: 'second' }) },
      { [THE_POST]: post({ slug: 'second' }), [OTHER_POST]: post({ title: 'Other', slug: 'first' }) },
      { [THE_POST]: post({ slug: 'second' }), [OTHER_POST]: post({ title: 'Other', slug: 'moved' }) },
    );
    assert.equal(frontmatter(written(third)['articles/second.md']).oldAddresses, undefined);
    assert.deepEqual(third.refusals, []);
    assert.equal(frontmatter(written(fourth)['articles/second.md']).oldAddresses, undefined);
    assert.equal(frontmatter(written(fourth)['articles/moved.md']).oldAddresses, '["/first/"]');
  });

  test('a page\'s children move with it, and each leaves its old address', () => {
    const parent = (slug) => ['pages/parentparent.md', sourcePost({ title: 'Parent', slug, status: 'published' })];
    const child = ['pages/childchild00.md', sourcePost({ title: 'Child', slug: 'child', parent: 'parentparent', status: 'published' })];
    const [, second] = history(Object.fromEntries([parent('about'), child]), Object.fromEntries([parent('team'), child]));
    assert.equal(frontmatter(written(second)['pages/team/child.md']).oldAddresses, '["/pages/about/child/"]');
    assert.equal(frontmatter(written(second)['pages/team.md']).oldAddresses, '["/pages/about/"]');
  });
});

describe('a refused post', () => {
  const refused = (fields) => post({ title: '<b>Refused</b>', ...fields });

  test('keeps its last file, by the ledger, after its slug has changed', () => {
    const [, second] = history({ [THE_POST]: post() }, { [THE_POST]: refused({ slug: 'second' }) });
    assert.equal(second.refusals.length, 1);
    assert.equal(written(second)['articles/first.md'], undefined, 'no new file is written');
    assert.equal(written(second)['articles/second.md'], undefined);
    assert.deepEqual(second.keep, ['articles/first.md']);
    assert.equal(entry(second).path, 'articles/first.md');
    assert.equal(entry(second).address, '/first/');
    assert.deepEqual(entry(second).addresses, ['/first/']);
  });

  test('a link to it leads to where it still is, under the title it has there', () => {
    const [, second] = history(
      { [THE_POST]: post(), [OTHER_POST]: post({ title: 'Other', slug: 'other' }, '[The post](konzilo:aaaaaaaaaaaa)') },
      { [THE_POST]: refused({ slug: 'second' }), [OTHER_POST]: post({ title: 'Other', slug: 'other' }, '[The post](konzilo:aaaaaaaaaaaa)') },
    );
    assert.match(written(second)['articles/other.md'], /\[The post\]\(\/first\/\)/);
  });

  test('a post never published has nothing to keep', () => {
    const [first] = history({ [THE_POST]: refused() });
    assert.deepEqual(first.keep, []);
    assert.equal(entry(first).path, null);
    assert.equal(entry(first).taken, at('01').toISOString().replace(/\.\d{3}Z$/, 'Z'));
  });

  test('holds on to what its file names, its terms and masters', () => {
    const named = {
      language: 'en_GB',
      images: { smallestWidth: 1, displayWidth: 1 },
      taxonomies: { tag: { label: 'Tag', plural: 'Tags', collection: 'tags' } },
      types: { article: { label: 'A', plural: 'As', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { tags: { taxonomy: 'tag' }, image: {} } } },
    };
    const fields = { tags: ['tagtagtagtag'], image: { src: '/media/barn-faf546aae9.jpg', alt: 'A barn' } };
    const first = run({ [THE_POST]: post(fields), 'tags/tagtagtagtag.json': { name: 'A tag', slug: 'a-tag' } }, named);
    assert.deepEqual(entry(first).names, { media: ['first-faf546aae9.webp'], terms: ['tags/a-tag.json'] });
    const second = run({ [THE_POST]: post({ ...fields, title: '<b>Refused</b>' }), 'tags/tagtagtagtag.json': { name: 'A tag', slug: 'a-tag' } }, named, { ledger: first.ledger });
    assert.deepEqual(second.keep, ['articles/first.md', 'media/first-faf546aae9.webp', 'tags/a-tag.json']);
    assert.equal(written(second)['tags/a-tag.json'], undefined);
  });
});

describe('two posts at one address', () => {
  test('the post the current release shows there keeps it, and the other is refused, naming it', () => {
    const [, second] = history({ [THE_POST]: post() }, { [THE_POST]: post(), [OTHER_POST]: post({ title: 'Other' }) });
    assert.equal(second.refusals.length, 1);
    assert.equal(second.refusals[0].post.id, 'bbbbbbbbbbbb');
    assert.equal(second.refusals[0].field, 'slug');
    assert.equal(second.refusals[0].reason, 'the address /first/ belongs to "A post"; change this post\'s slug or parent');
  });

  test('otherwise the one the ledger took first', () => {
    // The first post is off the site, but the ledger took it first.
    const [, , third] = history(
      { [OTHER_POST]: post({ title: 'Other', slug: 'off', status: 'published' }), [THE_POST]: post({ slug: 'also-off' }) },
      { [OTHER_POST]: post({ title: 'Other', slug: 'off', status: 'draft' }), [THE_POST]: post({ slug: 'also-off', status: 'draft' }) },
      { [OTHER_POST]: post({ title: 'Other', slug: 'wanted' }), [THE_POST]: post({ slug: 'wanted' }) },
    );
    assert.equal(third.refusals.length, 1);
    assert.equal(third.refusals[0].post.id, 'bbbbbbbbbbbb', 'with the same moment taken, the lower ID stands');
  });

  test('a post taken earlier beats one the ledger has not got', () => {
    const [, second] = history(
      { [OTHER_POST]: post({ title: 'Other', slug: 'off', status: 'draft' }), [THE_POST]: post({ slug: 'first', title: 'Early' }) },
      { [OTHER_POST]: post({ title: 'Other', slug: 'wanted' }), [THE_POST]: post({ slug: 'wanted', title: 'Early' }) },
    );
    assert.equal(second.refusals[0].post.id, 'bbbbbbbbbbbb');
    assert.match(second.refusals[0].reason, /belongs to "Early"/);
  });

  test('a refused post\'s kept file holds its address', () => {
    const [, second] = history(
      { [THE_POST]: post() },
      { [THE_POST]: post({ title: '<b>Refused</b>', slug: 'moved' }), [OTHER_POST]: post({ title: 'Other', slug: 'first' }) },
    );
    assert.equal(second.refusals.length, 2);
    assert.match(second.refusals.find((one) => one.post.id === 'bbbbbbbbbbbb').reason, /belongs to/);
  });
});

describe('what is derived', () => {
  test('a post\'s date is the moment the intake first took it, where it has none of its own', () => {
    const [, second] = history({ [THE_POST]: post({ date: undefined }) }, { [THE_POST]: post({ date: undefined }, 'Changed.') });
    assert.equal(frontmatter(written(second)['articles/first.md']).date, '2026-11-01T12:00:00Z');
  });

  test('a date given in another zone is written in UTC', () => {
    const [first] = history({ [THE_POST]: post({ date: '2026-10-01T10:00:00+02:00' }) });
    assert.equal(frontmatter(written(first)['articles/first.md']).date, '2026-10-01T08:00:00Z');
  });

  test('`modified` starts at the post\'s date, and moves only when the published version does', () => {
    const [first, second, third] = history(
      { [THE_POST]: post() },
      { [THE_POST]: post({}, 'Text.\n\n\n\n') },
      { [THE_POST]: post({}, 'Changed.') },
    );
    assert.equal(frontmatter(written(first)['articles/first.md']).modified, '2026-10-01T08:00:00Z');
    assert.equal(frontmatter(written(second)['articles/first.md']).modified, '2026-10-01T08:00:00Z', 'a source file saved otherwise is no change');
    assert.equal(frontmatter(written(third)['articles/first.md']).modified, '2026-11-03T12:00:00Z');
  });

  test('a target\'s new address changes the post that links to it', () => {
    const linker = [OTHER_POST, post({ title: 'Other', slug: 'other' }, '[It](konzilo:aaaaaaaaaaaa)')];
    const [, second] = history(Object.fromEntries([[THE_POST, post()], linker]), Object.fromEntries([[THE_POST, post({ slug: 'second' })], linker]));
    assert.equal(frontmatter(written(second)['articles/other.md']).modified, '2026-11-02T12:00:00Z');
    assert.match(written(second)['articles/other.md'], /\[It\]\(\/second\/\)/);
  });

  test('the same content gives the same bytes, the ledger too', () => {
    const files = { [THE_POST]: post() };
    const [first, second] = history(files, files);
    assert.deepEqual(written(second), written(first));
  });

  test('a scheduled post goes live at its date, and says when the next is', () => {
    const later = '2026-12-01T08:00:00Z';
    const result = run({ [THE_POST]: post({ status: 'scheduled', date: later }) }, site);
    assert.equal(written(result)['articles/first.md'], undefined);
    assert.equal(result.next, later);
    const come = run({ [THE_POST]: post({ status: 'scheduled', date: later }) }, site, { now: new Date('2026-12-01T08:00:00Z') });
    assert.ok(written(come)['articles/first.md']);
    assert.equal(run({ [THE_POST]: post({ status: 'published', date: later }) }, site).next, later, 'published with its date to come waits too');
  });

  test('a scheduled post that waited for its moment goes live at it with no warning, and stays so', () => {
    const later = '2026-12-01T08:00:00Z';
    const scheduled = { [THE_POST]: post({ status: 'scheduled', date: later }) };
    const waits = run(scheduled, site);
    const come = run(scheduled, site, { now: new Date('2026-12-01T08:00:20Z'), ledger: waits.ledger });
    assert.equal(frontmatter(written(come)['articles/first.md']).date, later);
    assert.deepEqual(warned(come), []);
    const after = run({ [THE_POST]: post({ status: 'scheduled', date: later }, 'Words changed since.') }, site, { now: new Date('2026-12-05T08:00:00Z'), ledger: come.ledger });
    assert.deepEqual(warned(after), [], 'nor once its file has changed with the same moment');
  });

  test('a scheduled post whose moment had passed when it was first read goes live at once, with that moment as its date, and says so while it stands', () => {
    const passed = '2026-10-01T08:00:00Z';
    const [first, second] = history({ [THE_POST]: post({ status: 'scheduled', date: passed }) }, { [THE_POST]: post({ status: 'scheduled', date: passed }) });
    assert.equal(frontmatter(written(first)['articles/first.md']).date, passed);
    for (const result of [first, second]) {
      assert.deepEqual(warned(result).map(({ name, post: about, field, values }) => ({ name, post: about.id, field, values })), [{ name: 'warning.scheduled-passed', post: 'aaaaaaaaaaaa', field: 'date', values: { moment: { moment: passed } } }]);
    }

    // One that waited, moved by another hand to a moment that has passed.
    const waits = run({ [THE_POST]: post({ status: 'scheduled', date: '2026-12-01T08:00:00Z' }) }, site);
    const moved = run({ [THE_POST]: post({ status: 'scheduled', date: passed }) }, site, { ledger: waits.ledger });
    assert.deepEqual(warned(moved).map(({ name }) => name), ['warning.scheduled-passed']);
    assert.deepEqual(warned(run({ [THE_POST]: post({ status: 'published', date: passed }) }, site)), [], 'a published post has its date as it is');
  });

  test('a draft is no one\'s business but its editor\'s, and is not checked', () => {
    const result = run({ [THE_POST]: post({ status: 'draft', title: '<b>Not yet</b>' }, '# Not yet') }, site);
    assert.deepEqual(result.refusals, []);
    assert.equal(written(result)['articles/first.md'], undefined);
  });
});

describe('string IDs', () => {
  test('the ledger gives a feed each post\'s ID by the path of its file', () => {
    const result = run({ [THE_POST]: post() }, site);
    assert.deepEqual(postIdsByPath(result.ledger), { 'articles/first.md': 'aaaaaaaaaaaa' });
    assert.deepEqual(postIdsByPath({ posts: { 'sv-SE/aaaaaaaaaaaa': { path: 'articles/sv-SE/en.md' }, off: { path: null } } }), { 'articles/sv-SE/en.md': 'aaaaaaaaaaaa' });
    assert.deepEqual(postIdsByPath({ 'articles/old.md': 1 }), {}, 'what is no ledger names nothing');
  });

  test('a ledger written by another hand counts for nothing', () => {
    const result = run({ [THE_POST]: post() }, site, { ledger: { 'articles/first.md': 1 } });
    assert.deepEqual(result.refusals, []);
    assert.equal(entry(result).taken, NOW.toISOString().replace(/\.\d{3}Z$/, 'Z'));
  });
});

describe('the deletion guard', () => {
  const paths = (count) => Array.from({ length: count }, (_, i) => `articles/${String(i).padStart(2, '0')}.md`);
  const leaving = (present, gone) => deletion(present, { files: present.slice(gone).map((path) => ({ path })), keep: [], ledger: { posts: {} } });

  test('more than half of the posts the site shows, and more than one, stops a build', () => {
    assert.equal(leaving(paths(20), 11).stop, true);
    assert.equal(leaving(paths(20), 10).stop, false);
    assert.equal(leaving(paths(3), 2).stop, true);
    assert.equal(leaving(paths(1), 1).stop, false, 'a single post always goes');
    assert.equal(leaving(paths(2), 1).stop, false);
  });

  test('the report counts what would go, lists it, and gives the deletion\'s code', () => {
    const present = paths(3);
    const report = leaving(present, 2);
    assert.equal(report.count, 2);
    assert.equal(report.total, 3);
    assert.deepEqual(report.paths, present.slice(0, 2));
    assert.equal(report.code, createHash('sha256').update(present.slice(0, 2).join('\n')).digest('hex').slice(0, 8));
    assert.match(report.reason, /would take most of the site's posts off it/);
  });

  test('a code confirms exactly that deletion, and no other', () => {
    const present = paths(3);
    const result = { files: [{ path: present[2] }], keep: [], ledger: { posts: {} } };
    const { code } = deletion(present, result);
    assert.equal(deletion(present, result, { confirmed: code }).stop, false);
    assert.equal(deletion(present, result, { confirmed: 'deadbeef' }).stop, true);
    const other = { files: [{ path: present[1] }], keep: [], ledger: { posts: {} } };
    assert.equal(deletion(present, other, { confirmed: code }).stop, true);
  });

  test('a post whose file moves, by the ledger, is no deletion, and a kept file stays', () => {
    const present = ['articles/a.md', 'articles/b.md', 'articles/c.md'];
    const result = {
      files: [{ path: 'articles/a2.md' }, { path: 'articles/b2.md' }, { path: 'articles/c.md' }],
      keep: [],
      ledger: { posts: { 1: { path: 'articles/a2.md', paths: ['articles/a.md', 'articles/a2.md'] }, 2: { path: 'articles/b2.md', paths: ['articles/b.md', 'articles/b2.md'] } } },
    };
    assert.equal(deletion(present, result).count, 0);
    assert.equal(deletion(present, { files: [], keep: present, ledger: { posts: {} } }).count, 0);
  });

  test('stops a build whose source has gone missing', () => {
    const files = Object.fromEntries(['a', 'b', 'c'].map((slug) => [`articles/${slug.repeat(12)}.md`, post({ slug })]));
    const first = run(files, site);
    const present = first.files.filter(({ path }) => path.startsWith('articles/')).map(({ path }) => path);
    const empty = run({}, site, { ledger: first.ledger });
    const report = deletion(present, empty);
    assert.equal(report.stop, true);
    assert.equal(report.count, 3);
  });
});
