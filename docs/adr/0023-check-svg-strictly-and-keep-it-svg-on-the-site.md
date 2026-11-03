# ADR 0023: Check SVG strictly, and keep it SVG on the site

**Date:** 2026-11-02 · **Status:** Accepted. Settled by Thomas on 2026-11-02: SVG is refused rather than cleaned. The rest is a technical choice; Thomas may veto.

## Decision

- **The check.** The intake reads every SVG original strictly as XML, and refuses one holding any of these: a script or a `javascript:` address; an event handler; a `foreignObject`, or any element of XHTML; a reference outside the file, other than a `#id` or a `data:` image that is a still JPEG, PNG or WebP, in `href`, `xlink:href`, `src`, a CSS `url()`, `@import` or `image-set()`, or an `xml-stylesheet`; a document type with an internal subset, or entity declarations; an animation that sets a reference or handler; no proportions; malformed XML, an encoding other than UTF-8, or compression. It runs in the preview's intake too.
- **The master** is the checked SVG, optimised with SVGO, with the same bytes each time, named `<slug>-<hash>.svg`, and used everywhere an image goes.
- **Rasters** are made with sharp when a template asks for one, through the integration's image service, at the size asked for. Astro's `dangerouslyProcessSVG` stays off. Drawing an SVG with sharp is safe only because every master has passed the check.

## Why

- An SVG can carry script, and a browser runs it when the file is opened by its address.
- An SVG stays sharp, where a raster at its own size would be a blurred icon or a sharing image too small to use.

## Considered and rejected

- **Stripping what fails the check.** It converts silently.
- **Rasterising every SVG.** Blurred logos.
- **Inlining SVG in the page.** It puts design in the content.
