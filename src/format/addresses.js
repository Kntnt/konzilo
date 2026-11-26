// Where visitors reach each post the site publishes, and what a reference to
// a post leads to.
//
// A post type's address, in the site description, is a path from the site's
// root that ends in `{slug}/`, such as `/{slug}/`, or, in a hierarchical
// type, in `{path}/`, such as `/pages/{path}/`. Before it, a step may be a
// *token* a post's values fill: `{year}`, `{year}/{month}` or
// `{year}/{month}/{day}`, from the post's date in UTC, the month and the day in
// two digits, and the term of a field that takes exactly one, by the field's
// name, `{category}`, its path in a hierarchical taxonomy, its parents' slugs
// from the top and its own. A post's public address is its type's address
// filled with its values: its slug, or its path, the slugs of its ancestors,
// from the top, and its own, joined by `/`, as `about-us/team/anna`, its date
// and its term. A type without an address has no page for its posts.
// On a site in several languages, a type may have an address in
// each language, and a post's public address is its language's prefix
// followed by its type's address in that language: `/sv/nyheter/{slug}/`.
//
// Internal links, redirect rules to a post and menu items take their addresses
// from here, and filledAddress() is the one place a token is filled.
//
// A taxonomy may declare an address too, with `{slug}`, the term's slug, or
// in a hierarchical taxonomy `{path}`, the slugs of its parents and its own
//. Each term of it that a published post has then has a page
// there, the site design's, which joins the order of addresses as a post's
// own address does: a link, a menu entry and a rule may lead to it, as to a
// post, by its ID.

import { british } from '../refusals.js';

// The tokens of the post's date, in the order an address holds them.
export const DATE_TOKENS = Object.freeze(['year', 'month', 'day']);

