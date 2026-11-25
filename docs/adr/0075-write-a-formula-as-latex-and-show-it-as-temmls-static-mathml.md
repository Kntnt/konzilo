# ADR 0075: Write a formula as LaTeX, and show it as Temml's static MathML

**Date:** 2026-11-25 · **Status:** Accepted. Settled by Thomas in triage on 2026-11-25 (issue #108): two elements, inline and block formulas; `$…$` and `$$…$$` with LaTeX inside, a `$` opening one by Pandoc's rule and written `\$` where it would open one unmeant; the build's static MathML made by Temml; the intake refusing what Temml cannot read; the body field writing and previewing with the same Temml, without Crepe's LaTeX; and the Markdown alternates and `llms.txt` keeping the LaTeX. The rest is a technical choice; Thomas may veto, among them, chosen in building it on 2026-11-25:

- **Pandoc's rule on Sätteri's reading.** Sätteri reads `$…$` as remark-math does, a formula wherever a `$` closes one, and has no option for Pandoc's rule. Every reader of Konzilo's Markdown, the intake's, the field's and the site's, runs one rule over it (`src/format/formula-reading.js`): a formula stands where its LaTeX neither starts nor ends with a space and holds no `$`, and no digit follows it; where one does not, its first `$` is read as `\$` and the body read again, so that a `$` after it may open a formula of its own. Inside a formula a backslash escapes nothing, as in remark-math and not as in Pandoc, so an inline formula's LaTeX cannot hold a `$`, not even `\$`, and a `\$` ends a formula a `$` before it opened; a block formula's LaTeX may hold one.
- **The site reads formulas in every content file,** whatever its type, since Astro has one reader for them all. The intake writes `\$` for a `$` that would open a formula in every type: it reads a source by its type, a type that takes no formula reading a `$` as text, and one that takes block formulas alone `$…$` as text, and then writes for the site's reader. So a content file of any type that holds `$…$` as text gains its backslash at the first build after this change.
- **Where a `\$` is written:** before each `$` beside another, and before each that would open a formula, found one at a time, since escaping one can make a `$` before it open a formula that ends at its backslash; strictly, before every `$`. A formula that a digit or another formula follows ends with the empty comment, the first fallback, as GFM's addresses are split.
- **Where an inline formula stands:** wherever inline code does, in a paragraph, a heading, a list's item, a citation, a simple table's cell, a footnote and a caption; a structured table holds `$` as text, as its cells take no Markdown. A block formula stands at the top of a body and in a component's blocks, never in a quote or a list, as a code block does. A source's `$$…$$` alone in a paragraph is a block formula, and what follows a block's opening `$$` on its line is its first line; a `$$…$$` among text is refused.
- **Temml's settings:** its defaults, with the LaTeX kept in each formula's annotation and nothing trusted, so `\href`, `\url`, `\class`, `\style` and `\includegraphics` are refused. A refusal names the formula and, in the editor's language, the LaTeX in it Temml could not read, the part Temml points to where it stopped, or the whole formula where Temml stopped at an error of its own, or else says that the formula ends before Temml can read it whole; Temml's own English words, or that it stopped at an error of its own, follow only as a further detail. Numbering is not built: an environment that numbers, such as `equation`, numbers each formula by itself.
- **A block formula's box:** a `div` of the class `konzilo-math` around its `math`, which a design sizes and scrolls, as the box around a table (`docs/site-design.md`). Temml's own classes, `tml-*`, and the `style` attributes it writes stay in the MathML, and the site's security policy allows each by its hash.
- **A feed** holds a formula as its MathML, with the LaTeX in its annotation and without its `style` attributes, as a feed holds no style; a feed reader that draws HTML in a browser engine draws MathML. **The search index** holds a formula as its LaTeX, and **a summary**, which search results, sharing, feeds and `llms.txt` show, holds an inline formula as its LaTeX and leaves a block formula out, as it leaves a code block out.
- **The field's formulas are Konzilo's own nodes,** since Crepe's interface cannot be reused without CodeMirror: its block formula is a code block of CodeMirror's, its feature refuses to load without CodeMirror, and its inline formula's node draws with KaTeX. An inline formula is an atom drawn by Temml, made by `$…$` typed by Pandoc's rule or from the text selected by the toolbar's *Formula*, and edited in a dialog by a click on it; a block formula is an atom drawn by Temml, made from the block menu's *Block formula* and edited behind its pen. The dialog draws the formula as it is typed and takes no formula Temml cannot read, in the intake's words, nor an inline formula that holds a `$`. The field reads a value by the rule through remark-math, which reads `$` as Sätteri does: Milkdown's parser is handed the value with a backslash before each `$` the rule reads as a dollar sign. An image whose caption holds a formula opens as a kept block, its bytes kept, since the field's caption holds text alone; a block formula in a quote or a list, and a `$$…$$` among text, open so too, for the check to speak of.
- **Only a type that takes formulas loads them:** the field's formula nodes, remark-math and Temml are chunks of their own, loaded when an entry of such a type opens.

## Decision

- **Two body elements,** `inline-math` and `block-math`, which a type takes by naming each in its `elements`. A type that names neither has no formulas, and a `$` there is text.
- **The Markdown form:** `$…$` in the text, `$$` on lines of their own around a block formula, LaTeX inside. A `$` opens a formula by Pandoc's rule: none right after the opening `$`, none right before the closing one, and no digit right after it, so "$5 and $10" stays text. A dollar sign that would otherwise be read as a formula's is written `\$`, which the intake writes wherever it is needed, so its files stay byte-stable. `content-format.md` holds the exact form.
- **The build shows each formula as Temml's static MathML (MathML Core):** no script, and no font or stylesheet from elsewhere, so every browser draws it and screen readers read it.
- **The intake refuses a formula Temml cannot read,** naming the post, the block and what it could not read.
- **The body field writes and previews a formula with the same Temml,** so it looks the same in the editor as on the site, and Crepe's LaTeX, on KaTeX and its fonts, stays out (ADR 0030). The early check runs the intake's check.
- **Other outputs:** the Markdown alternates and `llms-full.txt` hold the LaTeX, a formula as `$…$` or between lines of `$$`, from its annotation, and `llms.txt` an inline formula's LaTeX in a post's summary.

## Why

- LaTeX is what anyone who writes formulas already writes, and `$` is how Markdown everywhere marks it.
- Temml's MathML is made for the browser to draw, where KaTeX's own output is HTML with its stylesheet and fonts, and its MathML serves mainly assistive technology. MathML Core is drawn by every engine the site supports.
- Pandoc's rule keeps prices text in a type that takes formulas, so a type can take them without its existing posts changing meaning.
- One reading of `$` everywhere, and one Temml, keep the field, the check and the site from disagreeing on what a body holds.

## Considered and rejected

- **KaTeX,** for the reasons above, and since its fonts and stylesheet would be the site's to serve.
- **The site's reader as remark-math reads `$`, without the rule,** with every `$` the rule leaves as text escaped in a content file. Simpler, but "$5 and $10" would be written `\$5 and $10` in every file, and a file another tool writes would read otherwise than its source.
- **Pandoc's own reading of a backslash inside a formula.** Sätteri cannot read it, and a rule the readers do not share would make a formula look one way in the field and another on the site.
- **Crepe's LaTeX patched to draw with Temml.** It loads only with CodeMirror, whose block it is, and a patch of its bundle would be larger than the field's own nodes.

## What practice has shown

Temml 0.14.0, Sätteri 0.11.7, remark-math 6.0.0, Milkdown 7.23.0:

- **Sätteri drops a formula from an image's alt text,** which it reads flat, so the field and the intake write a `$` there as `\$`.
- **Temml adds `class="tml-sml-pad"` to a superscript's number** where a formula ends with it, and `style` attributes for a block formula's `display` and for colours and alignments.
- **The editor's build:** Temml is 204 KB of JavaScript, 59 KB compressed, and the field's formula nodes with remark-math 11 KB, 4 KB compressed, both loaded only for a type that takes formulas. A type that takes none loads about 10 KB more than before, 4 KB compressed, of the rule's reading and the chunks the split makes.
- **Sätteri's mdast plugin can replace the document's root** with a tree of its own, with its places, which is how the site's reader reads a body again by the rule, and only where a formula of Sätteri's does not stand.

## Consequences

Each element's exact form is in `content-format.md`, beside ADR 0019 to ADR 0024. Numbered display formulas and references to them, and how a design draws MathML, are issues of their own.
