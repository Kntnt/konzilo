# ADR 0045: Let a developer make each form, and an editor choose among them

**Date:** 2026-11-02 · **Status:** Accepted, settled by Thomas on 2026-11-02: editors do not build forms. A developer makes each form as a component, simple or advanced, an editor chooses among them and fills in what the form allows, and a new one is ordered. The rest is a technical choice; Thomas may veto.

## Decision

- **Written** as `::form{name="contact"}` (ADR 0019). Each attribute is declared, with a type, a default and the values it allows. The rule data's `declared` says that `name` must be a form the site declares; the refusal names what it declares.
- **A simple form** is a list of fields in `site-description.json`, drawn by the core's component.
- **An advanced form** is a component of the site's own, with any HTML, CSS and JavaScript: conditions, progressive disclosure, prefilled values. Its scripts are bundled, so the Content Security Policy holds. It still declares its fields, and posts to the same place.
- **What an editor may change** is what the form declares, such as a placeholder or a button's text, written as attributes, one set per placement and per language. The confirmation text and the recipients are the Admin's settings.
- **One way in for every form.** Each sends to `/_konzilo/forms/<form>`, so spam protection, storage, mail, retention and CSV are built once. The service checks known fields, their kinds and lengths. A condition such as a field being required only when another is filled in is checked in the browser, until a form needs it on the server too.
- **A site may declare components of its own,** forms and others, each with its attributes. Attributes are data, never code. `preSave` and the intake refuse an unknown component or attribute.
- **The markup is the core's.** `Form.astro` renders a declared form: a plain HTML form, every field labelled, its help tied to it, the trap field hidden, and each outcome at the id the service's redirect names. A site restyles it, or replaces it with its own markup that keeps the core's classes, ids and data.
- **The script is part of the integration's page script file.** It asks for the timing token once the form comes into use, checks the fields as the service does, sends JSON, and shows the outcome in place with the focus on it. Without JavaScript the form posts, and is led back with the outcome in the fragment. The page holds no inline code.
- **The texts are the core's,** in English and Swedish; a site gives its own through `konzilo({ formTexts })`.
- **A page of the release stands in for the service's answer.** Every build writes `_konzilo/form-not-sent.html`, a plain page in the site's language offering the publisher's email address. While the service does not answer, the web server gives a post below `/_konzilo/forms/` that page with the same status. It is the one file below the prefix the web server serves, and only then.
- **A preview shows the form and sends nothing.**
- **A form taken out of the description refuses the posts that place it,** naming the form, and they keep their last file, which the reader shows without the form, with a warning. Every other post publishes as before. A deploy can invalidate files already published, so the build checks too.
- **Submissions** are kept in the service for each form's retention, read by Admins and Editors, and mailed to the form's recipients; a spam submission is mailed to no one and kept 7 days. A submission keeps its fields with their labels as they came, so a form that changes keeps the submissions it had. It records the page's language, and its notification's words are in that language.
- **A person's request.** An Admin exports or erases a person's submissions on a page, as privacy law asks.
- **Download.** A form's submissions download as CSV from the *Submissions* page: UTF-8 with a byte-order mark, rows ended by CRLF, written as they are read and never stored; commas or semicolons, as the user chooses, offering semicolons where the user's language writes a decimal comma. Columns: *Sent at*, `YYYY-MM-DD HH:MM:SS` in the site's time zone; *Form*; then each field label, the newest submission's in its order, then each label only older ones hold. Spam is left out. **Safe to open:** a value that begins with `=`, `+`, `-`, `@`, a tab or a carriage return is written after an apostrophe, and so is such a character, or a quote, after a comma, a semicolon or a line break inside a value.

## Why

- Forms range from a few fields to conditions and prefilled values, and no builder Konzilo could afford reaches the far end. A component reaches both.
- Markup in the core lets a fix to labels, ids or accessibility reach every site.
- A browser without JavaScript can show only what the host answers, and a page built with the release is in the site's language without the server knowing it.
- A name alone keeps a post's file free of what the developer may change, and every recipient out of the content files.

## Considered and rejected

- **A form builder for editors,** in the body or as entries, as form plugins for WordPress give.
- **The whole component in the site template.** Each copy would miss every later fix.
- **A redirect back to the form's page from the web server.** It cannot read the page from the body, and the `Referer` is not always there.
- **Tab-separated UTF-16,** which Excel opens with its columns in every region. It is not CSV, and other tools read it worse.
- **One separator chosen by the site's language alone.** An English-speaking editor of a Swedish site would get a file their Excel cannot split.
- **Excel's `sep=` line.** It makes Excel ignore the byte-order mark, and Swedish characters break.
- **An `.xlsx` workbook.** It needs a library.
- **Quoting every cell against the other separator.** A reader heeds a quote only where a cell of its own reading begins.

## What practice has shown

Reading a comma-separated file by semicolons, Python's `csv` in its Excel dialect begins a cell with `=` after `x;=1+1;` inside a quoted value, and LibreOffice begins a row after a line break inside one and evaluates the formula after it. With the apostrophe rule, reading each file by both separators with formulas evaluated evaluated none.
