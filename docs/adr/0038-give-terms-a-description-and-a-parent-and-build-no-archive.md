# ADR 0038: Give terms a description and a parent, and build no archive

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: categories and tags, and no automatic archives. The rest is a technical choice; Thomas may veto.

## Decision

- **Any declared type takes any declared taxonomy** through a field. A site may declare `category` and `post_tag`, as any other name. Terms are edited in collections of their own.
- **No default category.** A field's `required` decides whether one is needed.
- **A term's published file** holds `name`, `description` (plain text, only when there is one) and `parent` (the parent's slug, only for a child). It is written whenever a published post uses the term, and a parent's whenever a child's is, and removed when no content file names it, a refused post's kept file among them. So a term has a page only while a published post has it, or a term below it.
- **A term's source file** may exist whether or not a post uses it.
- **Markup** in a term's name or description refuses the posts that use it, naming the term.
- **Terms have no order** of their own.
- **No archives.** Nothing builds a page for an author, a date, a type or a term. A term has a page only where its taxonomy declares an address (ADR 0039).

## Why

- Without a default category, `required` means what it says.
- A description and a parent are what lists and breadcrumbs need.

## Considered and rejected

- **A default category.** It would put a category nobody chose on every post.
- **An order of terms.** No reader needs one.
