// A scheduled post's triggers (ADR 0076): a moment, or the publishing of another post that meets
// conditions an Editor gives, in rows, alternatives on a row by or and the rows by and. A post goes
// out once they hold, however late that is seen, dated by the moment they came to hold, and stays
// out whatever becomes of what released it.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { run, sourcePost, written } from './lib/intake.js';

const site = {
  language: 'en_GB',
  images: { smallestWidth: 400, displayWidth: 1280 },
  taxonomies: { topic: { label: 'Topic', plural: 'Topics', collection: 'topics', hierarchical: true } },
  types: {
    story: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { date: {}, modified: {}, topics: { taxonomy: 'topic' } } },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', address: '/notes/{slug}/', elements: ['paragraph'], fields: { date: {} } },
  },
};

const WAITER = 'articles/aaaaaaaaaaaa.md';
const LAUNCH = 'articles/bbbbbbbbbbbb.md';
const OTHER = 'articles/cccccccccccc.md';
const NOTE = 'notes/dddddddddddd.md';
const TOPICS = { 'topics/harbours0000.json': { name: 'Harbours' }, 'topics/quays0000000.json': { name: 'Quays', parent: 'harbours0000' } };

const at = (text) => new Date(text);
const SAVED = '2026-11-20T10:00:00Z';
const published = (conditions, since = SAVED) => ({ published: conditions, since });
const scheduled = (triggers, fields = {}) => sourcePost({ title: 'The waiting post', slug: 'waiting', status: 'scheduled', triggers, ...fields }, 'Text.');
const post = (fields = {}) => sourcePost({ title: 'The launch of the season', slug: 'launch', status: 'published', ...fields }, 'Text.');
const dateIn = (result, path) => /^date: (.*)$/m.exec(written(result)[path] ?? '')?.[1] ?? null;
const stateOf = (result, file) => result.posts.find((one) => one.file === file);
// What a build warns of in its posts, beside what it warns of in the site's files.
const warned = (result) => result.warnings.filter(({ post: about }) => about);

// A history of builds, each at its moment, from the ledger the last left.
function history(...steps) {
  let ledger = null;
  return steps.map(([files, now, options = {}]) => {
    const result = run(files, site, { ledger, now: at(now), ...options });
    ledger = result.ledger;
    return result;
  });
}

const forLaunch = [[published([[{ type: 'story' }], [{ words: 'Launch' }]])]];

describe('a post that waits for another post\'s publishing', () => {
  test('goes out in the build that publishes a post of the type with the words in its title, dated by its publishing', () => {
    const [waits, out] = history(
      [{ [WAITER]: scheduled(forLaunch) }, '2026-11-21T08:00:00Z'],
      [{ [WAITER]: scheduled(forLaunch), [LAUNCH]: post() }, '2026-11-22T08:00:00Z'],
    );
    assert.equal(written(waits)['articles/waiting.md'], undefined);
    assert.equal(stateOf(waits, WAITER).state, 'waiting');
    assert.equal(stateOf(waits, WAITER).at, null, 'nothing says when');
    assert.equal(waits.next, null);
    assert.equal(dateIn(out, 'articles/launch.md'), '2026-11-22T08:00:00Z');
    assert.equal(dateIn(out, 'articles/waiting.md'), '2026-11-22T08:00:00Z');
    assert.equal(stateOf(out, WAITER).state, 'live');
    assert.deepEqual(out.refusals, []);
    assert.deepEqual(warned(out), [], 'it waited, so nothing is said');
  });

  test('is not released by a matching post published before the trigger was saved', () => {
    const [, later] = history(
      [{ [LAUNCH]: post() }, '2026-11-19T08:00:00Z'],
      [{ [LAUNCH]: post(), [WAITER]: scheduled(forLaunch) }, '2026-11-21T08:00:00Z'],
    );
    assert.equal(written(later)['articles/waiting.md'], undefined);
    assert.equal(stateOf(later, WAITER).state, 'waiting');
  });

  test('is not released by a post of another type, or without the words, nor by itself', () => {
    const result = run({ [WAITER]: scheduled(forLaunch, { title: 'Launch day' }), [NOTE]: post({ slug: 'note' }), [OTHER]: post({ title: 'The lunch of the season', slug: 'lunch' }) }, site, { now: at('2026-11-21T08:00:00Z') });
    assert.equal(stateOf(result, WAITER).state, 'waiting');
  });

  test('reads words in a title whole and whatever their case', () => {
    const words = (given, title) => stateOf(run({ [WAITER]: scheduled([[published([[{ words: given }]])]]), [LAUNCH]: post({ title }) }, site, { now: at('2026-11-21T08:00:00Z') }), WAITER).state;
    assert.equal(words('LAUNCH season', 'The launch of the season'), 'live');
    assert.equal(words('launch', 'The launches of the season'), 'waiting', 'a word is whole');
    assert.equal(words('höst', 'Höst på kajen'), 'live');
  });
});

