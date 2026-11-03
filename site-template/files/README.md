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

- `site-description.json` declares the content model: the post types with their addresses and fields, the taxonomies, the presentations of post lists, the menus, the settings, the forms and search.
- `src/` is the design: the layout, the pages, the components and the styles. `src/styles/body.css` styles body text; `src/styles/site.css` everything around it.
- `astro.config.mjs` names the body styles, the presentations' components and the pages of search and terms to Konzilo's integration.

An address the site has nothing at shows its 404 page, `src/pages/404.astro`. A category or a tag has a page of its own only when `site-description.json` gives its taxonomy an address, such as `"address": "/category/{slug}/"`.
