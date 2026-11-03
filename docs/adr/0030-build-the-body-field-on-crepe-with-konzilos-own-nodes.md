# ADR 0030: Build the body field on Crepe, with Konzilo's own nodes

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice, within Thomas's choice of Crepe (ADR 0001); Thomas may veto.

## Decision

- **Built with `CrepeBuilder`,** with cursor, list item, link tooltip, placeholder, toolbar, table and block edit. Left out: the image block, LaTeX until math's stage, CodeMirror, top bar and AI. That gives about 740 KB of JavaScript, in the admin host alone. Registered through `CMS.registerFieldType` as `konzilo-body`, which stores the Markdown string, and loaded when an entry opens, so that Sveltia's first paint pays for neither it nor Sätteri.
- **Konzilo's own nodes and marks** cover every element of ADR 0018:
  - images with alt text and caption, picked through Sveltia's `pickFile`;
  - galleries, and embeds as a lone address;
  - `<sup>`, `<sub>`, a non-breaking space and footnotes;
  - a heading's anchor as a badge, a quote's attribution, and a link with *Open in new tab* and `rel`;
  - internal links by search, from the service's list of titles, which holds drafts too;
  - a caption on a table, edited in place and written in the structured form, with a footer section and merged cells as a kept block at first;
  - one component node for every component a site offers, forms included, as a kept block with a small form made from the component's declaration;
  - post lists, with a dialog of their own for the query builder (ADR 0039).
- **In stages.** The text elements are built: paragraphs, headings with anchors, lists, quotes with citations, code blocks, simple tables, the inline formats and footnotes. Until the rest are, each stays in the value as a **kept block**: its own bytes, shown as source, moved as a whole. A raw `<a>` with a target or `rel` stays as its tags around editable text, since the link tooltip's editing would drop them. The site's body styles are not in the field yet (*What practice has shown*).
- **Limits.** Each type's `elements` decide the schema, the toolbar and the block menu. A pasted element the schema does not admit is reduced or dropped. Level 1 headings, separators and raw HTML are not on offer. A value that holds one all the same, or an element its type does not take, keeps it as a kept block, and the check refuses it at Save.
- **No rewrite on opening.** The field calls `onChange` only on a real edit, so nothing else changes the body. A real edit is a change after which the writer writes something other than it wrote on opening, which a trailing paragraph is not; when it writes that again, an undo say, the value's own bytes come back.
- **A way out.** A toggle shows the Markdown. If parsing and writing a value would change its meaning, as read by Sätteri in the browser, the field opens as Markdown and says why, in the editor's language. Marks that wrap one text mean the same in any order, since the editor holds them in one. If Sätteri did not load, nothing can prove a rewrite safe: the field says the early check is off, and only a value the writer writes back to the byte opens in the editor.
- **The look.** A site names its body styles in `konzilo({ bodyStyles, bodyClass })`: stylesheets that every page loads, and the class its templates wrap a body in. The site's `body.css` loads in the field too, from the same declaration, through Astro's own CSS pipeline, self-contained.
- **The body's HTML holds plain elements.** Konzilo adds its own names only where an element needs one: `konzilo-gallery`, `konzilo-embed`. No class of any editor's is written. Adding a class is a minor change; removing or renaming one, or changing the elements written for a body element, is a major one.
- **Text typed that reads as a directive** is escaped by the field's writer, and the intake's repairs stay.

## Why

- Crepe's parts can be left out one by one.
- Exact bytes are the intake's (ADR 0027), so the field must preserve meaning, not form.
- One declaration of body styles keeps the site and the field from drifting apart, and any CSS the site's build takes works, a framework's included.

## Considered and rejected

- **Crepe's image block.** It overwrites a lone image's alt text (Milkdown issue 2520, with a fix in pull request 2521).
- **A plain CSS file read as is.** No imports, packages or PostCSS would work.
- **A second set of class names to map onto the editor.** Three places to keep in step.
- **Editing a table's footer and merged cells visually now.** Settled by Thomas as source at first (ADR 0021).

