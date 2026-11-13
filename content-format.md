# Konzilo's content format

A site built on Konzilo keeps its published content as plain files: Markdown with YAML frontmatter for each post, JSON for its terms, menus, settings and redirect rules, and an image file for each picture it shows. The *intake* writes them into the site's *content folder*, `content/` in the site repository, and Astro builds the site's pages from them. This document describes those files, the *content files*, for a reader who knows Markdown, YAML and JSON but not Konzilo, so that a developer, or another content management system, can read and write them.

It says what the format is. Why it is so is in Konzilo's decisions, the ADRs in `docs/adr/` of the core's repository.

What the intake writes is the *exact form*: another tool that writes content files should write it, byte for byte. The site's *reader*, which Astro reads the files with, takes more; [Written against read](#written-against-read) says what.

## Its version

This document is part of Konzilo's npm package, `@kntnt/konzilo`, and its version is the package's, the core's version in the `package.json` beside it: it describes the files that core writes and reads. A site installs the package at the core's version it pins, and a site's handover package carries it, so each site carries the description of the format its own core writes. The content files carry no version of their own.

- A change that makes an existing content file read otherwise, or refused, is a major change of the core, and comes with a new major version.
- A new element, field or file is a minor change.

Every change to the format changes this document in the same change. The core's tests hold the two in step: they fail when the core knows a block, an inline element, an embed service, a field, a type of field or setting or a kind of file that this document does not name, and when an example here is not what the core writes and reads.

## The examples

