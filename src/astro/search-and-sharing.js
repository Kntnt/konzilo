// The search and sharing tags of a page's head, which the
// integration's Head component writes: what search engines and social
// networks show of the page, from the metadata templates and the site-wide
// values of the Search and sharing settings (the group `search` in the site
// settings), the post's own search and sharing fields and the site's
// identity.
//
// A post's page says:
//
// - its title tag: the post's own, else its type's template rendered, else
//   its title; its meta description: the post's own, else the template
//   rendered; its sharing title and description: the post's own, else the
//   templates rendered, else the title tag and the description. A post of a
//   built-in type, and one whose type of the site's own has a teaser, falls
//   back to what its teaser shows before the templates, cut as a search
//   result and a shared link show it (article-parts.js, built-in-types.js):
//   a page's and a canvas's teaser to its title alone, so that where it has
//   no text of its own the templates give its description;
// - its canonical address, as its canonical link and Open Graph's address:
//   the one the post names, such as the original's where it was published
//   elsewhere first, else the post's public address on the public host,
//   under its language's prefix on a site in several languages;
//   on a later page of its list with pages of its own, that page's,
//   `<address>page/<n>/`, which the original has not got;
// - on a site in several languages, `hreflang` links to the page in each
//   language it is in, itself included, and `x-default` to the main
//   language's, where it is in that one, but a translation marked noindex,
//   as the sitemap's alternates are (alternates() in site-languages.js); a
//   later page of a list has none;
// - `<meta name="robots">` with noindex, nofollow or both, only when the
//   post asks for it, or on a later page of its list, which is noindex;
// - Open Graph's type, `article` for the Article types, with the post's
//   date and last change, `website` for any other, and its title,
//   description, the site's title and its language;
// - the sharing image, the post's own, else its featured image, else the
//   default sharing image, else the site's logo, else none, made 1200 × 630,
//   cropped to fill, as a JPEG, with its alt text, for Open Graph and X;
// - X's card, `summary_large_image` with an image and `summary` without;
// - the alternates other parts of the core add (ALTERNATES);
// - its structured data, one JSON-LD graph of the same values
//   (structured-data.js), with the page's breadcrumbs (breadcrumbs.js) and
//   an article's authors (authors.js).
//
// A term's page, where its taxonomy declares an address, says
// the same of the term's name and its description as a page of the
// site's own says of the title and the description it is given, at the
// term's page's address, and a later page of it is noindex, at its own.
//
// A page of the site's own, such as the start page or the 404 page, says
// the same of the title and the description it is given, its title in a
// title tag as a post's is by default, `<title> – <site title>`, and takes
// the start page's templates for what it is not given, on its own address.
// The site's search page says noindex too: its results are the
// site's own pages. A language's start page links the other languages'
// start pages with `hreflang`, as a post does its translations.
//
// Every value is in the page's language: its settings and templates, its
// dates, `og:locale` and the structured data's `inLanguage`.

import { labelIn } from '../catalogues.js';
import { listPageAddress, searchPages } from '../format/addresses.js';
import { searchDescriptionOf, searchTitleOf, SHARING_SIZE, socialDescriptionOf, socialTitleOf } from '../format/article-parts.js';
import { followsParts, isArticle } from '../format/built-in-types.js';
import { renderTemplate } from '../metadata-templates.js';
import { isSiteTitle } from '../settings-groups.js';
import { articleAuthors } from './authors.js';
import { feedAlternates } from './feeds.js';
import { entryAddress } from './languages.js';
import { markdownLink } from './markdown-alternates.js';
import { graphScript, structuredData } from './structured-data.js';
import { summary } from './summary.js';
import { taxonomyWithPages } from './term-pages.js';

// The size of a sharing image, as Open Graph's and X's large cards show one.
export const SHARING_IMAGE = SHARING_SIZE;

// The title tag of a page of the site's own that gives its title, as a
// post's is by default.
const PAGE_TITLE = '{{ post.title }} {{ sep }} {{ site.title }}';

// The one place where another part of the core adds alternates of a page to
// its head, such as the site's feeds or the page as Markdown
//: each entry a function of the page, { entry, type, path, page,
// origin, settings, site, base }, the entry it shows (null for a page of the
// site's own), its type, its path from the site's root, the number of a
// post's page of a list with pages (1 for its first), the public host's
// origin, the site settings, the site description as checked and the base
// the site is built below, and of Astro's functions { getCollection,
// getEntries, getImage }, that gives its alternates, each { type, href,
// title }, `title` optional, at once or as a promise. Each becomes `<link
// rel="alternate">`, after the tags above. The first is the page's Markdown
// alternate (markdown-alternates.js), then each type's feed, on every page
// (feeds.js).
export const ALTERNATES = [markdownLink, feedAlternates];

