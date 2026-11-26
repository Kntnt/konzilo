// A type's address that holds more than the post's slug or path: its date, as `{year}`,
// `{month}` and `{day}`, and the term of a field that takes exactly one, by the field's name.
// The checker takes each shape the rules allow and refuses the rest, naming the type with an
// example that works; every place that knows a post's address gets it from its values; and a
// changed date, term or term slug moves the post, leaving its old address.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { siteDescription } from '../src/site-description.js';
import { run, sourcePost, written } from './lib/intake.js';

// A site whose own type `story` has a date and a required, single category, and whose
// category is a hierarchical taxonomy of its own, with `more` over the type.
const site = (address, more = {}, taxonomy = {}) => ({
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  types: {
    story: {
      label: 'Story',
      plural: 'Stories',
      collection: 'stories',
      address,
      elements: ['paragraph'],
      fields: { date: {}, category: { taxonomy: 'category', most: 1, required: true } },
      ...more,
    },
  },
  taxonomies: { category: { label: 'Category', plural: 'Categories', collection: 'categories', hierarchical: true, ...taxonomy } },
});

const refused = (declared, problem) => assert.throws(() => siteDescription(declared), (error) => {
  assert.ok(error.message.includes(problem), `${error.message}\ndoes not say\n${problem}`);
  return true;
});

