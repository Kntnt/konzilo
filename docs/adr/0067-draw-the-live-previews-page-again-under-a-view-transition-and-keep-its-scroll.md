# ADR 0067: Draw the live preview's page again under a view transition, and keep its scroll

**Date:** 2026-11-10 · **Status:** Accepted. Settled by Thomas: the preview draws a page again without an empty frame, keeping the scroll, on every site with no script of its own, and a browser without view transitions reloads it on a white frame, with the scroll kept (2026-11-10). The rest is a technical choice; Thomas may veto.

## Decision

- **The page holds the dev server's reload.** Astro's dev server shows a change by having its script in the page reload it. In the live preview alone, a script the core writes into each page (`src/astro/preview-redraw.js`) meets that reload at the Navigation API's `navigate` event, stops it, and replaces the page's history entry with its own address instead: the same path and query, with no fragment. A reload by the page's own script is met the same way.
- **Under a view transition across documents.** The script asks for one, `@view-transition { navigation: auto; }`, in a sheet of its own that the document adopts, on the page that goes and on the page that comes. A reload never has one, and a replace within the origin does: the browser keeps the old page in view until the new one is drawn, and fades from one to the other.
- **The scroll is kept** in the frame's session storage, with the address, as the page goes. The new page goes back to it when it is revealed, and again when it is read and when it has loaded, until it is there, since it may be shorter when first drawn than when it is whole.
- **The guard lets a page replace itself with its own address,** the same path and query, sent by no form, and nothing else it stopped before ([ADR 0032](0032-preview-live-beside-the-form-and-share-a-draft-through-a-secret-link.md)).
- **A browser without view transitions across documents,** or whose session storage is closed to the frame, reloads, as before, on the white behind the frame ([ADR 0064](0064-let-the-preview-stand-where-an-editor-wants-it-and-show-a-field-its-block-and-back.md)), and a reload keeps the scroll.
- **Every site has it,** with no script of its own, in the pane and in a window of its own alike, since both frame the same page.

## Why

- In Chromium, a reload in a frame showed a wholly white frame between the old page and the new, and then the new page without its pictures.
- A view transition across documents is what a browser offers to keep a page in view until the next is drawn, and it is for every navigation within an origin but a reload: hence the replace.
- Replacing the entry, rather than adding one, leaves the frame's history as a reload leaves it.

## Considered and rejected

- **Swapping the page's content by a script, as Astro's client router does.** The site's scripts would run otherwise than on the public site, and a site's own script would have to be written for it.
- **Holding the first drawing until the whole new page is read,** by `<link rel="expect" blocking="render">`. Chromium then never fades to a page half read, but WebKit shows a white frame for as long as it holds.
- **Keeping the scroll in the navigation's own state.** Chromium and WebKit drop it at a replace across documents in a frame.
- **Listening to Vite's script for its reload.** It tells a module of Vite's before it reloads, but cannot be told not to, and the page's head holds no such module.

## What practice has shown

- Chromium 156 and WebKit 27.2 draw the transition in the preview's sandboxed frame. Firefox 157 has none across documents, and reloads, keeping the scroll.
- A picture the new page shows may not be decoded when the transition begins, and fades in with it.

## Consequences

- A design's `view-transition-name`s and `::view-transition-*` rules take part in the redraw in the preview, which `docs/site-design.md` notes.
