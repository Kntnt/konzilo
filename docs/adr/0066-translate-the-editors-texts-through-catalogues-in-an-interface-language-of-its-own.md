# ADR 0066: Translate the editor's texts through catalogues, in an interface language of its own

**Date:** 2026-11-10 · **Status:** Accepted. Settled by Thomas on 2026-11-10: every text the core ships is written in British English and translated through catalogues, Swedish first; the interface's language is chosen apart from the site's, the site setting a default and each editor choosing their own; what visitors read follows the content's language; a site's own label is one text for every language or a text per language. The mechanism is a technical choice; Thomas may veto.

## Decision

- **A catalogue per language,** `src/catalogues/<language>.json`: each text by a stable name, such as `form.title`, with named placeholders, such as `{menu}`. British English, `en`, is the source, and Swedish, `sv`, its first translation. `src/catalogues.js` reads them, for the intake, the build and the editor's code in the browser alike. A test fails when a catalogue lacks a text the source has, holds one the source does not, or names other placeholders.
- **The interface language** is, in this order: the editor's own choice, made through Sveltia's own language preference; else the site's `interfaceLanguage`, declared in the site description; else the site's main language, where the core has a catalogue for it; else British English. A choice the core has no catalogue for keeps Sveltia in that language and gives the core's texts in British English. The checker refuses an `interfaceLanguage` that names no catalogue.
- **Sveltia's own interface follows it.** For an editor who has chosen none, the editor sets Sveltia's preference to the site's interface language, with a mark of its own beside it, so that what Konzilo set is told apart from a choice. Where the browser's first language is the site's interface language, it leaves Sveltia's *Automatic*, which takes that language by itself, so that a first visit there needs no load more. *Automatic* is no choice, and so gives the site's. Sveltia reads its preference as it loads, before the configuration has said what the site's language is, so the editor sets it as the last load found it, and a load that finds it new to the browser, or changed, loads once more before Sveltia shows anything.
- **A generated configuration per interface language.** `konzilo-cms` writes `config.json` in the site's interface language, and beside it `config.<language>.json` in each language the interface comes in; `konzilo.language` names the one a file is in. The editor fetches the editor's choice, else `config.json`.
- **A language chosen while the editor is open** shows in Sveltia at once, and the editor then loads again, so that its own texts follow and one screen never holds two languages. It loads again only when Sveltia's preference has changed since it loaded, so that it never loads again by itself.
- **A site's own label,** a type's or a taxonomy's `label` and `plural`, a menu's, a setting's, a field's, a presentation's and its options', and a component's and its attributes', is one text for every language, or a text by interface language with British English required: `{ "en": "Article", "sv": "Artikel" }`. The editor shows it in the interface language. Where a visitor reads it, in a feed's title, a search document or `post_type.labels.singular` in a template, it is the page's language's, else British English's; a refusal names it in British English, as the command line writes every refusal. A form's label and its fields' are read by visitors, so each stays one text.
- **A built-in type's or taxonomy's label is the core's,** `form.article` and `form.articles` and the like in the catalogues, which the read form gives as a label by language, so that it shows as a site's own label by language does; a label the site gives replaces it (ADR 0062).
- **The catalogues come in beside the two-language tables** read through `src/texts.js`, which keep working until their texts have moved to the catalogues, area by area, and then go. The form's labels in the generated configuration move first.

## Why

- A consultant who reads no Swedish must be able to work on a Swedish site, and a Swedish editor must not meet one screen in two languages.
- A language is added by translating one file. A table of two languages in code grows with each language.
- Sveltia's preference is where an editor already looks for a language, and Sveltia keeps it in the browser.
- A configuration per language is plain Sveltia configuration, generated and tested whole, and leaves the choice to the browser alone.

## Considered and rejected

- **The browser's language,** as Sveltia and the body field followed it. It is neither the site's choice nor the editor's, and one form mixed it with the site's.
- **One configuration whose labels the browser translates.** Sveltia would be handed a shape of Konzilo's own, and the labels would leave the configuration that is generated and tested.
- **Importing Sveltia once the configuration has been fetched,** which would need no load more: in WebKit it broke Sveltia's own image code (below).
- **Languages with a region, `en-GB` or `sv-SE`, in the site description.** The interface comes in a language, and its catalogue's name says which; `en` is British English.

## What practice has shown

Sveltia 0.256.1:

- Sveltia reads its preferences as it loads, from `sveltia-cms.prefs` in the browser's storage, `locale` among them, `auto` until a person chooses.
- Imported later than the editor, as a part of its own once the configuration had been fetched, Sveltia threw "Cannot load blob:… due to access control checks" in WebKit, twice after each sign-in, from its own image code. Imported with the editor, as before, it does not; hence the preference as the last load found it, and the one load more.
- Sveltia takes a preference of `en` as `auto`, so British English is set as `en-GB`.
- Sveltia sets `lang` on the page's root element when its language changes, which is what the editor watches for a choice.
- Where the language Sveltia shows is not the browser's, Sveltia offers the browser's in a bar at the top, in that language: "Sveltia CMS is now available in English (US)! Change Language Later". It comes once per browser and repository, until a person answers it; *Change Language* is a choice like any other.

## Consequences

- The web image copies `src/catalogues.js` and `src/catalogues/`, which the editor imports.
- The rest of the core's texts move to the catalogues: the body field's, the preview's, the publish status's and what visitors read, from the two-language tables, and the settings groups', in English alone so far. Refusals and warnings, in British English alone so far, come to carry a name and values, which the editor renders in the interface language. This record says when the tables are gone.
