read first when starting or resuming work

State at 2026-11-03. Overwrite when it changes; this is not a history.

- **Repository:** private, `Kntnt/konzilo`. No license is chosen, and none is until Thomas says, with the public day.
- **CI:** GitHub Actions is turned off for this repository, since the month's included minutes are nearly spent. Merge to `main` when the checks pass locally. Turning it on needs Thomas's yes while the minutes would cost money.
- **Exists:** the npm package `@kntnt/konzilo`, one package at the repository's root: the content format (`content-format.md`, `src/format/`), the site description's checker (`src/site-description.js`), the settings groups, the post lists, the search index and the Astro integration (`src/astro/`), which builds a site from content files alone. `bin/new-site` makes a site repository from `site-template/files/`, pinned to this checkout by its path, and `site-template/demo-content/` is its fictional content, copied in at the first `npm run dev` or `npm run build`.
- **Checks:** `npm ci && npm test` runs everything, in under two minutes, with no container. `tests/lib/content.js` stands in for the intake where a test needs a site's content files.
- **Not built yet:** the intake, Sveltia with the Crepe field, the Node service behind `/_konzilo/`, the live preview and share links, Docker Compose. Until the intake exists, `consent.json`, `settings.json` and the rest of a site's content are written by hand or by the stand-in. A site cannot yet declare components of its own: the registry is the rule data's. Forms render and the page's script sends them, but nothing answers at the endpoint.
- **Next:** the intake, by the spec, once the first site's templates are under way. A developer can build a site's templates on content files from week 49 of 2026.
