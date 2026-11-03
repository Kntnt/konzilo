# ADR 0041: Build every release for the public host, and declare the site's language

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

- **`language`** (`en_US`, `en_GB` or `sv_SE`) is optional in the site description, and HTML writes it in BCP 47 form (`sv-SE`); a description without it says `en`. The checker refuses any other value. `languages` replaces it for a site with several (ADR 0042).
- **Every build receives the public host's origin in `KONZILO_ORIGIN`.** It is `https://` and the host, or `http://localhost` and a port locally. The integration sets Astro's `site` to it, and `publicSite()` hands templates `{ locale, languageTag, origin }`. Astro's dev server and `astro build` fail at once without an origin, naming the variable. A preview's and a share's build get the public site's.
- **A release is never reused for another origin.** The record of a built release names the origin beside the content and the code, so a launch costs one build.
- **Content files keep root paths,** so launch changes no content file.

## Why

- Canonical addresses, sitemaps, sharing tags and feeds must be absolute.

## Considered and rejected

- **Root-relative canonical addresses,** which search engines discourage and sitemaps and feeds forbid.
- **The domain in the site description,** which is unknown when a site is created.
