# @NAME@

A site built on Konzilo. This repository pins the core and holds what is the site's own; it never holds content.

## Start it locally

You need Node.

```bash
npm install
npm run dev
```

Astro's dev server answers at <http://localhost:4321> and reloads as you change the site's code or its content. `npm run build` writes the static site to `dist/`, for the public host `KONZILO_ORIGIN` names.

The first run copies the core's fictional demo content into `content/`, which Git ignores. Change it, or replace it with the site's own files, as Konzilo's `content-format.md` describes them. A site that has a `content/` folder keeps it.

## What is the site's own

- `site-description.json` declares the content model: the post types with their addresses and fields, the taxonomies, the presentations of post lists, the menus, the settings, the forms and search. Its types are Konzilo's built-in `article`, `page` and `canvas`, whose fields are the core's; a type of the site's own goes beside them. An article brings the taxonomies `authors`, `category` and `topics`.
- `src/` is the design: the layout, the pages, the components and the styles. `src/styles/body.css` styles body text; `src/styles/site.css` everything around it.
- `astro.config.mjs` names the body styles, the presentations' components and the pages of search and terms to Konzilo's integration.

The site's content and its look, which is the description, the templates and the styles, are outside Konzilo's license, the GNU Affero General Public License, and may be kept private or shared on any terms. Whatever changes what Konzilo does stays under that license, however it is done: an integration, a plugin or a script that adds function is no template. Konzilo's `SITE-EXCEPTION.md` says where the line runs.

An address the site has nothing at shows its 404 page, `src/pages/404.astro`. An author, a category or a topic has a page of its own only when `site-description.json` gives its taxonomy an address, such as `"category": { "address": "/category/{slug}/" }`. A canvas is a blank page: `src/layouts/Site.astro` gives it neither header nor footer.
