# ADR 0053: Search with Typesense, indexed from the published files

**Date:** 2026-10-29, amended 2026-11-11 · **Status:** Accepted, Typesense settled by Thomas on 2026-10-29. The rest is a technical choice; Thomas may veto.

## Decision

- **The index.** Each site has a collection, an alias named as the site, and a key that only searches it. Every build makes the site's documents from its content files once `current` is switched, imports them into a new collection and switches in one step. A failed indexing leaves the release live, is said in the build's line, `unindexed`, and alerts in office hours.
- **The documents and the schema** come from one function of the npm package, which reads the content files as the site does. A type takes part unless it says `"search": false`. A post marked `noindex` has no document. Typesense stems a field in the language its `locale` names; a language it has no stemmer for is tokenised unstemmed. Infix search is on the title and the body alone, since it costs memory.
- **The route.** `GET /_konzilo/search` takes `q`, `page` and `filter_by` alone, drops every header of the visitor's, and adds a scoped key made from the site's search key, which holds the search every query runs, the fields and their weights, infix, typos, a page of ten results, so that a visitor's query can change none of them. No page holds a key. It answers `405`, `404` and, while Typesense does not answer, `502` with a message.
- **The search page** is a page of the site's design at the address `search` declares; its script asks the route and shows the results. In a preview it says that search is not there. A type whose own folder holds that address is refused; one at the root leaves it to its posts.
- **Per language,** one index, each document with its language; each language's texts in fields of their own with that language's analysis, `title_sv`; each language's search page after its prefix, through `filter_by`.
- **Locally,** Compose runs the same Typesense, in a network of its own that only the web server shares, with no port and no way out (ADR 0005). The seed makes its admin key and the site's search key once, and Typesense reads its admin key from a configuration file, never the environment. The builder indexes at each switch of `current` and at its first build after a start, which keeps no word of an index made before, with the documents that `konzilo-search documents` makes in the site's own dependencies, as a program of its own, since the builder's image has no Astro to read content files with; and it writes the route for the web server, with the scoped key, in a volume of its own, outside every release; on a site without search, a route that says there is none. The web server answers the route as the dev server does: it passes on each of `q`, `page` and `filter_by` as decoded and encoded again in Typesense's address, `page` 1 where none is given, and leaves out every other parameter; a value given twice comes as the two joined by a comma.

## Why

- Only Typesense's infix search finds a word inside a Swedish compound.
- An index made from the published files never holds a draft and needs no backup.

## Considered and rejected

- **Pagefind,** which has no infix matching.
- **Keys in the browser.**
- **Indexing scraped HTML.**
