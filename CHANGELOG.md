# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A menu's entry may have a line of description, which an Admin writes under the entry's address in the menu's form and a site's design gets from `siteMenu()` as `description`, to show under the entry as a large menu does: one line of plain text, of at most 160 characters.
- A form field's label can hold links, written as Markdown links in the site description, such as `I have read the [privacy policy](/privacy-policy/)` for an acceptance line, each to an address a menu's entry may have: the form draws the link in the field's label, and a submission, its mail, its CSV and the Submissions page show the label's words without it.
- A post list's presentation is given what the whole list holds beside the posts of its page, in the prop `list`: the list's type with its label and plural, how many posts the list matches on all its pages, the terms of those posts in each of the type's taxonomies with how many hold each and the address of each term's page, and the search page's address. A presentation that filters can draw rows of terms and say how many posts it shows of how many, the same on every page. `listedPosts()` gives the same as the property `list` of the posts it returns.
- A term's page is told, beside its term and posts, its taxonomy's name and label in `taxonomy`, the taxonomy and the term it settles in `settled`, and what its whole list holds in `list`, as a post list's presentation is given it, its type null where several types take the taxonomy. A presentation that filters can leave out the row the page settles, send the term along with a search from the page, and say how many posts the term holds.
- The search page narrows by terms as a list's filter sends them, each taxonomy by its name with its terms' slugs, `?topics=rivers&topics=lakes`: the terms of one taxonomy by or and the taxonomies by and, every post of them when no words are given. It keeps them in its form and in its links to the other pages, and its status says what it searched within, "3 results for “lantern” in Rivers or Lakes and in News".
- A form can have a button text of its own in the site description, `button`, one text or, on a site in several languages, one in each, in place of the site's word for sending. Where the form lists `button` under `editable`, an editor changes the text where the form is placed, `::form{name="contact" button="Book the assessment"}`, or in the structure editor's box for the form; the intake refuses such a text where the form does not allow it. A site whose own form component (the site template's `src/components/Form.astro`) passes on only `name` must pass on `button` too for an editor's text to show.
- Each of the core's programs finds Forgejo, Typesense, the service's two roles and the live preview, and its own credentials and work folder, by settings whose defaults are where Compose puts them, so that a hosting layer or a site can arrange the same programs otherwise, on other machines or several in one container; the service's two roles can be held to the loopback, and Forgejo's webhook let reach another host. Compose sets none of them and runs as before. The Compose guide lists them under *What another arrangement sets*.
- A local copy can hold several people, one in each role: `KONZILO_PEOPLE` in the site's `.env` lists them, each `name:role` with the role `admin`, `editor` or `reviewer`, such as `anna:admin,ebba:editor,rut:reviewer`. Each gets an account with the password in `local-secrets/account-password`, or a secret of their own, `account-password-<name>`, a second factor of their own and the team of their role, and `docker compose run --rm code <name>` prints a person's code. A start adds whoever the list names to a copy seeded before, moves a person whose role has changed, and removes no one. Without the setting, a local copy has the one Admin `KONZILO_ACCOUNT` names, with the same password, key and `code` command as before.

### Fixed

- A click in the body field while the live preview's page is still loading, in the pane or in its window of its own, no longer leaves an error in the browser's console in Safari and Firefox.
- A site description the checker refuses stops a build and a dev server at once with the checker's own problems, each by its path in the description, rather than with a fault of something held against it, such as a component the site gives for a directive the description declares.

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
