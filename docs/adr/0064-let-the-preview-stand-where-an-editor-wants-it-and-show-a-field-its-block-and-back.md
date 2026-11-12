# ADR 0064: Let the preview stand where an editor wants it, and show a field its block, and back

**Date:** 2026-11-10 · **Status:** Accepted. Settled by Thomas: a click in the preview leads to its block in the body field (2026-11-05), which it scrolls to and frames, while the focus stays in the preview (2026-11-10). The rest is a technical choice; Thomas may veto.

## Decision

- **Never enlarged.** The page is laid out at 1,280 pixels and scaled down to a narrower pane; a wider pane shows it at its own size, as wide as the pane, as a browser window that wide would.
- **One choice of where the preview stands,** in the editor's menu: beside the form, in a window of its own, switched with the form, or off. Each sets Sveltia's own two settings and turns sync scrolling back on, in place of Sveltia's three checkboxes, whose states a site in one language cannot tell apart. The words are the editor's.
- **A window of its own** is an empty page from the editor's origin with the preview's page in a frame in it, as in the pane, so the gate, the sandbox and the guard work unchanged, and the page and the editor speak as before. The form then takes the whole width. The window opens while the menu's click lasts, as a browser asks; closed, the pane comes back with a button that opens it again.
- **Behind the page is white,** in the pane and the window, so that a page drawn again shows no dark frame.
- **The preview marks blocks within blocks.** A block within a directive's body, and a list's item, carries its path below the block it stands in, `2.1`, beside the top-level place the body field counts by. A click on it leads to the field by that path, into a list's item too.
- **A click in the preview shows, and leaves the focus there.** The body field scrolls to the block and frames it for a moment, outside the editor's own document; the focus and the cursor stay where they were, so a key pressed while looking around goes to the page, never into the text. The structure field opens the block's row and brings it into sight, with nothing in its form focused. The window of its own behaves as the pane.
- **And back:** a click in the body field, or the arrows moving to another block, asks the page to show that block, by its path and its text. The page finds it, the nearest with that text where the page is a moment behind, opens the `<details>` it stands in, scrolls to it, marks it, and tells the design by the event `konzilo-preview-show`, so that a design's own tab or panel opens too.
- **Only a page that has said it is there is asked.** Each page of the preview says so, `konzilo-preview-ready`, once it listens; until then a frame, new in the pane or in the window, holds an empty document of the editor's own origin, where a message meant for the preview's origin is refused, and WebKit and Firefox say so in the console. A click before then asks nothing.
- **A click the page makes itself** says nothing, so that opening a tab to show a block does not lead the field elsewhere.

## Why

- A page shown larger than it is looked wrong in a wide pane, and showed no layout a visitor gets.
- An editor with two screens wants the form on one and the page on the other. A window straight at the preview's address loses the editor, since those pages send `Cross-Origin-Opener-Policy`.
- Finding a block on a long page is what the preview is quickest at, and finding the page's place for a block in the field is the other half of it.
- The preview is for looking. A key pressed there scrolls the page, and the text changes only where the editor has put the cursor.

## Considered and rejected

- **Putting the cursor where the click lands.** An editor who clicks in the preview is looking around, and a key pressed then, a space or an arrow to scroll the page, would land in the text. The frame shows where the block is; a click there puts the cursor in it.
- **Revealing a design's tabs from the core.** The core cannot know a design's markup; the event lets the design do it.
- **Looking at the frame's document from the editor** to tell whether the page has come. WebKit says in the console that a frame on another origin was looked at, which is the case once the page is there.
- **Asking whatever document the frame holds, with any origin as the target.** The message carries a block's text, which only the preview's origin may be sent.

## Consequences

- Patches of Sveltia's menu name its minified functions, and are looked at again with each raise of Sveltia, as every patch is (ADR 0029).
