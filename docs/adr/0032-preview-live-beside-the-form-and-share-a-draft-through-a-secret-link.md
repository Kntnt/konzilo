# ADR 0032: Preview live beside the form, and share a draft through a secret link

**Date:** 2026-11-02, amended 2026-11-10 · **Status:** Accepted. Settled by Thomas: a live full-page preview (2026-11-02); a click in it leads to its block in the body field (2026-11-05), while the focus stays in the preview (2026-11-10); an editor can share a draft with someone who has no login, through a secret link that lasts a few days and can be revoked (2026-10-27). The rest is a technical choice; Thomas may veto.

## Decision

**The live preview.**

- A preview template in Sveltia sends the draft, debounced, to the preview's gate. The gate runs the intake with `preview` naming the posts someone is looking at, which are checked and written whatever their status and date, into the preview's own content folder, and answers with any refusal and the page's address. Astro's dev server has the page drawn again in an iframe, with no empty frame between ([ADR 0067](0067-draw-the-live-previews-page-again-under-a-view-transition-and-keep-its-scroll.md)), laid out at 1,280 pixels and scaled down to a narrower panel, never up: a wider one shows the page at its own size, as wide as the panel ([ADR 0064](0064-let-the-preview-stand-where-an-editor-wants-it-and-show-a-field-its-block-and-back.md)). The scroll position stays. A refused draft leaves the last good page, with the reason above it. Two editors' drafts stand side by side, and one nobody has touched for 15 minutes goes.
- **One program in the `preview` container,** `bin/konzilo-preview.js`, holds the gate, the runs and the dev server, and shares the web server's network, so that the web server alone reaches it. It reads the source through a checkout outside the site's root, with a credential of its own that can only read, in a volume of its own. Being alone there, it needs nothing of the Node service, and a fault in one does not touch the other.
- **On demand.** Its dev server starts when an editor opens an entry and stops after 15 minutes idle, and the container runs under its limits. A server setting caps how many run at once, where many sites share a server, which is the hosting layer's. Past the cap, the pane uses a static preview build instead, at 1–3 seconds per pause.
- **Its own origin,** `preview.<site>.konzilo.app`, since the admin host holds a write token in the browser and a page there must never show editor-written content. Only a browser that has shown write access through Forgejo gets a session, in a host-only cookie lasting an hour, which the pane opens anew as needed. Nothing here keeps the token it was shown. Every answer carries `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private`, and `frame-ancestors` for the admin host alone in place of the framing the site's own headers would send, which would refuse the pane.
- **The page stays.** A frame is not a browser: whatever would load something else in it would take the editor away from what they are working on, so nothing does. A guard in each of the live preview's pages stops a link, a form, an assignment to `location`, a refresh in a tag, a new window and a step in the browser's history, which could otherwise take the editor around the frame with it, in WebKit, and tells the pane where it was going. A reload stays, since it is how the dev server shows a change, and so do the page replacing itself with its own address, the same path and query, by which that change is drawn without an empty frame (ADR 0067), and a step within the page. No script can stop a redirect, so the gate answers a frame's request for one with `204`, which leaves the frame as it is, while a tab of its own and a page's own requests follow theirs.
- **The pane says what would have happened.** For a few seconds, over the page, so that nothing on it moves, it says where a link goes on the public site, and, from the gate, which asks the dev server, the same rules as the public site's, what a visitor would meet there: a redirect's last target, no page, or a circle. A draft's own address is looked at before the frame goes there, and one that redirects is never shown: the last good page stays, with where it leads above it.
- **Nothing goes round.** The frame never follows a redirect, so no page runs again to try anything again. A draft's address is looked at once, and asking where an address leads stops at a circle, or after ten steps. A page's script that keeps trying is told of once for each address, and a few times in all, each attempt being stopped either way. A click is told of each time, since a person made it. A page that reloads itself, by a script or a refresh in a tag, is the one thing left alone: it loads nothing else, and looks like the dev server's own reload.
- **A click on the page shows its block in the body field.** In the live preview alone, each block the body's Markdown makes carries `data-konzilo-block` with its number, each footnote counting as one, and a component or a list of posts gets a wrapper of its own with the same, which a site's styles never see (`display: contents`). A script in each page outlines the block under the pointer, and a click that selects nothing posts the block's number and its text to the pane around it, which takes it only from its own frame on the preview's origin. The field scrolls to the block of that number if it begins with the same words, or else to the nearest block that does, since the draft may have changed after the page was made, and frames it, while the focus stays in the preview ([ADR 0064](0064-let-the-preview-stand-where-an-editor-wants-it-and-show-a-field-its-block-and-back.md)). A click on a link, a button or a form's field is left to them.
- **Its gate stands before its certificate exists.**
- **A preview has none of these:** no sitemap, robots, feeds, `llms.txt` or not-found counts, search says it is not there, a form says it is a preview and cannot send, and its policy reports nothing. The gate passes only pages and their assets. Its file access stays inside the site's root, so no secret is in reach; a test proves this. Editors can read the site's code through it, which is accepted.
- **An unsaved image** has a `blob:` address in the draft, so the template sends the file too, and the preview's intake makes its master. The SVG check runs there as well.
- **The preview has a copy of the site's code of its own,** without a local copy's secrets, so that a dev server and a build never share an `.astro/`.
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
- In a frame sandboxed against moving what is around it, `history.back()` still took a whole page back in WebKit 27.2, though not in Chromium 156 or Firefox 157. Every other way out came to the Navigation API's `navigate` event in all three, and could be stopped there, though `userInitiated` does not tell a click from a script alike in each. A link to a new tab or to the frames around comes to no such event: the sandbox refuses it, and says nothing.
