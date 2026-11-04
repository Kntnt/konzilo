# One site in containers

A site repository includes `compose.yaml` from here, with its own ports in `.env`, so that a fix reaches every site with the core's pin ([ADR 0002](../docs/adr/0002-let-the-core-know-one-site-and-run-it-everywhere-with-docker-compose.md)). `docker compose up --wait` in the site repository brings it up, and returns when its hosts answer or a step has failed. After a change to the core, or a raise of its pin, add `--build`.

- `web/`: Caddy with the editor's static files, the one container with ports. Its `Caddyfile` holds the allow-list that closes Forgejo ([ADR 0007](../docs/adr/0007-sign-in-through-the-customers-own-forgejo-with-two-factors-and-close-the-rest-at-the-proxy.md)).
- `forgejo/`: what the vendor's image is given: the first account's script, and the template that answers the consent page.
- `seed/`: fills a new Forgejo: accounts with a second factor, the organisation and its teams, the source and content repositories, the webhook and the OAuth client.
- `builder/`: Node, Git and the core, for the seed, a site's build, the live preview and the service.

## What runs on demand

Everything stays up and sleeps, and each container starts its own heavy work, so `up` is all a machine needs and no container gets Docker's socket ([ADR 0002](../docs/adr/0002-let-the-core-know-one-site-and-run-it-everywhere-with-docker-compose.md)). The hosting layer may start things in its own way, with the same images.

A save makes a commit, Forgejo's webhook reaches `editors`, and `editors` writes a build request that `builder` takes: the source through the intake, the content repository, Astro, and `current` moved to the new release ([ADR 0031](../docs/adr/0031-show-a-publish-within-a-minute-with-its-status-and-any-refusal.md)). `editors` also looks at the start of each minute, for a webhook that never came and for a scheduled moment that has passed.

When most of a site's posts would go at once, the build stops and its log names the deletion's code ([ADR 0028](../docs/adr/0028-stop-a-build-that-would-take-most-posts-off-until-the-deletion-is-confirmed.md)). An operator who means it runs `docker compose exec builder node /konzilo/bin/konzilo-confirm.js <code>`.

## What each volume holds

Each volume's data is one of: *authoritative*, the one record of something; *derived*, which can be made again; or *secret*. A test fails on a volume missing here, so that adding one asks the question.

| Volume | Kind | Holds | Lost, then |
|---|---|---|---|
| `forgejo-data` | Authoritative | Forgejo's database, accounts, the source repository with its LFS objects, and the content repository | The site's content and accounts are gone: this is what the archive must carry |
| `forgejo-config` | Secret | Forgejo's `app.ini`, with the keys it generated | Sessions and second factors stop working |
| `state` | Secret | The account's and the instance's second-factor keys, the instance's token, the OAuth client | Forgejo must be seeded again from empty |
| `caddy-data` | Derived | Caddy's own data, on a server its certificates | Caddy obtains them again |
| `site-work` | Derived | The site's code and dependencies for building, checkouts of the source and content repositories, and what the build has learned of who pushed what | Made again at the next start |
| `site-public` | Derived | The site's releases, and `current`, the one visitors get | Built again at the next start |
| `build-control` | Derived | The build request, the record of the last build, and the build log | The next build records again; the log starts over |
| `admin-config` | Derived | The editor's generated configuration | Written again at the next start |
| `preview-work` | Derived | The live preview's copy of the site's code, its dependencies, a checkout of the source and its content folder | Made again at the next start, and the drafts in it are the editors' to send again |
| `preview-secret` | Secret | The live preview's credential, which can only read the source repository | The seed makes another at the next start |
| `builder-secret` | Secret | The builder's credential, which can read the source repository and write the content repository; a credential that can only read, for who is an Admin and who pushed what; and the editor's OAuth client's name | The seed makes another at the next start |
| `editors-secret` | Secret | The service's credential, which can only read the source repository | The seed makes another at the next start |
