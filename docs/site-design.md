# What a site's design can count on

A site's design comes from its own stylesheets and components, which the template holds simply, or from the Konzilo Design System (ADR 0054). Either way the core owns the markup and the behaviour of what it writes, and a design styles it. This document is that contract. Adding a class is a minor change, and removing or renaming one a major one (ADR 0030).

## What a site gives the integration

`konzilo({ … })` in `astro.config.mjs` takes each of these from the site. A design package hands over what is its own, and the site adds what only it knows, such as the presentations its description declares.

| Option | What it takes |
|---|---|
| `bodyStyles` | Stylesheets, each a path from the site's root (`./…`), or a package's by its name |
| `tokens` | `{ colors: { primary, base } }`, the custom property that holds each theme colour, declared on `:root` or `html` outside any conditional rule, with a colour a build can read: `light-dark()` is not one |
| `presentations` | A component for each presentation the description declares, each a path from the site's root, or a package's by its name |
| `directives` | A component for a directive, in the same way |
| `searchPage`, `termPage` | A page of the design, in the same way |

A site's own templates write the wrapper around a body, with whatever class its styles are scoped to, and render the body through `Body.astro`. A layout places `ConsentBanner.astro`, or an embed shows only as its address, which the build warns of.

A type's `elements` in `site-description.json` decides what its body may hold, and so what its block menu offers: a row that is missing is an element the type does not take.

A component a site declares, or takes from a package such as the design system's (`content-format.md`, *A site's own components*), is drawn by the component the site gives for its directive through `directives`, with its attributes as props, typed, those not given at their defaults, and its body, if it has one, rendered as its default slot and as a tree in the prop `content`. Without one, it is the core's plain rendering: a `div` with `data-directive="<name>"` and `data-<attribute>` for each attribute with a value, its name in kebab case, holding its body. The design system draws the hero, the section, the aside, the list and its five forms, and the text roles so (ADR 0068).

The tree is a hast `root` of the body as the core renders it, a container's blocks or a leaf's label, with a component within as its plain rendering, holding its own body. No attribute is called `content`, and each component is given a tree of its own, which it may change. A component that lays itself out by what it holds, such as a list whose items begin at its headings, reads the tree, and a simple one places its slot. What a component draws from the tree it draws itself, a component within as its plain rendering and an image without the lightbox the core adds to the slot, so a design that wants them places the slot. A component that passes the props it does not take on to its root leaves the tree out of them, since Astro writes an object it is given there as an attribute, `content="[object Object]"`, on the public site too, and the core cannot stop it:

```astro
---
const { content, ...rest } = Astro.props;
---
<section class="…" {...rest}><slot /></section>
```

The rest it passes on holds the live preview's mark, so its root holds that as well.

A layout is told which of the core's built-in types a post is, `canvas`, `page` or `article`, by `builtInType(entry)` from `@kntnt/konzilo/astro/helpers`, null for a type of the site's own or a page that shows no post. A canvas is a blank page, which a layout draws without the site's header and footer. A built-in type's fields are the same on every site (`content-format.md`, *The built-in types*), an article's parts and a page's and a canvas's date, name in breadcrumbs and teaser among them, so a design can draw its parts by their names.

An article's byline is told its authors by `authorsOf(entry)` from the helpers, in the order the editor gave them, the first author first: each `{ name, url, slug, entry }`, `url` the author's page below the site's base where the authors taxonomy declares an address, else null, and `entry` its term, its biography in `data.description`. A post of a type of the site's own has none.

A post's meta line, the line between its standfirst and its body that shows its byline, its date and its category, is told its pieces by `metaLine(entry, Astro.url)` from the helpers, written by the format an Admin sets for its type in the page's language: each `{ text, variable, url, datetime }`, in the order a visitor reads them, `variable` the variable a piece shows, `authors`, `date`, `modified` or `category`, the comma between two authors among the authors' pieces, and null for the format's own words, `url` an author's or the category's page below the site's base where its taxonomy declares an address, else null, and `datetime` a date's moment for a `<time>`, else null. A variable without a value has dropped out with its words already. None for a type without a format, which is every type but the article until an Admin gives it one, and the canvas always, which is offered none. The site template draws the pieces in a `<p class="meta-line">`.

