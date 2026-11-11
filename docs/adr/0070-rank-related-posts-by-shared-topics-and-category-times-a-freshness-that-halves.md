# ADR 0070: Rank related posts by shared topics and category, times a freshness that halves

**Date:** 2026-11-11, amended 2026-11-11 · **Status:** Accepted. Settled by Thomas on 2026-11-10: the related posts under an article are chosen by the core, three by default; a point for each shared topic and half a point for the same category, times a freshness of 2^(-age / half-life); the half-life a setting, 90 days by default, which can be switched off; the newest first at a tie, and a score of zero never shown; and a ranking that does not change by itself between builds. Settled by Thomas on 2026-11-11: the list is *Recommended reading*, *Rekommenderad läsning* in Swedish, since it is chosen by what the article is about but does not promise that each post is about the same; and it is an article's, which always has a date, its moment of publishing, so no candidate without a date stands among those with one. The rest is a technical choice; Thomas may veto.

## Decision

- **One ranking.** A post list ordered as related and `relatedPosts()`, the helper a template calls for the recommended reading under a post, rank alike, through the one evaluator, `src/post-lists.js` ([ADR 0039](0039-write-a-post-list-as-a-directive-evaluated-at-every-build.md)). The helper lists the post's own type without the post itself, three by default, which a template changes with `number`.
- **The score.** In a list of the built-in article, a candidate scores a point for each topic it shares with the post and half a point for the same category; an author scores nothing. In a list of any other type, each term it shares, of any taxonomy, scores a point. What each taxonomy's terms score is in `src/format/built-in-types.js`, `relatedPoints()`, and the evaluator is handed it.
- **Freshness.** Each score is multiplied by 2^(-age / half-life), the age from the candidate's date to the build's moment. A candidate without a date is not decayed.
- **The order.** Highest first, then the newest, then by title. A candidate that scores nothing is never shown, and the list is never padded: fewer than three where fewer share a topic or the category, none where none does.
- **The half-life** is a setting of the core's settings group *Related posts*, `related`, in days, a whole number from 1, 90 by default, beside *Freshness*, on by default, which switches it off; off, the score alone decides, then the date. The group applies to a site with articles or a taxonomy of its own. The build reads it from the main language's settings, which every language shares.
- **Drawing them is the template's,** and the design system's: from none to three cards, with neither heading nor list where there are none ([ADR 0068](0068-render-a-sites-lists-layout-and-text-roles-in-the-design-system-and-check-them-in-the-core.md)).

## Why

- A topic says what an article is about, more narrowly than its category, so it counts for more. An author says who wrote it, not what it is about.
- Without freshness, the old article that shares most would rank first under every new one on its subject, for ever. A half-life gives the site's own pace the say: a site that publishes every day wants a short one, a site that publishes a few times a year a long one.
- Every candidate ages as much as every other between two builds, so the ratio of two candidates' freshness, and their order with it, does not depend on when a build runs, and a static site needs no nightly build to stay right. The evaluator ranks by log2(score) + date / half-life, which orders as the score times its freshness does and leaves the build's moment out for every candidate with a date, so the order is the same to the last bit. That rank is rounded to a billionth of a halving, so that two candidates whose scores times freshness are the same tie, and fall to the newer.
- One function for both keeps a list ordered as related and the recommended reading in agreement, and a template never ranks posts itself.

## Considered and rejected

- **The number of shared terms alone, of every taxonomy alike.** An author would count as much as a topic, and the oldest article that shared most would stay first.
- **A cut-off age,** past which a candidate is left out. It would drop a strong match for its age alone, and a list would change by itself between builds as articles pass it.
- **Padding with the newest posts** where too few share a term. A visitor would be shown something unrelated.
- **A half-life of 0 for no freshness.** A switch says what it does; a zero in a field of days does not.

## Consequences

- ADR 0039's order *related* is this ranking.
- A type's posts either all have a date or none has one, since a post of a type with a date always has one ([`content-format.md`](../../content-format.md)), so a list never weighs a candidate that decays against one that does not, and its order never changes by itself.
- Every settings file of a site with articles or a taxonomy holds the group `related`, at its defaults where an Admin has set nothing.
- The site template's article shows the recommended reading after its main content, through `relatedPosts()`: the cards by the rule of [ADR 0068](0068-render-a-sites-lists-layout-and-text-roles-in-the-design-system-and-check-them-in-the-core.md), under a heading in the page's language, `pageTexts().recommendedReading` ([ADR 0066](0066-translate-the-editors-texts-through-catalogues-in-an-interface-language-of-its-own.md)), and neither with none. `tests/site-template.test.js` holds it.
