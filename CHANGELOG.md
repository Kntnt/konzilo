# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A post list can be shown on the first page of its post's list with pages alone, `firstPage="true"`, so that a page that leads with a few featured posts above a list with pages does not show them again on page 2 and on. They are still left out of the list with pages on every page, so each of its pages holds the same posts as where they are shown on every page. The list with pages itself does not take it, and on a post without one it changes nothing.

## [0.10.0] – 2026-11-25

### Added

- A site's container component is given each block at the top of its body as a slot of its own, `block-<index>` by the block's index in its tree, `content.children`, beside its default slot. A component that lays its items out by what it holds, cards, tabs or questions split at their headings, draws each item's blocks through their slots, and the core draws them as it draws a body: a component within by the site's own component, an image that opens in the lightbox, a form, a post list by its presentation, and in the live preview each block's mark. A component that asks for no block's slot renders as before.
- A *Deleted* page in the editor, in Swedish *Raderat*, for every Editor and Admin. It lists the posts, terms and images of the image library that have been deleted, newest first, with what each was called, its type, when it was deleted and by whom, and lets you show one type at a time. Each opens read-only as it was last saved, with its earlier revisions to read and compare. *Restore* saves it again as a draft under its own ID, so that links, menus and other posts find it again, and opens its form, whose history then holds its revisions from before the deletion. An image comes back with its file. A deleted entry is listed for as long as the history holds it.
- `konzilo({ images })` takes the widths and sizes in which a site's design draws an image, for a body's image, a gallery's, the lightbox's, a hero's and a card's, and `imageVersions()` from `@kntnt/konzilo/astro/images` gives a template those of a context for Astro's `<Image>`. A context a site leaves out keeps the core's, which fit the site template.
- A scheduled post can wait for triggers: a moment, as before, or the publishing of another post of a given type, with given words in its title, with a given term, or published within a given window. Triggers on one row are alternatives, and every row must hold; a post-published trigger's conditions are laid out the same way. The post goes out once they hold, however late a build sees it, dated by the moment they came to hold, a chain of such posts in one build, and stays out whatever later becomes of the post that released it. Its publish status and the *Publishing* page show each trigger, ticked once it has happened. The form stops a save whose window has wholly passed, and one whose posts would wait for each other in a cycle. The live preview's timeline places such a post where it will go out, and its toolbar lists one that waits for something nothing scheduled tells the moment of. A post scheduled for a moment alone is unchanged.
- Formulas in a body, written as LaTeX: `$…$` in the text and `$$` on lines of their own around a block formula, for a type that names `inline-math` or `block-math` among its elements. The site shows each as MathML that every browser draws and screen readers read, with no script, stylesheet or font, and a block formula in a box of the class `konzilo-math` that a design can size and scroll. The body field writes them, from the toolbar, the block menu or typed between two `$`, and draws them as the site does; the intake refuses a formula it cannot draw, saying what it could not read. A `$` opens a formula by Pandoc's rule, so "$5 and $10" stays text. The Markdown alternates, `llms.txt` and search hold a formula's LaTeX.
- *Lossless compression* for an image uploaded to the image library, ticked by default for a PNG, which keeps every pixel of a drawing, a diagram or a screenshot, in its master too.
- The settings group *Image uploads*, where an Admin sets the longest side an uploaded image is scaled down to, 3840 pixels by default, and its quality, 90 by default.
- *Display width* for an image in the image library: *Fill the column*, as before, or *At most* a number of pixels, for a diagram or a screenshot saved at twice the size it is meant to be read at, so that its labels match the text around it. A file whose name ends in `@2x` or `@3x` gets half or a third of its pixel width at upload, which the editor may change. It is copied into a post with the image, as its alt text is, and an image standing alone in a body is then drawn at most that wide, with its full pixels in its `srcset`, so it stays sharp on a dense screen, and is not warned of for being narrower than the site usually shows images, where the image is at least as wide as its display width. In a gallery, and as a featured or teaser image, an image fills what the design gives it, as before. A body writes it as the image's title, `![…](… "width=632")`.

### Changed