describe('conditions and rows', () => {
  const NOW = '2026-11-21T08:00:00Z';
  const state = (triggers, files) => stateOf(run({ [WAITER]: scheduled(triggers), ...TOPICS, ...files }, site, { now: at(NOW) }), WAITER).state;

  test('a term of any taxonomy, or one below it', () => {
    const topic = [[published([[{ term: 'harbours0000' }]])]];
    assert.equal(state(topic, { [LAUNCH]: post({ topics: ['quays0000000'] }) }), 'live', 'a term below the one asked for');
    assert.equal(state(topic, { [LAUNCH]: post({ topics: ['harbours0000'] }) }), 'live');
    assert.equal(state(topic, { [LAUNCH]: post() }), 'waiting');
    assert.equal(state([[published([[{ term: 'quays0000000' }]])]], { [LAUNCH]: post({ topics: ['harbours0000'] }) }), 'waiting', 'not one above it');
  });

  test('a window, counted from the save where its start has passed', () => {
    const within = (window, date) => state([[published([[window]])]], { [LAUNCH]: post({ date }) });
    assert.equal(within({ from: '2026-11-21T00:00:00Z', to: '2026-11-30T00:00:00Z' }, '2026-11-21T06:00:00Z'), 'live');
    assert.equal(within({ from: '2026-11-21T07:00:00Z' }, '2026-11-21T06:00:00Z'), 'waiting', 'before it starts');
    assert.equal(within({ to: '2026-11-21T05:00:00Z' }, '2026-11-21T06:00:00Z'), 'waiting', 'after it ends');
    assert.equal(within({ from: '2026-11-01T00:00:00Z' }, '2026-11-15T00:00:00Z'), 'waiting', 'a start passed counts from the save');
  });

  test('two triggers on a row are alternatives, and two rows are both needed', () => {
    const launch = published([[{ words: 'launch' }]]);
    const harbour = published([[{ term: 'harbours0000' }]]);
    const neither = { [LAUNCH]: post({ title: 'Nothing', slug: 'nothing' }) };
    const one = { [LAUNCH]: post() };
    const both = { [LAUNCH]: post(), [OTHER]: post({ title: 'Harbours', slug: 'harbours', topics: ['harbours0000'] }) };
    assert.equal(state([[launch, harbour]], neither), 'waiting');
    assert.equal(state([[launch, harbour]], one), 'live');
    assert.equal(state([[launch], [harbour]], one), 'waiting');
    assert.equal(state([[launch], [harbour]], both), 'live');
  });

  test('conditions on a row are alternatives, and rows of conditions are all of the same post', () => {
    const either = [[published([[{ type: 'note' }, { words: 'launch' }]])]];
    assert.equal(state(either, { [LAUNCH]: post() }), 'live');
    const both = [[published([[{ type: 'note' }], [{ words: 'launch' }]])]];
    assert.equal(state(both, { [LAUNCH]: post(), [NOTE]: post({ title: 'A note', slug: 'note' }) }), 'waiting', 'two posts that meet one row each do not');
    assert.equal(state(both, { [NOTE]: post({ slug: 'note' }) }), 'live');
  });

  test('a moment and a post both needed: dated by the later', () => {
    const triggers = [[{ moment: '2026-11-20T12:00:00Z' }], [published([[{ words: 'launch' }]])]];
    const result = run({ [WAITER]: scheduled(triggers), [LAUNCH]: post({ date: '2026-11-21T06:00:00Z' }) }, site, { now: at(NOW) });
    assert.equal(dateIn(result, 'articles/waiting.md'), '2026-11-21T06:00:00Z');
  });
});

