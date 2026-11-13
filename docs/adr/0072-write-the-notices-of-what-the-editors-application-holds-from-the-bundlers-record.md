# ADR 0072: Write the notices of what the editor's application holds, from the bundler's record

**Date:** 2026-11-12, amended 2026-11-13 · **Status:** Accepted as a technical choice; Thomas may veto, among them: the packages within Sveltia's own bundle are listed from its source maps, with license texts kept in the repository; a package that ships no license text anywhere gets its license's standard text from SPDX's list, with a note; the notices are served beside the application and named by the page's `<link rel="license">`, with no link an editor sees.

## Decision

- **The editor's build writes the notices beside the bundle,** `third-party-notices.txt`, one text file: each package by name and version, with the license its manifest names and its license texts in full, a package's `NOTICE` among them. Konzilo's own code is named at its head, with its license and where its source is. `scripts/build-editor.js` writes it, `scripts/notices.js` makes it.
- **The packages are found from the bundler's own record of what went in,** not from the lock, which holds more than the bundle: each chunk's modules, the workers' among them, and the source files of each asset, such as a font or a WebAssembly module. Each lies in the package whose `node_modules` folder holds it. The helpers Vite and Rolldown write into the bundle, modules with no file, are theirs.
- **A package's texts** are its own license files at its root, and those beside a file it gave the bundle, such as a font's `noto-mono.LICENSE.txt` in Sveltia's assets.
- **A package with its own bundle,** as Sveltia's npm build, holds packages that are nowhere installed: Svelte, React, Lexical, isomorphic-git and some ninety more. Its own bundler's record, the source map beside each file it gave the bundle, names them, and the path of pnpm's store in each source gives the version. They are listed as *within* that package.
- **A text no installed package holds is kept** in `src/cms/notice-texts.json`, by `name@version`, with where it came from: a package within another's bundle, and the few installed packages that ship none. `node scripts/notice-texts.js` writes it, from the package's tarball at the registry, checked against the integrity the registry gives, else from its repository on GitHub at the commit the registry names or the version's tag, else, for a package that ships none anywhere and names one license, the standard text of that license from SPDX's list at the release `versions.env` pins, `SPDX_LICENSE_LIST`, with a note that says so and names the author the manifest gives. The build reads no network for it.
- **The license of each package within another's bundle is held to the core's list,** as an installed package's is (ADR 0059): `tests/licenses.test.js` reads the licenses kept in `src/cms/notice-texts.json`, where the build demands one for each such package.
- **The build fails** on a package whose license it cannot name (none, `UNLICENSED`, or `SEE LICENSE IN …`), on one whose text it neither finds nor keeps, on one within another's bundle whose version its source map does not give, and on a module that is neither the core's, a package's nor the bundler's. Its error names each, and how to put a missing text right.
- **The web server's image keeps the notices with the application,** in `/srv/admin`, since they are part of what the build writes, and serves them on the admin host at `/third-party-notices.txt`, as any other file of the application. The editor's page names them with `<link rel="license" href="./third-party-notices.txt">`. No link an editor sees points to them yet: Sveltia has no place for it without a patch, and the notices are owed with the image, which holds them.

## Why

- MIT, ISC, BSD and Apache-2.0 each ask that the copyright line and the license text go with every copy, and Apache-2.0 a `NOTICE` file too. A name and an identifier are not enough, and the minified files hold neither.
- What the bundler put in is what the image gives others. The lock names test tools, native builds for other platforms and packages the bundle never reached, and misses what came inside another package's bundle.
- A text fetched at each build would make the web image's build hang on the registry and GitHub, and change under it. Kept in the repository, each is read and reviewed once, and changes only with a raise.

## Considered and rejected

- **The lock's packages, as `THIRD-PARTY.md` lists them.** It holds far more than the bundle, and not what came within Sveltia's.
- **A license plugin for the bundler.** Those read the modules of the bundle and know nothing of a package's own bundle within it, which is where most of the editor's packages are.
- **Leaving Sveltia's own bundle as one package, `@sveltia/cms`.** Its license covers Sveltia's code, not the ninety packages it carries, whose authors ask for their notices too.
- **A link in the editor's interface.** It needs a patch of Sveltia for a place in its menu; the image holds and serves the notices without it.

## What practice has shown

- At Sveltia 0.256.1, Crepe 7.23.0 and Vite 8.3.5, the notices name 226 packages: 94 of them within Sveltia's bundle, and both versions of `pdfjs-dist`, the one installed and the one within Sveltia's PDF worker. Most are under MIT, and none under a license that binds the work around it; within Sveltia's are `pako`, under MIT and Zlib, and `truncate-utf8-bytes`, under WTFPL, which are permissive. A list that read the lock alone let them in unasked; Thomas allowed both licenses on 2026-11-13 (ADR 0059), and the list holds the licenses kept for the packages within another's bundle too.
- Four installed packages ship no license text: `@bruits/satteri-wasm32-wasi` and `@napi-rs/wasm-runtime`, which the Markdown reader's WebAssembly build brings, and `terra-draw` with `terra-draw-leaflet-adapter`. Their repositories hold one at the published commit. Within Sveltia's bundle, `clean-git-ref`, `diff3` and `truncate-utf8-bytes` ship none and their repositories hold none, so theirs is SPDX's standard text, with the note.
- The file is about half a megabyte; Caddy serves it compressed.
