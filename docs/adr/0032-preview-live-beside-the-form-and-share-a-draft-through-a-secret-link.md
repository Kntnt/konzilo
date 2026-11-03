# ADR 0032: Preview live beside the form, and share a draft through a secret link

**Date:** 2026-11-02 · **Status:** Accepted. Settled by Thomas: a live full-page preview (2026-11-02); an editor can share a draft with someone who has no login, through a secret link that lasts a few days and can be revoked (2026-10-27). The rest is a technical choice; Thomas may veto.

## Decision

**The live preview.**

- A preview template in Sveltia sends the draft, debounced, to the service. The service runs the intake for that post, with `preview: true`, into the preview's content folder, and answers with any refusal. Astro's dev server reloads the page in an iframe, scaled from 1,280 pixels to the panel, and the scroll position stays. A refused draft leaves the last good page, with the reason above it.
- **On demand.** The `preview` container starts when an editor opens an entry, stops after 15 minutes idle, and runs under its limits. A server setting caps how many run at once. Past the cap, the pane uses a static preview build instead, at 1–3 seconds per pause.
- **Its own origin,** `preview.<site>.konzilo.app`, since the admin host holds a write token in the browser and a page there must never show editor-written content. Only a browser that has shown write access through Forgejo gets a session, in a host-only cookie. Every answer carries `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private`.
- **Its gate stands before its certificate exists.**
- **A preview has none of these:** no sitemap, robots, feeds, `llms.txt` or not-found counts, search says it is not there, a form says it is a preview and cannot send, and its policy reports nothing. The gate passes only pages and their assets. Its file access stays inside the site's root, so no secret is in reach; a test proves this. Editors can read the site's code through it, which is accepted.
- **An unsaved image** has a `blob:` address in the draft, so the template sends the file too, and the preview's intake makes its master. The SVG check runs there as well.
- **Each Astro run has an `.astro/` of its own,** through a hook of Node's module loader on Astro's `createSettings()`, since Astro has no setting for that folder. An upgrade of Astro that moves it fails a test.
- **A deploy stops the preview** and removes each share's release, so that the next asks anew from the new code.

**Share links.**

- **A link is `https://<preview host>/share/#<secret>`,** never on the admin host, whose browser storage holds the write token and which holds no cookies (ADR 0001, ADR 0004). It is open three days or until revoked, never extended. The secret is 32 random bytes in base64url, in the link's fragment, which a browser never sends to a server. The store holds only its SHA-256, so a copy or a backup opens no draft, and the secret is shown once.
- **Following the link.** `/share/` answers a page that loads nothing (`default-src 'none'`, its one script allowed by its hash), sends no referrer and is never kept. Its script takes the secret out of the address bar and posts it. An open link sets a cookie for the share's own address alone (a `__Secure-` name, since `__Host-` needs the path `/`; `Path=/share/<ID>/`, `HttpOnly`, `Secure`, `SameSite=Lax`), expiring with the link, and leads on with 303. The service answers below `/share/` from the share's static build, so a link never reaches the dev server on that host. Any other secret gets 403.
- **What it shows:** a static preview build of the published posts and that one draft, as its latest saved version, nothing else of any draft, and never the dev server. It is the exact build, under the enforced policy.
- **Checked on every request.** A link refused, expired or revoked gets 403 at the next request, a page with no word of the draft. The log never holds the cookie or the post.
- **A field in the post's form makes, lists and revokes them.** Whoever may edit a post may share it while it is not yet published. Erasing a post deletes its links. A customer with market-sensitive information turns them off (ADR 0004).

## Why

- A dev server is the only way to feel live. Starting it on demand answers its memory cost, an origin of its own and the session answer its reach, and static share links keep it from people without a login.
- A fragment is the only part of an address no server, proxy, log or `Referer` sees.
- Checked on every request: revoking takes effect at the next page.

## Considered and rejected

- **A static rebuild as the live preview.** Too slow to feel live.
- **The preview on `konzilo.net`.** Safari blocks a cookie in a frame from another site, so the panel would have to become a separate window.
- **The dev server for share links.** It would open the site's source to people without a login.
- **A secret in the path or the query.** In every log, in referrers, and in what a link preview fetches.
- **Signed links that need no store.** One cannot be revoked without storing it after all.
- **The secret stored as it is.** A copy would open drafts.
- **A lifetime the editor chooses.** One more control; a new link gives three more days.
- **Rendering on request.** Templates would read content through another API.

## What practice has shown

- First page after 13.3 s cold, 9.8 s warm, in the read-only hardened container; 590–790 MB, under a 1.5 GiB cap. A written file shows on the page after 1.5–1.8 s.
- An outside address asked for `preview.b…` within about 11 seconds of the proxy's start, on a name told to nobody, probably from the certificate logs.
- A dev server and a build in one root write `.astro/content-assets.mjs` and `content-modules.mjs`, and each loads the other's: 500 on pages with an image, and `LocalImageUsedWrongly` in a build.
- A dev server's pages differ a little from a release's, in bundling and in the policy they send.
