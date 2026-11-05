# Konzilo

Konzilo is a core for websites whose editors write in Sveltia CMS with a Crepe body field, and whose visitors get a static site built by Astro from files in git. This glossary holds the words the code and the people use for it.

## People and roles

**Editor**: A person at a customer who writes or publishes content, whatever their role. _Avoid_: author, user; "editor" alone for the Editor role or the body field.

**Customer**: An organisation that has a site on Konzilo. _Avoid_: client, tenant.

**Kntnt**: The agency that builds, hosts and runs Konzilo sites in its own hosting.

**Admin**: The customer's highest role: manages the customer's users and changes menus, site settings, redirects and services. _Avoid_: site owner, administrator.

**Editor role**: The customer's other role: writes content, reads every draft and may publish.

**Instance administrator**: Kntnt's account on a customer's Forgejo, listed to nobody else. _Avoid_: Admin.

**Operator**: The person at Kntnt who runs the hosting layer's servers and may run every job on them. _Avoid_: admin, sysadmin.

**Machine account**: A Forgejo account that a program uses, enrolled with a second factor like any other: one read-only per site for the builder and the service.

## Sites

**Core**: The released whole of this repository: the Crepe field, the intake, the build, the Node service, the live preview, the Astro integration and the `konzilo` command, as images and one npm package, under one version number. _Avoid_: framework, platform.

**Site**: One website built on Konzilo: its site repository, its source and content repositories and its public pages. _Avoid_: project, instance.

**Site repository**: A thin repository that pins a core release and holds what is the site's own: its site description, design, components and tests, never its content. _Avoid_: site template, theme.

**Site template**: The files `new-site` starts a site repository from. A change reaches only sites made after it.

**Site description**: The one file in a site repository, `site-description.json`, that declares the content model. _Avoid_: schema, config.

**Content model**: A site's post types, taxonomies, fields, allowed elements, menus and settings.

**Field**: A value a post type declares beside its title and body: one of the core's own, the search and sharing fields, a post's terms, or one of the site's own. _Avoid_: custom field, property.

**Hierarchical type**: A post type whose posts have parents, so that its addresses and published files follow their paths. _Avoid_: nested type, tree.

**Path**: A post's ancestors' slugs, from the top, and its own, joined by `/`, as `about-us/team`.

**Rule data**: `rules.json`, the core's list of the elements it can publish and what each may hold, which the field and the intake both read. _Avoid_: schema, allowlist.

**Content format**: The shape of the published files, described in one document, `content-format.md`, so that any tool can read them. _Avoid_: schema, export format.

**Demo content**: The fictional content a fresh local copy gets, as files. _Avoid_: sample content, test data.

**Body styles**: The stylesheets a site names for the body text of its posts, which style it alike on the site and in the Crepe field. _Avoid_: theme, prose CSS.

**Site identity**: A site's title, logo and icon. _Avoid_: branding.

**Site icon**: The square image a site is known by in browser tabs, from which every icon size is made. _Avoid_: favicon.

**Site settings**: The site-wide texts and choices outside posts: the identity, the menus, the settings its description declares and the core's settings groups. _Avoid_: options, theme settings.

**Settings group**: Site settings of the core's own, declared with their defaults and the same on every site they apply to, under a name no site setting may take. _Avoid_: core settings.

**Menu**: A list of links a site's design shows, declared in the site description and filled by an Admin; each entry leads to a post's current address or to a link. _Avoid_: navigation.

**Local**: The copy of a site a developer runs in Compose. _Avoid_: dev site.

**Live**: The online copy of a site. _Avoid_: prod.

## Editing and publishing

**Source repository**: The repository in a customer's Forgejo that holds what editors write. _Avoid_: editorial, content repository.

**Source file**: One file in the source repository, named by a generated ID that never changes.

**ID**: A source file's generated name, by which every reference holds its target.

**Crepe field**: The body field in Sveltia, built on Milkdown's Crepe with Konzilo's own nodes. _Avoid_: block editor, rich text editor.

**Kept block**: A block in the Crepe field holding an element it has no form of yet, or one its post type does not take, as its own bytes, shown as source and moved whole. _Avoid_: protected block, raw block.

