# ADR 0058: Leave what a site adds outside the license, by a site exception

**Date:** 2026-11-10 · **Status:** Accepted, settled by Thomas on 2026-11-10: whoever builds a site on Konzilo may keep the site's own templates to themselves, and the exception says unambiguously what falls under it and what does not. Where the line runs in detail is a technical choice; Thomas may veto.

## Decision

- **`SITE-EXCEPTION.md` is an additional permission under section 7 of the license** (ADR 0057), given by Kntnt Sweden AB, with a version number of its own. It goes in the package, and the README names it.
- **What a site adds is outside the license,** to keep private or share on any terms:
  - **site material,** a file of a site, or one used to build, run or host it, that holds nothing copied or adapted from the core and uses the core only through the site interfaces. One site or many may use it, from a site repository or from a package;
  - **content,** what a site's people put in and what its visitors send;
  - **output,** every file the core writes for a site, with the core's scripts and stylesheets in its pages. A page the core did not build may load it, as it does the consent script.
- **The site interfaces are three, and no others:** what the package's `exports` and `bin` name; what the core's documents give a site to set, write or style; and the core's programs, images and Compose project, run as released and set up through their settings.
- **The starting material may be taken for a site on any terms:** the site template, the demo content and the examples in the core's documents.
- **The core stays under the license,** every copy and every change. So does a file with something of the core's copied into it, wherever it is kept; a file that goes round the site interfaces, by importing what the package does not export or by replacing, rewriting or patching the core's code; the editor's application, though a browser receives it; a change to what the core's scripts do, in the source or in the built files; the core's code taken out of the output into other software; and software that is not a site and uses a part of the core.
- **The terms decide, and a list of cases shows them:** nine outside the license and nine under it.

## Why

- A site is built together with the core's components, so the license, read strictly, reaches a site's templates, and its owner would owe them to every visitor. That goes against the code being free to use as one likes on one's own server, and it would keep others from building sites on Konzilo.
- The line follows what a file does, which can be checked in the file: what it holds of the core's, and how it reaches the core. The package's `exports` already say what a site may import.
- A built page holds the core's scripts and stylesheets. Without a permission for the output, every site would owe its visitors an offer of their source.
- The site template and the demo content end up in every site, so a site's files could not be its own unless what they began from may be taken for a site.
- Section 13 stays whole for the core, which is what the license was chosen for. A host that changes the core cannot move the change into a site's files: a copied file, a patch and a way round the interfaces all stay under the license.

## Considered and rejected

- **No exception.** A site's own code would follow the license.
- **A permissive license for the part a site imports,** and the AGPL for the rest. One package would have two licenses, and a change to the components a visitor meets could be closed.
- **A linking exception for any independent module,** as Java's class library has. It would let closed parts be built on to the core's own programs, not only sites.
- **The line by where a file is kept.** A file of the core's copied into a site repository would escape, and a package of templates that many sites install would not be covered.
- **Output free without limit.** The core's scripts could be taken from any built page into other software, on any terms.
- **A permissive license for the site template alone.** The templates would still use the core's components, and so still come under the license.

## Consequences

- Code put in the site template or the demo content may be taken for a site on any terms, and what the package exports is what a site may use. Moving code between the core and the site template, or changing the exports, moves the line.
- The consent folder is made for another website to call or copy (ADR 0049). The exception covers the consent script such a page loads. The call and the copy stay under the license, for everyone but the copyright's holder.
- The exception covers the whole core only while every part of the core carries it. Work by others comes in under the contributor agreement, which lets Kntnt release it with the exception (ADR 0059), and the exception says that it covers such work too.
- Whoever conveys the core may drop the exception from that copy, as section 7 allows. Kntnt's releases carry it.
