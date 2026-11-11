read when making a release

A release is a tag `vX.Y.Z` on `main` and a GitHub release of it, whose notes are the version's section of `CHANGELOG.md` (Keep a Changelog 1.1.0, Semantic Versioning). It goes from `main`, in step with `origin`, with a clean tree. These are the steps of Kntnt's `/code:release`, written out so that a run of specs releases by itself (`waves.md`; Thomas, 2026-11-11).

1. **The changelog.** `[Unreleased]` holds one bullet for each change since the last tag (`git describe --tags --abbrev=0`) that a user of Konzilo would notice, under `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` and `Security`, in that order, each saying what changed for the user and never which files. Add what the commits since the tag and the tickets closed since show is missing, once: a change recorded anywhere in the file stays as it is. An empty `[Unreleased]` means there is nothing to release.
2. **The version.** The one the spec names. Otherwise the last tag's, raised by what `[Unreleased]` holds: an entry under `Removed` or a breaking change raises the major version, but the minor below 1.0.0; else one under `Added` the minor; else the patch.
3. **Write it.** `npm version X.Y.Z --no-git-tag-version` writes `package.json` and `package-lock.json`. In `CHANGELOG.md`, `## [Unreleased]` becomes `## [X.Y.Z] – YYYY-MM-DD`, today's date after an en dash, below a new, empty `## [Unreleased]`.
4. **Commit.** The message is `Release X.Y.Z: ` and the most notable entries in a few words each, at most 72 characters in all, then the attribution line. `npm run gate` passes on that commit before `git push`.
5. **Tag.** `git tag -a vX.Y.Z -m "Release X.Y.Z"`, then `git push origin vX.Y.Z`.
6. **Publish.** `gh release create vX.Y.Z --title vX.Y.Z --notes-file <file>`, the file holding the `[X.Y.Z]` section's body, from its first `###` to the next `## [`. Done when `gh release view vX.Y.Z` shows it published, not a draft.