**Early check**: The body check in the browser, in the Crepe field and at Save, by Sätteri's WebAssembly build. The intake remains the check that counts. _Avoid_: client-side validation.

**Intake**: The program that reads the source files, checks each file and the whole set, and writes the content files or refuses. _Avoid_: converter, serializer, gate.

**Body check**: The one implementation that reads a post's body against the rule data and writes it in the exact form, handed its reader so that the intake and the field run the same code. _Avoid_: validator, serializer.

**Refusal**: The intake's or `preSave`'s no to something it cannot publish, naming the post, the block or the field, or the file and line, and the reason. _Avoid_: error, validation failure.

**Warning**: The intake's word about a post it publishes otherwise than it holds, such as a link shown as text while its target has no page. _Avoid_: refusal, error.

**Ledger**: `.post-ids.json` in the content repository, which only the intake writes: per ID the paths a post has had, the addresses it had while live, the source file's hash and its times. _Avoid_: index, mapping.

**Content files**: The Markdown and JSON files the intake writes; the published state of a site. A file means *published*. _Avoid_: export, dump.

**Content repository**: The git repository of a site's content files and their history. _Avoid_: content repo.

**Publish**: To make a post's status published, or save a published post. _Avoid_: deploy, release.

**Build**: The run that takes the source files through the intake, commits the content files and makes a new release. _Avoid_: deploy, rebuild.

**Build request**: The flag that starts a site's build; requests written during a build give one more build. _Avoid_: trigger, queue.

**Publish status**: What a post shows its editor: *being published*, *live*, with any warning, or *failed*, with each refusal. _Avoid_: build status.

**Build log**: The file where each build adds one line of JSON as it ends. _Avoid_: build history.

**Mass-deletion guard**: The stop of a build that would take more than half of a site's posts off it, and more than one, until confirmed by its code. _Avoid_: deletion limit.

**Deploy**: Bringing a new version of a site repository's code to its live copy; never used for content. _Avoid_: publish, release.

**Release**: One complete set of a site's built static pages; the one its `current` link points to is what visitors get. _Avoid_: version, deployment.

**Live preview**: The page from the site's own templates beside the form in Sveltia, from Astro's dev server on an origin of its own, about a second after an editor stops typing. _Avoid_: staging, test copy.

**Share link**: A secret link to one post not yet published, which lets someone without a login read it in a static preview build for three days, or until revoked. _Avoid_: public preview, magic link.

**Erasure**: Removing a post and its media for good, from every repository's history at once, and from backups as they expire. _Avoid_: delete, unpublish.

**Archive**: The one file that moves a site: Forgejo's data, the source repository with its LFS objects, the code, the content repository, the service's data and the accounts. _Avoid_: dump, backup (one use of it).

## Body elements

**Internal link**: A link to another post, or to a term's page, that an editor chooses by search; held by ID in source, written as its target's current public address. _Avoid_: relative link.

**Simple table**: A table published as a Markdown pipe table. _Avoid_: basic table.

**Structured table**: A table with a caption, a footer section or a merged cell, published as an HTML table of one fixed shape. _Avoid_: advanced table.

**Merged cell**: A table cell that spans more than one column or row of its section. _Avoid_: joined cell.

**Embed**: Content from one of the services the site embeds from, put in a post by its address, which the visitor's browser loads only once the visitor consents. _Avoid_: oEmbed, iframe, widget.

**Directive**: A component written in a content file, a leaf (`::name{…}`) or a container (`:::name{…}` around blocks), registered with its attributes and body rule; data, never code. _Avoid_: shortcode, MDX component.

**Component**: A body element that the site renders with its own Astro component, written as a directive.

**Plain rendering**: The HTML the core gives a directive where the site gives it no component. _Avoid_: fallback.

**Post list**: A list of posts placed in a body, chosen by a query, evaluated at every build and shown by one of the site's presentations. _Avoid_: archive, feed.

**Presentation**: One way a site's design can show a post list, which the site declares with its few options. _Avoid_: template, view.

