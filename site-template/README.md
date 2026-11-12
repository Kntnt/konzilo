# The site template

`files/` holds what [`bin/new-site`](../bin/new-site) copies into a new site repository, and `demo-content/` the fictional content a local copy starts with, unless the site repository has its own.

```bash
bin/new-site demo                   # a site repository that pins this checkout by its path
bin/new-site --release vX.Y.Z demo  # one that pins the release vX.Y.Z, and installs anywhere
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
docker compose up --wait            # returns when its hosts answer
docker compose run --rm code        # the account's current second-factor code
docker compose run --rm code ebba   # a person's, by name
docker compose down                 # stops it, and keeps what is saved
```

`.env` holds the four ports: the public site, the editor, Forgejo and the live preview, each its own origin on `localhost`. Sign in to the editor as `anna`, with the password in `local-secrets/account-password` and a code from the command above. `KONZILO_PEOPLE` in `.env` gives the copy people in each role instead, such as `anna:admin,ebba:editor,rut:reviewer`, each with the same password and a code of their own from `docker compose run --rm code <name>`; the next start adds whoever it lists, and removes no one ([`compose/`](../compose/README.md#a-local-copys-people)). A Reviewer signs in at the live preview's port, since the editor tells them they can save nothing there. The live preview's port, opened in a tab of its own, lets you browse the site as the preview shows it, with every saved post, drafts and scheduled posts too, through the same sign-in, without a word once you are signed in to the editor, and a toolbar on each page that says its status and leads to its form. A save makes a commit in the site's Forgejo, and within a minute a post set to published shows on the public site. The demo's contact form, at `/pages/contact/` on the public site, is taken by the service in its role for visitors and kept in the volume `service-data`. What it takes shows on the editor's *Submissions* page, which downloads it as CSV too. An Admin turns mail on, and gives each form's recipients and the days its submissions are kept, on the editor's *Mail* page; a local copy then writes each mail it would send to the service's log, `docker compose logs editors`, and sends none. An Admin finds a person's submissions by what they wrote, downloads them and erases them, on the editor's *Personal data* page. After a change to the core, add `--build`.

`new-site` needs git, Node and npm, and curl for a release, and Compose needs Docker. The site's name becomes its folder and later its hostnames, so it must be a hostname label: lowercase letters, digits and inner hyphens, at most 63 characters.

The template's `site-description.json` is the demo model, in British English (`"language": "en_GB"`), with one form, `contact`, which a page of the demo content places. `demo-content/` holds what that model's content files look like, as `content-format.md` describes them.

## A site that takes a design package

A site may take its look from a design package, which holds a design's components, presentations and styles, installed in the site repository and named by its package specifiers ([ADR 0054](../docs/adr/0054-take-a-sites-design-from-the-konzilo-design-system.md), [ADR 0060](../docs/adr/0060-let-a-site-declare-its-components-and-check-what-they-hold.md)):

- **Its components** are the site's by `componentsFrom` in `site-description.json`, the package's JSON file of them, with the site's labels under `componentLabels`, and what they hold is checked by `componentChecks`, the package's module ([`content-format.md`](../content-format.md#a-sites-own-components)). A type's `elements` names those its posts may hold.
- **Its Astro components draw them,** registered in `astro.config.mjs`: each component's by its directive's name under `konzilo({ directives })`, and each presentation a post list names under `presentations`, as the template registers its own form, list and cards.
- **Its styles stand in place of the template's own:** its body styles and tokens go to `bodyStyles` and `tokens`, and its stylesheets to the layout, in place of those in `src/styles/`.

## A site that pins a release

`new-site --release vX.Y.Z` fetches the release's package, `kntnt-konzilo-X.Y.Z.tgz`, the file attached to the core's GitHub release, into the site's `vendor/`, and pins it there: `"@kntnt/konzilo": "file:vendor/kntnt-konzilo-X.Y.Z.tgz"`. Git tracks the file, so the site installs on any machine, a build needs nothing from GitHub, and the lock's `integrity` holds its bytes ([ADR 0011](../docs/adr/0011-pin-a-versioned-core-in-each-site-repository.md)). Run it from a checkout of the core at the same tag, since the site's files come from the checkout's template. `KONZILO_RELEASES` names another place to fetch them from: an address under which a release's file is at `<tag>/<file>`, as under GitHub's `https://github.com/Kntnt/konzilo/releases/download`.

To raise the pin to the release vX.Y.Z, in the site repository:

```bash
curl -fsSL -o vendor/kntnt-konzilo-X.Y.Z.tgz https://github.com/Kntnt/konzilo/releases/download/vX.Y.Z/kntnt-konzilo-X.Y.Z.tgz
npm install @kntnt/konzilo@file:vendor/kntnt-konzilo-X.Y.Z.tgz   # writes the pin and the lock
git rm vendor/kntnt-konzilo-<the old version>.tgz
git add vendor package.json package-lock.json
```

What the site template gained between the two releases, the changelog says; a raised pin does not bring it.

**In Compose,** such a site runs from a checkout of the core at the same tag, since Compose builds its images from the core's source and the package holds no `compose/`. `new-site` names the checkout it ran from, in `.env`'s `KONZILO_CORE` and the two paths in `compose.yaml`. On another machine, or after raising the pin, clone the core at the pinned tag, `git clone --branch vX.Y.Z https://github.com/Kntnt/konzilo.git`, and name that folder in those three places.

## A site's own demo content

A site that shows itself with posts of its own keeps them in its repository, in `demo-content/` at its root, which Git tracks. They are fictional, as the core's are, and never a live site's content.

- **Its shape** is that of the core's `demo-content/`: published content files of the model the site's own `site-description.json` declares, as [`content-format.md`](../content-format.md) describes them. A post is in its collection's folder by its slug, `articles/harbour-lights.md`, and a term in its taxonomy's, `categories/news.json`; the site's settings are in `settings.json`, and its menus, redirects and services in `menus/<menu>.json`, `redirects.json` and `consent.json`, where it has them; and an image is a master in `media/`, named by its stem and its original's hash, `media/harbour-lights-e978159ef2.webp`.
- **A local copy starts from it** in place of the core's, never with both. `npm run dev` and `npm run build` copy it into `content/` when there is none, and `docker compose up --wait` fills a new Forgejo's source repository with it as source files, its media in Git LFS, so that the editor shows it and a save publishes it. A site repository without one gets the core's.
- **A public host refuses it,** as it refuses the core's: a build for an origin other than `http://localhost` with no `content/` stops, and copies nothing.
