# One site in containers

A site repository includes `compose.yaml` from here, with its own ports in `.env`, so that a fix reaches every site with the core's pin ([ADR 0002](../docs/adr/0002-let-the-core-know-one-site-and-run-it-everywhere-with-docker-compose.md)). `docker compose up --wait` in the site repository brings it up, and returns when its hosts answer or a step has failed. After a change to the core, or a raise of its pin, add `--build`.

- `web/`: Caddy with the editor's static files, and beside them the notices of the packages they hold, `third-party-notices.txt`, which the admin host serves ([ADR 0072](../docs/adr/0072-write-the-notices-of-what-the-editors-application-holds-from-the-bundlers-record.md)), the one container with ports. Its `Caddyfile` holds the allow-list that closes Forgejo ([ADR 0007](../docs/adr/0007-sign-in-through-the-customers-own-forgejo-with-two-factors-and-close-the-rest-at-the-proxy.md)).
- `forgejo/`: what the vendor's image is given: the first account's script, and the template that answers the consent page.
- `seed/`: fills a new Forgejo: the machine accounts, each with a second factor, the organisation and its teams, `admins` and `editors`, which write to the source repository, and `reviewers`, which reads it ([ADR 0008](../docs/adr/0008-give-customers-three-roles-admin-editor-and-reviewer.md)), the source repository with the demo content as source files, the site repository's own in its `demo-content/` where it has any, else the core's, the content repository, the webhook, the OAuth clients, the editor's and the live preview's, and the local copy's people, each with a second factor, in the team of their role ([A local copy's people](#a-local-copys-people)).
- `builder/`: Node, Git and the core, for the seed, a site's build, the live preview and the service, which runs in two roles: `editors`, which Forgejo and the editor reach, which shows Admins and Editors the forms' submissions and mails them to each form's recipients, and `visitors`, which takes what visitors' browsers send below `/_konzilo/`, such as a site's forms, in a network of its own that only the web server shares, with no way out ([ADR 0044](../docs/adr/0044-take-visitors-requests-at-one-service-below-konzilo-and-keep-nothing-of-the-visitor.md)).
- `typesense/`: Typesense, the vendor's image, with a folder for its data that a user other than root owns ([ADR 0053](../docs/adr/0053-search-with-typesense-indexed-from-the-published-files.md)). It is in a network of its own, which only the web server shares, with no port and no way out.

## What runs on demand

Everything stays up and sleeps, and each container starts its own heavy work, so `up` is all a machine needs and no container gets Docker's socket ([ADR 0002](../docs/adr/0002-let-the-core-know-one-site-and-run-it-everywhere-with-docker-compose.md)). The hosting layer may start things in its own way, with the same images.

A save makes a commit, Forgejo's webhook reaches `editors`, and `editors` writes a build request that `builder` takes: the source through the intake, the content repository, Astro, and `current` moved to the new release ([ADR 0031](../docs/adr/0031-show-a-publish-within-a-minute-with-its-status-and-any-refusal.md)). `editors` also looks at the start of each minute, for a webhook that never came and for a scheduled moment that has passed. The build writes a release's headers and redirects as rules for the web server, beside its pages, and refuses the release if it cannot tell they are safe; `web` runs with `--watch`, and takes them by itself ([ADR 0051](../docs/adr/0051-write-security-headers-and-an-enforced-policy-into-each-release.md)). Once `current` is moved, and at the builder's first build after each start, the build makes the search index of what is published, and writes the web server's route to it, with the key that runs the site's search alone, outside every release; an index it cannot make leaves the release live, and the build's line says `unindexed` ([ADR 0053](../docs/adr/0053-search-with-typesense-indexed-from-the-published-files.md)).

A visitor who sends a form reaches `visitors` through the web server, which passes on the request with where the browser says it came from, the visitor's address and the host, and nothing else. `visitors` keeps the submission in the service's data, with no address, and while it does not answer, the web server gives the release's page that says the message was not sent ([ADR 0045](../docs/adr/0045-let-a-developer-make-each-form-and-an-editor-choose-among-them.md)). It reads the forms from the site description, in the site's folder, which it mounts whole so that a description replaced, as Git writes one, reaches it without a restart. Admins and Editors read the submissions on the editor's *Submissions* page, and download a form's as CSV, through `editors`, which opens the same data and asks Forgejo who is asking each time. `editors` also looks every few seconds for a submission to mail, and mails it to its form's recipients through the adapter an Admin chooses on the editor's *Mail* page, off until an Admin turns it on, with each form's recipients, which the service keeps and no file holds ([ADR 0003](../docs/adr/0003-keep-every-service-and-name-of-kntnts-replaceable.md)). At its start and each minute, it forgets each submission older than its form's retention, which an Admin sets beside the recipients, 30 days until then, and spam older than seven days; and an Admin finds a person's submissions by what they wrote on the editor's *Personal data* page, downloads them and erases them. What it forgets is overwritten in the service's data, so no backup carries it. A local copy sends no mail: `KONZILO_MAIL_TO_LOG` makes `editors` write each mail it would have sent to its log, which `docker compose logs editors` shows, and a server turns it off ([What a server sets](#what-a-server-sets)). Only an Admin sees the *Mail* page, which `editors` asks Forgejo of, by a credential of its own that reads the organisation's teams and nothing else.

The live preview's dev server starts when an editor opens an entry, or someone opens the preview's address in a tab of its own, and stops after 15 minutes with nobody looking. It shows every saved post, a draft and a scheduled post too, and reads what has been saved before each page asked for in a tab. A tab signs in through Forgejo as the preview's own OAuth client, at once where its person is signed in there, and is asked again every ten minutes whether they may still see it ([ADR 0032](../docs/adr/0032-preview-live-beside-the-form-and-share-a-draft-through-a-secret-link.md)). Whoever may read the source repository may, a Reviewer too: an account in the team `reviewers`, which the instance's administrator adds until the editor has a Users page, or which a local copy's people hold ([A local copy's people](#a-local-copys-people)). A Reviewer who opens the editor is told that the account reads the preview only, Forgejo refuses whatever a Reviewer pushes, and a build refuses whatever reaches the source by one all the same ([ADR 0008](../docs/adr/0008-give-customers-three-roles-admin-editor-and-reviewer.md)). Each page in a tab has the preview's toolbar, which the gate puts in: the page's status, and, for someone who may write, a link to its form on the admin host.

A site that takes its components and their check from a package ([`content-format.md`](../content-format.md#a-sites-own-components)) has them read from the copy of its code that `builder` and the live preview each make, with its dependencies installed, in `site-work` and `preview-work`: the intake, the editor's configuration, the search documents and Astro find the package there. The seed, the service in both roles and the preview's gate read no body, and read the site description in the site's folder without those components, so the folder needs no `npm install` ([ADR 0060](../docs/adr/0060-let-a-site-declare-its-components-and-check-what-they-hold.md)).

When most of a site's posts would go at once, the build stops and its log names the deletion's code ([ADR 0028](../docs/adr/0028-stop-a-build-that-would-take-most-posts-off-until-the-deletion-is-confirmed.md)). An operator who means it runs `docker compose exec builder node /konzilo/bin/konzilo-confirm.js <code>`.

## A local copy's people

The seed makes the people `KONZILO_PEOPLE` lists, at every start, so that each role can be signed in as ([ADR 0007](../docs/adr/0007-sign-in-through-the-customers-own-forgejo-with-two-factors-and-close-the-rest-at-the-proxy.md), [ADR 0008](../docs/adr/0008-give-customers-three-roles-admin-editor-and-reviewer.md)). Each person is `name:role`, apart by commas, with the roles `admin`, `editor` and `reviewer`, as in `KONZILO_PEOPLE=anna:admin,ebba:editor,rut:reviewer`; where it lists no one, a local copy has the one Admin `KONZILO_ACCOUNT` names, as it always has. Each person gets an account with the password in `account-password`, which they share, a second factor whose key the seed keeps in the volume `state`, and the team of their role, `admins`, `editors` or `reviewers`, and no other of the three. `docker compose run --rm code` prints the current code of the account `KONZILO_ACCOUNT` names, and `docker compose run --rm code <name>` that of the person named.

A start changes nothing that is already so: a copy seeded before gains the people added since, a person listed with another role moves to its team, and nobody is removed, nor any password changed, by being left out of the list. An account the seed did not make, given a second factor elsewhere, has a key the seed cannot keep, and the start stops, naming it.

A person has a password of their own where the seed is given a secret named `account-password-<name>`, the name in lower case. A site gives one in a file its `compose.yaml` includes after the core's, which adds it to the seed's secrets:

```yaml
# compose.yaml
include:
  - path:
      - /path/to/konzilo/compose/compose.yaml
      - compose.people.yaml
    project_directory: .
    env_file: [.env, /path/to/konzilo/versions.env]

# compose.people.yaml
services:
  seed:
    secrets: [instance-password, account-password, account-password-ebba]
secrets:
  account-password-ebba:
    file: ${KONZILO_SECRETS:-./local-secrets}/account-password-ebba
```

## What a server sets

A local copy runs with the defaults below, and a server sets each in its own `.env`, or its environment, where its value differs. The ports and the site's name are in `.env` beside them, which `new-site` writes, and the pinned versions in `versions.env`. A test fails on a default missing here.

| Variable | Default | What it is |
|---|---|---|
| `KONZILO_SITE_DIR` | `.` | The site repository's folder, which the builder, the live preview and both of the service's roles mount read-only |
| `KONZILO_SECRETS` | `./local-secrets` | The folder of the first passwords, `instance-password` and `account-password`, which every person the seed makes shares unless one has their own, a local copy's known; a server keeps its own outside the site repository, which each role sees ([ADR 0044](../docs/adr/0044-take-visitors-requests-at-one-service-below-konzilo-and-keep-nothing-of-the-visitor.md)) |
| `KONZILO_PEOPLE` | Empty | The people the seed makes, each `name:role`, apart by commas, such as `anna:admin,ebba:editor,rut:reviewer`; empty, the one Admin `KONZILO_ACCOUNT` names ([A local copy's people](#a-local-copys-people)) |
| `KONZILO_MAIL_TO_LOG` | `true` | Whether `editors` writes each mail it would send to its log, and sends none, as a local copy does; a server sets `false`, and mails through the adapter an Admin chooses on the *Mail* page ([ADR 0003](../docs/adr/0003-keep-every-service-and-name-of-kntnts-replaceable.md)) |

## What another arrangement sets

Compose is the one arrangement the core ships, documents and tests, and it sets none of the settings below: each default is where Compose puts a program's peer or folder. A hosting layer or a site that arranges the same programs otherwise, on other machines or several in one container, sets them in each program's environment, the web server's among them, where its value differs ([ADR 0002](../docs/adr/0002-let-the-core-know-one-site-and-run-it-everywhere-with-docker-compose.md)). `src/arrangement.js` reads them, and the web server's `Caddyfile` reads the peer addresses as placeholders with the same defaults. A test fails on a setting missing here.

| Variable | Default | Read by | What it is |
|---|---|---|---|
| `KONZILO_PEER_FORGEJO` | `http://forgejo:3000` | The seed, `builder`, `preview`, `editors` and `web` | Forgejo's peer address, where the programs call its API and its Git, and the web server passes on what it lets through to it; not `KONZILO_FORGEJO_ORIGIN`, where browsers reach it |
| `KONZILO_PEER_TYPESENSE` | `http://typesense:8108` | `builder`, and `web` through the route to search | Typesense's peer address, where the builder indexes, and which it writes into the web server's route to search, so that the web server must reach Typesense there too |
| `KONZILO_PEER_EDITORS` | `http://editors:4100` | The seed and `web` | The service in its role for editors, which Forgejo's webhook reaches at `/webhook` |
| `KONZILO_PEER_VISITORS` | `http://visitors:4200` | `web` | The service in its role for visitors |
| `KONZILO_PEER_PREVIEW` | `http://127.0.0.1:4000` | `web` | The live preview's gate |
| `KONZILO_FOLDER_SECRET` | `/secret` | `builder`, `preview` and `editors` | The folder a program reads its own credentials from, which the seed writes in `/builder-secret`, `/preview-secret` and `/editors-secret`; programs that share a file system each name their own, since the files in each have the same names |
| `KONZILO_FOLDER_WORK` | `/work` | `builder` and `preview` | The folder a program keeps its copy of the site's code in, with its checkouts and its home; programs that share a file system each name their own |
| `KONZILO_LISTEN` | Every address | `editors` and `visitors` | The address the service's roles listen on, such as `127.0.0.1`, which holds them to the loopback where they share a host with what must not reach them |
| `KONZILO_WEBHOOK_HOST` | `editors` | Forgejo, from `compose.yaml` | The host Forgejo's webhook may reach, its `webhook.ALLOWED_HOST_LIST`: the host of `KONZILO_PEER_EDITORS`, or `loopback` where that is on the loopback |

A peer address is an origin: a scheme, a host and a port, and nothing more. Its port is where the peer is reached: the service listens on 4100 and 4200, and the preview on 4000, with its dev server on 4001, both on the loopback alone, so a peer reached at another port needs something between, such as a published port. The other folders are no settings, since each is one folder for every program that reads it, and two programs never keep different things there: the site's folder, `/site`, read-only for all; `/control`, which `builder` and `editors` share; `/service-data`, which both of the service's roles open; and `/public`, `/state`, `/thumbnails`, `/admin-config`, `/search-route`, the seed's folders and the web server's below `/srv`, each written by one program alone. An arrangement that runs programs together gives up their own networks, read-only file systems and limits, and says so where it does ([ADR 0005](../docs/adr/0005-build-every-container-for-security-and-performance-and-guard-both-with-budgets.md)).

The seed, `compose/seed/seed.js`, takes the site's name from `KONZILO_SITE`, its people from `KONZILO_PEOPLE` and `KONZILO_ACCOUNT` ([A local copy's people](#a-local-copys-people)), and the admin host's and the preview's origins from `KONZILO_ADMIN_ORIGIN` and `KONZILO_PREVIEW_ORIGIN`, with the peers above. It reads each password from a file in `/run/secrets`, the folder Compose and BuildKit mount secrets in: the instance's administrator's from `instance-password`, and each person's from `account-password-<name>`, the name in lower case, where it is there, else from `account-password`. It keeps each person's key in `/state`, which `bin/konzilo-code.js` alone reads besides: in `account-totp` the key of the account `KONZILO_ACCOUNT` named at the first start, which `account-name` names, and in `people/<name>-totp` everyone else's. It writes the other programs' credentials in `/builder-secret`, `/preview-secret`, `/editors-secret` and `/typesense-secret`, and reads the site's folder at `/site`. An arrangement that seeds once and copies the result, such as into an image, gives every copy the same people, passwords and keys.

## What each volume holds

Each volume's data is one of: *authoritative*, the one record of something; *derived*, which can be made again; or *secret*. A test fails on a volume missing here, so that adding one asks the question.

| Volume | Kind | Holds | Lost, then |
|---|---|---|---|
| `forgejo-data` | Authoritative | Forgejo's database, accounts, the source repository with its LFS objects, the content repository, and Forgejo's settings, `custom/conf/app.ini`, with the keys it generated, where the vendor's rootless image keeps them | The site's content and accounts are gone, and without the keys sessions and second factors stop working: this is what the archive must carry |
| `state` | Secret | The people's and the instance's second-factor keys, in `account-totp` the key of the account `KONZILO_ACCOUNT` named at the first start, which `account-name` names, and in `people/` everyone else's; the instance's token; the editor's OAuth client | Forgejo must be seeded again from empty |
| `caddy-data` | Derived | Caddy's own data, on a server its certificates | Caddy obtains them again |
| `site-work` | Derived | The site's code and dependencies for building, checkouts of the source and content repositories, and what the build has learned of who pushed what | Made again at the next start |
| `site-public` | Derived | The site's releases, and `current`, the one visitors get | Built again at the next start |
| `build-control` | Derived | The build request, the record of the last build, and the build log | The next build records again; the log starts over |
| `thumbnails` | Derived | Small pictures of the images an editor chooses among | Each is made again when it is next asked for |
| `admin-config` | Derived | The editor's generated configuration, in each interface language | Written again at the next start |
| `preview-work` | Derived | The live preview's copy of the site's code, its dependencies, a checkout of the source and its content folder | Made again at the next start, and the drafts in it are the editors' to send again |
| `preview-secret` | Secret | The live preview's credential, which can only read the source repository, and its OAuth client's ID | The seed makes another credential, and writes the client's ID again, at the next start |
| `builder-secret` | Secret | The builder's credential, which can read the source repository and write the content repository; a credential that can only read, for who is an Admin or a Reviewer and who pushed what; the editor's OAuth client's name; and Typesense's admin key and the site's search key | The seed makes another at the next start, and Typesense takes the new admin key |
| `editors-secret` | Secret | The service's credential, which can only read the source repository, and one that can only read the organisation's teams, for who is an Admin | The seed makes another at the next start |
| `typesense-secret` | Secret | Typesense's configuration, which holds its admin key | The seed writes it again at the next start |
| `typesense-data` | Derived | The site's search index, of what is published | The builder's first build makes it again |
| `search-route` | Derived | The web server's route to search, with the key that runs the site's search alone | The builder's first build writes it again |
| `service-data` | Authoritative | The service's data, which both its roles open, `visitors` to keep and `editors` to read, mail and forget: each form's submissions, with their fields' labels, their pages' language and how each one's mail stands; each form's recipients and retention, and the mail adapter with its settings, its password among them, which an Admin sets on the *Mail* page; and the service's key, from which its timing tokens and its digests of clients are made | The submissions, the recipients, the retention and the mail settings are gone, and a timing token given before is refused: this is what the archive must carry, beside Forgejo's data |