describe('the checker', () => {
  test('takes a date and a term before the slug, in each shape the rules allow', () => {
    for (const address of ['/{year}/{month}/{day}/{slug}/', '/{year}/{slug}/', '/{year}/{month}/{slug}/', '/articles/{category}/{slug}/', '/{category}/{year}/{slug}/', '/news/{year}/archive/{slug}/']) {
      assert.equal(siteDescription(site(address)).types.story.address, address);
    }
  });

  test('refuses each shape the rules exclude, naming the type with an example that works', () => {
    const own = '"/news/{category}/{slug}/"';
    for (const [declared, problem] of [
      [site('/archive-{year}/{slug}/'), `types.story.address: /archive-{year}/{slug}/ lets text share a step with a token, in /archive-{year}/; a token fills a step of its own, such as ${own}`],
      [site('/{month}/{year}/{slug}/'), 'types.story.address: /{month}/{year}/{slug}/ holds the date\'s tokens out of order or apart; they stand together, as {year}, {year}/{month} or {year}/{month}/{day}, such as "/news/{year}/{month}/{slug}/"'],
      [site('/{year}/{day}/{slug}/'), 'types.story.address: /{year}/{day}/{slug}/ holds the date\'s tokens out of order or apart'],
      [site('/{year}/news/{month}/{slug}/'), 'types.story.address: /{year}/news/{month}/{slug}/ holds the date\'s tokens out of order or apart'],
      [site('/{year}/{year}/{slug}/'), `types.story.address: /{year}/{year}/{slug}/ holds {year} twice; each token fills one place, such as ${own}`],
      [site('/{category}/{category}/{slug}/'), 'types.story.address: /{category}/{category}/{slug}/ holds {category} twice'],
      [site('/{slug}/{slug}/'), `types.story.address: /{slug}/{slug}/ holds {slug} before its last step, which alone it fills, such as ${own}`],
      [site('/{year}/{slug}/{month}/'), 'types.story.address: must be a path from the site\'s root that ends in /{slug}/'],
      [site('/{id}/{slug}/'), `types.story.address: {id} is no field of story's; an address holds {year}, {month} and {day}, from the post's date, and the term of a field that takes exactly one, by the field's name, such as ${own}`],
      [site('/{rating}/{slug}/', { fields: { date: {}, category: { taxonomy: 'category', most: 1, required: true }, rating: { label: 'Rating', type: 'integer', control: 'number' } } }), `types.story.address: {rating} is a field of story's that holds no term; an address holds the term of a field of terms alone, such as ${own}`],
      [site('/{category}/{slug}/', { fields: { date: {}, category: { taxonomy: 'category', required: true } } }), 'types.story.address: {category} names a field that does not take exactly one term; an address holds the term of a field with "most": 1 and "required": true, as "category": { "taxonomy": "category", "most": 1, "required": true }'],
      [site('/{category}/{slug}/', { fields: { date: {}, category: { taxonomy: 'category', most: 1 } } }), 'types.story.address: {category} names a field that does not take exactly one term'],
      [site('/{category}/{path}/', { hierarchical: true }), 'types.story.address: story is hierarchical, so its posts stand under their parents and its address holds no term, such as "/pages/{path}/"'],
      [site('/{year}/{slug}/', { fields: { category: { taxonomy: 'category', most: 1, required: true } } }), 'types.story.address: story has no date to fill {year}, {month} and {day}; declare "date": {} among its fields'],
    ]) refused(declared, problem);
  });

  test('makes the built-in article\'s category required where its address holds it, and refuses its authors and topics there', () => {
    const article = (address) => ({ language: 'en_GB', images: { smallestWidth: 400, displayWidth: 1280 }, types: { article: { collection: 'articles', address, elements: ['paragraph'] } } });
    assert.equal(siteDescription(article('/{slug}/')).types.article.fields.find((field) => field.name === 'category').required, false);
    assert.equal(siteDescription(article('/{category}/{year}/{slug}/')).types.article.fields.find((field) => field.name === 'category').required, true);
    refused(article('/{topics}/{slug}/'), 'types.article.address: {topics} names a field that does not take exactly one term; an address holds the term of a field with "most": 1 and "required": true, such as "/news/{category}/{slug}/"');
  });

  test('refuses two addresses of one shape, which give each other\'s every address, and leaves two that only can meet to the posts', () => {
    const region = { region: { label: 'Region', plural: 'Regions', collection: 'regions' } };
    const two = (address, other, more = {}) => {
      const declared = site(address, {}, {});
      declared.taxonomies = { ...declared.taxonomies, ...region, ...more.taxonomies };
      declared.types.event = { label: 'Event', plural: 'Events', collection: 'events', address: other, elements: ['paragraph'], fields: { date: {}, region: { taxonomy: 'region', most: 1, required: true } }, ...more.event };
      return declared;
    };
    refused(two('/{year}/{slug}/', '/{region}/{slug}/'), 'types.event.address: /{region}/{slug}/ gives every address that /{year}/{slug}/, the address of types.story, gives; give one of them a step of its own, such as "/event/{region}/{slug}/"');
    refused(two('/{category}/{slug}/', '/{category}/{slug}/', { event: { fields: { date: {}, category: { taxonomy: 'category', most: 1, required: true } } } }), 'types.event.address: /{category}/{slug}/ is also the address of types.story');
    refused(two('/{year}/{slug}/', '/news/{slug}/', { taxonomies: { region: { ...region.region, address: '/{year}/{slug}/' } } }), 'taxonomies.region.address: must be a path from the site\'s root that ends in /{slug}/');
    refused(two('/{year}/{slug}/', '/news/{slug}/', { taxonomies: { region: { ...region.region, address: '/regions/{slug}/' } }, event: { address: '/regions/{slug}/' } }), 'types.event.address: /regions/{slug}/ is also the address of taxonomies.region');
    for (const [address, other] of [['/{year}/{slug}/', '/2026/{slug}/'], ['/{category}/{slug}/', '/{region}/{slug}/'], ['/{year}/{month}/{slug}/', '/{region}/{slug}/'], ['/{year}/{slug}/', '/{region}/{year}/{slug}/']]) {
      assert.equal(siteDescription(two(address, other)).types.event.address, other);
    }
    const pages = site('/{year}/{month}/{day}/{slug}/');
    pages.types.page = { collection: 'pages', hierarchical: true, address: '/{path}/', elements: ['paragraph'] };
    assert.equal(siteDescription(pages).types.page.address, '/{path}/');
  });

  test('refuses an address that can give a post the search page\'s, through a token too', () => {
    assert.equal(siteDescription({ ...site('/news/{year}/{slug}/'), search: { address: '/news/search/' } }).search.address, '/news/search/');
    refused({ ...site('/news/{year}/{slug}/'), search: { address: '/news/2026/search/' } }, 'types.story.address: /news/{year}/{slug}/ can give a post the search page\'s address, /news/2026/search/; give the search page an address outside /news/');
    refused({ ...site('/news/{category}/{slug}/'), search: { address: '/news/a/b/search/' } }, 'types.story.address: /news/{category}/{slug}/ can give a post the search page\'s address, /news/a/b/search/');
  });
});

