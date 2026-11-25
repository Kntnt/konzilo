# Thinning out old revisions

Konzilo does not thin out a post's old revisions. It does not keep a post's ten latest saves and drop the rest, whether by hand or by a rule.

## Why this is out of scope

A post's revisions are the commits in the source repository's history that changed its file (ADR 0074). Konzilo stores nothing beside them. Dropping a revision therefore means rewriting the history, and every save after the oldest one dropped gets a new identity, in the source repository and in the content repository alike. Everything that names a save by its identity then has to be carried over: who pushed it, the builder's record, the live preview's timeline. Every open tab in the editor has to reload as well. That is what a purge does, and a purge is worth it only for what must not be kept, such as personal data.

Thinning gains little for that cost:

- **Storage:** Git keeps each save as a small change, so a post's hundred revisions cost little more than its ten.
- **Reading:** a form's *History* lists twenty revisions at a time, newest first, so a long history is no harder to use than a short one.
- **Privacy:** thinning removes nothing that a privacy request requires. What must go is purged: a deleted entry for good (#116), or a passage from every revision (#117).

## Prior requests

- #106: "Let an Admin purge, with braces and a belt", the third of its three ways, struck in triage (Thomas, 2026-11-25)
