// The evaluator of post lists: one pure function of a list's
// query and the listable posts' data, which gives the posts the list shows,
// in order. The site's build runs it for each post list in a body, in the
// body's order (astro/post-lists.js), and a site's templates may call it
// too, for related posts in an article's template. It imports nothing and
// uses nothing but the language, so a browser can run it later, against a
// JSON index of the listable posts that a build would write.
//
// A query, as queryOf() in format/blocks.js reads a list's attributes:
//
//   { type,                                  the post type listed
//     include: { <taxonomy>: [<slug>] },     each taxonomy's terms, any of them
//     exclude: { <taxonomy>: [<slug>] },     each taxonomy's terms, none of them
//     where: [ { field, op, value, type } ], conditions, every one of them
//     order, direction,                      date, title, related or a field;
//                                            ascending or descending; related
//                                            by score and freshness, below
//     orderType,                             the type of the field ordered by
//     offset, number,                        the posts skipped, then shown
//     leaveOutThis, leaveOutShown }          leave out this post, and the
//                                            posts the lists above showed
//
// A condition's op is `=`, `!=`, `<`, `<=`, `>` or `>=`; its type is the
// field's, `text`, `choice`, `boolean`, `number`, `integer` or `date`, a
// date's value a day, `YYYY-MM-DD`, which the post's date is compared with
// by its day in UTC.
//
// A listable post: { id, title, terms: { <taxonomy>: [<slug>] }, fields: {
// <name>: value } }, its id its slug, its fields `date` and
// `modified` among them, a date as a Date, its ISO text or its time in
// milliseconds.

// The posts a list shows, in order: the posts that pass its filter, in its
// order, with ties falling to the title, then the slug, without this post
// and the posts shown above where it leaves them out, from its offset, at
// most its number.
//
// `current`: this post, the one the list sits in, as a listable post with
// its `type`, or null; *related* ranks by the terms each post shares with
// it, and gives nothing without it. `shown`: the ids of the posts of the
// list's type that the lists above it on the page showed. `locale`: the
// language titles are compared in, a BCP 47 tag; by default the runtime's.
// `page`: for a list with pages of its own, the page shown, from 1: each
// page holds the list's number of posts, after its offset and what it
// leaves out, so that no post is on two pages and none is missing; a page
// beyond the last holds none.
//
// *Related* ranks by a score: `points`, what each term a post shares with
// this post scores, by taxonomy, nothing in a taxonomy it leaves out, such
// as `{ topics: 1, category: 0.5 }` for an article; where it is null, by
// default, one point for a shared term of any taxonomy. A post that scores
// nothing is never listed. `halfLife`: the days in which a post's freshness
// halves, or null, by default, for no freshness: with one, each score is
// multiplied by 2^(-age / halfLife), the age its post's from its date to
// `now`, by default the moment it runs, and a post without a date is not
// decayed. Highest first, then newest, then by title. Every post ages
// alike, so the order of posts with a date is the same whatever `now` is.
export function evaluate(query, posts, { page = 1, ...options } = {}) {
  return matches(query, posts, options).slice((page - 1) * query.number, page * query.number);
}

// How many pages a list with pages of its own has: as many as
// its matches fill, after its offset and what it leaves out, at its number
// a page, and at least one, the post's own address. The options are
// evaluate()'s.
export function pageCount(query, posts, options = {}) {
  return Math.max(1, Math.ceil(matches(query, posts, options).length / query.number));
}

// Every post a list shows on any page, in order, from its offset.
function matches(query, posts, { current = null, shown = new Set(), locale, points = null, halfLife = null, now = Date.now() } = {}) {
  const collator = new Intl.Collator(locale, { numeric: true });
  const byTitle = (a, b) => collator.compare(a.post.title, b.post.title) || (a.post.id < b.post.id ? -1 : a.post.id > b.post.id ? 1 : 0);

  // 1. Filter.
  const conditions = query.where.map(condition);
  const matching = [];
  for (const post of posts) {
    if (!termsMatch(post, query) || !conditions.every((holds) => holds(post))) continue;
    matching.push({ post });
  }

  // 2. Order.
  let ordered;
  if (query.order === 'related') {
    const own = current ? termSets(current) : null;
    const rank = rankOf(halfLife, now);
    ordered = matching
      .map((one) => ({ ...one, shared: own ? sharedTerms(one.post, own, points) : 0, time: timeOf(one.post.fields?.date) }))
      .filter((one) => one.shared > 0)
      .map((one) => ({ ...one, rank: rank(one.shared, one.time) }))
      .sort((a, b) => b.rank - a.rank || later(a.time, b.time) || byTitle(a, b));
  } else if (query.order === 'title') {
    const sign = query.direction === 'descending' ? -1 : 1;
    ordered = matching.sort((a, b) => sign * collator.compare(a.post.title, b.post.title) || byTitle(a, b));
  } else {
    const key = keyOf(query.orderType, collator);
    const sign = query.direction === 'descending' ? -1 : 1;
    ordered = matching
      .map((one) => ({ ...one, key: key.of(one.post.fields?.[query.order]) }))
      .sort((a, b) => missingLast(a.key, b.key) ?? (sign * key.compare(a.key, b.key) || byTitle(a, b)));
  }

  // 3. Leave out this post and the posts shown above.
  const left = ordered.filter(({ post }) => {
    if (query.leaveOutThis && current && current.type === query.type && current.id === post.id) return false;
    return !(query.leaveOutShown && shown.has(post.id));
  });

  // 4. Offset; the number is the page's (evaluate()).
  return left.slice(query.offset).map(({ post }) => post);
}

