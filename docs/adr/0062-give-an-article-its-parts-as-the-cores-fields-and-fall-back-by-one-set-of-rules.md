# ADR 0062: Give an article its parts as the core's fields, and fall back by one set of rules

**Date:** 2026-11-10, amended 2026-11-10 · **Status:** Accepted. Settled by Thomas on 2026-11-10: the parts are named as Kntnt names an article's parts; the standfirst exists only in an article, and the lede is body text with no field; a category is one or none; whether breadcrumbs end with the page itself is a choice per type, off by default; the article's form follows the article. Settled by Thomas on 2026-11-10 too: three built-in types, canvas, page and article, the article's parts fixed by Kntnt's model of an article, each optional to fill in but the main headline, and three built-in taxonomies for it, authors, category and topics, whose shape a site cannot redeclare. The rest is a technical choice; Thomas may veto.

## Decision

- **The parts are fields of the core's own,** beside `date`, `image` and `excerpt`: `breadcrumb`, the name in breadcrumbs; `eyebrow`, `headline` and `subheadline`, the headline in its three parts; `standfirst`; and `teaser`, `{ image: { src, alt }, headline, text }`, each part optional. Each text is plain, refused with HTML in it, and only `headline` and `standfirst` may be required. The built-in article has them all; a type of the site's own declares the parts it has, as it declares any field. The title stays: where a type has a main headline, the title is the post's working name, which lists, menus and breadcrumbs show.
- **The name in breadcrumbs is a field of its own,** no longer one of the search and sharing fields, so that a page has it without them.
- **Search, sharing and structured data are three groups of the source's own,** `search`, `sharing` with its image as `{ src, alt }`, and `structured`, each a key of the source file beside the post's fields, since the editor cannot place one object's fields in three places in a form. The intake writes the content file's one `seo` map as before, and refuses a source that still holds `seo`, so that nothing it says is lost without a word.
- **One module says what each part falls back to,** `article-parts.js`, which the editor and the build both import: the teaser's headline is its own, else the eyebrow, a colon and the main headline, else the title; its text is its own, else the standfirst; its image its own, else the main image. A title tag is cut at a word to fit, with the separator and the site's name, within 580 pixels of Arial 20 px bold, and a meta description within 920 pixels of Arial 14 px, as search results show them, by a table of Arial's advance widths read from the font files; a sharing title and description within 55 and 100 characters.
- **A post whose type has a teaser says in its head what its teaser shows,** before the type's templates: its title tag, meta description and sharing texts. Its structured data's headline is its main headline. A type without a teaser is as before.
- **A summary is the excerpt, else the teaser's text, else the standfirst,** and search shows a post by its main headline with that summary.
- **A taxonomy field may take `most`,** the most terms a post takes, which the intake and Astro's schema hold it to. With `most: 1` the editor offers one choice or none, and the source may hold the term's ID alone.
- **Three types are built in,** `canvas`, a blank page, `page`, a canvas with the site's header and footer, and `article`, a page with the article parts fixed, each in `src/format/built-in-types.js`, the one place that says what they are and which fields hold an article's authors, its category and its topics. A site uses one by naming it among its types, and gives it what it gives a type of its own but its fields: its collection, address, feed, elements, body editor and search setting, whether it is hierarchical, which only a page and a canvas may be, and a label and plural of its own, where it wants them, in place of the core's from the catalogues. A canvas has the search and sharing fields; a page the name in breadcrumbs too; an article the date and the last change, the main image, the name in breadcrumbs, the headline in its three parts, the standfirst, `authors`, `category`, at most one, `topics`, the teaser and the search and sharing fields, the main headline alone required. A site may add fields of its own, which come before the search and sharing fields; one named as a field of the core's is refused, whether declared again, left out with `false` or `null`, or one the type does not take, such as `excerpt` on an article. The read form gives the type its fields in full and names it in `builtIn`, null on a type of the site's own, so that everything that reads a type's fields reads a built-in one as it is.
- **Naming the article brings its taxonomies,** `authors`, `category`, hierarchical, and `topics`, in the collections `authors`, `categories` and `topics`, each held by the article's field of its name. A site may give each an address, a feed and a label of its own, and nothing of its shape. An author is a term of `authors`: its name, its slug and its biography, the term's description. On a site without an article, a taxonomy of one of these names is the site's own.
- **Whether a post is an article is whether its type is the built-in article** (`isArticle()`). Its head, its search and sharing fields in the editor and its summary follow its parts, and so do those of a post of the site's own type that has a teaser, as before (`followsParts()`). What the core tied to a type named `page`, the default of a part per type, the posts a setting chooses among and the page for addresses not found, follows the built-in page.
- **A template is told a post's built-in type,** by `builtInType(entry)` from `@kntnt/konzilo/astro/helpers`, null for a type of the site's own; the site template's layout draws a canvas without its header and footer.
- **Whether a page's breadcrumbs end with the page itself is its type's setting,** `current` in the settings group `breadcrumbs`, off by default. `breadcrumbs()` keeps the page's own level, marked `hidden`, so that the structured data holds every level and a design whose narrow form counts on the level can keep it; `Breadcrumbs` leaves it out, and shows nothing where only the start page would be left.

## Why

- An article's parts each have a name in Kntnt's terms, and a site that names them itself names them differently every time. Fields of the core's own let the core say what each falls back to, and let a design style what it is given rather than place it.
- One module for the editor's placeholders and the site's head means a placeholder never promises what the site does not do.
- A search result and a shared link show the teaser, so a type with a teaser has said what they should show.
- The build has no browser to measure a title in, so the widths are a table, the same in the editor and the build.
- A page right under the start page has a trail of the start page alone, which says nothing.
- An article with the same parts on every site means an editor learns its form once, a design styles the same parts everywhere, and the core can say who wrote an article and what it is about without guessing from a site's fields.
- Naming a built-in type by its name, rather than by a key on a type of any name, means one name for one thing, and no site with two articles.

## Considered and rejected

- **A canonical address per post.** ADR 0046 rejects it (Thomas).
- **The parts as a site's own fields.** Each site would name them, and the core could not fall back between them.
- **The groups inside one `seo` object in the source.** The editor would have to show them together.
- **Dropping the page's own level when it is not shown.** The structured data and a design's narrow form need it.
- **A site that declares the core's fields of a built-in type,** as it declares its own. Every site would repeat the same list, and could leave a part out.
- **A key that makes a type of any name the article,** such as `"builtIn": "article"`. Two names for one thing, and a site could declare two articles.
- **The built-in taxonomies' names kept from every site.** A site without an article, a product catalogue, may well want a category of its own.

## Consequences

- A content file's `seo` map no longer holds `breadcrumb`, and a source file holds the three groups, not `seo`: a source saved before is refused until it is saved again. The core has no release yet, so no site meets this.
- A site's own type with a teaser keeps the fallbacks it had, and one without is as before.
- An article's authors are the terms of its `authors`, which its structured data and a byline can name; its category and topics are what related posts can be chosen by.
- The site template's site description and demo content are on the built-in types, its tags now topics. The core has no release yet, so no site needs a way across.