// The source files of a run: stories, each by its ID with its own fields, and the categories,
// health with ptsd below it, and news.
const STORY = 'stories/aaaaaaaaaaaa.md';
const story = (fields = {}) => sourcePost({ title: 'A story', slug: 'lanterns', status: 'published', date: '2026-03-07T23:30:00Z', category: 'ptsdptsdptsd', ...fields }, 'Words.');
const categories = (health = 'health') => ({
  'categories/healthhealth.json': { name: 'Health', slug: health },
  'categories/ptsdptsdptsd.json': { name: 'PTSD', slug: 'ptsd', parent: 'healthhealth' },
  'categories/newsnewsnews.json': { name: 'News', slug: 'news' },
});
const frontmatter = (text) => Object.fromEntries(text.split('---\n')[1].trim().split('\n').map((line) => [line.slice(0, line.indexOf(':')), line.slice(line.indexOf(':') + 2)]));

// A history of builds, each a day after the last, from what the last left.
function history(address, ...steps) {
  let ledger = null;
  return steps.map((files, index) => {
    const result = run(files, site(address), { ledger, now: new Date(`2026-11-${String(index + 1).padStart(2, '0')}T12:00:00Z`) });
    ledger = JSON.parse(written(result)['.post-ids.json']);
    return result;
  });
}

const addressOf = (result, id = 'aaaaaaaaaaaa') => result.ledger.posts[id].address;

