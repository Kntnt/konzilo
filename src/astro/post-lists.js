// Post lists on the site: each list in a body, evaluated at
// build against the content collections of the content folder the build
// reads, the public site's or a preview's, and handed to the presentation
// the site registers for it (`konzilo({ presentations })`). Body.astro
// evaluates a body's lists in the body's order, so that a list can leave out
// the posts the lists above it showed. A site's template may call
// listedPosts() too, for the posts a list's settings name, and
// relatedPosts(), for "Read more" under an article, from
// `@kntnt/konzilo/astro/post-lists`. A list ordered as related and
// relatedPosts() rank alike, by the score and the freshness of
// ../post-lists.js, with the half-life of the settings group `related`.
//
// One list in a post may have pages of its own: page 1 is the post's own
// address, and page `n` from 2 `<address>page/<n>/`. The site's route for a
// type builds them from postPages(), and gives Body and Head the page; the
// list shows that page's slice, the other lists their first, and the
// presentation is given the pager's data, which Pager.astro renders.
//
// The evaluator itself is ../post-lists.js, a pure function free of Astro.
// What it needs of the site, the integration gives through its module
// `virtual:konzilo/post-lists` (index.js): the presentations' components,
// the types' collections and fields, what a list may name and the site's
// language. On a site in several languages, a list shows the
// posts in the language of the post it sits in, the main language's
// outside a post, each at its address in its language, and its text where
// it matches nothing is in that language (site-texts.js).

import { getCollection } from 'astro:content';
import { presentations, site } from 'virtual:konzilo/post-lists';
import { textsIn } from 'virtual:konzilo/texts';
import { textsOf } from '../catalogues.js';
import { listPageAddress } from '../format/addresses.js';
import { readPostList, SECOND_PAGED_LIST } from '../format/post-list.js';
import { british } from '../refusals.js';
import { relatedPoints } from '../format/built-in-types.js';
import rules from '../format/rules.json' with { type: 'json' };
import { evaluate, pageCount } from '../post-lists.js';
import { coreSettingsGroups } from '../settings-groups.js';
import { describedSite, entryAddress, entryLanguage, entryName, siteLanguages } from './languages.js';
import { postListsIn } from './reader.js';
import { siteSettings } from './site-settings.js';
import { termRoute, termsBelow, termsWithPages } from './term-pages.js';

const { attributes } = rules.elements['post-list'].directive;

// The pager's texts, in the catalogues (ADR 0066) under `site.pager.`: the
// label of its `nav`, a page's link's name, `{n}` its number, and the links to
// the page before and after.
const PAGER_TEXTS = 'site.pager.';

// The posts each list on a page has shown, by type: one for a page, which
// each list of its body adds to.
export function shownOnPage() {
  return new Map();
}

// The pages whose list with pages of their own has been met, by their
// shownOnPage(): one list in a post may have pages.
const paged = new WeakSet();

// A list, by its attributes as Body reads them from the list's plain
// rendering: { component, posts, options, empty, pager }, the
// presentation's component and what it is given. `post`: the entry of the
// post the list sits in, if any. `shown`: shownOnPage() of the page, which
// the list's own posts join. `page`: the page of the post shown, from 1,
// which a list with pages of its own shows; every other list shows its
// first slice. `pager` is null but for a list with pages in a post with an
// address: the pager's data (pagerOf()).
export async function postList(given, { post, shown = shownOnPage(), page = 1 } = {}) {
  const read = settingsOf(given, post);
  let at = 1;
  let address = null;
  if (read.settings.pages === true) {
    if (paged.has(shown)) throw new Error(`a post list${post ? ` in ${post.collection}/${post.id}` : ''}: ${british(SECOND_PAGED_LIST)}`);
    paged.add(shown);
    address = post ? addressOf(post) : null;
    if (address !== null) at = page;
  }
  const { posts, pages } = await listed(read.query, { post, shown, page: at, counting: address !== null });
  const component = presentations[read.settings.presentation];
  const declared = site.lists.presentations[read.settings.presentation];
  const options = Object.fromEntries(declared.options.map((option) => [option.name, read.settings[option.name] ?? (option.type === 'boolean' ? false : undefined)]));
  const locale = languageOf(post)?.locale ?? null;
  const pager = address === null ? null : pagerOf(address, at, pages, locale);
  return { component, posts, options, empty: read.settings.empty ?? textsIn(locale).emptyList, pager };
}

