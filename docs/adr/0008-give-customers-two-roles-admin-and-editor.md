# ADR 0008: Give customers two roles, Admin and Editor

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02: two roles, Admin and Editor. Everyone with access reads every draft and may publish. A check on who may set a post to published can come later if a customer needs it.

## Decision

- **Admin** is the customer's highest role: it manages the customer's users, changes menus and site settings, redirects and services, and writes the privacy policy. **Editor** writes content.
- **A role is all that limits an editor.** There is no restriction per post type, and none is needed until a site asks for it.
- **Within a customer's Forgejo:** one organisation and one source repository per site. Teams `admins` and `editors` have write access, never ownership, so no customer reaches webhooks or settings.
- **The check that counts runs on the server.** The intake reads who made each commit, and refuses a change to settings, menus, redirects or services by someone who is not an Admin. `preSave` says so first. Forms for Admins cannot be hidden per person in Sveltia, so they are labelled.
- **Screens that read the service's data ask Forgejo who is asking,** per call, and decide by team.
- **Users.** A *Users* page, through the service, lets an Admin add a colleague and choose a role, so that customers do not wait for Kntnt.
- **Kntnt's account is the instance's administrator** and is not listed to others, so that a customer can never lock Kntnt out of a site Kntnt is responsible for, nor make a colleague an administrator. One rule holds for everyone but Kntnt: lists leave it out, and a question about it is answered as about a user who does not exist.
- **Nobody installs or updates anything through the editing tool.** Only Kntnt or the site's developer changes what a site is: its code and its content model, which come from the site repository.

## Why

- Customers change what is theirs without asking Kntnt.
- Sveltia has no roles, and its roadmap rules out such features.

## Considered and rejected

- **Author, Contributor and Subscriber,** and with them a review step and private drafts. They need a role system Sveltia does not have, and an editor who may not see a colleague's title in a list needs a preview per person.
- **Customers as owners of their organisation.** They could change webhooks and settings, and Kntnt's accounts.
- **Editor as the customer's highest role.** Every new user, menu change and footer text would become a request to Kntnt.

## Consequences

- The two names *Admin* (the customer's role) and *administrator* (Kntnt's account on the instance) are easy to confuse; `GLOSSARY.md` keeps them apart.
