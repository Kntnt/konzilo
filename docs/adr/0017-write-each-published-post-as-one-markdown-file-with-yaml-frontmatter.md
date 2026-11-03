# ADR 0017: Write each published post as one Markdown file with YAML frontmatter

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

- **One file per published post,** `content/<collection>/<slug>.md`: the collection the site description names for the type, and the post's slug. On a type with parents, the file sits at its path (ADR 0037); on a site in several languages, below its language's tag (ADR 0042).
- **A slug** holds `a`–`z`, digits, hyphens and underscores; anything else is refused.
- **Frontmatter, one blank line, the body, one final newline;** the frontmatter alone when the body is empty.
- **The frontmatter** holds `title` first, double-quoted with JSON's escapes, then the fields the site description declares, in the order declared. No value means no key; a yes-or-no field is always there. A date is a UTC timestamp, `2026-10-27T10:00:00Z`, unquoted, so Astro reads it as a date. A title holding HTML is refused.
- **The bytes do not change unless the content does.** A build that changes nothing writes nothing.
- **A paragraph is its text as typed,** with the minimal escapes, and one blank line between paragraphs. Spaces and tabs at its edges go, and so does an empty paragraph, as a page shows neither.
- **Derived fields are the intake's alone:** `oldAddresses`, `modified`, masters, `translationKey`. No field of a site's own may take those names, nor `image_alt`, `seo` or a name starting `seo_`. No collection may be called `media`, `menus` or `settings`.
- **A post's date** is its own field, and without one the moment the intake first took it, kept in the ledger. `modified` is the moment its published version last changed, read from Git.

## Why

- One file per post is what Astro's glob loader reads, and what a reader of the content repository expects.
- JSON's string escapes are a subset of YAML's double-quoted ones, so every title is written one way, whatever it holds.
- A UTC timestamp is the same on every server, and Astro's schema can require a date.

## Considered and rejected

- **A post's ID in the frontmatter or the name of a published file.** The ID lies in the source file's name and in the ledger (ADR 0026, ADR 0027), so published files stay readable.
- **The slug in the frontmatter.** Astro's glob loader would take it as the entry's id; the file name already is.
- **A quoted date.** Astro would hand the template a string.
- **Password-protected or private posts.** They have no place among draft, published and a date. A post that must not be public stays a draft.

## Consequences

Astro's schemas are strict, so one stray key fails the whole site's build. The intake is why that never reaches Astro.
