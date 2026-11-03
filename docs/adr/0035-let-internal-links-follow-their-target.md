# ADR 0035: Let internal links follow their target

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas: an editor chooses an internal link by search, and it follows its target when the target's address changes (2026-10-27); links keep *Open in new tab* and *nofollow*, written as raw HTML (2026-10-29). The rest is a technical choice; Thomas may veto.

## Decision

- **Each type declares where its posts are:** `"address": "/pages/{slug}/"`, a path from the site's root. No two types share an address. A type without one has no page of its own.
- **An editor chooses a link by search,** in the field, from the service's list of titles, which holds drafts too. In source it is `[text](konzilo:<id>)`.
- **The intake writes it as an ordinary Markdown link to the target's public address,** a path from the site's root: `[the guide](/a-guide/)`. Every build reads every post, so a target's new address reaches every page that links to it at the next build. Launch changes no content file.
- **A link whose target has no page now is written as its text alone, and the post is published with a warning:** "the site shows "the menu" without its link until "The menu" is published". The reference stays in source, so when the target is published again, the link comes back by itself. A post is not held back by another, so two posts that link to each other publish in either order.
- **A reference to what no page shows is refused:** a term of a taxonomy without an address, a file, or a post of a type without an address.
- **The resolution is one module:** a post's public address, whether the site publishes a post, and what a reference leads to now. Menus and settings resolve through it.
- **A link with `target` or `rel`** is raw `<a href target rel>` around Markdown text, its attributes in that order with their values as given, `&` and `"` written as references. A link with neither is a Markdown link. `target` may only be `_blank`. `rel` may hold the words `noreferrer`, `noopener`, `nofollow`, `sponsored` and `ugc`, each once. Both are rule data, matched as given, and anything else is refused in plain words. A raw link's text takes the fallbacks of text outside a link, since GFM autolinks inside raw tags. In a pipe table's cell, a `|` in a value is `&#124;`. A raw link is never an embed. Menu entries take neither.

## Why

- Linking within the site is among the commonest things an editor does, and a site must not lose links or search ranking when an address changes.
- A path from the site's root holds on the pre-launch address and on the customer's domain alike.
- The text alone: a visitor never meets a link to a page that is gone, and the editor is told where and why.
- Writing values as given converts nothing silently, and search engines read `sponsored` and `ugc`.

## Considered and rejected

- **Writing the address the editor saw when linking.** The link breaks the first time its target's address changes.
- **Refusing the linking post while its target is not published.** Unpublishing one post would make every post that links to it fail.
- **Keeping the target's last address.** The link leads to a page that is gone, and nobody is told.
- **Rebuilding `rel` from two toggles.** It silently drops what is there.
- **A site-wide new-tab rule** (Thomas).
