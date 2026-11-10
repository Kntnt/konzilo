# ADR 0052: Choose the legal pages, render the cookie declaration, and suggest privacy texts

**Date:** 2026-11-02, amended 2026-11-10 · **Status:** Accepted. Settled by Thomas: suggested privacy texts (2026-10-29), now on a page in the editing tool (2026-11-02). The rest is a technical choice; Thomas may veto.

## Decision

- **The legal pages** are the privacy policy, the cookie policy and the accessibility statement, in the group `legalPages`. Each is a choice of one published post of a type with an address, kept by ID, and may be left unchosen. The cookie policy may be the privacy policy itself. An Admin writes the chosen pages; an Editor cannot. An Editor's change to a post chosen as a legal page is refused by the intake, and the post keeps its last published version (Thomas, 2026-11-03). Taking it off the site is such a change, by a draft's status, a date ahead or a deleted source file. An Admin can do all of these, and an Editor's deletion stands once an Admin has chosen another page.
- **The intake writes each chosen page into `settings.json`** as its title and current address. One with no page now is left out, with a warning.
- **A site that asks for consent warns at every build** while it has no privacy policy or cookie policy to link to.
- **The footer links to the three pages,** each once and by its title; the banner links to the first two. On those two the banner stays hidden, and the footer controls work.
- **The publisher** is one set of details, in the group `search`, which the structured data, the footer and the privacy texts read. Added for e-handelslagen: `vatNumber`, `tradeRegister` and `supervisoryAuthority`. The text says what the law asks for, that every detail is public, the organisation number too, which for a sole trader is the owner's personal identity number, and that Konzilo gives no legal advice. Without a name the footer shows none of the details, and every build warns.
- **The cookie declaration** is a component placed after the cookie policy page's body, which renders at that address alone: the registry, the departures, and, with JavaScript, when the choice was made, what it allows, and the visitor's consent ID where the page sends records. A preview sends none, so it shows no consent ID, which nobody could look up. Each stored item's row names the domain it is on. Its words are plain ones an ordinary reader knows: *Your choice*, *Addresses your browser contacts*, *How long* and *Set by*, *This site* or *Its provider*, an item kept *until it is deleted*, and *What this site does without your consent* over the departures. Its dates, and the visitor's choice, are in one locale (ADR 0049). Where the site counts visits without storage, the link that objects stands beside its buttons.
- **The suggested texts** are a page, *Privacy texts*: one section per feature the site uses, made from data, in the site's language, English or Swedish, marked when a section changes, with a copy button that leaves out explanations. In order: hosting and backups, naming the publisher as the controller; consent and its records; each embed service the posts use; the tag manager's statistics; each service an Admin declared; forms; the log of addresses not found; the log of policy violations; and search. Numbers come from the core's constants and the server's settings, so they are never stale. The registry is the one the site shows now. The texts say that they are facts and suggestions, not legal advice.
- **No accessibility conformance claim is made** until an audit supports one.

## Why

- Ordinary pages stay the customer's.
- The declaration has one place, so it needs no directive.
- Numbers that come from data are never stale.

## Considered and rejected

- **A declaration block in body text.**
- **A second set of the owner's details.**