// The tags of a page's head, in order, each { tag, attributes, text }: the
// `<title>` with its text, then `<meta>` and `<link>` with their attributes,
// and last the `<script>` of the structured data with its attributes and
// its text, the graph as JSON.
//
// `entry`: the entry the page shows, as Astro hands a template one, or null
// for a page of the site's own, which may give its `title` and
// `description`. `path`: the page's path from the site's root, which a page
// of the site's own is at. `page`: the page of a post's list with pages of
// its own, from 1. `settings`: the settings entry's data, undefined
// while the site has none. `site`: the site description, as checked.
// `origin`, `locale` and `languageTag`: the public site (public-site.js), in the
// page's language. `page`: the number of a post's page of a list with
// pages, 1 for its first. `languages`: the page in each language search
// engines are told it is in, itself included, as `{ tag, path, main }`, its
// language's tag, its path from the site's root and whether it is the main
// language, or none (site-languages.js, alternates()). `base`: the base
// the site is built below, '/' for the public site. `now`: the moment of
// the build.
// `breadcrumbs`: the page's breadcrumbs, as breadcrumbs() in breadcrumbs.js
// gives them, none on the start page. `getImage`: Astro's, from
// astro:assets; `getEntries` and `getCollection`: Astro's, from
// astro:content, which read a post's terms and the site's posts.
export async function headTags({ entry = null, title, description, path, page: number = 1, settings, site, origin, locale, languageTag, languages = [], base = '/', now = new Date(), breadcrumbs = [] }, { getImage, getEntries, getCollection }) {
  const search = settings?.search ?? searchDefaults(site);
  const siteTitle = settings?.title ?? '';
  const type = entry === null ? null : Object.values(site.types).find((declared) => declared?.collection === entry.collection) ?? null;
  const taxonomy = type === null ? taxonomyWithPages(site, entry) : null;
  const known = { settings: { ...settings, search }, languageTag, now };
  const page = type !== null
    ? await postPage({ entry, type, path, number, search, site }, known, getEntries)
    : taxonomy !== null
      ? await termPage({ entry, taxonomy, number, search, siteTitle }, known, getEntries)
      : ownPage({ title, description, path, search, siteTitle, searchPages: searchPages(site) }, known);
  const chosen = page.image ?? search.image ?? settings?.logo ?? null;
  const image = chosen && await sharingImage(chosen, origin, getImage);
  const logo = settings?.logo ? await logoImage(settings.logo, origin, getImage) : null;
  const url = new URL(page.path, origin).href;
  const canonical = page.canonical ?? url;
  const meta = (key, name, content) => (content ? [{ tag: 'meta', attributes: { [key]: name, content } }] : []);
  const og = (name, content) => meta('property', name, content);
  const twitter = (name, content) => meta('name', name, content);
  const alternates = (await Promise.all(ALTERNATES.map((part) => part({ entry, type, path: page.path, page: number, origin, settings, site, base }, { getCollection, getEntries, getImage })))).flat();
  const graph = structuredData({
    page: { ...page, published: moment(page.published), modified: moment(page.modified) },
    url,
    origin,
    languageTag,
    siteTitle,
    search,
    image,
    logo,
    breadcrumbs: breadcrumbs.map(({ name, path: at }) => ({ name, url: new URL(at, origin).href })),
    authors: (page.authors ?? []).map(({ name, slug, path: at }) => ({ name, slug, url: at === null ? null : new URL(at, origin).href })),
  });
  // A later page of a list's pages is in no other language.
  const inLanguages = number > 1 ? [] : languages;
  const main = inLanguages.find((one) => one.main);
  const hreflang = (tag, at) => ({ tag: 'link', attributes: { rel: 'alternate', hreflang: tag, href: new URL(at, origin).href } });
  return [
    { tag: 'title', text: page.title },
    ...meta('name', 'description', page.description),
    { tag: 'link', attributes: { rel: 'canonical', href: canonical } },
    ...inLanguages.map((one) => hreflang(one.tag, one.path)),
    ...(main ? [hreflang('x-default', main.path)] : []),
    ...meta('name', 'robots', page.robots),
    ...og('og:type', page.article ? 'article' : 'website'),
    ...og('og:title', page.socialTitle),
    ...og('og:description', page.socialDescription),
    ...og('og:url', canonical),
    ...og('og:site_name', siteTitle),
    ...og('og:locale', locale),
    ...(image ? [...og('og:image', image.src), ...og('og:image:width', String(image.width)), ...og('og:image:height', String(image.height)), ...og('og:image:alt', image.alt)] : []),
    ...(page.article ? [...og('article:published_time', moment(page.published)), ...og('article:modified_time', moment(page.modified))] : []),
    ...twitter('twitter:card', image ? 'summary_large_image' : 'summary'),
    ...twitter('twitter:title', page.socialTitle),
    ...twitter('twitter:description', page.socialDescription),
    ...(image ? [...twitter('twitter:image', image.src), ...twitter('twitter:image:alt', image.alt)] : []),
    ...alternates.map(({ type: kind, href, title: named }) => ({ tag: 'link', attributes: { rel: 'alternate', type: kind, href, ...(named ? { title: named } : {}) } })),
    { tag: 'script', attributes: { type: 'application/ld+json' }, text: graphScript(graph) },
  ];
}

