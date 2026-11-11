# ADR 0033: Keep menus, settings and the site's identity in files an Admin edits

**Date:** 2026-11-02, amended 2026-11-10 and 2026-11-11 · **Status:** Accepted. Settled by Thomas: the Admin changes menus and site settings, and the start page's layout stays in the site repository until page composition (2026-10-27); the logo and icon are uploaded in the editing tool as image fields (2026-11-02); an Admin who opens the settings sees each setting's default where the file holds none, and a save that leaves a setting untouched leaves the site as it was, with no new patch of Sveltia's code (2026-11-11). The rest is a technical choice; Thomas may veto, among them the core's field for a setting with a default, which shows the default and keeps no value where the default is chosen again (2026-11-11).

## Decision

- **The site description declares both:** `menus`, each named in lowercase letters, digits and hyphens with a `label`; and `settings`, each in the form of a field of the site's own.
- **The core declares settings groups of its own,** the same on every site, in one data file, `settings-groups.json`: settings with defaults, optionally a part per post type (`types`), a condition on the description (`when`) and a form of its own. A group's label and description, and its settings' labels and help, are the catalogues', in the interface language (ADR 0066). A group's name is reserved. Secrets and addresses, such as recipients lists and retention, are kept by the service, never in Git.
- **Admins edit them as file collections in Sveltia,** with the groups after the site's own settings, a label per section and each default shown.
- **A setting with a default is the core's field for a setting** (`konzilo-setting`, `src/cms/settings/`), which draws Sveltia's own field for it, a switch, a number, a choice or a text, through `CMS.getFieldType`. It shows the default while the settings file holds no value, and keeps no value, which a save leaves out of the file, where the default is chosen again or the field emptied. Sveltia is given no default of its own for any setting, so it writes none into the file. A number or a text being typed shows what is typed, and a value set from Sveltia's menu of the field shows as it is, with the default where it is none.
- **The source holds values, the published side says what the site does.** Only values that differ from a default are kept in source, so a default the core changes reaches a site that never changed the setting. The intake writes `settings.json` with every setting, typed, each with its value or default, a yes-or-no always, a day as `"YYYY-MM-DD"`, a choice of a post as its title and current address, and an image as its master. In two spaces with one final newline.
- **Menus are written** as `menus/<menu>.json`: `{ "items": [ { "title", "url", "items" } ] }`; `{ "items": [] }` for a place without a menu; an entry with no address has no `url`. An entry for a post leads to the post's current address, by ID, labelled with the post's title unless it has its own.
- **An entry whose post has no page now is left out, with the entries under it, and the build warns.** It comes back by itself. **A menu or the settings the site cannot publish are refused whole,** naming each entry by its place (`2.1`) or each setting by its path (`search.types.post.title`), and keep their last published file.
- **The site's identity:** `title`, `logo` (`{"src":"media/<name>","alt":"…"}`) and `icon` (`{"src":"media/<name>"}`) are written before the declared settings, each only when set; the masters are `logo-<hash>` and `site-icon-<hash>`. A logo's alt text is a field beside it. Erasure keeps what the logo and icon use.
- **Icons.** The icon must be square, and a raster one at least 512 px. Every build makes, at the site's root: `favicon.ico` (16, 32 and 48 px), `icon.svg` where the icon is one, `apple-touch-icon.png` (180 px, opaque), `icon-192.png`, `icon-512.png` and `site.webmanifest`. `Head` links them. A site's own file at one of these addresses fails the build. The theme colours come from the design's values: `primary` and `base`.
- **Astro reads them as collections,** `menus` and `settings`.

## Why

- Customers change what is theirs without asking Kntnt.
- A setting shown otherwise than the site has it misleads the Admin: a switch shown off that is on by default is switched on on purpose, or left as it seems. A default the form wrote into the file at a save would stay there when the core changes the default. Sveltia does both (below), and its field cannot be told otherwise without a patch, so the core's field draws Sveltia's with the value the site has.
- Writing defaults into the file means the content files say exactly what the site does.
- A visitor never meets an entry that leads nowhere.
- Refusing a menu whole keeps the menu visitors see one the Admin made.

## Considered and rejected

- **A page, option and file per feature.** Many screens and many refusal paths.
- **Each site declaring the core's settings.** Every site would repeat them.
- **The settings file read through a format of the editor's own that fills in each default, and written back without them.** Sveltia's draft would hold every default, so each group's closed bar would open by itself as one that holds something (ADR 0029), and the settings page would show every group open.
- **A field's default in Sveltia's configuration alone.** It shows the default only where the file holds the setting's group, and writes it into the file at the next save.
- **A patch of Sveltia's object or switch.** No new patch of Sveltia's code (Thomas, 2026-11-11).
- **An entry for a post with no page as its text alone.** In a menu, a label that leads nowhere is a broken menu.
- **Keeping the entries under a left-out entry in its place.** The menu would take a shape the Admin never gave it.

## What practice has shown

Sveltia 0.256.1, where the settings file lacks a setting of a core group:

- Where it lacks the whole group, Sveltia holds the group as nothing, gives its fields no default, and shows a switch off and a number empty, *Freshness* and *Half-life in days* of *Related posts* and AI visibility's *Markdown* among them. A save after another change, such as the site's title, wrote nothing of the group, so the site stayed as it was.
- Where it holds the group but not the setting, Sveltia fills the field's default into the form, and a save writes it into the file.
- Save stays off until a value changes. A switch of a group the file lacks, switched off and on again, holds no value but is a change to Sveltia, and its save leaves the file as it was.

## Consequences

- An Admin cannot keep a setting with a default empty; a feature that needs "none" offers it as a value.
- An Admin who chooses a setting's default again, or empties its field, leaves the file without it, so the default the core then has applies.
- `tests/cms-config.test.js` holds which settings are the core's field and that no setting has a default of Sveltia's, `tests/cms-settings.test.js` what the field shows and keeps, and `acceptance/form.test.js` (`a setting's default in Sveltia`) the defaults shown, a closed bar left closed, a save after settings changed and changed back that leaves the file as it was, and a save that keeps only what differs from a default, in each engine.
- Fields of a group may take a regular expression of the whole value with the words of its refusal, which `preSave` and the intake both check.
