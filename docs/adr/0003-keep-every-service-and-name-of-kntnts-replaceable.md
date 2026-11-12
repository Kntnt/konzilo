# ADR 0003: Keep every service and name of Kntnt's replaceable

**Date:** 2026-11-01, amended 2026-11-12 · **Status:** Accepted, settled by Thomas on 2026-11-01: services and domains specific to Kntnt are replaceable, and the core runs without them, as a stated principle, because Konzilo may become open source. Settled on 2026-11-12, when the forms' submissions were first mailed, as technical choices Thomas may veto: the mail adapter, `none` until an Admin chooses SMTP, is chosen with its settings by an Admin on the editor's *Mail* page and kept in the service's data, beside each form's recipients, rather than in a settings file in Git, since its password is a secret and its recipients are where visitors' messages go (ADR 0044); SMTP is spoken with Node's own sockets, by STARTTLS, which is never left out where it was chosen, by TLS from the first byte, or by neither, for a relay in the same network, with a password sent only encrypted and the server's certificate checked; a local copy writes each mail to the service's log, as it would have been sent, and sends none, by `KONZILO_MAIL_TO_LOG` in Compose, on by default and turned off by a server, whichever adapter an Admin chooses; the password kept is for the server, the port and the username it was given with alone, and asked for again where any of them changes, so that it never signs in to another server; and a mail that could not be sent is said on the *Mail* page by its kind, with the server's reply, its code and its text, and nothing else of the server's or of Node's.

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
- DNS, monitoring and the GitHub App belong to the hosting layer. Backups and hosts are the core's settings, in a server's settings file, since one's own server needs them too, and Kntnt's own values live in Kntnt's server settings. The forms' mail is the core's too, and a site's own setting: its adapter is chosen, with its settings, in the site's settings, which are kept in the service rather than in a file, since they hold a password, and set by an Admin on the *Mail* page, Kntnt's own values as any other's. All a server's settings say of it is that the server sends, which a local copy does not.
- **The forms' mail** goes through the adapter an Admin chooses on the editor's *Mail* page, `none` or SMTP, kept in the service's data with its settings, and is off until an Admin turns it on. A local copy writes each mail it would send to the service's log, and sends none, until a server turns that off by `KONZILO_MAIL_TO_LOG`. Forgejo's own mail is not built yet.

## Why

A local copy has none of the external ones, so every acceptance run proves the rule.

## Consequences

- A run with no adapters is the default for Compose, and a server test proves the same on a real server.
