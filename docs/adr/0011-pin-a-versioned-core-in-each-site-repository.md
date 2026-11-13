# ADR 0011: Pin a versioned core in each site repository

**Date:** 2026-10-27, amended 2026-11-12 · **Status:** Accepted, settled by Thomas on 2026-10-27: a versioned core that site repositories pin, not a template copied per customer. How it ships is a technical choice; Thomas may veto. Now that the repository is public, a release ships its package as a file attached to it, which a site keeps in its own `vendor/` and pins by that path: a technical choice of 2026-11-12, which Thomas may veto.

## Decision

- **The core is released under one version number from this repository, as one npm package,** `@kntnt/konzilo`, with its images. Each site repository holds only what is the customer's own, and pins a core release. A bot raises the version.
- **A release is a tag `vX.Y.Z`,** or `-alpha.N`, `-beta.N` or `-rc.N` for a pre-release, which npm reads alike. Pushing one runs the checks on the tagged commit, makes the release's images and package, runs the acceptance suite against a site pinned to it and a site raised to it from the release before, and publishes the release. A published release means that everything installs and upgrades.
- **Never move, reuse or delete a pushed tag.** A site may already pin it. When a release run fails, fix the cause on `main` and release the next version. Pin only a version whose release is published.
- **The changelog's section is the release's notes.** GitHub allows a release's notes 125,000 characters, so a section over that gets its introduction and a link to the changelog at the tag.
- **A release carries its package as a file,** the tarball `npm pack` makes, `kntnt-konzilo-X.Y.Z.tgz`, attached to the GitHub release, which anyone fetches without a token from a public repository (`docs/agents/release.md`).
- **A site keeps the package in its repository and pins it there,** `"@kntnt/konzilo": "file:vendor/kntnt-konzilo-X.Y.Z.tgz"`, rather than naming the release's address: a build, a `docker build` too, needs nothing from GitHub, only the npm registry for the core's own dependencies, and the lock's `integrity` holds the bytes. `new-site --release vX.Y.Z` makes a site so pinned. A site raises its pin by fetching the next release's file into `vendor/`, changing the pin and installing, and removing the old file in the same commit, as `site-template/README.md` says.
- **A site pinned by a release runs in Compose from a checkout of the core at the same tag,** which its `compose.yaml` and `.env` name, since Compose builds its images from the core's source and the package holds no `compose/`. How a site runs without a checkout is not settled here.
- **Pinning by path is for the core's own development and CI, never for a customer's site,** and what `new-site` does without a release: `npm`'s `file:` with `install-links=true`, so that the package installs as a copy and the site has one copy of the reader. `--copy` puts a copy of the checkout in the site repository, to run the checkout on a live copy in a test.
- **What every site needs belongs in the package,** since a change to the site template reaches only the sites made after it.

## Why

- A fix reaches every customer by raising a version, not by hand.
- One tag, one version and one CI run for a change that crosses parts.
- The reader's options and the intake's read-back must agree, so they ship together.

## Considered and rejected

- **A site template copied per customer.** Each copy drifts, and a fix has to be carried into every copy by hand.
- **The release's address in `package.json`.** Every install and every image build reaches GitHub, and a site cannot be built while GitHub does not answer.
- **The tag's archive from GitHub.** npm installs a tarball as it is, whatever its `files` says, so the whole repository lands in a site's `node_modules`; and GitHub may change how it compresses archives, with six months' notice, which changes the bytes though the files do not and stops an install on the lock's integrity.
- **A Git dependency, `github:Kntnt/konzilo#vX.Y.Z`.** Every build image needs `git`, the lock holds a commit and no integrity, and npm clones and packs the repository to install it.
- **GitHub Packages.** Its npm registry wants a classic personal access token to install a package, a public one too, and on GitHub Free private packages share 500 MB of storage and 1 GB of transfer a month.
- **The public npm registry.** A private scope is a paid plan, and a public one puts the name on a public registry, which `TRADEMARKS.md` governs; that is not settled as a technical choice.
- **A commit in place of a tag.** The address would not show the version.

## What practice has shown

- npm installs a site pinned `file:vendor/….tgz` from the tarball alone, with its `resolved` and `integrity` in the lock, and the site builds from it (`tests/new-site.test.js`, with a tarball packed from the checkout standing in for a release's file).
- A packed core holds `bin/`, `src/`, the demo content and the notices, but no `compose/`, `versions.env`, `scripts/` or lock.
- Chained shell commands and a guard that greps under `pipefail` can tag the wrong commit. Verifying and tagging are separate steps, and each result is read before the next.
