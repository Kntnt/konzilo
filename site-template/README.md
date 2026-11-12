# The site template

`files/` holds what [`bin/new-site`](../bin/new-site) copies into a new site repository, and `demo-content/` the fictional content a local copy starts with, unless the site repository has its own.

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

`.env` holds the four ports: the public site, the editor, Forgejo and the live preview, each its own origin on `localhost`. Sign in to the editor as `anna`, with the password in `local-secrets/account-password` and a code from the command above. The live preview's port, opened in a tab of its own, lets you browse the site as the preview shows it, with every saved post, drafts and scheduled posts too, through the same sign-in, without a word once you are signed in to the editor. A save makes a commit in the site's Forgejo, and within a minute a post set to published shows on the public site. The demo's contact form, at `/pages/contact/` on the public site, is taken by the service in its role for visitors and kept in the volume `service-data`. What it takes shows on the editor's *Submissions* page, which downloads it as CSV too. An Admin turns mail on, and gives each form's recipients, on the editor's *Mail* page; a local copy then writes each mail it would send to the service's log, `docker compose logs editors`, and sends none. After a change to the core, add `--build`.

`new-site` needs git, Node and npm, and Compose needs Docker. The site's name becomes its folder and later its hostnames, so it must be a hostname label: lowercase letters, digits and inner hyphens, at most 63 characters.

The template's `site-description.json` is the demo model, in British English (`"language": "en_GB"`), with one form, `contact`, which a page of the demo content places. `demo-content/` holds what that model's content files look like, as `content-format.md` describes them.

## A site's own demo content

A site that shows itself with posts of its own keeps them in its repository, in `demo-content/` at its root, which Git tracks. They are fictional, as the core's are, and never a live site's content.

- **Its shape** is that of the core's `demo-content/`: published content files of the model the site's own `site-description.json` declares, as [`content-format.md`](../content-format.md) describes them. A post is in its collection's folder by its slug, `articles/harbour-lights.md`, and a term in its taxonomy's, `categories/news.json`; the site's settings are in `settings.json`, and its menus, redirects and services in `menus/<menu>.json`, `redirects.json` and `consent.json`, where it has them; and an image is a master in `media/`, named by its stem and its original's hash, `media/harbour-lights-e978159ef2.webp`.
- **A local copy starts from it** in place of the core's, never with both. `npm run dev` and `npm run build` copy it into `content/` when there is none, and `docker compose up --wait` fills a new Forgejo's source repository with it as source files, its media in Git LFS, so that the editor shows it and a save publishes it. A site repository without one gets the core's.
- **A public host refuses it,** as it refuses the core's: a build for an origin other than `http://localhost` with no `content/` stops, and copies nothing.
