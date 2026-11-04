# ADR 0051: Write security headers and an enforced policy into each release

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: the Content Security Policy is generated at every build, enforced from the first day, an Admin adds the sources tags need, and violations go to a log. The rest is a technical choice; Thomas may veto.

## Decision

- **The build writes the headers into the release as `_headers`,** `/*`, then one indented `Name: value` per header. One set holds for every answer: HSTS for one year, with `includeSubDomains` only by opt-in and never `preload`; `nosniff`; `strict-origin-when-cross-origin`; framing by the site alone, or by the origins it lists; a permissions policy that turns off camera, microphone, geolocation, payment, USB, serial, HID and Bluetooth, and gives each feature an embed's player is given to the site and the players' origins; COOP `same-origin`.
- **`security` in the site description** holds the opt-ins: `includeSubDomains` and `frameAncestors`.
- **One policy per release,** enforced, also by share links. `'self'` first in every directive that loads: `default-src 'self'`; the SHA-256 of each inline script in `script-src`, of each inline style element in `style-src`, and of each distinct `style` attribute value in `style-src-attr` under `'unsafe-hashes'`, collected over every page as built, a `<template>`'s and a `<noscript>`'s content too; in `frame-src`, the player origins of the embed services the release's panels show; the registry's hosts per kind of request; `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `frame-ancestors`; last, reporting to `/_konzilo/violations`, as `report-uri` and `report-to`. Preview and share policies report nothing, so that editors' previews are not logged.
- **Never offered:** `'unsafe-inline'`, `'unsafe-eval'`, `*` alone, a scheme alone, `data:` or `blob:` for scripts, or a nonce.
- **The build fails** on an inline event handler or a `javascript:` address, naming the page and the element, and on a header longer than a host takes, 65,536 characters.
- **The host takes the file before the release is current,** so that the policy goes live with its pages: only names on its list, each once, printable ASCII, nothing the web server reads as its own. A file with anything else is refused whole, and the site keeps its release. The web server's own answers carry the headers too.
- **The dev server sends the same headers but the policy,** of which it sends the framing part alone, since its own code is inline.
- **Reports** are kept by the service as counts of page path, directive and blocked origin, with no IP address, user agent or referrer, for 30 days after an entry was last seen. It takes `application/csp-report` and `application/reports+json`, at most 100 reports in a body of at most 128 KiB. Of each it keeps the path without its query, at most 300 characters, the effective directive, and what was blocked: the origin, the scheme alone, or `inline` or `eval`. A browser extension's scheme is dropped. It refuses reports not from the site's own pages, and counts at most 100 of one client in ten minutes. Past 1,000 entries a new combination counts into one entry for the rest. An Admin reads them on *Policy violations*.
- **The admin host** has a policy of its own for Sveltia, and basic headers, and hosts no editor-written HTML.

## Why

- Astro's `<meta>` policy cannot control framing or send reports.
- Hashing attribute values keeps the content files unchanged.
- Every report holds the whole policy, so a limit of a few kilobytes would refuse every report of a site with many hashes.

## Considered and rejected

- **Headers in the web server's site file.** Only a release's build knows the hashes of its code.
- **Astro's meta policy alone.**
- **`'unsafe-inline'` for tags.**

## What practice has shown

- In Compose the web server has no admin endpoint, and no container may reach another's signals, so Caddy runs with `--watch`, and a release's rules lie beside its pages, imported by a glob, since a file named outright that is not there stops the server before the first build. It looks each second, so a new policy goes live up to a second or two after `current` has moved. It reloads only when the rules have changed, which a publish seldom does, and a reload closes idle connections.
- Caddy's `header` reaches a redirect, a 404 and a 410 alike.
