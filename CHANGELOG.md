# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
