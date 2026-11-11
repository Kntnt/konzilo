# ADR 0046: Generate search and sharing metadata from templates an Admin edits

**Date:** 2026-10-29, amended 2026-11-10 and 2026-11-11 · **Status:** Accepted. Settled by Thomas on 2026-10-29: Konzilo's own fields; templates in the manner of Slim SEO; site-wide values in the editing tool, not in the site description; per-post overrides; `noindex` and `nofollow`. Settled by Thomas on 2026-11-10: a canonical address per post, under Search, which lifts the rejection of a canonical override; and an article's authors as its author in the structured data, in the order the editor gave them, each a `Person`, or the publisher where it has none. The rest is a technical choice; Thomas may veto.

## Decision

- **Templates:** per post type with an address and for the start page, the title tag, the meta description, the sharing title and description, and per post type a structured data type, in the settings group `search`. They are in `{{ … }}` syntax with Slim SEO's variable names. Defaults: the title tag `{{ post.title }} {{ sep }} {{ site.title }}`, for the start page `{{ site.title }}`; the meta description `{{ post.auto_description }}`, for the start page `{{ site.description }}`; the sharing texts those without the site's name; the structured data type `Article` for the built-in article, `WebPage` for another type.
- **Variables:** the site's title and description, the separator and the current year in every template; the post's title, summary, excerpt, date and modified date, a field of the site's own, a taxonomy's terms and the type's label in a type's, each only when the type declares what it reads. One the part does not know is refused, and the settings are refused whole.
- **Site-wide values:** the separator, `–`; the site's description; the default sharing image; and the publisher, an organisation or a person, with its name, the site's title by default, organisation number, postal address, email, telephone and profiles.
- **Per post:** `"seo": {}` among a type's fields gives one object, `title`, `description`, `canonical`, `socialTitle`, `socialDescription`, `socialImage`, `socialImageAlt`, `schema`, one of the rule data's `structuredDataTypes`, and `noindex` and `nofollow`, holding only what is set. An editor sees them in three groups, search, sharing and structured data, and a source file holds them so, each group a key of its own ([ADR 0062](0062-give-an-article-its-parts-as-the-cores-fields-and-fall-back-by-one-set-of-rules.md)). The name in breadcrumbs is a field of its own, `breadcrumb`. A post whose type has a teaser falls back to what its teaser shows before the templates (ADR 0062). `"modified": {}` adds the last change.
- **A canonical address:** `search.canonical` in the source, a whole `http://` or `https://` address, with a host and no user name, and no space; the intake refuses anything else, naming the field, and writes it as a browser sends it into `seo.canonical`. The editor's field takes the same pattern, and shows the post's own address on the public site while it is empty, from the type's address and the slug as the editor types, in the language of its pane; a post below another, whose parents' slugs the form does not hold, says in words that its own address applies.
- **Rendering:** `Head.astro`, which the layout places, writes the tags beside the icons' links, and last one JSON-LD `@graph`. The canonical link and `og:url` are the post's canonical address where it names one, else its public address on the public host; a later page of a list's pages is canonical to itself, a page the original has not got. The graph keeps the page's own address, which its `@id`s are made from. `<meta name="robots">` is written only when asked for. `og:type` is `article`, with the dates, for an article, a post of the built-in article, whatever its structured data type, else `website`. X's card is `summary_large_image` with an image and `summary` without.
- **A template** renders each variable as its value, one without a value as nothing, collapses spaces and drops a separator left at either end or beside another. A date is the page's language's long date in UTC.
- **The summary** is the excerpt, whole, else the start of the body as plain text, without footnotes, code, images and embeds, cut at a word to at most 160 characters with `…`; one function, which feeds and `llms.txt` use too.
- **The sharing image** is the post's own, else its featured image, the default sharing image, the logo, then none, 1200 × 630, cropped to fill, as a JPEG on white.
- **The graph** holds, each with a stable `@id`: the `WebSite`, `<origin>/#website`; the publisher, `<origin>/#publisher`, with `sameAs`, `taxID` for the organisation number and `vatID`; the page, `<page address>#webpage`, of its structured data type where that is a kind of web page; for an article `<page address>#article`, of its structured data type where that is a kind of article, `Article`, `BlogPosting` or `NewsArticle`, else `Article`, with its authors as its author, in the order the editor gave them, else the publisher, and the publisher as its publisher, and the same node for a post of another type whose type an Admin gives a kind of article, with the publisher as its author; each of its authors, `<origin>/#author-<slug>`, a `Person` with its name and, where the authors have pages, its page's address as `url` ([ADR 0062](0062-give-an-article-its-parts-as-the-cores-fields-and-fall-back-by-one-set-of-rules.md)); and the sharing image. A value the site has not got is left out.
- **Sitemap and robots.txt:** the integration's own routes, written by every build and answered by the dev server; a file of the site's own at either address fails the build. A preview has neither. `/sitemap.xml` lists the start page and every published post of a type with an address; a `noindex` post leaves it, and so does a post whose canonical address is not its own on the public host, which is no `hreflang` alternate in the sitemap or a head either; no redirect is in it. `lastmod` is `modified`, else `date`. Beyond 50,000 addresses it is an index of `/sitemap-1.xml` and on. `/robots.txt` allows every address to every crawler and names the sitemap. Other parts add their lines through one list.

## Why

Visitors meet what Konzilo builds (ADR 0043), and templates in the manner of Slim SEO are Thomas's choice.

A canonical address per post (Thomas, 2026-11-10):

- A text published in two places competes with itself in search. A copy that names its original as canonical credits it, and search engines show the original.
- Search engines read a page that names another as canonical as a copy, so a sitemap that listed it, or an alternate that named it, would contradict its own head. Only canonical pages are listed, and named as alternates.
- A shared link takes `og:url`, so it credits the same address as search does.
- A whole address alone, since a path would be read on whichever host shows the page, a preview's too, and a post that should answer at another address of the site has other addresses and redirects (ADR 0036).

Whether a post is an article (Thomas, 2026-11-10):

- A post is an article when its type is the built-in article, where the head and the structured data ask it, as everywhere else ([ADR 0062](0062-give-an-article-its-parts-as-the-cores-fields-and-fall-back-by-one-set-of-rules.md)). A date says only that a post has a moment, which a type of the site's own may have for an event or a release as well.
- An article's structured data type names what kind of article it is, so an Admin who names its type's pages a kind of web page does not take away its authors.
- A structured data type an Admin gives a type of the site's own is that Admin's choice, which the graph keeps; such a post has no authors, so its author is the publisher.

An article's authors as `Person` (Thomas, 2026-11-10):

- Search engines credit an article to the people its structured data names as its author, and those who wrote it are its authors, not the publisher.
- In the order the editor gave them, since the first author is the main one, as the byline shows them.
- An author's `@id` is made from its slug, which every language shares, so that each article names the same person by the same node, on a site in several languages too, whether or not the authors have pages, and when a site gives them pages later.
- An article without authors still names someone as its author, the publisher, as search engines ask of an article.

## Considered and rejected

- **Templates in the site description.** Thomas wants them edited in the editing tool.
- **A canonical address that is a path on the site.** A post's other addresses and the redirect rules already lead from one address of the site to another.
- **`@astrojs/sitemap`,** which the dev server does not serve.
- **The organisation number as `iso6523Code`,** which needs each country's scheme code and fits an organisation alone.
- **An author's `@id` from its page's address.** An author without a page needs one too, and its node would change name when the authors get pages.