// What a page of the site's own says: the title it is given, the page's
// own, in a title tag as a post's is by default, and the description it is
// given, as it is, and the start page's templates for what it is not given.
function ownPage({ title, description, path, search, siteTitle, searchPages: searched = [] }, known) {
  const values = templateValues(known);
  const render = (template, own = {}) => renderTemplate(template ?? '', { ...values, ...own }, search.separator);
  const home = search.home ?? {};
  const titleTag = (title && render(PAGE_TITLE, { 'post.title': title })) || render(home.title) || siteTitle;
  const metaDescription = description || render(home.description);
  return {
    title: titleTag,
    description: metaDescription,
    socialTitle: title || render(home.socialTitle) || titleTag,
    socialDescription: description || render(home.socialDescription) || metaDescription,
    path,
    robots: searched.includes(path.endsWith('/') ? path : `${path}/`) ? 'noindex' : '',
    schema: 'WebPage',
    article: false,
    image: null,
  };
}

// What a term's page says: the term's name, as a page of the
// site's own gives its title, and its description, at its page's address,
// each later page at its own, `noindex`; a collection of pages to
// structured data.
async function termPage({ entry, taxonomy, number, search, siteTitle }, known, getEntries) {
  const slugs = [entry.id];
  for (let next = entry; taxonomy.address.includes('{path}') && next?.data.parent && slugs.length < 100;) {
    [next] = await getEntries([next.data.parent]);
    if (next) slugs.unshift(next.id);
  }
  const address = taxonomy.address.replace('{slug}', entry.id).replace('{path}', slugs.join('/'));
  const own = ownPage({ title: entry.data.name, description: entry.data.description, path: listPageAddress(address, number), search, siteTitle }, known);
  return { ...own, robots: number > 1 ? 'noindex' : '', schema: 'CollectionPage' };
}

// What a post's page says: the post's own values, else its type's templates
// rendered, at its public address, with its own image or its featured image,
// canonical to the address it names, if any. Its later page `number` of a
// list with pages is at its own address, canonical to itself, `noindex`.
async function postPage({ entry, type, path, number, search, site }, known, getEntries) {
  const terms = {};
  for (const field of type.fields.filter((found) => found.kind === 'terms' && found.taxonomy)) {
    const references = entry.data[field.name] ?? [];
    terms[field.taxonomy.name] = references.length === 0 ? [] : (await getEntries(references)).map((term) => term.data.name);
  }
  const values = templateValues({ ...known, post: { entry, type, terms } });
  const render = (template) => renderTemplate(template ?? '', values, search.separator);
  const templates = search.types?.[type.name] ?? {};
  const seo = entry.data.seo ?? {};
  const field = (kind) => entry.data[type.fields.find((found) => found.kind === kind)?.name];
  // What the teaser shows, in a type with a teaser, every built-in one among them, before
  // the templates.
  const teaser = followsParts(type);
  const shown = (rule) => (teaser ? rule(entry.data) : '');
  const titleTag = seo.title || shown((data) => searchTitleOf(data, known.settings?.title ?? '')) || render(templates.title) || entry.data.title;
  const metaDescription = seo.description || shown(searchDescriptionOf) || render(templates.description);
  const address = entryAddress(type, entry.id, site.languages);
  const later = number > 1;
  const schema = seo.schema ?? templates.schema ?? 'WebPage';
  return {
    title: titleTag,
    description: metaDescription,
    socialTitle: seo.socialTitle || shown(socialTitleOf) || render(templates.socialTitle) || titleTag,
    socialDescription: seo.socialDescription || shown(socialDescriptionOf) || render(templates.socialDescription) || metaDescription,
    path: address === null ? path : listPageAddress(address, number),
    canonical: !later && seo.canonical ? seo.canonical : null,
    robots: [(seo.noindex || later) && 'noindex', seo.nofollow && 'nofollow'].filter(Boolean).join(', '),
    schema,
    // Whether the post is an article, which its type says, whatever its structured data type.
    article: isArticle(type),
    headline: field('headline') || entry.data.title,
    published: field('date'),
    modified: field('modified'),
    image: seo.socialImage ? { src: seo.socialImage, alt: seo.socialImageAlt } : field('image') ?? null,
    authors: await articleAuthors(entry, type, site, getEntries),
  };
}

