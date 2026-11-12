# ADR 0001: Edit in Sveltia CMS with a Crepe body field, publish through an intake, and serve a static Astro site from files in git

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02, after a proof with throwaway code held

## Context

Thomas's criteria, in his order: the cost per customer must stay low, administration must be simple, moving a site between live and local must be easy, and performance must be good in the editing interface and on the public site. He wants text files rather than a database as the published record.

He also wants: an editor that writes good Markdown and feels right, which after trying them by hand is Milkdown's Crepe; to see the whole page as it will look, updating as he types; a local copy that takes one command and works as live does, sign-in included, in any browser; and a system that anyone can run themselves, that Kntnt can host many sites with, and that a customer can leave with everything it has.

## Decision

- **The core is named Konzilo** (Thomas, 2026-10-27).
- **Editors write in Sveltia CMS, with a body field built on Crepe,** and see the page from the site's own templates beside the form, about a second after they stop typing.
- **Each site has two repositories of content.** The *source repository*, in a Forgejo of the customer's own, holds what editors write, as source files named by a generated ID. The *content repository* holds the site's published files, written by one program.
- **An intake sits between them.** It reads the source files, checks each file and the whole set, and writes the published content files or refuses. A refused post keeps the file it was last published with. A draft, or a post whose time has not come, has no published file. So a file means *published*, and Astro, search, feeds, the sitemap and every other reader need no filter on status.
- **Astro builds a static release from the content files,** and a web server serves it. A visitor's request meets no program but the web server, apart from the few requests a small Node service takes (ADR 0044).
- **A post's status is a field in its source file:** draft, published, or a date and time. Saving a draft publishes nothing. Saving a published post publishes the change.

## Why

- A static site is fast and has nothing behind it to attack.
- Content files are readable and portable, and outlive any editing tool.
- One program between what editors do and what the site reads keeps byte-stable files, refusals with reasons, masters, old addresses, resolved menus, the service registry and the deletion guard in one place. It also frees the editor: Crepe must preserve meaning, and the intake writes the exact bytes.
- A site carries no database server and no second runtime to patch, and a move is one archive (ADR 0006).
- Live preview is the one thing an editor of a static site most misses.

## Considered and rejected

- **WordPress's block editor, with an export of its posts to files.** It is familiar to customers, but it needs a PHP pool, a database and an installation to patch per site, thousands of lines to hold it down, and it cannot show the page as visitors get it while typing.
- **Sveltia's own body editor.** On Sveltia 0.256.1, one typed character split a gallery into loose images and broke an attribute, so that the reader refused the page. How it writes Markdown cannot be configured.
- **Milkdown without Crepe.** Less code to load, but Thomas preferred Crepe's feel, which is what editors meet. Crepe's parts can be left out one by one, which takes its 2.8 MB of JavaScript to 740 KB.
- **Gutenberg inside Sveltia.** It keeps a conversion from blocks to Markdown and loads a whole Gutenberg per field, to reach what Crepe gives directly.
- **One repository with `editorial` and `main` branches.** Published files hold data no editor writes, such as masters, old addresses, the service registry and settings defaults. The branches would differ for ever, or the job would have to write back to the branch editors write and race them. A purge, a restore and the off-server copy would have to learn branches and merges.
- **Editors writing the published files directly, with the status in them.** Every reader of content files would have to filter on status, and a term page, a feed or a search index could leak a draft.
- **GitHub as the Git host for editors.** Every editor would need an account Kntnt does not control, and Sveltia would need an OAuth service.
- **Sveltia's local workflow for a local copy.** It needs a Chromium browser and has no sign-in or publishing.
- **A static rebuild as the live preview.** At 1–3 seconds per pause it is too slow to feel live. It stays as the fallback, and it serves share links (ADR 0032).

## What practice has shown

Proven on 2026-11-02 with throwaway code: Forgejo 17.0.1, Caddy 2.11.7, Node 24.22.1, Astro 7.4.2, Sveltia 0.256.1 and Milkdown 7.23.0, on Ubuntu 26.04 with Docker 29.9.2. Two customers on one server, one with 1,000 articles and 1,000 images, 602 MB in LFS. Nothing failed badly.

| Question | Result |
|---|---|
| First load, 1,000 articles | 1.8–1.9 s after sign-in in Chromium, Firefox and WebKit: 44 requests, 3.9 MB. Reload 0.9–1.05 s. An entry opens in 0.1–0.15 s |
| Save to public page | 19.7–21.2 s over four runs (save 0.9 s, build about 16 s: intake 3 s, Astro 12 s, switch 0.5 s). A new post with a 3,000 px original 22.6 s. 20 articles 4–5 s |
| Sign-in and saving | Password, code, consent, popup closes, save, right author, in all three engines and in Safari 26.6.2 itself |
| `preSave` | A thrown error stops the save, with no commit and the draft kept |
| Two people, one entry | Sveltia warns the second person while editing and at Save |
| Restore one customer while another saves | 13.4 s; the other's saves 33 of 33 through, both public sites 67 of 67 |
| Table caption in Crepe | 14 of 14 checks in all three engines |

The stand-in for the intake read each body twice through Sätteri, made masters and wrote files; it had no ledger or cross-file checks. Those, Markdown alternates in Node and the search index all add to the 21 s. A full page at 1,280 pixels updated in Sveltia's panel 0.6–0.7 s after a change, at up to 1,000 articles, on a Mac, with text content. Crepe's code is strict: 2 uses of `any` in about 9,500 lines, and 564 unit tests and 190 browser tests passed on 2026-11-01.

## Consequences

- Customers do not meet an editor they already know. Live preview and Crepe are the answer, and only use will show if they suffice.
- There are three roles, the Reviewer reading the live preview alone, and no review step or private drafts (ADR 0008). Forms are made by developers (ADR 0045).
- Sveltia and Crepe are each in practice the work of one person, and Sveltia has not reached 1.0. Both are MIT-licensed and pinned, and the content files do not depend on them.
- An editor's write token lies in the browser's storage on the admin host, so that host must never show editor-written HTML (ADR 0032).
