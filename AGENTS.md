# Konzilo — agent guide

## Ground rules (authoritative)

Precedence over any conflicting skill, README, or other doc unless the user overrides in the moment.

- Authoritative: this file, the files it references, and the actual code/state.
- No file here, tracked or ignored, names, describes or points to a customer or a customer project. Customer projects refer to Konzilo, never the reverse. Issues and pull requests count too.
- Nothing here points at earlier work. A decision stands on its own, with its reasons, and code carries no note of where it came from.
- Nothing in the core may require a service or a name that only Kntnt has. Each such concern is an adapter chosen in settings, and each can be switched off.
- Harnesses here run without permission prompts. Before anything that costs money, reaches outside this repository, commits, pushes or publishes, read `docs/agents/autonomy.md`.
- Docker: remove only your own projects, by name. Never any `docker … prune`.
- Every file in English.

## Non-obvious

- Thomas dictates: `/[ck]on[csz]ilo/i` means Konzilo.
- Pinned versions live only in `versions.env`. Read it with `scripts/versions`; never source it.

## References

- `docs/agents/status.md` — read first when starting or resuming work
- `docs/agents/autonomy.md` — read when an action may cost money, reach outside this repository, commit, push or publish, or when asking Thomas anything
- `content-format.md` — read when changing what a content file holds or how it is read; the same change updates it
- `site-template/README.md` — read when bringing up a site from a clean clone, or when a change alters what that takes
- `docs/adr/README.md` — read before reversing or questioning a decision, or when recording a new one
- `GLOSSARY.md` — read when naming anything in code, docs or tickets, or when a word may carry a Konzilo meaning
- `CONTRIBUTING.md` — read before merging work by anyone outside Kntnt, or adding a dependency or code someone else wrote, since each must leave Kntnt free to license the core on other terms
- `TRADEMARKS.md` — read when writing how the name Konzilo may be used
- `SITE-EXCEPTION.md` — read before moving code between the core and the site template, or giving a site a new way to hand the core a template, since both move the line between what the license covers and what a site may keep
- `docs/site-design.md` — read when changing a class, a state or a custom property the core's markup has; the same change updates it