A menu reaches a site's layout as a list of entries, each `{ title, url, items }`, `items` being the entries below it. A design with names of its own takes them through an adapter of its own: the core does not know a design's names.

## Custom properties the core reads

Each has a default, and is for a design to set on the root.

| Property | What it is |
|---|---|
| `--konzilo-lightbox-overlay` | The overlay behind a lightbox, which lets a little of the page through |
| `--konzilo-lightbox-text` | The words over it |
| `--konzilo-lightbox-control` | The background of its buttons |

## Classes

A name in angle brackets is filled in by what it stands for. The core's scripts read the `data-konzilo-*` attributes, which a design leaves alone.

### The live preview

In the live preview alone, each block of a body has `data-konzilo-block`, its place among the body's blocks, and a click on it leads to the body field. A block within a directive's body, and a list's item, has its path below it, as `2.1`: a design that renders a component of its own keeps the marks on the blocks it is given, and a level of its own with no element, such as a tab, is found by the first block below it. In a component's tree, each block's element holds its mark as the property `dataKonziloBlock`, so a component that draws the tree's elements with their properties keeps the marks.

A component the site renders, a presentation of a post list among them, is given the mark of its own block too, as the prop `data-konzilo-block`, to place on its root: `<section class="…" data-konzilo-block={Astro.props['data-konzilo-block']}>`. The public site gives it none, and Astro writes no attribute without a value. A component that passes the props it does not take on to its root, the tree in `content` left out, places the mark so. Where a component places the mark on no element, the core puts it on the element the component renders at its top, or on each of those it renders there side by side, a script or a style aside. So nothing stands between a component and the one around it, and a design's child selectors and `:has(> …)` find in the preview what they find on the public site. A component that renders text at its top, no element, or its blocks with nothing around them has its mark on a wrapper at the top of a body, and none within another component's body, where the blocks it holds lead to it.

When a field asks the page to show a block, the page opens the `<details>` the block stands in, scrolls to it and marks it, and sends the event `konzilo-preview-show` from it, bubbling, so that a design's own tab, panel or answer can open to show it: its script listens on the document and opens what holds `event.target`. A design that draws each tab and each answer as a `<details>`, of an exclusive group where one opens at a time, needs no script for this. A click the page makes itself, to open such a tab, is no editor's, and leads nowhere.

| Class | On | State |
|---|---|---|
| `.konzilo-preview-part` | What holds the mark of a component at the top of a body that renders no element to hold it, with `display: contents` | |

The live preview draws a page again after each change under a view transition across documents, in a browser that has them, which the core asks for in a sheet of its own, `@view-transition { navigation: auto; }` (ADR 0067). A design's styles meet it in the preview alone: an element a design gives a `view-transition-name` moves from its place on the old page to its place on the new, its `::view-transition-*` rules apply, and a name two elements of one page share skips the transition, so that the page is drawn again as a reload draws it. A design that wants the page simply faded from old to new names nothing in the preview.

In a tab of its own, the live preview puts its toolbar last in each page's body, as the element `konzilo-preview-toolbar`, fixed over the page wherever its reader drags it (ADR 0032). Its shadow tree holds all of it, so a design's styles reach none of it, and a design gives it nothing; a rule that matches the body's last child, or every child of the body, matches it in that tab alone.

### Images and galleries in a body

| Class | On | State |
|---|---|---|
| `.konzilo-gallery` | The `figure` of a gallery, holding a `figure` for each image and its own `figcaption` | |

An image is a `figure` with no class of its own, holding its `figcaption` if it has one.

### The rest of a body

The rest of a body is plain elements with no class of Konzilo's, as `content-format.md` shows each. Three come from the reader, with marks of their own:

| Element | Marked by |
|---|---|
| A footnote's mark | `sup > a[data-footnote-ref]` |
| The footnotes | `section[data-footnotes]`, its heading for screen readers `.sr-only` |
| A task list | `ul.contains-task-list > li.task-list-item > input[type=checkbox][disabled]` |
| A code block in a language | `pre > code.language-<language>` |

### The lightbox

The core's stylesheet makes it work, and it stands inside a body's wrapper, so a design's rules on `ul`, `li`, `figure`, `figcaption`, `img` or `button` must not reach into it. On a page an image stands in a button: `figure > button.konzilo-lightbox-open > img`. A closed dialog stands right after each single image's figure, and after a gallery as a whole, and counts as a sibling.

