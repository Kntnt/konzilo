# ADR 0047: Make AI visibility from the built pages

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: from the built pages, built by Konzilo. The defaults of the content signals and the negotiation are technical choices; Thomas may veto.

## Decision

- **Markdown alternates.** Each page of a published post whose type's row has Markdown on, and the start page while its row has it, but a post marked `noindex` and a page an excluded pattern matches. A page of the site's own, the page for addresses not found, a redirect page, a list's later page and a preview have none. `/x/` gives `/x.md`, the start page `/index.md`.
- **The main content** is the page's one `<main>`, or the one element the design marks with `data-konzilo-main`. A page that takes part with neither, or with two, fails the build. Inside it `nav`, `script`, `style` and `template` are left out, and an embed's panel becomes the link to its address.
- **The file** is front matter, `title`, `canonical_url`, `date` and `featured_image`, then each taxonomy's terms by name, then the page's title as a heading, unless the body begins with it, and the body. It is written beside the page, served as `text/markdown; charset=utf-8`.
- **The converter runs in Node,** in the build, and its output is what the tests hold.
- **`llms.txt` and `llms-full.txt`** are the integration's routes, as `text/plain; charset=utf-8`; a preview has neither, and a site's own file there fails the build. `llms.txt`: the site's title as `#`, its description as a quote, a line naming `llms-full.txt` while it holds a page, the start page, then a `##` section per type, named by its plural label. An item links the alternate's absolute address with the post's title and its summary, cut to 200 code points. A type's posts come newest first, else by title. It lists a page only where the release holds its alternate. `llms-full.txt`: the same title and quote, then each alternate of a row with `llmsFull` on, made from the alternates written, never converting again.
- **The settings,** the group `ai`: a table with a row for the start page and one per type with an address, each with `markdown`, `llms` and `llmsFull`, the last two off wherever Markdown is off; `excludedPaths`, one regular expression per line, matched against the page's path, in a syntax the core states, a line that does not compile being refused; and `signals`, `search`, `aiInput` and `aiTrain`, each `grant`, `reserve` or `defer`. By default Markdown and `llms.txt` are on everywhere, `llms-full.txt` for the start page, and only `aiInput` grants.
- **`robots.txt`** writes one `Content-Signal` line in its `User-agent: *` group: `Content-Signal: ai-input=yes` by default, and nothing when every signal defers.
- **Link headers:** every HTML page the public host answers with a 2xx links its alternate, `rel="alternate"; type="text/markdown"`, then `llms.txt` and `llms-full.txt`, `rel="related"; type="text/plain"`. Each alternate names its page, `rel="canonical"`.
- **Negotiation:** a page's own address answers with its alternate where the request's `Accept` prefers Markdown: only when an explicit `text/markdown` or `text/x-markdown` range has a positive weight strictly above the effective weight of both `text/html` and `application/xhtml+xml`. Equal weights keep HTML, and wildcards alone never give Markdown. Every page with an alternate sends `Vary: Accept`.
- **How the web server knows.** Each build lists the pages it wrote an alternate of in the release's `_markdown`; before the release is current the host checks each line, and the web server gets them as marks in the release, an empty file below `_konzilo/alternates/`, which switch with the release. No page is in the web server's configuration.
- **Caddy's standard build expresses the rule exactly,** as a CEL expression, bound to a header of at most 32 ranges and 1,024 characters. A longer one gets HTML. The dev server does the same in JavaScript.

## Why

- Components, the start page and lists come along as visitors see them.

## Considered and rejected

- **Markdown from the content collections.** It would leave out components and lists.
- **A converter in PHP or a Go library.** A second runtime, or a new pinned binary, in every build.
- **Pages in the web server's configuration.** They would reload it at every publish that adds or removes a page.

## What practice has shown

A reload closes Caddy's idle connections: a live suite met it twice in two runs, as a request that went out on a closed connection the moment the page showed. That is why the marks are files.
