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
- `docs/adr/README.md` — read before reversing or questioning a decision, or when recording a new one
- `GLOSSARY.md` — read when naming anything in code, docs or tickets, or when a word may carry a Konzilo meaning
