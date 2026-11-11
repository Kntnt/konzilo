# ADR 0071: Draw a post's form in field groups, each with one menu, and keep the source flat

**Date:** 2026-11-11, amended 2026-11-11 · **Status:** Accepted. Settled by Thomas on 2026-11-10: the form in groups of the core's own, each one section with one menu over all its fields; Restore Default never empties a required field without a default; a computed default counts as a default; the article's groups in a fixed order; no publishing row in an article's form; the headline's group with the main headline and buttons that add an eyebrow and a subheadline, which have no labels of their own; the status and date group with the status's choices, then the date and time without a label, then the time zone. The mechanism and the source's shape are technical choices; Thomas may veto.

## Decision

- **A field group** is one section of a post's form, with an optional heading and one menu, *Revert Changes*, *Restore Default* and *Clear*, that acts on every field it covers.
- **The article's form**, in this order: working name, name in breadcrumbs and slug; status and date; main image; authors, category and topics; the headline, with its eyebrow and subheadline; standfirst; body; teaser; search; sharing; structured data; other addresses. A site's own fields stand after the teaser, before search, until they get a group of their own. It has no publishing row.
- **The headline's group** shows the main headline, with a button above it that adds an eyebrow and one below it that adds a subheadline. Neither part has a label of its own: its button, and then its placeholder, say what it is. A part emptied, by the editor or from the menu, is its button again once the focus has left it.
- **The status and date group** shows the status's choices, then the date and time with no label of their own, then the time zone under them, which Sveltia's control names: UTC, the same in every language.
- **A page and a canvas**: their name and slug; status; the publishing row; parent; body; the site's own fields; search; sharing; structured data; other addresses. A type of the site's own has the name, status, publishing row, parent and body first, then its fields in the order declared, with the core's in their groups, each group where its first field is, and its other addresses last.
- **A group's fields share a language.** On a site in several languages a group's fields are all alike in each language, and so is the group, or all written per language. The slug is alike in each and the working name is each language's, so there the slug is a group of its own, after the name and the name in breadcrumbs.
- **A group of the core's fields is the core's own field**, `konzilo-group`, one field of Sveltia's whose value holds its fields' values. It draws each field with the control of its own type, Sveltia's or the core's, through `CMS.getFieldType`, and its own menu. Sveltia's heading and menu of the field are hidden. The name group, the status group and the headline group are of this kind. A field of it may show no label of its own (`labelled: false`). Its label is still there, hidden, so that it names the field for a screen reader and in a refusal.
- **A group whose fields only Sveltia draws is an object of Sveltia's.** The category and the topics are relations, which only Sveltia's own field draws, with its dialog that adds a term; the authors field, the core's own, stands with them. Sveltia's own menu of the object covers all three. So does it for the teaser, search, sharing and structured data, each an object already, and their closed bars show it at their end. A field alone, such as the main image, the standfirst, the body or the other addresses, is a group by itself, with Sveltia's menu. Within an object, the fields' own menus are hidden.
- **The core's menu:**
  - *Revert Changes* gives each field what it held when the form first showed it, which is the post as read, since a field is shown before it can be changed; and a new post's fields their first values. The editor forgets it when the post is saved.
  - *Restore Default* gives each field its default. A required field without one keeps what it holds.
  - *Clear* empties each field.
  - A computed default counts as a default: the slug's is the one made from the name in breadcrumbs (`computed: 'slug'`). *Restore Default* and *Clear* both give it, made from what the other fields then hold.
  - Each is greyed where it would change nothing, as worked out when the menu opens.