- A level of the breadcrumbs, and of the structured data's `BreadcrumbList`, whose post has no name in breadcrumbs is named by the label of the menu entry that leads to the post, in the page's language, before its title: of the menus in the order the site description declares them, the first that has such an entry, and in it the first. The post's form shows that label in its empty name in breadcrumbs, as it shows the title, and saves neither. An entry that leads to the post's address as a link, rather than to the post, names none, so a menu's content file keeps the ID of the post or term each entry leads to, `post`, beside its address.
- Breadcrumbs end with the page itself by default for a post of a hierarchical type, such as a page, so that a page at the root, such as a cookie policy, shows the start page and itself, and still end above the page for a post of another type, such as an article. A post whose name in breadcrumbs is filled in ends its breadcrumbs with itself whatever its type. A site whose pages' breadcrumbs should end above them turns *The page itself last* off for pages under *Breadcrumbs* in the site settings.
- Each image in a post's body, and the site template's main image and cards, are served in a few fixed widths by `srcset` and `sizes`, so a phone loads a version near the width it shows the image at, not the whole master: in a window 400 px wide, the 480 px version of a photograph, about a sixteenth of the bytes it loaded before. No version is wider than its master or 2520 px. Versions are WebP at quality 75, and every version of a lossless master is lossless. A release holds more image files, about 1.6 times the bytes, and a first build takes some 60 ms more an image.
- A content file writes `\$` for a dollar sign that would otherwise open a formula, in every type, so a post whose text holds such a `$`, as in `$x$` meant as text, has its file changed at the first build, though it reads the same.
- An image is converted in the browser before it is uploaded: turned upright, converted to sRGB, scaled down to the longest side set, never enlarged, and saved as WebP, without its metadata, so the place a photograph was taken never leaves the editor's computer. An SVG is uploaded as it is, and a file that reaches the source another way still goes through the checks as before.
- The window the editor opens for a sign-in opens empty and goes straight to Forgejo's sign-in page. It used to load the whole editor first, only to be sent on from there, so a sign-in now starts sooner.
- The consent banner's default text is written from the facts of the services that ask for consent, as an embed's placeholder already is: it says that they may store data in the browser, use what they learn for their own purposes, or send data to countries outside the EU and EEA only where one of them does. A banner text an Admin has written is shown as before, and one saved that is word for word the old default now gives the new one. The settings show the banner's text empty where no Admin has written one, with a hint of what the banner then says.

### Fixed

- A site that embeds Datawrapper declares a transfer to the USA with no safeguard its provider documents, in its cookie declaration, and its placeholder says that data about the visit may be processed outside the EU and EEA. Datawrapper's privacy policy keeps published charts in the USA; the core's facts listed no transfer.

### Security

- A site run locally with Compose answers on its public site, editor, Forgejo and live preview only for `localhost`, `127.0.0.1`, `[::1]` and a name one label under `.localhost`, such as `site.localhost`, and refuses any other name with `421 Misdirected Request` and nothing else. A page on another site could make a name of its own lead to this machine and read what the copy answered as its own. A server names its own hosts in `KONZILO_WEB_HOSTS`.

## [0.9.0] – 2026-11-25

### Removed

- Sveltia's Asset Library, which no menu offered but which still opened at its address, there to move, rename or delete a file under no lock, a file posts still show among them. Its address now leads to the list of entries. An image is still added and deleted through its entry in the image library, and chosen and uploaded from every image field as before.

## [0.8.0] – 2026-11-24

### Changed

- The core needs Node 26 or later, the Node a site run with Compose has run since 0.7.1; nothing tests it on Node 24 any more.
- A required term's menu, Sveltia's own, says *Återställ standardvärde* in Swedish, as every other field's menu does, in place of Sveltia's *Återställ standard*.

## [0.7.1] – 2026-11-24

### Changed

- A site run with Compose runs Node 26.13.1, the current long-term release, for its builder, its live preview, its service and the editor's build.

## [0.7.0] – 2026-11-24

### Changed

- The editor runs Sveltia 0.271.2. When a draft backup is offered, the form stays in view, read-only, until the backup is restored or discarded, so it can be read first. A required term's menu, Sveltia's own, says *Återställ standard* and *Rensa alla* in Swedish, and the rest of Sveltia's interface is in Swedish too where it was in English. A term chosen in a post's form can be edited from there only while it is new, added from that form; an existing term is edited in its own form, under its own lock.

## [0.6.1] – 2026-11-24

### Changed

- The core needs Astro 7.4.13, which a new site pins. A site that raises its pin to this release raises its Astro to 7.4.13 in the same install, as the site template's guide now says; npm refuses the raise without it.
- A site run with Compose runs Forgejo 17.0.2, Caddy 2.11.9 for its web server, and Node 24.22.3 for its builder, its live preview, its service and the editor's build.

