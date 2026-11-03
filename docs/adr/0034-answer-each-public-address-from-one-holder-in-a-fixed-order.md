# ADR 0034: Answer each public address from one holder, in a fixed order

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: an address belongs to one place, and saving one that a post has, or that is another post's other address or a rule, is refused, naming where it is. The order is a technical choice; Thomas may veto.

## Decision

- **The order.** An address is answered by the first of these that holds it:
  1. **The site's own:** a file of the release that is no post's page: the start page, the build's assets, the sitemap, `robots.txt`, feeds, the search page, anything below `/_konzilo/`, and a post list's later pages.
  2. **A published post's own address,** or a term's page where its taxonomy declares an address.
  3. **That post's other addresses.**
  4. **The site's exact rules.**
  5. **Old addresses,** the automatic rules.
  6. **Patterns,** in the list's order.
  7. **Otherwise `404`,** with the page for addresses not found.
- **At build,** a holder that a higher one shadows never answers, and the build warns of it where its owner reads warnings.
- **At save,** `preSave` refuses, naming the holder: an other address or a rule at an address levels 1–4 hold or the core reserves, and a post published or scheduled at an address an exact rule or another post's other address holds. The intake checks all of it again.
- **Two posts at one address.** The post the current release shows there keeps it; otherwise the one the ledger took first. The other is refused, naming it. A post that is scheduled there anyway wins at the build over a rule, with a warning in its status.
- **Old addresses give way:** a post that goes live at one takes it, and the rule goes.
- **A rule that leads to a post** belongs to it, and answers only while the post is published.
- **Reserved addresses.** One list, in the rule data: `/`, everything below `/_konzilo/` and `/_astro/`, and the files the core writes, `/_redirects` first; `{n}` stands for a whole number from 1. Each feature that writes a file adds its address.
- **Patterns** never apply below `/_konzilo/`.

## Why

- One rule serves every feature that makes an address, so no two can disagree.
- The order makes the build deterministic, however the data came in.
- Refusing a clash at save tells the person who chose the address, at the moment they chose it.

## Considered and rejected

- **A number added to a held slug.** It changes the address silently.
- **The post always winning.** An Admin's campaign rule would stop answering, and nobody would know why.
- **A rule able to shadow a post.** The post would be live but unreachable.
