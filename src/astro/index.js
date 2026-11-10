// Konzilo's Astro integration, reached as `@kntnt/konzilo/astro`.
//
// In the site's astro.config.mjs:    integrations: [konzilo()]
// In the site's src/content.config.mjs:    export const collections = konziloCollections();
//   (imported as `import { collections as konziloCollections } from '@kntnt/konzilo/astro'`)
//
// The collections come from the site description, site-description.json at
// the root of the site repository, read when Astro starts.
//
// Each redirect rule the content files hold answers as it says: a post's old
// addresses and other addresses, and the site's own rules in
// content/redirects.json. The dev server answers each with its status, and a
// build writes each redirect as a page that sends a browser on and every rule
// as a line of `_redirects` for the web server.
//
// Every build is made for the site's public host, whose origin the build's
// environment names in KONZILO_ORIGIN, and in the site's language, which the
// site description declares. The integration sets Astro's `site` to the origin,
// and publicSite() hands both to the site's templates.
//
// Every site's sitemap and its one robots.txt are the integration's own routes,
// in routes/, which a build writes and the dev server answers: sitemap.js and
// robots.js say what they hold.
//
// Every build, the preview's too, makes every icon and the web app manifest
// from the site icon, routes of the integration's own as well, which Head.astro
// links in each page's head: site-icons.js says what they are. Head.astro also
// writes every page's search and sharing tags: search-and-sharing.js says what,
// from the metadata templates, the post's own values and summary() of the post,
// which feeds and llms.txt show too, and the page's breadcrumbs in its
// structured data, which Breadcrumbs.astro shows where a design places it
// (breadcrumbs.js).
//
// Each page that takes part in AI visibility's Markdown has its Markdown
// alternate beside it: Head.astro links it and marks the page, every build makes
// it from the built page's main content (html-to-markdown.js), and the dev server
// answers it from the page as it renders it now (markdown-alternates.js).
//
// Every answer of the public site carries the site's security headers, made from
// the site description and the rule data: the dev server sends them, and a build
// writes them as `_headers` for the web server, with the release's Content
// Security Policy, worked out from the pages it built, the service registry and
// the site description. A page with code no policy can allow, an inline event
// handler or a `javascript:` address, fails the build, naming the page and the
// element.
//
// Images go through Astro's own image service, sharp, as Konzilo's
// image-service.js has it: an SVG master asked for as a PNG or WebP at a width is
// drawn at that width. A site that names an image service of its own keeps it.
//
// The body styles a site names are loaded by every page (body-styles.js).
//
// Every build resolves the colours the site names as its tokens on its start page
// (theme-tokens.js). They are the site's theme colours, which the build then
// writes into the manifest, the Apple touch icon and each page's theme-color
// (theme-colors.js).
//
// Everything below /_konzilo/ belongs to the site's services: a build that would
// write a page there fails, naming it, and the dev server passes each request
// there to the site's endpoint, which KONZILO_ENDPOINT names, but for
// /_konzilo/search, which it passes to the local Typesense (search.js).
//
// A template places a form the site description declares with Form.astro, and
// every page's script file sends it where JavaScript runs (forms.js). Every build
// holds the page that says a form's message was not sent, which the public host
// gives a form's post in place of its own error while the endpoint does not
// answer, as the dev server does.
//
// A site whose description declares search has its search page at the address it
// declares, on a site in several languages each language's after its prefix: the
// page of its design that konzilo({ searchPage }) names, which places Konzilo's
// Search (Search.astro).
//
// On a site in several languages every build writes a 404 page for each language
// beside the root's, `<prefix>/404.html`: the site's own src/pages/404.astro,
// rendered at `/<prefix>/404`, which shows the 404 page in that language, and the
// dev server shows it at an address below the prefix that nothing holds.

import { existsSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PLACE_MESSAGE, SHOW_MESSAGE, STOPPED_MESSAGE } from '../cms/preview/paths.js';
import { searchPages } from '../format/addresses.js';
import { declaredProblem, readPostList } from '../format/post-list.js';
import { CONSENT_STORAGE } from '../format/consent.js';
import { keyOf } from '../format/redirects.js';
import rules from '../format/rules.json' with { type: 'json' };
import { declaredNames, languageTag, postListModel, readSiteDescription, SITE_DESCRIPTION_FILE } from '../site-description.js';
import { bodyStylesOf, pageImports } from './body-styles.js';
import { contentFolder } from './collections.js';
import { consentClient, cookieDeclaration, datawrapperHeights, embedPanels, matomoTracker } from '../consent/client.js';
import { CONSENT_RECORDS, CONSENT_SCRIPT_HEADERS, consentDomain, devConsentScripts, writeConsentScripts } from './consent.js';
import { pagesWithBareEmbeds } from './embeds.js';
import { lightboxClient } from './lightbox.js';
import { resolvedColors, tokensOf } from './theme-tokens.js';
import { blockMarks } from './block-marks.js';
import { previewGuard } from './preview-guard.js';
import { previewLink } from './preview-link.js';
import { isLivePreview, isPublicBuild, origin } from './public-site.js';
import { pageTagManager, pageTracker, tagManagerClient } from './tag-manager.js';
import { registryOf } from './directives.js';
import { FORM_NOT_SENT, formClient, siteFormNotSentPage, siteFormTexts } from './forms.js';
import { devDiscovery, devMarkdown, MARKDOWN_LIST, markdownList, writeMarkdownAlternates } from './markdown-alternates.js';
import { markdownFeatures, markdownHastPluginsIn, markdownMdastPlugins } from './reader.js';
import { belowBase as rulesBelowBase, buildRedirects, devRedirects } from './redirects.js';
import { devNotFoundLog } from './not-found-log.js';
import { endpointProxy, refuseReservedPages } from './reserved.js';
import { moveFeedFiles, siteFeeds } from './feeds.js';
import { termRoute } from './term-pages.js';
import { searchProxy } from './search.js';
import { givenTexts, siteTexts, textsModule } from './site-texts.js';
import { ROBOTS } from './robots.js';
import { devLlms, devLlmsFull, LLMS, LLMS_FULL, writeLlms, writeLlmsFull } from './llms-txt.js';
import { ICONS } from './site-icons.js';
import { isNumbered, SITEMAP } from './sitemap.js';
import { themeColors, writeThemeColors } from './theme-colors.js';
import { devHeaders, HEADER_LIMIT, HEADERS_FILE, headersFile, securityHeaders } from './security-headers.js';
import { contentSecurityPolicy, readRegistry, releaseCode } from './content-security-policy.js';

export { collections } from './collections.js';
export { publicSite } from './public-site.js';
export { securityHeaders } from './security-headers.js';
export { contentSecurityPolicy, policyText, releaseCode } from './content-security-policy.js';
export { markdownFeatures, markdownHastPlugins, markdownHastPluginsIn, markdownMdastPlugins, readContentFile } from './reader.js';
export { renderTemplate } from '../metadata-templates.js';
export { templateValues } from './search-and-sharing.js';
export { summary } from './summary.js';

// Astro's own image service, which a site has unless it names another, and
// Konzilo's in its place.
const ASTROS_IMAGE_SERVICE = 'astro/assets/services/sharp';
const IMAGE_SERVICE = fileURLToPath(new URL('./image-service.js', import.meta.url));

// The integration's own routes, each from its file in routes/, and the
// addresses of theirs that no file of the site's own may be at: a site has
// one sitemap, with its numbered files, and one robots.txt,
// which a build below a base of its own has not got, and the icons made
// from its site icon, which every build has.
const ROUTES = ['/sitemap.xml', '/sitemap-[number].xml', '/robots.txt', LLMS, LLMS_FULL];
const OWN = [SITEMAP, ROBOTS, LLMS, LLMS_FULL];
const ownAt = (base, feeds = []) => (isPublicBuild(base) ? [...OWN, ...ICONS, ...feeds] : ICONS);
const isOwn = (base, feeds, address) => ownAt(base, feeds).includes(address) || (isPublicBuild(base) && isNumbered(address));

// The route that answers each of the site's feeds, at the
// feed's address, which its type or taxonomy declares.
const FEED_ROUTE = new URL('./routes/feed.js', import.meta.url);

// Each language's 404 page in the build's output folder `dir` (a path), as
// Astro writes the page at `/<prefix>/404`, moved to `<prefix>/404.html`,
// beside the root's 404.html, on a site in several `languages`.
function moveNotFoundPages(dir, languages) {
  if (languages.length <= 1) return;
  for (const { prefix } of languages) {
    const written = join(dir, prefix, '404', 'index.html');
    if (!existsSync(written)) continue;
    renameSync(written, join(dir, prefix, '404.html'));
    rmSync(join(dir, prefix, '404'), { recursive: true, force: true });
  }
}

function ownFile(address, file) {
  return new Error(`Konzilo writes the site's ${address} itself, so the site may not have one of its own: remove ${file}`);
}

