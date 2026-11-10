# ADR 0057: License the code under the AGPL, and keep the name by a trademark policy

**Date:** 2026-11-10 · **Status:** Accepted, settled by Thomas on 2026-11-10: AGPL-3.0-or-later holds, with a trademark policy. The code is free to download, use and change on one's own machine or server, nobody makes a closed variant of it, others may host it, and whoever sells it under the name Konzilo answers for how the name is used, so that it does not fall into disrepute. The policy's wording is a technical choice; Thomas may veto.

## Decision

- **The core is free software under the GNU Affero General Public License, version 3 or any later version,** `AGPL-3.0-or-later`. `LICENSE` holds the license's text, the README the notice that says *or any later version*, and `package.json` the identifier. The copyright is Kntnt Sweden AB's.
- **The name is not licensed with the code.** The name Konzilo and Konzilo's logos are trademarks of Kntnt Sweden AB, and `TRADEMARKS.md` says how they may be used. The license only declines to grant them, as its section 7(e) allows.
- **Anyone may say what is true:** that a site is built with Konzilo, that a service hosts it, that a piece of software is based on it. Kntnt's written permission is needed for the name in the name of a company, a product, a service, a domain or an account, for a logo, for a word such as *official* or *certified*, and for calling a changed version Konzilo.
- **Anyone may host Konzilo for others, under a name of their own.** A host that sells under Konzilo's name does so by an agreement that makes it answer for what the name promises: Kntnt's releases unchanged and current, the acceptance tests passing on its servers, a site handed over as its archive, and customers kept apart.
- **What comes into the core from elsewhere must go together with the license, and leave the core free.** A dependency, or code someone else wrote, comes in only on terms that the AGPL, version 3, can be combined with, and that let Kntnt license the core otherwise too, as ADR 0059 says: a permissive license, the MPL or the LGPL for a library used as it is, a file of its own that keeps its license, or the contributor agreement.

## Why

- A host that changes Konzilo and runs it for others gives nobody a copy, so the GPL asks nothing of it. The AGPL asks it to offer its users its changes. A host that runs the releases unchanged owes nothing.
- An open-source license may not set other terms for hosting than for other use, and it grants no right to a name. Keeping the name out of disrepute is therefore a trademark's work: anyone may host the code, and only who answers for it may sell it as Konzilo.
- The conditions for selling under the name are ones that tests prove (ADR 0004, ADR 0006, ADR 0014), so a host is held to them by a run, not by an opinion.
- *Or any later version* lets the core take up a later version of the license without every contributor's consent.

## Considered and rejected

- **MIT or Apache-2.0.** Either lets a closed variant be made.
- **GPL-3.0.** It binds whoever gives out copies, which a host does not.
- **MPL-2.0.** It keeps a changed file open, but says nothing of use over a network, and lets closed parts be built around the core.
- **EUPL-1.2.** It covers hosting too, is written for the law of the EU and has a Swedish text. Fewer know it, and a work that combines it with code under one of the licenses it lists as compatible, weaker ones among them, may go out under that license.
- **A license that forbids competing hosting,** such as the BSL, the FSL or the SSPL. None is open source, and hosting by others is welcome.
- **Terms about the name in the license itself.** Beyond declining to grant it, they would be further restrictions, which the license lets anyone strike.

## Consequences

- The dependencies of today are under permissive licenses, MPL-2.0 or the LGPL, and all go together with the license. One under the GPL, version 2 alone, or under terms that forbid a use, does not. One under the GPL, version 3, or the AGPL does, but would bind the core to it, and stays out too (ADR 0059).
- The programs a Compose project runs beside the core, such as Forgejo and Caddy, are works of their own under their own licenses.
- The policy has force where the name is a protected trademark. A name not yet well known is protected by registration, which is Thomas's to make.
- A site is built together with the core's components, and the site template and the demo content end up in every site. ADR 0058 leaves a site's content and look outside the license, and whatever changes what the core does under it.
- ADR 0059 holds the terms on which contributions are taken.
