# ADR 0018: Design all prose elements from the start, and deliver them in stages

**Date:** 2026-10-27, amended 2026-11-25 · **Status:** Accepted, settled by Thomas on 2026-10-27. Forms were taken into body text as a component on 2026-11-02 (ADR 0045). Math was brought forward, before video, audio and maps, by Thomas on 2026-11-25 (issue #108, ADR 0075), as two elements, inline and block formulas; how they are written, read and shown are technical choices Thomas may veto, which ADR 0075 lists.

## Decision

- **The design covers every prose element from the start:** each one's Markdown form, rules, check and media.
- **First delivered:** paragraphs, headings at levels 2–6 with anchors, lists, quotes with attribution, code blocks, simple and structured tables, images with captions, galleries and embeds, and the inline formats bold, italic, link, strikethrough, superscript, subscript, inline code, line break, non-breaking space and footnote.
- **Delivered next:** math, as inline and block formulas, `inline-math` and `block-math` ([ADR 0075](0075-write-a-formula-as-latex-and-show-it-as-temmls-static-mathml.md)).
- **Next,** video, audio, maps and accordions, in that order. More will come later.
- **Never in body text:** buttons, fact boxes, separators, spacers and raw HTML that an editor writes. A level 1 heading is the post's title and is not on offer.

## Why

The elements are built right from the start, not for a first customer, so an element added later fits a design that already allowed for it. Each element needs its own fixtures and checks, so delivery is staged while the design is not.

## Consequences

Each element's exact Markdown form is recorded in ADR 0019 to ADR 0024 or an ADR of its own, a formula's in ADR 0075.