**Pager**: The integration's links between a post list's pages. _Avoid_: pagination.

## Media

**Original**: The file an editor uploads, kept private in Git LFS. _Avoid_: upload, source image.

**Master**: The public version of an original that the intake writes at the site's set size and format, without metadata; of an SVG, the SVG itself, checked and optimised. _Avoid_: derivative, rendition.

**Featured image**: The image a post is shown with, beside its body, with alt text that belongs to the post. _Avoid_: hero image, cover.

**Image in body text**: An image placed between the blocks of a body and shown as its master, with alt text and an optional caption that belong to that use. _Avoid_: inline image, figure.

**Image library**: The collection of images an editor chooses from in a body, each with alt text and an optional caption that are copied into the post at the choice. _Avoid_: media library, image bank.

**Gallery**: Two or more images in body text shown together, with an optional caption of its own. _Avoid_: slideshow, carousel.

**Lightbox**: An image of a body shown over the page, as large as it can be, in the dialog a page shows things over itself in; a gallery steps through its images there. _Avoid_: popup, for this use.

## Languages

**Site language**: The one language a site is written in, declared in its site description. _Avoid_: locale.

**Language**: One of the languages a site publishes in, declared by its locale, such as `sv_SE`, and written on its pages as its tag, `sv-SE`. _Avoid_: lang.

**Main language**: The first of a site's languages, which `/` leads to and `x-default` names. _Avoid_: default language.

**Language prefix**: The first segment of every public address on a site with several languages, such as `/sv/`. _Avoid_: language slug.

**Translation**: A post that holds another post's content in another language; together they form a translation set, which the published files name by a translation key. _Avoid_: version, copy.

**Translated setting**: A site setting with a value in each of a site's languages.

**Language switcher**: The links on a page to its translations, and to nothing else. _Avoid_: flags.

## Addresses and hosts

**Admin host**: The hostname where editors sign in and Sveltia lives; it never shows editor-written HTML. _Avoid_: backend.

**Public host**: The hostname visitors reach; it serves a site's current release, and passes the reserved paths to the site's services. _Avoid_: frontend.

**Public address**: Where visitors reach a post or a term's page: a path from the site's root. _Avoid_: permalink, URL.

**Term page**: A page the site builds for each term of a taxonomy that declares an address. _Avoid_: archive.

**Live address**: The public address at which the current release shows a post, which the ledger records. It becomes an old address when the post goes live at another. _Avoid_: last URL.

**Old address**: An address a post had while it was live, which leads on to its current address with a permanent redirect. _Avoid_: alias, old slug.

**Other address**: An address an editor gives a post beside its own, where the site leads on to the post or shows it. _Avoid_: alias, vanity URL.

**Redirect rule**: What the public site answers at an address no post has as its own. _Avoid_: alias.

**Pattern**: A redirect rule whose source is a regular expression, beginning with `^`, answering last of all holders. _Avoid_: wildcard.

**Reserved address**: An address the core keeps for the site's own files, which no rule or other address may take. _Avoid_: system URL.

**Reserved path**: A path below `/_konzilo/`, which no page may take, through which visitors' browsers reach a site's services. _Avoid_: API.

**404 page**: The page an Admin chooses in the site settings, which the site shows with `404` or `410` wherever nothing else answers, with no address of its own. _Avoid_: error page.

**Log of addresses not found**: The counts of the addresses visitors asked for in vain: each address, how often, and when last, kept 30 days. _Avoid_: access log.

**Log of policy violations**: The counts of what the public site's policy blocked, kept 30 days. _Avoid_: CSP log.

## Visitor functions

**Service**: In the consent rules, a third party a site's pages may let the visitor's browser reach. _Avoid_: vendor, cookie.

**Node service**: The small program per site, in two roles, that takes visitors' requests and serves editors' screens, with SQLite. _Avoid_: backend, API.

**Kind**: One kind of request the Node service takes, registered in code with its path, methods, types, size limit, check and storage. _Avoid_: route, handler.

**Metadata template**: Text with variables, edited by an Admin, that decides a page's title tag, description or sharing tags. _Avoid_: SEO template.

