# ADR 0028: Stop a build that would take most posts off, until the deletion is confirmed

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

- **What a build takes off.** It removes the published file of every post no longer published. It looks only in the collections the site description names. A post whose file moves, by the ledger, is no deletion.
- **An unusually large share is more than half of the posts the site shows, when that is more than one post,** counted over the whole site, by what leaves the published set, so a bulk change of status is caught. 11 of 20 stops; 10 of 20 goes through; 2 of 3 stops. A single post always goes.
- **A stopped build writes and removes nothing,** so the site keeps its current release.
- **The report** says how many would go, lists each one's path, and gives the deletion's code: the first eight hexadecimal digits of SHA-256 over the sorted paths.
- **The operator confirms with the code.** The confirmation holds for the next build alone, and only for exactly that deletion. If the set has changed by then, the build stops again with a code of its own.
- **A stop is recorded as a failed build,** with the reason "the build would take most of the site's posts off it, so it waits until the deletion is confirmed". Each post it holds back shows *failed* with that reason.
- **The pieces.** `deletion(present, result, { confirmed })` decides, with no input or output of its own. The command exits 3 when the guard stops it.

## Why

- A fault upstream, an empty or partial read, a broken repository or a clock far behind, would otherwise silently empty a site. Git would keep the files, but visitors would lose the pages until someone noticed.
- More than half catches such a fault; editorial work seldom takes most of a site's posts off at once, and waiting for a confirmation costs little.
- A code rather than a plain yes means the operator confirms what they saw.

## Considered and rejected

- **A fixed number of posts.** It does not scale.
- **A lower share.** It would stop ordinary bulk cleanups on small sites.
- **A share per collection.** A site with a handful of pages would be stopped whenever two went.
- **Counting the net loss.** A fault that drops many posts while others arrive would pass.
- **A switch that turns the guard off.** It would let through whatever the next build happens to remove.
- **Confirming in the editing tool.** Confirming a deletion is the operator's act.
