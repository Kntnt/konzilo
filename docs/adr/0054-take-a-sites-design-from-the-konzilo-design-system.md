# ADR 0054: Take a site's design from the Konzilo Design System

**Date:** 2026-11-01, amended 2026-11-13 · **Status:** Accepted, settled by Thomas on 2026-11-01. Settled by him on 2026-11-05, with the design system's session: the design file carries a format version, a site works without one, the file styles the public site and not Sveltia's interface, and the package reaches a site as a file in its repository. Settled by him on 2026-11-13: the site template stays plain.

## Decision

A site's design comes from the Konzilo Design System, a stand-alone repository (`Kntnt/konzilo-design`) with its own tool, apart from this core. A site repository holds its design file, the one JSON file the design tool writes, and pins the design system's package, which holds the CSS and the Astro components and turns the design file into the site's values when the site is built. The site keeps only the components that only it needs, built on the same roles.

- **The site depends on the package, and the core on neither.** A site's configuration says `konzilo({ ...await fromDesign('./design/site.design.json') })`. The package reads the file, refuses in plain words at the build what it cannot read, and hands over what the core already takes: `bodyStyles` and `tokens`, and `bodyClass` when the field's body styles are built. The core never parses the file. A site registers its presentations itself, by the package's name, since only it knows what its description declares.
- **The file carries its format,** a required top-level integer, `"format": 1`, raised only when the shape breaks, and fixed at the design system's first release.
- **A site without a design file** does not call the package, and has the template's simple styles and the defaults of the core's own stylesheet.
- **The core owns the markup and behaviour of what it writes,** consent, embeds and forms among them, and the package only styles it, by the classes and custom properties in `docs/site-design.md`. The design system's own versions of these are for sites outside Konzilo. The package imports nothing of the core's: a site's layout places the core's components in the slots of the package's.
- **The file styles the public site,** and the site's text as the body field shows it, not Sveltia's interface.
- **The package reaches a site as a file in its repository,** of about 1 MB a version, with the fonts a design uses copied beside it by a command of the package's, which refuses a build where one is missing.

## Why

- The page, the header, the footer, the tokens, the roles and the plates are decided once for every site, and a fix reaches every site when it raises a version.
- The design system serves more than Konzilo: a client sees a presentation of colours, type and components before any design sketch, and someone building on anything else works from its export.
- The design file holds the tool's settings and every value derived from them, so a consumer reads finished values and none repeats the colour calculations.

## Considered and rejected

- **The JSON file alone, with no package.** A file holds values, not CSS and components, so the core would have to hold them, and a new look would take a new release of the core.
- **The package as a git dependency.** A site's dependencies are installed in its container on the machine it runs on, so every server would need a credential to the whole private repository, in a place site code can read it.
- **The package on public npm.** Simplest to use, and it would make the design system public, which is a decision of its own for its public day.
- **Design and components in each site repository:** every site would repeat the same work, and a fix would reach one site at a time.
- **The design system inside this core:** it would follow Konzilo's releases and could not serve sites outside Konzilo.
- **Components copied into each site:** the copies drift apart and fixes never reach them.

## Consequences

- The field's body styles and the theme colours are to come from the design file's finished values. A theme colour must be a value a build can read, so the package writes them as literal properties beside its `light-dark()` ones.
- Until the design system has a first release, the site template styles everything around body text simply, in `src/styles/site.css`, so that a new site looks like a site (Thomas, 2026-11-01).
- The site template stays plain, with its own simple styles and no design package, and a site that wants the design system's look takes its package as `site-template/README.md` says (Thomas, 2026-11-13).
