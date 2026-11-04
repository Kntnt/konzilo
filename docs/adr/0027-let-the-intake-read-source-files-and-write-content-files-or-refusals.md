# ADR 0027: Let the intake read source files, and write content files or refusals

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice, within Thomas's decision of an intake (ADR 0001); Thomas may veto.

## Decision

- **One function, no input or output of its own.** It takes the source files at one commit, the site description, a clock, the previous ledger and who last changed what, and returns files, refusals and warnings. A command, `konzilo-intake`, reads a checkout and writes the content folder, in the site's build, as the site's user. A file is `{ path, contents }`. **Images come through a seam:** the function asks `images(path)` what an original is, and the command fills that with sharp and SVGO before it runs, so that the function stays pure and synchronous, and a master already there is reused by the hash in its name.
- **A refusal is data:** the post by ID, type and title, the block by path and name, or the field, or the file and line, the reason in words an editor can act on, and a message. **Every problem in a post is named,** in the order of its blocks. A refused post gets no new file, and keeps the one it was last published with, by the ledger, even after its slug has changed. Other posts are unaffected.
- **A warning is shaped as a refusal is,** for what a written file shows otherwise than the post holds, and a post with warnings is still live.
- **The rules are data.** `rules.json` holds each element the core can publish, keyed by element name: its settings, its inline elements, what it may hold, its directive, its embeds, the reserved addresses, and plain words for each refusal. The intake and the field read the same file. **The checks are one implementation that imports nothing,** handed its parser, so that the field runs them in the browser. The intake remains the check that counts.
- **What the check compares.** The reader's tree of the source body, with references resolved and image paths replaced, against the reader's tree of the written body, both by Sätteri. The check accepts only the raw HTML shapes the format lists, and refuses any other. An image anywhere but alone in a paragraph is refused, as is any construct outside the rule data, by its Markdown name and line. A soft line break, a loose list and a list item of more than one paragraph are refused.
- **Exact bytes are the intake's job, not the editor's.** So table padding, bullet characters and a bare address in angle brackets make no difference, and a change of the exact form needs no migration of source files.
- **The whole set.** Because the intake sees every file, it checks across them: one holder per address, a parent refused or missing, a term a post names, a form or component the site no longer offers, a second list with pages, a file of an Admin's, or a post chosen as a legal page, changed by a non-Admin (ADR 0008). A post, its image and its terms move together, because the intake writes a whole tree in one commit.
- **The ledger,** `.post-ids.json`, sits in the content repository, and only the intake writes it. Per ID it holds the paths the post has had, the addresses it had while live, the source file's hash, its `modified` time and when the intake first took it, and what it needs of a refused post's kept file, which it cannot read: its title, and the terms, masters and embeds it names. An ID is text, as a source file's name is. Each commit names whose files are whose. It makes an old address's `301` also after an unpublish, rename and republish.
- **Derived fields stay derived.** `oldAddresses`, `modified`, masters, `translationKey`, settings defaults, resolved menus and legal pages, `consent.json`, `not-found.md` and a parent term's file are all written by the intake, on the published side.
- **Other files are left alone:** other kinds of file, names with a leading dot, and folders no collection names. A file written by a hand other than the intake's is not assumed to be right.
- **When the check itself breaks,** nothing is written, and the site keeps its release: the check fails closed.

## Why

- A function without I/O runs hundreds of cases in a second.
- Stopping at the first problem would make an editor fix one problem per save.
- One implementation gives one verdict in one wording. Two drift apart.
- Anything pushed to the source repository bypasses the field, so the server stays the authority.
- Leaving a refused post's file keeps its last published version on the site, and a refused rename must not take a post off it.

## Considered and rejected

- **A file-by-file take into the published side.** A post could go live without its new featured image, and a file can pass alone and break the site.
- **A Markdown writer inside the field as the only writer.** The field could not be proved against the site's reader, and a change of form would be a migration.
- **Refusing every byte that is not the exact form.** Editors would be refused for what a machine can even out.

## What practice has shown

- A post can open valid in an editor and still have its serialiser write `&nbsp;` for U+00A0, so that a later save changes it. Only a fixed point is the bytes a writer writes.
- With a build asked for on a post alone, a post was published without its new featured image, and recorded as live.
- A refused post's file must be found by its ID, never at its slug, or another post's earlier file is taken for it.
- A source file saved otherwise, or a link whose target moved, says nothing of whether the published version changed. So the ledger holds a hash of the published file without `modified`, and `modified` moves only with it.
- What a non-Admin last changed stays theirs until an Admin saves it, so the check reads who last changed a file, not who changed it since the last build, or an Admin's unrelated save would publish it. A file back at what the ledger last took passes, whoever touched it, so that a demoted Admin's old save does not refuse a whole site's settings. While the settings are refused, the legal pages are those the ledger last took, or an Editor could free a page by changing both.
- Who last changed a file takes the whole history. A shallow clone would blame its one commit for every file, and an Admin's commit would then publish what an Editor left, so the command stops there. Git's rename detection would name only where a moved file went, so it is off. A build says how it holds roles, `--admins <file>` with `--pushers <file>`, or `--no-roles`, so that one that forgets the list stops rather than lets everyone through.
- While the settings are refused, the masters they last named stay with their kept file, or a refused file would take the site's logo with it.
