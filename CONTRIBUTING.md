# Contributing to Konzilo

Contributions are welcome, of every kind: a bug you report, an idea, a correction to a document, a test, a fix, a feature, or something of your own that builds on Konzilo.

There are two kinds, and they differ in whose the work is afterwards.

| | Stand-alone work | Work that goes into the core |
|---|---|---|
| What it is | Something a site adds to Konzilo, in a repository or a package of its own | A change to the files of this repository |
| Whose it is | Yours alone | Yours, with a license to Kntnt Sweden AB |
| Its license | Any you choose | Konzilo's, when it is released |
| What you agree to | Nothing | The contributor agreement, once |

## Stand-alone work

Stand-alone work adds to Konzilo from outside. It can be a design, a set of components, a presentation of post lists, a form or a package of such things, and, as Konzilo gets more ways to hook in, an extension of what it does. A site installs it and gets more, and Konzilo's own files stay as they are.

It is yours. You choose its license, its name and where it is published. Kntnt asks for no rights in it and for no agreement.

Konzilo's site exception makes that so: what reaches Konzilo only through its site interfaces is outside Konzilo's license ([`SITE-EXCEPTION.md`](SITE-EXCEPTION.md)). For its name, [`TRADEMARKS.md`](TRADEMARKS.md) holds: *for Konzilo* is free to say, and Konzilo in the work's own name takes permission.

If what you want to build needs a way in that Konzilo does not have, open an issue and say what it would take. A new interface is a contribution to the core, and a welcome one.

## Work that goes into the core

Everything that is to become part of this repository is a contribution to the core: a pull request, a patch, or code or text in an issue that is meant to be used.

You keep the copyright in what you contribute. Before it goes in, you agree once to [Konzilo's contributor agreement](CONTRIBUTOR-AGREEMENT.md). It gives Kntnt Sweden AB a license to release your contribution with Konzilo and to license it on other terms. It is of the same kind as the Apache Software Foundation's agreement.

The reason is this. Konzilo is released under the AGPL with a site exception. Kntnt wrote it, and can therefore change those terms, give the exception a later version, or license Konzilo otherwise. A contribution taken in under the AGPL alone would end that for the whole of Konzilo, since no part of it could move without that contribution's author. The agreement keeps Konzilo's terms in one hand.

It takes nothing from you. Your contribution stays yours to use as you like. What has been released under Konzilo's license stays available under it, since a release cannot be taken back.

### How to agree

In your first pull request, add a line about yourself to [`CONTRIBUTORS.md`](CONTRIBUTORS.md). The commit that adds it is your agreement, and it covers what you contribute from then on.

If you contribute as part of your work, or someone else has rights in what you write, name them on your line. The agreement's section 4 says what you assure about them.

### What is checked before a contribution goes in

1. **Its author is in `CONTRIBUTORS.md`,** by a commit of their own.
2. **It is its author's own work.** Where a part is someone else's, the pull request says whose it is and under which license. Such a part comes in only if it leaves the rest of the core free: under a permissive license, such as MIT, BSD, ISC or Apache-2.0, or as a file of its own that keeps its license and binds no other file, which [`THIRD-PARTY.md`](THIRD-PARTY.md) then lists. Code under the GPL, the AGPL or another license that binds the work it is built into cannot be built into Konzilo's own code, whoever sends it.
3. **A new dependency has a license on the list** in `tests/licenses.test.js`: a permissive one, or the MPL or the LGPL for a library used as it is. The test fails on any other.
4. **It comes with tests, and the checks pass.** Run `npm test` while you work. `npm run gate`, which needs Docker, must pass on the commit before it joins `main`.

Work by Kntnt's own people is Kntnt's, and needs no line.

## Before you start

- For anything larger than a fix, open an issue first, so that the work fits where Konzilo is going.
- Every file is in English, and a word means what [`GLOSSARY.md`](GLOSSARY.md) says.
- A decision about how Konzilo works is written down as an ADR ([`docs/adr/README.md`](docs/adr/README.md)). Read the ones your change touches.
