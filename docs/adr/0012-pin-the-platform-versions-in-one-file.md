# ADR 0012: Pin the platform versions in one file

**Date:** 2026-11-03, amended 2026-11-12 and 2026-11-13 · **Status:** Accepted as a technical choice; Thomas may veto. Forgejo pulled from `data.forgejo.org` (2026-11-12), and SPDX's license list pinned by its release beside the rest (2026-11-13), technical choices Thomas may veto.

## Decision

- **`versions.env` at the repository root is the one source of the core's pinned versions,** read only through `scripts/versions` (POSIX `sh` and `awk`), and never sourced. The reader refuses anything but `KEY=value` with a plain version, and checks the whole file before it prints.
- **It holds:** Node, Astro, Forgejo, Caddy, Typesense, Sveltia, Milkdown, the Public Suffix List's commit and the release of SPDX's license list whose standard texts the editor's notices keep ([ADR 0072](0072-write-the-notices-of-what-the-editors-application-holds-from-the-bundlers-record.md)), images by digest. A file that must hold a pinned version of its own gets it from the reader when it is built, or is checked against it in CI.
- **An image pulled by Compose names its registry,** and a comment beside its digest in `versions.env` says which registry and tag the digest is read from, so that a raise reads it from the same place. Forgejo's is `data.forgejo.org`, Forgejo's own, which serves the image `codeberg.org` does by the same digest.
- **What npm reads only in `package.json` and its lock is pinned there,** Sätteri, sharp and the rest.
- **Every download is checked** against a checksum kept in the repository, recorded when its version was pinned. A test fails when a pin is raised without one.

## Why

- One file means one place to raise a version.
- `KEY=value` lines read in any shell, in Python and in Node without a parser to install.
- The file is never sourced, so a value cannot run code.
- A key or checksum kept in the repository is trusted because a reviewed commit says so, not because a download on the day said so.

## Considered and rejected

- **Pulling Forgejo from `codeberg.org`.** Its registry refused the pinned tag and digest alike, "under load", through a whole evening, so that a machine without the image could not bring a site up.
- **Downloading checksums when something is installed.** A compromised download site would vouch for itself.