// The posts a list with these settings shows, as a template may ask for
// them: the settings are a post list's attributes, typed (`{ type:
// 'article', include: 'category:news', number: 3 }`),
// with no presentation needed. Each is { entry, url }, the post's entry of
// its collection and its address on the site, below the site's base, or
// null for a type without one. Throws, naming why, for settings the site
// cannot list by. Such a list shows its first slice.
export async function listedPosts(settings, { post, shown = shownOnPage() } = {}) {
  const [first] = Object.keys(site.lists.presentations);
  return (await listed(settingsOf({ presentation: first, ...settings }, post).query, { post, shown })).posts;
}

// The number of related posts relatedPosts() gives, by default.
export const RELATED_POSTS = 3;

// The posts related to a post, as "Read more" under it shows them, in an
// article's template:
//
//   const related = await relatedPosts(article);
//
// The posts of its own type that share its terms, ranked as a list ordered
// as related ranks them, without the post itself: at most `number`, fewer
// where fewer share a term, and none where none does. An article's score a
// point for each topic they share with it and half a point for its
// category, another type's a point for each term they share, of any
// taxonomy, and each score is multiplied by its post's freshness, by the
// half-life of the settings group `related`. Each is { entry, url }, as
// listedPosts() gives them. Throws, naming why, for a post of a type
// without terms.
export async function relatedPosts(post, { number = RELATED_POSTS } = {}) {
  const [name] = typeOf(post);
  if (!name) throw new Error('Konzilo: relatedPosts() takes the entry of a post, from the collection of one of the site\'s types');
  return (await listed(settingsOf({ type: name, order: 'related', number }, post).query, { post, shown: shownOnPage() })).posts;
}

// The pages a site's route for a type builds from its entries,
// whatever the type's address: each entry's own, and, for a post whose
// list has pages of its own, one for each later page its list fills. Each
// is { entry, page, param }: the page, from 1, which the route gives Body
// and Head, and the route's rest parameter in place of the address's
// `{slug}` or `{path}`, the entry's slug or path for page 1 and
// `<slug or path>/page/<n>` for page `n`, so that the page is at
// `<address>page/<n>/`; on a site in several languages, a route
// by each post's whole address takes entryPages() of
// `@kntnt/konzilo/astro/languages`, which builds on these:
//
//   export async function getStaticPaths() {
//     return (await postPages(await getCollection('articles')))
//       .map(({ entry, page, param }) => ({ params: { slug: param }, props: { article: entry, page } }));
//   }
//
// The addresses below a post's `page/` are its own: an entry
// there, which the intake refuses but whose file a refused post keeps, has
// no page. A post with a second list with pages, or a list the site cannot
// read, gets its own page alone, which Body fails on, naming why.
export async function postPages(entries) {
  const pages = [];
  const withPages = [];
  for (const entry of entries) {
    // A post whose lists the site cannot read, as a refused post's file the
    // dev server still holds once the site description has changed, keeps
    // its own page, which says why as Body renders it, and the type's other
    // posts theirs.
    let count;
    try {
      count = await pagesOf(entry);
    } catch {
      count = null;
    }
    if (count !== null) withPages.push(`${entry.id}/page/`);
    const name = entryName(entry.id, siteLanguages());
    for (let page = 1; page <= (count ?? 1); page += 1) pages.push({ entry, page, param: page === 1 ? name : `${name}/page/${page}` });
  }
  return pages.filter(({ entry }) => !withPages.some((below) => entry.id.startsWith(below)));
}

// How many pages a post's list with pages of its own fills, its lists above
// it evaluated first, as Body evaluates them; null for a post with no such
// list, or no address for its pages.
async function pagesOf(entry) {
  const lists = postListsIn(entry.body);
  const withPages = lists.filter((given) => given.pages === true);
  if (withPages.length === 0 || addressOf(entry) === null) return null;
  if (withPages.length > 1) throw new Error(`a post list in ${entry.collection}/${entry.id}: ${british(SECOND_PAGED_LIST)}`);
  const shown = shownOnPage();
  for (const given of lists) {
    const { query, settings } = settingsOf(given, entry);
    const { pages } = await listed(query, { post: entry, shown, counting: settings.pages === true });
    if (settings.pages === true) return pages;
  }
  return null;
}

