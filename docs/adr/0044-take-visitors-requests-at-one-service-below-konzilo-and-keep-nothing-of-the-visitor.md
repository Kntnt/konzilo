# ADR 0044: Take visitors' requests at one service below `/_konzilo/`, and keep nothing of the visitor

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice, within Thomas's decision of a small Node service per site (ADR 0001); Thomas may veto.

## Decision

- **Reserved paths.** Visitors' browsers reach a site's services at paths below `/_konzilo/`, on the site's own host and on its pre-launch address, behind its password there. Each service takes one path: `/_konzilo/search` goes to Typesense, and the rest to the service. No release page may be there; the checker and the build refuse one.
- **One program in two roles,** the `visitors` and `editors` containers (ADR 0005), under limits, with SQLite (`node:sqlite`) in a volume of the customer's own. Only `editors` reaches the source repository. It has no database server.
- **It accepts only kinds the core registers.** Each kind has a path, methods, content types, a size limit, a check and storage. A kind takes the requests to its path and every path below it. It may answer with JSON, `429` with `Retry-After`, or `303` back to a path on the site. The service refuses a method a kind does not take, a body over its limit and a body of a type it does not take, and answers `no-store` and `nosniff`. It never sets a cookie.
- **Limits:** each request within ten seconds and 64 MB; the web server cuts a body off at a megabyte, or a kind's own higher limit; over-limit bodies are refused by length, unread.
- **The web server passes on** the request's method, path, query, body with its type and length, the visitor's address, and `Origin`, `Referer` and `Sec-Fetch-Site`, and nothing else: no cookie, browser, password or language. It keeps no log of these requests.
- **The service keeps them from every kind.** A kind gets only what it makes of them: whether the request came from a page of the site's own (`Sec-Fetch-Site: same-origin`, or, from a browser that sends none, an `Origin` or else a `Referer` on the host the request came to or one of the site's public hosts); and a keyed digest of the address and a window of ten minutes, with the window's end. The key comes from a secret in the service's data. **No IP address, user agent or referrer is kept,** and no log of the requests is written.
- **For editors,** on the admin host, each call checked against Forgejo: the check before saving, the list of titles, status, the preview gate, share links and the pages in Sveltia.
- **Timed duties:** mail for each pending submission, retention, spam after seven days, consent records after 13 months, violations after 30 days, expired share links, and unused previews.
- **What a build hands over.** At the switch, before visitors can send anything from a new release, the build hands the service that release's consent revisions. The service reads the forms from the site description of the code in use. A local copy works the same way.
- **Kept out of Git:** recipients lists, retention and the service's secret, in SQLite, edited on a page.
- **Its data joins** the archive, backups, restores and the drill (ADR 0006). A service down leaves the public pages answering; a form says it was not sent (ADR 0045).

## Why

- The page's own origin needs no CORS, and a Content Security Policy needs only `'self'`, and it works the same before and after launch and locally.
- A digest that changes every ten minutes counts one client and is gone with its window. It cannot be followed across windows, and no address is kept.
- Handing a kind the verdict alone keeps the address out of every kind's code, by construction.
- A store of its own lets backups, restores and archives carry what visitors send, and consent can be demonstrated.

## Considered and rejected

- **A services host per server.** It is cross-origin, so it needs CORS, policy entries and a certificate of its own.
- **The admin host.** It puts visitors on the login domain.
- **A beacon logged by the web server.** It loses request bodies.
- **No server-side records.** Consent could not be demonstrated.
- **A digest made by the web server,** or its rate limits. Caddy's standard build has no keyed hash among its placeholders and no keyed window.
- **A CSRF token.** No cookie or session authorizes anything here, so the origin is what matters.
