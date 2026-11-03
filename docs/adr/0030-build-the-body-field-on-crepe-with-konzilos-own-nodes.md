# ADR 0030: Build the body field on Crepe, with Konzilo's own nodes

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice, within Thomas's choice of Crepe (ADR 0001); Thomas may veto.

## Decision

- **Built with `CrepeBuilder`,** with cursor, list item, link tooltip, placeholder, toolbar, table and block edit. Left out: the image block, LaTeX until math's stage, CodeMirror, top bar and AI. That gives about 740 KB of JavaScript, in the admin host alone. Registered through `CMS.registerFieldType`, which stores the Markdown string.
- **Konzilo's own nodes and marks** cover every element of ADR 0018:
  - images with alt text and caption, picked through Sveltia's `pickFile`;
  - galleries, and embeds as a lone address;
  - `<sup>`, `<sub>`, a non-breaking space and footnotes;
  - a heading's anchor as a badge, a quote's attribution, and a link with *Open in new tab* and `rel`;
  - internal links by search, from the service's list of titles, which holds drafts too;
  - a caption on a table, edited in place and written in the structured form, with a footer section and merged cells as a protected source block at first;
  - one component node for every component a site offers, forms included, as a protected block with a small form made from the component's declaration;
  - post lists, with a dialog of their own for the query builder (ADR 0039).
- **Limits.** Each type's `blocks` decide the schema, the toolbar and the block menu. A pasted element the schema does not admit is reduced or dropped. Level 1 headings, separators and raw HTML are not on offer.
- **No rewrite on opening.** The field calls `onChange` only on a real edit, so nothing else changes the body.
- **A way out.** A toggle shows the Markdown. If parsing and writing a value would change its meaning, as read by Sätteri in the browser, the field opens as Markdown and says why.
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
