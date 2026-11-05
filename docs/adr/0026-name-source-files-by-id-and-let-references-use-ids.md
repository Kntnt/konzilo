# ADR 0026: Name source files by ID, and let references use IDs

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02 as part of the design: a source file is named by a generated ID, which never changes.

## Decision

The source repository holds one file per thing an editor edits, under `<collection>/`:

| Path | What it holds |
|---|---|
| `<collection>/<id>.md` | A post, its body in Markdown, with references by ID. On a site in several languages, `<collection>/<tag>/<id>.md`, with the same ID in each language. |
| `<taxonomy's collection>/<id>.json` | A term, whether or not a post uses it yet. |
| `menus/<menu>.json`, `settings.json` | Entries and values, with post choices as IDs. |
| `services.json`, `redirects.json` | What an Admin declares. Not `consent.json`, which the intake makes. |
| `media/<name>` | Originals, in Git LFS. |
| `image-library/<id>.json` | An entry of the image library (ADR 0055), which no content file reads. |

- **The ID** comes from Sveltia's `{{uuid_short}}`, with the slug not editable, so it never changes and duplicating an entry makes a new one. `slug` and `parent` are ordinary fields.
- **References use IDs.** A relation's stored value is the target's file name by default. An internal link in a body is `[text](konzilo:<id>)`, and the Crepe field shows the target's title. The intake writes references out as addresses and slugs.
- **A move touches one file,** and erasing a post starts from one path.
- **Existing Markdown enters a site through the same files,** with a generated ID each. Importing from other editors comes later.

## Why

- A renamed or moved post needs no other file changed.
- Two posts can share a slug under different parents.
- The content repository stays the readable record, so a less readable source repository costs little.

## Considered and rejected

- **Naming source files by slug.** A move under another parent would leave the children's files behind, two pages could not share a slug under different parents, and a rename would need a way to follow the post.
- **The ID inside a slug-named file.** A rename would still be a delete and an add.

## What practice has shown

- `{{uuid_short}}` is a slug tag in Sveltia; `slug: { template, editable: false }` holds it. A duplicated entry gets a new UUID. A relation stores `{{slug}}` by default. `i18n.canonical_slug` writes `translationKey`.
- A global `public_folder` must start with `/`; a collection's may be `../media`.
