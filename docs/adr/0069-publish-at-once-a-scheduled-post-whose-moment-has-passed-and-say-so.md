# ADR 0069: Publish at once a scheduled post whose moment has passed, and say so

**Date:** 2026-11-11 · **Status:** Accepted. Settled by Thomas on 2026-11-10: a scheduled post whose moment has passed is published at once, with that moment as its date, and a warning in the publish status, while the editor still stops a save with a moment in the past. The rest is a technical choice; Thomas may veto.

## Decision

- **The intake publishes it at once.** A post whose `status` is `scheduled` and whose `date` has passed goes live in the build that reads it, with that `date` as its date, as a post with its moment ahead does at its moment ([ADR 0031](0031-show-a-publish-within-a-minute-with-its-status-and-any-refusal.md)). It is not refused.
- **With a warning, when its moment had passed when the site first read it.** `warning.scheduled-passed`, on the field `date`, names the moment. The editor sees it in the post's publish status, in the interface language, and the command line writes it in British English. A post with a warning is live ([ADR 0027](0027-let-the-intake-read-source-files-and-write-content-files-or-refusals.md)).
- **A post that waited for its moment goes live at it with nothing to say.** The ledger's `awaited` holds, by post, the moment a scheduled post was seen waiting for, for as long as the source keeps it scheduled for that moment. A post whose moment the ledger holds is one the clock brought out. One whose moment it does not hold had passed before the site first read it.
- **The warning stays while the source does,** in every build. It goes when the post is saved as published, or with a moment ahead.
- **The editor still stops a save** of a scheduled post whose moment is not ahead, at Save, with words of its own, `parts.scheduledAhead`, so that a slip of the year publishes nothing early. The intake's rule is for a file saved another way, such as an import.
- **A moment in a refusal or a warning** is a value of its own, `{ "moment": … }`, which each reader shows in its language's own form and in its own time zone, which it names: `1 January 2026 at 09:00 CET` ([ADR 0066](0066-translate-the-editors-texts-through-catalogues-in-an-interface-language-of-its-own.md)).

## Why

- Content brought from another system often holds scheduled posts whose moment passed long ago. Published with the date they hold, they need no edit each, where a refusal would hold back an import post by post.
- A post published at once may go out where its editor meant it to wait. The warning makes sure it is seen.
- Every scheduled post's moment passes in the end, and its source still says `scheduled`. A warning for each would mark every post brought out on time as a mistake, for as long as it stands. Only the ledger can tell the two apart, since only it remembers what an earlier build saw.
- The check at Save catches an editor's slip where it is made, before anything is committed. The intake takes what came another way.

## Considered and rejected

- **Refusing a scheduled post whose moment has passed.** An import would need each such post edited first.
- **A warning whenever the source says scheduled and the moment has passed.** Every post brought out on time would carry it from then on.
- **The time of the commit that saved the file.** Whoever commits sets it, and the intake knows of commits only where the build tells it who changed what.
- **A margin after the moment, within which no warning is given.** Any margin is a guess, and a service away for longer would warn of posts saved in time.
- **Turning the post's status to published.** The intake writes the content repository, never the source.

## Consequences

- `.post-ids.json` holds `awaited` (`content-format.md`).
- A post saved with its moment just ahead, and first read after it, or whose moment passes while every build fails, warns, since no build saw it wait.
- An editor who changes a post that went out on schedule chooses *Published* to save it, as the check at Save says.
- `tests/intake-ledger.test.js` and `tests/build.test.js` hold the warning and its absence for a post brought out on time, `tests/publishing-client.test.js` its words in each interface language, and `acceptance/form.test.js` the check at Save and the warning in the publish status in Sveltia.
