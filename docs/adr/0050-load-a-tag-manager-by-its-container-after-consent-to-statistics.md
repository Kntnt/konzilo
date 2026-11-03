# ADR 0050: Load a tag manager by its container, after consent to statistics

**Date:** 2026-10-29 · **Status:** Accepted. Settled by Thomas on 2026-10-29: a container ID instead of free code, Matomo Tag Manager only for now, and a setting that names the tag manager. The rest is a technical choice; Thomas may veto.

## Decision

- **The group `tagManager`:** `manager`, `None` or `Matomo Tag Manager`; `address`, `https://` and a host; `container`, eight letters and digits; and who runs the instance, `name`, `country` and `privacyPolicy`.
- **The container loads only on a release built for the launched customer's domain,** which the host says with `KONZILO_LAUNCHED=1` beside `KONZILO_ORIGIN`. It never loads at the pre-launch address, in the preview, behind share links or locally.
- **It loads after consent to statistics,** in the same page view. Loading before consent is only the declared departure (ADR 0049).
- **Konzilo pushes one documented event into `_mtm`,** `{ event: 'konzilo-consent', konziloConsent: { categories, services } }`, when the stored choice is read and at every change, so tags fire on triggers. The container starts from a script file of the site's own, since a static site has no nonce and inline tags cannot run.
- **The tag manager is a statistics service in the registry,** with Matomo's storage and the instance's host. An instance run outside the EU and EEA is a transfer.

## Why

- The ePrivacy directive to the letter.
- One way into the policy and the declaration.

## Considered and rejected

- **Free code fields** (Thomas).
- **Container first, cookieless until consent, as the default.**
