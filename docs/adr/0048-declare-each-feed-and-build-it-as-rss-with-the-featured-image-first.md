# ADR 0048: Declare each feed, and build it as RSS with the featured image first

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: summary or whole text, the number of posts, and the image first. The rest is a technical choice; Thomas may veto.

## Decision

- **Declared:** `"feed"` on a type with a `date` field and an `address`, a path from the root ending in `/`; on a taxonomy, the same with `{slug}` once, never as the last segment, and only when a type with a date and an address takes the taxonomy. No feed lies below `/_konzilo/` or `/_astro/`, and no two share an address. A post at a feed's address is refused.
- **The group `feeds`:** `item`, the summary (default) or the whole text; `posts`, 10 by default.
- **Built by Astro,** on the public site alone, moved to `index.rss` in the address's folder; a term's feed exists for each term a published post of those types carries. Posts are newest first, ties by their file's path. Posts marked `noindex` stay.
- **The document** is RSS 2.0: the channel's `title` is the site's title, with ` – ` and the type's plural label where more than one type has a feed, or the term's name; `link`; `description`; `language`; `lastBuildDate`, the newest item's date; `atom:link` `rel="self"`. Each item has `title`, `link`, `pubDate`, `guid` `<origin>/?p=<ID>` with `isPermaLink="false"`, a `category` per term, `description` and, in whole-text mode, `content:encoded`, and `media:content`.
- **The featured image** is a JPEG on white, 1200 pixels wide or the master's width, and opens both `description` and `content:encoded`.
- **The body** is Astro's own rendering, made feed-safe: every `href`, `src`, `srcset`, `cite` and `poster` absolute from the post's address; an embed's panel a paragraph with its link; a directive's plain rendering its body alone, a post list nothing; no `script`, `style`, `template`, `iframe`, `style` attribute or event handler.
- **Discovery:** every page's head links its type's feed. **Served** as `application/rss+xml; charset=utf-8`, with and without the last slash.
- **Per language,** each language has every feed after its prefix, holding that language's posts alone, and each address without a prefix is a `301` to the main language's.

## Why

A guid by the post's stable ID keeps readers from seeing a moved post as new.

## Considered and rejected

- **Feeds derived automatically per type.** They would invent addresses.
