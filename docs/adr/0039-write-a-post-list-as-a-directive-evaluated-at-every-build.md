# ADR 0039: Write a post list as a directive evaluated at every build

**Date:** 2026-10-29, amended 2026-11-11 · **Status:** Accepted. Settled by Thomas on 2026-10-29: a query component with a query builder; evaluated at build; open to fully dynamic lists later; shown by presentations the site registers; no archive by default. Settled by Thomas on 2026-11-10: related posts by shared topics and category times freshness (ADR 0070). The rest is a technical choice; Thomas may veto.

## Decision

- **A post list** is the leaf directive `::post-list{…}` with no body. Its attributes, in this order: `type` and `presentation`, required; `include` and `exclude`, `<taxonomy>:<term>,<term>`, taxonomies apart by a space; `where`, conditions `<field><op><value>` apart by `;`, its op one of `=`, `!=`, `<`, `<=`, `>` and `>=`, a date's value a day, and `;` and `%` in a text as `%3B` and `%25`; `order` and `direction`; `offset`, 0, and `number`, 10, from 1 to 100; `leaveOutThis` and `leaveOutShown`, `true`; `pages`, `false`; and `empty`, the list's own text. The options of its presentation follow.
- **In the field,** a dialog is the query builder, and the canvas shows a sentence such as *10 articles in News and not in Sport, by title, from the 2nd, as Cards (Columns: 3).* Terms are kept by ID in source and written as slugs. One no longer there is left out with a warning, and a group left without terms with it.
- **The evaluator** is one pure function, free of Astro, run at every build in the body's order: filter, order, leave out, then offset and number. *Related* ranks by a score of the terms each post shares with this one, times its freshness, and keeps only posts that score, as [ADR 0070](0070-rank-related-posts-by-shared-topics-and-category-times-a-freshness-that-halves.md) has it. Without `order`, a type with a date is newest first, else by title; ties fall to title, then slug; titles are compared in the site's language. A missing value orders last. A template may call it too, and a browser can run it later.
- **Presentations** are declared under `presentations`, each with a `label` and typed options, and each is a component of the site's design, registered in `konzilo({ presentations })`. A declared presentation without a component, and one without a declaration, fail the build. The site template gives `list` and `cards`.
- **Pages.** One list per post may have pages, at `<address>page/<n>/`: page 1 is the post's own address, and `page/1/` leads to it with `301`; from page 2, each page is `noindex` and canonical to itself, and is not in the sitemap. The integration's pager, in the page's language, has no style of its own. A second list with pages in a post is refused. Every address below `<address>page/` is the post's.
- **Term pages.** A taxonomy may declare `address`, such as `/category/{slug}/`, and `konzilo({ termPage })` names one page of the site's design for it. Each term's pages hold its posts, of every type that takes the taxonomy, filed under the term or a term below it, newest first, ten a page. They join the order of addresses as posts do. A taxonomy with an address and no term page fails the build.
- **Later dynamic lists** stay open, since the query is data and the evaluator pure.

## Why

- The query is data in the content file, and the design stays the site's.
- One evaluator keeps build time and a future browser in step.
- Every publish builds the site, so no list is ever stale.

## Considered and rejected

- **Templates written by editors.** The design would live in content.
- **Automatic term archives.** Thomas wants none.
- **Relative dates.** A list would go stale between publishes.