| Class | On | State |
|---|---|---|
| `.konzilo-lightbox-open` | The button around an image on the page | `:focus-visible` |
| `.konzilo-modal` | The `dialog` all that is shown over a page stands in | `[open]`, `:modal` |
| `.konzilo-modal-close` | Its button to close | `:focus-visible` |
| `.konzilo-lightbox` | That dialog when it shows images | `[open]`, `::backdrop` |
| `.konzilo-lightbox-strip` | The `ul` that holds the images, one to an `li`, and snaps | `:focus-visible` |
| `.konzilo-lightbox-step` | Both arrow buttons | `:disabled`, at an end |
| `.konzilo-lightbox-previous`, `.konzilo-lightbox-next` | Each arrow button | |
| `.konzilo-lightbox-place` | The words saying which image of how many | |

### Embeds

| Class | On | State |
|---|---|---|
| `.konzilo-embed` | The panel, a `figure` with `data-embed="<service>"` | Once allowed it holds the player alone |
| `.konzilo-embed-no-script` | The sentence shown where the script has not run | |
| `.konzilo-embed-question` | The question asked before consent | |
| `.konzilo-embed-storage` | What the service stores | |
| `.konzilo-embed-allow` | The button that allows the service | |

### Forms

| Class | On | State |
|---|---|---|
| `.konzilo-form` | The `form` | `[aria-busy=true]` while it sends |
| `.konzilo-form-preview` | A note in a preview, where nothing is sent | |
| `.konzilo-form-fields` | What holds the fields | `[hidden]` once sent |
| `.konzilo-form-field`, `.konzilo-form-<kind>` | A field, by its kind, one of `text`, `email`, `tel`, `textarea`, `select`, `radio`, `checkbox`, `checkboxes` and `acceptance`. A control with a problem has `[aria-invalid=true]` | |
| `.konzilo-form-required` | The mark of a required field | |
| `.konzilo-form-choice` | One of a field's choices | |
| `.konzilo-form-help` | A field's help | |
| `.konzilo-form-problem` | What is wrong with a field | `[hidden]` until then |
| `.konzilo-form-outcome`, `.konzilo-form-<outcome>` | What came of sending, by the outcome, one of `sent`, `invalid`, `too-many`, `refused` and `unavailable` | `[hidden]` until then where the script runs, `:target` where it does not |
| `.konzilo-form-send` | The button | |
| `.konzilo-form-trap` | The field only a robot fills in, which must stay out of sight | |

### Consent

`ConsentBanner.astro` goes once on a page, and `ConsentControls.astro` in its footer. `links={false}` leaves the policy links out of the controls and `buttons={false}` the buttons, so that each can stand in its own place, and `objection` adds the right to object to counting without storage, as the dialog has it, where the site counts so, for a template such as the privacy policy's to place. The banner stays hidden on the privacy policy and the cookie policy, and the footer controls work there. Where an item stored on the page's own host is named, the element marked `data-konzilo-consent-host` holds the host, which the script writes from the page's address. Each component, `CookieDeclaration.astro` too, is a thin wrapper around a pure function of `src/consent/markup.js`, `consentMarkup()`, `consentControlsMarkup()` and `cookieDeclarationMarkup()`, which give the same markup outside Astro.

