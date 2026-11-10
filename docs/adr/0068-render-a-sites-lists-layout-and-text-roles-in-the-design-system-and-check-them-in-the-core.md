# ADR 0068: Render a site's lists, layout and text roles in the design system, and check them in the core

**Date:** 2026-11-10 · **Status:** Accepted, settled by Thomas on 2026-11-10: these components render in the design system, a site declares them, and the core checks them. The markup is agreed with the design system's session on 2026-11-10, and is its own, in its `docs/spec/directives.md`, with classes and attributes of its own.

## Decision

- **The design system renders them.** Its package holds the Astro components for the containers that lay a page out, hero, section and aside, with the rules by which a section's layout follows from what it holds; the list, with its kinds and markers, and its five forms, cards, accordion, tabs, table of contents and choice; and the text roles, an eyebrow over a heading, small print, and the breadcrumbs. A site registers each component through `konzilo({ directives })`, by the package's name, as it does its presentations (ADR 0054).
- **A site declares them as its own components** (ADR 0060), each with its label, its form, its body and its attributes, and a type's `elements` names the ones it takes. The core has no names of its own for them, so a site without the design system may declare others, or none.
- **The core checks what they hold,** their attributes by the rule data's patterns, and the rest by the site's `componentChecks` module, in the intake, before anything is published.
- **The core keeps their plain rendering,** a `div` with the directive's name and attributes as `data-` attributes, holding its body, so that a site without the design system builds, and its own styles can draw them.
- **What the core writes stays the core's** (ADR 0054): consent, embeds, forms, post lists, search, the pager and the breadcrumbs' levels. The design system styles them by the classes and custom properties in `docs/site-design.md`, and renders its own components around them.
- **The contracts between the two are in `docs/site-design.md`:** the breadcrumbs' last level, given with `hidden: true` where the type leaves it out; the marks of each block in the live preview, which a component the design renders keeps on the blocks it is given; and the opening of the `<details>` a block stands in, with the event `konzilo-preview-show` for a design that opens anything else. The design system draws each tab and each answer as a `<details>` of an exclusive group, so it needs no script for this.

## Why

- How a list of cards, an accordion or a section's layout looks is design, decided once for every site, and a fix reaches every site when it raises the design system's version (ADR 0054). In the core, a new look would need a release of the core; in the site template, every site would hold a copy that drifts.
- What a component may hold is content, which the intake must check before it is published, whoever draws it. The core already has one registry for the intake, the reader and the editor (ADR 0060), so declaring the design system's components there costs nothing new.
- The core cannot know a design's markup. Marks on the blocks and an event let it lead an editor to a block without knowing what a tab or an answer looks like.

## Considered and rejected

- **Rendering them in the core.** Every site would get the same components whether its design wants them or not, and every change of look would be a release of the core.
- **Rendering them in the site template** (`SITE-EXCEPTION.md`). Each site would carry its own copy from the day it was made, and a fix would reach one site at a time.

## Consequences

- "Read more" is ranked by the core, which gives a template from none to three related posts by default; the design system draws them by its rule for a series of cards: one card keeps a column's width, two stand in two columns and three in three, and with none the template writes neither heading nor list.
- A design's small interface icons may stand inline in its stylesheet as SVG, since a page's policy allows `data:` images by default (ADR 0051); anything larger is a file. The design system's own marks are CSS shapes or inline `<svg>` in its markup, so a site that switches `data:` images off loses none of them.
- The design system asks for three changes of these contracts, each for Thomas to settle: that a site take the components' declarations and checks from the package (issue #33), that a component be given its body as a tree with the block marks on it (issue #34), and that a component's mark in the preview stand on its own root rather than in a wrapper inside another component, which its layout's child selectors cannot see past (issue #35).
- Until the design system has a first release, a site either declares these components and draws them with styles of its own, or does without them.
