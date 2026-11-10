// An article's authors (ADR 0062, ADR 0046): the terms of its field `authors`, of the
// built-in taxonomy of that name, in the order its editor gave them, which the intake
// keeps, for its structured data and for a template's byline.
//
// Each author is { entry, name, slug, url }: its term's entry, as Astro's getEntries()
// gives one; its name; its slug, which every language shares, below a language's folder
// on a site in several languages; and its page's address, a path from the site's root,
// where the authors taxonomy declares an address and the author has a page (term-pages.js),
// else null. A post of any other type than the built-in article has none.

import { AUTHORS, isArticle } from '../format/built-in-types.js';

// The authors of `entry`, a post of the type `type`, as the site description `site` (as
// checked) reads it, by Astro's getEntries(); an author whose file the build has not got is
// left out.
export async function articleAuthors(entry, type, site, getEntries) {
  const references = isArticle(type) ? entry?.data?.[AUTHORS] ?? [] : [];
  if (references.length === 0) return [];
  const taxonomy = site.taxonomies?.[AUTHORS] ?? null;
  return (await getEntries(references)).filter(Boolean).map((term) => ({
    entry: term,
    name: term.data.name,
    slug: term.id.split('/').at(-1),
    url: pageOf(term, taxonomy),
  }));
}

// An author's page's address: only a term at its collection's root has one, a term of the
// site's main language, as term-pages.js says. The authors have no parents, so its path is
// its slug.
function pageOf(term, taxonomy) {
  if (!taxonomy?.address || term.id.includes('/')) return null;
  return taxonomy.address.replace('{slug}', term.id).replace('{path}', term.id);
}
