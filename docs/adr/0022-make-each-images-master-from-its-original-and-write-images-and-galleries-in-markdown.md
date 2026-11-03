# ADR 0022: Make each image's master from its original, and write images and galleries in Markdown

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

**Originals** are the files editors upload, in Git LFS in the source repository, private. **A file may become public only through the intake and a build.** Monitoring asks for an LFS object without a login, and expects a refusal.

**A master** is made by the intake, with sharp at the exact version Astro takes, so that the site holds one copy:

- WebP at quality 90, its longest side at most 2520 px, scaled down only, turned upright, converted to sRGB by the original's own profile, and then without any metadata. The same original gives the same bytes.
- Named `<slug>-<first 10 hex digits of the original's SHA-256>.webp`, in `content/media/`. A content file names it `../media/<name>`.
- A master already there is left alone. Each build removes every master no content file names, a refused post's kept file among them.
- An image is refused, naming the field or the block, when its original is gone or its first bytes are not a still JPEG, PNG or WebP, whatever its name says; an SVG goes by ADR 0023 instead. HEIC, GIF, TIFF, BMP and a moving WebP are refused saying what to do instead. Uploads are at most 30 MB. `images: { smallestWidth, displayWidth }` in the site description gives the widths, required where a type takes images; below the smallest is refused, and below the display width warned of. Width is measured as the master's.

**The featured image** is a field, `image: {"src":"../media/<name>","alt":"…"}`. Its alt text belongs to the post. A draft saves without it; publishing or scheduling without it is refused. A post whose original is gone is refused, naming the field.

**An image in body text** is a Markdown image of its master alone in a paragraph, its caption on the next line after a hard line break:

```markdown
![A red barn at dusk](../media/barns-1a2b3c4d5e.webp)\
The barn _in 1920_
```

Alt text belongs to each use. It is written without the spaces at its edges, with `\`, `*`, `` ` ``, `[` and `]` always escaped, and it is required: decorative images and multi-line alt text are refused. A caption takes emphasis, strong, code, superscript and subscript, and no link, line break or footnote. An image stands at the top of the body only. The reader renders the paragraph as `<figure><img src alt><figcaption>…</figcaption></figure>`, and Astro makes its versions from the master.

**A gallery** is two or more images, one line after another in one paragraph, the gallery's caption, if any, on the line after the last:

```markdown
![A red barn at dusk](../media/farm-1a2b3c4d5e.webp)\
The barn _in 1920_
![A lake at dawn](../media/farm-6f7a8b9c0d.webp)
A summer on the farm
```

Between two images, and before the gallery's caption, is a soft line break; between an image and its own caption, a hard one. A blank line ends the gallery. The reader renders `<figure class="konzilo-gallery">`, and how it is laid out is the site's design.

## Why

- The name from the original's hash merges the same file uploaded twice, and makes a replaced image a new file, so a cached old version is never served for a new one.
- One media folder makes the unused check one listing, and keeps masters in place when a post moves.
- A Markdown image is what Astro makes responsive images of, and what every Markdown tool shows as an image.
- One paragraph per image keeps a change on one or two lines of the history.
- A gallery adds no syntax, only the absence of blank lines.

## Considered and rejected

- **Masters beside each content file.** A move would move files.
- **Astro's image pipeline on the originals.** Originals are private.
- **The picture's one alt text everywhere.** One text per picture would describe it alike wherever it is used.
- **The caption as the image's title.** A title holds no formats.
- **A raw `<figure>`, or a `:::figure` or `:::gallery` directive.** CommonMark would wrap its parts in paragraphs, and Astro would not process a directive's image.
- **A list of images as a gallery.** It would read as a list in every Markdown tool.
- **A gallery of one image.** It would be the same Markdown as an image.

## What practice has shown

- An unsaved upload has a `blob:` address in the draft, and the reader drops such an image, so the preview's template sends the file too (ADR 0032).
- Uploading through Sveltia lands in LFS, as a pointer in Git, with no help.
- Sveltia's media library fetches whole originals as thumbnails: six visible images were 3.7 MB, and a dozen turns of the wheel 75 requests and 46 MB. It works, but on a phone connection it wants real thumbnails later.
- Sharp converts colour profiles and strips GPS and camera data, so a master never carries them. An original keeps them, which is acceptable only because originals are private.
