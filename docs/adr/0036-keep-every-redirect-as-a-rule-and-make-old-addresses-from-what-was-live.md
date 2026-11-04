# ADR 0036: Keep every redirect as a rule, and make old addresses from what was live

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: one list of every rule, with `301`, `302`, `307`, `308`, `404` and `410`; an automatic `301` from each address a post had while it was live; imports and regular expressions, the Admin's alone; other addresses that answer `301`, `302` or show the post. The rest is a technical choice; Thomas may veto.

## Decision

- **A rule** has a source, an exact root path with an optional query string, or a pattern; an answer, `301`, `302`, `307` or `308` with a target, `404` or `410`, or, for a post's other address, *show*: the post's own page there too, with the post's own address as canonical, from a path without a query; and a target, a post or term by ID, a site path, or an `https://` address. A typed path that is a published post's current address is kept as that post.
- **Who.** An Admin keeps the site's rules in `redirects.json`, on the Redirects page. Whoever may edit a post gives it other addresses, in a list field. A rule that leads to a post belongs to it, and goes with it.
- **Old addresses from what was live.** The ledger records the address at which the current release shows each post, and it stays while the post is off the site. A build that publishes a post at another address makes the last live address an automatic `301`. None is made when something higher in the order holds that address, and an address never live makes none. The rule goes when another post goes live there, or when the post returns. Publishing at an old address is never refused. An Admin may change an automatic rule, which then becomes an other address or a rule of the site's, or remove it, and it comes back only if the post is live there again and leaves.
- **The content files.** A post's: `oldAddresses`, and `otherAddresses: [{"address":"/campaign/","answer":302}]`, sorted. The site's: `content/redirects.json`: `{ "rules": [ { "from", "to", "status" } ] }`, the exact rules sorted, then the patterns in the list's order as `{ "pattern", "to", "status" }`; `{ "rules": [] }` when there are none. Editors' rules and the intake's derived ones are apart in source.
- **Matching.** A source that ends in a slash also matches without it. The visitor's query is kept unless the source or the target has one. A source with a query matches a request with exactly those parameters, in any order, and one without matches whatever the query.
- **Patterns** match the whole path, as the browser sent it and without its query, and begin with `^`. Targets may use `$1`–`$9`. At most 100 patterns, each at most 500 characters. The grammar is the part of RE2's syntax that JavaScript's and Go's regular expressions read alike, so that the dev server and Caddy answer each request the same: characters a path may hold, `.`, classes, `\d`, `\w`, `\s` and their opposites, `\b`, escaped punctuation, `( )`, `(?: )`, `|`, `*`, `+`, `?` and counts up to 1000, each lazy with a `?`, and `$`. Everything else is refused, naming it. The cases are one file, read by every implementation's tests. A pattern answers last, never below `/_konzilo/`, never at a path none of the site's addresses has the form of, and a target that would begin with `//` answers nothing.
- **Checks.** Refused: a loop, a held source, a reserved source, a source with more than ten query parameters, a pattern that does not compile, matches its own target (each group filled with `x`, nothing, `X`, `1` or `x/x`), names a group it has not, leads to a post or is already in the list, a 101st, and a *show* from a source with a query or to anything but a post. Warned of: a chain, a target post not published, and the start page as a target. `preSave` and the intake run the same checks.
- **Astro and the web server.** The dev server answers every rule. A build writes a redirect page for each 3xx rule from a path, a copy of the post's page for each *show*, and `_redirects`, sorted: `<source> <target> <status>`, or `<source> <status>`, then patterns as `^<pattern> <target> <status>`. The web server answers them before any file, by the address as the browser sent it. **`_redirects` is untrusted:** the host takes only lines it can tell are safe, every character one a Caddyfile gives no meaning, checks the result, and puts a refused file back. No sitemap, list or link holds a rule.
- **CSV** on the Redirects page: the columns `from`, `to` and `status`, named on the first line in any order, `status` `301` when left out; UTF-8 with or without a BOM; commas or semicolons, whichever the first line uses; at most 50,000 rows. **A preview** before anything changes: each row *added*, *unchanged*, *replaces a rule* or *refused*, with the reason. A row whose source has another rule is refused unless the Admin ticks *Replace*. The import commits to the source repository and asks for one build. **The export** gives the whole list in the same columns, and imports back unchanged.
- **Erasure** removes the rules that lead to the post and the site's rules from or to any address it had (hosting).

## Why

- The live address is what visitors knew, whatever a slug history says.
- A post's rules in its own file go with an erased post, and since a target is written as the post's current address, nothing chains.
- RE2 runs in linear time and is Caddy's own syntax, so no pattern can be slow online.
- CSV needs no library, and every spreadsheet saves it.

## Considered and rejected

- **Old slugs alone.** They miss a post renamed while unpublished, a page moved under another parent and a change of a type's address.
- **Every rule in one file.** Every rename would change two files, and erasure would rewrite a shared file for every post.
- **The meta refresh alone online.** It answers with `200`, and only browsers and some crawlers follow it.
- **Astro's `redirects` in the dev server.** They are read when it starts.
- **PCRE's syntax.** Patterns could be slow online, and Caddy does not read it.
- **XLSX now.** It needs a library.

## What practice has shown

Thousands of rules with parameter permutations would make a large configuration: online, a source of four parameters or more is one regular expression, which also matches a query that repeats a parameter in place of another, which no link sends. Caddy's `path_regexp` matches the decoded and cleaned path, which the dev server never sees, so patterns go through a `map` of the path as the browser sent it. Whether a list of thousands in one Sveltia file holds needs testing.

In Compose (`src/build/web-server.js`), with Caddy 2.11:

- `{http.request.orig_uri.path}` is decoded, though not cleaned, so an exact rule is looked up by its source with its percent signs read: `ö` and `%C3%B6` answer alike. A source where reading one would say another path, `%2F` say, goes by the whole address instead, as does a source with a query. A pattern sees the decoded path, so a pattern for a path outside ASCII is written as Caddy sees it, which the dev server does not.
- `map` takes one row per input and errors on two, so a rule's own source goes before what another's last slash adds. It takes the first match in the order written, so patterns stand last.
- `error` reads a lone placeholder as a message and answers 500, so `404` and `410` each have a matcher of their own.