// Sätteri's HTML tree plugin that leads every link of a body to a path on
// the site, written in Markdown or in raw HTML, to that path below `base`.
// Another address, a fragment or `//host` stays as it is.
function belowBase(base) {
  const prefix = base.replace(/\/$/, '');
  return {
    name: 'konzilo-links-below-the-base',
    element: {
      filter: ['a'],
      visit(node, ctx) {
        const { href } = node.properties;
        if (typeof href === 'string' && href.startsWith('/') && !href.startsWith('//')) ctx.setProperty(node, 'href', `${prefix}${href}`);
      },
    },
  };
}

// The core's own modules read files beside them from their own address,
// import.meta.url. Astro bundles the modules a page renders with into chunks of its own, in
// a folder of the build's, so this Vite plugin gives each module of the core
// its own file's address there, as the dev server and Node do.
const CORE = realpathSync(fileURLToPath(new URL('../', import.meta.url)));

function ownAddresses() {
  return {
    name: 'konzilo-own-addresses',
    enforce: 'pre',
    transform(code, id, options) {
      // Only what runs in the build's Node: a browser's script keeps its own.
      const server = options?.ssr === true || this?.environment?.config?.consumer === 'server';
      if (!server || !code.includes('import.meta.url')) return null;
      const file = id.split('?')[0];
      let real;
      try {
        real = realpathSync(file);
      } catch {
        return null;
      }
      if (!real.startsWith(CORE + sep) || !/\.(js|mjs)$/.test(real)) return null;
      return { code: code.replaceAll('import.meta.url', JSON.stringify(pathToFileURL(real).href)), map: null };
    },
  };
}

// The module Form.astro takes the declared forms from, as the site
// description's read form gives them; their texts in each language are the
// texts module's (site-texts.js).
const FORMS = 'virtual:konzilo/forms';

function formsModule(described) {
  const code = `export const forms = ${JSON.stringify(described?.forms ?? {})};\n`;
  return {
    name: 'konzilo-forms',
    resolveId: (id) => (id === FORMS ? `\0${FORMS}` : undefined),
    load: (id) => (id === `\0${FORMS}` ? code : undefined),
  };
}

// A component as a site names it: a path from its root, or a package's by its name.
const componentAt = (root, name) => (name.startsWith('.') ? resolve(root, name) : name);

// The module Body.astro takes the site's components from: each component
// the site gives a directive, by the directive's name.
const COMPONENTS = 'virtual:konzilo/directives';

function directiveComponents(root, directives) {
  const names = Object.keys(directives);
  const code = [
    ...names.map((name, i) => `import C${i} from ${JSON.stringify(componentAt(root, directives[name]))};`),
    `export default { ${names.map((name, i) => `${JSON.stringify(name)}: C${i}`).join(', ')} };`,
  ].join('\n');
  return {
    name: 'konzilo-directive-components',
    resolveId: (id) => (id === COMPONENTS ? `\0${COMPONENTS}` : undefined),
    load: (id) => (id === `\0${COMPONENTS}` ? code : undefined),
  };
}

// The directive the integration renders itself: the post list,
// through the presentation the site registers for each.
const LIST = rules.elements['post-list'].directive;

// The module Body.astro's post lists take the site from (post-lists.js):
// `presentations`, each presentation's component by its name, and `site`,
// what a list needs of the site description: each type's collection, fields
// of terms and fields a list filters on, each taxonomy with an address, its
// collection, its address and the types its terms' pages list, what a list
// may name and the site's language. A post's address, and a list's text
// where it matches nothing, are in the post's language (site-languages.js,
// site-texts.js).
const POST_LISTS = 'virtual:konzilo/post-lists';