describe('what has happened counts, however late it is seen', () => {
  test('a moment passed and a post published while no build ran release the post at the next build, dated when they came to hold', () => {
    const triggers = [[{ moment: '2026-11-22T09:00:00Z' }], [published([[{ words: 'launch' }]])]];
    const [waits, late] = history(
      [{ [WAITER]: scheduled(triggers) }, '2026-11-21T08:00:00Z'],
      [{ [WAITER]: scheduled(triggers), [LAUNCH]: post({ date: '2026-11-22T10:00:00Z' }) }, '2026-11-25T08:00:00Z'],
    );
    assert.equal(stateOf(waits, WAITER).state, 'waiting');
    assert.equal(waits.next, null, 'a moment alone cannot release it, so the clock asks for no build');
    assert.equal(dateIn(late, 'articles/waiting.md'), '2026-11-22T10:00:00Z');
    assert.deepEqual(warned(late), [], 'it was seen waiting');
  });

  test('one never seen waiting, whose triggers had held, goes out at once with that moment as its date, and says so', () => {
    const triggers = [[{ moment: '2026-11-20T12:00:00Z' }], [published([[{ words: 'launch' }]], '2026-11-19T00:00:00Z')]];
    const result = run({ [WAITER]: scheduled(triggers), [LAUNCH]: post({ date: '2026-11-20T15:00:00Z' }) }, site, { now: at('2026-11-21T08:00:00Z') });
    assert.equal(dateIn(result, 'articles/waiting.md'), '2026-11-20T15:00:00Z');
    assert.deepEqual(warned(result).map(({ name, field, values }) => ({ name, field: field.name, values })), [{ name: 'warning.triggers-passed', field: 'triggers', values: { moment: { moment: '2026-11-20T15:00:00Z' } } }]);
  });

  test('the clock asks for a build at the moment a post that waits for a scheduled one will go out', () => {
    const result = run({ [WAITER]: scheduled(forLaunch), [LAUNCH]: post({ status: 'scheduled', date: '2026-11-24T09:00:00Z' }) }, site, { now: at('2026-11-21T08:00:00Z') });
    assert.equal(stateOf(result, WAITER).at, '2026-11-24T09:00:00Z');
    assert.equal(result.next, '2026-11-24T09:00:00Z');
  });
});

describe('out is out', () => {
  test('unpublishing the post that released another leaves the other published, with its date', () => {
    const [, out, after] = history(
      [{ [WAITER]: scheduled(forLaunch) }, '2026-11-21T08:00:00Z'],
      [{ [WAITER]: scheduled(forLaunch), [LAUNCH]: post() }, '2026-11-22T08:00:00Z'],
      [{ [WAITER]: scheduled(forLaunch), [LAUNCH]: post({ status: 'draft' }) }, '2026-11-23T08:00:00Z'],
    );
    assert.deepEqual(out.ledger.released, { aaaaaaaaaaaa: { triggers: out.ledger.awaited.aaaaaaaaaaaa, at: '2026-11-22T08:00:00Z' } });
    assert.equal(written(after)['articles/launch.md'], undefined);
    assert.equal(dateIn(after, 'articles/waiting.md'), '2026-11-22T08:00:00Z');
    assert.deepEqual(warned(after), []);
  });

  test('changing its triggers makes it wait again', () => {
    const other = [[published([[{ words: 'autumn' }]], '2026-11-22T12:00:00Z')]];
    const [, , again] = history(
      [{ [WAITER]: scheduled(forLaunch) }, '2026-11-21T08:00:00Z'],
      [{ [WAITER]: scheduled(forLaunch), [LAUNCH]: post() }, '2026-11-22T08:00:00Z'],
      [{ [WAITER]: scheduled(other), [LAUNCH]: post() }, '2026-11-23T08:00:00Z'],
    );
    assert.equal(written(again)['articles/waiting.md'], undefined);
    assert.equal(stateOf(again, WAITER).state, 'waiting');
    assert.equal(again.ledger.released, undefined);
  });
});