describe('a post\'s address', () => {
  test('is its date\'s day in UTC, the month and the day in two digits, its file still at its slug', () => {
    const [result] = history('/{year}/{month}/{day}/{slug}/', { [STORY]: story(), ...categories() });
    assert.deepEqual(result.refusals, []);
    assert.equal(addressOf(result), '/2026/03/07/lanterns/');
    assert.ok(written(result)['stories/lanterns.md']);
    const [zoned] = history('/{year}/{month}/{day}/{slug}/', { [STORY]: story({ date: '2026-03-08T01:30:00+02:00' }), ...categories() });
    assert.equal(addressOf(zoned), '/2026/03/07/lanterns/');
    for (const [address, expected] of [['/{year}/{slug}/', '/2026/lanterns/'], ['/{year}/{month}/{slug}/', '/2026/03/lanterns/']]) {
      assert.equal(addressOf(history(address, { [STORY]: story(), ...categories() })[0]), expected);
    }
  });

  test('holds its term\'s whole path in a hierarchical taxonomy, and its slug in one that is not', () => {
    assert.equal(addressOf(history('/articles/{category}/{slug}/', { [STORY]: story(), ...categories() })[0]), '/articles/health/ptsd/lanterns/');
    assert.equal(addressOf(history('/{category}/{year}/{slug}/', { [STORY]: story({ category: 'newsnewsnews' }), ...categories() })[0]), '/news/2026/lanterns/');
  });

  test('moves with a changed date, term or term slug, and leaves the address it was live at as an old address', () => {
    const [, moved] = history('/{year}/{month}/{day}/{slug}/', { [STORY]: story(), ...categories() }, { [STORY]: story({ date: '2026-04-01T08:00:00Z' }), ...categories() });
    assert.equal(addressOf(moved), '/2026/04/01/lanterns/');
    assert.deepEqual(moved.ledger.posts.aaaaaaaaaaaa.addresses, ['/2026/03/07/lanterns/', '/2026/04/01/lanterns/']);
    assert.equal(frontmatter(written(moved)['stories/lanterns.md']).oldAddresses, '["/2026/03/07/lanterns/"]');
    const [, recategorised] = history('/{category}/{slug}/', { [STORY]: story(), ...categories() }, { [STORY]: story({ category: 'newsnewsnews' }), ...categories() });
    assert.equal(frontmatter(written(recategorised)['stories/lanterns.md']).oldAddresses, '["/health/ptsd/lanterns/"]');
    assert.equal(addressOf(recategorised), '/news/lanterns/');
    const [, renamed] = history('/{category}/{slug}/', { [STORY]: story(), ...categories() }, { [STORY]: story(), ...categories('wellbeing') });
    assert.equal(addressOf(renamed), '/wellbeing/ptsd/lanterns/');
    assert.equal(frontmatter(written(renamed)['stories/lanterns.md']).oldAddresses, '["/health/ptsd/lanterns/"]');
    const [, reparented] = history('/{category}/{slug}/', { [STORY]: story(), ...categories() }, { [STORY]: story(), ...categories(), 'categories/ptsdptsdptsd.json': { name: 'PTSD', slug: 'ptsd', parent: 'newsnewsnews' } });
    assert.equal(addressOf(reparented), '/news/ptsd/lanterns/', 'its term moved under another parent');
    assert.equal(frontmatter(written(reparented)['stories/lanterns.md']).oldAddresses, '["/health/ptsd/lanterns/"]');
  });

  test('is as before where the address holds the slug alone, whatever the date and the term', () => {
    const [, later] = history('/stories/{slug}/', { [STORY]: story(), ...categories() }, { [STORY]: story({ date: '2026-04-01T08:00:00Z', category: 'newsnewsnews' }), ...categories() });
    assert.equal(addressOf(later), '/stories/lanterns/');
    assert.equal(frontmatter(written(later)['stories/lanterns.md']).oldAddresses, undefined);
  });

  test('of a draft and a scheduled post in a live preview follows the date as it stands', () => {
    const draft = (date) => ({ [STORY]: story({ status: 'draft', date }), ...categories() });
    const at = (files, date) => run(files, site('/{year}/{month}/{day}/{slug}/'), { preview: [STORY], now: new Date(date) }).posts.find((one) => one.file === STORY);
    assert.equal(at(draft('2026-03-07T23:30:00Z'), '2026-11-01T00:00:00Z').address, '/2026/03/07/lanterns/');
    assert.equal(at(draft('2026-05-01T10:00:00Z'), '2026-11-01T00:00:00Z').address, '/2026/05/01/lanterns/');
    const scheduled = { [STORY]: story({ status: 'scheduled', date: '2027-01-02T10:00:00Z' }), ...categories() };
    assert.equal(at(scheduled, '2027-01-03T00:00:00Z').address, '/2027/01/02/lanterns/');
  });

  test('on a site in several languages is its language\'s prefix and its type\'s address in that language, the term\'s path the main language\'s', () => {
    const several = { ...site({ sv_SE: '/{category}/{slug}/', en_GB: '/news/{year}/{slug}/' }), language: undefined, languages: ['sv_SE', 'en_GB'] };
    const result = run({
      'stories/sv-SE/aaaaaaaaaaaa.md': story({ slug: 'lyktorna' }),
      'stories/en-GB/aaaaaaaaaaaa.md': story({ slug: 'the-lanterns' }),
      'categories/sv-SE/healthhealth.json': { name: 'Hälsa', slug: 'halsa' },
      'categories/sv-SE/ptsdptsdptsd.json': { name: 'PTSD', slug: 'ptsd', parent: 'healthhealth' },
      'categories/en-GB/healthhealth.json': { name: 'Health', slug: 'halsa' },
      'categories/en-GB/ptsdptsdptsd.json': { name: 'PTSD', slug: 'ptsd', parent: 'healthhealth' },
    }, several);
    assert.deepEqual(result.refusals, []);
    assert.equal(result.ledger.posts['sv-SE/aaaaaaaaaaaa'].address, '/sv/halsa/ptsd/lyktorna/');
    assert.equal(result.ledger.posts['en-GB/aaaaaaaaaaaa'].address, '/en/news/2026/the-lanterns/');
    assert.match(written(result)['stories/sv-SE/lyktorna.md'], /\noldAddresses: \["\/halsa\/ptsd\/lyktorna\/"\]\n/);
  });

  test('of a post without the term its address holds is refused, as a required field is', () => {
    const [result] = history('/{category}/{slug}/', { [STORY]: story({ category: undefined }), ...categories() });
    assert.equal(result.refusals.length, 1);
    assert.equal(result.refusals[0].field.name ?? result.refusals[0].field, 'category');
  });
});
