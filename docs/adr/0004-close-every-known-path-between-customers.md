# ADR 0004: Close every known path between customers

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02. His bar: no way into another site than one's own, since some customers prepare market-sensitive press releases here. He weighed one Forgejo shared by a server's customers, and chose one per customer. The login cookies are a technical choice he has seen.

## Context

No one can honestly promise a risk of zero. So the bar means that every known path is closed, and that tests prove it stays closed.

## Decision

- **A Forgejo per customer,** as its own container with its own files and accounts. A login or a token from one customer is worthless at another, since they are separate systems. A customer with several sites has one Forgejo for them.
- **A network per customer.** One customer's containers cannot reach another's at all. Only the web server crosses, and it holds no content, only the static pages it serves.
- **Cookies.** Every login and session cookie, Forgejo's and the preview's, has the `__Host-` prefix, and is `Secure` and `SameSite`; a share link's cookie is bound to its own path instead (ADR 0032). A browser refuses such a cookie from any other host. The admin hosts hold no cookies at all.
- **An attack in the suite.** An acceptance test, with two customers on one server, has a page on one customer's hosts try to set and send cookies to the other's, use a token across, and reach the other's containers. Every attempt must fail.
- **The Public Suffix List.** Kntnt applies to list `konzilo.app`, so that browsers treat each customer's name as a site of its own. It is an extra layer that nothing relies on: the list may decline a small project, and it promises no time.
- **What faces visitors holds no drafts.** The container that takes visitors' requests holds no credential for the source repository and mounts none of it.
- **The login is never on the public address.** `/konzilo` only leads to the admin host. A script on the public site, such as analytics, could otherwise read an editor's write token.
- **Market-sensitive customers get a server of their own,** built and run as any other, and a setting turns off their share links. A draft or a scheduled press release has no published file, no search entry and no feed entry until its time.
- **Agents hold no credential for any customer's Forgejo** (ADR 0010).

## Why

- A Forgejo per customer costs little and removes much. One measured 114 MB of memory when idle and started in 1.1 seconds. In return, restoring, erasing and backing up never touch another customer.
- Sharing stays the default for everything else, since administration time grows with every server.

## Considered and rejected

- **One Forgejo shared by a server's customers,** or on a server of its own. It is cheaper, and one thing to patch, but a fault in one program could expose every customer's drafts and accounts, and customers' restores and erasures would touch shared state.
- **Sveltia on a customer's public address, such as `www.namn.tld/konzilo/`.** Every script on the public site could read the write token. A redirect gives the same ease.
- **`/admin` as the shortcut.** Bots scan it, and a customer may have a page there.

## What practice has shown

- A's Forgejo cannot reach B's by name or address, and A's token gets 401 at B.
- `__Host-forgejo_session` and `__Host-forgejo_remember` take the prefix. `lang` and `redirect_to` have fixed names and cannot; both are `Secure`, `HttpOnly` and `SameSite=Lax`. A `redirect_to` planted from a parent domain was not followed off the site. A planted `lang` changes the language, which is harmless.

## Consequences

What remains: root on a shared server, or an escape from a container to root, reaches every customer on it. A stolen login reaches that customer's content, even with a second factor. Kntnt itself has access. A fault inside one customer's Forgejo reaches that customer. This is why the own server exists.
