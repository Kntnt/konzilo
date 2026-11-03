# ADR 0011: Pin a versioned core in each site repository

**Date:** 2026-10-27 · **Status:** Accepted, settled by Thomas on 2026-10-27: a versioned core that site repositories pin, not a template copied per customer. How it ships is a technical choice; Thomas may veto.

## Decision

- **The core is released under one version number from this repository, as one npm package,** `@kntnt/konzilo`, with its images. Each site repository holds only what is the customer's own, and pins a core release. A bot raises the version.
- **A release is a tag `vX.Y.Z`,** or `-alpha.N`, `-beta.N` or `-rc.N` for a pre-release, which npm reads alike. Pushing one runs the checks on the tagged commit, makes the release's images and package, runs the acceptance suite against a site pinned to it and a site raised to it from the release before, and publishes the release. A published release means that everything installs and upgrades.
- **Never move, reuse or delete a pushed tag.** A site may already pin it. When a release run fails, fix the cause on `main` and release the next version. Pin only a version whose release is published.
- **The changelog's section is the release's notes.** GitHub allows a release's notes 125,000 characters, so a section over that gets its introduction and a link to the changelog at the tag.
- **While the core is private, a site reads it with a token** that can read it, through `api.github.com`'s archive of the tag, which accepts one (`KONZILO_GITHUB_TOKEN`). `new-site` makes a site pinned to the release its checkout is at, and `pin-core` raises one.
- **Pinning by path is for the core's own development and CI, never for a customer's site:** `npm`'s `file:` with `install-links=true`, so that the package installs as a copy and the site has one copy of the reader. `--copy` puts a copy of the checkout in the site repository, to run the checkout on a live copy in a test.
- **What every site needs belongs in the package,** since a change to the site template reaches only the sites made after it.

## Why

- A fix reaches every customer by raising a version, not by hand.
- One tag, one version and one CI run for a change that crosses parts.
- The reader's options and the intake's read-back must agree, so they ship together.

## Considered and rejected

- **A site template copied per customer.** Each copy drifts, and a fix has to be carried into every copy by hand.
- **Assets on a GitHub release.** GitHub answers 404 to a token at a private repository's release-asset address, however the token is sent; its REST address gives the file only with an `Accept` header npm cannot send (tried on 2026-10-27).
- **GitHub Packages.** On GitHub Free, private packages share 500 MB of storage and 1 GB of transfer a month, and its npm registry wants a classic personal access token.
- **The public npm registry with a private scope.** A paid plan.
- **A commit in place of a tag.** The address would not show the version.

## What practice has shown

- A fine-grained token with *Contents: read* is untried; a workflow's own token and the GitHub CLI's are proven.
- GitHub may change how it compresses archives, with six months' notice. The bytes would change though the files do not, and the lock's integrity would stop the install; pinning again re-pins the same release.
- Chained shell commands and a guard that greps under `pipefail` can tag the wrong commit. Verifying and tagging are separate steps, and each result is read before the next.
