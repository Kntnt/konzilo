# ADR 0021: Write a simple table as a pipe table, and a structured table as HTML

**Date:** 2026-11-02 · **Status:** Accepted. Settled by Thomas on 2026-11-02: a table caption is visual; a footer section and merged cells are edited as source at first, with the result in the live preview, and simple tables stay visual. The visual editor for the rest is built when a customer needs it. The forms are a technical choice; Thomas may veto.

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

**In the field,** a caption is edited in place, written in the structured form; a footer and merged cells are a protected source block (ADR 0030).

## Why

- A pipe table is the form every Markdown tool reads as a table.
- Unpadded cells keep a change to one cell on one line of the history.
- HTML's table holds the rest, and reads back through the site's reader as written. One fixed shape keeps it as strict as any Markdown form: the check refuses any other HTML block, so an editor's own raw HTML never reaches the site.
- `<caption>` is the table's own, which assistive technology reads as its name.

## Considered and rejected

- **Padding cells.** It churns the history.
- **An empty header row for a table without one.** The site would show a row nobody wrote.
- **A `:::table` directive.** Its body would still need a syntax for spans and a footer, which no Markdown has.
- **Markdown in an HTML table's cells.** CommonMark makes each text a paragraph.
- **Every table as HTML.** A simple table would lose its form.
- **`<figure>` and `<figcaption>`.** The caption would not be the table's own.
- **The `align` attribute.** HTML has made it obsolete.

## What practice has shown

The caption in Crepe passed 14 of 14 checks in all three engines, twice: opening changes no byte; typing in place; escapes; marks; undo gives the bytes back; editing a cell keeps the form; clearing it gives a pipe table; adding one makes it structured; a footer and merged cells stay source, byte for byte. One unexplained page error remains, "Applying a mismatched transaction", on clicking a cell in Crepe's table, with or without a caption. Nothing visible follows from it.