### Fixed

- The live preview beside a form no longer shows the dev server's error over the page, saying that an image could not be found, after an image is taken out of the post, until the next change redraws it.
- A form left by loading the editor's page again, or closing it, just as the form opened no longer stays locked behind the closed tab for up to two minutes, telling everyone who opens it that it is open in another tab.

### Security

- A site builds with Astro 7.4.13, which no longer lets an element name taken from a page's input, such as an address's query, carry an attribute into the page, a script among them.
- Astro's image endpoint for its Node adapter no longer reads files from a folder beside the build's whose name differs only in case. A site built by Konzilo is static and has no such endpoint, but a site that adds Astro's Node adapter would have had one.

## [0.6.0] – 2026-11-23

### Added

- A form in the editor is locked to the one tab that has it open: a post's, a term's, an image library entry's, the site settings' and each menu's. Opening a form another tab holds says who has it, or that it is the Editor's own other tab, and since when, and offers to go back to the list, to read the form read-only, or to take it over; the list of entries marks each entry another tab holds with its holder's name. A takeover tells the tab that had the form at once, by name and time, and that form turns read-only with its unsaved changes still in its fields to read and copy; taking it back shows those changes read-only from the latest save, never to be saved, until the latest save is opened. A form is read-only until the editor knows whether another tab holds it, and where that cannot be known within ten seconds, it opens to edit. A lock ends when its form is left or closed, also while it shows a draft backup, and within two minutes after its tab stops answering, never because its holder is idle. An Editor in the Editor role opens the site settings and the menus read-only, told that they are for Admins. A deletion, from the form or from the list, needs the lock too.
- Every form in the editor has a *History*, in the panel beside it: a post's, a translation's, a term's, an image library entry's, the site settings' and each menu's. It lists each save of the form newest first, from the source repository's history, with its moment in the reader's own form and time zone, the account that pushed it as Forgejo recorded it, and a post's status. Any two revisions, or a revision and the form's unsaved changes, compare field by field under the form's labels, with fields alike folded away: text marked word by word, an image before and after, a list's items added, removed or moved, a field the form no longer has named with what it held, and the body block by block, a block changed only in its formatting or a link's target marked and shown both ways. A revision is restored into the form as unsaved changes, which a save keeps as a new revision; the status and the date stay as they are, and unsaved changes it replaces are asked about first and kept, as the draft backup and at the top of the History. An Editor in the Editor role sees the history of the site settings and the menus, and restores nothing there. The refusal of a save older than the latest offers to compare the latest save with the form.

### Changed

- The live preview shows the site as it stands at a moment of its timeline, now and each later moment at which a scheduled post, or a draft with a moment, goes out, in place of every saved post at once. At a moment, every page, post list, recommended reading, archive, feed and menu holds what is out by then and nothing after it: what is published, a scheduled post and a draft whose moment has come, and a draft without a moment from now on. A tab of its own starts at now, and its toolbar lists the timeline, each moment in the reader's own time zone with what goes out then, and shows the one chosen, which holds across the tab's pages. The pane beside a post's form shows the moment the post goes out, now for one published or without a moment, and follows a moment changed in the form before it is saved; a button in the post's form, *Open in a tab of its own*, under the buttons of its panels beside *History*, opens the page in a tab at that moment, wherever the preview stands. A page whose moment is still being prepared says so, and opens by itself once it is ready.
- A save from a form older than the entry's latest save is refused, also where the two changed different fields and where the later change was pushed from outside the editor, naming the account of the later save and its moment; nothing is merged, and *Save Anyway* is gone. The refusal offers to reload, which keeps the Editor's changes to read and copy. A draft backup is offered as before only where the entry has not been saved since it was taken; otherwise it is shown read-only, until the latest save is opened.

### Fixed

- Two Editors saving two different entries at the same moment both succeed: a save Forgejo turns away because another commit came first is tried again, with no error dialog.

## [0.5.0] – 2026-11-13

### Added

