# ADR 0063: Make the image library the one place for images

**Date:** 2026-11-10 · **Status:** Accepted. That the library is where images are chosen, with their texts copied into the post, is settled (ADR 0055). Making it the only place, and what deleting an image does, is a technical choice; Thomas may veto.

## Decision

- **Every image field chooses from the library,** with the chooser `/image` uses: a post's featured image, its teaser's and its sharing image, and the settings' images, the logo and the site icon among them. Choosing copies the library's alt text into the field, where it can be changed for that use. The field's value is as the source held it before, `{ src, alt }`, `{ src }` without alt text, and on a site in several languages each language's.
- **The library's own entry uploads its file** through Sveltia's `addFile`, under the name the library's upload gives, so the entry and its file are saved in one commit, and a file the repository already holds is named, not uploaded again.
- **Media is in neither menu.** Its route still answers, but an editor no longer meets a second place for the same pictures.
- **Deleting a library image deletes its file in the same commit,** as Sveltia deletes an entry's associated files, unless another entry names the file: a post that shows it, or another library entry with the same file. Then the file stays, so that nothing in use is lost.
- **A field whose image falls back to the main image** shows it, faded, while none is chosen. **The sharing image is shown cropped** to 1200 × 630, with what lies outside the 1080 × 566 every service shows tinted red.
- **Every site has a library,** since every site has image fields.

## Why

- Two places for one thing made three problems: an image uploaded in Media had no alt text and did not reach `/image`; the image fields chose from Media, so the library's alt text did not come along; and deleting a file in Media removed an original that posts still named, which the intake then refused.
- Sveltia already deletes an entry's associated files in one commit, and computes them only for media folders inside an entry's folder; making a library entry's file such a file reuses that rather than adding a second deletion.

## Considered and rejected

- **Refusing to delete an image a post uses, listing the posts.** Kept for later: keeping the file loses nothing, and needs no new dialog.
- **Deleting the file anyway, and letting those posts fail at the intake.** A delete would then break published pages without a word.
- **The deletion rule in Konzilo's own code.** Sveltia has no seam for an entry's associated files, so it is a patch of its build, as ADR 0029 allows, until there is one.

## Consequences

- Each patch names Sveltia's minified functions, which change with its version, so a raise of Sveltia looks at each again, as every patch of its build does.
