# ADR 0037: Give hierarchical types addresses that follow their parents, and derive breadcrumbs

**Date:** 2026-10-29, amended 2026-11-13 · **Status:** Accepted. Settled by Thomas on 2026-10-29: addresses follow parents; breadcrumbs always in the structured data, on screen by choice. The rest is a technical choice; Thomas may veto, among it what the start page an Admin chose is to its children and to breadcrumbs (2026-11-13).

## Decision

- **Hierarchical types.** A type is one when it declares `"hierarchical": true`. It takes `{path}` in its address, `/{path}/` or `/pages/{path}/`; every other type takes `{slug}`. The checker refuses each the other way round.
- **A post's path** is its ancestors' slugs, from the top, and its own: `about-us/team/anna`. A parent is a relation by ID, an ordinary field. A draft ancestor gives its slug. An ancestor refused, missing or of another type refuses the post, naming it.
- **Published files** sit at their paths inside the collection's folder, `pages/about-us/team.md` beside `pages/about-us.md`. Astro's entry ID is the path.
- **Moves** are written at the next build: each post's file at its current path, the old files and the folders they leave empty removed. A move touches one source file, and the guard counts it as no deletion. A post that goes live at a new path leaves the old as an automatic `301`.
- **The start page an Admin chose** ([ADR 0033](0033-keep-menus-settings-and-the-sites-identity-in-files-an-admin-edits.md)) is at `/`, and a page with children may be chosen: its children keep their paths, which hold its slug, `/pages/welcome/team/` below Welcome, and their files stay where they were, so that choosing moves no other page. Its own address before leads to `/`, and is no level of their breadcrumbs.
- **Breadcrumb levels:** the start page, named in the page's language, or by the name in breadcrumbs of the page an Admin chose for it where that page has one; each shorter address the page's address starts with at which a published post answers, of any type; then the page itself. Each post is named by its name in breadcrumbs, the field `breadcrumb`, else its title; a term's page by the term's name. An address at which no post answers is left out, so a type's prefix has no level of its own.
- **In the structured data,** every page but the start page carries a `BreadcrumbList`.
- **On screen,** `Breadcrumbs.astro` writes `<nav aria-label="Breadcrumbs">` holding an `<ol>`, a link for each level but the last, the last `aria-current="page"`, with no styling of its own. A site's design places it. Whether the last level is the page itself is the type's setting, off by default, and `breadcrumbs()` keeps the level, marked hidden ([ADR 0062](0062-give-an-article-its-parts-as-the-cores-fields-and-fall-back-by-one-set-of-rules.md)).
- **One function** gives the levels to the head and the component alike, and reads each collection once in a build, since Astro's `getEntry()` warns of every entry it does not find.

## Why

- Two pages may share a slug under different parents, and the content repository shows the tree.
- A level is a real page, so no breadcrumb leads nowhere.

## Considered and rejected

- **Flat files with a `parent` field.** They collide on slugs that siblings in different branches share.
- **Levels cut from the address string.** They name segments that have no page.
