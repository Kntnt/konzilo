# ADR 0065: Let a type edit its bodies as a tree of their levels

**Date:** 2026-11-10 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

- **A type may choose the structure field** for its bodies, `"editor": "structure"` in the site description, in place of the body field, `"text"` by default. It is ADR 0030's one component node for pages built of components.
- **The value stays the body's Markdown,** so Sveltia saves it as any field, the early check and the intake read it as any body, and nothing after the editor changes.
- **Every level is drawn as cards within cards,** as the bands of the page: what can hold something is a card, its type a small heading above what it is about, its depth a slightly stronger tone; text, headings and items are rows in their card, their type to the right. A node's summary is its own text, else its items' headings, else the first text within it.
- **The selected node opens a small form** within itself: a component's attributes, from the site description, with their labels; a paragraph in the body field itself; a list's items; an image from the library. A line at the top says where one is, `Page › Section › … › Item`, each part a link; a search finds a text on the page; a switch shows the file as Markdown.
- **Rows move up and down, are removed, and are added,** among the blocks and the site's components the type takes.
- **The preview and the tree lead to each other** by the path the preview marks each block with (ADR 0064): a click on the page opens its row, and a row selected shows its block in the page. A body field within the tree leaves both to the tree.
- **It reads the exact form line by line,** small and synchronous, and says so where a value is written otherwise; the intake remains the check that counts.

## Why

- A page built of components opens in the body field as kept blocks of source, all of it. A tree shows what holds what, and a click on the page removes the depth: a deep item is three clicks from signing in, Save included.
- One line per node, saying what it is about, is what keeps a long page readable; every node open is too much, and only types too little.

## Considered and rejected

- **The tree for every hierarchical type.** Whether a body is built of components is the site's choice, not its addresses'.
- **Parsing through the site's reader.** It would make the field wait on Sätteri's WebAssembly for every keystroke's tree.

## Consequences

- A component needs a label for the tree, which the site description already asks for (ADR 0060).