| Class | On | State |
|---|---|---|
| `.konzilo-consent` | What holds the banner and the dialog | |
| `.konzilo-consent-banner` | The banner | `[hidden]` |
| `.konzilo-consent-notice` | The notice in the banner's place, `[role=status]`, that consent is withdrawn and the page reloads | `[hidden]` until then |
| `.konzilo-consent-text` | Its text | |
| `.konzilo-consent-title` | A title | |
| `.konzilo-consent-buttons` | A row of buttons | |
| `.konzilo-consent-choice` | Accept and reject | |
| `.konzilo-consent-secondary` | Any other button | `[hidden]` until the script shows it |
| `.konzilo-consent-close` | The dialog's button to close | |
| `.konzilo-consent-dialog` | The `dialog` | `[open]` |
| `.konzilo-consent-head` | Its head | |
| `.konzilo-consent-introduction` | Its introduction | |
| `.konzilo-consent-category` | A category | |
| `.konzilo-consent-category-name` | Its name | |
| `.konzilo-consent-description` | Its description | |
| `.konzilo-consent-count` | How many services it has | |
| `.konzilo-consent-always` | The words in place of a switch, on a service that is always on | |
| `.konzilo-consent-row` | A row with a name and a switch | |
| `.konzilo-consent-switch` | The switch, `input[type=checkbox][role=switch]`, on a category or a service | `:checked`, and `:disabled` on a category that is always on |
| `.konzilo-consent-services` | The services of a category | |
| `.konzilo-consent-service` | A service | |
| `.konzilo-consent-service-name` | Its name | |
| `.konzilo-consent-facts` | The facts about it | |
| `.konzilo-consent-objection` | The right to object, `[data-konzilo-consent-objection]`, where the site counts visits without storage before consent: below the statistics category's services, in the cookie declaration and in the controls | `[hidden]` while the visitor allows statistics, and until the script shows it |
| `.konzilo-consent-objection-text` | Its explanation, a paragraph whose link is the words of its text in square brackets | |
| `.konzilo-consent-objection-objected` | The paragraph shown once the visitor objects, `[data-konzilo-consent-objected]`, with the link that takes the objection back | `[hidden]` until then |
| `.konzilo-consent-objection-link` | Either link, inline in its sentence: `a[data-konzilo-consent-action=objection]`, which opens the confirmation, and `a[data-konzilo-consent-action=resume]` | `:not([href])`, plain text, on the first once the visitor objects |
| `.konzilo-consent-confirmation` | The `dialog`, `#konzilo-consent-objection`, that asks the visitor to confirm the objection, with confirm and cancel alike, `.konzilo-consent-choice` | `[open]` |
| `.konzilo-consent-policies` | The links to the policies | |
| `.konzilo-consent-controls` | What `ConsentControls.astro` writes | |

A link to the privacy policy or the cookie policy is marked `data-konzilo-consent-policy`, `privacy-policy` or `cookie-policy`.

### The consent on a page Konzilo does not build

A site's consent can stand on pages of another system below the same domain, so that one choice holds on both (ADR 0049).

**A page that loads the site's consent script** counts on exactly this:

