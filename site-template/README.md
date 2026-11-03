# The site template

`files/` holds what [`bin/new-site`](../bin/new-site) copies into a new site repository, and `demo-content/` the fictional content a local copy starts with.

```bash
bin/new-site demo      # a site repository that pins this checkout by its path
cd demo
npm install
npm run dev            # Astro's dev server, at http://localhost:4321
npm run build          # the static site, in dist/
```

`new-site` needs git, Node and npm. The site's name becomes its folder and later its hostnames, so it must be a hostname label: lowercase letters, digits and inner hyphens, at most 63 characters.

The template's `site-description.json` is the demo model, in British English (`"language": "en_GB"`). `demo-content/` holds what that model's content files look like, as `content-format.md` describes them.