- A menu's entry may have a line of description, which an Admin writes under the entry's address in the menu's form and a site's design gets from `siteMenu()` as `description`, to show under the entry as a large menu does: one line of plain text, of at most 160 characters.
- A form field's label can hold links, written as Markdown links in the site description, such as `I have read the [privacy policy](/privacy-policy/)` for an acceptance line, each to an address a menu's entry may have: the form draws the link in the field's label, one to a path on the site below the site's base, as a body's links are, so that it stays in a preview, and a submission, its mail, its CSV and the Submissions page show the label's words without it.
- A post list's presentation is given what the whole list holds beside the posts of its page, in the prop `list`: the list's type with its label and plural, how many posts the list matches on all its pages, the terms of those posts in each of the type's taxonomies with how many hold each and the address of each term's page, and the search page's address. A presentation that filters can draw rows of terms and say how many posts it shows of how many, the same on every page. `listedPosts()` gives the same as the property `list` of the posts it returns.
- A term's page is told, beside its term and posts, its taxonomy's name and label in `taxonomy`, the taxonomy and the term it settles in `settled`, and what its whole list holds in `list`, as a post list's presentation is given it, its type null where several types take the taxonomy. A presentation that filters can leave out the row the page settles, send the term along with a search from the page, and say how many posts the term holds.
- `konzilo-intake` takes the moment it runs at, `--now 2026-11-03T12:00:00Z`, an ISO 8601 date and time with its offset, in place of the clock's: given one moment it writes the same bytes on any day, the service registry's `revised` and which posts wait among them.
- The search page narrows by terms as a list's filter sends them, each taxonomy by its name with its terms' slugs, `?topics=rivers&topics=lakes`: the terms of one taxonomy by or and the taxonomies by and, every post of them when no words are given. A search within a term finds the posts filed under the terms below it too, as the term's page lists them. It keeps them in its form and in its links to the other pages, and its status says what it searched within, "3 results for “lantern” in Rivers or Lakes and in News".
- An Admin can choose a page as the start page in the Site settings, under *Start page*, as the page for addresses not found is chosen, so that an editor writes the page a visitor meets first, with the site's components, post lists and forms, and opens it in the editor and in the live preview as any page. The chosen page is at `/` and at no other address: the address it had leads there, and so does a link, a menu entry or a redirect rule to it; its head takes the start page's templates, with its own search and sharing fields over them; and the sitemap, its Markdown alternate `/index.md`, `llms.txt` and search hold it at `/`. A site whose Admin chooses none shows its own start page as before, and so does a site in several languages, which is offered no choice yet.
- A form can have a button text of its own in the site description, `button`, one text or, on a site in several languages, one in each, in place of the site's word for sending. Where the form lists `button` under `editable`, an editor changes the text where the form is placed, `::form{name="contact" button="Book the assessment"}`, or in the structure editor's box for the form; the intake refuses such a text where the form does not allow it. A site's own form component that places Konzilo's `Form` with `name` alone must pass on `button` too, as the site template's does, for an editor's text to show.
- Each release carries the core's package as a file, `kntnt-konzilo-X.Y.Z.tgz`, which anyone can fetch, and `new-site --release vX.Y.Z` makes a site repository that keeps it in its `vendor/` and pins it there, so that the site installs and builds on any machine and needs nothing from GitHub to do so. The site template's guide says how a site raises its pin, and that such a site runs in Compose from a checkout of the core at the same tag.
- The editor's application carries the notices of what it holds, which the admin host serves at `/third-party-notices.txt`: every package it bundles by name and version with its license and its license text, those inside Sveltia's own bundle too. Its build fails on a package whose license it cannot name.
- Each of the core's programs finds Forgejo, Typesense, the service's two roles and the live preview, and its own credentials and work folder, by settings whose defaults are where Compose puts them, so that a hosting layer or a site can arrange the same programs otherwise, on other machines or several in one container; the service's two roles can be held to the loopback, and Forgejo's webhook let reach another host. Compose sets none of them and runs as before. The Compose guide lists them under *What another arrangement sets*.
- A local copy can hold several people, one in each role: `KONZILO_PEOPLE` in the site's `.env` lists them, each `name:role` with the role `admin`, `editor` or `reviewer`, such as `anna:admin,ebba:editor,rut:reviewer`. Each gets an account with the password in `local-secrets/account-password`, or a secret of their own, `account-password-<name>`, a second factor of their own and the team of their role, and `docker compose run --rm code <name>` prints a person's code. A start adds whoever the list names to a copy seeded before, moves a person whose role has changed, and removes no one. A listed person whose account is there already, and whom the seed cannot sign in as with the password it has, or who has a second factor of their own, is put in their team, and the seed's log names them with what to do, while the start goes on. Without the setting, a local copy has the one Admin `KONZILO_ACCOUNT` names, with the same password, key and `code` command as before.
- A site's demo content can hold a scheduled post, as a post dated ahead: a local copy in Compose starts with it scheduled for its moment, so that the editor lists it and the site publishes it then, and `npm run dev` and `npm run build` leave it out of the content folder they fill, and say so, naming each link and menu entry of the demo content that leads to it. The page for addresses not found is never scheduled, whatever its date. A site that makes its demo content through the intake gets a file for such a post by running it with `--now` after the post's moment.

