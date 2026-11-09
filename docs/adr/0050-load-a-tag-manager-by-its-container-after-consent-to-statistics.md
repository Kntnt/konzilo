# ADR 0050: Load a tag manager by its container, after consent to statistics

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: a container ID instead of free code, Matomo Tag Manager only for now, and a setting that names the tag manager. The rest is a technical choice; Thomas may veto.

## Decision

- **The group `tagManager`:** `manager`, `None`, `Matomo Tag Manager` or `Matomo`, Matomo's own tracker; `address`, `https://` and a host; `container`, eight letters and digits, for the container; `site`, the site's ID in Matomo, and `cookieDomain`, optional, for the tracker; and who runs the instance, `name`, `country` and `privacyPolicy`. A site loads the container or the tracker, never both.
- **The container loads only on a release built for the launched customer's domain,** which the host says with `KONZILO_LAUNCHED=1` beside `KONZILO_ORIGIN`. It never loads at the pre-launch address, in the preview, behind share links or locally.
- **It loads after consent to statistics,** in the same page view. Loading before consent is only the declared departure (ADR 0049).
- **Konzilo pushes one documented event into `_mtm`,** `{ event: 'konzilo-consent', konziloConsent: { categories, services } }`, when the stored choice is read and at every change, so tags fire on triggers. The container starts from a script file of the site's own, since a static site has no nonce and inline tags cannot run.
- **The tracker loads under the container's rules:** on a release for the launched origin alone, and after consent to statistics, from the site's own script file with no inline code. It queues `setTrackerUrl` with the instance's `matomo.php`, `setSiteId`, `trackPageView` and `enableLinkTracking` into `_paq`, and loads the instance's `matomo.js`. With a cookie domain, for owners whose sites below one domain are counted as one, it also queues `setCookieDomain` and `setDomains` with `*.` and the domain; a domain the release's host is not at or below is left out, with a warning.
- **Under the departure `statisticsWithoutStorageBeforeConsent` (ADR 0049) the tracker loads at once** and counts without storage, which for Matomo means nothing stored and no device property read: it queues `requireCookieConsent` and `disableBrowserFeatureDetection` first. When the visitor allows statistics it queues `setCookieConsentGiven` and `enableBrowserFeatureDetection`, in the same page view, and on every later page view while the choice holds; at withdrawal `forgetCookieConsentGiven` and `disableBrowserFeatureDetection`, before the page reloads. With `privacySignals: "stop"` a browser that sends Global Privacy Control (`navigator.globalPrivacyControl`) or Do Not Track (`navigator.doNotTrack` or `window.doNotTrack` of `1`) loads no tracker at all. The container has no such mode.
- **The tag manager and the tracker are a statistics service in the registry,** `matomo`, with Matomo's storage and the instance's host; the tracker's cookies are on its cookie domain where it has one. An instance run outside the EU and EEA is a transfer.

## Why

- The ePrivacy directive to the letter.
- One way into the policy and the declaration.

## Considered and rejected

- **Free code fields** (Thomas).
- **Container first, cookieless until consent, as the default.**
