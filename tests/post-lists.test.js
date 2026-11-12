// The evaluator of post lists: one pure function of a list's
// query and the listable posts' data, run at every build in the body's
// order: filter, order, leave out this post and the posts shown above, then
// offset and number. Each case lists from post-lists/posts.json, seventeen
// posts in the taxonomies `category` and `tag`, with a date and a price,
// and the posts each gives are worked out by hand from that file.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { evaluate, pageCount, wholeList } from '@kntnt/konzilo/post-lists';

const posts = JSON.parse(readFileSync(new URL('./post-lists/posts.json', import.meta.url), 'utf8'));

// A query of the type `post` at its defaults: every post, newest first, ten.
function query(changes = {}) {
  return {
    type: 'post',
    include: {},
    exclude: {},
    where: [],
    order: 'date',
    direction: 'descending',
    orderType: 'date',
    offset: 0,
    number: 10,
    leaveOutThis: true,
    leaveOutShown: true,
    ...changes,
  };
}

const ids = (listed) => listed.map((post) => post.id);

describe('the evaluator', () => {
  test("gives Thomas's example: every post with a given tag in a given category, by title, the first ten after the very first", () => {
    const listed = evaluate(query({ include: { category: ['news'], tag: ['local'] }, order: 'title', direction: 'ascending', orderType: undefined, offset: 1 }), posts);
    assert.deepEqual(ids(listed), ['bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliett', 'kilo']);
  });

  test('leaves out every post with an excluded term, and lists the rest newest first', () => {
    const listed = evaluate(query({ include: { category: ['news'] }, exclude: { tag: ['sport'] } }), posts);
    assert.deepEqual(ids(listed), ['mike', 'lima', 'kilo', 'india', 'november', 'echo', 'juliett', 'bravo', 'charlie', 'hotel']);
  });

  test('keeps the posts whose number field is at least a value, in the order of that field', () => {
    const listed = evaluate(query({ where: [{ field: 'price', op: '>=', value: 30, type: 'number' }], order: 'price', direction: 'ascending', orderType: 'number' }), posts);
    assert.deepEqual(ids(listed), ['golf', 'hotel', 'charlie', 'kilo', 'juliett', 'november', 'oscar']);
  });

  test('meets every condition, a date compared by its day in UTC', () => {
    const where = [
      { field: 'price', op: '>=', value: 30, type: 'number' },
      { field: 'price', op: '<', value: 60, type: 'number' },
      { field: 'date', op: '>=', value: '2026-06-11', type: 'date' },
    ];
    assert.deepEqual(ids(evaluate(query({ where, order: 'title', direction: 'ascending' }), posts)), ['golf', 'kilo']);
    assert.deepEqual(ids(evaluate(query({ where: [{ field: 'date', op: '=', value: '2026-06-11', type: 'date' }] }), posts)), ['golf']);
  });

  test('ranks related posts by the terms they share with this post, then newest first, and keeps only those that share one', () => {
    const bravo = { type: 'post', ...posts.find((post) => post.id === 'bravo') };
    const listed = evaluate(query({ order: 'related', number: 5 }), posts, { current: bravo });
    assert.deepEqual(ids(listed), ['kilo', 'mike', 'lima', 'india', 'golf']);

    const stranger = { type: 'post', id: 'stranger', terms: { category: ['nothing'] } };
    assert.deepEqual(evaluate(query({ order: 'related' }), posts, { current: stranger }), []);
    assert.deepEqual(evaluate(query({ order: 'related' }), posts), []);
  });

  describe('related to an article', () => {
    // Fictional articles related to Lantern, which has the topics harbour and
    // light and the category stories, scored by hand: one point for each topic
    // shared, half a point for the same category, and none for an author.
    const article = (id, day, terms) => ({ id, title: id[0].toUpperCase() + id.slice(1), terms, fields: { date: `${day}T08:00:00Z` } });
    const lantern = { type: 'article', ...article('lantern', '2026-10-15', { topics: ['harbour', 'light'], category: ['stories'], authors: ['ines'] }) };
    const articles = [
      article('anchor', '2025-01-01', { topics: ['harbour', 'light'], category: ['stories'] }), // 2.5
      article('beacon', '2026-09-01', { topics: ['harbour'], category: ['stories'] }), // 1.5
      article('cove', '2026-06-01', { topics: ['light', 'harbour'], category: ['essays'] }), // 2
      article('dune', '2026-10-01', { topics: ['sand'], category: ['stories'] }), // 0.5
      article('ember', '2026-10-10', { topics: ['sand'], category: ['essays'], authors: ['ines'] }), // 0
      article('fjord', '2026-10-12', { topics: ['ice'], category: ['travel'] }), // 0
    ];
    const points = { topics: 1, category: 0.5 };
    const related = (options, changes = {}) => ids(evaluate(query({ type: 'article', order: 'related', number: 10, ...changes }), [lantern, ...articles], { current: lantern, points, ...options }));

    test('scores one point for each shared topic and half a point for the same category, and never shows one that shares neither', () => {
      assert.deepEqual(related({ halfLife: null }), ['anchor', 'cove', 'beacon', 'dune']);
      assert.deepEqual(related({ halfLife: null }, { number: 3 }), ['anchor', 'cove', 'beacon']);
    });

    test('halves a score with each half-life of its post\'s age, and ranks the same at any build moment', () => {
      // By hand, each score times 2^(-days before Dune / half-life), Dune's day
      // as good as any, since every post ages alike: at 90 days Beacon 1.19,
      // Cove 0.78, Dune 0.5, Anchor 0.02; at 365 days Cove 1.59, Beacon 1.42,
      // Anchor 0.74, Dune 0.5.
      for (const now of ['2026-11-11T09:00:00Z', '2027-03-01T00:00:00Z', '2036-01-01T00:00:00Z'].map(Date.parse)) {
        assert.deepEqual(related({ halfLife: 90, now }), ['beacon', 'cove', 'dune', 'anchor'], new Date(now).toISOString());
        assert.deepEqual(related({ halfLife: 365, now }), ['cove', 'beacon', 'anchor', 'dune'], new Date(now).toISOString());
      }
    });

    test('lets only the score, then the date, then the title decide with freshness switched off', () => {
      const more = [
        ...articles,
        article('grove', '2026-10-14', { topics: ['harbour'], category: ['stories'] }), // 1.5, newer than Beacon
        { ...article('bay', '2026-09-01', { topics: ['light'], category: ['stories'] }), title: 'Bay' }, // 1.5, Beacon's day
      ];
      const listed = evaluate(query({ type: 'article', order: 'related', number: 10 }), more, { current: lantern, points, halfLife: null });
      assert.deepEqual(ids(listed), ['anchor', 'cove', 'grove', 'bay', 'beacon', 'dune']);
    });

    test('decays no post without a date, so that a type without dates ranks by the score, then the title', () => {
      const undated = [
        { id: 'zeta', title: 'Zeta', terms: { topics: ['harbour', 'light'] }, fields: {} },
        { id: 'alpha', title: 'Alpha', terms: { topics: ['harbour'] }, fields: {} },
        { id: 'beta', title: 'Beta', terms: { topics: ['light', 'harbour'] }, fields: {} },
      ];
      for (const halfLife of [null, 90]) {
        assert.deepEqual(ids(evaluate(query({ type: 'note', order: 'related' }), undated, { current: lantern, halfLife })), ['beta', 'zeta', 'alpha'], String(halfLife));
      }
    });
  });

  test('leaves out this post and the posts the lists above showed, before its offset, and keeps them when told to', () => {
    const alfa = { type: 'post', ...posts.find((post) => post.id === 'alfa') };
    const shown = new Set(['bravo', 'charlie']);
    const byTitle = { include: { category: ['news'] }, order: 'title', direction: 'ascending', number: 3 };
    assert.deepEqual(ids(evaluate(query(byTitle), posts, { current: alfa, shown })), ['delta', 'echo', 'foxtrot']);
    assert.deepEqual(ids(evaluate(query({ ...byTitle, offset: 1 }), posts, { current: alfa, shown })), ['echo', 'foxtrot', 'golf']);
    assert.deepEqual(ids(evaluate(query({ ...byTitle, leaveOutThis: false, leaveOutShown: false }), posts, { current: alfa, shown })), ['alfa', 'bravo', 'charlie']);
    // A post of another type with the same slug is not this post.
    assert.deepEqual(ids(evaluate(query(byTitle), posts, { current: { ...alfa, type: 'page' } })), ['alfa', 'bravo', 'charlie']);
  });

  test('breaks ties by title, then by slug, so the order is stable', () => {
    const same = '2026-01-01T00:00:00Z';
    const tied = [
      { id: 'b', title: 'Beta', terms: {}, fields: { date: same } },
      { id: 'a-2', title: 'Alpha', terms: {}, fields: { date: same } },
      { id: 'a-1', title: 'Alpha', terms: {}, fields: { date: same } },
    ];
    assert.deepEqual(ids(evaluate(query(), tied)), ['a-1', 'a-2', 'b']);
    assert.deepEqual(ids(evaluate(query({ direction: 'ascending' }), tied)), ['a-1', 'a-2', 'b']);
  });

  test('puts a post without a value for the field it orders by last, either way', () => {
    const byPrice = { include: { tag: ['local'] }, order: 'price', orderType: 'number', number: 20 };
    const descending = evaluate(query(byPrice), posts);
    assert.deepEqual(ids(descending).slice(0, 2), ['oscar', 'juliett']);
    assert.equal(descending.at(-1).id, 'india');
    const ascending = evaluate(query({ ...byPrice, direction: 'ascending' }), posts);
    assert.deepEqual(ids(ascending).slice(0, 2), ['alfa', 'delta']);
    assert.equal(ascending.at(-1).id, 'india');
  });

  test('compares titles in the language it is given', () => {
    const titles = [
      { id: 'o', title: 'Öster', terms: {}, fields: {} },
      { id: 'z', title: 'Zeta', terms: {}, fields: {} },
      { id: 'a', title: 'Åsa', terms: {}, fields: {} },
    ];
    const byTitle = query({ order: 'title', direction: 'ascending' });
    assert.deepEqual(ids(evaluate(byTitle, titles, { locale: 'sv' })), ['z', 'a', 'o']);
    assert.deepEqual(ids(evaluate(byTitle, titles, { locale: 'en' })), ['a', 'o', 'z']);
  });

  describe('a list with pages', () => {
    // Posts titled Post 01, Post 02 … in the category `paged`, listed by
    // title, ten a page after the very first.
    const numbered = (count) => Array.from({ length: count }, (_, i) => {
      const n = String(i + 1).padStart(2, '0');
      return { id: `p${n}`, title: `Post ${n}`, terms: { category: ['paged'] }, fields: { date: `2026-01-${n}T08:00:00Z` } };
    });
    const paged = query({ include: { category: ['paged'] }, order: 'title', direction: 'ascending', orderType: undefined, offset: 1, number: 10 });
    const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => `p${String(from + i).padStart(2, '0')}`);

    test('gives the slices of 25 matches with offset 1 and number 10 as 10, 10 and 4, with no post on two pages and none missing', () => {
      const posts = numbered(25);
      const slices = [1, 2, 3].map((page) => ids(evaluate(paged, posts, { page })));
      assert.deepEqual(slices, [range(2, 11), range(12, 21), range(22, 25)]);
      assert.deepEqual(slices.flat(), range(2, 25));
      assert.equal(pageCount(paged, posts), 3);
      assert.deepEqual(evaluate(paged, posts, { page: 4 }), []);
    });

    test('counts what a list above showed out of every page, the same on each', () => {
      // The list above shows its first slice, the first three, on every page.
      const posts = numbered(28);
      const above = ids(evaluate(query({ ...paged, offset: 0, number: 3 }), posts));
      assert.deepEqual(above, range(1, 3));
      const shown = new Set(above);
      const slices = [1, 2, 3].map((page) => ids(evaluate(paged, posts, { shown, page })));
      assert.deepEqual(slices, [range(5, 14), range(15, 24), range(25, 28)]);
      assert.equal(pageCount(paged, posts, { shown }), 3);
    });

    test('has one page when nothing matches, or no more than one page holds', () => {
      assert.equal(pageCount(paged, []), 1);
      assert.equal(pageCount(paged, numbered(11)), 1);
      assert.equal(pageCount(paged, numbered(12)), 2);
    });
  });

  test('ranks 10,000 posts within half a second, even on a busy machine', () => {
    const many = Array.from({ length: 10_000 }, (_, i) => ({
      id: `post-${i}`,
      title: `${['Alfa', 'Bravo', 'Öster', 'Åsa', 'Zeta'][i % 5]} ${i}`,
      terms: { category: [['news', 'sport', 'culture'][i % 3]], tag: [`tag-${i % 50}`, `tag-${(i * 7) % 50}`] },
      fields: { date: new Date(Date.UTC(2020, 0, 1) + i * 3_600_000), price: (i * 37) % 1000 },
    }));
    const current = { type: 'post', id: 'post-0', terms: { category: ['news'], tag: ['tag-0', 'tag-7'] } };
    const queries = [
      query({ order: 'related', number: 100 }),
      query({ order: 'title', direction: 'ascending', include: { category: ['news', 'culture'] }, exclude: { tag: ['tag-3'] }, offset: 10 }),
      query({ where: [{ field: 'price', op: '>=', value: 500, type: 'number' }], order: 'price', orderType: 'number' }),
    ];
    for (const one of queries) evaluate(one, many, { current, locale: 'sv' });
    for (const one of queries) {
      const started = performance.now();
      const listed = evaluate(one, many, { current, locale: 'sv' });
      const took = performance.now() - started;
      assert.ok(listed.length > 0);
      assert.ok(took < 500, `${one.order}: ${took.toFixed(1)} ms`);
    }
  });

  // What the whole list holds, over every page, as a presentation that
  // filters is given it: four posts, one of them shown above.
  describe('the whole list', () => {
    const few = [
      { id: 'a', title: 'A', terms: { category: ['news'], tag: ['local', 'sport'] }, fields: { date: '2026-01-01' } },
      { id: 'b', title: 'B', terms: { category: ['news'], tag: ['local'] }, fields: { date: '2026-01-02' } },
      { id: 'c', title: 'C', terms: { category: ['culture'], tag: [] }, fields: { date: '2026-01-03' } },
      { id: 'd', title: 'D', terms: { category: ['news'], tag: ['sport'] }, fields: { date: '2026-01-04' } },
    ];
    const counts = (whole) => Object.fromEntries(Object.entries(whole.terms).map(([taxonomy, terms]) => [taxonomy, Object.fromEntries(terms.map(({ id, count }) => [id, count]))]));

    test('counts every post the list matches on any page, and the posts that hold each term, by taxonomy', () => {
      const whole = wholeList(query({ number: 1, include: { category: ['news'] } }), few);
      assert.equal(whole.total, 3);
      assert.deepEqual(counts(whole), { category: { news: 3 }, tag: { local: 2, sport: 2 } });
    });

    test('leaves out the posts shown above and those before the offset, as the list does', () => {
      const whole = wholeList(query({ number: 1, offset: 1 }), few, { shown: new Set(['d']) });
      assert.equal(whole.total, 2);
      assert.deepEqual(counts(whole), { category: { news: 2 }, tag: { local: 2, sport: 1 } });
    });
  });
});
