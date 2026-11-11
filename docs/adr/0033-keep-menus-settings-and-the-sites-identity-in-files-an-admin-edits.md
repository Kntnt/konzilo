# ADR 0033: Keep menus, settings and the site's identity in files an Admin edits

**Date:** 2026-11-02, amended 2026-11-10 · **Status:** Accepted. Settled by Thomas: the Admin changes menus and site settings, and the start page's layout stays in the site repository until page composition (2026-10-27); the logo and icon are uploaded in the editing tool as image fields (2026-11-02). The rest is a technical choice; Thomas may veto.

## Decision

- **The site description declares both:** `menus`, each named in lowercase letters, digits and hyphens with a `label`; and `settings`, each in the form of a field of the site's own.
- **The core declares settings groups of its own,** the same on every site, in one data file, `settings-groups.json`: settings with defaults, optionally a part per post type (`types`), a condition on the description (`when`) and a form of its own. A group's label and description, and its settings' labels and help, are the catalogues', in the interface language (ADR 0066). A group's name is reserved. Secrets and addresses, such as recipients lists and retention, are kept by the service, never in Git.
- **Admins edit them as file collections in Sveltia,** with the groups after the site's own settings, a label per section and each default shown.
- **The source holds values, the published side says what the site does.** Only values that differ from a default are kept in source, so a default the core changes reaches a site that never changed the setting. The intake writes `settings.json` with every setting, typed, each with its value or default, a yes-or-no always, a day as `"YYYY-MM-DD"`, a choice of a post as its title and current address, and an image as its master. In two spaces with one final newline.
- **Menus are written** as `menus/<menu>.json`: `{ "items": [ { "title", "url", "items" } ] }`; `{ "items": [] }` for a place without a menu; an entry with no address has no `url`. An entry for a post leads to the post's current address, by ID, labelled with the post's title unless it has its own.
- **An entry whose post has no page now is left out, with the entries under it, and the build warns.** It comes back by itself. **A menu or the settings the site cannot publish are refused whole,** naming each entry by its place (`2.1`) or each setting by its path (`search.types.post.title`), and keep their last published file.
- **The site's identity:** `title`, `logo` (`{"src":"media/<name>","alt":"…"}`) and `icon` (`{"src":"media/<name>"}`) are written before the declared settings, each only when set; the masters are `logo-<hash>` and `site-icon-<hash>`. A logo's alt text is a field beside it. Erasure keeps what the logo and icon use.
- **Icons.** The icon must be square, and a raster one at least 512 px. Every build makes, at the site's root: `favicon.ico` (16, 32 and 48 px), `icon.svg` where the icon is one, `apple-touch-icon.png` (180 px, opaque), `icon-192.png`, `icon-512.png` and `site.webmanifest`. `Head` links them. A site's own file at one of these addresses fails the build. The theme colours come from the design's values: `primary` and `base`.
- **Astro reads them as collections,** `menus` and `settings`.

## Why

- Customers change what is theirs without asking Kntnt.
- Writing defaults into the file means the content files say exactly what the site does.
- A visitor never meets an entry that leads nowhere.
- Refusing a menu whole keeps the menu visitors see one the Admin made.

## Considered and rejected

- **A page, option and file per feature.** Many screens and many refusal paths.
- **Each site declaring the core's settings.** Every site would repeat them.
- **An entry for a post with no page as its text alone.** In a menu, a label that leads nowhere is a broken menu.
- **Keeping the entries under a left-out entry in its place.** The menu would take a shape the Admin never gave it.

## Consequences

- An Admin cannot keep a setting with a default empty; a feature that needs "none" offers it as a value.
- Fields of a group may take a regular expression of the whole value with the words of its refusal, which `preSave` and the intake both check.
