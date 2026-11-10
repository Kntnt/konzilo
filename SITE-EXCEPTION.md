# Konzilo's site exception

Version 1, 10 November 2026

Konzilo is free software under the GNU Affero General Public License, version 3 or any later version, called the License here ([`LICENSE`](LICENSE)). This exception is an additional permission under section 7 of the License. Kntnt Sweden AB, of Gothenburg, Sweden, gives it as the holder of the copyright in Konzilo.

It draws one line:

- **What a site adds to Konzilo is the site's own.** Its templates, components, design, settings and content, and the pages Konzilo builds from them, are outside the License. They may be kept private, or shared on any terms.
- **Konzilo itself stays under the License.** That holds for every copy of it and every change to it, wherever the changed file is kept and however the change is made.

The terms say exactly where the line runs. The cases after them show it, and where a case and the terms differ, the terms decide.

## Terms

### 1. Words

**The Core** is Konzilo: every file of its repository, `Kntnt/konzilo`, and of what is released from it, the package `@kntnt/konzilo` and its images, in any form, whole or in part, changed or not.

**The Starting Material** is the part of the Core that a site begins from: the files below `site-template/files/` and `site-template/demo-content/`, and the examples that the Core's documents give for a site's own files.

**A Site** is a website whose public pages the Core builds. A website that loads something from a Site, or that uses a part of the Core in software of its own, is not a Site for that.

**The Site Interfaces** are the ways the Core is made to be used for a Site, and there are no others:

1. the entry points that `exports` and `bin` name in the `package.json` of `@kntnt/konzilo`;
2. what the Core's documents give a Site to set, write or style: its settings and options, the site description, the content format, and the classes and custom properties of the Core's markup;
3. the Core's programs, images and Compose project, run as they are released and set up through their settings.

**Site Material** is a file that is part of a Site, or is used to build, run or host one, and that meets both of these:

1. It is not a file of the Core, and nothing in it is copied or adapted from the Core. Starting Material taken as section 2.1 allows, changed or not, does not count as the Core's for this.
2. It uses the Core, if it uses it at all, only through the Site Interfaces.

Where the file is kept, who wrote it, and whether one Site uses it or many make no difference.

**Content** is what a Site's people put into it and what its visitors send to it: source files, media, the values of settings, menus, redirects, submissions and records.

**Output** is every file the Core writes for a Site from its Content and its Site Material: the content files, the pages of a release with their stylesheets, scripts and images, the same pages in the live preview and through a share link, feeds, sitemaps, the consent script for pages the Core does not build, the search index and the archive. The Core's own programs are never Output, in any form. The editor's application on the admin host, with the Crepe field and the Core's screens, is the Core, though a browser receives it.

### 2. What this exception permits

**2.1 Starting Material.** You may copy Starting Material into files for a Site, change it there or leave it as it is, and use and share those files on any terms. The License puts no condition on them.

**2.2 Site Material.** You may combine Site Material with the Core, and build, run, host and convey the combination, and the License does not apply to the Site Material because of it. In particular:

- you may keep Site Material private, or license it on any terms;
- Site Material is no part of the Corresponding Source of the Core or of the combination, so sections 6 and 13 of the License do not make you offer it;
- a Site that runs the Core unchanged is not a modified version of the Core, whatever Site Material it has, and section 13 asks nothing of it.

**2.3 Content.** The License does not apply to Content.

**2.4 Output.** You may use, copy, process, serve and share Output on any terms. No source need be offered with it and no notice kept in it, though it holds parts of the Core, such as the scripts and stylesheets the Core puts in a page. A page that the Core did not build may load Output, such as a Site's consent script, and does not come under the License by that.

### 3. What stays under the License

**3.1 The Core.** The License holds for every copy of the Core and every change to it. Whoever changes the Core and lets others use the changed Core over a network offers them its source, as section 13 says. Whoever conveys the Core, alone or together with Site Material, does so as the License says. This exception only leaves the Site Material out of it.

**3.2 A file taken from the Core.** A file of the Core, and a file with something copied or adapted from the Core in it, is under the License wherever it is kept, a site repository included. Starting Material taken as section 2.1 allows is the one exception.

**3.3 A way round the Site Interfaces.** A file that uses the Core in any other way than through the Site Interfaces is not Site Material. That is so when it:

- imports or loads code of the Core that the package does not export;
- puts other code in the place of any of the Core's code, or rewrites, patches or removes any of it, when a Site is installed, built or run;
- reads or changes what the Core keeps to itself while it runs.

This exception does not cover such a file, and the License holds for it as for a change to the Core.

**3.4 The Core's code in Output.** Section 2.4 permits Output as a Site's pages and files. It does not permit changing what the Core's own scripts do, whether in the Core's source or in the files the Core has built, nor taking the Core's code out of Output to build other software with it. Both are uses of the Core, and the License holds for them.

**3.5 Software that is not a Site.** This exception gives nothing to software that uses a part of the Core, by import or by copy, without being Site Material: another website that calls the Core's functions or copies its files into its own code, or another product built on parts of the Core. The License alone decides for it.

**3.6 The name.** This exception gives no right to the name Konzilo or to Konzilo's logos. [`TRADEMARKS.md`](TRADEMARKS.md) says how they may be used.

**3.7 Everything else.** What this exception does not name stays as the License has it.

### 4. Reach and versions

This exception covers what Kntnt Sweden AB holds the copyright in. Software of others that a release of the Core holds, such as Sveltia CMS, is under its own license.

The exception goes with the Core under any later version of the License as well. Kntnt Sweden AB may give a later version of this exception with later releases of the Core, and a release keeps the version it was released with.

## Cases

**Outside the License, by this exception:**

| Case | By |
|---|---|
| A layout, a page or a component written for a site, which imports Konzilo's components and helpers from the package | 2.2 |
| A site's site description, design file, stylesheets, scripts, tests, `astro.config.mjs`, Compose file and settings | 2.2 |
| A file that began as a file of the site template, or a post that began as demo content, changed or not | 2.1 |
| A package of templates, components or styles that many sites install, sold or given away | 2.2 |
| Any other package a site uses, under whatever license it has | 2.2 |
| Scripts and settings that host many sites by running Konzilo's released images | 2.2 |
| What editors write and upload, and what visitors send | 2.3 |
| The built pages that visitors get, with Konzilo's scripts and stylesheets in them, also minified, cached or copied to another host | 2.4 |
| A site's consent script, loaded by a page Konzilo did not build | 2.4 |

**Under the License, as without this exception:**

| Case | By |
|---|---|
| A change to any file of Konzilo: the Astro integration, the intake, the build, the Node service, the live preview, the Crepe field, the commands or the images | 3.1 |
| A component of Konzilo's, copied into a site repository and changed there | 3.2 |
| A patch applied to Konzilo when a site is installed, an alias or override that puts other code in the place of Konzilo's, or code that rewrites Konzilo's modules at the build | 3.3 |
| A site's file that imports code of Konzilo's that the package does not export | 3.3 |
| A changed Crepe field or editor's screen, though it runs in the editor's browser | 3.1 |
| Konzilo's consent script, edited after the build to work differently | 3.4 |
| Konzilo's scripts, taken from a built site into another product | 3.4 |
| Another website, not built by Konzilo, that imports Konzilo's functions or copies Konzilo's files into its own code | 3.5 |
| The site template's files, used to make something that is not a site on Konzilo | 3.2 |
