# ADR 0054: Take a site's design from the Konzilo Design System

**Date:** 2026-11-01 · **Status:** Accepted, settled by Thomas on 2026-11-01

## Decision

A site's design comes from the Konzilo Design System, a stand-alone repository (`Kntnt/konzilo-design`) with its own tool, apart from this core. A site repository holds its design file, the one JSON file the design tool writes, and pins the design system's package, which holds the CSS and the Astro components and turns the design file into the site's values when the site is built. The site keeps only the components that only it needs, built on the same roles.

## Why

- The page, the header, the footer, the tokens, the roles and the plates are decided once for every site, and a fix reaches every site when it raises a version.
- The design system serves more than Konzilo: a client sees a presentation of colours, type and components before any design sketch, and someone building on anything else works from its export.
- The design file holds the tool's settings and every value derived from them, so a consumer reads finished values and none repeats the colour calculations.

## Considered and rejected

- **Design and components in each site repository:** every site would repeat the same work, and a fix would reach one site at a time.
- **The design system inside this core:** it would follow Konzilo's releases and could not serve sites outside Konzilo.
- **Components copied into each site:** the copies drift apart and fixes never reach them.

## Consequences

- How the package is distributed and pinned is settled when it has a first release.
- The field's body styles and the theme colours are to come from the design file's finished values.
- How the core's own components, forms, search, the pager and the language switcher, share the design system's look is settled when the components are defined.
- Until the design system has a first release, the site template styles everything around body text simply, in `src/styles/site.css`, so that a new site looks like a site (Thomas, 2026-11-01).
