# ADR 0064: Let the preview stand where an editor wants it, and show a field its block, and back

**Date:** 2026-11-10 · **Status:** Accepted. That a click in the preview leads to that place in the body field is settled (ADR 0032; Thomas, 2026-11-05). The rest is a technical choice; Thomas may veto.

## Decision

- **Never enlarged.** The page is laid out at 1,280 pixels and scaled down to a narrower pane; a wider pane shows it at its own size, as wide as the pane, as a browser window that wide would.
- **One choice of where the preview stands,** in the editor's menu: beside the form, in a window of its own, switched with the form, or off. Each sets Sveltia's own two settings and turns sync scrolling back on, in place of Sveltia's three checkboxes, whose states a site in one language cannot tell apart. The words are the editor's.
- **A window of its own** is an empty page from the editor's origin with the preview's page in a frame in it, as in the pane, so the gate, the sandbox and the guard work unchanged, and the page and the editor speak as before. The form then takes the whole width. The window opens while the menu's click lasts, as a browser asks; closed, the pane comes back with a button that opens it again.
- **Behind the page is white,** in the pane and the window, so that a page drawn again shows no dark frame.
- **The preview marks blocks within blocks.** A block within a directive's body, and a list's item, carries its path below the block it stands in, `2.1`, beside the top-level place the body field counts by. A click on it leads to the field by that path, into a list's item too, and the field frames the block for a moment.
- **And back:** a click in the body field, or the arrows moving to another block, asks the page to show that block, by its path and its text. The page finds it, the nearest with that text where the page is a moment behind, opens the `<details>` it stands in, scrolls to it, marks it, and tells the design by the event `konzilo-preview-show`, so that a design's own tab or panel opens too.
- **A click the page makes itself** says nothing, so that opening a tab to show a block does not lead the field elsewhere.

## Why

- A page shown larger than it is looked wrong in a wide pane, and showed no layout a visitor gets.
- An editor with two screens wants the form on one and the page on the other. A window straight at the preview's address loses the editor, since those pages send `Cross-Origin-Opener-Policy`.
- Finding a block on a long page is what the preview is quickest at, and finding the page's place for a block in the field is the other half of it.

## Considered and rejected

- **Keeping the focus in the preview after a click there.** The click puts the cursor where it lands and the editor types on (ADR 0032); a key that pages the preview is then in the field, which the frame around the block makes plain.
- **Revealing a design's tabs from the core.** The core cannot know a design's markup; the event lets the design do it.

## Consequences

- Patches of Sveltia's menu name its minified functions, and are looked at again with each raise of Sveltia, as every patch is (ADR 0029).
