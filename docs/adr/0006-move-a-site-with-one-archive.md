# ADR 0006: Move a site with one archive

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02: one archive moves a site, and a customer that leaves runs the export on any Docker host, and its public pages on any web host. The rest is a technical choice; Thomas may veto.

## Decision

- **One format moves a site.** `konzilo export` writes one archive, and `konzilo import` takes one, in every case. Backups, the restore drill, handover packages, moving between local and live, and a customer leaving all use it.
- **It holds:** the customer's Forgejo data with the source repository and its LFS objects, the site's code, the content repository, the service's SQLite and the accounts.
- **A backup keeps everything, encrypted,** so that a restore gives back the logins people had. **An export for leaving scrubs secrets** and leaves out passwords and second factors, so that people set new ones. What logs in, resets a login or opens something goes: passwords, reset keys, sessions, second factors and their recovery codes, tokens, stored keys. The customer's own data stays. A test proves that no secret is left, at any depth.
- **Everything a customer owns can be found in Forgejo, or in the archive.** A hosted site's code stays on GitHub and is mirrored into the customer's Forgejo. On a stand-alone site, Forgejo holds the code outright. Form submissions and consent records are not in Git, so they come only with the archive.
- **Git history travels as objects and refs alone,** so no hook or setting travels with it, and LFS objects travel beside it.
- **The service's SQLite is taken through its backup API,** so that a copy is consistent while the service runs.
- **Leaving is proved.** An acceptance test exports a hosted site, imports it into a fresh Compose with no setting or package of Kntnt's, and checks that it publishes, signs in and takes a form.
- **Public packages and images are part of leaving.** An imported site pins the core, so these must be available without a token by the day a customer leaves.
- **The archive comes with an instruction,** written for a developer who does not know Konzilo: what each part is, how to run it, how to check that it works, and what it leaves out.

## Why

- Leaving and Kntnt being gone need the same thing, so one path serves both, and the one path is the one that is tested.
- The backups exist anyway, and a restore drill proves the format every day.
- A customer must not depend on one person.

## Considered and rejected

- **An ordinary WordPress site as the exit:** one zip that installs on a plain host. A customer with only a plain web host can show its pages there but cannot edit them there, which Thomas has weighed. A converter into WordPress can be built if a customer ever wants one (Thomas, 2026-11-02).
- **An export made only on request.** It would be a second path, untested until the day it is needed.
- **A copy of `.git`.** The repository's settings and hooks would travel with it onto the developer's machine, where git runs them.
- **Cleaning a dump on its way through by editing text.** One value that looks like a key lets a secret through.

## What practice has shown

Forgejo was away 3.7 s while the archive was made (612 MB, tar 1.6 s). A restore's 13.4 s was 10.3 s stopping, nearly all a stand-in ignoring its signal, 1.0 s unpacking and 2.2 s starting. Afterwards: the archive's commit, the later change gone, LFS 1,001 of 1,001, users 5 of 5, `fsck` clean, and sign-in with the same second factor. A browser left open showed the older data after a reload and saved, without signing in again. That customer's Forgejo answered 502 while away; the other's answered every time, with a median save of 0.46 s.