// The pager of a list with pages of its own, on page `current` of `count`,
// in a post at `address`: { label, items, previous, next }, the label of
// its `nav`; each page as { number, url, label, current }, or { gap: true }
// where pages are left out, every page shown up to seven, else the first,
// the last and the two on either side of the current one; and the links to
// the page before and after, { url, label }, or null on the first and the
// last. Each address is below the site's base. The texts are in the site's
// language (PAGER_TEXTS), or in `locale`, the post's language's locale, on a
// site in several.
export function pagerOf(address, current, count, locale = site.locale?.replace('-', '_') ?? null) {
  const texts = textsOf(locale, PAGER_TEXTS);
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const url = (n) => `${base}${listPageAddress(address, n)}`;
  const shown = Array.from({ length: count }, (_, i) => i + 1)
    .filter((n) => count <= 7 || n === 1 || n === count || Math.abs(n - current) <= 2);
  const items = [];
  shown.forEach((n, i) => {
    if (i > 0 && n - shown[i - 1] > 1) items.push({ gap: true });
    items.push({ number: n, url: url(n), label: texts.page.replace('{n}', String(n)), current: n === current });
  });
  return {
    label: texts.label,
    items,
    previous: current > 1 ? { url: url(current - 1), label: texts.previous } : null,
    next: current < count ? { url: url(current + 1), label: texts.next } : null,
  };
}

// The number of posts on each of a term's pages, by default.
export const TERM_PAGE_POSTS = 10;

// The pages of a taxonomy's terms, as the getStaticPaths() of the
// site's term page gives them, for the route the integration puts at the
// address of each taxonomy that declares one (`konzilo({ termPage })`):
//
//   export async function getStaticPaths({ routePattern }) {
//     return termPages(routePattern);
//   }
//
// Each is { params, props }: the route's rest parameter `term`, the term's
// slug or path, then `page/<n>` from page 2; and `term`, the term's entry
// of its taxonomy's collection, `page`, from 1, `posts`, the posts the page
// lists, each { entry, url } as a list's, `pager`, the pager's data
// (pagerOf()), null for a term whose posts fit on one page, and `empty`, the
// text for a term with no post, the site's text for a list that matches
// nothing in the term's language (site-texts.js). A term's posts are those
// of every type that takes the taxonomy, filed under it or a
// term below it, as its feed holds them, in one list through the
// evaluator, newest first where a type has a date, a post without one
// last, else by title, `number` a page; a post of a type without an
// address is listed without a link, as a list lists it. A term with no
// post has its one page, with none. Only a term in the site's main
// language has pages.
export async function termPages(routePattern, { number = TERM_PAGE_POSTS } = {}) {
  const [name, taxonomy] = Object.entries(site.taxonomies).find(([, one]) => termRoute(one.address) === routePattern.replace(/\/$/, '')) ?? [];
  if (!taxonomy) throw new Error(`Konzilo: no taxonomy of the site description has its terms' pages at ${routePattern}`);
  const entries = await getCollection(taxonomy.collection);
  // Each post of every type that takes the taxonomy, by an id of its own
  // among them all, its collection's and its entry's.
  const byId = new Map();
  for (const typeName of taxonomy.types) {
    const type = site.types[typeName];
    for (const entry of await getCollection(type.collection)) {
      byId.set(`${type.collection}/${entry.id}`, { entry, typeName, post: { ...listablePost(entry, type), id: `${type.collection}/${entry.id}` } });
    }
  }
  const listable = [...byId.values()].map(({ post }) => post);
  const dated = taxonomy.types.some((typeName) => site.types[typeName].fields.includes('date'));
  const language = languageOf(null);
  const empty = textsIn(language?.locale ?? null).emptyList;
  const paths = [];
  for (const { entry, path, address } of termsWithPages(taxonomy, entries)) {
    const param = taxonomy.address.includes('{slug}') ? entry.id : path;
    const query = {
      type: null,
      include: { [name]: [entry.id, ...termsBelow(entry, entries)] },
      exclude: {},
      where: [],
      ...(dated ? { order: 'date', direction: 'descending', orderType: 'date' } : { order: 'title', direction: 'ascending', orderType: undefined }),
      offset: 0,
      number,
      leaveOutThis: false,
      leaveOutShown: false,
    };
    const count = pageCount(query, listable, { locale: site.locale });
    for (let page = 1; page <= count; page += 1) {
      const posts = evaluate(query, listable, { locale: site.locale, page }).map(({ id }) => listedEntry(byId.get(id)));
      paths.push({
        params: { term: page === 1 ? param : `${param}/page/${page}` },
        props: { term: entry, page, posts, pager: count > 1 ? pagerOf(address, page, count) : null, empty },
      });
    }
  }
  return paths;
}

// A listed post, { entry, typeName }, as a list gives it: { entry, url },
// its address below the site's base, or null for a type without one.
function listedEntry({ entry, typeName }) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const address = entryAddress(describedSite().types[typeName], entry.id, siteLanguages());
  return { entry, url: address === null ? null : `${base}${address}` };
}

