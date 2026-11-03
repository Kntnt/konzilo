# ADR 0003: Keep every service and name of Kntnt's replaceable

**Date:** 2026-11-01 · **Status:** Accepted, settled by Thomas on 2026-11-01: services and domains specific to Kntnt are replaceable, and the core runs without them, as a stated principle, because Konzilo may become open source.

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

## Why

A local copy has none of the external ones, so every acceptance run proves the rule.

## Consequences

- A run with no adapters is the default for Compose, and a server test proves the same on a real server.
