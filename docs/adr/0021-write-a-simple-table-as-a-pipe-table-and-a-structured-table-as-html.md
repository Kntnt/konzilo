# ADR 0021: Write a simple table as a pipe table, and a structured table as HTML

**Date:** 2026-11-02, amended 2026-11-13 and 2026-11-25 · **Status:** Accepted. Settled by Thomas on 2026-11-02: a table caption is visual; a footer section and merged cells are edited as source at first, with the result in the live preview, and simple tables stay visual. The visual editor for the rest is built when a customer needs it. The forms are a technical choice; Thomas may veto. Settled on 2026-11-13, as a technical choice Thomas may veto: the site renders each table of a body, of either form, in a `div` of the core's class `konzilo-table`, which no content file holds, its caption inside the table within it; in the live preview the block's mark stands on that `div`, a component's tree holds it as the page does, and the Markdown alternate writes the table alone. Settled by Thomas on 2026-11-25: an aligned cell says its alignment on the page as the core's `data-align`, `start`, `center` or `end`, and no inline style, on every page a body is rendered on; left in a content file is the start of the line and right its end; the content files stay as they are; the site template aligns a cell by the attribute; and the Markdown alternate reads it. Chosen on 2026-11-25, each a technical choice Thomas may veto: the table plugin that writes the box writes the attribute too, as the body is rendered, for a simple and a structured table alike, in place of a style that says nothing but a `text-align` of left, center or right; the policy's comment names an embed player's size and Temml's styles as what it hashes, and its test of a policy too long counts 1301 hashes, the article's tables no longer among them; the Markdown alternate still reads a cell's `style` on a page of the site's own, where it holds no `data-align`; and the three engines' test is an acceptance file of its own, `acceptance/tables.test.js`, which reads the page from right to left too, by a `dir` it sets on the box itself.

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

**On the page,** an aligned cell, `th` or `td`, of either form, says its column's alignment as an attribute of the core's own, written as the body is rendered, as the box is: `data-align="start"`, `"center"` or `"end"`, for a column a content file aligns to the left, in the centre or to the right, `:---`, `:---:` and `---:` or `style="text-align: left"`, `center` and `right`. The cell keeps no `style`. Left is the start of the line and right its end, so on a page read from right to left a column aligned to the right stands on the left. The live preview and a component's tree hold the attribute as the page does, and the Markdown alternate writes each column's alignment from it. A design aligns a cell by it, `text-align: start`, `center` or `end`, as the site template does; `docs/site-design.md` names it.

**In the field,** a caption is edited in place, written in the structured form; a footer and merged cells are a kept block (ADR 0030).

## Why

- A pipe table is the form every Markdown tool reads as a table.
- Unpadded cells keep a change to one cell on one line of the history.
- HTML's table holds the rest, and reads back through the site's reader as written. One fixed shape keeps it as strict as any Markdown form: the check refuses any other HTML block, so an editor's own raw HTML never reaches the site.
- `<caption>` is the table's own, which assistive technology reads as its name.
- A design needs a box round a table, to size and to scroll: no engine lets a caption widen a table, percentage widths give every column the same share, and a table that is itself made to scroll loses its table layout. In the box, a wide table scrolls in its own box at a phone's width while the page does not, and a narrow one can fill its column, each keeping its layout.
- Written at rendering, the box costs no content file a byte, and a design may count on it for every table, whatever wrote the file.
- An inline style is physical and outranks a design's rules: a design's `text-align: start` on cells could not reach an aligned column, nor could it give one a look of its own without matching the style's text. An attribute is no style, so a design styles it at will, and the site's policy has no table's style to allow by a hash.
- Start and end mirror on a page read from right to left, as a column aligned to the right is meant to stand at the end of its line; left and right would not.
- Written at rendering, the attribute changes no content file: a pipe table's delimiter row cannot hold it, and every tool that reads Markdown or HTML still reads each file's alignment.

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
- **The inline style on the page.** It outranks a design, says left and right whatever way the page is read, and costs the policy a hash for each.
- **`data-align` in the content file.** A pipe table cannot hold it, and a structured table would no longer read as aligned anywhere but on the site.
- **A `tabindex` and a role on the box.** The core cannot know whether a design makes it scroll, and a stop for the keyboard at every table that does not would be one too many.

## What practice has shown

The caption in Crepe passed 14 of 14 checks in all three engines, twice: opening changes no byte; typing in place; escapes; marks; undo gives the bytes back; editing a cell keeps the form; clearing it gives a pipe table; adding one makes it structured; a footer and merged cells stay source, byte for byte. A page error, "Applying a mismatched transaction", on clicking a cell in Crepe's table, comes from its click handler, which a frame after a first click selects all the cell's text, on the state it saw at the click. That also makes the next key replace the cell, or not, by a race. A patch takes the handler away, so a click in a cell puts the cursor where it does anywhere else. The caption itself waits for the field's later stage (ADR 0030), and until then a structured table is a kept block.