### Changed

- `startPages()` gives a promise, which a site's start route returns from `getStaticPaths()`, as Astro takes one, or awaits where it reads the pages itself, and each page's props hold `entry`, the page an Admin chose as the start page, or null. A start route draws `entry` through `Body` where it is there, as a page's route draws its post and as the site template's does; one that draws only a start page of its own design shows that at `/`, while the chosen page has no page anywhere.
- Konzilo's `Body` takes a post's body as its slot alone, `<Body post={entry}><Content /></Body>`, and a slot that renders nothing, or none, is an empty body. The props `html` and `shown`, which it took in 0.4.0 to render a component's body inside its own, are gone: a site that gave it HTML of its own as `html` gives it as the slot, `<Body post={entry}><Fragment set:html={html} /></Body>`.
- Each table of a body, simple or structured, with a caption or without, stands in a box the core writes when it renders the body, `<div class="konzilo-table">`, so that a design can let a wide table scroll in its own box at a phone's width while the page does not, and a narrow one fill its column. Content files are unchanged. A site's styles that reach a table as a body's own child, `.body-text > table`, reach it now as `.body-text > .konzilo-table > table`; the site template's styles let a wide table scroll in the box. In the live preview the block's mark is on the box, and the Markdown alternate writes the table as before.
- The builder and the live preview install a site's dependencies at a start only when what they are installed from has changed since the last install that ended: the site's `package.json`, its lock and its `.npmrc`, what a package the site pins by a path holds, a release's package in the site's `vendor/` or what a core's checkout ships, and the Node they run on. A start with nothing changed runs no `npm`, needs no network and begins at once, while a change to the site's code still reaches both at their next start, and an install that failed or was stopped is made again at the next.

### Fixed

- The live preview runs a site's own `predev` script before its dev server starts, as `npm run dev` does and as a build runs `prebuild`, so that what a site makes before it starts, such as logos written from a design file, shows in the preview as it does on the public site.
- A site of some size has a search index again: `konzilo-search documents` ended before the builder had read all it wrote, so that through a pipe on Linux the documents were cut at about 146 kB, the builder could not read them, and the release had none. It, and `konzilo-intake` when its guard stops it or its check breaks, now end only once what they wrote has been taken.
- A local copy whose admin port changes after its first start can still be signed in to: the seed keeps the editor's OAuth client at the admin host's address at every start, as it keeps the live preview's at the preview's, each with its client ID, so the editor's configuration stays as it was. Forgejo's webhook is kept at the service for editors the same way, so that a changed `KONZILO_PEER_EDITORS` or port moves the one hook rather than leaving one at the old address, whose every delivery fails, beside a new one. A copy whose addresses have not changed sees nothing changed.
- A body's post lists are evaluated in the order they are written, those inside a site's components at any depth among them, so that a list that leaves out the posts shown leaves out what the lists written above it showed, the same at every build: a list below a section that holds a list, and lists in sections side by side, no longer show each other's posts. A list in a component that shows nothing of its body counts in its place all the same.
- An embed's placeholder and the cookie declaration say the same of what a service stores: the placeholder says that a service may store data in the browser only where its facts list what it stores, and otherwise only who receives data about the visit. YouTube, Loom, Spotify, Acast, Apple Podcasts, Speaker Deck, Datawrapper and CodePen, whose providers' documents name nothing their players store, no longer have a placeholder that says they may store data.
- A site comes up on a machine without Forgejo's image while `codeberg.org`'s registry refuses it under load: Compose pulls Forgejo from `data.forgejo.org`, which serves the same image by the same digest.
- The Compose guide says where Forgejo keeps its settings: `app.ini`, with the keys it generated, is in the volume `forgejo-data`, where the vendor's image writes it. The volume `forgejo-config`, which nothing wrote to, is gone. A site brought up before keeps its accounts, repositories and settings, and may remove its empty `<site>_forgejo-config` with `docker volume rm`, since Compose no longer does.
- A click in the body field while the live preview's page is still loading, in the pane or in its window of its own, no longer leaves an error in the browser's console in Safari and Firefox.
- A site description the checker refuses stops a build and a dev server at once with the checker's own problems, each by its path in the description, rather than with a fault of something held against it, such as a component the site gives for a directive the description declares.
- The site template's 404 page renders the chosen page's body through Konzilo's `Body`, as every other page does, so that a post list in it is shown by its presentation and a component by the site's component, rather than as the core's plain rendering.
- `llms.txt` names the section of a built-in type, a page, an article or a canvas, by its plural label in the content's language, where it wrote `## [object Object]`.
- A site description read by a relative path, such as `site-description.json` from the site's own folder, now finds the components it takes from a package (`componentsFrom`, `componentChecks`), as when it is read by an absolute path, instead of refusing every element of those components.

