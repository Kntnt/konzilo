# ADR 0037: Give hierarchical types addresses that follow their parents, and derive breadcrumbs

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: addresses follow parents; breadcrumbs always in the structured data, on screen by choice. The rest is a technical choice; Thomas may veto.

## Decision

- **Hierarchical types.** A type is one when it declares `"hierarchical": true`. It takes `{path}` in its address, `/{path}/` or `/pages/{path}/`; every other type takes `{slug}`. The checker refuses each the other way round.
- **A post's path** is its ancestors' slugs, from the top, and its own: `about-us/team/anna`. A parent is a relation by ID, an ordinary field. A draft ancestor gives its slug. An ancestor refused, missing or of another type refuses the post, naming it.
- **Published files** sit at their paths inside the collection's folder, `pages/about-us/team.md` beside `pages/about-us.md`. Astro's entry ID is the path.
- **Moves** are written at the next build: each post's file at its current path, the old files and the folders they leave empty removed. A move touches one source file, and the guard counts it as no deletion. A post that goes live at a new path leaves the old as an automatic `301`.
- **Breadcrumb levels:** the start page, named in the page's language; each shorter address the page's address starts with at which a published post answers, of any type; then the page itself. Each post is named by its *Name in breadcrumbs*, else its title; a term's page by the term's name. An address at which no post answers is left out, so a type's prefix has no level of its own.
- **In the structured data,** every page but the start page carries a `BreadcrumbList`.
- **On screen,** `Breadcrumbs.astro` writes `<nav aria-label="Breadcrumbs">` holding an `<ol>`, a link for each level but the last, the last `aria-current="page"`, with no styling of its own. A site's design places it.
- **One function** gives the levels to the head and the component alike, and reads each collection once in a build, since Astro's `getEntry()` warns of every entry it does not find.

## Why

- Two pages may share a slug under different parents, and the content repository shows the tree.
- A level is a real page, so no breadcrumb leads nowhere.

## Considered and rejected

- **Flat files with a `parent` field.** They collide on slugs that siblings in different branches share.
- **Levels cut from the address string.** They name segments that have no page.