Every example is of the site description in [The site description](#the-site-description), a site in British English with articles and pages, but those of [Several languages](#several-languages), which gives its own.

- An example headed by a path, such as `articles/opening-hours.md`, is a whole file at that path in the content folder.
- An example of a body alone, with no frontmatter, is the body of a page, `pages/example.md`, whose file starts with these lines and a blank line:

  ```markdown
  ---
  title: "Example"
  date: 2026-11-03T12:00:00Z
  modified: 2026-11-03T12:00:00Z
  ---
  ```

- An example is in the exact form unless the text before it says otherwise. One with an image is followed by the HTML the site's reader renders of its body.

In this document's source, each example's info string marks it for the core's tests: `site-description` for a site description, `site=<name>` for an example of another than the first, `file=<path>` for a whole file, `body` for a body alone, `read` for one followed by its rendering (`html rendered`), `reader-only` for a form only the reader takes, and `tour` for [Every element in one file](#every-element-in-one-file).

## The content folder

Each kind of file has its path. The placeholders are a collection's folder, `<collection>`, named in the site description; a post's slug, `<slug>`, its address's last segment in lowercase letters, digits, hyphens and underscores; a hierarchical post's path, `<path>`, its ancestors' slugs from the top and its own, joined by `/`; a language's tag, `<tag>`, such as `sv-SE`; a menu's name, `<menu>`; and a master's name, `<name>`.

| Path | What it holds |
|---|---|
| `<collection>/<slug>.md` | A post, in the collection of its type ([A post's file](#a-posts-file)). |
| `<collection>/<path>.md` | A post of a hierarchical type, such as a page below another, `pages/about-us/team.md`. |
| `<collection>/<tag>/<slug>.md`, `<collection>/<tag>/<path>.md` | A post on a site in several languages, in the folder of its language ([Several languages](#several-languages)). |
| `<collection>/<slug>.json` | A term of a taxonomy, in the taxonomy's collection ([A term](#a-term)). |
| `<collection>/<tag>/<slug>.json` | A term on a site in several languages, once in each language a post uses it in. |
| `menus/<menu>.json` | A menu the site description declares ([A menu](#a-menu)). |
| `menus/<tag>/<menu>.json` | A menu on a site in several languages, once in each language. |
| `settings.json` | The site settings ([The site settings](#the-site-settings)). |
| `settings/<tag>.json` | The site settings on a site in several languages, once in each language. |
| `consent.json` | The service registry ([The service registry](#the-service-registry)). |
| `redirects.json` | The site's own redirect rules ([The redirect rules](#the-redirect-rules)). |
| `start.<type>.md` | The start page an Admin chose, a post of the type named `<type>`, on a site in one language ([The start page](#the-start-page)). |
| `not-found.md` | The 404 page ([The 404 page](#the-404-page)). |
| `not-found/<tag>.md` | The 404 page in another language than the main one, on a site in several languages ([The 404 page](#the-404-page)). |
| `media/<name>.webp`, `media/<name>.svg` | A master, an image as the site shows it ([Masters](#masters)). |
| `.post-ids.json` | Which post each post's file is ([The post IDs](#the-post-ids)). |

### What a build writes, adds and removes

- **Every build writes every file again**, and the same content always gives the same bytes: a file whose content has not changed is left as it was, so the content repository's history changes only where the content does. Every build writes the site settings' files, `consent.json`, `redirects.json` and each declared menu's files, but where it refuses the settings or a menu, whose last file then stays.
- **A post's file comes and goes with its post.** A build writes the file of each post the site publishes: published, its date come, of a declared type. It owns every post's file in a collection's folder, and the start page's at the root, and removes each one it did not write: a post that left the site, and a post that moved to another path, whose old file goes, as the start page's does when another is chosen, or none. A file another tool puts there is taken off by the next build.
- **A refused post keeps its last file.** A post the site cannot publish, such as one holding an element the site cannot write, is *refused*: it gets no new file, and the file it was last published with stays as it was, the one `.post-ids.json` names for it. A post in a language the site does not declare keeps none.
- **A term's file and a master go when nothing names them.** A term's file stays while a post's file names the term, or a term below it; a master stays while a content file names it.
- **The rest is left alone:** a menu the site description no longer declares keeps its file, which the site no longer reads; a file in a folder that is neither a collection's nor `media/` is never touched; and nor is a file or a folder whose name starts with a dot, but `.post-ids.json`.
- **A build that would take most posts off the site stops** until it is confirmed.

## The site description

The site description, `site-description.json` in the site repository, declares the site's content model. As far as it decides the content files:

- **`language`**, a locale such as `en_GB`, or **`languages`**, several, the main one first, which put each post into a language's folder ([Several languages](#several-languages)).
- **`types`**, the post types: the core's built-in `canvas`, `page` and `article`, each by its name ([The built-in types](#the-built-in-types)), and any of the site's own, each by a name of the site's own. Each has its `collection`, the folder of its files; its `address`, where visitors reach a post, a path from the site's root ending in `{slug}/`, or in `{path}/` for a hierarchical type, and none for a type whose posts have no page of their own; `hierarchical`, whether its posts have parents; `elements`, the body elements its posts may hold, by their names in the rule data ([The body](#the-body)); and `fields`, what its frontmatter holds after the title, in that order ([A post's file](#a-posts-file)). A type of the site's own may list `structuredDataTypes`, the structured data types its posts may have, each once, its default first, such as `["BlogPosting", "Article"]`; one that lists none offers what a page offers. A type's `feed`, and a taxonomy's, the address of an RSS feed the site builds, holds no file, but a post at a feed's address is refused.
- **`taxonomies`**, each with its `collection`, the folder of its terms' files, and `hierarchical`, whether its terms have parents. A taxonomy's `address`, such as `/category/{slug}/`, or with `{path}/`, its parents' slugs and its own, in a hierarchical one, gives each term that has a file a page there, the site design's; it holds no file of its own, but a post at a term's page's address is refused, and links, menu entries and rules may lead to the page. A taxonomy without one has no pages.
- **`presentations`**, the ways the site's design shows a post list, each with its options, which a post list in a body takes as attributes ([Post lists](#post-lists)).
- **`menus`**, each a file of its own, and **`settings`**, the site's own settings, in the order `settings.json` holds them; on a site in several languages a text setting that declares `"translated": true` has a value in each language.
- **`forms`**, which a form in a body names ([Forms](#forms)), with each form's `editable`, the texts an editor may change where it is placed, and each of whose confirmation text `settings.json` holds, and **`consent`**, the site's departures from the consent rules, which `consent.json` holds, and `domain`, the domain the consent choice is kept on for every site below it, which the consent's own storage in `consent.json` names.
- **`images`**, the widths an image is checked against, which decide which images the site refuses, not how a file names them.
- **`components`**, the site's own components, each a directive a body may hold beside the core's elements, **`componentsFrom`**, the components it takes from a package, with **`componentLabels`**, the labels it gives them, and **`componentChecks`**, the module that checks what they hold ([A site's own components](#a-sites-own-components)).

What the description declares for the editors alone, such as `interfaceLanguage`, a type's `label` and `plural`, and a field's `label` and `control`, is not described here; nor are `security`, a form's fields and its own `button` text, which decide no content file.

### The built-in types

Three post types are the core's own, and a site uses one by naming it among its `types`: `canvas`, a blank page; `page`, a canvas with the site's header and footer; and `article`, a page with the parts of an article. A site gives a built-in type what it gives a type of its own, but its fields and its structured data types: its `collection`, `address`, `feed`, `elements`, its body's `editor` and `search`, `hierarchical` for a page and a canvas alone, and a `label` and `plural` only where it wants its own in place of the core's. Its fields are the core's, in this order:

| Type | Its fields |
|---|---|
| `canvas` | `date`, `modified`, `breadcrumb`, `teaser`, `seo` |
| `page` | `date`, `modified`, `breadcrumb`, `teaser`, `seo` |
| `article` | `date`, `modified`, `image`, `breadcrumb`, `eyebrow`, `headline`, `subheadline`, `standfirst`, `authors`, `category`, `topics`, `teaser`, `seo` |

A canvas and a page offer every structured data type, `WebPage`, `AboutPage`, `ContactPage`, `CollectionPage`, `Article`, `BlogPosting` and `NewsArticle`, `WebPage` their default, and an article the kinds of article, `Article`, `BlogPosting` and `NewsArticle`, `Article` its default.

Every post of a built-in type is published at a moment, its `date`, and has its last change, `modified`. A page and a canvas have the article's parts that name and show a post, the name in breadcrumbs and the teaser, and none of its others. An article's main headline, `headline`, is required, and every other part optional. A site may give a built-in type fields of its own, under `fields`, which its posts' files hold after the core's and before `seo`. A field named as one of the type's own is refused, whether declared again or left out with `false` or `null`, and so is one named as another field of the core's, such as `excerpt` on an article.

Naming `article` brings three built-in taxonomies, each held by the article's field of the same name: `authors`, whose terms are the article's authors, each with its name and its biography, the term's `description`; `category`, hierarchical, of which an article takes one or none, as with `"most": 1`; and `topics`. Their collections are `authors`, `categories` and `topics`. A site may give each, under `taxonomies` by its name, an `address`, a `feed`, and a `label` and `plural` of its own, and nothing of its shape. On a site without an article, a taxonomy by one of these names is the site's own.

The site description every example in this document is of:

```json site-description
{
  "language": "en_GB",
  "images": { "smallestWidth": 400, "displayWidth": 1280 },
  "types": {
    "article": {
      "collection": "articles",
      "address": "/{slug}/",
      "elements": ["paragraph", "heading", "list", "quote", "code", "table", "footnotes", "embed", "image", "gallery", "post-list", "form"],
      "fields": {
        "readingTime": { "label": "Reading time", "type": "integer", "control": "number" },
        "rating": { "label": "Rating", "type": "number", "control": "number" },
        "featured": { "label": "Featured", "type": "boolean", "control": "toggle" },
        "eventDay": { "label": "Event day", "type": "date", "control": "date" },
        "size": { "label": "Size", "type": "string", "control": "select", "options": ["small", "large"] }
      }
    },
    "page": {
      "collection": "pages",
      "hierarchical": true,
      "address": "/pages/{path}/",
      "elements": ["paragraph", "heading", "list", "quote", "code", "table", "footnotes", "embed", "image", "gallery", "post-list", "form"]
    },
    "canvas": {
      "collection": "canvases",
      "address": "/landing/{slug}/",
      "elements": ["paragraph", "heading", "list", "image", "gallery", "post-list", "form"]
    }
  },
  "presentations": {
    "list": {
      "label": "List",
      "options": {
        "date": { "label": "Date", "type": "boolean", "control": "toggle" },
        "excerpt": { "label": "Excerpt", "type": "boolean", "control": "toggle" }
      }
    },
    "cards": {
      "label": "Cards",
      "options": {
        "columns": { "label": "Columns", "type": "string", "control": "select", "options": ["2", "3", "4"] }
      }
    }
  },
  "menus": {
    "main": { "label": "Main menu" }
  },
  "settings": {
    "footerText": { "label": "Footer text", "type": "string", "control": "textarea" },
    "openingDay": { "label": "Opening day", "type": "date", "control": "date" },
    "seats": { "label": "Seats", "type": "integer", "control": "number" },
    "ticketPrice": { "label": "Ticket price", "type": "number", "control": "number" },
    "showOffer": { "label": "Show the offer", "type": "boolean", "control": "toggle" },
    "contactPage": { "label": "Contact page", "type": "post", "control": "post" },
    "heroImage": { "label": "Hero image", "type": "image", "control": "image" }
  },
  "forms": {
    "contact": {
      "label": "Contact us",
      "button": "Send the message",
      "editable": ["button"],
      "fields": [
        { "name": "email", "label": "Email", "kind": "email", "required": true },
        { "name": "message", "label": "Message", "kind": "textarea", "required": true }
      ]
    }
  }
}
```

A type of the site's own may take a built-in taxonomy, on a site that names `article`, by a field of terms that names it, as it takes a taxonomy of its own: `"topics": { "taxonomy": "topics" }`. Its posts name the same terms as the articles, whose files are in the taxonomy's collection, and where the taxonomy has an `address`, a term's page lists the posts of each type that takes it. These examples are of a site whose events take the articles' topics:

```json site-description=events
{
  "language": "en_GB",
  "images": { "smallestWidth": 400, "displayWidth": 1280 },
  "types": {
    "article": {
      "collection": "articles",
      "address": "/{slug}/",
      "elements": ["paragraph"]
    },
    "event": {
      "label": "Event",
      "plural": "Events",
      "collection": "events",
      "address": "/events/{slug}/",
      "elements": ["paragraph"],
      "fields": {
        "topics": { "taxonomy": "topics" }
      }
    }
  },
  "taxonomies": {
    "topics": { "address": "/topic/{slug}/" }
  }
}
```

```markdown file=events/lantern-night.md site=events
---
title: "Lantern night"
topics: ["harbours","lanterns"]
---

Every lantern on the quay is lit at dusk.
```

```json file=topics/harbours.json site=events
{
  "name": "Harbours"
}
```

```json file=topics/lanterns.json site=events
{
  "name": "Lanterns"
}
```

## A post's file

A post is one Markdown file with YAML frontmatter. Its path names it: its type's collection, then its slug, or its path in a hierarchical type, then `.md`; the start page an Admin chose is at the content folder's root, named by its type ([The start page](#the-start-page)).

### The bytes

- UTF-8, with a line feed ending each line.
- `---` on a line of its own, the frontmatter, one key on each line, `---` again, one blank line, the body, and one final newline. A post with an empty body is the frontmatter alone, ending in `---` and its newline.
- One blank line between the blocks of the body, never two, and no space or tab at the end of any line.

```markdown file=articles/opening-hours.md
---
title: "Opening hours"
date: 2026-10-20T08:00:00Z
modified: 2026-10-21T09:30:00Z
headline: "Open every day"
authors: []
category: ["news"]
topics: []
featured: false
oldAddresses: ["/hours/"]
otherAddresses: [{"address":"/open/","answer":301}]
---

Open every day, from 10 to 18.

Closed on **midsummer's eve**.
```

### The frontmatter

The keys come in this order, each on one line: `title`; then each field the type declares, in the order declared, or, in a built-in type, the core's fields in their order with the site's own before `seo` ([The built-in types](#the-built-in-types)); then `translationKey`, `oldAddresses` and `otherAddresses`, each only when the post has one. A field without a value is left out, unless the table says otherwise. Every value is written so that YAML reads it as meant: a text, a list and an object as JSON, which YAML reads alike, on one line; a number and `true` or `false` as YAML's own; a moment and a day unquoted, so that YAML reads them as dates.

| Key | Declared as | Written as |
|---|---|---|
| `title` | Every post has it. | The title as visitors read it, as a JSON string: `"Harbour lights & lanterns"`. No markup. |
| `date` | `"date": {}` | When the post was published, to the second in UTC, unquoted: `2026-10-20T08:00:00Z`. Always there. |
| `modified` | `"modified": {}` | When the post last changed, as `date`. Always there. |
| `excerpt` | `"excerpt": {}` | The post's own summary, a JSON string without spaces at its ends. Plain text. |
| `image` | `"image": {}` | The featured image, an article's main image: `{"src":"../media/<name>","alt":"…"}`, its master ([Masters](#masters)) and its alt text, which it never goes without. |
| `breadcrumb` | `"breadcrumb": {}` | The post's name in breadcrumbs in place of its title, a JSON string without spaces at its ends. Plain text. |
| `eyebrow`, `headline` and `subheadline` | `"headline": { "required": true }` | An article's headline in its three parts: the eyebrow above it, the main headline, and the subheadline under it, each a JSON string without spaces at its ends. Plain text. Only the main headline may be required. |
| `standfirst` | `"standfirst": {}` | An article's standfirst, between its headline and its body, a JSON string without spaces at its ends. Plain text. |
| `teaser` | `"teaser": {}` | What shows the post elsewhere, in a list or a search result, as one JSON object, each part only when the post sets it: `image`, as the featured image is written; `headline`; and `text`. Plain text. No key when the post sets none. |
| the terms of a taxonomy | `"regions": { "taxonomy": "region" }` | The slugs of the post's terms, each once, sorted, as a JSON list: `["harbours","lanterns"]`, `[]` for none; each names a term's file ([A term](#a-term)). A required field, `"required": true`, is never empty, and one with `"most": 1`, or another whole number, holds at most that many. An article's `authors`, `category` and `topics` are such fields, of the built-in taxonomies of their names, `category` with at most one. An article's `authors` alone is not sorted, and keeps the order the editor gave them, its first author first: `["ben-holm","ada-lind"]`. |
| `seo` | `"seo": {}` | The search and sharing fields the post sets, as one JSON object, in this order, each only when set: `title`, the title tag; `description`, the meta description; `canonical`, the post's canonical address where it names one, a whole `http://` or `https://` address as a browser sends it, such as the original's where the text was published elsewhere first; `socialTitle` and `socialDescription`, for a shared link; `socialImage`, a master as the featured image's `src`, with `socialImageAlt`, its alt text; `schema`, a structured data type, one of `Article`, `BlogPosting`, `NewsArticle`, `WebPage`, `AboutPage`, `ContactPage` and `CollectionPage` that its type offers, of which the intake leaves out, with a warning, one its type does not offer; and `noindex` and `nofollow`, `true` when set. No key when the post sets none. |
| a field of the site's own | `{ "type": … }` | By its `type`, below. |
| `translationKey` | Not declared. | On a site in several languages: 16 lowercase hexadecimal digits that a post shares with its translations ([Several languages](#several-languages)). |
| `oldAddresses` | Not declared. | The addresses the post had before, which redirect to it, sorted, as a JSON list ([Old and other addresses](#old-and-other-addresses)). |
| `otherAddresses` | Not declared. | Other addresses that lead to the post, each with its answer, a redirect's status or `"show"`, sorted by address: `[{"address":"/open/","answer":301}]`. |

A field of the site's own is written by its type:

| Type | Written as |
|---|---|
| `string` | A JSON string without spaces at its ends: `"A night on the quay"`. A field shown as a `select` holds one of its `options`. |
| `number` | A number: `4.5`. |
| `integer` | A whole number: `7`. |
| `boolean` | `true` or `false`, always there. |
| `date` | A day, unquoted: `2026-11-05`. |

An article that sets every field. Its body renders as the HTML after it.

```markdown file=articles/harbour-lights.md read
---
title: "Harbour lights & lanterns"
date: 2026-10-20T08:00:00Z
modified: 2026-10-21T09:30:00Z
image: {"src":"../media/harbour-lights-e978159ef2.webp","alt":"A lantern on the quay at dusk"}
breadcrumb: "Harbour lights"
eyebrow: "The quay"
headline: "Why the harbour keeps its lanterns lit"
subheadline: "A night with the keepers"
standfirst: "The lanterns have burned every night for two hundred years."
authors: ["ben-holm","ada-lind"]
category: ["local"]
topics: ["harbours","lanterns"]
teaser: {"image":{"src":"../media/harbour-lights-5c0ffee5a1.webp","alt":"Two keepers by a lantern"},"headline":"The keepers of the lanterns","text":"Two hundred years of light."}
readingTime: 7
rating: 4.5
featured: true
eventDay: 2026-11-05
size: "large"
seo: {"title":"Harbour lights","description":"Why the lanterns stay lit.","socialImage":"../media/harbour-lights-a7b543496f.webp","socialImageAlt":"Lanterns along the quay","schema":"NewsArticle"}
oldAddresses: ["/harbour-light/"]
otherAddresses: [{"address":"/campaign/","answer":302},{"address":"/lights/","answer":"show"}]
---

The lantern keeps the harbour.
```

```html rendered
<p>The lantern keeps the harbour.</p>
```

A page has its date and its last change, as every post of a built-in type has, and a teaser and a name in breadcrumbs where it sets them. A page below another sits in its parent's folder:

```markdown file=pages/about-us.md
---
title: "About us"
date: 2026-05-01T08:00:00Z
modified: 2026-05-01T08:00:00Z
---

Who we are.
```

```markdown file=pages/about-us/team.md
---
title: "Team"
date: 2026-05-01T08:00:00Z
modified: 2026-05-01T08:00:00Z
---

Who does what.
```

```markdown file=pages/privacy.md
---
title: "Privacy policy"
date: 2026-05-01T08:00:00Z
modified: 2026-05-01T08:00:00Z
---

What we keep, and for how long.
```

## The body

The body is Markdown, as GFM, GitHub's Markdown, writes it, with raw HTML where Markdown has no form, and a directive for a component. It is a sequence of top-level blocks, one blank line apart. Each body element has a name in the rule data, `src/format/rules.json` in this package; a post type takes the elements its `elements` list ([The site description](#the-site-description)), and a file whose body holds any other is refused. The names, which this section gives with each element:

| Body element | Its name |
|---|---|
| [Paragraphs](#paragraphs) | `paragraph` |
| [Headings](#headings) | `heading` |
| [Lists](#lists) | `list` |
| [Quotes](#quotes) | `quote` |
| [Code blocks](#code-blocks) | `code` |
| [Simple tables](#simple-tables) and [structured tables](#structured-tables) | `table` |
| [Footnotes](#footnotes) | `footnotes`, with the footnote marks in the text |
| [Embeds](#embeds) | `embed` |
| [Images](#images) | `image` |
| [Galleries](#galleries) | `gallery`, each image an `image` |
| [Post lists](#post-lists) | `post-list` |
| [Forms](#forms) | `form` |
| [A site's own components](#a-sites-own-components) | the component's name, or `<name>-directive` |

### Paragraphs

A paragraph is its text on one line, with the [inline elements](#inline-elements) and the [escapes](#escapes-and-fallbacks) below. A line break inside it is a backslash at the end of the line. Spaces at its ends are not written, and an empty paragraph is left out, as a page shows neither.

```markdown body
Hello world.

Two  spaces and a	tab stay, as typed.
```

### Headings

A heading is ATX, `##` to `######` and a space, at levels 2 to 6; level 1 is the page's title, never in the body. Its text takes the inline elements but the line break and the footnote mark. An anchor, which a link can lead to, is an empty raw `<a>` with its id before the text, of lowercase letters `a` to `z`, digits, hyphens and underscores; the site gives the heading that id. No two headings of a post hold one anchor, and none takes an id of the footnotes', `footnote-label` or one starting `user-content-fn`, since a link to it would land elsewhere.

```markdown body
## <a id="the-start"></a>The start

### Getting there

#### Level 4

##### Level 5

###### Level 6
```

### Lists

A bulleted item starts with `- `, a numbered item with its number, counted from 1, and `. `. A list is tight, no blank line inside it. An item's text is one paragraph; a line after a line break in it, and a list nested in it, are indented by the width of the item's own marker, two for `- `, three for `1. `, four for `10. `. Nothing follows a nested list in an item. A list right after a list of its kind takes the other marker, `*` after `-` and `1)` after `1.`, and back, so that the two stay apart. A numbered list always starts at 1.

```markdown body
- Fruit
  - Apple
  - Pear
- Vegetables\
  in season

1. Prepare
   - Wash
2. Cook

1) Serve
```

An item may be a task, its box after its marker: `[ ] ` for one not done, `[x] ` for one done, in a bulleted or a numbered list, and a list may hold tasks and plain items both. A plain item whose text begins as a box would is written with its brackets escaped, `\[ \]`. The site shows a task with a checkbox the visitor cannot change.

```markdown body read
- [ ] Is the camera allowed here?
- [x] Ask the board
- Keep the answer
```

```html rendered
<ul class="contains-task-list">
<li class="task-list-item"><input type="checkbox" disabled> Is the camera allowed here?</li>
<li class="task-list-item"><input type="checkbox" checked disabled> Ask the board</li>
<li>Keep the answer</li>
</ul>
```

An item's text may hold an image, as a list of logos does, or an image that is a link, its alt text then naming where the link leads. The image is its master, as a figure's ([Images](#images)), and never goes without its alt text.

```markdown body read
- ![The harbour office](../media/example-3f9a1c2b7d.webp)
- [![The lantern guild](../media/example-3f9a1c2b7d.webp)](/pages/about-us/)
```

```html rendered
<ul>
<li><img src="../media/example-3f9a1c2b7d.webp" alt="The harbour office"></li>
<li><a href="/pages/about-us/"><img src="../media/example-3f9a1c2b7d.webp" alt="The lantern guild"></a></li>
</ul>
```

### Quotes

A quote puts `> ` before each line of its blocks, paragraphs, headings, lists and quotes, and a lone `>` between them. Its citation, who said it, is its last paragraph, after a lone `>`, wrapped whole in raw `<cite>`; it takes the inline elements a heading takes.

```markdown body
> Words worth repeating.
>
> > Said first.
>
> <cite>Ada _Lovelace_</cite>
```

### Code blocks

A code block is fenced with backticks, at least three and more than any run of them in the code, with no info string: a code block has no language. The code is written as typed, with no escapes; spaces at the ends of its lines, and its final newline, are not. It holds text alone, and stands at the top level of the body, never in a quote or a list.

`````markdown body
```
npm ci
npm test
```

````
```
nested
```
````
`````

### Simple tables

A table with one header row, no caption, no footer and no merged cells is a GFM pipe table: a pipe at both ends of each row and one space either side of each cell's text, not padded to its column's width, an empty cell `|  |`. The delimiter row gives each column's alignment, `---`, `:---`, `:---:` or `---:`. A cell takes the inline elements a heading takes, and `\|` for a pipe in its text, a link's text or a link's address.

```markdown body
| Item | Note | Price |
| --- | :---: | ---: |
| Tent | Two \| three people | 120 |
|  | Spare | 5 |
```

### Structured tables

A table with a caption, a footer section or merged cells is an HTML table of one fixed shape: a line for each tag that opens or closes the table and its sections, a line for the caption and one for each row, and no blank line. The caption comes first, then `thead` with its one row of `th` cells, `tbody` and `tfoot`, each only when it has rows, every cell outside the header row a `td`. A cell's attributes are `colspan` and `rowspan`, each only when 2 or more, then `style="text-align: left"`, `center` or `right` when its column is aligned. A cell and the caption take the inline elements a heading takes, as HTML: `<strong>`, `<em>`, `<a href>`, `<sup>`, `<sub>`, `<code>` and `<del>`; a link's tag is a raw link's ([Inline elements](#inline-elements)), with `target` and `rel` where it has them. Their characters are written as typed, but `&` as `&amp;` and `<` as `&lt;`, and in an address `"` as `&quot;` too. Nothing in it is read as Markdown, so it takes no Markdown escapes.

```markdown body
<table>
<caption>What we <strong>packed</strong></caption>
<thead>
<tr><th>Category</th><th>Item</th><th style="text-align: right">Price</th></tr>
</thead>
<tbody>
<tr><td rowspan="2">Shelter</td><td>Tent &amp; pegs</td><td style="text-align: right">120</td></tr>
<tr><td><a href="https://example.com/?a=1&amp;b=2">A tarp</a></td><td style="text-align: right">5</td></tr>
</tbody>
<tfoot>
<tr><td colspan="2">Total</td><td style="text-align: right">125</td></tr>
</tfoot>
</table>
```

### Footnotes

A footnote is GFM's: its mark, `[^1]`, where it is referred to, and its text after the body's last block, `[^1]: …`, one blank line apart. They are numbered 1, 2, 3 in the order of their marks, each marked once. A footnote's text takes the inline elements a paragraph takes, but the footnote mark; a line after a line break in it is indented four spaces. A mark stands in a paragraph, a list's item or a quote, never in a heading, a table or a link's text.

```markdown body
Bees dance[^1] to show the way[^2].

- Nectar[^3]

[^1]: The waggle dance.

[^2]: Towards food, as **the** guide at [example.com](https://example.com/guide) says\
    on its second line.

[^3]: And pollen.
```

### Embeds

Content from another service, such as a video, is its address alone in a paragraph, bare, or in angle brackets, `<…>`, where a bare address would not read back whole. The site shows such a paragraph as the service's player, which loads nothing until the visitor asks for it, when a service of the rule data takes the address in one of its forms; an embed of any other address is refused. A link alone in a paragraph whose text is such an address stays a link: its text is split by the empty comment ([Escapes and fallbacks](#escapes-and-fallbacks)), so that it is no longer the address alone. The services, by their names in the rule data's `embeds`, and the forms of their addresses:

| Service | Its addresses |
|---|---|
| `youtube`, YouTube | A video, `https://www.youtube.com/watch?v=<id>`, with `&t=<seconds>` or not, or `https://youtu.be/<id>`, with `?si=…` and `t=<seconds>` or not; a short, a live video or an embed, `https://www.youtube.com/shorts/<id>`, `/live/<id>` or `/embed/<id>`; a playlist, `https://www.youtube.com/playlist?list=<list>`. `www.` may be `m.` or left out. |
| `vimeo`, Vimeo | `https://vimeo.com/<id>`, also below `channels/<channel>/` or `groups/<group>/videos/`, or with a private video's hash, `https://vimeo.com/<id>/<hash>`; or the player's, `https://player.vimeo.com/video/<id>`, with `?h=<hash>` or not. |
| `screen9`, Screen9 | The address in a video's embed code, `https://qcnl.tv/e/<token>` or `https://api.screen9.com/embed/<token>`, with `?ratio=<height by width>` or not. |
| `loom`, Loom | `https://www.loom.com/share/<id>` or `/embed/<id>`. |
| `spotify`, Spotify | `https://open.spotify.com/<kind>/<id>` of a track, an episode, a show, an album, a playlist or an artist, with `intl-<language>/` or `embed/` before the kind, or `?si=…` after it, or not. |
| `acast`, Acast | An episode: `https://shows.acast.com/<show>/episodes/<episode>`, `https://play.acast.com/s/<show>/<episode>` or `https://embed.acast.com/<show>/<episode>`. |
| `apple-podcasts`, Apple Podcasts | `https://podcasts.apple.com/<country>/podcast/<name>/id<show>`, with `?i=<episode>` or not. |
| `speaker-deck`, Speaker Deck | The address in a deck's embed code, `https://speakerdeck.com/player/<id>`. |
| `datawrapper`, Datawrapper | `https://datawrapper.dwcdn.net/<id>/`, with its version, `<id>/<version>/`, or not, or `https://www.datawrapper.de/_/<id>/`. |
| `codepen`, CodePen | `https://codepen.io/<user>/pen/<pen>`, or `/embed/`, `/full/` or `/details/`. |
| `linkedin`, LinkedIn | A post's address, `https://www.linkedin.com/posts/…-activity-<id>-…`, or `https://www.linkedin.com/feed/update/urn:li:activity:<id>`. |

The exact patterns are the rule data's. An embed has no caption.

```markdown body
https://www.youtube.com/watch?v=Kz3pQ8vXw1A

https://vimeo.com/76979871

https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT
```

A paragraph that is a link to a video, not the video:

```markdown body
[https<!-- -->://www<!-- -->.youtube.com/watch?v=Kz3pQ8vXw1A](https://www.youtube.com/watch?v=Kz3pQ8vXw1A)
```

### Images

An image is a Markdown image of its master ([Masters](#masters)) alone in a paragraph, its caption, when it has one, on the next line after a line break. The master's address climbs from the file's folder to the content folder's root: `../media/<name>` from a collection's folder, `../../media/<name>` from a folder below it. The alt text, which an image never goes without, is plain text, with `\`, `*`, `` ` ``, `[` and `]` always escaped. The caption takes bold, italic, inline code, superscript and subscript, and the escapes of a line's start.

The site shows such a paragraph as a figure:

```markdown body read
![A lantern on the quay](../media/example-3f9a1c2b7d.webp)\
The quay _at dusk_
```

```html rendered
<figure><img src="../media/example-3f9a1c2b7d.webp" alt="A lantern on the quay"><figcaption>The quay <em>at dusk</em></figcaption></figure>
```

### Galleries

A gallery is its images, each in the form of an image, on lines of their own in one paragraph, and its own caption, when it has one, on the last line. The line after an image is its caption, after a line break; or the next image, or the gallery's caption, after a plain newline.

```markdown body read
![A red barn](../media/example-faf546aae9.webp)
![A lake at dawn](../media/example-500a71b248.webp)\
At dawn
A farm in summer
```

```html rendered
<figure class="konzilo-gallery"><figure><img src="../media/example-faf546aae9.webp" alt="A red barn"></figure><figure><img src="../media/example-500a71b248.webp" alt="A lake at dawn"><figcaption>At dawn</figcaption></figure><figcaption>A farm in summer</figcaption></figure>
```

### Post lists

A post list, a list of posts the site picks at every build, is the leaf directive `::post-list{…}` alone on its line. Its attributes come in this order, each only when it is not at its default: `type`, the post type it lists, required; `include` and `exclude`, terms as `<taxonomy>:<slug>,<slug>`, taxonomies apart by a space; `where`, conditions on fields, `<field><op><value>` apart by `;`; `order`, `direction`, `offset` (0 by default) and `number` (10 by default, at most 100); `leaveOutThis` and `leaveOutShown` (`true` by default); `pages` (`false` by default), `true` for the one list in a post that has pages of its own, at the post's address and `<address>page/<n>/`; `presentation`, one the site description declares, required; `empty`, the text shown when no post matches; then the options of the presentations, in the order the site description declares them. [ADR 0039](docs/adr/0039-write-a-post-list-as-a-directive-evaluated-at-every-build.md) gives each attribute's values.

A body's lists are evaluated in the order they are written, those in a site's components at any depth among them, so a list that leaves out the posts shown leaves out the posts of its type that the lists written above it showed, wherever each stands. A list in a component counts in its place whether the component shows its body or not.

A list whose `order` is `related` takes no `direction`, and lists the posts that share a term with the post it sits in, as the recommended reading under a post ranks them ([ADR 0070](docs/adr/0070-rank-related-posts-by-shared-topics-and-category-times-a-freshness-that-halves.md)): in a list of articles, a point for each topic a post shares and half a point for the same category, its authors none; in a list of another type, a point for each term it shares, of any taxonomy. Each score is multiplied by the post's freshness, 2^(-age / half-life), its age from its date to the build and the half-life in days `related.halfLife` in the site settings ([The site settings](#the-site-settings)), unless `related.freshness` is `false`; a post without a date is not decayed. The highest comes first, then the newest, then by title, and a post that scores nothing is not listed. Since every post ages alike, the order is the same whenever the site is built.

```markdown body
::post-list{type="article" include="category:news" number="3" presentation="list" date="true"}

::post-list{type="article" order="title" presentation="cards" columns="3"}
```

The site's design shows a list by the presentation it names, a component that is given the posts of the page it shows, the presentation's options as the list sets them, the text for a list that matches nothing, the pager of a list with pages, and what the whole list holds, in the page's language: its type, how many posts it matches on all its pages, after its offset and what it leaves out, and the terms those posts hold in each of the type's taxonomies, each with how many of them hold it ([`docs/site-design.md`](docs/site-design.md#what-a-site-gives-the-integration)). Which rows of terms a list that filters shows is an option the site declares for its presentation. A taxonomy's key in a query, in such a row and on the search page, is the taxonomy's name, `category`, `topics` or `authors`.

A directive's name follows `::` for a leaf, a directive with no body, and `:::` for a container, which holds blocks, then a blank line, the blocks, a blank line and its closing fence, a colon more than any fence inside. Its attributes are `name="value"`, apart by a space, a value with `&`, `"` and `}` written as `&amp;`, `&quot;` and `&#125;`, and a line feed and a carriage return as `&#10;` and `&#13;`. The rule data registers each directive the core knows, the post list and the [form](#forms), and a site adds [its own](#a-sites-own-components); a directive neither registers reads as its text, and the intake escapes every colon that would begin one ([Escapes and fallbacks](#escapes-and-fallbacks)).

### Forms

A form, one of those the site description declares under `forms`, is the leaf directive `::form{name="…"}` alone on its line. Its attribute `name`, required, is the form's name; a file that names a form the site description does not declare is refused, naming the form; a post refused so keeps its last file, which the site shows without the form, and the site's build warns of it. What the form asks, its fields, and its texts are not in the file: the site shows the form the site description declares, as its design renders it; its button says the `button` text the description gives the form, one text or one by locale, or else the site's word for sending. Where the form lists `button` under its `editable`, a file may give the button a text of its own where it places the form, the attribute `button`, after `name`, some text other than white space, in the post's language; a file that gives it where the form does not list it is refused, naming the form, and the site shows the form's own text where a post's last file still gives one. `button` is the one text an editor may change yet. A field's label there may hold links, written as Markdown links, `I have read the [privacy policy](/privacy-policy/)`, and nothing else of Markdown, each to an address a menu's entry may have, as *A link's address* says of a body's; the form draws each link, one to a path on the site below the site's base as a body's is, and a submission, its mail and its CSV keep the label's words without them.

```markdown body
Write to us, and we answer within a day.

::form{name="contact"}
```

The contact form lists `button` under its `editable`, so a post may give it a text of its own:

```markdown body
Book a call, and we ring you within a day.

::form{name="contact" button="Book the call"}
```

### A site's own components

A site declares components of its own in its site description, under `components`, each by the name of its directive: its `label`, the name an editor reads; its `form`, `leaf`, a directive on a line of its own, or `container`, around blocks; its `body`, a leaf's `none` or `text`, a label in brackets after its name, or a container's `blocks`; and its `attributes`, each by its name in camelCase, with its `type`, `string`, `integer` or `boolean`, the `values` it takes or a `pattern` of them, its `default` or `required`, the `label` an editor reads, and the `refusal`, the site's words for a value it does not take, with `{value}` for the value. No component is named as the core's own directives, `post-list` and `form`.

A component is a body element by its name, or by `<name>-directive` where the core has an element of that name, as Markdown's list is `list`; a type's `elements` names it so, and the directive keeps the component's name. A leaf's label holds the inline elements of a heading. A container holds blocks, each an element the type takes, images and other components among them, a blank line after its opening fence and before its closing one, and its fence is one colon longer than the longest fence inside it. An attribute at its default is left out, the others are written in the order the site description declares them, and a value the component does not take is refused, in the site's words where it gives a `refusal`.

A site may take its components from a package, such as its design system's, by `componentsFrom`: a package specifier, `@` and a scoped package's name and then the path of a JSON file the package exports, such as `@example/design/directives/components.json`, or the path of a JSON file in the site repository, from its root. The file holds components as `components` does, and the site takes them whole: their names, forms, bodies and attributes are the package's. Under `componentLabels`, by a component's name, the site gives one it takes labels of its own: the component's `label`, and an attribute's under `attributes`, each one text for every language, or one by interface language over the package's, which need not give British English where the package gives it. The site's own components, under `components`, stand beside those it takes, after them. A name both declare is refused, and so are labels for a component or an attribute the package does not declare.

`componentChecks` names the JavaScript module that checks what a component holds beyond its attributes, by its path in the site repository, from its root, such as `component-checks.js`, or by a package specifier, such as `@example/design/directives/checks`: its export `componentProblems(name, attributes, blocks)` gives the reasons the site cannot publish a component, in words an editor reads, and the post is refused for each. A site with components of its own beside a package's names a module of its own, which may ask the package's. A package specifier is found from the site repository's root, as Node finds a `require()` of it there, in the `node_modules` of that folder and then of each folder above it, so a package exports each file under `default` or by a plain path.

A site with three components of its own:

```json site-description=components
{
  "language": "en_GB",
  "images": { "smallestWidth": 400, "displayWidth": 1280 },
  "components": {
    "section": {
      "label": "Section",
      "form": "container",
      "body": "blocks",
      "attributes": {
        "surface": { "type": "string", "label": "Surface", "values": ["page", "raised"], "default": "page" }
      }
    },
    "eyebrow": { "label": "Eyebrow", "form": "leaf", "body": "text" },
    "list": { "label": "Series", "form": "container", "body": "blocks" }
  },
  "types": {
    "page": {
      "collection": "pages",
      "address": "/{slug}/",
      "elements": ["paragraph", "heading", "list", "section", "eyebrow", "list-directive"]
    }
  }
}
```

A section on its raised surface, holding an eyebrow, a heading and a series:

```markdown body site=components read
::::section{surface="raised"}

::eyebrow[Opening _hours_]

## Every day

:::list

- From 10 to 18
- Closed on midsummer's eve

:::

::::
```

```html rendered
<div data-directive="section" data-surface="raised"><div data-directive="eyebrow">Opening <em>hours</em></div><h2>Every day</h2><div data-directive="list"><ul>
<li>From 10 to 18</li>
<li>Closed on midsummer's eve</li>
</ul></div></div>
```

The same components taken from a package that declares them, with their check, on a site in Swedish that gives two of them labels of its own:

```json
{
  "language": "sv_SE",
  "images": { "smallestWidth": 400, "displayWidth": 1280 },
  "componentsFrom": "@example/design/directives/components.json",
  "componentLabels": {
    "section": { "label": { "sv": "Sektion" }, "attributes": { "surface": { "label": { "sv": "Yta" } } } },
    "list": { "label": { "sv": "Serie" } }
  },
  "componentChecks": "@example/design/directives/checks",
  "types": {
    "page": {
      "collection": "pages",
      "address": "/{slug}/",
      "elements": ["paragraph", "heading", "list", "section", "eyebrow", "list-directive"]
    }
  }
}
```

### Inline elements

Within a block's text, by their names in the rule data's `inline`:

| Element | Its name | Written as |
|---|---|---|
| Bold | `strong` | `**bold**` |
| Italic | `em` | `_italic_`, or `*italic*` where a letter or a digit touches the run: `un*believ*able` |
| A link | `a` | `[text](address)`, or `[text](<address>)` when the address holds a space or a parenthesis; raw `<a>` when the link opens in a new tab or carries `rel`, below |
| Superscript | `sup` | Raw `<sup>2</sup>` |
| Subscript | `sub` | Raw `<sub>2</sub>` |
| A line break | `br` | A backslash at the end of the line |
| Inline code | `code` | `` `code` ``, between the shortest run of backticks the code does not hold, with a space inside each end where the code starts or ends with a backtick, or starts and ends with a space |
| Strikethrough | `s` | `~~struck~~` |
| A footnote's mark | `footnote` | `[^1]` ([Footnotes](#footnotes)) |

A non-breaking space is the character itself, U+00A0, never `&nbsp;`.

```markdown body
Some **bold**, _italic_, un*believ*able, `npm test`, ~~old~~ new, H<sub>2</sub>O and E = mc<sup>2</sup>.

It weighs 10 kg.\
On a line of its own.

The shell runs `` echo `date` `` first.
```

**A link's address** is `http://` or `https://`, `mailto:`, `tel:`, or a path on the site, `/…`, never `//`. A link to another post of the site is its target's current address, a path, and a link to a heading's anchor that address with `#<anchor>`; so is a link to a term of a taxonomy with an address, its page's current address.

```markdown body
Read [the guide](https://example.com/guide), [about us](/pages/about-us/), [our team](/pages/about-us/team/#the-start), [write](mailto:hello@example.com), [call](tel:+46701234567) or see [Lund](<https://example.com/wiki/Lund_(city)>).
```

**A link that opens in a new tab, or carries `rel`,** is raw `<a href="…" target="_blank" rel="…">` around its text, which stays Markdown, and `</a>`: `href`, then `target`, then `rel`, each only when the link has it, `&` and `"` in a value as `&amp;` and `&quot;`. `target` is `_blank` alone; `rel` holds one or more of `noreferrer`, `noopener`, `nofollow`, `sponsored` and `ugc`, each once, apart by a space.

```markdown body
Read <a href="https://example.com/guide" target="_blank" rel="noopener">the **guide**</a> first.

An <a href="https://example.com/" rel="nofollow sponsored">advertiser</a>.
```

### Escapes and fallbacks

A character is written as typed, with no smart punctuation, but where Markdown would read it as more. Then a backslash goes before it, as few as needed:

- `\`, `*` and `` ` `` always; `_` outside a word (`snake_case` stays);
- `&` before what reads as a character reference (`\&copy;`), and `<` before what reads as a tag (`\<b>`);
- at the start of a line, `#`, `>`, `-`, `+` and `*`, and the `.` or `)` after a number (`2024\. A year`);
- a colon that would begin a directive: before a name no colon follows, unless a colon comes right before it (`10\:30`, `a\:b`, but `:smile:` stays), and at a line's start before two or more colons (`\::x`).

Code, inline code and a structured table take none.

```markdown body
2\*3\*4, \`code\`, a back\\slash, snake_case and \_emphasis\_.

\&copy; but AT&T, and \<b>not bold\</b> but 1 < 2.

\# not a heading, at 10\:30.

2024\. A good year.
```

Where the minimal form does not read back as the content, the block takes a *fallback*, each level adding to those below it, the block's own alone:

1. **The empty comment.** What GFM would make a link of itself, an address or an email address in the text, is split by an empty HTML comment, which no page shows: `www<!-- -->.example.com`, `https<!-- -->://…`, `name<!-- -->@example.com`.
2. **Strict escaping.** `[`, `]`, `!`, `~` and `|` too, `=` and `-` at a line's start, a `#` that ends a heading, and every colon before a letter or a digit.
3. **Raw emphasis.** Bold and italic that Markdown cannot close as `**` and `_` are raw `<strong>` and `<em>`, and strikethrough raw `<del>`.

```markdown body
Visit www<!-- -->.example.com or mail hello<!-- -->@example.com.

The \~\~old\~\~ price and the \~new\~ one.

Plural <strong>"quote"</strong>s look odd.
```

## Masters

A *master* is an image as the site shows it, made from the original an editor uploaded, in the content folder's `media/`:

- **Its format.** A JPEG, PNG or still WebP becomes a WebP at quality 90, its longest side at most 2520 pixels, upright, in sRGB and without metadata. An SVG stays an SVG, checked and optimised, which the site shows as it is: no script, event handler, `javascript:` address, `foreignObject` or reference outside itself.
- **Its name**: a stem, a hyphen, the first ten hexadecimal digits of the original's SHA-256, and `.webp` or `.svg`. The stem of a post's image is the post's slug: `harbour-lights-e978159ef2.webp`. The stem of the site's logo is `logo`, of its icon `site-icon`, and of an image a setting chooses the setting's path in lowercase words joined by hyphens, `hero-image` for `heroImage`. The same original always gives the same name and the same bytes.
- **How a file names it**: by its address from the file's folder, `../media/<name>` in a post's file in a collection's folder, `../../media/<name>` one folder below, `media/<name>` in `settings.json`, `start.<type>.md` and `not-found.md`, at the content folder's root, and `../media/<name>` in `settings/<tag>.json` and `not-found/<tag>.md`.

## The JSON files

Every JSON file is written with two spaces of indent and one final newline, its keys in the order given here, as JavaScript's `JSON.stringify(value, null, 2)` writes it.

### A term

A term of a taxonomy is `<collection>/<slug>.json` in the taxonomy's collection: `name`, as visitors read it; `description`, plain text without spaces at its ends, only when it has one; and, in a hierarchical taxonomy, `parent`, its parent's slug, only when it has one. A build writes the file of each term a published post names, and of each term above it.

```json file=categories/news.json
{
  "name": "News",
  "description": "What happened."
}
```

```json file=categories/local.json
{
  "name": "Local news",
  "parent": "news"
}
```

```json file=topics/harbours.json
{
  "name": "Harbours"
}
```

```json file=topics/lanterns.json
{
  "name": "Lanterns"
}
```

An author is a term of the built-in taxonomy `authors`, its description its biography:

```json file=authors/ada-lind.json
{
  "name": "Ada Lind",
  "description": "Keeps the harbour's history."
}
```

```json file=authors/ben-holm.json
{
  "name": "Ben Holm"
}
```

### A menu

A menu the site description declares is `menus/<menu>.json`: `items`, its entries in order, each with `title`, its label; `url`, where it leads, a post's current address, a term's page's where its taxonomy has an address, or another address, and none for an entry that only holds others; `description`, a line under the entry, as a large menu shows it, only when it has one: one line of plain text, trimmed, of at most 160 characters, and never HTML; and `items`, the entries under it, only when it has any. An entry for a post or a term that has no page now is left out, with the entries under it.

```json file=menus/main.json
{
  "items": [
    {
      "title": "Home",
      "url": "/"
    },
    {
      "title": "About us",
      "url": "/pages/about-us/",
      "description": "Who we are, and how to reach us.",
      "items": [
        {
          "title": "Our team",
          "url": "/pages/about-us/team/"
        }
      ]
    },
    {
      "title": "Elsewhere",
      "items": [
        {
          "title": "Shop",
          "url": "https://shop.example.com/"
        }
      ]
    }
  ]
}
```

### The site settings

`settings.json` holds, in this order:

1. **The site's identity**, each only when it is set: `title`, the site's title; `logo`, `{ "src": "media/<name>", "alt": "…" }`, its alt text only when it has one; and `icon`, the site icon, `{ "src": "media/<name>" }`, square, from which every build makes the site's icons.
2. **The site's own settings**, each by its name in the order the site description declares them, by its `type`: a `string` as a string, a `number` and an `integer` as a number, a `boolean` as `true` or `false`, always there, a `date` as a day, `"YYYY-MM-DD"`, quoted; a `post`, the choice of a post, as `{ "title": "…", "url": "…" }`, the post's title and current address, left out while the post has no page; and an `image`, the choice of an image, as `{ "src": "media/<name>", "alt": "…" }`, as the logo. A setting without a value is left out.
3. **Konzilo's own settings groups** that apply to the site, each an object under its name: `search`, the search and sharing settings, with each type's templates and its structured data type, `schema`, under `types`, one its type offers, else its type's default, and no title tag or sharing title template, `title` and `socialTitle`, for a type with a teaser, whose teaser gives both; `metaLine`, the format of each type's meta line, `format`, by type, the article's by default, text with variables in braces, `{authors}`, `{date}`, `{modified}` and `{category}`, each a type has, and none where the type has no format, nor any part for the canvas; `breadcrumbs`, whether a page's breadcrumbs end with the page itself, `current`, by type; `ai`, AI visibility; `consent`, the consent texts; `tagManager`, what the public site loads to measure visits, `None`, `Matomo Tag Manager` or `Matomo`, Matomo's own tracker, with the instance's `address`, the `container`'s ID, the `site`'s ID in Matomo, the tracker's `cookieDomain` and `timeZone`, the site's time zone in Matomo by its IANA name, and who runs the instance, `provider`, each only once given; `legalPages`, the legal pages, each a choice of a post; `forms`, each declared form's confirmation text, by the form's name; `feeds`, what the site's feeds hold, `item`, `"The summary"` or `"The whole text"`, and `posts`, a whole number from 1; and `related`, on a site with articles or a taxonomy of its own, how related posts rank ([Post lists](#post-lists)): `freshness`, `true` or `false`, and `halfLife`, the days in which a post's freshness halves, a whole number from 1. The 404 page an Admin chooses is no setting here: it is `not-found.md`; nor is the start page: it is `start.<type>.md`. A group holds its settings, then its named parts, each an object under its name, then `types`, a part for each post type it applies to, by the type's name, which leaves out a setting that says nothing for the type, and the part of a type left with none. A setting with a default is always there. [`src/format/settings-groups.json`](src/format/settings-groups.json) describes each group's settings.

```json file=settings.json
{
  "title": "The Quiet Lantern",
  "logo": {
    "src": "media/logo-908319c58a.svg",
    "alt": "A lantern beside the words The Quiet Lantern"
  },
  "icon": {
    "src": "media/site-icon-f521d4c15b.svg"
  },
  "footerText": "Open every day.",
  "openingDay": "2026-05-01",
  "seats": 40,
  "ticketPrice": 12.5,
  "showOffer": true,
  "contactPage": {
    "title": "About us",
    "url": "/pages/about-us/"
  },
  "heroImage": {
    "src": "media/hero-image-dc2dd17407.webp",
    "alt": "The harbour at night"
  },
  "search": {
    "separator": "–",
    "description": "Lanterns, the harbour and the people by it.",
    "publisher": {
      "kind": "Organization",
      "name": "The Quiet Lantern"
    },
    "home": {
      "title": "{{ site.title }}",
      "description": "{{ site.description }}",
      "socialTitle": "{{ site.title }}",
      "socialDescription": "{{ site.description }}"
    },
    "types": {
      "article": {
        "description": "{{ post.auto_description }}",
        "socialDescription": "{{ post.auto_description }}",
        "schema": "Article"
      },
      "page": {
        "description": "{{ post.auto_description }}",
        "socialDescription": "{{ post.auto_description }}",
        "schema": "WebPage"
      },
      "canvas": {
        "description": "{{ post.auto_description }}",
        "socialDescription": "{{ post.auto_description }}",
        "schema": "WebPage"
      }
    }
  },
  "metaLine": {
    "types": {
      "article": {
        "format": "Published on {date} in {category} by {authors}"
      },
      "page": {}
    }
  },
  "breadcrumbs": {
    "types": {
      "article": {
        "current": false
      },
      "page": {
        "current": false
      },
      "canvas": {
        "current": false
      }
    }
  },
  "ai": {
    "home": {
      "markdown": true,
      "llms": true,
      "llmsFull": true
    },
    "signals": {
      "search": "defer",
      "aiInput": "grant",
      "aiTrain": "defer"
    },
    "types": {
      "article": {
        "markdown": true,
        "llms": true,
        "llmsFull": false
      },
      "page": {
        "markdown": true,
        "llms": true,
        "llmsFull": true
      },
      "canvas": {
        "markdown": true,
        "llms": true,
        "llmsFull": false
      }
    }
  },
  "consent": {
    "bannerTitle": "Your privacy",
    "bannerText": "This site uses only what it needs to work, unless you allow more. With your consent it also loads content from other services, such as videos, which may store data in your browser and use what they learn for their own purposes. You can change or withdraw your consent at any time, from the bottom of every page.",
    "bannerAccept": "Accept all",
    "bannerReject": "Reject optional",
    "bannerCustomise": "Customise",
    "dialogTitle": "Privacy settings",
    "dialogIntroduction": "Choose what the site may load and store beyond what it needs to work. Each category lists its services, who provides them, what they store and for how long. Your choice holds for 12 months, and you can change it at any time.",
    "dialogAccept": "Accept all",
    "dialogReject": "Reject optional",
    "dialogSave": "Save my choices",
    "dialogClose": "Close",
    "footerChange": "Change privacy settings",
    "footerWithdraw": "Withdraw consent",
    "noticeWithdrawn": "Your consents have been withdrawn. The page will reload.",
    "placeholderQuestion": "Allow {service} to play this content?",
    "placeholderButton": "Allow and play",
    "objectionText": "We can't see who you are, we don't follow you from one visit to the next, and we don't profile you. All we do is count the visits: how many there are, which pages are read and for how long, from which country, in which language and with which browser, and when in the day. We do so on our legitimate interest in knowing this. If you disagree, you have the right to [object].",
    "objectionObjected": "You have objected to the counting, so your visits are not counted. [Undo your objection]",
    "objectionTitle": "Don't count my visits",
    "objectionAppeal": "Do you really want us to stop counting your visits? We can't see who you are, and we don't follow you from one visit to the next. The figures help us understand what is valuable on the site and what we need to do better.",
    "objectionConfirm": "Don't count my visits",
    "objectionCancel": "Cancel",
    "necessaryName": "Necessary",
    "necessaryDescription": "What the site needs to work and to remember your choice. Always on.",
    "functionalName": "Functional",
    "functionalDescription": "Content and features from other services, such as videos and charts, whose providers do not use what they learn for their own advertising or profiling.",
    "statisticsName": "Statistics",
    "statisticsDescription": "Measuring how visitors use the site, so that it can be made better.",
    "statisticsWithoutStorageDescription": "Measuring how visitors use the site, so that it can be made better. Each visit is counted from the first page, without storing anything in your browser or reading your device's properties. With your consent, the statistics also store an ID in your browser, so that a visitor who comes back is counted once.",
    "marketingName": "Marketing",
    "marketingDescription": "Content and features from services whose providers may use what they learn about you for their own advertising or profiling."
  },
  "tagManager": {
    "manager": "None",
    "provider": {}
  },
  "legalPages": {
    "privacyPolicy": {
      "title": "Privacy policy",
      "url": "/pages/privacy/"
    },
    "cookiePolicy": {
      "title": "Privacy policy",
      "url": "/pages/privacy/"
    }
  },
  "forms": {
    "contact": {
      "confirmation": "Thank you. Your message has been sent."
    }
  },
  "related": {
    "freshness": true,
    "halfLife": 90
  }
}
```

### The service registry

`consent.json` is the service registry: every service the site's pages may let a visitor's browser reach, which the site's consent banner asks about. It holds `revision`, 16 hexadecimal digits that change with what a visitor consents to, and `revised`, the day it last changed; `categories`, each with `id` (`necessary`, `functional`, `statistics` or `marketing`), `name`, `description` and the ids of its `services`; `services`, each with its `id`, `name`, `category`, `provider` (`null` for the site itself), `purpose`, `storage`, `hosts`, `transfers` and `necessity`, each stored item with its `name`, `kind`, `lifetime`, `party` and `domain`, the domain it is on: `null` for the host of the page that stores it, a domain for one shared with the sites below it, or a third party's, the host its service shows in or loads from where its facts name none; `departures`, the site's departures from the consent rules; and `texts`, the consent texts, by where a visitor meets them, `objection` the texts of the right to object to counting without storage, which a registry an older core wrote may lack. Every build writes it, from the site settings, the embeds of the published posts and the services an Admin declares; nothing in it is a post's.

```json file=consent.json
{
  "revision": "9db7b6a0279df359",
  "revised": "2026-10-30",
  "categories": [
    {
      "id": "necessary",
      "name": "Necessary",
      "description": "What the site needs to work and to remember your choice. Always on.",
      "services": [
        "consent"
      ]
    }
  ],
  "services": [
    {
      "id": "consent",
      "name": "Consent",
      "category": "necessary",
      "provider": null,
      "purpose": "Remembers which categories and services you allowed, and when, so that the site respects your choice.",
      "storage": [
        {
          "name": "konzilo-consent",
          "kind": "localStorage",
          "lifetime": "P12M",
          "party": "first",
          "domain": null
        }
      ],
      "hosts": {
        "scripts": [],
        "frames": [],
        "connections": [],
        "images": [],
        "styles": [],
        "fonts": []
      },
      "transfers": [],
      "necessity": "Without it the site could not keep to your choice, and would ask you on every page."
    }
  ],
  "departures": [],
  "texts": {
    "banner": {
      "title": "Your privacy",
      "text": "This site uses only what it needs to work, unless you allow more. With your consent it also loads content from other services, such as videos, which may store data in your browser and use what they learn for their own purposes. You can change or withdraw your consent at any time, from the bottom of every page.",
      "accept": "Accept all",
      "reject": "Reject optional",
      "customise": "Customise"
    },
    "dialog": {
      "title": "Privacy settings",
      "introduction": "Choose what the site may load and store beyond what it needs to work. Each category lists its services, who provides them, what they store and for how long. Your choice holds for 12 months, and you can change it at any time.",
      "accept": "Accept all",
      "reject": "Reject optional",
      "save": "Save my choices",
      "close": "Close"
    },
    "footer": {
      "change": "Change privacy settings",
      "withdraw": "Withdraw consent"
    },
    "notice": {
      "withdrawn": "Your consents have been withdrawn. The page will reload."
    },
    "placeholder": {
      "question": "Allow {service} to play this content?",
      "button": "Allow and play"
    },
    "objection": {
      "text": "We can't see who you are, we don't follow you from one visit to the next, and we don't profile you. All we do is count the visits: how many there are, which pages are read and for how long, from which country, in which language and with which browser, and when in the day. We do so on our legitimate interest in knowing this. If you disagree, you have the right to [object].",
      "objected": "You have objected to the counting, so your visits are not counted. [Undo your objection]",
      "title": "Don't count my visits",
      "appeal": "Do you really want us to stop counting your visits? We can't see who you are, and we don't follow you from one visit to the next. The figures help us understand what is valuable on the site and what we need to do better.",
      "confirm": "Don't count my visits",
      "cancel": "Cancel"
    }
  }
}
```

### The redirect rules

`redirects.json` holds the site's own redirect rules, those that lead to no post: `rules`, first the exact rules, sorted by `from`, each `{ "from", "to", "status" }`, then the patterns, in the order an Admin gave them, each `{ "pattern", "to", "status" }`; `{ "rules": [] }` when there are none. `from` is an address on the site as a browser sends it, with a query or not; `pattern` a regular expression, which starts with `^`, matched against the whole path, in the part of RE2's syntax that JavaScript and Go read alike, its target naming its groups as `$1` to `$9`. `status` is 301, 302, 307 or 308, a redirect, with `to`, an address on the site or `https://…`, or 404 or 410, without one. A rule that leads to a post is the post's, in its file ([Old and other addresses](#old-and-other-addresses)). A rule that leads to a term's page, and each old address of a term's page, an address it was live at before its term's slug changed, is the site's, with the page's current address as `to`.

```json file=redirects.json
{
  "rules": [
    {
      "from": "/gone/",
      "status": 410
    },
    {
      "from": "/old-shop/",
      "to": "https://shop.example.com/",
      "status": 301
    },
    {
      "pattern": "^/blog/(.*)$",
      "to": "/$1",
      "status": 301
    }
  ]
}
```

### The post IDs

`.post-ids.json`, the *ledger*, says which post each post's file is, by the post's ID, and what the intake remembers of it from one build to the next. Only the intake writes it. Every build does, and the content repository keeps it in every commit, so that a post can be purged from every commit of the history. Its name starts with a dot, so no collection reads it, and a file written by another tool has no entry in it. A feed's `guid` is the one thing the site takes from it, `<origin>/?p=<ID>`, so that a moved post is no new item to a feed reader.

An ID is text, the name of the post's source file, such as `96ba709ec918`, which never changes. A post's translations share it, so on a site in several languages an entry's key is `<tag>/<ID>`. The file holds, each sorted by its keys:

- **`posts`**, by key, each with `path`, the post's file now, `null` while it has none; `paths`, every path it has had, the first first; `address`, where the current release shows it, which stays while it is off the site; `addresses`, those it had while live, from which its `oldAddresses` come; `title`, as it was published; `source`, the SHA-256 of the source file of its published version, and `published`, that of its published file without `modified`; `taken`, when the intake first took it, the post's `date` where it has none of its own; `modified`, when its published version last changed; and `names`, what its file names, `media`, `terms` and `embeds`, which stay for it while it is refused.
- **`awaited`**, by key, the moment a scheduled post was seen waiting for, kept while it stays scheduled for that moment, so that it goes live at it with no warning.
- **`terms`**, by the term's ID, each with the `address` of its page and the `addresses` it has had, for a taxonomy with an address.
- **`files`**, the SHA-256 of each of an Admin's source files the site last took.
- **`chosen`**, the posts the settings last chose as `legalPages` and for `notFound`, and as `startPage`, which it names only where one is chosen.
- **`settingsMedia`**, the masters the settings last named, which stay while a later settings file is refused.
- **`consent`**, the service registry's `revision`, and `revised`, the day it last changed.

```json file=.post-ids.json
{
  "posts": {
    "84bccaa20747": {
      "path": "pages/about-us/team.md",
      "paths": [
        "pages/about-us/team.md"
      ],
      "address": "/pages/about-us/team/",
      "addresses": [
        "/pages/about-us/team/"
      ],
      "title": "Team",
      "source": "661f669b023c9c066a1968192577e1a55da2e84ae7b02f3aca1b9313212e58a0",
      "published": "013a5b77c59aed21ea19084ddc7310d70a1799bdb2787ceaff92bb82a52317d8",
      "taken": "2026-05-01T08:00:00Z",
      "modified": "2026-05-01T08:00:00Z",
      "names": {}
    },
    "84d238eb4622": {
      "path": "not-found.md",
      "paths": [
        "not-found.md"
      ],
      "address": null,
      "addresses": [],
      "title": "Not found",
      "source": "5bc2d038434bc1659c34c3373491db12179e390c9d68daf56e02a9e5782c8860",
      "published": "c3ddfbcb3a115cb52b1bc7bbe5e164f2be1b8ec15ad66a8d757396a379fd3225",
      "taken": "2026-05-01T08:00:00Z",
      "modified": "2026-05-01T08:00:00Z",
      "names": {}
    },
    "8d7010ec68d2": {
      "path": "pages/about-us.md",
      "paths": [
        "pages/about-us.md"
      ],
      "address": "/pages/about-us/",
      "addresses": [
        "/pages/about-us/"
      ],
      "title": "About us",
      "source": "d166febac5302b4081c5ffb479eeb69ebcfd1ff8fe1bfa1fb84ade8416f25378",
      "published": "e5147ebd22f1517cf6ffcf0a3451b1a35d362763d4428f925748e0c6659ef4fb",
      "taken": "2026-05-01T08:00:00Z",
      "modified": "2026-05-01T08:00:00Z",
      "names": {}
    },
    "96ba709ec918": {
      "path": "articles/opening-hours.md",
      "paths": [
        "articles/hours.md",
        "articles/opening-hours.md"
      ],
      "address": "/opening-hours/",
      "addresses": [
        "/hours/",
        "/opening-hours/"
      ],
      "title": "Opening hours",
      "source": "173d671093aad56b1824c16bd0853ca2dec63501925cb656f71cc60be0827fb2",
      "published": "2b619238aa50652d9913f43c651243fc3f926723de44bcaca9fcb0cb4cb4e370",
      "taken": "2026-10-20T08:00:00Z",
      "modified": "2026-10-21T09:30:00Z",
      "names": {
        "terms": [
          "categories/news.json"
        ]
      }
    },
    "9c39c3b2be4e": {
      "path": "pages/privacy.md",
      "paths": [
        "pages/privacy.md"
      ],
      "address": "/pages/privacy/",
      "addresses": [
        "/pages/privacy/"
      ],
      "title": "Privacy policy",
      "source": "1dbbd4046c9040ca59ee81e4f9ec7a9560d46eee4af3530ec2a7dc470eeeb6ef",
      "published": "3e41001f463e136b7af5c5bed0cf14ebda470abdf98595db5a3f08c043b86dfa",
      "taken": "2026-05-01T08:00:00Z",
      "modified": "2026-05-01T08:00:00Z",
      "names": {}
    },
    "de6aeaae949d": {
      "path": "articles/harbour-lights.md",
      "paths": [
        "articles/harbour-light.md",
        "articles/harbour-lights.md"
      ],
      "address": "/harbour-lights/",
      "addresses": [
        "/harbour-light/",
        "/harbour-lights/"
      ],
      "title": "Harbour lights & lanterns",
      "source": "6da1fa92b8343c291be5406cc109eaef9e6309b42dcf3ed6c5ac627f6d18c838",
      "published": "eacf443e94a6eb54e4be0336e07d002205ee5eade306ed26a6d591efbf90522c",
      "taken": "2026-10-20T08:00:00Z",
      "modified": "2026-10-21T09:30:00Z",
      "names": {
        "media": [
          "harbour-lights-5c0ffee5a1.webp",
          "harbour-lights-a7b543496f.webp",
          "harbour-lights-e978159ef2.webp"
        ],
        "terms": [
          "authors/ada-lind.json",
          "authors/ben-holm.json",
          "categories/local.json",
          "categories/news.json",
          "topics/harbours.json",
          "topics/lanterns.json"
        ]
      }
    },
    "f6788ed8259d": {
      "path": "start.page.md",
      "paths": [
        "pages/welcome.md",
        "start.page.md"
      ],
      "address": "/",
      "addresses": [
        "/pages/welcome/",
        "/"
      ],
      "title": "Welcome",
      "source": "9bc42308d0e4789dfae08fdb5abc25513f96c08e11f96bc416f2bd3c56c6ecc4",
      "published": "01999bfa9169a322916c7942050f5f2aa1bdb179be25500d8dbfa536f3b501c6",
      "taken": "2026-05-01T08:00:00Z",
      "modified": "2026-05-01T08:00:00Z",
      "names": {}
    }
  },
  "awaited": {},
  "terms": {},
  "files": {
    "menus/main.json": "f84f1a0e3bc087a76f33c39e32840bcd0436641941f14b2b9508d172e2260ba5",
    "redirects.json": "085117efe120292600d9f626c75d16f9653ac63a34b3c343b452d365925dbfc2",
    "settings.json": "e21541d275905c4b8416edcbe0a276a2b75daf6f9c1eba4bf9b0275524a1a80b"
  },
  "chosen": {
    "legalPages": [
      "9c39c3b2be4e"
    ],
    "notFound": "84d238eb4622",
    "startPage": "f6788ed8259d"
  },
  "settingsMedia": [
    "media/hero-image-dc2dd17407.webp",
    "media/logo-908319c58a.svg",
    "media/site-icon-f521d4c15b.svg"
  ],
  "consent": {
    "revision": "9db7b6a0279df359",
    "revised": "2026-10-30"
  }
}
```

## The start page

`start.<type>.md`, where `<type>` is a post type's name, is the start page an Admin chooses among the posts, which the site shows at its root, `/`, in place of the start page of its own design: the chosen post's file as its type writes it ([A post's file](#a-posts-file)), at the content folder's root, its images named from there, `media/<name>`, with its own `slug` after its `title`, and in a hierarchical type its parent's path, `parent`, where it has one, which its file's name does not hold, so that whatever reads the content files back, such as Compose's seed reading demo content, gives the post its own place again, and the site puts it at its own address once it is no longer chosen. The site reads it as a post of that type, at the root and at no other address: the address it had before is among its old addresses, an other address leads there and never shows it, and a link, a menu entry, a chosen page or a redirect rule that names it by its ID leads to `/`. Its children in a hierarchical type keep their paths, which hold its slug, and their files stay in its collection's folder. A list with pages of its own has its later pages at `/page/<n>/`. Without one, the site shows its own start page, and so does a site in several languages, which chooses none.

```markdown file=start.page.md read
---
title: "Welcome"
slug: "welcome"
date: 2026-05-01T08:00:00Z
modified: 2026-05-01T08:00:00Z
breadcrumb: "Home"
oldAddresses: ["/pages/welcome/"]
---

The harbour's lights, and what we write of them.
```

```html rendered
<p>The harbour's lights, and what we write of them.</p>
```

## The 404 page

`not-found.md` is the page the site shows at every address it has nothing at, which an Admin chooses among the posts: the chosen post's title alone in its frontmatter, then its body, in its type's elements, its images named from the content folder's root, `media/<name>`. It has no address of its own, and is in no collection of a type, so no list, menu or link leads to it. Without one, the site shows plain text of its own. On a site in several languages ([Several languages](#several-languages)) the chosen post is the main language's 404 page, and its translation in each other language is that language's, `not-found/<tag>.md`, of the same form, its images named from its folder, `../media/<name>`, with no address of its own either; a language without one shows the site's plain text in that language.

```markdown file=not-found.md read
---
title: "Not found"
---

There is nothing here. Try [the start page](/).
```

```html rendered
<p>There is nothing here. Try <a href="/">the start page</a>.</p>
```

## Old and other addresses

A post of a type with an address answers at its own address, and at two more kinds, each a redirect to it or the post itself shown there:

- **`oldAddresses`**, the addresses it had before, where the site showed it, which redirect permanently, with 301. A build adds the address a post was live at when it is published at another, as when its slug or its parent changes.
- **`otherAddresses`**, addresses an editor gave it, each `{"address":…,"answer":…}`, its answer 301, 302, 307 or 308, or `"show"`: the post's own page at that address too, its canonical address the post's, at a path without a query. A build writes the post's page again there; no sitemap or list holds such an address.

Each is an address on the site as a browser sends it, a path, with a query or not. The site answers an address from one holder, in this order: the site's own files, a post's own address, a post's other addresses, the site's exact rules in `redirects.json`, old addresses, and last the patterns.

## Several languages

On a site that declares several `languages`, each post is in one of them, and a translation of a post is a post of its own. Every language has a prefix, the first segment of its posts' addresses: its language subtag in lowercase, `sv`, or its whole tag, `en-gb`, where another of the site's languages has the same subtag.

- **A post's file** is in the folder of its language's tag in its collection, `articles/sv-SE/om-lyktorna.md`, and its masters one folder further up, `../../media/<name>`. Its address is its type's, in its language where the type gives one in each, after its language's prefix: `/sv/om-lyktorna/`.
- **`translationKey`**, after the declared fields, ties a post to its translations: the same 16 lowercase hexadecimal digits in each, written when the site publishes a translation of it.
- **A post in the main language** keeps its address without the prefix among its old addresses.
- **A term's file** is in the folder of each language a post uses it in, named by its slug, which every language shares, with its name in that language, and a post names it with its folder, `["sv-SE/nyheter"]`; a term's `parent` names its parent's file in the same folder, `sv-SE/nyheter`.
- **Each menu** is `menus/<tag>/<menu>.json` in each language, and **the site settings** `settings/<tag>.json`, in place of `menus/<menu>.json` and `settings.json`: each language's file holds every setting, the site's title and each translated setting in its language, a choice of a post as its translation in that language where the site shows one, else as the chosen post, and names its images one folder up, `../media/<name>`. The service registry, `consent.json`, is one, from the main language's settings.

The examples of this section are of a site in Swedish and English, Swedish the main language, whose pages have an address in each language:

```json site-description=languages
{
  "languages": ["sv_SE", "en_GB"],
  "images": { "smallestWidth": 400, "displayWidth": 1280 },
  "types": {
    "article": {
      "collection": "articles",
      "address": "/{slug}/",
      "elements": ["paragraph"]
    },
    "page": {
      "collection": "pages",
      "hierarchical": true,
      "address": { "sv_SE": "/sidor/{path}/", "en_GB": "/pages/{path}/" },
      "elements": ["paragraph"]
    }
  },
  "menus": {
    "main": { "label": "Main menu" }
  },
  "settings": {
    "footerText": { "label": "Footer text", "type": "string", "control": "textarea", "translated": true }
  }
}
```

A Swedish article and its English translation:

```markdown file=articles/sv-SE/om-lyktorna.md site=languages
---
title: "Om lyktorna"
date: 2026-10-20T08:00:00Z
modified: 2026-10-20T08:00:00Z
headline: "Om lyktorna"
authors: []
category: ["sv-SE/nyheter"]
topics: []
translationKey: "3a1dace55ce438b2"
oldAddresses: ["/om-lyktorna/"]
---

Lyktan vaktar hamnen.
```

```markdown file=articles/en-GB/about-the-lanterns.md site=languages
---
title: "About the lanterns"
date: 2026-10-20T08:00:00Z
modified: 2026-10-20T08:00:00Z
headline: "About the lanterns"
authors: []
category: ["en-GB/nyheter"]
topics: []
translationKey: "3a1dace55ce438b2"
---

The lantern keeps the harbour.
```

```json file=categories/sv-SE/nyheter.json site=languages
{
  "name": "Nyheter"
}
```

```json file=categories/en-GB/nyheter.json site=languages
{
  "name": "News"
}
```

A page and its translation, at `/sv/sidor/om-oss/` and `/en/pages/about-us/`, which each language's main menu leads to:

```markdown file=pages/sv-SE/om-oss.md site=languages
---
title: "Om oss"
date: 2026-10-20T08:00:00Z
modified: 2026-10-20T08:00:00Z
translationKey: "4b61ce33f4918c84"
oldAddresses: ["/sidor/om-oss/"]
---

Vilka vi är.
```

```markdown file=pages/en-GB/about-us.md site=languages
---
title: "About us"
date: 2026-10-20T08:00:00Z
modified: 2026-10-20T08:00:00Z
translationKey: "4b61ce33f4918c84"
---

Who we are.
```

```json file=menus/sv-SE/main.json site=languages
{
  "items": [
    {
      "title": "Om oss",
      "url": "/sv/sidor/om-oss/",
      "description": "Vilka vi är."
    }
  ]
}
```

```json file=menus/en-GB/main.json site=languages
{
  "items": [
    {
      "title": "About us",
      "url": "/en/pages/about-us/",
      "description": "Who we are."
    }
  ]
}
```

A site in one language is written as if it declared no languages.

## Written against read

Three forms meet in a content file:

- **The exact form**, the one this document describes: what the intake writes, byte for byte, and the one another tool should write. Each example above that is not marked as read is in it.
- **What the site's reader takes besides.** The reader is [Sätteri](https://github.com/bruits/satteri) 0.10.5 with GFM, raw HTML and directives on and smart punctuation off, the reader Astro uses. It renders any Markdown and any raw HTML a file holds as ordinary Markdown and HTML, below; the intake never writes it.
- **The shapes the site gives a meaning of its own**, below.

### What more the reader takes

The reader renders these as Markdown and HTML always render them; none of them is in the exact form. Raw HTML is rendered as written, so a file another tool writes is trusted as the site's own.

```markdown body read reader-only
*Italic* and __bold__, with other markers.

A line
and the next, without a backslash.

Visit https://example.com today, linked by GFM.

<span class="note">Raw HTML</span>, as written.
```

```html rendered
<p><em>Italic</em> and <strong>bold</strong>, with other markers.</p>
<p>A line
and the next, without a backslash.</p>
<p>Visit <a href="https://example.com">https://example.com</a> today, linked by GFM.</p>
<p><span class="note">Raw HTML</span>, as written.</p>
```

````markdown body read reader-only
Title
=====

***

3. A list that starts at three

- [ ] A task

```js
let code = 'in a language';
```
````

```html rendered
<h1>Title</h1>
<hr>
<ol start="3">
<li>A list that starts at three</li>
</ol>
<ul class="contains-task-list">
<li class="task-list-item"><input type="checkbox" disabled> A task</li>
</ul>
<pre><code class="language-js">let code = 'in a language';
</code></pre>
```

### Shapes with a meaning of their own

The site's reader gives these shapes a meaning beyond Markdown's:

- **A paragraph of one image**, with its caption or not, is a figure ([Images](#images)), and **a paragraph of two or more images** a gallery ([Galleries](#galleries)).
- **A paragraph of one address an embed service takes** is that service's player ([Embeds](#embeds)).
- **An empty `<a id>` before a heading's text** is the heading's id ([Headings](#headings)).
- **A quote's last paragraph wrapped in `<cite>`** is its citation ([Quotes](#quotes)).
- **A directive the rule data registers**, the post list or the form, or one of the site's own components, is that component; any other reads as its text ([Post lists](#post-lists), [Forms](#forms), [A site's own components](#a-sites-own-components)).
- **An empty HTML comment**, `<!-- -->`, shows nothing.

## Source files

The source files are what the intake reads: what editors save, one file per thing an editor edits, named by a generated ID that never changes, in the site's source repository. They are not published, and only the core reads them. Exact bytes are the intake's job, so they need not be in the exact form.

| Path | What it holds |
|---|---|
| `<collection>/<ID>.md` | A post, its fields as YAML frontmatter, then its body as Markdown. On a site in several languages, `<collection>/<tag>/<ID>.md`, with the same ID in each language. |
| `<taxonomy's collection>/<ID>.json` | A term, `name`, `slug`, `description` and `parent`, whether or not a post uses it. On a site in several languages, `<collection>/<tag>/<ID>.json`. |
| `menus/<menu>.json`, `menus/<tag>/<menu>.json` | A menu: `items`, each with `title`, `post`, the ID of a post or a term, `url`, `description` and `items`. Without a file, a menu has no entries. |
| `settings.json` | The site's identity and settings, and the groups under their names, each holding only what differs from a default; a translated setting as a value by locale. A choice of a post is its ID, and an image `{ "src": "/media/<name>", "alt": "…" }`. |
| `redirects.json` | `rules`, each `{ "from", "status" }` with `to`, a path on the site or an `https://` address, or `post` or `term`, an ID; a source that starts with `^` is a pattern. A rule that leads to a post goes into its file. |
| `services.json` | `services`, the services an Admin declares. |
| `media/<name>` | Originals, as uploaded, in Git LFS. |

A post's frontmatter holds `title`; `slug`, made from the title if left empty; `parent`, the ID of a post of its type, in a hierarchical type; `status`, `draft`, `scheduled` or `published`, a draft when left out; `date`, which also says when a scheduled post goes live, and a scheduled post whose moment had passed when the intake first read it goes live at once, with that moment as its date and a warning; each field its type declares, a taxonomy's terms by their IDs, a list or, for a field of one term at most, the ID alone, an image by `/media/<name>`; where the type has the search and sharing fields, `search` (`title`, `description`, `canonical`, `noindex`, `nofollow`), `sharing` (`image`, `{ "src", "alt" }`, `title`, `description`) and `structured` (`schema`), three groups the intake writes as the one `seo` map, and never `seo` itself, which is refused; `otherAddresses`, each `{ "address", "answer" }`; and on a site in several languages `translationKey` where the same ID does not tie a translation set. What the intake derives is in no source file: `modified`, `oldAddresses`, masters, `consent.json` and `not-found.md`.

A site's demo content, the fictional content a local copy starts with, is content files, never source files, and holds a scheduled post as a post whose `date` lies ahead. Compose's seed makes each post a source file with `status: published`, but one dated after the moment it seeds, which it makes `scheduled` for that `date`. A copy without Compose leaves such a post out of the content folder it fills, and one filled after the post's moment holds it as published. The page for addresses not found, `not-found.md`, is never scheduled, whatever its date: the seed makes it `published`, and a copy holds it.

In a body, a link to a post or to a term's page is `[text](konzilo:<ID>)`, with `#<anchor>` or not, and `konzilo:<tag>/<ID>` for one in another language. An image is `![alt](/media/<name>)`. A post list names its terms by their IDs. A file named with a leading dot, another kind of file, and a folder no collection names are left alone.

A source file the intake cannot publish is *refused*, and one it publishes otherwise than it holds gets a *warning*. Each is data, in the JSON the intake's command prints: what it is about, the `post` by `id`, `type` and `title`, and its `file`, or the `file` alone; where, the `block` by `path` and `name`, the `field` by `name` and `label`, the label the form shows it by, the core's by language or the site's own, the `entry`, the `setting` and the `line`, each it has; its reason by `name` in the core's catalogues, such as `refusal.image-alt` or `warning.image-narrow`, and the `values` that fill it; and the `reason` and the whole `message` in British English. A value is a text or a number as it is, `{ "name", "values" }` for a text by name of its own, `{ "field" }` for a field's label, the site's own or the core's, one text or texts by language, which names the field as the form shows it, `{ "label" }` for a type's plural or a taxonomy's label, which describes, and so starts with a small letter but in an abbreviation, `{ "moment" }` for a date and time, which each reader shows in its language's form and its own time zone, named, or `{ "and": […] }` or `{ "or": […] }` for a list of values. The editor shows each in its interface language, and the command line and the build log write the British English. A reason the site gives in its own words, from its components' check or an attribute's `refusal`, has no `name`, and its `reason` is those words.

## What is not the format

What the site's design makes of the content files is not the format: the HTML a template wraps a post in, an embed's player and its consent placeholder, the sizes Astro makes of each master, and the colours of a code block. The HTML in this document's examples is what this core's reader renders, shown to say what a shape means. Nor are the site description and the site's own templates and styles part of the format.

## Every element in one file

A page that holds every body element. It names images, so it is read; every block of it but its image and its gallery is in the exact form, and a site built from this document's examples shows each element.

````markdown file=pages/a-tour.md tour
---
title: "A tour of every element"
date: 2026-11-03T12:00:00Z
modified: 2026-11-03T12:00:00Z
---

A paragraph with **bold**, _italic_, `inline code`, ~~struck~~ text, H<sub>2</sub>O, E = mc<sup>2</sup>, 10 kg and a footnote[^1].\
A line break, [a link](https://example.com/), [a page of the site](/pages/about-us/) and <a href="https://example.com/offer" target="_blank" rel="noopener nofollow">a link that opens in a new tab</a>.

## <a id="headings"></a>A heading at level 2

### Level 3

#### Level 4

##### Level 5

###### Level 6

- A bulleted item
  - A nested item
- Another item

1. A numbered item
2. Another one

> A quoted paragraph.
>
> <cite>Someone, _somewhere_</cite>

```
npm test
```

| Item | Price |
| --- | ---: |
| Tent | 120 |

<table>
<caption>What we packed</caption>
<thead>
<tr><th>Item</th><th style="text-align: right">Price</th></tr>
</thead>
<tbody>
<tr><td>Tent</td><td style="text-align: right">120</td></tr>
</tbody>
<tfoot>
<tr><td>Total</td><td style="text-align: right">120</td></tr>
</tfoot>
</table>

https://www.youtube.com/watch?v=Kz3pQ8vXw1A

![A lantern on the quay](../media/a-tour-3f9a1c2b7d.webp)\
The quay _at dusk_

![A red barn](../media/a-tour-faf546aae9.webp)
![A lake at dawn](../media/a-tour-500a71b248.webp)
A farm in summer

::post-list{type="article" number="3" presentation="list" date="true"}

::form{name="contact"}

[^1]: A footnote's text.
````