describe('chains', () => {
  test('a chain of three goes out in one build, each after the one it waited for', () => {
    const third = 'articles/eeeeeeeeeeee.md';
    const files = {
      [WAITER]: scheduled([[published([[{ words: 'middle' }]])]], { title: 'The last', slug: 'last' }),
      [OTHER]: scheduled([[published([[{ words: 'first' }]])]], { title: 'The middle', slug: 'middle' }),
      [third]: post({ status: 'scheduled', date: '2026-11-24T09:00:00Z', title: 'The first', slug: 'first' }),
    };
    const [waits, out] = history([files, '2026-11-21T08:00:00Z'], [files, '2026-11-24T09:00:10Z']);
    assert.deepEqual(waits.posts.map(({ state, at: moment }) => [state, moment]), [['waiting', '2026-11-24T09:00:00Z'], ['waiting', '2026-11-24T09:00:00Z'], ['waiting', '2026-11-24T09:00:00Z']]);
    for (const slug of ['first', 'middle', 'last']) assert.equal(dateIn(out, `articles/${slug}.md`), '2026-11-24T09:00:00Z', slug);
    assert.deepEqual(warned(out), []);
  });

  test('posts that wait for each other in a cycle wait', () => {
    const result = run({
      [WAITER]: scheduled([[published([[{ words: 'other' }]])]], { title: 'One', slug: 'one' }),
      [OTHER]: scheduled([[published([[{ words: 'one' }]])]], { title: 'The other', slug: 'other' }),
    }, site, { now: at('2026-11-21T08:00:00Z') });
    assert.deepEqual(result.posts.map(({ state, at: moment }) => [state, moment]), [['waiting', null], ['waiting', null]]);
  });

  test('a post refused when it would have gone out releases nothing', () => {
    const result = run({ [WAITER]: scheduled(forLaunch), [LAUNCH]: post({ title: '<b>Launch</b> day' }) }, site, { now: at('2026-11-21T08:00:00Z') });
    assert.equal(stateOf(result, LAUNCH).state, 'refused');
    assert.equal(stateOf(result, WAITER).state, 'waiting');
    assert.equal(written(result)['articles/waiting.md'], undefined);
  });
});

describe('a moment alone', () => {
  test('given as its one trigger, is a scheduled post as it always was', () => {
    const triggers = [[{ moment: '2026-12-01T08:00:00Z' }]];
    const waits = run({ [WAITER]: scheduled(triggers) }, site, { now: at('2026-11-21T08:00:00Z') });
    assert.equal(waits.next, '2026-12-01T08:00:00Z');
    assert.equal(waits.ledger.awaited.aaaaaaaaaaaa, '2026-12-01T08:00:00Z');
    assert.equal(stateOf(waits, WAITER).triggers, undefined);
    const out = run({ [WAITER]: scheduled(triggers) }, site, { now: at('2026-12-01T08:00:00Z'), ledger: waits.ledger });
    assert.equal(dateIn(out, 'articles/waiting.md'), '2026-12-01T08:00:00Z');
  });
});

describe('what the intake tells of a post with triggers', () => {
  test('each trigger in its rows, ticked where it has happened, by the post that made it, and its terms', () => {
    const triggers = [[{ moment: '2026-11-20T12:00:00Z' }, published([[{ words: 'launch' }], [{ term: 'harbours0000' }]])], [published([[{ type: 'note' }]])]];
    const result = run({ [WAITER]: scheduled(triggers, { topics: ['quays0000000'] }), ...TOPICS, [LAUNCH]: post({ topics: ['harbours0000'] }) }, site, { now: at('2026-11-21T08:00:00Z') });
    const told = stateOf(result, WAITER);
    assert.deepEqual(told.triggers, [
      [{ moment: '2026-11-20T12:00:00Z', happened: true }, { published: [[{ words: 'launch' }], [{ term: 'harbours0000', name: 'Harbours' }]], since: SAVED, happened: true, by: 'The launch of the season' }],
      [{ published: [[{ type: 'note' }]], since: SAVED, happened: false }],
    ]);
    assert.deepEqual(told.terms, ['harbours0000', 'quays0000000']);
  });
});

test('no field of a site\'s own is named as the triggers are', async () => {
  const { siteDescription } = await import('../src/site-description.js');
  assert.throws(() => siteDescription({ ...site, types: { story: { ...site.types.story, fields: { triggers: { label: 'Triggers', type: 'string', control: 'text' } } } } }), /a scheduled post's triggers are kept under this name/);
});
