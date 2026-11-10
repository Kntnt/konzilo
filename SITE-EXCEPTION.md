# Konzilo's site exception

Version 1, 10 November 2026

Konzilo is free software under the GNU Affero General Public License, version 3 or any later version, called the License here ([`LICENSE`](LICENSE)). This exception is an additional permission under section 7 of the License. Kntnt Sweden AB, of Gothenburg, Sweden, gives it for Konzilo: for what it holds the copyright in, and for what others have contributed under Konzilo's contributor agreement.

It draws one line:

- **Whatever changes what Konzilo does is under the License, however it is done.** That holds for its behaviour, its functions and its interfaces, and for every way of changing them: in Konzilo's own files, through a hook of Konzilo's, or through a hook of the software Konzilo is built on.
- **Only a site's content and its look are outside the License.** What a site's people write, the templates and stylesheets that show it, and the pages Konzilo builds from them may be kept private, or shared on any terms.

The terms say exactly where the line runs. The cases after them show it, and where a case and the terms differ, the terms decide.

## Terms

### 1. Words

**The Core** is Konzilo: every file of its repository, `Kntnt/konzilo`, and of what is released from it, the package `@kntnt/konzilo` and its images, in any form, whole or in part, changed or not.

**The Underlying Software** is the software the Core is built on or runs beside, which `ACKNOWLEDGEMENTS.md` names: Astro, Vite, Sätteri, Sveltia CMS, Milkdown, Node.js, Forgejo, Caddy, Typesense and the rest.

**The Starting Material** is the part of the Core that a site begins from: the files below `site-template/files/` and `site-template/demo-content/`, and the examples that the Core's documents give for a site's own files.

**A Site** is a website whose public pages the Core builds. A website that loads something from a Site, or that uses a part of the Core in software of its own, is not a Site for that.

**Content** is what a Site's people put into it and what its visitors send to it: source files, media, the values of settings, menus, redirects, submissions and records.

**Site Material** is a file of a Site, or one made for Sites, that is of one of the five kinds below and does nothing more than its kind says:

1. **A declaration or a setting:** the site description, the values of settings, and the options that the Core's documents give a Site to set.
2. **A template:** a layout, a page or a component that decides which of the Site's Content shows where, and how. It may read the Site's Content and settings, and arrange, sort and format them for showing. It may use what the Core's package exports for showing them, and the Core may take it through an option, as it takes a directive's component, a presentation of post lists, a form, the search page and the term page.
3. **A style or an asset:** a stylesheet, the design file, a font, an image or an icon.
4. **A page script:** a script that runs in a visitor's browser and only shows, hides or moves what is on the Site's own pages, such as a menu that opens or pictures that slide.
5. **A test or a tool for these:** a test of the four kinds above, or a tool that works on them alone, such as one that compiles the stylesheets.

Nothing in Site Material is copied or adapted from the Core. Starting Material taken as section 2.1 allows does not count as the Core's for this.

Where the file is kept, who wrote it, and whether one Site uses it or many make no difference.

**A Change** is whatever changes, replaces, removes or adds to what the Core does: its behaviour, its functions or its interfaces, towards editors, visitors, operators or other programs. The means make no difference. A Change may be made:

1. in a file of the Core, or in a copy of one;
2. by a patch, an override, an alias or anything else that puts other code in the place of the Core's, or rewrites or removes it, when a Site is installed, built or run;
3. through a hook, an event, a registry or any other way in that the Core has, today or later;
4. through a hook, a plugin, an integration, a middleware, a template, a module or any other way in that the Underlying Software has, today or later;
5. by using code of the Core's that its package does not export, or by reading or changing what the Core keeps to itself while it runs;
6. in a file of a Site that does more than its kind of Site Material says, such as one that sends, fetches or stores data, or that changes Content rather than shows it;
7. in any other way.

These are no Change: Content, Site Material, setting the Core up through its settings, and running the Core as it is released.

**Output** is every file the Core writes for a Site from its Content and its Site Material: the content files, the pages of a release with their stylesheets, scripts and images, the same pages in the live preview and through a share link, feeds, sitemaps, the consent script for pages the Core does not build, the search index and the archive. The Core's own programs are never Output, in any form. The editor's application on the admin host, with the Crepe field and the Core's screens, is the Core, though a browser receives it.

### 2. What this exception permits

**2.1 Starting Material.** You may copy Starting Material into files for a Site, change it there or leave it as it is, and use and share those files on any terms. The License puts no condition on them.

**2.2 Site Material.** You may combine Site Material with the Core, and build, run, host and convey the combination, and the License does not apply to the Site Material because of it. In particular:

- you may keep Site Material private, or license it on any terms;
- Site Material is no part of the Corresponding Source of the Core or of the combination, so sections 6 and 13 of the License do not make you offer it;
- a Site that makes no Change runs no modified version of the Core, whatever Site Material it has, and section 13 asks nothing of it.

**2.3 Content.** The License does not apply to Content.

**2.4 Output.** You may use, copy, process, serve and share Output on any terms. No source need be offered with it and no notice kept in it, though it holds parts of the Core, such as the scripts and stylesheets the Core puts in a page. A page that the Core did not build may load Output, such as a Site's consent script, and does not come under the License by that.

