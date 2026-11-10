# ADR 0062: Give an article its parts as the core's fields, and fall back by one set of rules

**Date:** 2026-11-10 · **Status:** Accepted. Settled by Thomas on 2026-11-10: the parts are named as Kntnt names an article's parts; the standfirst exists only in an article, and the lede is body text with no field; a category is one or none; whether breadcrumbs end with the page itself is a choice per type, off by default; the article's form follows the article. Which types are built in, and whether an article's parts are fixed, is open. The rest is a technical choice; Thomas may veto.

## Decision

- **The parts are fields of the core's own,** beside `date`, `image` and `excerpt`: `breadcrumb`, the name in breadcrumbs; `eyebrow`, `headline` and `subheadline`, the headline in its three parts; `standfirst`; and `teaser`, `{ image: { src, alt }, headline, text }`, each part optional. Each text is plain, refused with HTML in it, and only `headline` and `standfirst` may be required. A type declares the parts it has, as it declares any field. The title stays: where a type has a main headline, the title is the post's working name, which lists, menus and breadcrumbs show.
- **The name in breadcrumbs is a field of its own,** no longer one of the search and sharing fields, so that a page has it without them.
- **Search, sharing and structured data are three groups of the source's own,** `search`, `sharing` with its image as `{ src, alt }`, and `structured`, each a key of the source file beside the post's fields, since the editor cannot place one object's fields in three places in a form. The intake writes the content file's one `seo` map as before, and refuses a source that still holds `seo`, so that nothing it says is lost without a word.
- **One module says what each part falls back to,** `article-parts.js`, which the editor and the build both import: the teaser's headline is its own, else the eyebrow, a colon and the main headline, else the title; its text is its own, else the standfirst; its image its own, else the main image. A title tag is cut at a word to fit, with the separator and the site's name, within 580 pixels of Arial 20 px bold, and a meta description within 920 pixels of Arial 14 px, as search results show them, by a table of Arial's advance widths read from the font files; a sharing title and description within 55 and 100 characters.
- **A post whose type has a teaser says in its head what its teaser shows,** before the type's templates: its title tag, meta description and sharing texts. Its structured data's headline is its main headline. A type without a teaser is as before.
- **A summary is the excerpt, else the teaser's text, else the standfirst,** and search shows a post by its main headline with that summary.
- **A taxonomy field may take `most`,** the most terms a post takes, which the intake and Astro's schema hold it to. With `most: 1` the editor offers one choice or none, and the source may hold the term's ID alone.
- **Whether a page's breadcrumbs end with the page itself is its type's setting,** `current` in the settings group `breadcrumbs`, off by default. `breadcrumbs()` keeps the page's own level, marked `hidden`, so that the structured data holds every level and a design whose narrow form counts on the level can keep it; `Breadcrumbs` leaves it out, and shows nothing where only the start page would be left.

## Why

- An article's parts each have a name in Kntnt's terms, and a site that names them itself names them differently every time. Fields of the core's own let the core say what each falls back to, and let a design style what it is given rather than place it.
- One module for the editor's placeholders and the site's head means a placeholder never promises what the site does not do.
- A search result and a shared link show the teaser, so a type with a teaser has said what they should show.
- The build has no browser to measure a title in, so the widths are a table, the same in the editor and the build.
- A page right under the start page has a trail of the start page alone, which says nothing.

## Considered and rejected

- **A canonical address per post.** ADR 0046 rejects it (Thomas).
- **The parts as a site's own fields.** Each site would name them, and the core could not fall back between them.
- **The groups inside one `seo` object in the source.** The editor would have to show them together.
- **Dropping the page's own level when it is not shown.** The structured data and a design's narrow form need it.

## Consequences

- A content file's `seo` map no longer holds `breadcrumb`, and a source file holds the three groups, not `seo`: a source saved before is refused until it is saved again. The core has no release yet, so no site meets this.
- Which types are built in, an article among them with its parts fixed, is open; until then a type with a teaser is treated as one where its head is concerned.
- Who an article's authors are, for its structured data and its byline, needs a way to say which taxonomy names them, which waits for that decision.