- **The source stays flat.** The editor reads and writes a post's file through a format of its own, registered under Sveltia's name for it, `yaml-frontmatter` (`CMS.registerCustomFormat`). It reads the front matter as Sveltia does, and puts each group's fields into the group, in the place of its first field. It writes the group's fields in the group's place, leaving out an empty one, and the file through Sveltia's own formatter (`serialize`). The configuration's `konzilo.groups` names each group's fields. A field is in the same group in every form, so the format reads a file alike whatever its collection, which Sveltia does not tell it.
- **At Save,** a required field of a core group left empty stops the save, naming the field, in every language: the group's own check where the form has shown it, and a `preSave` check where it has not. The `preSave` check changes nothing, since an entry given back from it is rebuilt by Sveltia in a way that loses what a closed bar holds.
- **Sveltia names a post by `group-name.title`**, its working name or title in its group: in its lists, and in a choice of a post.
- **The rest of the editor reads a post's values flat**, as they are now (`postValues`): the live preview's draft, a field's fallback, the slug's proposal and the check of a scheduled moment.
- **No new patch.** The groups use `registerFieldType`, `getFieldType`, `registerCustomFormat`, `registerEventListener` and the stylesheet. Escape closes a group's menu from a listener on the window added before Sveltia starts, which closes the entry on Escape otherwise.

## Why

- Sveltia's field menu restores a required field without a default to nothing, and knows no computed default. Its rules cannot be changed but by a patch, so a group whose fields need these rules has the core's menu.
- A field of Sveltia's custom type changes only its own value. A menu over several fields therefore lives in a field that holds them all.
- Sveltia's object draws every type of field and keeps each field's language. Its own menu follows these rules where every field is optional, as the terms of an article are.
- A flat source leaves `content-format.md`, the intake, the demo content and every source file as they are. A group is how the form looks, so changing a group later changes no file.
- A label over a part that is a button until wanted says again what the button says. Without labels, the eyebrow and the subheadline stand above and below the main headline as they do in the article, and the date and time read as the status's.
- Sveltia's own controls, the date's among them, take their name from the label's element (`aria-labelledby`), which a hidden element still gives.
- A field of a custom type is not told what the file held, so the group keeps what it first showed. A field can only be changed once shown, so that is the post as read.

## Considered and rejected

- **A group as an object in the source, which the intake flattens.** Every source file, the demo content, `content-format.md` and the intake would change, and change again each time a group did.
- **The fields as read kept beside their group, for Revert Changes.** After a save, Sveltia keeps the post as it was saved, not as a file read again, so they would be gone; and keeping them there at Save means giving an entry back from `preSave`, which loses what a closed bar holds.
- **A group of fields that differ in language, its fields alike in each copied at Save.** It needs the same `preSave` that gives an entry back.
- **A format per collection, which would know its file's groups.** Sveltia gives its own formatter only to a format registered under one of its names, so the core would write YAML itself, and a format's reader is not told the collection either.
- **Every group an object of Sveltia's.** Its menu empties the working name and the main headline at *Restore Default*, and knows nothing of a slug made from the name.
- **A heading and a menu drawn above flat fields.** The menu could not change them.
- **A label left out altogether where none shows.** Sveltia's controls, the date's among them, would have no name.
- **A control of the core's own for the date, to write the time zone in words of the interface's language.** Sveltia's names it under the date and time already, and UTC is its name in both languages.
- **A patch of Sveltia's field menu.** The spec forbids new patches of Sveltia's minified code.
- **The core's own choosers for a category and for topics, so that the terms could be a core group.** The authors field is the core's own; the category and the topics stay Sveltia's relations, with the dialog that adds a term, and every one of the three is optional, which Sveltia's menu serves.

## Consequences

- `group.css` hides Sveltia's heading and menu of a core group, and the menus of the fields within an object group. A group shows its label as a heading only with `heading: true`; otherwise its label names the section for a screen reader.
- A group's name begins with `group-`, which a field's name cannot, since it is letters, digits and underscores.
- *Copy from another language* is not in a core group's menu.
- Where a group's menu is Sveltia's, its rules are Sveltia's. A type of the site's own with a required terms field, or a required field standing alone, would have it emptied at *Restore Default*. A field of the core's that needs the core's rules goes in a core group, even alone.
- What Sveltia keeps of a post, read or just saved, holds each group's fields in the group, and anything that reads a post's values in the editor reads them through `postValues`.
- `tests/cms-config.test.js` holds the groups and their order, `tests/cms-groups.test.js` the format, and `acceptance/form.test.js` (`field groups in Sveltia`) the groups in order, each menu, the slug's default, the headline's buttons and the keyboard, and (`the interface language in Sveltia`) the status and date group in Swedish.
