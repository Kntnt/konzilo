# ADR 0002: Let the core know one site, and run it everywhere with Docker Compose

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02: Docker everywhere, no Kubernetes; the core knows one site. The rest is a technical choice; Thomas may veto.

## Context

Anyone should be able to run Konzilo on their own machine or server, Kntnt should be able to host many sites with it, preferably with that part closed while the rest is open source, and a customer that leaves should be up and running again on a stand-alone Konzilo (Thomas, 2026-11-02).

## Decision

| Layer | What it is | Open? |
|---|---|---|
| **The core** | Sveltia with the Crepe field, the intake, the build, the Node service, the live preview, the Astro integration and the `konzilo` command, as images that take settings and a folder. They know of no other site, and reach Forgejo only by address and API. | Yes |
| **Compose** | One site with a Forgejo of its own, in containers. | Yes |
| **Hosting** | Many customers on plain Ubuntu, one Compose project each: recipe, server command, provisioning, DNS, launch, monitoring, backups. | No, in a private repository |

| Case | Runs with | What differs |
|---|---|---|
| Local | Compose | `localhost` and ports |
| Own server | The same Compose | A domain, certificates and a backup target in a settings file |
| Hosting | Compose per customer, driven by the hosting layer | One web server and one Typesense shared between projects, and Kntnt's services |

- **The same images everywhere.** Only Compose settings differ. There is no second way to run Konzilo. Nothing in the core imports from the hosting layer.
- **One site per Compose project,** on a laptop and on one's own server. Another site is another project, with no shared state. A hosted customer with several sites is the hosting layer's to arrange: one Forgejo for that customer (ADR 0004), and each site's own containers.
- **One command locally.** `docker compose up --wait` in a site repository starts everything, with Caddy from the same templates as on a server. It seeds Forgejo with an organisation, a repository, fictional demo content as files, and an account with a known password and a second factor from a fixed key, with a command that prints the current code. A fresh clone becomes a working site with that one command, and it returns only when the hosts answer.
- **What runs on demand starts itself (Thomas, 2026-11-03).** In Compose every container stays up and sleeps, and starts its own heavy work when it is needed: a build, a preview's dev server. So `docker compose up` is all a machine needs, on a Mac, Linux or Windows, and no container needs Docker's socket. A build then runs in a container that stays, and must clean up after itself. The hosting layer may start the same images in its own way, one build at a time, where many customers share a server.
- **Addresses locally.** Each host is its own port on `localhost`, so public site, admin host, Forgejo and preview are separate origins. Browsers treat `localhost` as secure, so no certificates are needed, and the site's origin may be `http://localhost`. `new-site` picks four ports from the site's name and writes them in `.env`; a shell's values go before them, so that three agents can work at once.
- **Saving publishes locally as live.** A save starts the intake, and the site appears on its port. A developer also has Astro's dev server on the published content.
- **On one's own server,** the same files. A settings file names the domain, an address for certificates, mail and a backup target; Caddy gets certificates by itself; each host is a name under that domain. A line that installs it and a page at first start that makes the first account give the ease people expect. An update is pulling a new version and restarting. A plain web host cannot run it, but can show the pages.
- **The web server is Caddy, in its standard build.** It obtains and renews certificates itself, a site is one short file, and a bad file is refused while the old configuration keeps running.
- **`konzilo live …` is a thin Node client** that passes calls to the hosting layer's server command, and decides nothing. `konzilo pull` takes a live site's data, and stays Thomas's alone (ADR 0010): the site's archive (ADR 0006) is downloaded whole before anything local is replaced, and unpacked as regular files and folders only, without following a link, so that a refused pull leaves the local copy as it was.
- **Node is pinned by the images,** so a machine's own Node does not count.

## Why

- A core that knows one site draws the line between open and closed by itself. The hosting layer becomes a user of the core, so closing it takes nothing from the open part, and a fix in the core reaches both.
- With a Forgejo per customer (ADR 0004), hosting is many Compose projects. Running it any other way keeps two ways to run Konzilo, which can drift apart.
- Containers add what Linux users lack: a network per customer, read-only file systems and fewer rights.
- The local copy runs what the live copy runs, so one acceptance suite proves both.

## Considered and rejected

- **Kubernetes.** It moves programs between many servers and keeps them running by itself. Thomas's limits accept hours to recover, each customer's files lie on one disk, and it is a large system for one person to upgrade several times a year. Customers would still share a kernel, so it adds no separation a server of one's own does not give better. The same containers can move to it if Kntnt one day needs automatic placement.
- **Hosting on plain Ubuntu without Docker.** It keeps two ways to run Konzilo and gives weaker separation.
- **Many sites in the open core.** It mixes what is meant to stay closed into what is open, and every stand-alone user would carry its weight.
- **An install by uploading files to a host.** Konzilo is several programs running at once.
- **DDEV for local copies.** It runs other images than live, so local and live could only be kept alike by rules.
- **A control panel such as CloudPanel.** It keeps state in its own database, puts a panel on the internet that needs locking down, and has no command to change a site's web server configuration once the site exists.

## What practice has shown

- WebKit and Safari 26.6.2 refuse `Secure` cookies on `http://localhost`, so `__Host-` sign-in silently fails there, while Chromium and Firefox accept them. With plain cookie names locally (`COOKIE_SECURE = false`) all three signed in and saved. `window.isSecureContext` is true either way, so PKCE can run. **So local cookies differ from live in this one thing.** The alternative, local HTTPS with a certificate each person must trust, was weighed; Thomas has yet to react to this finding. Cookies are shared across ports on `localhost`, so their names must not collide.
- Forgejo publishes binaries for Linux only; its image `codeberg.org/forgejo/forgejo:17` was 17.0.1. Forgejo must be 12 or later for Sveltia.
- A dev server and a build in one root race over Astro's `.astro/` files (ADR 0032).

- **Compose on a Mac (Docker Desktop, Compose 5.6.1):** from empty volumes with the images built, `up --wait` took 24 s, with Forgejo at 113 MiB, Caddy at 17 MiB and the sleeping builder at 47 MiB. A secret that comes from the environment cannot enter a read-only container, so secrets are files. A service that exits with 0 and that nothing depends on makes `up --wait` fail, so the last step stays up. A bind mount in Forgejo's custom folder stops its setup, so the templates are copied in. Inside the web server's network, Forgejo's address is the same as outside, so that the seed and the builder can follow an LFS answer.

## Consequences

- `docs/agents/` gets the rule for Compose: remove only your own projects, by name, and never `docker … prune`.
- Compose on a real server, with a domain in the test zone, certificates and an update to a newer version, must pass before own server counts as done.
