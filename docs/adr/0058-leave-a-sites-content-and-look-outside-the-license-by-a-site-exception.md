# ADR 0058: Leave a site's content and look outside the license, by a site exception

**Date:** 2026-11-10 · **Status:** Accepted, settled by Thomas on 2026-11-10: whoever builds a site on Konzilo may keep the site's own templates to themselves, and the exception says unambiguously what falls under it and what does not. Everything that changes behaviour, function or interfaces in Konzilo is under the AGPL, by whatever technique and through whatever hook, those of today and of later, Konzilo's own and those of the software it is built on. Only pure content, and the stylesheets and the like that a developer makes for a site, are excepted. Where the line runs in detail is a technical choice; Thomas may veto.

## Decision

- **`SITE-EXCEPTION.md` is an additional permission under section 7 of the license** (ADR 0057), given by Kntnt Sweden AB, with a version number of its own. It goes in the package, and the README names it.
- **Only a site's content and its look are outside the license,** to keep private or share on any terms:
  - **content,** what a site's people put in and what its visitors send;
  - **site material,** a file of one of five kinds that does nothing more than its kind says: a declaration or a setting; a template, which decides which content shows where and how; a style or an asset; a page script, which only shows, hides or moves what is on the site's own pages; and a test or a tool for these. One site or many may use it;
  - **output,** every file the core writes for a site, with the core's scripts and stylesheets in its pages. A page the core did not build may load it, as it does the consent script.
- **Whatever changes what the core does is under the license, however it is done.** A change is whatever changes, replaces, removes or adds to the core's behaviour, functions or interfaces. It may be made in a file of the core, by a patch or an override, through a hook of the core's, through a hook, plugin or other way in of the software the core is built on, by reaching into what the package does not export, in a site's file that does more than site material, or in any other way. A hook of today and one that comes later count alike.
- **No change:** content, site material, setting the core up through its settings, and running it as it is released.
- **The starting material may be taken for a site on any terms:** the site template, the demo content and the examples in the core's documents.
- **The core stays under the license,** every copy and every change. So does a file with something of the core's copied into it, wherever it is kept; the editor's application, though a browser receives it; a change to what the core's scripts do, in the source or in the built files; the core's code taken out of the output into other software; and software that is not a site and uses a part of the core.
- **Doubt goes to the license:** where it is not plain that a file is site material, it is not. The terms decide, and a list of cases shows them.

## Why

- A site is built together with the core's components, so the license, read strictly, reaches a site's templates, and its owner would owe them to every visitor. That goes against the code being free to use as one likes on one's own server, and it would keep others from building sites on Konzilo.
- The line follows what a file does, not how it reaches the core. The software Konzilo is built on has many ways in of its own, and a line by technique would leave each of them as a way to add closed function.
- A closed list of what is outside gives doubt an answer: what is not on it is under the license.
- A built page holds the core's scripts and stylesheets. Without a permission for the output, every site would owe its visitors an offer of their source.
- The site template and the demo content end up in every site, so a site's files could not be its own unless what they began from may be taken for a site.
- Section 13 stays whole for the core, which is what the license was chosen for. A host that changes what the core does cannot keep the change closed, whether it sits in the core's files, in a site's files or behind a hook.

## Considered and rejected

- **No exception.** A site's templates and stylesheets would follow the license.
- **The line by the interface a file uses,** with everything that reaches the core through its exports and options left outside. An extension could then be closed by going through a hook.
- **Only the hooks the core itself gets later.** The software the core is built on has hooks already, and they change what Konzilo does as well.
- **Only work made for one customer.** A developer's templates serve several sites, and nobody could tell from a file which it was made for. What a file does can be read in it.
- **A permissive license for the part a site imports,** and the AGPL for the rest. One package would have two licenses, and a change to the components a visitor meets could be closed.
- **A linking exception for any independent module,** as Java's class library has. It would let closed parts be built on to the core.
- **The line by where a file is kept.** A file of the core's copied into a site repository would escape.
- **Output free without limit.** The core's scripts could be taken from any built page into other software, on any terms.

## Consequences

- A site that adds function owes its visitors that function's source, and no more. Its templates, its stylesheets and its content stay its own.
- An extension is its author's own, and comes under terms that go together with the license (ADR 0059).
- The license holds as far as copyright lets it reach: for work that holds the core's code, or is built or run together with it. A change made wholly inside another program, which touches no file of the core's and runs apart from its code, is that program's matter. The exception makes sure that nothing of the kind is excepted here.
- Code put in the site template or the demo content may be taken for a site on any terms. Moving code between the core and the site template moves the line.
- The consent folder is made for another website to call or copy (ADR 0049). The exception covers the consent script such a page loads. The call and the copy stay under the license, for everyone but the copyright's holder.
- The exception covers the whole core only while every part of the core carries it. Work by others comes in under the contributor agreement, which lets Kntnt release it with the exception (ADR 0059), and the exception says that it covers such work too.
- Whoever conveys the core may drop the exception from that copy, as section 7 allows. Kntnt's releases carry it.
