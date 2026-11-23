# ADR 0073: Lock a form to the tab that has it open, and refuse a save older than the latest

**Date:** 2026-11-23 · **Status:** Accepted. Settled by Thomas on 2026-11-23: every form in Sveltia is locked to the one tab that has it open, and any other Editor may take it over; a save from a form older than the latest save is refused, even where the two changed different fields; the editor keeps the lock, and the server's one guarantee is that an old copy cannot overwrite a newer one. The rest is a technical choice; Thomas may veto.

## Decision

- **Every form is locked:** a post's, a term's, an image library entry's, the site settings', and each menu's in each language, each as one form. An **Editor** is anyone who writes, an Admin too; a Reviewer never enters Sveltia and is not touched.
- **A lock is held by a tab, not by a person.** Someone who opens a form they already have open in another tab, on this device or another, meets the same choice as anyone else, told that it is their own other tab.
- **Opening a locked form says who has it and since when,** and offers three ways on: back to the list, the form in its read-only state, or a **takeover**. The list marks each locked entry with the name of the Editor who has it.
- **The read-only state** is the form with every field inert, no Save and no Delete, and a line above it saying why. The same state serves three cases: reading a locked form, the form of a tab whose lock was taken over, and a draft backup that can no longer be saved.
- **A takeover tells the tab that had it at once,** by name and time. That tab's form turns read-only, with its unsaved changes still in its fields to read and copy, and never saves them.
- **Only someone who may save a form locks it.** An Editor who may not save it, such as one in the Editor role at the site settings or a menu, which are an Admin's ([ADR 0008](0008-give-customers-three-roles-admin-editor-and-reviewer.md)), takes no lock and is offered no takeover: the form opens read-only, saying it is for Admins, with the way back to the list.
- **A lock ends by itself** when its form is left or closed, and within two minutes after its tab stops answering. It never ends because its holder is idle: an Editor who needs the form takes it over.
- **The editor keeps the lock.** Before each save and each deletion, the form asks whether its tab still holds the lock, and refuses where it does not. A deletion is a change like any other and needs the lock, from the form or from the list.
- **The server's one guarantee is the latest save.** A save made from a form opened before a later save is refused, with a refusal naming the account that made the later save and when, even where the two changed different fields; nothing is merged. Sveltia's *Save Anyway* is gone. The same holds for whatever writes the source repository outside Sveltia, a developer's push or the instance administrator's: it takes no lock, and its commit makes every open form of what it changed stale.
- **A draft backup is never saved over a later save.** Sveltia offers a backup of unsaved changes as before only where the entry has not been saved since the backup was taken. Otherwise the backup is shown in the read-only state, to read and copy.
- **Two people saving different entries at once** both succeed: a save Git turns away because another commit came first is tried again, with the check against the latest save made anew.

## Why

- Two Editors in one form, each saving, overwrite each other, and neither knows until the work is gone. Sveltia warns, but its *Save Anyway* overwrites, and the lost version stays only in Git's history, where an Editor cannot reach it.
- A lock that can be taken over prevents that without ever leaving a form stuck behind someone who has gone home, so no timeout has to guess how long reading or thinking takes.
- A lock per tab, not per person, since two tabs of one person overwrite each other as two people do.
- Editors are trusted: everyone may publish ([ADR 0008](0008-give-customers-three-roles-admin-editor-and-reviewer.md)). The lock guards against mistakes, not against a person changing their own client, so the editor can keep it. The latest-save check covers what the lock cannot see, a tab back from a lost connection, and every write from outside Sveltia.
- Refusing always is predictable and easy to explain. Comparing the two saves, once an Editor can compare revisions, takes care of the rest; merging can come later if a site needs it.

## Considered and rejected

- **Merging changes to different fields.** Harder to explain, and a merge of two bodies is a guess.
- **A lock that ends after a time without activity.** It takes the form from someone reading or thinking.
- **Refusing a push of a locked entry on the server,** by a hook in Forgejo or in the intake. No hook exists yet, and the trust the roles already give makes it unnecessary.
- **Sending a reader of a locked post to its page in the live preview.** The preview does not show search, sharing or structured data, which are often what is read.
- **Dropping a draft backup that can no longer be saved.** Unsaved work is never lost, only never saved over someone else's.

## Consequences

- [ADR 0029](0029-configure-sveltia-from-the-description-and-patch-its-npm-build.md)'s patch of a retry when two people save at once is part of this decision, and *Save Anyway* is patched away.
- `GLOSSARY.md` defines the lock and the takeover, and a refusal covers a save older than the latest.
