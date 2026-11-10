# ADR 0060: Let a site declare its components, and check what they hold

**Date:** 2026-11-10 · **Status:** Accepted. That a site declares components of its own in its site description is settled (ADR 0019; Thomas, 2026-11-02). How they are declared, named and checked is a technical choice; Thomas may veto.

## Decision

- **`components` in the site description,** each by its directive's name: its `label`, its `form` (`leaf` or `container`), its `body` (a leaf's `none` or `text`, a container's `blocks`) and its `attributes`, each as the rule data has a directive's (`type`, `values`, `pattern`, `default`, `required`, `refusal`), with a `label` of its own for the editor. The checker holds each to that shape and refuses the rest.
- **The registry is a function of the rule data and the description.** `siteRules(site)` gives the core's rule data with each component added as an element whose rule has its directive. The intake, the site's reader, `Body` and the editor's early check all read bodies against it. The core's rule data is never changed.
- **An element and a directive are named apart.** A component takes its name as its element, or `<name>-directive` where the core already has an element of that name that is no directive, as Markdown's list is `list`. The directive keeps the component's name. No component may take the name of the core's own directives, `post-list` and `form`.
- **A container holds blocks, and a leaf holds text.** A container's blocks are read and written as a body's are, each with its path below the container's, images and other components among them, each held to the elements the post's type takes. Its fence is one colon longer than the longest inside. A leaf's label holds a heading's inline elements. The read-back compares them as it does every other block.
- **A site checks what its components hold in a module of its own,** named by `componentChecks`: `componentProblems(name, attributes, blocks)` gives the reasons, in the editor's words, and the intake refuses the post for each. The command and the preview load the module from the site repository and hand it to the intake. The editor's early check does not run it, since the editor is built before any site.
- **The editor gets the components from its configuration,** in Konzilo's own part, and its field reads them as the intake does.

## Why

- The rule data was imported as a constant in many modules, the editor's bundle among them, so there was nowhere for a site's components to go. A function of the description keeps one registry for every reader without changing the core's data.
- The format already described containers and labels, and the reader read them. Only the body check dropped what a directive held, so no container could pass the intake.
- A site whose `list` replaced the core's `list` broke every list with formatting. Two names for two things, an element and a directive, keep both.
- What a component must hold, every action a link or every logo an image, is the site's design's to say, and a check in code says it exactly. The rule data's patterns still check the attributes with no code.

## Considered and rejected

- **Merging a site's components into `rules.json` when the site is installed.** The core's files would differ by site, and every update would have to redo it.
- **Separate registries per reader.** The editor, the intake and the build would drift apart.
- **Declared rules in place of a module for what a component holds.** The checks a site needs differ by component and are easier to say as code. Declared rules may come when the same checks recur across sites.
- **Running the site's checks in the editor's early check.** The editor's application is built before any site and cannot import a site's code. The intake remains the check that counts.

## Consequences

- A site's component is a body element like the core's, so a type's `elements` must name it, by `<name>-directive` where the names meet.
- The module named by `componentChecks` refuses content, so it changes what the core does, and is under the license by `SITE-EXCEPTION.md`'s terms, as any extension through a way in of the core's is.
- Removing a component from a description makes every post that holds it refused, as removing a core element would.