**Publisher**: The organisation or person behind a site, entered once. _Avoid_: owner.

**Search and sharing fields**: The values with which an editor departs, for one post, from its type's templates. _Avoid_: SEO box.

**Summary**: A post's excerpt, or the start of its body text. _Avoid_: teaser.

**Breadcrumbs**: The levels a page sits at: the start page, each published page whose address begins the page's address, and the page itself. _Avoid_: trail.

**Feed**: The RSS of a post type or of one term, at the address the site description declares. _Avoid_: newsfeed.

**Markdown alternate**: The Markdown version of a built page, at its address with `.md`. _Avoid_: .md copy.

**llms.txt**: The site's index of its pages for AI agents; `llms-full.txt` holds the chosen pages' alternates in one file. _Avoid_: AI sitemap.

**Content signals**: The site's declaration in `robots.txt` of how AI may use its content. _Avoid_: bot blocklist.

**Search index**: A site's collection in Typesense, made anew from its content files by every build. _Avoid_: search database.

**Search key**: The key a site's index is searched with, which may search that index alone. _Avoid_: API key.

**Search page**: The page of a site's design where visitors search. _Avoid_: results page.

**Form**: A set of fields visitors fill in and send, made by a developer as a component, simple or advanced, and chosen by an editor. _Avoid_: contact form, form builder.

**Recipients list**: A named list of email addresses an Admin keeps in the service, which no file holds. _Avoid_: mailing list.

**Submission**: One sent form, kept in the service for its form's retention. _Avoid_: entry, lead.

**Timing token**: A signed token a form's page asks for once the form comes into use; a submission too soon after it is held as spam. _Avoid_: CSRF token.

**Trap field**: A field hidden from people; a submission that fills it is answered as sent and held as spam. _Avoid_: honeypot.

**Service registry**: `consent.json`, the one list of a site's services, written at every build. _Avoid_: cookie list.

**Consent category**: One of necessary, functional, statistics and marketing. _Avoid_: purpose.

**Consent texts**: What the banner, the settings, the footer controls and the placeholders say. _Avoid_: cookie texts.

**Consent signal**: The page's word on what the visitor allows, per category and per service. _Avoid_: consent mode.

**Consent choice**: What a visitor allowed, kept in the browser for 12 months; a refusal is a choice too. _Avoid_: consent cookie.

**Placeholder**: An embed's panel while the visitor has not allowed its service. _Avoid_: content blocker.

**Consent record**: The site's proof of one choice, kept 13 months without an IP address or user agent. _Avoid_: cookie log.

**Consent revision**: The version of what a visitor consents to; a new one asks every visitor again. _Avoid_: version.

**Departure**: A default of the consent rules a site sets aside on purpose, from a closed list, with its reason. _Avoid_: exception.

**Tag manager**: A service that loads tags set up outside Konzilo, named with its container. _Avoid_: tracking code.

**Legal pages**: The privacy policy, the cookie policy and the accessibility statement: ordinary pages an Admin chooses. _Avoid_: imprint.

**Cookie declaration**: The list of a site's services by category, which the site renders after the cookie policy's body. _Avoid_: cookie table.

**Suggested privacy texts**: Konzilo's texts about its own processing, on a page, a section per feature the site uses, made from the facts the site runs on. _Avoid_: privacy template.

## Running it

**Compose**: The Docker Compose project that runs one site, on a laptop or a server. _Avoid_: stack.

**Hosting layer**: What runs many customers, one Compose project each, in a private repository. _Avoid_: platform.

**Test zone**: The DNS zone, on a domain of its own, where agents create and remove throwaway test sites. _Avoid_: sandbox.

**Pin**: A package a site repository holds at one exact version. _Avoid_: dependency.

**Update**: A change that raises one or more pins.

**Security fix**: An update that moves each pin to a later version with the same first two numbers, and changes nothing but pins. _Avoid_: hotfix.

**Larger update**: An update that is no security fix; it waits for a person. _Avoid_: major update.

**Update bot**: The site repository's workflow that raises its pins every night. _Avoid_: Dependabot.