## [0.4.0] – 2026-11-12

### Added

- A site can take its components and the check of what they hold from a package, such as its design system's, instead of declaring them itself, give them labels of its own in each language its editors work in, and declare components of its own beside them.
- A site's component with a body is given it as a tree as well, in the prop `content` beside its default slot, with the live preview's marks on its blocks, so that a design can lay a component out by what it holds without reading its HTML. A component that passes the props it does not take on to its root leaves `content` out of them, or Astro writes it there as `content="[object Object]"`.

### Fixed

- A site's components look in the live preview as they do on the public site, a component inside another too: the mark that leads a click on it to its block in the form stands on the component's own root, where the component places it from the prop `data-konzilo-block` or the preview puts it, rather than in a wrapper that a design's child selectors could not see past.

## [0.3.0] – 2026-11-12

### Added

- The live preview opens in a browser tab of its own at its address, for anyone who may see it: a visit leads through Forgejo's sign-in, without a word for someone already signed in there, and back to the page asked for, where the site's links and the browser's history work as they do for a visitor. Someone who may not see it is told that the site's Admins can give access, someone removed from the site loses it within ten minutes, and a preview that has stopped starts at the visit, with a short notice until the page is ready.
- Every page of the live preview in a tab of its own has a small toolbar that says whether the page is published, a draft or scheduled, and when, in the reader's own time zone, and, for someone who may edit, links to its post's form in the editor, a term's page to its term's and the 404 page to the post chosen for it; it starts in the bottom right corner, can be dragged anywhere with a mouse or a finger, or moved with the arrow keys, tucks into a tab on the left or right edge, and stays where it was put in that browser.
- Each form's submissions are mailed to its recipients, in the language of the page the form was sent from, once an Admin turns mail on and names a mail server on a new Mail page in the editor, where the Admin also gives each form's recipients; mail is off until then, spam is never mailed, and a local copy writes each mail to its log instead of sending it, until a server sets `KONZILO_MAIL_TO_LOG` to `false`. The saved password is asked for again whenever the mail server, its port or the username changes, and a mail that could not be sent is said on the Mail page in the editor's language, with the mail server's reply.
- Each form's submissions are kept for the number of days an Admin sets beside its recipients on the Mail page, 30 until then, and spam for seven, after which the site erases them by itself.
- An Admin finds a person's submissions by what they wrote, such as their email address, in every form, on a new Personal data page in the editor, and downloads them as a CSV file for the person or erases them, as privacy law asks; an erased submission shows on no page and in no download after, and nothing of it stays in the site's data.
- The live preview shows every saved post, whatever its status: a draft and a scheduled post have their page there, and stand in the post lists and the recommended reading that will hold them once published, while the public site shows neither until it is. A saved post the site cannot publish leaves the rest of the preview as it is, and a visit to its page in a tab of its own says what to change.
- A Reviewer role, for people who must read what is coming without changing anything, such as a chief executive or a legal adviser: a Reviewer has an account of their own with a second factor, signs in to the live preview in a tab of its own and sees there what an Editor sees, and is told on the editor's sign-in that the account reads the preview only. A Reviewer can save, publish or change nothing: Forgejo refuses what they push, and a build refuses whatever reaches the site's source by them all the same, keeping what was published.

### Changed

- A form's recipients and retention are set on the Mail page and kept by the site's service, no longer in the Forms group of the site settings, which keeps each form's confirmation text.

