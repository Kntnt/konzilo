# ADR 0024: Embed by the address alone, and load nothing before the visitor consents

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice; Thomas may veto.

## Decision

- **The Markdown form is the address alone in a paragraph,** bare as an editor pastes it, or `<https://…>` where GFM would end a bare address early. A paragraph that is a link whose text is its own address stays a link: the first fallback splits that text with an empty comment.
- **The services:** YouTube, Vimeo, Screen9, Loom, Spotify, Acast, Apple Podcasts, Speaker Deck, Datawrapper, CodePen and LinkedIn. Which addresses are embeds is rule data: per service its name, domains, address forms, each a regular expression whose named groups make the player's address, and the player's frame. The field, the intake and the reader all read it, so the site shows exactly what the intake accepts. Players are privacy-friendlier where the service offers it: `youtube-nocookie.com`, Vimeo with `dnt=1`.
- **Forms are strict.** Parameters that change what plays are refused, not dropped; only a start time (`t`, as `start`) and the services' own share tracking (`si`, `sid`, `share=copy`, LinkedIn's `utm_*`) are taken. Screen9 and Speaker Deck take the address in their embed code; Acast takes episodes.
- **The intake refuses** an address no service takes, naming its host and the services; an address of a known service in another form, saying which to use; and a caption.
- **The reader renders a panel:** `<figure class="konzilo-embed" data-embed="<service>">` holding a sentence that the site's script has not run, a link to the address and, in a `<template>`, the player, an `<iframe>` titled with the service's name. The script makes the panel the consent placeholder (ADR 0049). Without JavaScript the panel keeps its sentence and link.
- **The build needs no network.** Nothing in the intake or the rendering asks a service anything.

## Why

- The address alone is what an editor pastes, and reads in any Markdown tool.
- A template is inert by the HTML standard, and needs no script to stay that way.
- Deriving the player from the address keeps the build offline and free of keys, and the result the same every time.

## Considered and rejected

- **Raw HTML or a custom element in the content file.** A reader of the file would see markup in place of an address.
- **Fetching each service's oEmbed at build time.** The build would depend on every service being reachable.
- **A thumbnail before loading.** It is a request to the service.

## Consequences

- An embed has no caption and no title of its own yet. A directive form can give both (ADR 0019); video settles which form is written.
- Players whose height depends on their content get a fixed height, except that the script lets a Datawrapper chart set its own.
- A new service, or a new form of one, is an entry in the rule data, a fixture and a test.
