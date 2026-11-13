# Acknowledgements

Konzilo stands on the work of others. This file names what it is built on, with thanks to those who made it, and says under which license each part comes. [`THIRD-PARTY.md`](THIRD-PARTY.md) lists every package the core installs, each with its license. The editor's application holds packages of others in its bundle, and its build writes their notices beside it, `third-party-notices.txt`: each package by name and version, with its license and its license text, those within Sveltia's own bundle too. The web server's image keeps them with the application and serves them on the admin host ([ADR 0072](docs/adr/0072-write-the-notices-of-what-the-editors-application-holds-from-the-bundlers-record.md)).

## What Konzilo is made of

Without these there would be no Konzilo.

| Part | What it does in Konzilo | License |
|---|---|---|
| [Astro](https://astro.build) (`astro`), by Fred K. Schott and Astro's contributors | Builds the static site that visitors get, and shows the live preview | MIT |
| [Sveltia CMS](https://sveltiacms.app) (`@sveltia/cms`), by Kohei Yoshino | The editor's application: the forms, the lists and the saving to git. Konzilo patches its build | MIT |
| [Milkdown](https://milkdown.dev) and its Crepe editor (`@milkdown/crepe`, `@milkdown/kit`), by Mirone, on ProseMirror | The body field is built on Crepe, with Konzilo's own nodes | MIT |
| [Sätteri](https://github.com/bruits/satteri) (`satteri`), by Bruits | Reads Markdown: in the intake, in Astro and in the editor's browser | MIT |
| [Node.js](https://nodejs.org) | Runs the intake, the build, the Node service and the live preview | MIT, with parts under licenses of their own |

## What runs beside it

A Compose project runs these as programs of their own. Konzilo talks to them and holds none of their code, apart from the one template named below, so another program could take the place of each.

| Program | What it does for a site | License |
|---|---|---|
| [Forgejo](https://forgejo.org) | Holds the source repository and the accounts, and signs people in | GPL-3.0-or-later |
| [Caddy](https://caddyserver.com) | Serves the public site and the editor's application | Apache-2.0 |
| [Typesense](https://typesense.org) | Searches a site's posts, on a site that has search | GPL-3.0 |
| [Git](https://git-scm.com) and [Git LFS](https://git-lfs.com) | Keep the content, its history and the originals | GPL-2.0 and MIT |

The images are built on those of Node.js, Caddy and Forgejo, and on Debian and Alpine Linux below them, each with the licenses of what it holds.

## Libraries the code uses directly

| Library | What Konzilo uses it for | License |
|---|---|---|
| [sharp](https://sharp.pixelplumbing.com) (`sharp`), with [libvips](https://www.libvips.org) | Makes each image's master and the smaller pictures | Apache-2.0, and LGPL-3.0-or-later for libvips |
| [SVGO](https://svgo.dev) (`svgo`) | Optimises a checked SVG | MIT |
| [sax](https://github.com/isaacs/sax-js) (`sax`) | Reads an SVG strictly as XML | BlueOak-1.0.0 |
| [yaml](https://eemeli.org/yaml/) (`yaml`) | Reads and writes YAML | ISC |
| [parse5](https://parse5.js.org) (`parse5`) | Reads the built pages for the security policy | MIT |
| [Lightning CSS](https://lightningcss.dev) (`lightningcss`) | Reads a colour a site names | MPL-2.0 |
| [Vite](https://vite.dev) (`vite`) | Builds the editor's application | MIT |
| [Playwright](https://playwright.dev) (`playwright-core`) and [jsdom](https://github.com/jsdom/jsdom) (`jsdom`) | Run the acceptance tests in real browsers, and read pages in tests | Apache-2.0 and MIT |

Each of these stands on many more, and so do Astro, Sveltia CMS and Milkdown. `THIRD-PARTY.md` names them all.

## Files that hold material of others

Konzilo's own files are under Konzilo's license ([`LICENSE`](LICENSE), with [`SITE-EXCEPTION.md`](SITE-EXCEPTION.md)). The files below hold material of others. Each is a file of its own, keeps the license it came under, and binds no other file.

| File | From | License |
|---|---|---|
| [`src/format/public-suffixes.json`](src/format/public-suffixes.json) | The rules of the [Public Suffix List](https://publicsuffix.org), `publicsuffix/list` on GitHub, at the commit the file names, in another shape | MPL-2.0, whose text is at <https://mozilla.org/MPL/2.0/> |
| [`src/cms/notice-texts.json`](src/cms/notice-texts.json) | The license texts of the packages the editor's application holds that no installed package carries, each from the package's tarball, its repository or the SPDX License List at the release `versions.env` pins, as the file says of each | Each text's own license |
| [`compose/forgejo/templates/user/auth/grant.tmpl`](compose/forgejo/templates/user/auth/grant.tmpl) | Forgejo's template at the same path, changed | Forgejo's: GPL-3.0-or-later, with the parts that came from Gitea under MIT |

## How the licenses fit

Konzilo is released under the AGPL, version 3 or later, and Kntnt Sweden AB stays free to license its own code otherwise. What Konzilo takes from others must allow both.

- **Built into Konzilo's own programs:** only what is under a permissive license, or under the MPL or the LGPL as a library used as it is. None binds Konzilo's code, though most ask for their notice to be kept. `tests/licenses.test.js` holds the list of licenses and fails on a package outside it, whether the core installs it or it comes within another's bundle into the editor's application.
- **Run beside Konzilo:** a program of its own keeps its own license, whichever it is. Konzilo's license does not reach it, and its license does not reach Konzilo.
- **A file with material of others:** it keeps its license, as a file of its own, and is named above.

[`CONTRIBUTING.md`](CONTRIBUTING.md) says on which terms material of others comes in.
