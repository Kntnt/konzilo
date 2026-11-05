# ADR 0055: Choose images in a body from a library, and copy their texts into the post

**Date:** 2026-11-04 · **Status:** Accepted, settled by Thomas on 2026-11-04: a collection of images, each with alt text and an optional caption; `/image` chooses one, or uploads a new one that becomes the choice; alt text and caption are copied into the post, and can be changed there without changing the collection. Settled by him on 2026-11-05: what else there is to do with an image is behind one edit button on its picture, in a dialog, and removing it asks first; and a gallery has one such button, with its captions left in the flow. The rest is a technical choice; Thomas may veto.

## Decision

- **The image library** is a collection of the editor's, in the source repository's folder `image-library/`, which no type or taxonomy may take: each entry is a JSON file named by an ID, `{ "src": "/media/<name>", "alt": "…", "caption": "…" }`, its caption left out when it has none. It is no type, has no page and is not published. A site with no type that takes images has no library. It is in one language on a site in several, since what a post holds of it is the post's own, and its caption is plain text, since a format is for a use to add.
- **`/image` in the Crepe field** opens a chooser of the library's entries, with a way to upload a new one, which joins the library and becomes the choice.
- **The texts are copied.** Choosing an entry writes the image into the body with the entry's alt text and caption, as ADR 0022 writes any image. From then on they are the post's: a change in the post leaves the entry as it was, and a change in the entry leaves every post as it was.
- **An image in the field shows its picture and its caption, and one button with a pen on the picture.** It opens a dialog with the alt text and a way to remove the image, which asks first and says that the library stays as it is. Crop, rotate and the like have their place there, should they come. Nothing changes until the dialog closes with an answer: *Cancel* or Escape leaves the image as it was, Escape in the asking takes one step back, and a change is one step of undo. A blank alt text is not taken there. An image that comes from its source without one says so on the picture, since the intake would refuse it and the text is out of sight, and one with no picture to show says what it would have shown.
- **A gallery in the field is its images side by side, with each caption in place and its own caption below them, and one pen.** The pen opens a dialog with a row for each image: its alt text, a handle to drag it by, a button to move it either way, and one to remove it. *Add images* and *Remove the gallery*, which asks first, are there too. Nothing changes until it is done, so an image goes from its row without asking, *Cancel* or Escape leaves all as it was, and the whole change is one step of undo. An image on the page says so when it has no alt text, as a lone image does.
- **`/gallery` opens the chooser for several:** each click picks an image or lets it go, an upload is picked too, and they land in the order they were picked.
- **A gallery holds two images or more.** One left is that image, with the gallery's caption where it has none of its own, since the format has no other place for it. A block handle stands for the gallery as a whole.
- **The content format does not change.** A post names the original's file and holds its own texts, so nothing published or read by the site depends on the library.
- **Removing an entry does not take away a file a post still names,** since the intake refuses a post whose original is gone (ADR 0022): Sveltia removes the entry's file alone.
- **An upload is one commit, made at once,** of the original and its entry together, with the editor's own credential, by Forgejo's API from the browser, and Forgejo stores the original in LFS by the repository's `.gitattributes`. So it needs no credential of the core's, a post can name the file from the first moment, and neither stands without the other. The file is named `<words of its name>-<first 10 hex digits of its SHA-256>.<its kind>`, so the same file uploaded twice is one original, with two entries.
- **The chooser asks Forgejo for the entries** (`git/trees` and `git/blobs`), in parts, and each file once while a page is open.
- **Small pictures come from the service,** at `/_konzilo/thumbnail` on the admin host: a WebP of at most 640 px, upright and without metadata, or an SVG as itself, from a credential that can only read, to whoever Forgejo says may write. It is kept by the version of the file in a volume that can be lost, and a browser keeps it privately for an hour. Forgejo is asked about a person once in 30 seconds, since a page of pictures would otherwise ask once for each. One is made at a time, and none of a file that opens up to more than 100 million pixels.
- **A build reads only the originals some source file names,** so that a library of pictures no post uses costs a build nothing. The intake's own check is unchanged.
- **The chooser turns away what it can tell the site would refuse,** in the intake's words: a file over 30 MB, a kind the site does not take by its first bytes, a moving WebP, and a raster narrower than `smallestWidth` as its master would be. An SVG goes on to the intake, whose strict check has a parser the editor's page does not carry. The intake remains the check that counts.

## Why

- An image used again has its texts ready, while each use can still describe it as that use needs, as ADR 0022 has it.
- A copy needs no reference from a post to the library, so there is no way for a change to reach a published post unseen.

## Considered and rejected

- **One alt text for each image, everywhere.** One place to correct it, but the same picture often needs describing differently in different places (ADR 0022), and every post using it would have to be written again at each change.
- **Sveltia's media library as the chooser.** It lists files, and holds no text. A custom field cannot list another collection's entries (ADR 0029), so the chooser is Konzilo's own, and asks Forgejo.
- **Sveltia's `pickFile` and `addFile` for the upload.** `pickFile` opens that same media library. `addFile` puts a file in the draft in hand, under a `blob:` address until Save, which is no library's and goes if the post is never saved, and the entry would still need a commit of its own after it.
- **Making a small picture in the browser at upload, and keeping it in the entry.** It would put images in Git rather than LFS, and an entry made in Sveltia's own form would have none.
- **The alt text as a field in the flow, under the picture.** Always in sight, but in the way of the text around it, and with no place for what else an image may come to need.
- **Controls on each image of a gallery, in the flow.** Direct, and a crowd of buttons around the text.
- **A gallery's controls coming out at a hover or a click.** Tried by hand beside the pen: the flow is as clean, but nothing shows that they are there, they flash up when the mouse passes while writing, and a telephone has no hover. Thomas chose the pen.
- **Whole originals in the chooser.** A library of photographs would cost hundreds of megabytes to look at (ADR 0022).

## What practice has shown

- **Crepe's block menu filters by a row's label,** with no other words to go by, so the row is `/image` in an English browser and `/bild` in a Swedish one, like every other row.
- **Sätteri makes a link of an address however it is escaped,** where remark thinks an escape enough, so a caption, which takes no link, splits an address with the empty comment, as the intake does.
- **Sveltia looks for changes in the repository each minute and when its tab gets focus,** so an entry added from a post shows in its list by itself soon after.
- **An image's node** has a group of its own beside `block`, in a document node of Konzilo's, so that the schema itself keeps an image out of a quote or a list; its caption is what it holds, `(text | html)*`, the comment being the `html`. A `$view` takes `imageNode.node`.
- **An alt text's change and a change of block kind are the same kind of step,** a replace around what the block holds, so what keeps an image from becoming a heading or a code block looks at what the block would become. A typed "```" in a caption loses its space: the input rule has taken the key by then, and a caption holding three backticks needs no more.
- **Crepe's block handle looks for its block at the middle of the editor,** whatever the mouse is over, so without a filter of its own it stood on the image there, over another image's pen. Crepe sets the filter itself, so the field's goes after the feature.
- **A schema cannot demand an image,** since it would have to be able to make one up, and an image has no address by itself. So a gallery may hold none as far as the schema goes, and a plugin sees to it.
- **Firefox lets no field in something draggable take the mouse,** so a row in the gallery's dialog drags by a handle of its own, and WebKit takes no drop unless the way in says so as well as the way over.
- **Crepe draws the editor's caret itself,** and makes the browser's transparent for all the editor holds, so a field in the editor shows no caret unless it asks for the browser's back. The field's stylesheet does so for every input in the editor.
- **A search box's own Escape only empties it,** in some browsers, with the dialog left open, so the chooser takes that key itself.
