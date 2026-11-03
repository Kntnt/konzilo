# ADR 0007: Sign in through the customer's own Forgejo, with two factors for everyone, and close the rest at the proxy

**Date:** 2026-11-03 · **Status:** Accepted as a technical choice; Thomas may veto. It carries out his settled decision of one Forgejo per customer (ADR 0004).

## Context

The admin host is reachable from the internet, and a login reaches a customer's content. Nothing may get past the second factor.

## Decision

- **Forgejo's closed settings:** no registration, sign-in required to see anything, no user list, `GLOBAL_TWO_FACTOR_REQUIREMENT = all`, no Forgejo SSH, `LOGIN_REMEMBER_DAYS = 0`. Sveltia's OAuth application is a public client per admin host, with PKCE only and no token sign-in.
- **Only these paths reach Forgejo:** `/user/login*`, `/user/two_factor*`, `/user/webauthn*`, `/user/logout`, `/user/forgot_password`, `/user/recover_account`, `/user/settings/security*`, `/login/oauth/*`, `/assets/*`, `/avatars/*`, `/api/v1/*`, `/api/forgejo/*`, `/api/healthz`, `/<org>/<repo>.git/info/lfs/*`, `/<org>/<repo>/media/*`, `/<org>/<repo>/raw/*`. Refused within those: `/api/v1/users/*/tokens*`, `/api/v1/user/applications/*`, `/api/v1/user/keys*`, `/api/v1/user/gpg_keys*`. The block stands from the first start, since a token made before it goes on working.
- **The proxy removes `X-Real-IP`** on its way to Forgejo (`header_up -X-Real-IP`), and the jail against guessing reads the proxy's own log (hosting).
- **The consent page answers itself:** a template override, `custom/templates/user/auth/grant.tmpl`, clicks `#authorize-app`. It is safe only because the allow-list leaves one OAuth client per Forgejo, and is checked at each raise.
- **Every person sets up a second factor before anything else.** An account with none is refused everywhere, tokens included. People are individual accounts, and someone who works for two customers has an account at each.
- **Machine accounts are enrolled too,** through the web forms, since there is no API for it. One read-only account per site, for `builder` and `editors`. An instance credential held by the hosting layer, or by `konzilo` in Compose, for provisioning, restore and erase.
- **First passwords come through an emailed link,** since whoever knows a new user's password before that user first logs in can set up a second factor of their own. A user who loses every method needs the operator, through a logged job.
- **A local account logs in with both factors as well,** with a code from a fixed key, so that the suite tests the login it ships.
- **Sveltia keeps its scope patch** (ADR 0029). A raise that changes the scopes deletes the grants.
- **Updates.** A digest in `versions.env`, raised by the update flow. A security release is raised without waiting for a core release.

## Why

- No Forgejo setting turns tokens off, so the proxy is the one place to close them.
- A second factor that a stray credential can step around is no second factor.

## Considered and rejected

- **A local login without the second factor.** The suite would never test the login it ships.
- **Codes from the first login without an app.** The first password comes through an emailed link anyway, so it proves the same address twice.

## What practice has shown

Forgejo 17.0.1:

- The login form and the enrolment form take no CSRF token from a client without a browser's headers. The enrolment page shows the key once, as "Or enter the secret: …", so the seed reads it there and keeps it: a local account's key is fixed for the life of that copy, not across copies. A code enrolled with may not work at the next login until the period has passed.
- A forgotten password's routes are `/user/forgot_password` and `/user/recover_account`, the second being the link in the mail, so a first password and a reset both go through the proxy. Whether a reset keeps the second factor is to be tried when a copy has mail.
- Caddy runs `handle` before a bare `respond`, so a refusal must be a `handle` of its own, first. A test tries the token routes with both factors, in several spellings.
- Forgejo's pages link `/manifest.json`, which WebKit alone asks for, and the proxy leaves closed.

- `manage_credentials` does not exist. A password alone gets nothing: API, Git and token creation all answer 401. But password and code through `X-Forgejo-OTP` make a token that needs no second factor from then on, and it wrote to the repository. The form at `/user/settings/applications/tokens/new` is open to a signed-in user too. With the allow-list, sign-in, saving and LFS all work.
- The login form's remember box gave a cookie that alone reached settings and the token form for 31 days, with no password or code. With `LOGIN_REMEMBER_DAYS = 0` the cookie alone leads to the login page. The box still shows until a template hides it.
- The consent page shows at every sign-in for a public client, and `skip_secondary_authorization` has no column. The override removed it in all three engines.
- A sign-in with other scopes than the stored grant fails with `a grant exists with different scope`, which Sveltia shows as "Failed to receive an authorization code".
- An account with no second factor gets 403 from the API, and Git is sent to the login page.
- An access token lives 1 hour and a refresh token 730 hours, so a token taken from `localStorage` lasts a month. Worth shortening. Refreshing is silent, and a save after expiry works. If the grant is gone, Save says "Failed to refresh the access token" and the draft stays in the form, but after a reload it is lost, with no offer to restore it. A short refresh life would make this more common.
- Forgejo logged a forged address, `Failed authentication attempt for anna from 203.0.113.9`, since Caddy passes on `X-Real-IP`. Caddy's own `client_ip` was right every time. `header_up -X-Real-IP` fixes Forgejo's log too.
- In Safari, a click on the sign-in button about 0.4 s after a reload opened no popup and gave no message; waiting 0.8 s worked. It was not repeated enough to say more.
