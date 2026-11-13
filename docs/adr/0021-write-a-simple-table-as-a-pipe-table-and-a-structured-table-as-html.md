# ADR 0021: Write a simple table as a pipe table, and a structured table as HTML

**Date:** 2026-11-02, amended 2026-11-13 · **Status:** Accepted. Settled by Thomas on 2026-11-02: a table caption is visual; a footer section and merged cells are edited as source at first, with the result in the live preview, and simple tables stay visual. The visual editor for the rest is built when a customer needs it. The forms are a technical choice; Thomas may veto. Settled on 2026-11-13, as a technical choice Thomas may veto: the site renders each table of a body, of either form, in a `div` of the core's class `konzilo-table`, which no content file holds, its caption inside the table within it; in the live preview the block's mark stands on that `div`, a component's tree holds it as the page does, and the Markdown alternate writes the table alone.

## Decision

**A simple table** is what a GFM pipe table says: one header row, then zero or more rows, every row with the header's number of cells, each column aligned alike. Each cell holds text with the inline formats of a heading.

```markdown
| Gear | Price |
| --- | ---: |
| Tent | 120 |
```

A pipe at both ends of each row, and one space either side of each cell's text, not padded to its column's width; an empty cell is `|  |`. A `|` in a cell is `\|`; inside raw HTML, `&#124;`.

**A structured table** has a caption, a footer section or a merged cell. It is an HTML table of one fixed shape:

```markdown
<table>
<caption>What we packed</caption>
<thead>
<tr><th>Category</th><th>Item</th><th style="text-align: right">Price</th></tr>
</thead>
<tbody>
<tr><td rowspan="2">Shelter</td><td>Tent</td><td style="text-align: right">120</td></tr>
<tr><td>Pegs</td><td style="text-align: right">5</td></tr>
</tbody>
<tfoot>
<tr><td colspan="2">Total</td><td style="text-align: right">125</td></tr>
</tfoot>
</table>
```

A line for each tag that opens or closes the table and its sections, one for the caption and one for each row, and no blank line. A cell's attributes come in the order `colspan`, `rowspan`, `style`. Formats are `<strong>`, `<em>`, `<a href>`, `<sup>`, `<sub>`, `<code>` and `<del>`; `&` is `&amp;` and `<` is `&lt;`. A caption of nothing but spaces goes.

**Refused for good:** a table without a header row, more than one, a plain cell in it, a header cell outside it, a column aligned differently, an empty table, a line break in a cell, and a table inside a quote or a list. **A merged cell is counted by its spans:** every row of each section must cover each column once; a cell merged past its section, overlaps and rows of different widths are refused. A column's alignment is that of the cells that start in it. **A footnote mark** cannot stand in either kind.

**On the site,** each table, of either form, stands in a box the reader writes round it when it renders a body, a `div` of the core's class `konzilo-table` holding the table and nothing else:

```html
<div class="konzilo-table"><table>
<caption>What we packed</caption>
…
</table></div>
```

A content file holds the table alone, as it holds an image without its figure (ADR 0022). A table with a caption has the same box, its caption still the table's first child. The box is the block: in the live preview its mark stands on the `div` (ADR 0068), so a click anywhere in the table leads to it; a component's tree holds the `div` as the rendered body does; and the Markdown alternate writes the table and nothing of the box (ADR 0047). The box has no `tabindex` and no role. `docs/site-design.md` names the class.

**In the field,** a caption is edited in place, written in the structured form; a footer and merged cells are a kept block (ADR 0030).

## Why

- A pipe table is the form every Markdown tool reads as a table.
- Unpadded cells keep a change to one cell on one line of the history.
- HTML's table holds the rest, and reads back through the site's reader as written. One fixed shape keeps it as strict as any Markdown form: the check refuses any other HTML block, so an editor's own raw HTML never reaches the site.
- `<caption>` is the table's own, which assistive technology reads as its name.
- A design needs a box round a table, to size and to scroll: no engine lets a caption widen a table, percentage widths give every column the same share, and a table that is itself made to scroll loses its table layout. In the box, a wide table scrolls in its own box at a phone's width while the page does not, and a narrow one can fill its column, each keeping its layout.
- Written at rendering, the box costs no content file a byte, and a design may count on it for every table, whatever wrote the file.

## Considered and rejected

- **Padding cells.** It churns the history.
- **An empty header row for a table without one.** The site would show a row nobody wrote.
- **A `:::table` directive.** Its body would still need a syntax for spans and a footer, which no Markdown has.
- **Markdown in an HTML table's cells.** CommonMark makes each text a paragraph.
- **Every table as HTML.** A simple table would lose its form.
- **`<figure>` and `<figcaption>`.** The caption would not be the table's own.
- **The `align` attribute.** HTML has made it obsolete.
- **The box in the content file.** Every table would carry markup of the site's look, and a pipe table could not hold it.
- **A class on the table itself.** No CSS on a bare table both lets a wide one scroll and a narrow one fill its column in every engine.
- **A `figure` as the box.** It would say the table is a figure, a design's rules on `figure` for images would reach it, and its caption would not be the table's own.
- **The caption outside the table, beside it in the box.** It would no longer name the table for assistive technology.
- **A `tabindex` and a role on the box.** The core cannot know whether a design makes it scroll, and a stop for the keyboard at every table that does not would be one too many.

## What practice has shown

The caption in Crepe passed 14 of 14 checks in all three engines, twice: opening changes no byte; typing in place; escapes; marks; undo gives the bytes back; editing a cell keeps the form; clearing it gives a pipe table; adding one makes it structured; a footer and merged cells stay source, byte for byte. A page error, "Applying a mismatched transaction", on clicking a cell in Crepe's table, comes from its click handler, which a frame after a first click selects all the cell's text, on the state it saw at the click. That also makes the next key replace the cell, or not, by a race. A patch takes the handler away, so a click in a cell puts the cursor where it does anywhere else. The caption itself waits for the field's later stage (ADR 0030), and until then a structured table is a kept block.
