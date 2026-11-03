# ADR 0042: Publish a site in several languages, with a prefix per language

**Date:** 2026-11-02 · **Status:** Accepted. Settled by Thomas: a missing translation is absent; every language of a site in several has a prefix; translations are paired by their set, never by path; `/` answers with a `301` to the main language's start page, never by the browser's language (2026-09-14); languages are edited in Sveltia (2026-11-02). The rest is a technical choice; Thomas may veto.

## Decision

- **Languages.** A site with several declares `languages`, locales such as `sv_SE`, in order. The first is the main language: the language of a post without one, the target of `/` and the language of `x-default`. Pages and content folders write each language's tag (`sv-SE`). A language's prefix is the language subtag (`sv`), or the whole tag in lowercase (`en-gb`) when the site has two variants of one language.
- **Addresses.** A one-language site has no prefix and no folders, byte for byte. On a site with several, every page sits under its language's prefix, the main language's included. A type's address may differ per language, and a slug is unique within its language. A page's parent is in the page's language. A main-language post keeps its unprefixed address as an old address, after its live addresses and giving way to whatever holds that address, and old addresses stay within a post's language.
- **No fallback.** A missing translation has no page: its address answers `404`, and the language switcher, `hreflang` and the sitemap leave it out. A status counts per language, so a draft translation is absent too.
- **Editing.** Sveltia's i18n translates a post beside the original, with the same ID in each language. Every declared type can be translated. A term is shared by every language and has a name per language. Each menu has a place per language. A setting may be `translated`, the site's title and the core's visitor texts among them; each language's settings file holds a chosen page's translation in that language, or else the chosen page with a warning.
- **Content files:** posts are `<collection>/<tag>/<slug>.md`; `translationKey`, 16 lowercase hexadecimal characters, is written only when the release holds another member of the set; terms are `<collection>/<tag>/<slug>.json`, with the main language's name and a warning where a translated name is missing; menus `menus/<tag>/<menu>.json`, settings `settings/<tag>.json`. A post's terms name the files in its language.
- **Refused:** a post in a locale the site does not declare, which keeps no file, so removing a language takes its posts off the site; a folder that is no language of the site's; two posts of one set in one language, the later taken refused; a term with no file in the main language; a description or parent that differs between languages.
- **Internal links** lead to the target's language. A link to another language warns when the target has a translation in the linking post's language.
- **Post lists** show the posts in the language of the post they sit in, the main language's outside a post, at their addresses in that language, since a list across languages would link a page to posts in other languages.
- **The public site.** `<html lang>` is the page's tag. A language switcher links to the translations that exist, by each language's own name. `Head` writes `hreflang` links over the set, with `x-default`, and a lone page writes none. The sitemap lists the alternates, through the same function. A translation marked `noindex` is out of both, though the switcher still links to it. Each language has its own feeds, page for addresses not found and search page, below its prefix.
- **The core's texts** come per language, English and Swedish from the core, with English and a build warning for a language without them; a site gives its own in `konzilo({ texts: { <locale>: { … } } })`.
- **A consent record and a form's submission** note the page's language.

## Why

- The same prefix rule for every language gives one rule for routing, links and `hreflang`, and changing the main language moves no page.
- One-language sites keep their files and templates.
- No fallback keeps a page's language honest for visitors and search engines.

## Considered and rejected

- **Polylang, WPML or Bogo for WordPress.** They tie translation to a tool that is not in use.
- **Choosing a language by the browser at `/`.** It would need rules in the web server, the dev server and the preview.
- **The main language at the root without a prefix.**
- **A domain per language, for now.**
- **Language folders on one-language sites.**
- **A translation key that is a slug.**
- **Terms per language.**
- **Falling back to the main language for a missing post.**

## What practice has shown

Sveltia's `i18n.canonical_slug` writes `translationKey`. Whether it can write `<collection>/<tag>/<id>.md` with what the format wants is to be verified when languages are built.
