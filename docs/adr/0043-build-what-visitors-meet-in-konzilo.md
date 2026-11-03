# ADR 0043: Build what visitors meet in Konzilo

**Date:** 2026-10-29 · **Status:** Accepted, settled by Thomas on 2026-10-29

## Decision

- **What visitors meet, Konzilo builds itself:** metadata, consent, forms, search, analytics, redirects and the like. Editors set them in Konzilo's own fields and settings, declared in the site description; the intake writes them in the content format, and Astro renders them.
- **A component is Konzilo's own or the site's own,** in the content format. A component for one customer lies in that customer's site repository, with any secret among the site's, never in the core.

## Why

- One rule answers most add-ons without a case of its own.
- Konzilo's own components keep the content format Konzilo's, unchanged by a third party's update.

## Considered and rejected

- **Third-party plugins for visitor functions, mirrored into the site.** No mirror can be made in general, and each would follow its plugin's internal format.
