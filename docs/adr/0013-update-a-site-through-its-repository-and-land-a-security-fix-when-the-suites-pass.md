# ADR 0013: Update a site through its repository, and land a security fix when the suites pass

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-27: updates go through the site repository, a bot opens the change, CI runs, security fixes land by themselves when green, and larger updates wait for him. Confirmed on 2026-10-29: a security fix that passes both suites lands by itself, whatever its pins bring along. The rest is a technical choice; Thomas may veto.

## Decision

- **A pin** is a package a site repository holds at one exact version: the core, Astro, and what the site itself adds. Sveltia, Milkdown and Forgejo come with the core.
- **A security fix** is a change that moves each pin to a later version with the same first two numbers, adds and removes no pin, and changes nothing but pins and their lock. Every other change is a **larger update**, which waits for a person. What a pin pulls in moves with it and is not judged by its version. A pre-release is never taken.
- **The bot is the site repository's own workflow,** every night and by hand. A first job, a minute long, asks whether anything is new. Only then does the second start the site and run the suites. It raises every pin to its newest security fix in one commit; when the checks pass it pushes that commit, only while the branch is still at the tip it was made on, and deploys it. When they fail, it opens a pull request labelled `ready-for-human`. It raises every pin to its newest release in a second commit, on the tip the fixes moved, and opens a pull request with the result.
- **The checks are the same for the bot's changes and for every pull request:** the intake suite and the acceptance suite of the core at the release the change pins.
- **Raising Sveltia or Milkdown is qualified by the field's round trip** (ADR 0014), since a new version may change what the editor writes.
- **Forgejo and base images** have their own path: a digest in `versions.env`, raised by the update flow. A security release is raised without waiting for a core release, and a job pulls it and restarts each customer's Forgejo.

## Why

- Everything reaches a site tested, and live stays the same as local.
- Version numbers are the one signal a bot can read for every pin without a service.
- One change for the fixes and one for the rest keeps a waiting larger update from holding a security fix back.
- The checks run in the bot's own job, because a pull request a workflow's token opens starts no workflow, and because landing only the commit that was checked needs no branch protection, which private repositories on GitHub Free cannot have.

## Considered and rejected

- **Dependabot.** It cannot run the checks in the same job, its pull requests get its own secrets, and merging on green needs protection.
- **Renovate.** An app to install, with the same limits.
- **GitHub's auto-merge on green.** It needs required status checks, which private repositories on GitHub Free cannot have.
- **An advisory feed as the signal.** A service outside the repository, which waits for Thomas.
- **Updating on the live copy.** The next deploy would undo it.

## What practice has shown

- A night with nothing new costs about a minute of Actions.
- The rule's evidence is projects whose security releases keep the first two numbers. Sveltia, at 0.256.1, moves its second number with each release, so under this rule its raises wait for a person.
