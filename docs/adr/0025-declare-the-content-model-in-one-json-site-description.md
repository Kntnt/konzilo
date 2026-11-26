# ADR 0025: Declare the content model in one JSON site description

**Date:** 2026-11-03, amended 2026-11-11, 2026-11-12, 2026-11-13 and 2026-11-25 · **Status:** Accepted as a technical choice; Thomas may veto. So are the choices for a site's own demo content, which a demo site shows itself with: that it is kept in `demo-content/` at the site repository's root, that it takes the core's place whole, and that Compose's seed reads it from the site repository, mounted read-only. So is how demo content holds a scheduled post: as a post dated ahead, which a copy without Compose leaves out. So are the agent's choices of how it holds a draft (2026-11-25): as a post whose frontmatter says `status: draft`, a key only demo content carries, rather than a source file kept beside the content files; `draft` the one status demo content says, another read as none; a draft dated ahead a draft all the same, its date kept; a copy without Compose leaving it out and naming it, with each link and menu entry that leads to it; and the site template's draft, *Distant workshops and the river*, an article with no date and no image.

## Decision

**One file, `site-description.json`, at the root of the site repository.** The intake reads it, the Astro integration reads it, and Sveltia's configuration is generated from it (ADR 0029).

- **`types`,** at least one, each with a `label` and a `plural`, a `collection`, the `elements` it takes, by name, each one the rule data knows, and its `fields`. `article` and `page` are names like any other; nothing is built in.
- **`taxonomies`,** each with a `label`, a `plural`, a `collection` and `hierarchical`.
- **Every post has its title and its slug,** so neither is declared.
- **A field** is one of four kinds, by its name and keys, written into the frontmatter in the order declared: the core's own (`date`, `modified`, `excerpt`, `image`), the group `seo`, a taxonomy's terms (`taxonomy`, which may be `required`, at least one term), or one of the site's own, with a `label`, a `type`, a `control`, `options` for a select, and `required`.

  | `type` | `control` | Frontmatter | Astro |
  |---|---|---|---|
  | `string` | `text`, `textarea` | `"…"` | `string` |
  | `string` with `options` | `select` | one of the options | an enum |
  | `number` | `number` | `4.5` | `number` |
  | `integer` | `number` | `7` | whole `number` |
  | `boolean` | `toggle` | `true`, `false` | `boolean`, always present |
  | `date` | `date` | `2026-11-05` | `Date`, midnight UTC |

  Field names are letters, digits and underscores starting with a lowercase letter. A required field left empty refuses the post, naming the field; a wrong value says so: `readingTime: the site cannot publish "seven" as a whole number`.
