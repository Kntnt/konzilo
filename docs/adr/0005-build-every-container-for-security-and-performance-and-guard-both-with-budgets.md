# ADR 0005: Build every container for security and performance, and guard both with budgets

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02: since Docker runs everything, build it right from the first day. The details are technical choices; Thomas may veto.

## Decision

| Container | Holds | Runs | Network |
|---|---|---|---|
| `forgejo` | The vendor's rootless image at a pinned digest: accounts, repositories | Always, or started on demand later | Reached by the web server and the builder |
| `visitors` | The service's code alone | Up, and works when a request comes | Reached by the web server; reaches only the mail adapter |
| `editors` | The service's code; a read credential for the source repository | Up, and works while someone edits | Reached by the web server; reaches Forgejo |
| `builder` | The intake, Astro, Git, sharp | Up and asleep, with one build at a time, in Compose (ADR 0002); one build, then gone, where the hosting layer starts it | Reaches Forgejo through the proxy only, so a dependency's code cannot call out |
| `preview` | The gate, Astro's dev server, the site's code, the preview's files, a credential that can only read the source | Up and asleep, with the dev server only while someone edits, under a cap | Shares the web server's network, so that nothing else reaches it |
| Web server | Caddy at a pinned digest, without its file capability: static pages | Always; one per server in hosting | The only one with public ports |
| Typesense | The vendor's image: published text alone, with a key per site | Always; one per server in hosting | Its own network |

**Security, on all of them:**

- A non-root user, a read-only file system with temporary space in memory, every capability dropped, `no-new-privileges`, Docker's default seccomp profile, and limits on memory, CPU and processes.
- Built in several stages, with no compiler, package manager or shell in what runs, where the role allows it. The base image is chosen by measuring, with `builder` as the one that may need more.
- Images pinned by digest, signed, with a list of contents, and scanned in CI, which fails on a known vulnerability above an agreed level.
- Secrets as files in the container, never in the environment. No container gets Docker's socket.
- On a server, Docker runs with **user namespaces**, with a firewall and unattended updates.
- A rebuild whenever a base image has a security fix, through the update flow, for everyone running Konzilo.

**Performance:**

- A visitor's request meets only the web server and static files, compressed ahead of time, with no Node in the way.
- Volumes on local disk for what changes. Astro's cache and dependencies in layers and volumes, so that a build starts fast.
- On a Mac, `node_modules` in a volume and not shared with the host.
- Ports published so that Docker's network adds as little as it can. Measured, not assumed.

**Budgets in CI, each failing the run when broken:** image size, start time, idle memory per customer, time from save to the public page, and time to first byte of a page. "Best possible" is a direction, not a state: the numbers make it checkable, and they are raised as they are met.

## Why

Numbers make security and performance checkable, and keep them from eroding one change at a time.

## Considered and rejected

- **Rootless Docker.** Its default driver loses the client's address, so the jail against guessing cannot work; its alternative driver is five times slower.
- **Caddy's vendor image as it is, with every capability dropped.** It does not start: `exec /usr/bin/caddy: operation not permitted`, because of a file capability on the binary. Keeping `NET_BIND_SERVICE` was weighed; a one-line own image with `setcap -r` runs as UID 1000 with everything dropped and binds port 80.

## What practice has shown

| Mode | Server | 200 MB download | Median request | Client's address | Ban |
|---|---|---:|---:|---|---|
| Docker as usual | cx33 | 587 MB/s | 13 ms | Kept | `DOCKER-USER` |
| User namespaces | cx23 | 326 MB/s | 11 ms | Kept | `DOCKER-USER` |
| Rootless, default driver | cx23 | 248 MB/s | 14 ms | Lost (`172.18.0.1`) | The jail cannot work |
| Rootless, slirp4netns | cx23 | 48 MB/s | 12 ms | Kept | `INPUT` |

The first row is another server type, so it is no fair baseline. Under user namespaces all images run with their hardening, as host UIDs 100000 and 101000.

- **`builder` cannot reach Forgejo alone while LFS is in use.** The LFS batch answer points at `ROOT_URL` even when Forgejo is asked internally, and no setting changes it. With only Forgejo on its internal network the build failed at `dial tcp: lookup git…`. With the proxy also on that network, under Forgejo's public name as a network alias, the build ran in 15.9 s with no way out (`example.com` unreachable).
- `tmpfs` is `noexec`, so Git hooks do not run there, and pushes need an explicit `git lfs push`.

**First numbers for the budgets:**

| Budget | First number |
|---|---|
| Image size | Forgejo 282 MB, Caddy 93 MB, a builder not yet slimmed 1.01 GB |
| Start | Forgejo about 1 s, preview 10–13 s |
| Idle memory | Forgejo 99 MB with 20 articles, 147–170 MB with 1,000; the webhook service 10–13 MB; Caddy 21 MB, shared |
| Save to public page | About 21 s at 1,000 articles on 4 vCPU |
| First byte of a page | 7–9 ms on the server, 120–200 ms from Sweden over a new connection |
| Build memory | 1.9 GiB warm and 2.45 GiB cold at 1,000 articles |
| Disk at 1,000 articles | LFS 608 MB, content history 746 MB, Astro's cache 543 MB, each release 553 MB |
| First build | 14.4 min: 10 min for 1,000 masters one at a time (it could run in parallel), 3.8 min for Astro |

Not measured: a build at 1,000 articles on 2 vCPU, where 20 articles took twice as long, or several customers building at once.