// A list's settings, read and checked as the build checks a content file's.
function settingsOf(given, post) {
  const problems = [];
  for (const [name, value] of Object.entries(given)) {
    const setting = attributes[name];
    if (!setting) continue;
    const fits = setting.type === 'string' ? typeof value === 'string' : setting.type === 'integer' ? Number.isInteger(value) : typeof value === 'boolean';
    const allowed = fits && (!setting.values || setting.values.includes(value)) && (!setting.pattern || new RegExp(setting.pattern).test(String(value)));
    if (!allowed) problems.push(`the site cannot list by the setting ${JSON.stringify(name)} with the value ${JSON.stringify(value)}`);
  }
  const read = problems.length > 0 ? { problems } : readPostList(given, site.lists, { attributes, side: 'file' });
  if (read.problems.length > 0) throw new Error(`a post list${post ? ` in ${post.collection}/${post.id}` : ''}: ${read.problems.map(british).join('; ')}`);
  return read;
}

// The posts a query lists on page `page`, each joining `shown`, as { posts,
// pages }: `pages`, with `counting`, how many pages the list fills, else 1.
async function listed(query, { post, shown, page = 1, counting = false }) {
  const type = site.types[query.type];
  const languages = siteLanguages();
  const language = languageOf(post);
  const entries = (await getCollection(type.collection)).filter((entry) => languages.length <= 1 || entryLanguage(entry.id, languages) === language);
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const current = post ? currentPost(post) : null;
  if (!shown.has(query.type)) shown.set(query.type, new Set());
  const seen = shown.get(query.type);
  const listable = entries.map((entry) => listablePost(entry, type));
  const declared = describedSite().types[query.type];
  const related = query.order === 'related' ? { points: relatedPoints(declared), halfLife: await halfLife() } : {};
  const options = { current, shown: seen, locale: site.locale, ...related };
  const pages = counting ? pageCount(query, listable, options) : 1;
  const posts = evaluate(query, listable, { ...options, page });
  for (const one of posts) seen.add(one.id);
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL.slice(0, -1) : import.meta.env.BASE_URL;
  // An entry's id is its path in the collection, which a hierarchical type's
  // address takes as `{path}`, in its language's folder on a site
  // in several languages, whose prefix its address takes.
  return {
    posts: posts.map(({ id }) => {
      const address = entryAddress(declared, id, languages);
      return { entry: byId.get(id), url: address === null ? null : `${base}${address}` };
    }),
    pages,
  };
}

// The settings group of related posts (format/settings-groups.json).
const RELATED = 'related';

// The days in which a related post's freshness halves, as the site settings
// give them, the main language's, which every language shares: null with
// freshness switched off, and the group's defaults where the settings have
// none.
async function halfLife() {
  const group = coreSettingsGroups().find(({ name }) => name === RELATED);
  const defaults = Object.fromEntries(group.settings.map((setting) => [setting.name, setting.default]));
  const { freshness, halfLife: days } = { ...defaults, ...(await siteSettings())?.[RELATED] };
  return freshness ? days : null;
}

// The type of an entry's collection, as [name, type], or [].
function typeOf(entry) {
  return Object.entries(site.types).find(([, one]) => one.collection === entry.collection) ?? [];
}

// The public address of the post an entry is, from the site's root, in its
// language, or null for a type without one.
function addressOf(entry) {
  const [name] = typeOf(entry);
  return name ? entryAddress(describedSite().types[name], entry.id, siteLanguages()) : null;
}

// The language of the post a list sits in, or the main language's outside
// a post; null on a site that declares none.
function languageOf(post) {
  const languages = siteLanguages();
  return post ? entryLanguage(post.id, languages) : (languages[0] ?? null);
}

// The post a list sits in, as the evaluator takes it, with its type.
function currentPost(entry) {
  const [name, type] = typeOf(entry);
  return name ? { type: name, ...listablePost(entry, type) } : null;
}

// An entry as the evaluator takes a listable post: its slug, its title, its
// terms by taxonomy and the fields a list filters on and orders by.
function listablePost(entry, type) {
  return {
    id: entry.id,
    title: entry.data.title,
    terms: Object.fromEntries(type.terms.map(({ field, taxonomy }) => [taxonomy, (entry.data[field] ?? []).map((reference) => reference.id)])),
    fields: Object.fromEntries(type.fields.map((field) => [field, entry.data[field]])),
  };
}