- The script is at `/_konzilo/consent/<language>.js` on the site's own host, such as `https://www.example.com/_konzilo/consent/en.js`: the language's prefix on a site in several, else its language subtag. The page loads it with `<script src="…" defer>`. Its default stylesheet is beside it, `/_konzilo/consent/consent.css`, which the page may load or replace with its own on the classes above. Both are served with a cache lifetime of five minutes.
- The page's own footer buttons, `<button type="button" data-konzilo-consent-action="change" hidden>` and `data-konzilo-consent-action="withdraw"`, which the script shows.
- An element marked `data-konzilo-consent-declaration` where the cookie declaration goes. Its own content, such as a link to the site's cookie policy, stays where the script does not run, and the declaration takes its place where it does, without a consent ID, since such a page sends no records.
- `<meta name="konzilo-consent" content="legal-page">` in the head of the privacy policy and the cookie policy, where the banner then stays hidden.
- Optionally, the page's own privacy policy and cookie policy, in its head: `<link rel="privacy-policy" href="…">`, the link type registered for a privacy policy ([RFC 6903](https://www.rfc-editor.org/rfc/rfc6903#section-4), in [IANA's registry of link relations](https://www.iana.org/assignments/link-relations/)), and `<link rel="cookie-policy" href="…">`, which no registry has, so it mirrors the other; a validator may call it unregistered. Each may have a `title`. Every link of the consent to that policy, in the banner, the placeholders and the declaration, then leads to the page's own, by its `title` where it has one; without them, the script links to the site's own policies, at the addresses and by the titles it was made with. A link that is not absolute is read against the page's address.
- Optionally, where the site counts visits without storage before consent, the right to object, such as in the page's privacy policy: an empty `<div data-konzilo-consent-objection hidden></div>`, which the script fills as the dialog has it and shows while the visitor does not allow statistics.
- Each embed in the markup of ADR 0024, `<figure class="konzilo-embed" data-embed="<service>">` holding a link to the content and its player in a `<template>`, which the script makes a placeholder until the visitor allows the service, as on a page of the site.
- The script adds the banner, the notice, the dialogs and the placeholders' templates to the end of the body. It loads nothing else and runs no inline code. Where the site does not answer, the page shows no banner and loads nothing optional.

**The consent signal**, on a page of the site and on such a page alike, is `window.konziloConsent`, there as soon as the deferred script has run, so that a later deferred script reads the stored choice at once: `category(id)` and `service(id)`, whether the visitor allows a category or a service by its id in the registry; `choice()`, the choice that holds, `{ time, revision, categories, services }` with `id` where records are sent, or null; `objected()`, whether the visitor objects to being counted without storage; and `allow(service)`, which allows one service more. The event `konzilo:consent` on `document` comes at every change, of the choice and of the objection, its `detail` `{ choice, how, objected }`, `how` `objection` where the objection changed, `choice` null where none holds.

**Matomo on such a page** is the page's own snippet, in a deferred script after the consent script, and asks for the registry's service of it, `matomo` where the site loads Matomo itself, else the id of the service declared for it:

- Without the departure `statisticsWithoutStorageBeforeConsent`, it loads Matomo only once `konziloConsent.service('matomo')` is true: at once where it is, else at the first `konzilo:consent` that makes it so.
- With it, it counts as a web server's log would until the visitor allows statistics. It queues `requireCookieConsent` before its own snippet's calls, and `setCustomRequestProcessing` with a function that puts each request's `h`, `m` and `s`, the time of day, in the site's time zone, from the clock and `Intl.DateTimeFormat` with that `timeZone`, never the device's own; then `setCookieConsentGiven` and `enableBrowserFeatureDetection` where `konziloConsent.service('matomo')` is true, on every page view, and at each `konzilo:consent` that makes it so, after which the function leaves the time as it is; else `disableBrowserFeatureDetection` and `disablePerformanceTracking`. At a `konzilo:consent` that makes it false it queues `forgetCookieConsentGiven` and `disableBrowserFeatureDetection`. With `privacySignals` `stop` it loads nothing for a browser whose `navigator.globalPrivacyControl` is true or whose `navigator.doNotTrack` or `window.doNotTrack` is `1`.
- With it, too, the visitor may object. Where `konziloConsent.objected()` is true it loads nothing; at a `konzilo:consent` that makes it true it queues `requireConsent`, which holds back every later request and sets no cookie, unlike `forgetConsentGiven` and `optUserOut`, which do. After one that allows its service again, it queues `setConsentGiven`; one that takes the objection back alone counts from the next page view.
- Where the consent script did not run, `window.konziloConsent` is not there, and the snippet counts without storage, or loads nothing without the departure.

**A site that renders the consent itself**, built by other means, copies `src/consent/` from a commit of the core, and the catalogues of `src/catalogues/` beside it, or imports both from the package, `@kntnt/konzilo/consent/…` and `@kntnt/konzilo/catalogues/<language>.json`; the folder imports nothing outside itself. Each markup function takes `{ registry, texts, legalPages, language, catalogues, host, locales }`: the registry in the format of `content-format.md` ("The service registry"), each stored item with its `domain`; the consent texts in the registry's shape, `{ banner, dialog, footer, notice, placeholder, objection }`, with `categories` where the page's names differ, and the core's defaults for `objection` where they leave it out, whose `text` and `objected` mark their link by its words in square brackets, `… you have the right to [object].`, the first such words being the link, a text without them taking the link after it in the core's own words; `{ privacyPolicy, cookiePolicy }`, each `{ title, href }` or null; the page's language tag; the core's catalogues by language, `{ en, sv }`, as `src/catalogues/<language>.json` holds them, whose `site.consent.…` texts are the core's own words in the page's language, British English's for a language without a catalogue; its host, or null where the client names it from the page's address; and, optionally, the locale dates, times, numbers and countries are formatted in by the language of the core's words, `{ en, sv }`, `en-GB` and `sv-SE` by default and the language itself for another catalogue, which the build and the browser then both use.

| Module | Exports |
|---|---|
| `markup.js` | `consentMarkup(input, { legalPage })`, `consentControlsMarkup(input, { links, buttons, objection })`, `cookieDeclarationMarkup(input, { level, records })`, each an HTML string; `consentView()`, `declarationView()` and `escape()` |
| `client.js` | `startConsent({ name, months, domain, records, legalPage, statistics, matomo })`, each part on its own too: `consentClient()`, `matomoTracker()`, `cookieDeclaration()`, `embedPanels()`, `datawrapperHeights()`, `placeConsent()` |
| `script.js` | `consentScript(input, { domain, records, statistics, matomo })`, the consent script's source as a string, which a build writes at `consentScriptPath(language)` |
| `registry.js` | `registryRevision({ categories, services, departures })`, `consentScriptPath()`, `CONSENT_SCRIPTS`, `CONSENT_STYLESHEET`, `CONSENT_SCRIPT_LIFETIME`, `CONSENT_STORAGE` and the format's lists, in Node |
| `words.js`, `consent.css` | The core's words, with `LOCALES` and `formatLocale()`, and the default stylesheet |

The client's options: `domain`, the domain the choice is kept on in the cookie `konzilo-consent` for every site below it, or null for the origin's local storage; `records`, the endpoint for consent records, or null, where none is sent and no consent ID is made or shown; `legalPage`, true on the privacy policy or the cookie policy; `statistics`, `{ withoutStorage, privacySignals }`, the departure's; and `matomo`, `{ service, script, endpoint, site, cookieDomain, timeZone }`, for Matomo's own tracker, or none, `timeZone` the site's by its IANA name, UTC where it is left out. Sites that share the choice must show the same consent revision, which one registry serving them all gives.

**The stored item**, in local storage or in the cookie, is JSON: the choice, `{ id, time, revision, categories, services }`, `id` only where records are sent, with `objection` beside it, the time the visitor objected, where they object; or `{ objection }` alone, before any choice. A choice and an objection each hold 12 months from their own time, and the cookie lasts until the later. A kept value without `objection` is a choice as before.

The default stylesheet reads these custom properties, each with a default: `--konzilo-consent-font`, `--konzilo-consent-text`, `--konzilo-consent-muted`, `--konzilo-consent-accent`, `--konzilo-consent-rule`, `--konzilo-consent-background`, `--konzilo-consent-on-accent`, `--konzilo-consent-focus`, `--konzilo-consent-space`, `--konzilo-consent-radius` and `--konzilo-consent-target`.

### The cookie declaration

| Class | On | State |
|---|---|---|
| `.konzilo-declaration` | What holds it | |
| `.konzilo-declaration-consent` | The visitor's consent | |
| `.konzilo-declaration-no-script` | Where the script has not run | |
| `.konzilo-declaration-none` | Where no choice is made | `[hidden]` |
| `.konzilo-declaration-choice` | The choice made | `[hidden]` |
| `.konzilo-declaration-services` | The services | |
| `.konzilo-declaration-revised` | When it was last revised | |
| `.konzilo-declaration-category` | A category | |
| `.konzilo-declaration-service` | A service | |
| `.konzilo-declaration-departures` | What the site does without consent: its departures from the rules on consent | |

### Search

| Class | On | State |
|---|---|---|
| `.konzilo-search-box` | The box in a page's head | |
| `.konzilo-search` | The search page's own part | |
| `.konzilo-search-preview` | A note in a preview | |
| `.konzilo-search-status` | What is happening | |
| `.konzilo-search-message` | What it has to say | |
| `.konzilo-search-results` | The results | |
| `.konzilo-search-result` | One of them | |
| `.konzilo-search-about` | What it is | |
| `.konzilo-search-type` | Its type | |
| `.konzilo-search-snippet` | What it says | |
| `.konzilo-search-pages` | Its pages | |

### The pager

| Class | On | State |
|---|---|---|
| `.konzilo-pager` | The `nav` | |
| `.konzilo-pager-previous`, `.konzilo-pager-next` | An `li` | |
| `.konzilo-pager-gap` | The gap between pages | |

The current page is a link with `[aria-current=page]`, in an `li` with no class.

### Breadcrumbs

They have no class of their own: `nav[aria-label] > ol > li`, the last with `[aria-current=page]`. A design can style them through its own wrapper, or use its own component with `breadcrumbs()`.

Whether they end with the page itself is the type's setting, in the group `breadcrumbs`, off by default. Off, `Breadcrumbs` ends at the level above the page, each level a link, and shows nothing for a page right under the start page. `breadcrumbs()` still gives the page's own level, last, with `hidden: true`, so that a design whose narrow form counts on that level can keep it in its markup and hide it, and the structured data always holds it.
