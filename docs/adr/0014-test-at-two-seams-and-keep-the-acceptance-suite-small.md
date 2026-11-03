# ADR 0014: Test at two seams, and keep the acceptance suite small

**Date:** 2026-11-03 · **Status:** Accepted. Settled by Thomas on 2026-10-27: tests sit at two seams and check external behaviour only. The rest is a technical choice; Thomas may veto.

## Decision

- **The acceptance suite** drives a whole site from outside: Sveltia and Crepe in a browser, HTTP to the hosts, and the commands. It runs against Compose and against a live copy in the test zone. Chromium runs everything; Firefox and WebKit run sign-in, saving and publishing.
- **The intake suite** feeds source files in, and expects published files or a refusal out. The hand-written expected Markdown is golden output, and each must be a fixed point: `intake(intake(x)) === intake(x)`.
- **The field's round trip.** For every fixture and every example in `content-format.md`: opening it in the Crepe field makes no change, and after an edit and an undo, `intake(field(x)) === intake(x)`, by Sätteri. It runs in a real browser.
- **Every collection saves and builds.** Each entry of the demo content is saved as Sveltia saves it, as it stands, with optional fields left out, and as a new entry, and it must go through the intake and Astro.
- **Tooling.** Playwright Test, pinned exactly, for the acceptance suite: one runner for HTTP, commands and the browser, in the core's language. Node's own test runner, with fixtures as files, for the intake suite. Expected bytes are written by hand, never taken from the code's own output.
- **HTTPS is checked, not ignored,** on a copy with certificates.
- **One interface to the site under test,** for local and live; the environment names the site, a wait is three times as long on a live copy, and what a copy does not have is skipped, saying so.
- **A test does what an editor, an Admin, the operator or a visitor does,** so internals can be rebuilt without touching tests. Setting a user up in the browser is proved in one test; the others make their users directly, through the same functions, with a second factor. A test that logs in computes the code.
- **The suite must not grow to two hours,** and a failure must mean a fault. A release runs the suite twice, so its cost counts double.

## Why

- These are the fewest seams that cover the core.
- A case added as a file needs no code, and hand-written expected bytes can disagree with the code.
- A suite that is slow and fails at random stops being read.

## Considered and rejected

- **Vitest or Jest.** A dependency for nothing Node's runner lacks here.
- **Snapshot tests.** The expected output would come from the code under test.
- **pytest with Playwright, or Cypress.** A second language beside the Node core, or a runner inside the browser.
- **`ignoreHTTPSErrors`.** It would hide a broken certificate.
- **A test copy of each site now.** A change is tested locally and in CI; a test copy on demand can come later.

## What practice has shown

- A suite of this kind grew to about two hours on a CI runner, with seven of eleven runs failing, nearly all on a test or two that passed in the runs around them. Each rerun cost the two hours again, and one release took about 490 minutes of Actions. Requests that never reached the site, through a router of the local environment, caused most of it, and a dev server that answered 404 for over a minute for a page whose file it had just reloaded caused the rest.
- Setting a user up in the browser ran some thirty times a run and sometimes ran past the test limit, failing whichever test made the user.
- A test that took ten minutes to open a hundred posts in the editor stood at its limit; a limit a third over what a test takes is the least.
- A rig's browser builds are not the browsers people have: Chrome and Firefox as installed were not run, and Safari itself only for sign-in and saving.
