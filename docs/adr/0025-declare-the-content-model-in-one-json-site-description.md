# ADR 0025: Declare the content model in one JSON site description

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

**One file, `site-description.json`, at the root of the site repository.** The intake reads it, the Astro integration reads it, and Sveltia's configuration is generated from it (ADR 0029).

- **`types`,** at least one, each with a `label` and a `plural`, a `collection`, the `blocks` it takes, by element name, each one the rule data knows, and its `fields`. `article` and `page` are names like any other; nothing is built in.
- **`taxonomies`,** each with a `label`, a `plural`, a `collection` and `hierarchical`.
- **Every post has its title and its slug,** so neither is declared.
- **A field** is one of four kinds, by its name and keys, written into the frontmatter in the order declared: the core's own (`date`, `modified`, `excerpt`, `image`), the group `seo`, a taxonomy's terms (`taxonomy`, which may be `required`, at least one term), or one of the site's own, with a `label`, a `type`, a `control`, `options` for a select, and `required`.

  | `type` | `control` | Frontmatter | Astro |
  |---|---|---|---|
  | `string` | `text`, `textarea` | `"…"` | `string` |
  | `string` with `options` | `select` | one of the options | an enum |
  | `number` | `number` | `4.5` | `number` |
  | `integer` | `number` | `7` | whole `number` |
  | `boolean` | `toggle` | `true`, `false` | `boolean`, always present |
  | `date` | `date` | `2026-11-05` | `Date`, midnight UTC |

  Field names are letters, digits and underscores starting with a lowercase letter. A required field left empty refuses the post, naming the field; a wrong value says so: `readingTime: the site cannot publish "seven" as a whole number`.
- **It also declares** `menus`, `settings`, `images`, `language` or `languages`, `presentations`, `forms`, `components`, `search`, `security` and `consent`, each in its own ADR.
- **Nothing else is accepted.** An unknown key, a block the rules do not know, two collections with one name: the checker names every problem by its path, and the description is refused whole.
- **One checker, in the npm package.** The intake and Astro's `collections()` both run it, so every build and every start of the dev server checks the description. A deploy checks it before it switches.
- **Astro makes one collection per type and per taxonomy,** each with a strict schema, so a template meets exactly the declared fields, typed. A changed description gives a build first and then a restart of the dev server, since a file of the old one fails the new schema and Astro stops watching a collection that fails to load.
- **Demo content is files,** fictional, in the core, copied into a local copy alone, so that no live site can run it.

## Why

- The description says what a field is, not how each reader stores it. Adding a field is one entry in one file.
- A site description is short; it needs no comments or variables.
- A term's name in one file means that renaming a term changes one file.
- One checker cannot disagree with itself.

## Considered and rejected

- **YAML or TOML, a JavaScript file, or Astro's own schemas.** JSON reads everywhere without a library, and Astro's dev server can watch it.
- **A field plugin or schema of the editing tool as the source.** A second place where fields are declared.

## Consequences

- `site-description.json`'s blocks use element names, `paragraph`, not any tool's.
- A new element, field kind or file changes the checker in the same change as `content-format.md` (ADR 0015).
