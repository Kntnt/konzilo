# ADR 0015: Describe the content format in one document, and test it

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: write it. The rest is a technical choice; Thomas may veto.

## Decision

- **One hand-written document, `content-format.md`, packed in the npm package,** so every installed core and every archive carries the format of the core it pins. It describes the published files, and has a part on source files.
- **It carries the core's version.** A change that makes an existing file read otherwise, or refused, is major; a new element, field or file is minor. The content files carry no version marker.
- **Tests fail** when it misses an element, embed service, field kind or file kind the core knows, or when one of its examples is not in the exact form. Its examples are marked by their info strings, and its whole files build as a site whose tour page must show each block and inline element of the rule data.
- **Every change to the format updates it in the same change.**

## Why

- The format is the published record and outlives any editor.
- Shipping it beside the reader keeps the version right.
- The tests stop it drifting.

## Considered and rejected

- **`docs/` alone.** Not in sites or archives.
- **Tables generated from the rule data.** More machinery than the tests need.
