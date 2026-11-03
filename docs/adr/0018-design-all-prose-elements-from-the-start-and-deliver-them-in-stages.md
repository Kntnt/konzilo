# ADR 0018: Design all prose elements from the start, and deliver them in stages

**Date:** 2026-10-27 · **Status:** Accepted, settled by Thomas on 2026-10-27. Forms were taken into body text as a component on 2026-11-02 (ADR 0045).

## Decision

- **The design covers every prose element from the start:** each one's Markdown form, rules, check and media.
- **First delivered:** paragraphs, headings at levels 2–6 with anchors, lists, quotes with attribution, code blocks, simple and structured tables, images with captions, galleries and embeds, and the inline formats bold, italic, link, strikethrough, superscript, subscript, inline code, line break, non-breaking space and footnote.
- **Next,** video, audio, maps, math and accordions, in that order. More will come later.
- **Never in body text:** buttons, fact boxes, separators, spacers and raw HTML that an editor writes. A level 1 heading is the post's title and is not on offer.

## Why

The elements are built right from the start, not for a first customer, so an element added later fits a design that already allowed for it. Each element needs its own fixtures and checks, so delivery is staged while the design is not.

## Consequences

Each element's exact Markdown form is recorded in ADR 0019 to ADR 0024 or an ADR of its own.