function postListModule(root, components, described) {
  const names = Object.keys(components);
  const types = described ? Object.fromEntries(Object.values(described.types).map((type) => [type.name, {
    collection: type.collection,
    terms: type.fields.filter((field) => field.kind === 'terms' && field.taxonomy).map((field) => ({ field: field.name, taxonomy: field.taxonomy.name })),
    fields: type.fields.filter((field) => ['date', 'modified', 'meta'].includes(field.kind)).map((field) => field.name),
  }])) : {};
  // A taxonomy with an address: its terms' pages list the posts
  // of every type that takes it.
  const takers = (name) => Object.values(described.types).filter((type) => type.fields.some((field) => field.kind === 'terms' && field.taxonomy?.name === name));
  const taxonomies = described ? Object.fromEntries(Object.values(described.taxonomies).filter((taxonomy) => taxonomy?.address != null).map((taxonomy) => [taxonomy.name, {
    collection: taxonomy.collection,
    address: taxonomy.address,
    hierarchical: taxonomy.hierarchical,
    types: takers(taxonomy.name).map((type) => type.name),
  }])) : {};
  const site = {
    types,
    taxonomies,
    lists: described ? postListModel(described) : { types: {}, presentations: {} },
    locale: described?.language ? described.language.replace('_', '-') : undefined,
  };
  const code = [
    ...names.map((name, i) => `import P${i} from ${JSON.stringify(componentAt(root, components[name]))};`),
    `export const presentations = { ${names.map((name, i) => `${JSON.stringify(name)}: P${i}`).join(', ')} };`,
    `export const site = ${JSON.stringify(site)};`,
  ].join('\n');
  return {
    name: 'konzilo-post-lists',
    resolveId: (id) => (id === POST_LISTS ? `\0${POST_LISTS}` : undefined),
    load: (id) => (id === `\0${POST_LISTS}` ? code : undefined),
  };
}

// What a directive with an attribute that names what the site description
// declares (`declared` in the rule data, a form's name) is checked against,
// by the directive's name. A content file that names a form the site does not
// declare is a post's last published file, so the site builds on and leaves
// the form out of the page, and the build warns, naming the file, its line
// and the form, so that one post that still places a form a developer took
// out keeps no other post off the site.
function declaredChecks(declared, known) {
  const leaveOut = {};
  for (const entry of known.values()) {
    const named = Object.entries(entry.attributes).filter(([, setting]) => setting.declared);
    if (named.length === 0) continue;
    leaveOut[entry.name] = (values) => named
      .filter(([attribute]) => Object.hasOwn(values, attribute))
      .map(([attribute, setting]) => declaredProblem(setting, values[attribute], declared))
      .filter((reason) => reason !== null)
      .map((reason) => `${reason}, so the page leaves the ${entry.name} out until the post no longer places it or the site declares it again`);
  }
  return leaveOut;
}

// The site description of the site at `root`, as checked, or null when it
// has none, or one the checker refuses, which the content collections then
// name.
function describedSiteAt(root) {
  const file = join(root, SITE_DESCRIPTION_FILE);
  if (!existsSync(file)) return null;
  try {
    return readSiteDescription(file);
  } catch {
    return null;
  }
}

// The site's presentations against its site description's: each declared
// presentation must have a component, and each component a declared
// presentation.
function checkPresentations(described, components) {
  const declared = Object.keys(described.presentations ?? {});
  for (const name of declared) {
    if (!Object.hasOwn(components, name)) throw new Error(`Konzilo: the site description declares the presentation ${name}, which the site's design does not register in konzilo({ presentations })`);
  }
  for (const name of Object.keys(components)) {
    if (!declared.includes(name)) throw new Error(`Konzilo: the site registers a component for the presentation ${name}, which the site description does not declare`);
  }
}