- **It also declares** `menus`, `settings`, `images`, `language` or `languages`, `presentations`, `forms`, `components`, `search`, `security` and `consent`, each in its own ADR.
- **Nothing else is accepted.** An unknown key, an element the rules do not know, two collections with one name: the checker names every problem by its path, and the description is refused whole.
- **One checker, in the npm package.** The intake and Astro's `collections()` both run it, so every build and every start of the dev server checks the description. A deploy checks it before it switches.
- **Astro makes one collection per type and per taxonomy,** each with a strict schema, so a template meets exactly the declared fields, typed. A changed description gives a build first and then a restart of the dev server, since a file of the old one fails the new schema and Astro stops watching a collection that fails to load.
- **Demo content is files,** fictional, copied into a local copy alone, so that no live site can run it: the command that copies it refuses a public host, with no content folder, whichever demo content it would copy.
- **A site repository may keep its own,** in `demo-content/` at its root, published content files of its own description, in the shape of the core's `site-template/demo-content/`. Where it has one, a local copy starts from it in place of the core's, whole, never with both: `npm run dev` and `npm run build` copy it into `content/`, and Compose's seed fills a new Forgejo's source repository with it as source files, its media in LFS. Both ask one function, `demoContentOf()` in `src/demo-content.js`, so that they cannot start from different stories. The seed reads the site repository, read-only, as the builder does; the builder and the live preview leave `demo-content/` out of their copies of the site's code, since they build from the source repository alone.
- **A post of the demo content dated ahead is a scheduled post.** A post whose `date` lies after the moment the demo content is read is scheduled for that moment. Compose's seed, at the moment it seeds, makes it a source file with `status: scheduled` and that `date`, where it makes every other post `published`; the intake leaves it off the public site, and publishes it at its moment, with nothing to say, since the first build saw it wait ([ADR 0069](0069-publish-at-once-a-scheduled-post-whose-moment-has-passed-and-say-so.md)). A post whose moment passes after the seed and before the first build, which no build then saw wait, goes live at that first build with the warning that its moment had passed, as ADR 0069 says of such a post, so a demo post's moment lies far enough ahead of a start for its first build to see it wait. `npm run dev` and `npm run build`, at the moment they fill `content/`, leave it out, and say so, naming each link and menu entry of what they copy that leads to it, which they copy all the same (2026-11-13), since a copy without Compose has no clock that publishes. Both ask `isScheduled()` in `src/demo-content.js`, of the post's frontmatter as `readPost()` there reads it, the YAML the content format writes. The page for addresses not found is never scheduled, whatever its date, since it has no address at which it could wait: the seed makes it `published`, and a copy holds it (2026-11-13). A person writes such a post by hand as any content file, with its moment as `date`. A site that makes its demo content by running the intake on source files, which writes no file for a post that is not yet live, runs it with `--now` set after every moment the demo content holds.
- **After its moment, it is a post like the others.** A copy whose `content/` was filled before the moment keeps it without the post, as it keeps any `content/` it has; one filled after the moment shows it, published at its moment, as the intake would have published it; and a seed after the moment makes it `published`. A site that wants to keep showing a scheduled post moves its date ahead again.
- **A post that says `status: draft` is a draft** (2026-11-25), so that a local copy's Reviewer finds something in the live preview that the public site does not show. It is written as any other post of the demo content, a content file in its collection's folder by its slug, with `status: draft` in its frontmatter, after its title, a key that only demo content carries, and with no `date`, since it has not been published. Compose's seed makes it a source file with `status: draft`, as an editor's save of a draft leaves it, with the rest of what its file holds, its terms, images and links by ID as every other post's, and its `date` where it has one, a draft's moment, from which the live preview shows it, a date ahead among them, which leaves it a draft; the intake leaves it off the public site, and the live preview, Sveltia's lists and the *Publishing* page show it as a draft. `npm run dev` and `npm run build` leave it out of `content/` and say so, naming each link and menu entry of what they copy that leads to it, as they do for a scheduled post, since a copy without Compose has no live preview; so the content folder never holds the key, and no reader of the format needs to know it. `draft` is the one status demo content says: the seed writes the status itself, by what the post says and its date, and reads another as none, as the copy does. Both ask `isDraft()` in `src/demo-content.js`, before `isScheduled()`. The page for addresses not found is never a draft, whatever its status. The site template's demo content holds one, the article *Distant workshops and the river*.

## Why

- The description says what a field is, not how each reader stores it. Adding a field is one entry in one file.
- A site description is short; it needs no comments or variables.
- A term's name in one file means that renaming a term changes one file.
- One checker cannot disagree with itself.

## Considered and rejected

- **YAML or TOML, a JavaScript file, or Astro's own schemas.** JSON reads everywhere without a library, and Astro's dev server can watch it.
- **A field plugin or schema of the editing tool as the source.** A second place where fields are declared.
- **A site's demo content laid over the core's.** A site whose description differs from the template's would get posts it refuses, and one that matches would show the core's fiction beside its own.
- **The folder named in the site description or in the environment.** One fixed place is all a site needs, and a setting would be one more thing to check and to get wrong.
- **A folder of source files beside `demo-content/`, for posts not yet live, a draft's among them.** Its files must name each other, their terms and their images by the IDs the seed makes from the published files' places, and a copy without Compose could show none of them. The demo content would also tell its story in two forms.
- **A key in a content file that says scheduled.** A content file then would no longer mean a published post, and every reader of the format would have to know it. A date ahead says it with no key. Nothing a published file holds can say that a post is a draft, so a draft takes a key, and the copy that fills a content folder leaves out the post that carries it, so that the content folder still means what is published.
- **`draft: true` for a draft.** A site may name a field of its own `draft`, while `status` is what the source file the seed writes calls a post's status, with the same word for the same thing.
- **Astro leaving out a post dated ahead.** The content folder is what is published, and a live site's never holds a post dated ahead; the rule would be the demo content's alone, in every build of every site.

## Consequences

- `site-description.json` uses element names, `paragraph`, not any tool's.
- A new element, field kind or file changes the checker in the same change as `content-format.md` (ADR 0015).
