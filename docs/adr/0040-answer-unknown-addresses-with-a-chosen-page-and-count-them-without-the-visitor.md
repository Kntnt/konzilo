# ADR 0040: Answer unknown addresses with a chosen page, and count them without the visitor

**Date:** 2026-11-02 · **Status:** Accepted. Settled by Thomas on 2026-10-29: the page is chosen in the site settings and written in the editor, with no address of its own; `404` and `410` answer with it; the log holds the address, a count and the last time asked, and no IP address, user agent or referrer; entries expire within 30 days; an Admin makes a rule from the log with a button. On 2026-11-02 he confirmed that it is written in Crepe. The rest is a technical choice; Thomas may veto.

## Decision

- **The setting,** in the group `notFound`, holds one published post of a type with an address, by ID.
- **The chosen post.** The intake writes its title and body as `content/not-found.md`, the one entry of the collection `notFound`, and leaves it out of its type's collection. So it has no address: its own, old and other addresses answer as unknown; a link to it is written as its text, with a warning; a menu entry for it is left out, with a warning; and it is in no list, feed, sitemap, Markdown alternate or search.
- **Without a page that can serve,** the template's plain text in the site's language serves, and the build warns. Unlike a refused post, a refused page for addresses not found keeps no version published before.
- **Answered everywhere.** Astro builds the page as `404.html`, and the web server answers every address the order of addresses leaves to `404` with it and `404`, and a rule's `404` or `410` with it and its status, but below `/_konzilo/`. On a site in several languages each language has its own (ADR 0042).
- **The log.** The web server logs the public hosts' `404` answers with the path, without its query, and the time alone: its filter deletes the request and the answer before the line is written. Every five minutes these are folded into counts, in a file outside the repositories. Only `GET` and `HEAD`, paths of at most 300 characters, nothing below `/_konzilo/`, and at most 5,000 addresses, the least recently asked going first. An entry goes 30 days after it was last asked for, and at the fold after a file of the release holds it. The counts are in no backup or archive; a restore begins without them, and an erasure takes the post's addresses out.
- **The page,** *Addresses not found*, for Admins, has *Redirect…*, *Answer 410* and *Hide*. An address a rule holds leaves the page at once.

## Why

- An editor writes the page, and the site's design shows it.
- Leaving the page out of its collection keeps it out of everything at once, with no filter to forget.
- Filtering in the web server means no IP address is ever written, not even for a moment.

## Considered and rejected

- **The page kept in its collection with a flag.** Every design would have to filter it out.
- **A full access log, filtered afterwards.** IP addresses would be written first.
- **Counting through the service.** Every `404` would run a program, and scanners would flood it.