// Whether a post has, in each taxonomy, any of the terms included and none
// of those excluded.
function termsMatch(post, { include, exclude }) {
  for (const [taxonomy, slugs] of Object.entries(include)) {
    const own = post.terms?.[taxonomy] ?? [];
    if (!slugs.some((slug) => own.includes(slug))) return false;
  }
  for (const [taxonomy, slugs] of Object.entries(exclude)) {
    const own = post.terms?.[taxonomy] ?? [];
    if (slugs.some((slug) => own.includes(slug))) return false;
  }
  return true;
}

// A condition as a test of a post. A post without a value for the field
// meets no condition on it but `!=`.
function condition({ field, op, value, type }) {
  const key = type === 'date' ? dayOf : type === 'number' || type === 'integer' ? Number : (one) => one;
  const wanted = key(value);
  return (post) => {
    const own = post.fields?.[field];
    if (own === undefined || own === null || own === '') return op === '!=';
    const have = key(own);
    switch (op) {
      case '=': return have === wanted;
      case '!=': return have !== wanted;
      case '<': return have < wanted;
      case '<=': return have <= wanted;
      case '>': return have > wanted;
      case '>=': return have >= wanted;
      default: return false;
    }
  };
}

// A date's day in UTC, `YYYY-MM-DD`, which orders as text does.
function dayOf(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const time = timeOf(value);
  return time === null ? null : new Date(time).toISOString().slice(0, 10);
}

// A date's time in milliseconds, or null.
function timeOf(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return value;
  const time = value instanceof Date ? value.valueOf() : Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

// Newest first; a post without a date after those with one.
function later(a, b) {
  return missingLast(a, b) ?? b - a;
}

// The order of two keys when either is missing, which comes last whatever
// the direction; undefined when both are there.
function missingLast(a, b) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return undefined;
}

// How a field's values order: a date by its time, a number as a number, a
// yes-or-no field no before yes, text by the site's language.
function keyOf(type, collator) {
  if (type === 'date') return { of: timeOf, compare: (a, b) => a - b };
  if (type === 'number' || type === 'integer') return { of: (value) => (typeof value === 'number' ? value : null), compare: (a, b) => a - b };
  if (type === 'boolean') return { of: (value) => (typeof value === 'boolean' ? Number(value) : null), compare: (a, b) => a - b };
  return { of: (value) => (typeof value === 'string' && value !== '' ? value : null), compare: (a, b) => collator.compare(a, b) };
}

// A post's terms as a set per taxonomy.
function termSets(post) {
  return Object.fromEntries(Object.entries(post.terms ?? {}).map(([taxonomy, slugs]) => [taxonomy, new Set(slugs)]));
}

// A day in milliseconds.
const DAY = 86_400_000;

// A related post's rank, by which it is ordered, highest first: its score,
// or, with a half-life in days, its score times its freshness, 2^(-age /
// half-life), its age from `now` to its date, and no age for a post without
// one. Every post ages alike, so the rank is taken as log2(score) + date /
// half-life, which orders as the score times its freshness does and leaves
// `now` out for each post with a date: the order of such posts is the same
// at every build moment, to the last bit. It is rounded to a billionth of a
// halving, so that two posts whose scores times freshness are the same tie,
// and fall to the newer.
function rankOf(halfLife, now) {
  if (halfLife === null) return (score) => score;
  const span = halfLife * DAY;
  return (score, time) => Math.round((Math.log2(score) + (time ?? now) / span) * 1e9);
}

// The points a post scores for the terms it shares with this post's sets:
// each shared term the points of its taxonomy in `points`, none for a
// taxonomy it does not name, or one point for a term of any taxonomy where
// `points` is null.
function sharedTerms(post, own, points) {
  let shared = 0;
  for (const [taxonomy, slugs] of Object.entries(post.terms ?? {})) {
    const set = own[taxonomy];
    const each = points === null ? 1 : points[taxonomy] ?? 0;
    if (!set || each === 0) continue;
    for (const slug of slugs) if (set.has(slug)) shared += each;
  }
  return shared;
}
