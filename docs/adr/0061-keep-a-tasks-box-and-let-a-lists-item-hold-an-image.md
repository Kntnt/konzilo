# ADR 0061: Keep a task's box, and let a list's item hold an image

**Date:** 2026-11-10 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

- **A task list is a list.** An item may begin with GFM's box, `[ ] ` or `[x] `, after its marker, in a bulleted or a numbered list, and a list may hold tasks and plain items both. The model keeps each item's box, ticked, unticked or none, and writes it back exactly. A plain item whose text begins as a box would is written with its brackets escaped, as before. The site shows a task with a checkbox the visitor cannot change, as the reader renders it, and its Markdown alternate keeps the box.
- **A list's item may hold an image,** or an image that is a link: `image` is among a list's inline elements in the rule data. It resolves to its master as a figure does, with the same reasons and warnings, at the item's path. It never goes without alt text, as ADR 0022 has it, and a linked image's refusal says that the alt text names the link.
- **Nowhere else.** A paragraph's text, a quote and a table still refuse an image that does not stand alone as a figure.

## Why

- Questions for a reader to tick off are a task list in GFM, and every Markdown tool shows them so. Refusing them made such a list plain text, which lost what it was.
- A list of logos is a list whose items are pictures, and each a link to whom it names. A list keeps it readable as Markdown, as a series of figures would not.
- The alt text of a linked image is the link's only name for whoever does not see it, so it cannot go without; for one that is no link, ADR 0022 already asks for it.

## Considered and rejected

- **A directive for a checklist.** It would mean a form of the site's own for what GFM already writes.
- **Images in any inline text.** A picture within a sentence has no place in the design; a list of pictures does.

## Consequences

- Removing tasks or images in list items would refuse files that were published, a major change.