### Fixed

- A site run with Compose answers its feeds at their addresses, where the web server answered 404.
- The build and the editor's pages for Admins know every team of the site's organisation, where they read only the first fifty, so that an Admin or an Editor in a later team was not known as one.

## [0.2.0] – 2026-11-11

### Added

- Search in a site run with Compose: Typesense in its own network, an index of what each build publishes, and the site's search page asking it through the web server, with a key no page holds.
- A site repository can keep fictional demo content of its own in `demo-content/`, which a local copy starts from in place of the core's, with `npm run dev`, `npm run build` or Compose, and which a build for a public host refuses as it refuses the core's.
- A meta line between an article's standfirst and its body, with its date, its category and its authors, written by a format with variables that an Admin sets for each type in each language in the site settings; a page or a type of the site's own shows one once an Admin gives it a format.
- A site's forms are taken: a visitor's message is sent with JavaScript or without, the form says it was sent, and the site keeps it with its fields' labels and its page's language, never the visitor's address, while spam is held apart and too many messages from one place are refused. The site template has a contact form on a page of its demo content.
- Admins and Editors read each form's submissions, newest first and without spam, on a Submissions page in the editor, in its interface language, and download a form's as a CSV file with commas or semicolons, which opens in a spreadsheet with no value taken as a formula; the page and the file give each moment in the reader's time zone, and name it.

### Changed

- An article's, a page's and a canvas's title tag puts the site's separator, set under Search and sharing, between its headline and the site's name, as every other title tag does, where it put a vertical bar; and the site settings no longer offer a title tag or sharing title template for a type with a teaser, which its teaser decides.
- The structured data type a post has decides what it is: a kind of article, chosen for a page or a type of the site's own too, makes the post an article in its sharing tags and its structured data. Each type offers its own structured data types, in the site settings and in the post's form: an article Article, BlogPosting and NewsArticle, a page and a canvas every one the core knows, and a type of the site's own those its site description lists.
- A page and a canvas have a date, which an editor may change under the status, and a teaser, as an article has, and a canvas has a name in breadcrumbs: their forms follow the article's order, with no publishing row, and a page's date and last change reach its sitemap entry, feeds, lists ordered by date, search, structured data and `llms.txt`, which lists pages newest first.

### Fixed

- A value written in one of the editor's closed bars, such as a post's title tag under Search, its structured data type, or a setting in a group of the site settings, is kept at Save where the post's file or the settings file held nothing of that bar yet, where it was lost without a word; a bar opened and left still adds nothing to the file.
- The site settings in the editor show each setting's default where the site has not set it, such as freshness of related posts switched on and a half-life of 90 days, where they showed a switch off and an empty number; a setting left untouched, or set back to its default, stays out of the settings file, so it follows the default.

## [0.1.0] – 2026-11-11

### Added

- The content format: a site's posts, terms, menus, settings and media as plain files, described in `content-format.md`, and a site description that declares the content model and is checked as it is read.
- Three built-in post types, a canvas, a page and an article, with the article's parts as fields of their own, and three built-in taxonomies for it: authors, category and topics.
- The intake, which writes the content files from the source files editors save, refuses what it cannot publish with its reason in the editor's language, and warns of what it publishes otherwise than written.
- An Astro integration that builds a whole site from the content files: post lists with their presentations and pages, the recommended reading under an article, ranked by shared topics and freshness, breadcrumbs, a language switcher and `hreflang` on a site in several languages, search and sharing metadata, structured data, a sitemap, `robots.txt`, `llms.txt`, feeds, redirects and a lightbox.
- Editing in Sveltia CMS: a post's form in field groups, a body field for text, images, galleries and embeds, a structure field for a type built of nested components, an image library, an authors field, and a live preview beside the form that draws the page again after each change.
- Publishing through Forgejo: a save becomes a commit, a build and a release, with scheduled posts, a publish status on each post and a Publishing page.
- An interface in British English and Swedish, chosen by each editor, with every text an editor or a visitor reads in catalogues, which a site can give its own of.
- Consent for analytics and other services, with Matomo's tracker and tag manager, as markup, a browser client, and a script for pages Konzilo does not build.
- A site's own components, declared in its site description and checked by a module of its own.
- A site template and `bin/new-site`, which make a site repository with fictional demo content, and a Compose project that runs Forgejo, Sveltia, the live preview and the builder on one machine.
