# ADR 0019: Write what is HTML in kind as raw HTML, and a component as a directive

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: an element that is HTML in kind is written as raw HTML; an element that is a component is written as a directive; every component has a directive form, and a common one may keep a short form beside it. The syntax is a technical choice within that; Thomas may veto. A site may declare components of its own (Thomas, 2026-11-02).

## Decision

- **HTML in kind, as raw HTML, where plain Markdown has no form for it:** a link with any attribute but `href`, superscript and subscript, an anchor, a structured table. The HTML is the element's own markup, with no class, style or attribute of the design. The check accepts only the raw HTML shapes the format lists, and refuses any other.
- **A component, as a directive:** data, never code, registered once with its name, typed attributes and body rule, checked against that registry by the field, the intake and the build. The site renders it with its own components. A common component may keep a short form, such as an embed's address alone.
- **MDX and bracket shortcodes are not used.**

**The syntax:**

- **A leaf** is `::name[text]{attributes}` on a line of its own. Its label is its text body, written only when it has text.
- **A container** is `:::name{attributes}`, a blank line, its body's blocks with one blank line between them, a blank line, and its closing fence. Its fence has one colon more than the longest fence inside it. Konzilo writes no label on a container.
- **No inline form.** Nothing needs one yet.
- **A name** is lowercase letters, digits and hyphens, starting with a letter.
- **Attributes** are `name="value"`, one space apart, in the order the registry lists them, and only those whose value differs from its default. A name is in camelCase, and never `id`, `class` or `content`. A value is text, a whole number or `true` or `false`, always between double quotes. In a value, `&`, `"`, `}`, a line feed and a carriage return are written as `&amp;`, `&quot;`, `&#125;`, `&#10;` and `&#13;`.

**The registry** is in the rule data, `{ name, form, attributes, body }`, each attribute `{ type, required, default, values, pattern, declared, refusal }`, and `body` `none` or `text` for a leaf, and `blocks` for a container. `declared` says that a value names what the site description declares under that key. The core registers its own, and a site adds its own in its site description, under `components`, read as [ADR 0060](0060-let-a-site-declare-its-components-and-check-what-they-hold.md) says.

**An unregistered name reads as the literal text it was written as:** `:30` of `10:30` stays `:30`. The build refuses a registered directive against its rule, in another form or with a value it does not allow, and one the registry has not got that no text becomes by chance, naming the file, the line and the reason.

**Colons.** Wherever text holds a colon that would begin a directive, the field's writer and the intake write `\:`: a colon that begins a name and does not follow another colon, unless a colon ends the name (`10\:30`, `\:x`, but `:smile:`), and at a line start the first of two or more colons (`\::x`, `\:::`). Code, inline code and a structured table's HTML take no escape.

**The rendering seam.** The reader renders a registered directive as its plain rendering, by default a `<div>` with `data-directive="<name>"` and a `data-<attribute>` per attribute that has a value, holding its body. A site gives its own component in `konzilo({ directives: { <name>: './src/components/<Component>.astro' } })`. A template renders a body as `<Body><Content /></Body>`, and `Body` puts the site's component, given the attributes as typed props and the body as its slot and as a tree in the prop `content` (ADR 0068), in place of each plain rendering.

## Why

- Raw HTML keeps what is HTML portable: every Markdown tool shows it right.
- A directive keeps a component's content as data and its design in the site, so a design can change without touching a content file.
- Sätteri's own directive feature reads what Konzilo writes, so the read-back proves it, and no second parser is needed.
- Writing only attributes off their defaults, in one order, keeps every file byte-stable.
- Reading an unregistered name as text never drops a word from a page, and never stops a release over `10:30`.
- `Body` keeps the content file free of code and needs nothing of Astro that a Markdown entry lacks.

## Considered and rejected

- **Raw HTML for components.** The design would live in content.
- **MDX.** A stray character in prose is a build error, and imports are code in content.
- **Directives for everything, links and tables included.** Elements that are HTML in kind would become unreadable outside the site.
- **Escaping every colon before a letter or a digit.** Prose would gain backslashes it does not need; it stays the strict fallback.
- **Backslashes or single quotes as a value's escape.** Sätteri reads `\"` as two characters, and no quote holds both `'` and `"`.
- **Dropping an unregistered directive, Sätteri's default.** A page would lose text without anyone knowing.
- **Astro's Container API in the reader.** Markdown is rendered in the content layer, before any page.

## Consequences

Removing an attribute, a directive or its plain rendering's `data-*`, or changing a form, is a major change. Adding a directive or an optional attribute is a minor one.
