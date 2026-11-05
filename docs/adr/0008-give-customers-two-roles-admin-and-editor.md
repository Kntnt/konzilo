# ADR 0008: Give customers two roles, Admin and Editor

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02: two roles, Admin and Editor. Everyone with access reads every draft and may publish. A check on who may set a post to published can come later if a customer needs it.

## Decision

- **Admin** is the customer's highest role: it manages the customer's users, changes menus and site settings, redirects and services, and writes the privacy policy. **Editor** writes content.
- **A role is all that limits an editor.** There is no restriction per post type, and none is needed until a site asks for it.
- **Within a customer's Forgejo:** one organisation and one source repository per site. Teams `admins` and `editors` have write access, never ownership, so no customer reaches webhooks or settings.
- **The check that counts runs on the server.** The intake reads who pushed each commit, as Forgejo recorded it and not as the commit says, and refuses a change to settings, menus, redirects or services, or to a post chosen as a legal page (ADR 0052), by someone who is not an Admin (Thomas, 2026-11-03). `preSave` says so first. Forms for Admins cannot be hidden per person in Sveltia, so they are labelled.
- **Screens that read the service's data ask Forgejo who is asking,** per call, and decide by team.
- **Users.** A *Users* page, through the service, lets an Admin add a colleague and choose a role, so that customers do not wait for Kntnt.
- **Kntnt's account is the instance's administrator** and is not listed to others, so that a customer can never lock Kntnt out of a site Kntnt is responsible for, nor make a colleague an administrator. One rule holds for everyone but Kntnt: lists leave it out, and a question about it is answered as about a user who does not exist.
- **Nobody installs or updates anything through the editing tool.** Only Kntnt or the site's developer changes what a site is: its code and its content model, which come from the site repository.

## Why

- A commit's author and committer are whatever the one making it writes, through Forgejo's API or a push. Who pushed is the signed-in account, in the repository's activity feed, where nobody but Forgejo writes.
- Customers change what is theirs without asking Kntnt.
- Sveltia has no roles, and its roadmap rules out such features.

## Considered and rejected

- **Author, Contributor and Subscriber,** and with them a review step and private drafts. They need a role system Sveltia does not have, and an editor who may not see a colleague's title in a list needs a preview per person.
- **Customers as owners of their organisation.** They could change webhooks and settings, and Kntnt's accounts.
- **Editor as the customer's highest role.** Every new user, menu change and footer text would become a request to Kntnt.

## What practice has shown

- An Admin's address on an Editor's commit, through `POST /contents` with `author` and `committer`, was taken as written, and the feed still named the Editor. A push's entry names its commits only up to a limit, and its comparison's address names what it went from and to, so all it brought can be read from Git.
- The feed writes a push down a moment after it, so a build waits up to 15 seconds for a new commit. A commit that never shows is no Admin's.
- The feed leaves out what a private account did for anyone who does not run the instance, and team members are told only to those in the team or running the instance, so the builder reads both with a token of the instance's account that can do nothing but read.
- A team once given every repository keeps them when told otherwise, with Forgejo's answer a plain 200, unless the change also says what the team may do. So the seed reads the answer.

## Consequences

- The two names *Admin* (the customer's role) and *administrator* (Kntnt's account on the instance) are easy to confuse; `GLOSSARY.md` keeps them apart.
