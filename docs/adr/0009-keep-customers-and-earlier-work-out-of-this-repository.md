# ADR 0009: Keep customers and earlier work out of this repository

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02

## Decision

- **No file in this repository, tracked or ignored, names, describes or points to a customer or a customer project.** Customer projects refer to Konzilo, never the other way round. Issues and pull requests count too, since they follow a repository that goes public.
- **Nothing here points at earlier work.** An ADR stands on its own, with its reasons, with no old numbers and no field for origin. Code carries no note of where it came from.
- **Fixtures, demo content and examples are neutral and fictional.**
- **The scan for such names runs from outside this repository,** since a list here would itself leak them.

## Why

- This repository may become public.
- The core is built for every site, not for a first customer, and a site depends on the core, not the reverse.

## Consequences

Publishing from a reviewed snapshot into a fresh repository remains an option for the public day.
