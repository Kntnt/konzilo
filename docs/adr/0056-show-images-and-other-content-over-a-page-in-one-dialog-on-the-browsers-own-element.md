# ADR 0056: Show images and other content over a page in one dialog, on the browser's own element

**Date:** 2026-11-05 · **Status:** Accepted, settled by Thomas on 2026-11-05: one solution for all that is shown over a page, so that there is not one script for galleries and another for the rest; a lightbox on an overlay that lets 10 % through, with the picture taking the room it can and arrows outside it, left and right, none for a single image; CSS before JavaScript, JavaScript where it is truly needed or for older browsers; accessibility from the start; what Astro offers before anything else. It is built for images first, and for the rest as it is asked for. The rest is a technical choice; Thomas may veto.

## Decision

- **One shell.** All that is shown over a page stands in a `<dialog>` of the class `konzilo-modal`, opened as a modal, with a button to close it. What differs between uses is what it holds and a few custom properties: the overlay's colour, for one.
- **Lightbox is its first use.** Every image in a post's body opens in one, with nothing for an editor to choose and nothing in the content format. A gallery steps through its images; a single image is a gallery of one, with no arrows to step with.
- **The markup is written when a page is built, by `Body.astro`,** not into the body's HTML, which feeds and Markdown alternates read, and which holds plain elements (ADR 0030). An image's button and a dialog are in the page alone.
- **HTML and CSS do what they can.** A button opens and closes the dialog with `commandfor` and `command`, and the browser gives the overlay, the locked background, the kept focus, Escape and the focus's way back. The images stand in a strip that snaps, so the arrow keys step through it, a finger swipes it, and a picture is fetched when it is about to show, by `loading="lazy"`. A picture's place, "2 of 3", is written at the build.
- **JavaScript does what they cannot,** in the integration's page script: opening at the image clicked, the arrow buttons, closing at a click on the bare overlay, and opening in a browser without `commandfor`. Without JavaScript, or in an older browser with none of that, an image stays where it is on the page, as it would without any of this.
- **The shell's structure is the core's, its look the design's.** The stylesheet that makes the strip snap belongs with the markup, or the keys would not step. Colours and sizes are custom properties with defaults, for a site's design to set.
- **The field's own dialogs are not this shell.** They are the editor's, in the editor's look, and share the browser's element and nothing else.

## Why

- A `<dialog>` has what a modal library was for: a page a screen reader and a keyboard cannot leave, and the focus back where it came from. A library would now mostly add weight.
- The stepping needs no code at all in the three engines, so the code that remains is short, and a failure in it leaves a working page.
- Writing the markup at the build keeps the page's script out of the way until it is needed, and the body's HTML as it has been.
- Later uses need no second mechanism: a form, a text or a player is another thing for the shell to hold.

## Considered and rejected

- **A library** such as Micromodal or PhotoSwipe. Astro has no dialog of its own to offer, and what these do beyond the browser's element, such as a zoom of their own, is not asked for.
- **Making the dialog by script at a click, from what the page shows.** Less markup, but more script for what HTML can say, and nothing to test without running it.
- **A CSS-only lightbox on `:target`.** Each image becomes a step in the browser's history, and focus goes nowhere.
- **The dialog in the body's HTML.** A feed or a Markdown alternate would carry it, or have to take it out.

## For later uses, not built

- **A popup with content of its own** is a component in a body, through the component node, with its button or link in the text.
- **Opening by itself** after a time, at a depth of scrolling or as a visitor leaves takes a little script each, calling the same dialog. Not showing it again for a while stores something in the visitor's browser, so it goes through consent (ADR 0049).
- **A player** must stop when the dialog closes, which takes script, and it waits for consent as any embed does (ADR 0024).
- **A form** takes no closing at a click outside, or what was typed could be lost: `closedby="closerequest"`.
- **A non-modal popup** is the same element shown with `show()`, or `popover`.
- **A look per use** is a named variant in the design, not colours chosen per popup.

## What practice has shown

Tried on a throwaway page in Playwright's Chromium 156, Firefox 157 and WebKit 27.2, without a line of script for any of this:

- A button with `command="show-modal"` opens the dialog, with `html:has(dialog:modal)` locking the background and `::backdrop` at 90 % black.
- An `autofocus` on the strip puts the focus there, and each press of an arrow key moves exactly one picture, in all three.
- No large picture is asked for before the dialog opens, and two when it opens, the one shown and the next.
- A custom command, `--next`, reaches a listener on the strip.
- Escape closes it. The focus returns to the button in Chromium and Firefox. WebKit does not focus a button at a click, so there it returns to the page.
- A dialog that fills the screen has no bare backdrop left to click, so `closedby="any"` closes nothing in the lightbox, and the script does that.

Not yet tried: real Safari, a phone, a finger's swipe and a screen reader.
