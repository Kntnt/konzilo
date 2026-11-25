# ADR 0022: Make each image's master from its original, and write images and galleries in Markdown

**Date:** 2026-11-03, amended 2026-11-25 · **Status:** Accepted as a technical choice; Thomas may veto. Amended 2026-11-25, settled by Thomas in triage (#113): each image the site shows is made at the build in a few fixed widths, never wider than its master, as WebP, and written in `srcset` with `w` descriptors and a `sizes`; the largest width is capped; the widths and sizes of each context come from the site's design, with defaults in the core; each version is compressed as hard as it can be without it showing, and an image marked for lossless compression is lossless in every version; WebP alone, AVIF and JPEG XL a later decision. Technical choices of 2026-11-25 Thomas may veto: the five contexts, `body`, `gallery`, `lightbox`, `hero` and `card`, with the lightbox's widths in a body's and a gallery's `srcset`; the core's widths and sizes for each, below; the cap, 2520 px, the master's longest side, which stays 2520 px; the quality, 75; the option's shape, `konzilo({ images: { <context>: { widths, sizes } } })`, a context or a part of one left out keeping the core's, and a context the core does not know failing at once; an image written at its widest version, which is its `src`, with no width within a tenth below its master's own width beside that width; the lossless mark read from the master itself; and the site template's main image in a body's widths and its cards in a card's, through `imageVersions()`.

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

Alt text belongs to each use. It is written without the spaces at its edges, with `\`, `*`, `` ` ``, `[` and `]` always escaped, and it is required: decorative images and multi-line alt text are refused. A caption takes emphasis, strong, code, superscript and subscript, and no link, line break or footnote. An image stands at the top of the body, or in a list's item ([ADR 0061](0061-keep-a-tasks-box-and-let-a-lists-item-hold-an-image.md)). The reader renders the paragraph as `<figure><img src alt><figcaption>…</figcaption></figure>`, and the build makes its versions from the master, as below.

**A gallery** is two or more images, one line after another in one paragraph, the gallery's caption, if any, on the line after the last:

```markdown
![A red barn at dusk](../media/farm-1a2b3c4d5e.webp)\
The barn _in 1920_
![A lake at dawn](../media/farm-6f7a8b9c0d.webp)
A summer on the farm
```

Between two images, and before the gallery's caption, is a soft line break; between an image and its own caption, a hard one. A blank line ends the gallery. The reader renders `<figure class="konzilo-gallery">`, and how it is laid out is the site's design.

**Versions.** The build makes each image the site shows from its master in a few fixed widths, its versions, as WebP, and writes them in the image's `srcset` with `w` descriptors, beside a `sizes` that says how wide the context it is drawn in draws it, so that a browser loads the narrowest at least as wide as it draws the image, at the screen's density, and a wider one as a window grows. Only the images in use are made, and the same width of the same master is one file wherever it is drawn.

- **The contexts** are a body's image, a gallery's, the lightbox's, a hero's and a card's or teaser's. A body's image and a gallery's are given theirs by the reader, by where each stands, with the lightbox's widths too, since the lightbox shows them from the same `srcset` (ADR 0056), at its own `sizes`. A site's templates give a hero's and a card's, and any other image they draw from a master, to Astro's `<Image>` as `imageVersions('<context>')` from `@kntnt/konzilo/astro/images` gives them, `{ widths, sizes }`.
- **The widths and sizes are the site's design's**, through `konzilo({ images })`, as `bodyStyles` and `tokens` are (ADR 0054): `{ body: { widths: [480, 960], sizes: '(min-width: 40rem) 40rem, 100vw' } }`, any context, its widths, its sizes or both, the rest the core's. A width is a whole number of pixels up to the cap; anything else, or a context the core does not know, fails Astro's start, naming it.
- **The core's**, for a site without a design package, are fitted to the site template's measures, its column of 46rem, its gallery's grid and its cards, and taken from one ladder, so that an image drawn in two contexts shares its versions:

  | Context | Widths | Sizes |
  |---|---|---|
  | `body` | 480, 800, 1200, 1600 | `(min-width: 46rem) 46rem, 100vw` |
  | `gallery` | 480, 800, 1200 | `(min-width: 46rem) 15rem, (min-width: 28rem) 50vw, 100vw` |
  | `lightbox` | 1600, 2520 | `100vw` |
  | `hero` | 800, 1200, 1600, 2000, 2520 | `100vw` |
  | `card` | 480, 800, 1200 | `(min-width: 40rem) 23rem, 100vw` |

- **No version is wider than its master or the cap,** 2520 px, the master's longest side, so that a hero across a wide, dense screen gets no more than the master holds. A width wider than the master gives way to the master's own width, and a width within a tenth below that is left out as a near duplicate: a master 1300 px wide is made in 480, 800 and 1300, not 1200 and 1300.
- **An image is written at its widest version,** which is its `src` and gives its `width` and `height`, so that no file is made beside its versions.
- **Each version is WebP at quality 75**, and so is any WebP Konzilo's image service makes without a quality asked for. **A master that is lossless WebP has every version lossless,** whatever the quality: the build reads the mark from the master, which the intake makes lossless for an image marked for lossless compression (#114), so a content file needs no mark of its own.
- **The master's longest side stays 2520 px,** though an original may be 3840 px: no version is wider than the cap, so a larger master would add to the content repository and to the time each version takes, for pixels no version uses.
- An SVG master is served as itself, in no widths (ADR 0023).

## Why

- The name from the original's hash merges the same file uploaded twice, and makes a replaced image a new file, so a cached old version is never served for a new one.
- One media folder makes the unused check one listing, and keeps masters in place when a post moves.
- A Markdown image is what Astro makes responsive images of, and what every Markdown tool shows as an image.
- One paragraph per image keeps a change on one or two lines of the history.
- Fixed widths made at the build are the static site's image cache: a few sizes, made once, so that a phone loads a version near the width it draws and no near duplicate is made. Only the design knows how wide each context draws an image, so the widths and sizes are its, and the core's defaults keep a site without one served as well.
- One `srcset` serves the page and the lightbox, so a body's image carries the lightbox's widths, and the page's `sizes` keeps a browser to the narrow ones until the lightbox opens.
- A gallery adds no syntax, only the absence of blank lines.

## Considered and rejected

- **Masters beside each content file.** A move would move files.
- **Astro's image pipeline on the originals.** Originals are private.
- **The picture's one alt text everywhere.** One text per picture would describe it alike wherever it is used.
- **The caption as the image's title.** A title holds no formats.
- **A raw `<figure>`, or a `:::figure` or `:::gallery` directive.** CommonMark would wrap its parts in paragraphs, and Astro would not process a directive's image.
- **A list of images as a gallery.** It would read as a list in every Markdown tool.
- **A gallery of one image.** It would be the same Markdown as an image.
- **Versions made on demand,** by an image server that resizes to the width asked for. It needs a service in front of the static files, and every width asked for is a file of its own.
- **Astro's own responsive layouts** (`image.layout`). Their widths are the screen's breakpoints and their `sizes` the image's own width, not how wide the design draws it, and they would reach every image of the site alike.
- **A master of 3840 px.** See above: no version would use it.
- **A mark of lossless compression in the content file.** A body's image is a Markdown image of its master, with nowhere to hold it, and the master already says it.

## What practice has shown

- An unsaved upload has a `blob:` address in the draft, and the reader drops such an image, so the preview's template sends the file too (ADR 0032).
- Uploading through Sveltia lands in LFS, as a pointer in Git, with no help.
- Sveltia's media library fetches whole originals as thumbnails: six visible images were 3.7 MB, and a dozen turns of the wheel 75 requests and 46 MB. It works, but on a phone connection it wants real thumbnails later.
- Sharp converts colour profiles and strips GPS and camera data, so a master never carries them. An original keeps them, which is acceptable only because originals are private.
- **The quality of a version,** measured on 2026-11-25 by SSIM over 8 × 8 windows of the luminance, against the same width made without loss, at 480, 800, 1200, 1600 and 2520 px, and by eye in crops at their own size and twice it: the demo content's images, smooth drawings, keep an SSIM of 0.999 at every quality from 60 to 90; an aerial photograph of a lake and rocks 0.96 at 75 and 0.97 at 80; photographed wood grain and marble, the hardest, 0.93 to 0.95 at 75 and 0.94 to 0.96 at 80. At their own size no difference between 75, 80 and the lossless version showed in either photograph; at twice their size 75 smooths the finest wood grain a little and 80 keeps it. A version is drawn at most at its own size, so 75, at about four fifths of 80's bytes, is the quality.
- **The release and the build,** measured on 2026-11-25 on a site of 40 posts, each with a photograph of 2520 × 1418 px in its body, on a 12-core Mac: the release's images went from 9.0 MB, one file each at the master's size at quality 80, to 14.7 MB, five versions each, 1.64 times as much; a first build, with no cache, from about 4 s to about 6.5 s, some 60 ms an image, which a later build takes from Astro's cache. A visitor's phone at 400 px loads the 480 px version, 7 to 19 kB of such a photograph, where it loaded 114 to 338 kB at the master's size.
- In a window 400 px wide, Chromium, Firefox and WebKit each load the 480 px version of the demo content's body image at density 1 and the 800 px version at density 2, and nothing else of it.
