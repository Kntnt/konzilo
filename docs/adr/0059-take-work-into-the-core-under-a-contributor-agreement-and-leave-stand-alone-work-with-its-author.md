# ADR 0059: Take work into the core under a contributor agreement, and leave stand-alone work with its author

**Date:** 2026-11-10 · **Status:** Accepted, settled by Thomas on 2026-11-10: contributions are encouraged and every one is welcome. A stand-alone contribution, which a user of Konzilo adds through its ways of hooking in, needs no right given to Kntnt. A contribution that is patched into Konzilo's own code passes a screening, so that neither the project nor Kntnt Sweden AB is locked into the AGPL and Kntnt keeps its freedom with what is its own, in the way of Apache's agreements. The agreement's wording, the way to agree and the list of licenses are technical choices; Thomas may veto.

## Decision

- **`CONTRIBUTING.md` welcomes every contribution and tells two kinds apart:** stand-alone work, and work that goes into the core.
- **Stand-alone work is its author's alone.** It adds to Konzilo from a repository or a package of its own, through the site interfaces, and the site exception leaves it outside the license (ADR 0058). Its author chooses its license, and Kntnt asks for no right and no agreement. A way in that is missing is asked for in an issue, and adding it is work on the core.
- **Work that goes into the core comes in under `CONTRIBUTOR-AGREEMENT.md`.** Its author keeps the copyright and gives Kntnt Sweden AB, and whoever takes over its rights in Konzilo, a perpetual and irrevocable license to release the contribution and to license it to others on any terms, with a patent license, and assures that the work is their own and theirs to give. It is a license, not a transfer, of the kind the Apache Software Foundation uses.
- **A contributor agrees once, by a commit of their own** that adds their line to `CONTRIBUTORS.md`, with the agreement's version and whom they contribute for.
- **The screening before work goes in:** its author is in `CONTRIBUTORS.md`; the work is the author's own, and a part that is someone else's is named with its license and comes in only under a permissive one, or as a file of its own that keeps its license and binds no other, which `THIRD-PARTY.md` lists; a new dependency has a license on the list; and the checks pass.
- **`tests/licenses.test.js` holds the list** and reads the lock: the permissive licenses the core installs today, and the MPL and the LGPL for a library used as it is. A license outside the list fails the suite, so that taking one in is a decision.
- **Work by Kntnt's own people is Kntnt's,** and needs no line. An agent merges no work by anyone outside Kntnt; that waits for Thomas (`docs/agents/autonomy.md`).

## Why

- A contribution taken in under the AGPL alone would bind Kntnt to the AGPL for that part, and so for the whole: Kntnt could no longer change the license, give the site exception a later version, or license Konzilo otherwise, without that author's yes.
- A license is enough for that, and asks less of a contributor than giving the copyright away. The contributor keeps the work, and what has been released under Konzilo's license stays available under it.
- Stand-alone work touches no file of Konzilo's, so there is nothing for Kntnt to hold a right in, and asking for one would only keep people from building on Konzilo.
- Code under the GPL or the AGPL fits the license (ADR 0057) and would still lock the core, since Kntnt could not license it otherwise. The screening therefore asks more than that the licenses go together.
- A line in the repository, added by the contributor, is a record that git keeps beside the code and that needs no service outside it.

## Considered and rejected

- **Contributions under the license they come to, with a sign-off and no agreement.** Simplest for a contributor, and it locks the core into the AGPL.
- **A transfer of the copyright to Kntnt.** More than is needed, harder to give under many countries' laws, and it keeps more people away.
- **An agreement for stand-alone work too.** Kntnt needs no right in what is not in its code.
- **A service that collects the agreements.** It reaches outside this repository, and can come when the checks run on GitHub.
- **A promise that Konzilo stays under a free license for good.** It would take away the freedom the agreement is for; what is already released cannot be taken back in any case.

## Consequences

- With the agreement Kntnt may release a contribution with the site exception, so the exception covers the whole core (ADR 0058).
- Two files in the core hold material of others today, each a file of its own: the Public Suffix List's rules, under MPL-2.0, and a template changed from Forgejo's, which only Forgejo reads. Neither binds another file, and `THIRD-PARTY.md` names both.
- Whoever contributes for an employer assures the employer's yes. An agreement that an employer signs for all its people can be added when one asks.
- Kntnt's freedom rests on the list of contributors being whole, so a commit by an author who is not in it does not go in, however small.
