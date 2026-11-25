# ADR 0022: Make each image's master from its original, and write images and galleries in Markdown

**Date:** 2026-11-03, amended 2026-11-25 · **Status:** Accepted as a technical choice; Thomas may veto. Settled by Thomas on 2026-11-25 (#114): the editor's browser converts an image before it is uploaded, with libwebp as WebAssembly rather than the browser's canvas, its longest side at most 3840 px and at quality 90 by default, both an Admin's settings, without any metadata; *Lossless compression*, ticked by default for a PNG, makes the original, its master and every version lossless; and the intake still trusts nothing it is sent. Technical choices of #114 Thomas may veto: libwebp as jSquash's WebAssembly build (`@jsquash/webp`), its code fetched in a worker of its own when an upload starts; the browser's own decoder turning the image upright and into sRGB, and the scaling in plain JavaScript by sharp's filter; the settings group `imageUpload`, with `longestSide` and `quality`; the mark of lossless compression held by the original's own encoding, a `VP8L` chunk, which its master keeps, with the library entry's `lossless` as the record of the editor's choice; and *Converting the image…* shown, with the page alive, while a large image is converted.

## Decision

**Originals** are the files editors upload, in Git LFS in the source repository, private. **A file may become public only through the intake and a build.** Monitoring asks for an LFS object without a login, and expects a refusal.

**The editor's browser converts an image before it is uploaded,** whichever way it is uploaded, the chooser's upload or the image library entry's own form ([ADR 0063](0063-make-the-image-library-the-one-place-for-images.md)), and what it makes is the original:

- A JPEG, PNG or still WebP is decoded by the browser, which turns it upright by its orientation and converts it to sRGB by its own colour profile. It is scaled down, never up, so that its longest side, width or height, is at most `imageUpload.longestSide` in the site settings, 3840 by default, by a Lanczos filter of three lobes, as sharp's, in plain JavaScript, a band of rows at a time, its colours weighed by their opacity (`src/cms/image/resize.js`). libwebp, as WebAssembly, encodes it as a WebP at `imageUpload.quality`, 90 by default, or losslessly. libwebp writes the picture and nothing else, so none of the file's metadata, the place it was taken among it, leaves the editor's machine. An SVG is uploaded as it is ([ADR 0023](0023-check-svg-strictly-and-keep-it-svg-on-the-site.md)).
- The work runs in a worker of its own (`src/cms/image/convert-worker.js`), which the upload starts, so the page stays alive, and its code, libwebp's among it, is fetched only then. The editor sees *Converting the image…*, then *Uploading…*, on the upload's button and in a line a screen reader reads. A file the browser cannot convert is not uploaded, and the editor is told so.
- **Lossless compression**, a checkbox, ticked for a PNG, most often a drawing, a diagram or a screenshot, and not for a JPEG or a WebP, decides before the conversion whether the WebP is lossless. In the library entry's own form it stands under the file, and changing it converts the file chosen again while the entry is unsaved.
- **The mark of lossless compression is the original's own encoding.** A lossless WebP holds its picture in a `VP8L` chunk, first or after its extended header, `VP8X`, where a lossy one holds `VP8 `. `isLosslessWebp(bytes)` in `src/format/originals.js` reads it. The intake makes a lossless master of such an original, which so holds the mark in the same way, and whatever makes versions of a master reads it from the master's bytes and makes them lossless too. The library entry records the editor's choice as `"lossless": true`, left out otherwise, for its form; nothing that makes a master or a version reads the entry, since a post names the file and not the entry, and two entries may name one file.
- **The settings,** the core's group `imageUpload` in `settings.json`, an Admin edits as the other groups ([ADR 0033](0033-keep-menus-settings-and-the-sites-identity-in-files-an-admin-edits.md)): `longestSide`, a whole number of pixels from 1 to 16383, libwebp's greatest, and `quality`, from 1 to 100. Each upload reads them from the source repository as it starts, so an Admin's change holds from the next one; one the file does not hold, or holds outside its bounds, is its default.
- **The intake trusts nothing it is sent.** It checks every original and makes its master as before, so a file that reaches the source another way, as an import, still works; a JPEG or a PNG put there gets a lossy master, as before. The 30 MB limit holds for the file chosen, before it is converted, and the site's smallest width for the master the converted file would make.

**A master** is made by the intake, with sharp at the exact version Astro takes, so that the site holds one copy:

- WebP at quality 90, its longest side at most 2520 px, scaled down only, turned upright, converted to sRGB by the original's own profile, and then without any metadata; an original that is a lossless WebP gets a lossless master. The same original gives the same bytes.
- Named `<slug>-<first 10 hex digits of the original's SHA-256>.webp`, in `content/media/`. A content file names it `../media/<name>`.
- A master already there is left alone. Each build removes every master no content file names, a refused post's kept file among them.
- An image is refused, naming the field or the block, when its original is gone or its first bytes are not a still JPEG, PNG or WebP, whatever its name says; an SVG goes by ADR 0023 instead. HEIC, GIF, TIFF, BMP and a moving WebP are refused saying what to do instead. Uploads are at most 30 MB. `images: { smallestWidth, displayWidth }` in the site description gives the widths, required where a type takes images; below the smallest is refused, and below the display width warned of. Width is measured as the master's.

**The featured image** is a field, `image: {"src":"../media/<name>","alt":"…"}`. Its alt text belongs to the post. A draft saves without it; publishing or scheduling without it is refused. A post whose original is gone is refused, naming the field.

**An image in body text** is a Markdown image of its master alone in a paragraph, its caption on the next line after a hard line break:

```markdown
![A red barn at dusk](../media/barns-1a2b3c4d5e.webp)\
The barn _in 1920_
```

Alt text belongs to each use. It is written without the spaces at its edges, with `\`, `*`, `` ` ``, `[` and `]` always escaped, and it is required: decorative images and multi-line alt text are refused. A caption takes emphasis, strong, code, superscript and subscript, and no link, line break or footnote. An image stands at the top of the body, or in a list's item ([ADR 0061](0061-keep-a-tasks-box-and-let-a-lists-item-hold-an-image.md)). The reader renders the paragraph as `<figure><img src alt><figcaption>…</figcaption></figure>`, and Astro makes its versions from the master.

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
- **The browser's canvas encoding the WebP,** `toBlob('image/webp')`. Safari's gives a PNG instead, and none offers lossless encoding or says what it keeps.
- **libvips as WebAssembly,** `wasm-vips`, the library sharp is built on, which would make the original as the intake makes a master. It needs `SharedArrayBuffer`, and so an admin host isolated from every other origin, which would cut Sveltia's sign-in window off from the editor and keep Forgejo's pictures out, and it is several megabytes.
- **The browser's own scaling,** a canvas's or `createImageBitmap`'s. Each engine scales by a filter of its own, some poorly at a large factor, and a canvas the size of a photograph is more than some browsers allow.
- **Uploading the file as it was where the browser cannot convert it.** Its metadata would leave the editor's machine.
- **The mark only in the library entry,** or in the file's name. Nothing that makes a master or a version reads the library, and a name says what anyone may write in it.
- **libwebp built for the core.** The core has no Emscripten of its own to build it with, and jSquash's is the build Google's Squoosh shipped, kept up and widely used.

## What practice has shown

- An unsaved upload has a `blob:` address in the draft, and the reader drops such an image, so the preview's template sends the file too (ADR 0032).
- Uploading through Sveltia lands in LFS, as a pointer in Git, with no help.
- Sveltia's media library fetches whole originals as thumbnails: six visible images were 3.7 MB, and a dozen turns of the wheel 75 requests and 46 MB. It works, but on a phone connection it wants real thumbnails later.
- Sharp converts colour profiles and strips GPS and camera data, so a master never carries them. An original keeps them, which is acceptable only because originals are private.
- jSquash 1.5.0 holds libwebp 1.1.0, from 2020, as its `version()` says, where the package's notes say 1.0.2. It encodes only pixels the browser has decoded, inside WebAssembly's sandbox, and a newer libwebp comes with a raise of jSquash.
- The Lanczos filter in plain JavaScript gives within one level of sharp's at every pixel of a test image, and scales a 6000 × 4000 photograph to 3840 × 2560 in under a second in Node; the whole conversion of one took about two and a half seconds in Chromium.
- At libwebp's default effort, a 3840 × 2560 photograph of pure noise, the worst case, took five seconds to encode lossy and three losslessly, at 16 MB. At its greatest effort, method 6, it took 74 seconds for a file hardly smaller, so the default stays.
- Chromium, Firefox and WebKit each turn a camera's photograph upright by its orientation, convert its Display P3 to sRGB within a few levels of the colours drawn, and keep a PNG's every pixel through the canvas, so the browser's own decoder is enough for the part of the conversion that is not libwebp's (`acceptance/upload.test.js`).
- sharp's own `withIccProfile('p3')` converts what it writes into Display P3, so a test photograph's colours come back as they were drawn only when its profile is read: about twenty levels off where it is not.
