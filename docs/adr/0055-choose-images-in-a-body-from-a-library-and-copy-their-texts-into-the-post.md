# ADR 0055: Choose images in a body from a library, and copy their texts into the post

**Date:** 2026-11-04 · **Status:** Accepted, settled by Thomas on 2026-11-04: a collection of images, each with alt text and an optional caption; `/image` chooses one, or uploads a new one that becomes the choice; alt text and caption are copied into the post, and can be changed there without changing the collection. The rest is a technical choice; Thomas may veto. Not built yet: it comes with the image element, in the stages of ADR 0030.

## Decision

- **The image library** is a collection of the editor's: each entry holds an original, its alt text and an optional caption. It is no type, has no page and is not published.
- **`/image` in the Crepe field** opens a chooser of the library's entries, with a way to upload a new one, which joins the library and becomes the choice.
- **The texts are copied.** Choosing an entry writes the image into the body with the entry's alt text and caption, as ADR 0022 writes any image. From then on they are the post's: a change in the post leaves the entry as it was, and a change in the entry leaves every post as it was.
- **The content format does not change.** A post names the original's file and holds its own texts, so nothing published or read by the site depends on the library.
- **Removing an entry must not take away a file a post still names,** since the intake refuses a post whose original is gone (ADR 0022).

## Why

- An image used again has its texts ready, while each use can still describe it as that use needs, as ADR 0022 has it.
- A copy needs no reference from a post to the library, so there is no way for a change to reach a published post unseen.

## Considered and rejected

- **One alt text for each image, everywhere.** One place to correct it, but the same picture often needs describing differently in different places (ADR 0022), and every post using it would have to be written again at each change.
- **Sveltia's media library as the chooser.** It lists files, and holds no text. A custom field cannot list another collection's entries (ADR 0029), so the chooser is Konzilo's own, and asks Forgejo.

## What must be found out

- Whether Sveltia's `addFile` and `pickFile` serve the upload.
- Small pictures for the chooser: Sveltia's media library fetches whole originals as thumbnails (ADR 0022).
