// Where visitors reach each post the site publishes, and what a reference to
// a post leads to.
//
// A post type's address, in the site description, is a path from the site's
// root that ends in `{slug}/`, such as `/{slug}/`, or, in a hierarchical
// type, in `{path}/`, such as `/pages/{path}/`. A post's public
// address is its type's address with the post's slug in it, or its path: the
// slugs of its ancestors, from the top, and its own, joined by `/`, as
// `about-us/team/anna`. A type without an address has no page for its posts.
// On a site in several languages, a type may have an address in
// each language, and a post's public address is its language's prefix
// followed by its type's address in that language: `/sv/nyheter/{slug}/`.
//
// Internal links, redirect rules to a post and menu items take their addresses
// from here.
//
// A taxonomy may declare an address too, with `{slug}`, the term's slug, or
// in a hierarchical taxonomy `{path}`, the slugs of its parents and its own
//. Each term of it that a published post has then has a page
// there, the site design's, which joins the order of addresses as a post's
// own address does: a link, a menu entry and a rule may lead to it, as to a
// post, by its ID.

// A post's public address, a path from the site's root, or null when its
// type (the site description's, as checked) has no address. `name` is the
// post's slug, or its path in a hierarchical type. `language` is the post's,
// as the site description gives it (languages.js): on a site in several
// languages its prefix comes first, and a type with an address in each
// language gives the one in the post's.
export function publicAddress(type, name, language = null) {
  const address = unprefixedAddress(type, name, language);
  return address === null || !language?.prefix ? address : `/${language.prefix}${address}`;
}

// The address a post would have without its language's prefix: its type's
// address in its language with its slug or path, or null for a type without
// one.
export function unprefixedAddress(type, name, language = null) {
  if (type.address === null) return null;
  const address = typeof type.address === 'string' ? type.address : type.address[language.locale];
  return address.replace(/\{(slug|path)\}/, name);
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

// A feed as feedAt() gives it, in words: `the feed of Articles`, `the feed
// of the category news`.
export function feedName({ type, taxonomy, slug }) {
  return type ? `the feed of ${type.plural}` : `the feed of the ${taxonomy.label.toLowerCase()} ${slug}`;
}

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
