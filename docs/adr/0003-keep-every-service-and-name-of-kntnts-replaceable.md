# ADR 0003: Keep every service and name of Kntnt's replaceable

**Date:** 2026-11-01, amended 2026-11-12 · **Status:** Accepted, settled by Thomas on 2026-11-01: services and domains specific to Kntnt are replaceable, and the core runs without them, as a stated principle, because Konzilo may become open source. Settled on 2026-11-12, when the forms' submissions were first mailed, as technical choices Thomas may veto: the mail adapter, `none` until an Admin chooses SMTP, is chosen with its settings by an Admin on the editor's *Mail* page and kept in the service's data, beside each form's recipients, rather than in a settings file in Git, since its password is a secret and its recipients are where visitors' messages go (ADR 0044); SMTP is spoken with Node's own sockets, by STARTTLS, which is never left out where it was chosen, by TLS from the first byte, or by neither, for a relay in the same network, with a password sent only encrypted and the server's certificate checked; and a local copy writes each mail to the service's log, as it would have been sent, and sends none, by `KONZILO_MAIL_TO_LOG` in Compose, whichever adapter an Admin chooses.

## Decision

Nothing in the core may require a service or a name that only Kntnt has. Each concern is an adapter chosen in settings, and each can be switched off.

| Concern | Kntnt's choice | Without it |
|---|---|---|
| DNS | ClouDNS | Records are set by hand; the command says which |
| Mail, Forgejo's too | Postmark | SMTP, or none: a form keeps its submissions, and resets are done by command |
| Monitoring | NodePing | No checks, and `status` still answers |
| Off-site backup | Storage Box through restic | Any restic target, or none, with a warning |
| Core and code access | GitHub App | Public packages, or a token |
| Hosts | `konzilo.app`, `konzilo.net` | Any domains, from settings, with `/konzilo` as a redirect to the admin host |
| Search | Typesense | Optional |

- No code path in the core may test for a Kntnt name, and no default may point at one.
- DNS, monitoring and the GitHub App belong to the hosting layer. Mail, backups and hosts are the core's settings, since one's own server needs them too. Kntnt's own values live in Kntnt's server settings.
- **The forms' mail** goes through the adapter an Admin chooses on the editor's *Mail* page, `none` or SMTP, kept in the service's data with its settings, and is off until an Admin turns it on. A local copy writes each mail it would send to the service's log, and sends none. Forgejo's own mail is not built yet.

## Why

A local copy has none of the external ones, so every acceptance run proves the rule.

## Consequences

- A run with no adapters is the default for Compose, and a server test proves the same on a real server.