// A slug made from a text, as the intake makes a post's from its title and a term's from its
// name: lowercase, letters without their accents, and a hyphen for each run of anything but
// letters, digits, hyphens and underscores.
export function madeSlug(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// A term's slug, from its file's data: its own, as the file gives it, or, where it gives none,
// one made from its name. The site publishes a term at it, and the form shows it alike.
export function termSlug(term) {
  const own = term?.slug;
  if (own !== undefined && own !== null && own !== '') return own;
  return madeSlug(typeof term?.name === 'string' ? term.name.trim() : '');
}

// The steps of an address, a path from the site's root that ends in `/`, each { text } or
// { token }, the name between braces of a step that is one token alone.
export function addressSteps(address) {
  return address.slice(1, -1).split('/').map((step) => {
    const token = /^\{([A-Za-z0-9_]+)\}$/.exec(step);
    return token ? { token: token[1] } : { text: step };
  });
}

// Whether a token of a type's address (`fields`, the type's as read) fills any number of steps:
// `{path}`, and the term of a hierarchical taxonomy, its path; every other token fills one.
export const takesSteps = (token, fields) => token === 'path' || Boolean(fields.find((field) => field.name === token && field.kind === 'terms')?.taxonomy?.hierarchical);

// The fields of terms whose term a type's address holds, in any of its languages, as the site
// description declares them (as checked): none for a type whose address holds none.
export function addressTermFields(type) {
  if (type?.address == null) return [];
  const all = typeof type.address === 'string' ? [type.address] : Object.values(type.address);
  const named = new Set(all.flatMap((address) => addressSteps(address).map((step) => step.token).filter(Boolean)));
  return type.fields.filter((field) => field.kind === 'terms' && named.has(field.name));
}

// An address with its tokens filled by a post's values, or null where it lacks one the
// address holds. `values`: { name, date, terms }, `name` the post's slug, or its path in a
// hierarchical type, which fills `{slug}` and `{path}`; `date`, its date, a moment as text or a
// Date, whose day in UTC fills the date's tokens; `terms`, by the name of each field whose term
// the address holds, the term's slug, or in a hierarchical taxonomy its path.
export function filledAddress(address, { name = null, date = null, terms = {} } = {}) {
  const moment = date === null || date === undefined || date === '' ? null : new Date(date);
  const day = moment === null || Number.isNaN(moment.getTime()) ? null : moment.toISOString().slice(0, 10).split('-');
  let lacking = false;
  const filled = address.replace(/\{([A-Za-z0-9_]+)\}/g, (token, inside) => {
    const value = inside === 'slug' || inside === 'path' ? name : DATE_TOKENS.includes(inside) ? day?.[DATE_TOKENS.indexOf(inside)] : terms?.[inside];
    if (typeof value === 'string' && value !== '') return value;
    lacking = true;
    return token;
  });
  return lacking ? null : filled;
}

// The values a post fills its type's address with, as its content file holds them
// (content-format.md): `name`, its slug, or its path; `data`, its frontmatter as read, a
// date as text or a Date, and a term as its file's name in its collection, its slug, or
// `<tag>/<slug>` on a site in several languages, or as Astro's reference to it, { id };
// `read(collection, id)`, a term's file by its name, its data with its `parent` named the same
// way, or null, which only a hierarchical taxonomy's term needs, for its path.
export function contentValues(type, name, data, read) {
  const terms = {};
  for (const field of addressTermFields(type)) {
    const id = termIdOf(data?.[field.name]);
    if (id === null) continue;
    const path = field.taxonomy?.hierarchical ? publishedTermPath(field.taxonomy.collection, id, read) : id.split('/').at(-1);
    if (path) terms[field.name] = path;
  }
  return { name, date: data?.date ?? null, terms };
}

// The ID of the one term a field holds, as a form, a source file or a content file holds it: the
// first of a list, or the value alone, each a term's ID, its file's name, or Astro's reference to
// it, { id }; null for none.
export function termIdOf(value) {
  const [first] = Array.isArray(value) ? value : [value];
  const id = typeof first === 'string' ? first : first?.id;
  return typeof id === 'string' && id !== '' ? id : null;
}

// A term and those above it, from the top: what `lookup(id)` gives for a term by its ID, with its
// `parent` named as termIdOf() takes it, or none at the top; or a promise of it, and then this
// gives a promise too. Gives { chain }, what `lookup` gave from the top, and, where it stopped
// short, `missing`, the ID `lookup` gave nothing for, or `loop`, where the parents go round.
export function termChain(id, lookup) {
  const chain = [];
  const seen = new Set();
  const from = (next) => {
    if (next === null) return { chain };
    if (seen.has(next)) return { chain, loop: true };
    seen.add(next);
    const take = (term) => {
      if (!term) return { chain, missing: next };
      chain.unshift(term);
      return from(termIdOf(term.parent));
    };
    const found = lookup(next);
    return typeof found?.then === 'function' ? found.then(take) : take(found);
  };
  return from(termIdOf(id));
}

// A term's path from what termChain() gives, each term with its `slug`: the slugs from the top,
// joined by `/`; null where it stopped short, or found no term.
export const termPath = ({ chain, missing, loop }) => (missing !== undefined || loop || chain.length === 0 ? null : chain.map((term) => term.slug).join('/'));

// A term's path by its published files, each named by its slug, or `<tag>/<slug>`, its `parent`
// named the same way, `read(collection, id)` giving a file's data or null.
export const publishedTermPath = (collection, id, read) => termPath(termChain(id, (next) => {
  const term = read(collection, next);
  return term && { slug: next.split('/').at(-1), parent: term.parent };
}));

// The slug, or path, that an address gives where a type's address in a language, `template`
// (addressTemplate()), holds `{slug}` or `{path}`, or null where the template cannot give the
// address: a slug is its last step, and a path the steps the others leave, one or more. Whether
// a post with that slug or path answers there is its values' to say. `multiple(token)`: whether
// a token may fill several steps, as a hierarchical taxonomy's term does.
export function nameIn(address, template, multiple = () => false) {
  const path = address.split('?')[0];
  if (!/^\/.+\/$/.test(path)) return null;
  const given = path.slice(1, -1).split('/');
  const steps = addressSteps(template);
  const head = steps.slice(0, -1);
  const taken = steps.at(-1).token === 'path' ? given.length - head.length : 1;
  if (given.includes('') || taken < 1) return null;
  return stepsGive(head, given.slice(0, given.length - taken), multiple) ? given.slice(given.length - taken).join('/') : null;
}

// What the steps `given` give the tokens of an address's steps, as addressSteps() gives them,
// each by the token's name, or null where they cannot give that address: a text the same text,
// a token any one step, or one or more, joined by `/`, where `multiple(token)` says so.
export function stepValues(steps, given, multiple = () => false) {
  const from = (i, j, values) => {
    if (i === steps.length) return j === given.length ? values : null;
    if (j === given.length) return null;
    const step = steps[i];
    if (step.token === undefined) return step.text === given[j] ? from(i + 1, j + 1, values) : null;
    const last = multiple(step.token) ? given.length : j + 1;
    for (let k = j + 1; k <= last; k += 1) {
      const found = from(i + 1, k, { ...values, [step.token]: given.slice(j, k).join('/') });
      if (found !== null) return found;
    }
    return null;
  };
  return from(0, 0, {});
}

// Whether the steps of an address can give the steps `given`, as stepValues() takes them.
export const stepsGive = (steps, given, multiple = () => false) => stepValues(steps, given, multiple) !== null;

// A type's address in a language, its tokens unfilled, after the language's prefix on a site in
// several, or null for a type without one.
export function addressTemplate(type, language = null) {
  const address = unprefixedTemplate(type, language);
  return address === null || !language?.prefix ? address : `/${language.prefix}${address}`;
}

function unprefixedTemplate(type, language) {
  if (type.address === null) return null;
  return typeof type.address === 'string' ? type.address : type.address[language.locale];
}

// A post's public address, a path from the site's root, or null when its
// type (the site description's, as checked) has no address, or the post lacks a value it
// holds. `values` are the post's, as filledAddress() takes them. `language` is the post's,
// as the site description gives it (languages.js): on a site in several
// languages its prefix comes first, and a type with an address in each
// language gives the one in the post's.
export function publicAddress(type, values, language = null) {
  const template = addressTemplate(type, language);
  return template === null ? null : filledAddress(template, values);
}

// The address a post would have without its language's prefix: its type's
// address in its language filled with its values, or null for a type without
// one.
export function unprefixedAddress(type, values, language = null) {
  const template = unprefixedTemplate(type, language);
  return template === null ? null : filledAddress(template, values);
}

// The feed whose address an address on the site is, among the
// feeds of `types` and `taxonomies` (the site description's, as checked):
// { type }, the type whose feed it is, or { taxonomy, slug }, the taxonomy
// of whose term `slug` it is the feed, `{slug}` standing for any one
// segment; null for none. A last slash makes no difference. On a site in
// several `languages` (the site description's), each language has each feed
// after its prefix, and an address without a prefix leads to the
// main language's, so it is held too.
export function feedAt(address, { types = {}, taxonomies = {}, languages = [] }) {
  const segments = (path) => path.replace(/^\//, '').replace(/\/$/, '').split('/');
  const first = segments(address);
  const prefixed = languages.length > 1 && languages.some(({ prefix }) => prefix === first[0]);
  const given = prefixed ? first.slice(1) : first;
  for (const type of Object.values(types)) {
    if (type?.feed && segments(type.feed).join('/') === given.join('/')) return { type };
  }
  for (const taxonomy of Object.values(taxonomies)) {
    if (!taxonomy?.feed) continue;
    const feed = segments(taxonomy.feed);
    if (feed.length === given.length && feed.every((segment, i) => segment === '{slug}' || segment === given[i])) {
      return { taxonomy, slug: given[feed.indexOf('{slug}')] };
    }
  }
  return null;
}

// The addresses of a site's search pages, from its site
// description as checked, `search` and `languages`: on a site in several
// languages each language's, its prefix followed by the declared address,
// in the languages' order, and on any other the declared address;
// none for a site without search.
export function searchPages({ search = null, languages = [] }) {
  if (search === null) return [];
  return languages.length > 1 ? languages.map(({ prefix }) => `/${prefix}${search.address}`) : [search.address];
}

// A feed as feedAt() gives it, as a refusal names it, by name in the catalogues
// (refusals.js): `the feed of articles`, `the feed of the category news`.
export function feedWords({ type, taxonomy, slug }) {
  return type ? { name: 'about.feed-type', values: { plural: { label: type.plural } } } : { name: 'about.feed-term', values: { taxonomy: { label: taxonomy.label }, slug } };
}

// The same in British English, as the build's log writes it.
export const feedName = (feed) => british(feedWords(feed));

// The pages of a post list with pages of its own: page 1 is the
// post's own address, and page `n` from 2 is `<address>page/<n>/`. Every address below `<address>page/` is the post's, in the
// order of addresses, whether a page is there or not.
export function listPageAddress(address, page) {
  return page === 1 ? address : `${address}page/${page}/`;
}

// The addresses of the posts whose list's pages an address on the site
// would be below, the shortest first: each path that ends right before a
// segment `page` with a segment after it. `/pages/news/page/2/` would be
// below the pages of `/pages/news/`; its query, if any, does not count.
export function listPageOwners(address) {
  const segments = address.split('?')[0].split('/');
  const owners = [];
  for (let i = 1; i < segments.length - 1; i += 1) {
    if (segments[i] === 'page' && segments.slice(i + 1).some((segment) => segment !== '')) owners.push(`${segments.slice(0, i).join('/')}/`);
  }
  return owners;
}

// A post's canonical address, where it names one of its own: a whole `http://` or
// `https://` address, with a host and no user name, and no space. The editor's field takes
// the same pattern, so that what it lets through the intake writes.
export const CANONICAL_PATTERN = '^https?://[^\\s/?#@]+(?:[/?#]\\S*)?$';

// The canonical address `text` names, as a browser sends it, or null where it names none.
export function canonicalAddress(text) {
  if (typeof text !== 'string' || !new RegExp(CANONICAL_PATTERN).test(text)) return null;
  try {
    const url = new URL(text);
    return url.hostname === '' ? null : url.href;
  } catch {
    return null;
  }
}