// The sharing image made of the image `chosen`, { src, alt }, `src` as Astro
// reads an image: SHARING_IMAGE's size, cropped to fill, as a JPEG on white,
// since a JPEG has no transparency, at its address on the public host.
async function sharingImage({ src, alt }, origin, getImage) {
  const made = await getImage({ src, ...SHARING_IMAGE, fit: 'cover', format: 'jpeg', background: '#ffffff' });
  return { src: new URL(made.src, origin).href, width: made.attributes.width, height: made.attributes.height, alt };
}

// The site's logo, `logo`, { src, alt }, as Astro reads an image, at its
// address on the public host, as Astro's image pipeline makes it, in its own
// size and kind: a picture as a WebP, a drawing as an SVG.
async function logoImage({ src, alt }, origin, getImage) {
  const made = await getImage({ src });
  return { src: new URL(made.src, origin).href, width: made.attributes.width, height: made.attributes.height, alt };
}

// A moment as Open Graph's datetime takes it, to the second in UTC, as the
// content files write it; nothing for none.
function moment(date) {
  return date instanceof Date ? date.toISOString().replace(/\.\d{3}Z$/, 'Z') : '';
}

// The Search and sharing settings at the core's defaults, for a site whose
// settings are not exported yet: each setting, named part and type's part
// with a default, but the site's title, which the site has not got either.
function searchDefaults(site) {
  const group = site.groups.find((found) => found.name === 'search');
  if (group === undefined) return {};
  const of = (settings) => Object.fromEntries(settings.filter((setting) => setting.default !== undefined && !isSiteTitle(setting.default)).map((setting) => [setting.name, setting.default]));
  return {
    ...of(group.settings),
    ...Object.fromEntries(group.parts.map((part) => [part.name, of(part.settings)])),
    types: Object.fromEntries((group.types ?? []).map((part) => [part.type, of(part.settings)])),
  };
}

// The values of the variables a template may name (metadata-templates.js),
// by name, each as text: the site's, from the settings entry's data
// `settings` (the site's title, and `search`, the Search and sharing
// settings), and, for a post, `post`, { entry, type, terms }, Astro's entry,
// its type as the site description declares it and the names of its terms by
// taxonomy, its own too. A value the post has not got is empty. `languageTag` is the
// language tag a date is written in, `now` the moment of the build, whose
// year is the current year.
export function templateValues({ settings = {}, post = null, languageTag, now = new Date() }) {
  const search = settings.search ?? {};
  const values = {
    'site.title': settings.title ?? '',
    'site.description': search.description ?? '',
    sep: search.separator ?? '',
    'current.year': String(now.getUTCFullYear()),
  };
  if (post === null) return values;
  const { entry, type, terms = {} } = post;
  const { data } = entry;
  const day = (date) => (date instanceof Date ? new Intl.DateTimeFormat(languageTag, { dateStyle: 'long', timeZone: 'UTC' }).format(date) : '');
  Object.assign(values, {
    'post.title': data.title ?? '',
    'post.auto_description': summary(entry),
    'post.excerpt': typeof data.excerpt === 'string' ? data.excerpt : '',
    'post.date': day(data.date),
    'post.modified_date': day(data.modified),
    // A label the site gives by language is the page's language's, as all a visitor reads is.
    'post_type.labels.singular': labelIn(type.label, languageTag),
  });
  for (const field of type.fields) {
    if (field.kind === 'meta') values[`post.custom_field.${field.name}`] = asKept(data[field.name]);
    if (field.kind === 'terms' && field.taxonomy) values[`post.tax.${field.taxonomy.name}`] = (terms[field.taxonomy.name] ?? []).join(', ');
  }
  return values;
}

// A field of the site's own in a metadata template: a text as it is, a number as its digits, a yes as 1
// and a no as nothing, and a day as YYYY-MM-DD.
function asKept(value) {
  if (value === undefined || value === null || value === false) return '';
  if (value === true) return '1';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}
