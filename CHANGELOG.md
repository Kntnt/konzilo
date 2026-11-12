# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- The live preview opens in a browser tab of its own at its address, for anyone who may see it: a visit leads through Forgejo's sign-in, without a word for someone already signed in there, and back to the page asked for, where the site's links and the browser's history work as they do for a visitor. Someone who may not see it is told that the site's Admins can give access, someone removed from the site loses it within ten minutes, and a preview that has stopped starts at the visit, with a short notice until the page is ready.
- Each form's submissions are mailed to its recipients, in the language of the page the form was sent from, once an Admin turns mail on and names a mail server on a new Mail page in the editor, where the Admin also gives each form's recipients; mail is off until then, spam is never mailed, and a local copy writes each mail to its log instead of sending it.
<<<<<<< HEAD
- The live preview shows every saved post, whatever its status: a draft and a scheduled post have their page there, and stand in the post lists and the recommended reading that will hold them once published, while the public site shows neither until it is. A saved post the site cannot publish leaves the rest of the preview as it is, and a visit to its page in a tab of its own says what to change.
=======
- A Reviewer role, for people who must read what is coming without changing anything, such as a chief executive or a legal adviser: a Reviewer has an account of their own with a second factor, signs in to the live preview in a tab of its own and sees there what an Editor sees, and is told on the editor's sign-in that the account reads the preview only. A Reviewer can save, publish or change nothing: Forgejo refuses what they push, and a build refuses whatever reaches the site's source by them all the same, keeping what was published.
>>>>>>> spec-51

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
