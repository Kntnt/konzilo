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

A site's own templates write the wrapper around a body, with whatever class its styles are scoped to, and render the body through `Body.astro`.

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

`ConsentBanner.astro` goes once on a page, and `ConsentControls.astro` in its footer. `links={false}` leaves the policy links out of the controls and `buttons={false}` the buttons, so that each can stand in its own place.

| Class | On | State |
|---|---|---|
| `.konzilo-consent` | What holds the banner and the dialog | |
| `.konzilo-consent-banner` | The banner | `[hidden]` |
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
| `.konzilo-consent-policies` | The links to the policies | |
| `.konzilo-consent-controls` | What `ConsentControls.astro` writes | |

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
| `.konzilo-declaration-departures` | The departures from the rules on consent | |

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
