# The site template

`files/` holds what [`bin/new-site`](../bin/new-site) copies into a new site repository, and `demo-content/` the fictional content a local copy starts with.

```bash
bin/new-site demo      # a site repository that pins this checkout by its path
cd demo
```

To work on the site's templates, on this machine:

```bash
npm install
npm run dev            # Astro's dev server, at http://localhost:4321
npm run build          # the static site, in dist/
```

To run all of it in containers, with Forgejo and the editor ([`compose/`](../compose/README.md)):

```bash
docker compose up --wait       # returns when its hosts answer
docker compose run --rm code   # the account's current second-factor code
docker compose down            # stops it, and keeps what is saved
```

`.env` holds the three ports: the public site, the editor and Forgejo, each its own origin on `localhost`. Sign in to the editor as `anna`, with the password in `local-secrets/account-password` and a code from the command above. A save makes a commit in the site's Forgejo, and nothing yet rebuilds the public site from it. After a change to the core, add `--build`.

`new-site` needs git, Node and npm, and Compose needs Docker. The site's name becomes its folder and later its hostnames, so it must be a hostname label: lowercase letters, digits and inner hyphens, at most 63 characters.

The template's `site-description.json` is the demo model, in British English (`"language": "en_GB"`). `demo-content/` holds what that model's content files look like, as `content-format.md` describes them.
