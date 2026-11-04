# ADR 0031: Show a publish within a minute, with its status and any refusal

**Date:** 2026-10-27 · **Status:** Accepted, settled by Thomas on 2026-10-27: a publish shows on the site within about a minute; the post shows whether it is being published, is live or failed; a refusal is explained to the editor and alerts Kntnt; scheduled publishing works. The rest is a technical choice; Thomas may veto.

## Decision

- **`status` is one field,** as a form of draft, scheduled with a date and time, and published. New entries are drafts.
- **What starts a build.** Saving makes a commit. Forgejo's webhook makes the service write the build request. A check every minute catches a lost webhook, since Forgejo does not retry.
- **One build at a time per site,** and publishes during a build give one more build, not a queue. A failed build has taken its request, and does not start again by itself.
- **A build's steps:** lock, intake, commit in the content repository, Astro, web server files, switch `current`, index, push, record. Nothing is built again for the same content, code and origin, and what the clock has made visible counts as content.
- **Scheduling.** The intake records the next scheduled time. A timer, accurate to a second at the start of each minute, starts a run once that time has passed, and catches up on one passed during downtime. Lateness stays about a minute.
- **Live means that a release holding the post's latest version is current.** Recording comes after the release is current, so *live* never runs ahead of what visitors get.
- **Status per ID:**
  1. *failed*, with each refusal, when its version is the one refused;
  2. else *live*, when its version is the one the current release holds;
  3. else *failed*, with the build's reason, when the last build made no release and read that version;
  4. else *being published*, which is not stored but is the absence of a record.
- **Where the editor sees it:** a field in the post's form and a *Publishing* page listing every post, from the service. A failure says what could not be published, why, and whether visitors still see the earlier version. The words are made in one place. Refusals of menus and settings show there too, since they belong to no post.
- **The build log** is one line of JSON per build, appended when it ends: `at`, `site`, `outcome` (`live` when every post is live, `failed` otherwise), `failures` as refusals, and `unindexed` when the release is current but the search index was not updated. A standing refusal is listed in every build's line until it is fixed, so a refused post still makes the builds heartbeat report 0.
- **The service's other timed duties** lie in ADR 0044.

## Why

- Editors need to know that their change is out, and why when it is not.
- Only the build knows when its release is current and why it failed.
- A request written during a build gives exactly one more build, since every build reads everything.
- JSON lines are plain: appended in one write, readable with `grep` or `jq`.

## Considered and rejected

- **A queue of build requests.** One more build covers every request.
- **Request times instead of versions.** Clocks would be compared between programs.
- **Recording when the intake ends.** A post would show live before visitors see it.
- **WordPress's cron, started by visitors.** It runs only while something loads it, so a scheduled post would be on time by accident.

## What practice has shown

- Save to public page took 19.7–21.2 s at 1,000 articles on 4 vCPU, and 4–5 s at 20 articles.
- A timer without one-second accuracy can make a scheduled post up to two minutes late.
- A version saved while a build ran must not be shown failed by a build that never read it.
- Pointing `current` back at an older release must record again.
- In Compose a save showed on the public page 6 seconds later, with the demo's 14 posts on a Mac, and the first build after a start took about 30 seconds.
- One builder, taking one request at a time, needs no lock: the steps run in that one loop. The hosting layer, which starts builds its own way, may need one.
- The ledger holds the source file's hash, so a post saved otherwise commits a new ledger with nothing new to show. What names a site's content for "nothing is built again" is therefore the content repository's tree without the ledger, which the site reads only for a feed's `guid`, the same as long as a post's file is.
- A site's code is named from what it was given and from the installed core, not from the folder it is built in, where a build leaves files of its own.
- Sveltia goes back to the list after a save, so an editor who stays there sees the status when opening the post again or on the *Publishing* page. A custom page is a `radio` in Sveltia's page switcher, and its heading is Sveltia's.