## What practice has shown

Milkdown 7.23.0:

- Without CodeMirror and LaTeX, Crepe is 740 KB of JavaScript, 237 KB compressed. Its CSS stays 1.5 MB when fonts are inlined, so theme parts are imported selectively.
- Issues 2501 and 2506 put typed text in the wrong list item in 4 of 6 runs at up to 10 ms between keys, and in none at 20 ms or slower, also with a CPU slowed four times. Turning the list item feature off removed them. It is no reason to wait.
- About 70 lines of plugins fitted Crepe to the format. A `$remark` plugin over the root's children takes each paragraph starting `::` or `:::name`, up to a closing `:::`, slices its source from `String(file)` by position offsets, and swaps in `paragraph > html`, which keeps `&#10;`. For `<sub>` and `<sup>`, a `$remark` folds `html('<sub>') … html('</sub>')` into a custom node, with a `$markSchema` and a handler in `remarkStringifyOptionsCtx` that writes the raw tags back. `bullet: '-'` and `emphasis: '_'` are set there too.
- `prosemirror-tables` assumes a table's children are rows, so a caption inside the table breaks it. It is a block node of its own, `table_caption`, directly above the table, with `inline*` content. Reading is a `$remark` transform, which Milkdown runs on parsing only; writing is a `root` handler in `remarkStringifyOptionsCtx`, the one place that sees a caption and its table together. A real button must also focus the view.
- Crepe kept the whole tour of the format except for table padding and angle brackets around a lone address, which the intake evens out.
- **The build:** the field 740 KB (233 KB compressed), its CSS 24 KB (4 KB), the rule data and the check 64 KB (20 KB). All of it loads with the first entry opened. Sveltia's first paint gains 7 KB.
- **Every fixture and example opens,** but for two, in Chromium, Firefox and WebKit: Milkdown moves a space out of any mark it closes, so a link or a strikethrough with a space at its edge opens as Markdown. Bold and italic the intake moves likewise, so those keep their meaning.
- **Issues 2501 and 2506 have a cause.** Each list item puts back, a frame after it mounts, the selection it saw at mounting, even when the cursor has moved since. A patch puts it back only if the cursor has not moved (`src/cms/patches.json`), and text then lands right with no delay at all between keys. It should go upstream.
- Milkdown's own text handler returns text that ends in a space unescaped, so a typed `# x ` would be a heading: the field's writes all text through `safe`, and escapes a colon before a letter or a digit, which only Sätteri reads as a directive.
- The nesting of marks follows each mark's `priority` in the schema, with what is open kept open, so a link stays one link whatever formats its text holds. A run whose delimiters the reader would not take, `**` beside a quotation mark and a letter, is written as raw HTML.
- `Editor.remove` before `create` takes a schema, its commands and its input rules out one by one, except `uploadConfig`, which the builder's constructor reads.
- A block in the content of `blockquote` after `block+` is what Enter makes next unless it has a required attribute, so a citation has one with no default.
- A selection set in the first frame after mounting is lost to the restore above, so the test page settles for a frame. A person cannot type that soon.
- **Tried and fine:** plain spaces typed at a mark's edge, with `white-space: pre-wrap`; a link's form, through `resourceLink`; an empty paragraph, which goes, without Milkdown's `remarkPreserveEmptyLinePlugin`; a function control, so nothing overwrites its state; dragging a block by its handle; two editors in one entry.
- **Crossing Sveltia's breakpoint** remounts a control with a new `forID`. The control keeps the field for two seconds, found again by its entry, name and value, so it keeps its undo.
- **The site's body styles are not in the field yet.** `bodyClass` is not an option of the integration, and Astro's pipeline writes the stylesheets into every page's hashed CSS, while the editor is built with the web image, before any site. It takes a build of `body.css` of its own, written beside the generated configuration. So the field has Crepe's frame theme for now.
