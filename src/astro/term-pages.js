// Term pages: where each term of a taxonomy whose description
// declares an address has its page, the site design's term page, which the
// integration puts at the taxonomy's address (index.js), and which the
// sitemap and each page's head know. The posts each page lists come from
// termPages() in post-lists.js.
//
// A term's page is at its taxonomy's address with `{slug}`, the term's
// slug, or `{path}`, the slugs of its parents from the top and its own, as
// a term's file and its `parent` give them: `/category/news/local/`. Only a
// term in the site's main language has one, a file at its collection's
// root, until each language has term pages of its own.

// The route of a taxonomy's terms' pages, as the integration injects it:
// its address with a rest parameter, `term`, in place of `{slug}` or
// `{path}`, so that a term's later pages are below its own page, at
// `<address>page/<n>/`.
export function termRoute(address) {
  return address.replace(/\{(slug|path)\}/, '[...term]').replace(/\/$/, '');
}

// The terms of a taxonomy with pages among `entries`, the entries of its
// collection as Astro's getCollection gives them: each { entry, path,
// address }, the term's path, its slugs from the top, and its page's
// address; a term whose parent the collection has not got has none.
export function termsWithPages(taxonomy, entries) {
  const own = entries.filter((entry) => !entry.id.includes('/'));
  const byId = new Map(own.map((entry) => [entry.id, entry]));
  const pathOf = (entry) => {
    const slugs = [entry.id];
    for (let next = entry; next.data.parent && slugs.length < 100;) {
      next = byId.get(next.data.parent.id ?? next.data.parent);
      if (!next) return null;
      slugs.unshift(next.id);
    }
    return slugs.join('/');
  };
  return own.flatMap((entry) => {
    const path = pathOf(entry);
    return path === null ? [] : [{ entry, path, address: taxonomy.address.replace('{slug}', entry.id).replace('{path}', path) }];
  });
}

// The terms below a term among `entries` (as termsWithPages() takes them),
// at any depth, by their ids: their posts are the term's too.
export function termsBelow(entry, entries) {
  const below = [];
  const under = (id) => entries.filter((one) => (one.data.parent?.id ?? one.data.parent) === id);
  for (let level = under(entry.id); level.length > 0 && below.length < 10_000; level = level.flatMap((one) => under(one.id))) {
    below.push(...level.map((one) => one.id).filter((id) => !below.includes(id) && id !== entry.id));
  }
  return below;
}

// The taxonomy of the site description `site` (as checked) whose terms an
// entry of a collection is, when it declares an address, or null.
export function taxonomyWithPages(site, entry) {
  return Object.values(site.taxonomies ?? {}).find((taxonomy) => taxonomy?.address != null && taxonomy.collection === entry?.collection) ?? null;
}
