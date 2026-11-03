# ADR 0016: Read Markdown with Sätteri, the reader Astro uses

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

- **One reader: Sätteri, the copy Astro installs,** 0.10.5 for Astro 7.4.2. The Astro integration owns its options, GFM, raw HTML and directives on, smart punctuation off, and the intake takes them from it.
- **A site has exactly one copy of Sätteri,** which CI checks with `npm ls satteri`. Sätteri moves when Astro moves it, and only after the intake suite passes on the new version.
- **The Crepe field checks a value by Sätteri in the browser,** through its WebAssembly build (ADR 0030).

## Why

- A read-back with any other reader, or another version of it, proves nothing about the page visitors get. The rules depend on the version: in 0.10.5, for example, backslashes and entities do not stop an autolink.
- Taking the options from the integration means the site's setting and the intake's check cannot drift apart.

## Considered and rejected

- **remark,** Astro's earlier reader. The site would have to be configured away from Astro's own.
- **A newer Sätteri pinned in the package.** Astro would install its own beside it, and the intake would check with a different reader from the one that renders the site.

## What practice has shown

Sätteri 0.10.5's directive feature, seen on 2026-10-30:

- A name starts with a letter or a digit of any script and goes on with letters, digits, `-` and `_`. `10:30` reads as `10` and a directive named `30`; `a:b` and `mailto:a@b.se` likewise. `:smile:` and `x::y` read as text.
- At a line start, `::x` is a leaf and `:::x` a container, even right after a paragraph's line; `:::` and `::` alone are text. A leaf with text after its braces is text.
- A directive no plugin renders is dropped from the page with its body.
- An attribute's value reads every character as it is, `\"` and `&quot;` included, cannot hold a line break, and ends at a `}` even inside quotes. Single quotes hold a `"`. `#x` and `.x` are `id` and `class`.
- A leaf's label reads as inline Markdown, and a hard break inside it cuts it short. A container's label is its first paragraph.
- A pipe table right before a container's closing fence reads the fence as its last row; a blank line ends it first.
- `\:` reads as a colon.

The WebAssembly build, in the browser, at 0.10.5:

- It runs in Chromium, Firefox and WebKit on a page with no cross-origin isolation, under the admin host's policy with `'wasm-unsafe-eval'` and `worker-src 'self'`. It gives the intake's verdict on every fixture and example, byte for byte. It is 3.09 MB of WebAssembly (952 KB compressed), 270 KB of JavaScript (62 KB) and a 249 KB worker (55 KB), and creates its workers at start.
- npm skips its package as `satteri`'s optional dependency, since it declares `cpu: wasm32`, and refuses it as a direct one without `--force`, which would turn the check off for every package. The lockfile holds it all the same, with its version, address and integrity and those of what it needs, so `scripts/wasm-reader.js` fetches exactly that for the editor's build, and refuses bytes that do not match. A test holds its version to `satteri`'s.
- Vite must have `resolve.conditions` with `browser`, which picks it for `#binding`, and `worker: { format: 'es' }`.
- Its runtime tries `new Function()` to see whether it may. The policy refuses, as it should, and Firefox reports that as a violation, so a patch goes straight to what it does on refusal.

Other facts of the reader: `^x^` is misread in cases like `Fe^-^`, so superscript and subscript are raw HTML; a list starting at 3 renders `start`; in a pipe table's cell Sätteri keeps the backslash of `\|` inside raw HTML.
