# ADR 0022: Make each image's master from its original, and write images and galleries in Markdown

**Date:** 2026-11-03, amended 2026-11-25 · **Status:** Accepted as a technical choice; Thomas may veto. Amended 2026-11-25, settled by Thomas in triage (#113): each image the site shows is made at the build in a few fixed widths, never wider than its master, as WebP, and written in `srcset` with `w` descriptors and a `sizes`; the largest width is capped; the widths and sizes of each context come from the site's design, with defaults in the core; each version is compressed as hard as it can be without it showing, and an image marked for lossless compression is lossless in every version; WebP alone, AVIF and JPEG XL a later decision. Technical choices of 2026-11-25 Thomas may veto: the five contexts, `body`, `gallery`, `lightbox`, `hero` and `card`, with the lightbox's widths in a body's and a gallery's `srcset`; the core's widths and sizes for each, below; the cap, 2520 px, the master's longest side, which stays 2520 px; the quality, 75; the option's shape, `konzilo({ images: { <context>: { widths, sizes } } })`, a context or a part of one left out keeping the core's, and a context the core does not know failing at once; an image written at its widest version, which is its `src`, with no width within a tenth below its master's own width beside that width; the lossless mark read from the master itself; and the site template's main image in a body's widths and its cards in a card's, through `imageVersions()`. Settled by Thomas on 2026-11-25 (#114): the editor's browser converts an image before it is uploaded, with libwebp as WebAssembly rather than the browser's canvas, its longest side at most 3840 px and at quality 90 by default, both an Admin's settings, without any metadata; *Lossless compression*, ticked by default for a PNG, makes the original, its master and every version lossless; and the intake still trusts nothing it is sent. Technical choices of #114 Thomas may veto: libwebp as jSquash's WebAssembly build (`@jsquash/webp`), its code fetched in a worker of its own when an upload starts; the browser's own decoder turning the image upright and into sRGB, and the scaling in plain JavaScript by sharp's filter; the settings group `imageUpload`, with `longestSide` and `quality`; the mark of lossless compression held by the original's own encoding, a `VP8L` chunk, which its master keeps, with the library entry's `lossless` as the record of the editor's choice; and *Converting the image…* shown, with the page alive, while a large image is converted; and, from the same day, a PNG to be kept lossless read by the editor's own reader of PNGs, rather than through the browser's canvas, which loses the colour of a partly transparent pixel, where the PNG names no colour profile or orientation and holds at most 40 million pixels, the browser still decoding every other image. Settled by Thomas in triage on 2026-11-25 (#109): an image has no pixel density; an image library entry has a *Display width*, *Fill the column* by default or *At most* a number of pixels, which a file named `@2x` or `@3x` fills in at upload as half or a third of its pixel width, and which is copied into the post with the image; an image standing alone in a body with a display width is written at that width, its `srcset` holding every version up to its master's and its `sizes` no wider; a gallery's image, a featured image and a teaser's image ignore it; and one is not warned of for being narrower than `images.displayWidth`, while `images.smallestWidth` still refuses it in its pixels. Technical choices of #109 Thomas may veto: a body's image holds its display width as its title, `"width=632"`, a whole number of pixels from 1 to 16383, any other title refused as before; a gallery's image keeps one in the file, which the site ignores; the reader gives the figure's `img` the display width as its `width`, which the build turns into its `width` and `height` at that width where it is narrower than its widest version, an SVG's too; its `sizes` each wrapped in `min()` at that width, and `auto` left as it is; and only an image standing alone with a display width goes unwarned, a gallery's still warned of.

## Decision

**Originals** are the files editors upload, in Git LFS in the source repository, private. **A file may become public only through the intake and a build.** Monitoring asks for an LFS object without a login, and expects a refusal.

**The editor's browser converts an image before it is uploaded,** whichever way it is uploaded, the chooser's upload or the image library entry's own form ([ADR 0063](0063-make-the-image-library-the-one-place-for-images.md)), and what it makes is the original:

- A JPEG, PNG or still WebP is decoded by the browser, which turns it upright by its orientation and converts it to sRGB by its own colour profile. A PNG to be kept lossless is read by the editor itself (`src/cms/image/png.js`), every kind a PNG may be, its pixels as the file holds them, the browser's own decompression undoing its compression, since a canvas keeps a partly transparent pixel's colour multiplied by its alpha; one that names a colour profile or an orientation, or holds more than 40 million pixels, is left to the browser. It is scaled down, never up, so that its longest side, width or height, is at most `imageUpload.longestSide` in the site settings, 3840 by default, by a Lanczos filter of three lobes, as sharp's, in plain JavaScript, a band of rows at a time, its colours weighed by their opacity (`src/cms/image/resize.js`). libwebp, as WebAssembly, encodes it as a WebP at `imageUpload.quality`, 90 by default, or losslessly. libwebp writes the picture and nothing else, so none of the file's metadata, the place it was taken among it, leaves the editor's machine. An SVG is uploaded as it is ([ADR 0023](0023-check-svg-strictly-and-keep-it-svg-on-the-site.md)).
- The work runs in a worker of its own (`src/cms/image/convert-worker.js`), which the upload starts, so the page stays alive, and its code, libwebp's among it, is fetched only then. The editor sees *Converting the image…*, then *Uploading…*, on the upload's button and in a line a screen reader reads. A file the browser cannot convert is not uploaded, and the editor is told so.
- **Lossless compression**, a checkbox, ticked for a PNG, most often a drawing, a diagram or a screenshot, and not for a JPEG or a WebP, decides before the conversion whether the WebP is lossless. In the library entry's own form it stands under the file, and changing it converts the file chosen again while the entry is unsaved.
- **The mark of lossless compression is the original's own encoding.** A lossless WebP holds its picture in a `VP8L` chunk, first or after its extended header, `VP8X`, where a lossy one holds `VP8 `. `isLosslessWebp(bytes)` in `src/format/originals.js` reads it. The intake makes a lossless master of such an original, which so holds the mark in the same way, and whatever makes versions of a master reads it from the master's bytes and makes them lossless too. The library entry records the editor's choice as `"lossless": true`, left out otherwise, for its form; nothing that makes a master or a version reads the entry, since a post names the file and not the entry, and two entries may name one file.
- **The settings,** the core's group `imageUpload` in `settings.json`, an Admin edits as the other groups ([ADR 0033](0033-keep-menus-settings-and-the-sites-identity-in-files-an-admin-edits.md)): `longestSide`, a whole number of pixels from 1 to 16383, libwebp's greatest, and `quality`, from 1 to 100. Each upload reads them from the source repository as it starts, so an Admin's change holds from the next one; one the file does not hold, or holds outside its bounds, is its default.
- **The intake trusts nothing it is sent.** It checks every original and makes its master as before, so a file that reaches the source another way, as an import, still works; a JPEG or a PNG put there gets a lossy master, as before. The 30 MB limit holds for the file chosen, before it is converted, and the site's smallest width for the master the converted file would make.

**A master** is made by the intake, with sharp at the exact version Astro takes, so that the site holds one copy:

- WebP at quality 90, its longest side at most 2520 px, scaled down only, turned upright, converted to sRGB by the original's own profile, and then without any metadata; an original that is a lossless WebP gets a lossless master. The same original gives the same bytes.
- Named `<slug>-<first 10 hex digits of the original's SHA-256>.webp`, in `content/media/`. A content file names it `../media/<name>`.
- A master already there is left alone. Each build removes every master no content file names, a refused post's kept file among them.
- An image is refused, naming the field or the block, when its original is gone or its first bytes are not a still JPEG, PNG or WebP, whatever its name says; an SVG goes by ADR 0023 instead. HEIC, GIF, TIFF, BMP and a moving WebP are refused saying what to do instead. Uploads are at most 30 MB. `images: { smallestWidth, displayWidth }` in the site description gives the widths, required where a type takes images; below the smallest is refused, and below the display width warned of, but for an image standing alone in a body with a display width of its own (below). Width is measured as the master's.

**The featured image** is a field, `image: {"src":"../media/<name>","alt":"…"}`. Its alt text belongs to the post. A draft saves without it; publishing or scheduling without it is refused. A post whose original is gone is refused, naming the field.

**An image in body text** is a Markdown image of its master alone in a paragraph, its caption on the next line after a hard line break:

```markdown
![A red barn at dusk](../media/barns-1a2b3c4d5e.webp)\
The barn _in 1920_
```

**An image's display width** is the widest it is drawn where it stands alone in a body, in pixels, for a figure saved at twice or three times the size it is meant to be read at, such as a diagram or a screenshot, whose labels would otherwise be drawn larger than the text around it. It is the image's title, `width=` and a whole number from 1 to 16383, the widest image there is, and no other title is taken:

```markdown
![A diagram of the flow of work](../media/flow-1a2b3c4d5e.webp "width=632")\
The flow _of work_
```

The library entry holds it, and choosing the image copies it into the body with the alt text and the caption ([ADR 0055](0055-choose-images-in-a-body-from-a-library-and-copy-their-texts-into-the-post.md)). The reader gives the figure's `img` that `width`, and the build writes its `width` and `height` at that width, by its master's proportions, where it is narrower than its widest version, so that the design, which draws a body's image at most its `width`, draws it so; its versions and its `src` are any image's, up to its master's width, so a screen of density 2 draws it by its full pixels; and each of its `sizes` is no wider, `min(46rem, 632px)`, so that a browser at density 1 loads no wider a version than it needs. A gallery's image keeps its display width in the file, so that it has it again should it come to stand alone, and fills what the design gives it all the same, as a featured image and a teaser's do, which hold none. An image with a display width is not warned of for being narrower than `images.displayWidth`, since its size is chosen, and is refused below `images.smallestWidth` in its pixels, as any image is.

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

- An original converted in the browser leaves nothing of the camera's or the editor's machine in the repository, and is most often a fraction of a camera's file, so LFS and every build hold and read less.
- libwebp gives the same WebP in every browser, at the quality asked for and losslessly when asked, where a canvas encodes as each browser does, and Safari's not as WebP at all.
- The mark in the file goes wherever the file goes, to the master and to what is made of it, with nothing to keep in step.

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
- **The browser's canvas encoding the WebP,** `toBlob('image/webp')`. Safari's gives a PNG instead, and none offers lossless encoding or says what it keeps.
- **libvips as WebAssembly,** `wasm-vips`, the library sharp is built on, which would make the original as the intake makes a master. It needs `SharedArrayBuffer`, and so an admin host isolated from every other origin, which would cut Sveltia's sign-in window off from the editor and keep Forgejo's pictures out, and it is several megabytes.
- **The browser's own scaling,** a canvas's or `createImageBitmap`'s. Each engine scales by a filter of its own, some poorly at a large factor, and a canvas the size of a photograph is more than some browsers allow.
- **Uploading the file as it was where the browser cannot convert it.** Its metadata would leave the editor's machine.
- **The mark only in the library entry,** or in the file's name. Nothing that makes a master or a version reads the library, and a name says what anyone may write in it.
- **A pixel density for an image,** `2x`, which the build would turn into widths. An editor does not think in densities, and the same file drawn at two sizes would need two; what says how big a figure is meant to be is a width (Thomas, #109).
- **A display width as Pandoc's attributes,** `![…](…){width=632}`. Sätteri and every Markdown tool but Pandoc's read them as text after the image, which shows on the page of any other tool, and the field, the intake and the reader would each have to find them in a paragraph's text. A title is what CommonMark gives an image beside its address, read alike everywhere, and room for more, as a focal point, later.
- **A display width on the address,** `…webp#632` or `…webp?width=632`. Astro imports a body's image by its address, so the address would no longer name the master.
- **A display width in the alt text,** as `|632` after it, as some note-taking tools write it. A screen reader would read it.
- **A raw `<img width>`.** Astro makes no versions of an image in raw HTML.
- **A width of the image's own in the content file's frontmatter, by its address.** Two uses of one image in a post could not differ, and the body's image would no longer say all of itself.

- **A package to read a PNG,** such as jSquash's PNG decoder or `fast-png`. The reader is short, and every PNG a browser reads is one of the few kinds the format has, so a package's code and its notices would bring nothing more.
- **WebGL's reading of a texture,** which keeps the alpha apart. Not every engine has WebGL in a worker, and it would draw the picture on the graphics card of each machine.
- **libwebp built for the core.** The core has no Emscripten of its own to build it with, and jSquash's is the build Google's Squoosh shipped, kept up and widely used.

## What practice has shown

- An unsaved upload has a `blob:` address in the draft, and the reader drops such an image, so the preview's template sends the file too (ADR 0032).
- Uploading through Sveltia lands in LFS, as a pointer in Git, with no help.
- Sveltia's media library fetches whole originals as thumbnails: six visible images were 3.7 MB, and a dozen turns of the wheel 75 requests and 46 MB. It works, but on a phone connection it wants real thumbnails later.
- Sharp converts colour profiles and strips GPS and camera data, so a master never carries them. An original keeps them, which is acceptable only because originals are private.
- **The quality of a version,** measured on 2026-11-25 by SSIM over 8 × 8 windows of the luminance, against the same width made without loss, at 480, 800, 1200, 1600 and 2520 px, and by eye in crops at their own size and twice it: the demo content's images, smooth drawings, keep an SSIM of 0.999 at every quality from 60 to 90; an aerial photograph of a lake and rocks 0.96 at 75 and 0.97 at 80; photographed wood grain and marble, the hardest, 0.93 to 0.95 at 75 and 0.94 to 0.96 at 80. At their own size no difference between 75, 80 and the lossless version showed in either photograph; at twice their size 75 smooths the finest wood grain a little and 80 keeps it. A version is drawn at most at its own size, so 75, at about four fifths of 80's bytes, is the quality.
- **The release and the build,** measured on 2026-11-25 on a site of 40 posts, each with a photograph of 2520 × 1418 px in its body, on a 12-core Mac: the release's images went from 9.0 MB, one file each at the master's size at quality 80, to 14.7 MB, five versions each, 1.64 times as much; a first build, with no cache, from about 4 s to about 6.5 s, some 60 ms an image, which a later build takes from Astro's cache. A visitor's phone at 400 px loads the 480 px version, 7 to 19 kB of such a photograph, where it loaded 114 to 338 kB at the master's size.
- In a window 400 px wide, Chromium, Firefox and WebKit each load the 480 px version of the demo content's body image at density 1 and the 800 px version at density 2, and nothing else of it.
- jSquash 1.5.0 holds libwebp 1.1.0, from 2020, as its `version()` says, where the package's notes say 1.0.2. It encodes only pixels the browser has decoded, inside WebAssembly's sandbox, and a newer libwebp comes with a raise of jSquash.
- The Lanczos filter in plain JavaScript gives within one level of sharp's at every pixel of a test image, and scales a 6000 × 4000 photograph to 3840 × 2560 in under a second in Node; the whole conversion of one took about two and a half seconds in Chromium.
- At libwebp's default effort, a 3840 × 2560 photograph of pure noise, the worst case, took five seconds to encode lossy and three losslessly, at 16 MB. At its greatest effort, method 6, it took 74 seconds for a file hardly smaller, so the default stays.
- Chromium, Firefox and WebKit each turn a camera's photograph upright by its orientation, convert its Display P3 to sRGB within a few levels of the colours drawn, and keep an opaque PNG's every pixel through the canvas (`acceptance/upload.test.js`). None keeps a partly transparent pixel's colour: (200, 100, 50) at an alpha of 3 came back as (170, 85, 85) from Chromium, (255, 170, 85) from Firefox and (255, 255, 255) from WebKit, the colour multiplied by the alpha and divided again. So a PNG to be kept lossless is read by the editor's own reader, which gives such a pixel as it was in all three. A lossless WebP chosen for an upload still goes through the canvas, and so loses as much of such a pixel's colour, which hardly shows.
- sharp's own `withIccProfile('p3')` converts what it writes into Display P3, so a test photograph's colours come back as they were drawn only when its profile is read: about twenty levels off where it is not.