### 3. What stays under the License

**3.1 The Core.** The License holds for every copy of the Core and every change to it. Whoever conveys the Core, alone or together with Site Material, does so as the License says. This exception only leaves the Site Material out of it.

**3.2 A Change.** Every Change is under the License, as a change to the Core's own files is, in whichever of the ways of section 1 it is made. An extension of the Core is therefore under the License whether it uses a hook of the Core's or one of the Underlying Software's, and whether that hook exists today or comes later. Whoever lets others use the Core with a Change over a network offers them the source of the Core and of the Change, as section 13 says. Site Material and Content are left out of it.

**3.3 A file taken from the Core.** A file of the Core, and a file with something copied or adapted from the Core in it, is under the License wherever it is kept, a site repository included. Starting Material taken as section 2.1 allows is the one exception.

**3.4 The Core's code in Output.** Section 2.4 permits Output as a Site's pages and files. It does not permit changing what the Core's own scripts do, whether in the Core's source or in the files the Core has built, nor taking the Core's code out of Output to build other software with it. Both are uses of the Core, and the License holds for them.

**3.5 Software that is not a Site.** This exception gives nothing to software that uses a part of the Core, by import or by copy, without being a Site: another website that calls the Core's functions or copies its files into its own code, or another product built on parts of the Core. The License alone decides for it.

**3.6 The name.** This exception gives no right to the name Konzilo or to Konzilo's logos. [`TRADEMARKS.md`](TRADEMARKS.md) says how they may be used.

**3.7 Everything else, and doubt.** What this exception does not name stays as the License has it. Where it is not plain that a file is Site Material, it is not.

### 4. Reach and versions

This exception covers what Kntnt Sweden AB holds the copyright in, and what others have contributed to the Core under Konzilo's contributor agreement. Software of others that a release of the Core holds, such as Sveltia CMS, is under its own license.

The exception goes with the Core under any later version of the License as well. Kntnt Sweden AB may give a later version of this exception with later releases of the Core, and a release keeps the version it was released with.

## Cases

**Outside the License, by this exception:**

| Case | By |
|---|---|
| What editors write and upload, and what visitors send | 2.3 |
| A site's site description, its settings, its `astro.config.mjs` with Konzilo's options, and its Compose file | 2.2, kind 1 |
| A layout, a page or a component that shows a site's content, using Konzilo's components and helpers from the package | 2.2, kind 2 |
| A component that a site hands to Konzilo to show a directive, a post list, a form, the search page or a term page | 2.2, kind 2 |
| A site's stylesheets, design file, fonts, images and icons | 2.2, kind 3 |
| A script that opens a menu or slides pictures on a site's own pages | 2.2, kind 4 |
| A test of a site's templates, and a tool that compiles its stylesheets | 2.2, kind 5 |
| A file that began as a file of the site template, or a post that began as demo content, changed or not | 2.1 |
| The same templates and stylesheets used in several sites, or sold as a design | 2.2 |
| The built pages that visitors get, with Konzilo's scripts and stylesheets in them, also minified, cached or copied to another host | 2.4 |
| A site's consent script, loaded by a page Konzilo did not build | 2.4 |

**Under the License, as without this exception:**

| Case | By |
|---|---|
| A change to any file of Konzilo: the Astro integration, the intake, the build, the Node service, the live preview, the Crepe field, the commands or the images | 3.1 |
| A changed Crepe field or editor's screen, though it runs in the editor's browser | 3.1 |
| A component of Konzilo's, copied into a site repository and changed there | 3.3 |
| A patch applied to Konzilo when a site is installed, an alias or override that puts other code in the place of Konzilo's, or code that rewrites Konzilo's modules at the build | 3.2, way 2 |
| An extension that uses a hook of Konzilo's, whether the hook exists today or comes later | 3.2, way 3 |
| An Astro integration or middleware, a Vite plugin or a plugin of the Markdown reader that changes what a build makes | 3.2, way 4 |
| A field, a widget, a button or a page added to the editor through Sveltia CMS's or Milkdown's own ways of adding one | 3.2, way 4 |
| A change to the sign-in through a template or a hook of Forgejo's, or to how pages are served through Caddy | 3.2, way 4 |
| A site's file that imports code of Konzilo's that the package does not export | 3.2, way 5 |
| A component or a script of a site's that sends, fetches or stores data, such as a booking form of its own or a tracker | 3.2, way 6 |
| Konzilo's consent script, edited after the build to work differently | 3.4 |
| Konzilo's scripts, taken from a built site into another product | 3.4 |
| Another website, not built by Konzilo, that imports Konzilo's functions or copies Konzilo's files into its own code | 3.5 |
| The site template's files, used to make something that is not a site on Konzilo | 3.3 |

**No Change, and not for this exception to say:**

| Case | By |
|---|---|
| A program of its own that starts, stops, watches or backs up Konzilo as it is released, through its settings, such as a hosting layer | Section 1: running the Core as released is no Change. Such a program is no Site Material either, and the License alone decides for it, as for any separate program |
