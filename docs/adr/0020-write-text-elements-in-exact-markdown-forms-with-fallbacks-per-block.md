# ADR 0020: Write text elements in exact Markdown forms, with fallbacks per block

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

The intake writes these forms, whatever Crepe wrote, so a change of form needs no migration of source files.

- **Headings** are ATX at levels 2 to 6; level 1 is refused. **An anchor** is an empty raw `<a>` before the text, `## <a id="the-start"></a>The start`, holding only a to z, digits, hyphens and underscores. The reader lifts it onto the heading, before Astro's own plugin, so that Astro lists the heading under it. Two headings with one anchor are refused, as is an id of the footnotes', since a link to it would land elsewhere with nobody told.
- **Lists** use `- ` for bullets and count numbers from 1. An item's further lines and nested lists are indented by its marker's width. A list is always tight. A list right after a list of its kind takes the other marker, `*` after `-` and `1)` after `1.`, and back. A list starting at any number but 1 is refused.
- **Quotes** put `> ` before each line and a lone `>` between their blocks. **A citation** is the quote's last paragraph, wrapped whole in raw `<cite>`, after a lone `>`, without a line break. An empty one goes.
- **A code block** is fenced with backticks, more than any run in the code and at least three, with no info string. Characters are written as typed; spaces and tabs at the end of a line, and the newline that ends the code, go. It holds text alone, is never empty, and stands at the top level.
- **Inline code** is a code span between the shortest run of backticks the code does not hold, with a space inside each delimiter where needed. It holds text alone.
- **Inline formats:** `**bold**`; `_italic_`, or `*italic*` where a letter or digit touches the delimiter; `~~strikethrough~~`; `[text](address)`, with `<address>` when it holds a space or a parenthesis; raw `<sup>` and `<sub>`; a backslash before the newline for a line break; U+00A0 as the character.
- **Footnotes** are GFM's: each mark `[^N]`, each text `[^N]: text` after every block, one blank line between them, N its place among the marks, counted through the post from 1. Further lines are indented four spaces. Marks stand in paragraphs and list items, never in a heading, a link's text or a table. A text holds what a paragraph's text holds, but a footnote. A colon right after a mark at a line start is escaped, `[^1]\: x`. A footnote marked twice, an empty one, or marks and texts out of step are refused, never mended. Astro renders them as Sätteri does, with its section heading and back links in the site's language where the core has them.
- **Fallbacks are levels, per top-level block.** Every block is first written in its minimal form. While the site reads a block back wrong, it takes the next level, each adding to those below: 1 splits what GFM would autolink with an empty comment, 2 escapes strictly, 3 writes bold, italic and strikethrough as raw HTML. A block still read wrong at level 3 is refused.
- **The read-back compares two trees per block.** The reader's tree of the source body, with references resolved and image paths replaced, against the reader's tree of the written body, both by Sätteri. A whole body is read each time, since a block is read otherwise beside a footnote's text or a link definition, and one block's level is raised at a time, the first read wrong, so that a later block is not raised for what an earlier one did.
- **A block inside another is named by its path,** `2.1`, and every problem is named.
- **No link points to the admin host.** A fragment-only link is refused; a link to an anchor in the same post is a path on the site, `/<slug>/#<anchor>`.

## Why

- Numbers counted from 1 read as a reader writes them.
- A tight list renders its items without `<p>`.
- Fallbacks per block keep every other block in its plainest form, and cumulative levels need no search: four tries at most.
- The empty `<a id>` is the usual explicit anchor in Markdown read with raw HTML, and any Markdown tool keeps it.
- The `<cite>` paragraph keeps the attribution apart from the quote's own paragraphs, where a plain `— Name` line would be one more paragraph.
- Characters as typed in code need no escapes at all.
- GFM footnotes read back through the site's reader and need no raw HTML. Numbers as labels make the file read as the page shows it.

## Considered and rejected

- **`1.` on every item.** The file reads poorly, and nothing diffs content files by hand.
- **Sätteri's `headingAttributes`, `{#id}`.** It makes a trailing `{…}` in every heading mean something else.
- **`<h2 id="x">…</h2>` as raw HTML.** The heading's text would no longer be Markdown.
- **Moving a space out of a strikethrough run,** as bold and italic do. The page would lose the line through it.
- **Keeping the newline that ends a code block.** The page shows none.
- **Raw HTML for footnotes.** No portable Markdown.
- **Mending marks and texts out of step.** The intake never believes either side.

## What practice has shown

- Rendered HTML adds nothing to the comparison of trees: one reader renders two equal trees alike, and what the reader's plugins do with a tree, a figure, an embed's panel and a heading's anchor, the check reads from the tree by the same shapes. It would also need an expected page, which the source cannot give once spaces have moved out of a run and footnotes have been counted, and only a second renderer could. So the check compares trees, and the fixtures hold what each form renders.
- A tree cannot tell `[address](address)` from a bare address, and the reader shows both as an embed. So a source's brackets are read from the source, and a written body's lone link with its own address as its text counts as an embed, until the empty comment splits it.
