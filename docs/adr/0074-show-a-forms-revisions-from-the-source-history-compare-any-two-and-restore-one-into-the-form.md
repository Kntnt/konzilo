# ADR 0074: Show a form's revisions from the source history, compare any two, and restore one into the form

**Date:** 2026-11-23 · **Status:** Accepted. Settled by Thomas on 2026-11-22 and 2026-11-23: an Editor sees every **revision** of a form, compares any two field by field, and restores one into the form as unsaved changes; nothing new is stored. The rest is a technical choice; Thomas may veto.

## Decision

- **Every form has its revisions:** a post's, a translation's as a post of its own, a term's, an image library entry's, the site settings' and each menu's in each language, as every form has a lock ([ADR 0073](0073-lock-a-form-to-the-tab-that-has-it-open-and-refuse-a-save-older-than-the-latest.md)). Whoever may open a form sees its revisions. Only whoever may save it restores one.
- **Read from the source repository's history,** with nothing stored beside it. A revision is each commit that changed the form's file, listed newest first, with its moment, the account that pushed it as Forgejo recorded it, not as the commit says ([ADR 0008](0008-give-customers-three-roles-admin-editor-and-reviewer.md)), and the status it left a post in. What is purged is gone from every revision, as it is from the history.
- **Any two can be compared,** the form's unsaved changes as either side too: field by field, under the form's own labels, with fields alike folded away. Text is marked word by word; an image or a file is shown before and after; a list's items added, removed or moved are marked. A field the form no longer has is named, with what it held.
- **The body is compared as it reads,** block by block and word by word. A block whose words are alike but whose formatting or link targets changed is marked as changed in form, and shown both ways.
- **Restoring fills the form** with the revision's fields as unsaved changes, for the Editor to see before saving. It needs the lock. Where the form holds unsaved changes, the Editor is asked first whether to replace them, and what is replaced stays in the draft backup. Only the fields the form has today are restored; the status and the moment stay as they are, so restoring never publishes or unpublishes by itself. The slug is restored as any field, and a published post's address then moves, with the automatic old address that every move gets ([ADR 0036](0036-keep-every-redirect-as-a-rule-and-make-old-addresses-from-what-was-live.md)). A value that fails today's checks, such as a term since removed, is refused at Save as any value is.
- **Saving a restored revision makes a new one;** nothing in the history is removed or rewritten.
- **A refusal of a save older than the latest** (ADR 0073) offers to compare the latest save with the form's unsaved changes.

## Why

- An Editor who has changed a text, or finds it changed by someone else, needs to see what it said and to get it back without asking Kntnt. The source repository has held every revision all along, but only someone who works in Git could reach it.
- Formatting and link targets are compared too, since a link that now leads elsewhere can matter more than a word, and a word-only comparison would not show it.
- Restoring as unsaved changes lets the Editor see what will change, and keeps restoring one save like any other, with the lock, the checks and the status rules it already has.

## Considered and rejected

- **A store of revisions of Konzilo's own.** The history already holds every save, and a second copy would have to be purged and moved with it.
- **Comparing the body's words alone.** A changed link target would not show.
- **Full tracked changes in the body, as a word processor shows them.** Far more work for little more than the marked blocks give.
- **Restoring the status and the moment too.** Restoring would then publish or unpublish by itself.

## Consequences

- Restoring a deleted entry, which has no form, is not part of this decision.
- `GLOSSARY.md` defines a revision.