// The integration sets the site's Markdown reader: its features, and the HTML tree
// plugins that render Konzilo's forms, which run before Astro's own. On every
// page it runs the consent client's script, which keeps the visitor's choice
// and gives the consent signal, and the embeds' panels' script,
// which loads an embed once the visitor consents to its service and until
// then makes its panel the consent placeholder, and the forms'
// script, which sends each declared form on the page, from one script
// file of the site's own. It answers the redirect rules. It sets Astro's `site`
// to the public host's origin, and Astro's dev server and every build fail at once without one.
// It gives the public site its sitemap and robots.txt, and every build the
// site's icons and manifest, and fails a site with a file of its own at any
// of their addresses. It gives Astro Konzilo's image service.
//
// `directives`: the site's own component for a directive the rule data
// registers, by the directive's name, as a path from the site's
// root (`{ form: './src/components/Form.astro' }`), or a package's by its
// name, as every component of a site's may be. The site's templates
// render a post's body as `<Body><Content /></Body>` (Body.astro), which
// puts each in place of the directive's plain rendering.
// `presentations`: the site's component for each presentation its site
// description declares, by the presentation's name, as a path
// from the site's root (`{ cards: './src/components/Cards.astro' }`). Body
// renders each post list with its presentation's component, given `posts`,
// the posts the list shows, each { entry, url }, the post's entry and its
// address below the site's base, or null for a type without one; `options`,
// the presentation's options as the list sets them; and `empty`, the text
// for a list that matches nothing. A declared presentation without a
// component fails Astro's start and every build, naming it.
// `emptyList`: the site's text for a list that matches nothing and gives
// no text of its own, in the site's language, its main language on a site
// in several; by default the core's (site-texts.js).
// `formTexts`: the site's own texts for its forms, in the site's language,
// its main language on a site in several, in place of the core's, by the
// keys of FORM_TEXTS in forms.js (`{ send: 'Send message' }`); a key the
// core has not got fails at once. The confirmation text once a form is sent
// is the Admin's, among the site settings.
// `texts`: the site's own texts in each language, by locale, over
// those above and the core's: the language switcher's label, a post list's
// text where it matches nothing, a form's texts and search's
// (site-texts.js says which). On a site in a language the core writes no
// texts in, the build warns of each the site does not give.
// `searchPage`: the site's search page, a page of its design as
// a path from the site's root (`./src/components/SearchPage.astro`), which
// places Konzilo's Search and which the integration puts at the address the
// site description declares; one the description declares without it fails
// Astro's start and every build, naming it. A site without search has no
// search page, whatever it gives.
// `termPage`: the site's page of a term, a page of its design as
// a path from the site's root (`./src/components/TermPage.astro`), which
// the integration puts at the address of each taxonomy whose description
// declares one, and whose getStaticPaths() gives what termPages() from
// `@kntnt/konzilo/astro/post-lists` gives for its route: each term of the
// taxonomy, with its posts and its later pages. A taxonomy with an address
// without it fails Astro's start and every build, naming it.
// `bodyStyles`: the site's body styles, a list of stylesheets, each a path
// from the root of the site repository (`./src/styles/body.css`) or a
// package's stylesheet by its name; none by default.
// `tokens`: the custom properties that hold the site's colours, by the role each
// takes, `primary` and `base`, which every build resolves as the site's theme
// colours (theme-colors.js); none by default.
export default function konzilo({ directives = {}, presentations = {}, emptyList, formTexts = {}, texts = {}, searchPage, termPage, bodyStyles, tokens } = {}) {
  const ownFormTexts = siteFormTexts(formTexts);
  const ownTexts = givenTexts(texts);
  if (emptyList !== undefined && (typeof emptyList !== 'string' || emptyList.trim() === '')) throw new Error('Konzilo: emptyList must be a text');
  for (const name of Object.keys(directives)) {
    if (name === LIST.name) throw new Error(`Konzilo: the integration renders the directive ${name} itself, through the presentations the site registers in konzilo({ presentations })`);
  }
  const named = tokensOf(tokens);
  let root;
  let base = '/';
  let search = [];
  let pages = new Set();
  let resolved = false;
  let middleware;
  let body = null;
  let language = null;
  let languages = [];
  // The shared domain the consent choice is kept on, on this build, or null.
  let consentShared = null;
  // The site's feeds, the public site's alone, and the addresses of the
  // types' feeds, which no page of the site's own may have.
  let feeds = [];
  let feedAddresses = [];
  let described = null;
  // The page that says a form's message was not sent, in the site's
  // language, from what the last export left in the content folder.
  const formNotSent = () => siteFormNotSentPage(root, { locale: language, languageTag: languageTag(language), texts: ownFormTexts, folder: contentFolder(), languages });
  return {
    name: '@kntnt/konzilo',
    hooks: {
      'astro:config:setup': ({ config, command, injectRoute, injectScript, updateConfig, logger }) => {
        body = bodyStylesOf({ bodyStyles }, config.root);
        const { processor } = config.markdown;
        if (processor.name !== 'satteri') {
          throw new Error(`Konzilo reads Markdown with Sätteri, but the site sets markdown.processor to ${processor.name}`);
        }
        // Astro.site, and `new URL(path, Astro.site)`, then give addresses on
        // the public host, in a preview below a base of its own too.
        if (command === 'dev' || command === 'build' || process.env.KONZILO_ORIGIN) updateConfig({ site: origin() });
        // Each post list, and each form a body places, is checked against the
        // site description as its file is read, and each presentation it
        // declares must have a component.
        described = describedSiteAt(fileURLToPath(config.root));
        language = described?.language ?? null;
        languages = described?.languages ?? [];
        // Without a description it can read, there is nothing to hold them against, and what is
        // wrong with it comes from where it is read.
        if (described) checkPresentations(described, presentations);
        // The site's directives: the core's, and the components its description declares.
        const known = registryOf(described);
        for (const name of Object.keys(directives)) {
          if (!known.has(name)) throw new Error(`Konzilo: the site gives a component for the directive ${name}, which neither the rule data nor the site description declares`);
        }
        // The site's search page, at the address its description declares,
        // each language's after its prefix on a site in several.
        search = described ? searchPages(described) : [];
        if (search.length > 0) {
          if (typeof searchPage !== 'string') {
            throw new Error(`Konzilo: the site description declares a search page at ${described.search.address}, which the site's design does not give in konzilo({ searchPage })`);
          }
          for (const address of search) injectRoute({ pattern: address.replace(/\/$/, ''), entrypoint: componentAt(fileURLToPath(config.root), searchPage), prerender: true });
        }
        // The 404 page of each language, on a site in several, from the
        // site's own, where it has one.
        const notFoundPage = fileURLToPath(new URL('pages/404.astro', config.srcDir));
        if (languages.length > 1 && existsSync(notFoundPage)) {
          for (const { prefix } of languages) injectRoute({ pattern: `/${prefix}/404`, entrypoint: notFoundPage, prerender: true });
        }
        // The site's term page, at the address of each taxonomy that
        // declares one, where termPages() gives it each term's pages.
        for (const taxonomy of Object.values(described?.taxonomies ?? {}).filter((one) => one?.address != null)) {
          if (typeof termPage !== 'string') {
            throw new Error(`Konzilo: the site description gives the terms of ${taxonomy.name} pages at ${taxonomy.address}, which the site's design does not give in konzilo({ termPage })`);
          }
          injectRoute({ pattern: termRoute(taxonomy.address), entrypoint: componentAt(fileURLToPath(config.root), termPage), prerender: true });
        }
        const lists = described ? postListModel(described) : null;
        const leaveOut = lists ? declaredChecks(declaredNames(described), known) : {};
        const checks = lists ? { [LIST.name]: (values) => readPostList(values, lists, { attributes: LIST.attributes }).problems } : {};
        Object.assign(processor.options.features, markdownFeatures);
        processor.options.mdastPlugins.push(...markdownMdastPlugins({ checks, leaveOut, known, warn: (message) => logger.warn(message) }));
        // An embed's panel says in the site's language, its post's on a site
        // in several, that the site's script has not run, until it runs.
        processor.options.hastPlugins.push(...markdownHastPluginsIn(described?.language ?? null, languages));
        // In the live preview, each block of a body says which it is, so that a click on it leads
        // to the field.
        if (isLivePreview()) processor.options.hastPlugins.push(blockMarks);
        // The core's texts the site gives its own of, in each language.
        const shown = siteTexts(languages, ownTexts, { emptyList, forms: ownFormTexts });
        for (const warning of shown.warnings) logger.warn(warning);
        for (const locale of Object.keys(ownTexts).filter((given) => !languages.some((one) => one.locale === given))) {
          logger.warn(`konzilo({ texts }) gives texts in ${locale}, which the site description does not declare`);
        }
        updateConfig({ vite: { plugins: [ownAddresses(), directiveComponents(fileURLToPath(config.root), directives), postListModule(fileURLToPath(config.root), presentations, described), formsModule(described), textsModule(shown.texts)] } });
        // A content file links to a page by its path on the site, as the
        // public site has it. A build below a base of its own, as a preview
        // and a share's preview are, leads each such
        // link to the page below the base, as the site's templates do with
        // BASE_URL, so that its reader stays in the preview.
        if (!isPublicBuild(config.base)) processor.options.hastPlugins.push(belowBase(config.base));
        // Only the public site's pages send the record of a choice; a
        // preview's, below a base of its own, are no visitor's. A release
        // for the launched origin keeps it on the description's domain,
        // where it gives one.
        const shared = consentDomain({ command, base: config.base, domain: described?.consent.domain ?? null });
        if (shared.warning) logger.warn(shared.warning);
        consentShared = shared.domain;
        const client = { ...CONSENT_STORAGE, domain: shared.domain, records: isPublicBuild(config.base) ? CONSENT_RECORDS : null };
        // The tag manager's container, on a release built for the launched
        // customer's domain alone, from the settings and the
        // registry the export left in the content folder.
        const folder = resolve(fileURLToPath(config.root), contentFolder());
        const tagManager = pageTagManager({ command, base: config.base, folder, languages });
        // Or Matomo's own tracker, by the same rules.
        const tracker = pageTracker({ command, base: config.base, folder, languages, warn: (message) => logger.warn(message) });
        injectScript('page', `(${consentClient})(${JSON.stringify(client)});\n(${tagManagerClient})(${JSON.stringify(tagManager)});\n(${matomoTracker})(${JSON.stringify(tracker)});\n(${cookieDeclaration})();\n(${embedPanels})();\n(${datawrapperHeights})();\n(${formClient})();\n(${lightboxClient})();`);
        if (config.image.service.entrypoint === ASTROS_IMAGE_SERVICE) {
          updateConfig({ image: { service: { entrypoint: IMAGE_SERVICE, config: config.image.service.config } } });
        }

        // A page in the live preview's pane stays there, whatever it tries.
        if (isLivePreview()) injectScript('head-inline', `(${previewGuard})(${JSON.stringify(STOPPED_MESSAGE)});\n(${previewLink})(${JSON.stringify(PLACE_MESSAGE)}, ${JSON.stringify(SHOW_MESSAGE)});`);

        // Every page loads the body styles.
        if (body !== null) injectScript('page-ssr', pageImports(body));

        root = fileURLToPath(config.root);
        // A build below a base of its own, as the preview is, answers each
        // rule below it, and leads each to its target below it too.
        base = config.base;
        feeds = described && isPublicBuild(base) ? siteFeeds(described) : [];
        feedAddresses = feeds.filter((feed) => feed.type).map((feed) => feed.route);
        const numberedFiles = isPublicBuild(base) && existsSync(config.publicDir) ? readdirSync(config.publicDir).map((name) => `/${name}`).filter(isNumbered) : [];
        for (const address of [...ownAt(base, feedAddresses), ...numberedFiles]) {
          const own = new URL(address.slice(1), config.publicDir);
          if (existsSync(own)) throw ownFile(address, relative(root, fileURLToPath(own)));
        }
        // The public site's sitemap and robots.txt; a preview, which no
        // search engine sees, has neither. Every build has the icons.
        const routes = isPublicBuild(base) ? [...ROUTES, ...ICONS] : ICONS;
        for (const route of routes) injectRoute({ pattern: route, entrypoint: new URL(`./routes${route}.js`, import.meta.url), prerender: true });
        // The public site's feeds, each at its address; a preview has none.
        for (const feed of feeds) injectRoute({ pattern: feed.address.replace('{slug}', '[slug]'), entrypoint: FEED_ROUTE, prerender: true });
      },
      // The addresses the pages of the site's design have, which hold them
      // above every rule: the dev server's routes without parameters. A page
      // of the site's own at an address of the integration's routes fails
      // the build and the dev server's start; one that appears while the dev
      // server runs is an error in its log.
      'astro:routes:resolved': ({ routes, logger }) => {
        const own = routes.filter((route) => route.origin === 'project' && ['page', 'endpoint'].includes(route.type) && typeof route.pathname === 'string');
        const taken = own.find((route) => isOwn(base, feedAddresses, route.pathname?.replace(/(.)\/$/, '$1')));
        if (taken !== undefined) {
          const error = ownFile(taken.pathname, taken.entrypoint);
          if (!resolved) throw error;
          logger.error(error.message);
        }
        resolved = true;
        pages = new Set(own.map((route) => keyOf(route.pathname)));
        for (const address of search) pages.add(keyOf(address));
        middleware?.forget();
      },
      // The dev server reads the rules for each request instead, since every
      // export may change them.
      'astro:server:setup': ({ server, logger }) => {
        // The counts of addresses not found, which see every answer's
        // status once it is sent.
        if (!isLivePreview()) server.middlewares.use(devNotFoundLog());
        // The security headers first, on every answer.
        server.middlewares.use(devHeaders(root));
        server.middlewares.use(searchProxy(root));
        // The consent scripts for pages the site does not build, which the
        // public host serves as files below the endpoint's prefix.
        if (isPublicBuild(base)) server.middlewares.use(devConsentScripts(() => ({ folder: resolve(root, contentFolder()), languages, origin: origin(), domain: null })));
        server.middlewares.use(endpointProxy(undefined, { notSent: formNotSent }));
        // Each page's Markdown alternate, made from the page as the dev
        // server renders it, at its own address; a preview has none.
        if (isPublicBuild(base)) server.middlewares.use(devMarkdown({ server, logger }));
        // The Link headers of every page, and a page's Markdown at its own
        // address to a request that prefers it, as the public host has them.
        if (isPublicBuild(base)) server.middlewares.use(devDiscovery({ server, logger, origin: origin(), related: [LLMS, LLMS_FULL] }));
        // llms-full.txt with them, made the same way, and llms.txt, which
        // lists the pages that have one; a preview has neither.
        if (isPublicBuild(base)) server.middlewares.use(devLlmsFull({ server, logger }));
        if (isPublicBuild(base)) server.middlewares.use(devLlms({ server, logger }));
        middleware = devRedirects(root, { watcher: server.watcher, logger, pages: () => pages, base });
        server.middlewares.use(middleware);
      },
      'astro:build:done': async ({ dir, pages: built, logger }) => {
        refuseReservedPages(dir);
        const bare = pagesWithBareEmbeds(dir);
        if (bare.length > 0) logger.warn(`${bare.length} page(s) with an embed, such as ${bare[0]}, have no ConsentBanner in their layout, so a visitor gets the embed's bare address: place Konzilo's ConsentBanner.astro in the layout`);
        // Each language's 404 page where the web server, the preview and
        // the dev server look for it.
        moveNotFoundPages(fileURLToPath(dir), languages);
        // Each page's Markdown alternate beside it, made from the page as
        // built, before anything else rewrites a page.
        const alternates = writeMarkdownAlternates(dir);
        if (alternates.length > 0) logger.info(`made the Markdown alternates of ${alternates.length} pages`);
        // The list of them for the public host's web server; a preview has
        // none.
        if (isPublicBuild(base)) writeFileSync(new URL(MARKDOWN_LIST, dir), markdownList(alternates));
        // llms-full.txt holds them, as written, and llms.txt lists the
        // pages that have one.
        const full = writeLlmsFull(dir, (message) => logger.warn(message));
        writeLlms(dir, (message) => logger.warn(message), { full: full > 0 });
        // Each feed into its address's folder, where the web server answers
        // it with and without the last slash.
        if (feeds.length > 0) moveFeedFiles(fileURLToPath(dir), described);
        const { list, warnings } = buildRedirects(root, { dir, pages: built, based: rulesBelowBase(base) });
        for (const warning of warnings) logger.warn(warning);
        writeFileSync(new URL('_redirects', dir), list);
        // The site's theme colours, as the start page's root resolves the
        // tokens, written into the pages, the manifest and the Apple touch
        // icon now that they are made.
        const resolved = resolvedColors(dir, { root, base, tokens: named, warn: (message) => logger.warn(message) });
        const colors = await themeColors(resolved, named.colors, (message) => logger.warn(message));
        await writeThemeColors(dir, { base, colors });
        // What the public host gives a form's post in place of its own
        // error while the endpoint does not answer.
        mkdirSync(new URL('./', new URL(FORM_NOT_SENT, dir)), { recursive: true });
        writeFileSync(new URL(FORM_NOT_SENT, dir), formNotSent());
        // The public site's consent scripts for pages it does not build, one
        // per language, with their stylesheet.
        const consentScripts = isPublicBuild(base) ? writeConsentScripts(dir, { folder: resolve(root, contentFolder()), languages, origin: origin(), domain: consentShared }) : [];
        if (consentScripts.length > 0) logger.info(`wrote the consent scripts ${consentScripts.join(', ')}`);
        // The headers last, once the release holds every page, the
        // redirects' among them.
        const { code, problems } = releaseCode(fileURLToPath(dir));
        if (problems.length > 0) {
          // A layout's code is on every page: the first 20 say where.
          const listed = problems.slice(0, 20).map((problem) => `- ${problem}`);
          if (problems.length > 20) listed.push(`- and ${problems.length - 20} more`);
          throw new Error(`Konzilo: no Content Security Policy can allow this code without 'unsafe-inline', so the site's design must move it into a script file or use a real address:\n${listed.join('\n')}`);
        }
        const description = readSiteDescription(join(root, SITE_DESCRIPTION_FILE));
        // The build's content folder: the site's, or a preview's own.
        const registry = readRegistry(resolve(root, contentFolder()));
        // Only the public site's pages report a violation; a preview's,
        // below a base of its own, are no visitor's.
        const policy = contentSecurityPolicy({ code, registry, description, reports: isPublicBuild(base) });
        const headers = securityHeaders(description, policy);
        // A header the server would refuse would leave the site the last
        // release's policy, which holds none of this release's hashes.
        for (const [name, value] of headers) {
          if (value.length <= HEADER_LIMIT) continue;
          throw new Error(`Konzilo: the release's ${name} is ${value.length} characters, more than the ${HEADER_LIMIT} characters the server takes: its pages hold ${code.scripts.length} distinct inline scripts, ${code.styles.length} distinct inline styles and ${code.attributes.length} distinct style attribute values, each a hash in the Content Security Policy; the site's design must hold fewer, such as by classes in its stylesheets`);
        }
        writeFileSync(new URL(HEADERS_FILE, dir), headersFile(headers, consentScripts.length > 0 ? [CONSENT_SCRIPT_HEADERS] : []));
      },
    },
  };
}
