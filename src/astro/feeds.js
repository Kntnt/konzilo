// The site's RSS feeds: one for each post type that declares
// `feed` in the site description, at that address, and one for each term of
// a taxonomy that declares one, at its address with the term's slug for
// `{slug}`, for every term a published post carries. Each is RSS 2.0, which
// every build writes and Astro's dev server answers, and a preview, below a
// base of its own, has none.
//
// On a site in several languages each language has every feed of
// its own, below its prefix, `/sv/feed/` and `/sv/category/{slug}/feed/`:
// it holds that language's posts alone, at their addresses in it, its
// `<language>` is the language's tag, its link the language's start page,
// and its title and description come from the language's settings, the
// term's name in it. A feed's address without a prefix leads to the main
// language's with a 301 (redirects.js), so that subscribers from the site's
// one-language days keep getting it.
//
// A type's feed holds its newest posts, a term's the newest posts that
// carry the term of every type that takes the taxonomy and has a date and an
// address, newest first, as many as the Feeds settings give (the group
// `feeds` in the site settings, 10 by default). A post
// marked noindex stays in them: noindex is about search
// engines, and feeds are for people.
//
// The channel is the site's: its title, with ` – ` and the type's plural
// label when more than one type has a feed, or the term's name in a term's
// feed; the start page; the site's description from the Search and sharing
// settings; the site's language; the newest item's date as lastBuildDate,
// so that the same content gives the same bytes; and the feed's own address
// as atom:link. Each item has the post's title, its public address, its
// date, a guid that is no address, `<public host>/?p=<ID>`, where the content
// folder's .post-ids.json names the post, so that a renamed post is no new item, and a category per term. Its
// description is the featured image followed by the post's summary
// (summary.js), and, when the settings say the whole text, content:encoded
// is the featured image followed by the whole body. The featured image is
// made by Astro's image pipeline, 1200 pixels wide at most, as a JPEG on
// white, which every feed reader and mail program shows, with its alt text,
// and is media:content too.
//
// What an item holds of a body is feed-safe: every address absolute on the
// public host, links, images and srcset alike; an embed is a link to its
// address, without its panel or a script; the footnotes come at the end,
// their links absolute; and no script, style or template is left.
//
// The web server answers a feed at its address with and without its last
// slash. Astro writes a feed's file at its address without the slash, so a
// build moves each into a folder of that name as index.rss, which the web
// server takes as RSS (moveFeedFiles()).

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { htmlToHast } from 'satteri';
import { labelIn } from '../catalogues.js';
import { startFile } from '../format/start-page.js';
import { POST_IDS_FILE, postIdsByPath } from '../format/write.js';
import { contentFolder } from './collections.js';
import { entryAddress, entryLanguage, entryName, isStartEntry, pageLanguage, startAddress } from './languages.js';
import { summary } from './summary.js';

// What a feed is, as a link names it, and as its answer's Content-Type.
export const FEED_TYPE = 'application/rss+xml';
export const FEED_CONTENT_TYPE = `${FEED_TYPE}; charset=utf-8`;

// The file a build writes a feed as, in the folder of its address.
export const FEED_FILE = 'index.rss';

// The widest a feed's featured image is, in pixels.
export const FEED_IMAGE_WIDTH = 1200;

// The Feeds settings' choices of what each item holds.
export const SUMMARY = 'The summary';
export const WHOLE_TEXT = 'The whole text';

// The settings a site has before its settings are exported, the core's
// defaults.
const DEFAULTS = Object.freeze({ item: SUMMARY, posts: 10 });

// What goes between the site's title and the type's plural label or the
// term's name in a feed's title.
const SEPARATOR = ' – ';

// The site's feeds, from its site description as checked: each { address,
// route, type, language } for a type's, or { address, route, taxonomy,
// types, language } for a taxonomy's, `types` those whose posts its terms'
// feeds hold, `route` the pattern of Astro's route that answers it, as
// Astro gives it a route: `/feed`, `/category/[slug]/feed`, and `language`
// the language whose posts it holds, as the site description gives it, or
// null on a site that declares none. On a site in several languages each
// language has each feed, at its address after the language's prefix,
// `/sv/feed`, the languages in their order.
export function siteFeeds({ types, taxonomies, languages = [] }) {
  const route = (address) => address.replace('{slug}', '[slug]').replace(/\/$/, '');
  const listed = (taxonomy) => Object.values(types).filter((type) => type.address !== null && hasDate(type)
    && type.fields.some((field) => field.kind === 'terms' && field.taxonomy?.name === taxonomy.name));
  const declaring = (declared) => Object.values(declared ?? {}).filter((one) => typeof one?.feed === 'string');
  const declared = [
    ...declaring(types).map((type) => ({ address: type.feed, type })),
    ...declaring(taxonomies).map((taxonomy) => ({ address: taxonomy.feed, taxonomy, types: listed(taxonomy) })),
  ];
  const several = languages.length > 1;
  return (several ? languages : [languages[0] ?? null]).flatMap((language) => declared.map((feed) => {
    const address = several ? `/${language.prefix}${feed.address}` : feed.address;
    return { ...feed, address, route: route(address), language };
  }));
}

// The feed a route answers, by its pattern as Astro gives it, or undefined.
export function feedOfRoute(site, pattern) {
  const trimmed = pattern.replace(/\/$/, '');
  return siteFeeds(site).find((feed) => feed.route === trimmed);
}

// The Feeds settings as the site settings hold them, `settings` the settings
// entry's data, undefined while the site has none: the core's defaults for
// what they do not hold.
export function feedSettings(settings) {
  return { ...DEFAULTS, ...settings?.feeds };
}

// The title of a type's feed, among the site's in its language, or of the
// feed of a term named `term`, with the site's title `title`. A type's plural
// given by language is the feed's language's.
export function feedTitle(site, feed, { title = '', term = null } = {}) {
  if (feed.taxonomy) return [title, term].filter(Boolean).join(SEPARATOR);
  const several = siteFeeds(site).filter((each) => each.type && each.language === feed.language).length > 1;
  return [title, several ? labelIn(feed.type.plural, feed.language?.locale ?? site.language) : ''].filter(Boolean).join(SEPARATOR);
}

// The alternates every page's head links (search-and-sharing.js): each
// type's feed in the language of the page at `path`, its path from the
// site's root, with its title, on the public host `origin`, and on a term's
// page, `entry` the term's entry, the term's feed, where its
// taxonomy declares one, first. `settings` are those of the page's
// language.
export function feedAlternates({ entry = null, site, origin, settings, path = '/' }) {
  const language = pageLanguage(path, site.languages ?? []);
  const feeds = siteFeeds(site).filter((feed) => feed.language === language);
  const own = feeds.filter((feed) => feed.taxonomy && feed.taxonomy.address != null && feed.taxonomy.collection === entry?.collection);
  return [
    ...own.map((feed) => ({ type: FEED_TYPE, href: `${origin}${feed.address.replace('{slug}', entryName(entry.id, site.languages ?? []))}`, title: feedTitle(site, feed, { title: settings?.title, term: entry.data.name }) })),
    ...feeds.filter((feed) => feed.type)
      .map((feed) => ({ type: FEED_TYPE, href: `${origin}${feed.address}`, title: feedTitle(site, feed, { title: settings?.title }) })),
  ];
}

// The terms whose feeds a build writes, those a published post of the
// types the taxonomy's feeds hold, in the feed's language, carries, by
// their slugs, sorted, as Astro's getCollection gives each collection's
// entries; `languages` are the site's.
export async function feedTerms(feed, getCollection, languages = []) {
  const slugs = new Set();
  for (const type of feed.types) {
    const field = termsField(type, feed.taxonomy);
    for (const entry of await inLanguage(getCollection(type.collection), feed.language, languages)) {
      for (const term of entry.data[field.name] ?? []) slugs.add(entryName(term.id, languages));
    }
  }
  return [...slugs].sort();
}

// The entries of a collection in `language`, on a site in several
// languages, or every one on any other.
async function inLanguage(entries, language, languages) {
  const all = await entries;
  return languages.length > 1 ? all.filter((entry) => entryLanguage(entry.id, languages) === language) : all;
}

// The feed at a route's pattern, `slug` its term's slug for a taxonomy's, as
// RSS 2.0, or null for a term no published post in the feed's language
// carries. `site`: the site description as checked; `origin`, `languageTag`: the
// public site (public-site.js), `languageTag` the language tag of a site in one
// language; `settings`: the settings entry's data, the feed's language's.
// Astro's `getCollection`, `getEntries`, `getEntry` and `getImage`, and
// `bodyOf`, which gives an entry's body as the site renders it, HTML.
export async function siteFeed({ site, pattern, slug = null, origin, languageTag, settings }, { getCollection, getEntries, getEntry, getImage, bodyOf }) {
  const feed = feedOfRoute(site, pattern);
  if (feed === undefined) throw new Error(`Konzilo: no feed of the site description answers ${pattern}`);
  const { item, posts: count } = feedSettings(settings);
  const several = site.languages.length > 1;
  let types = [feed.type];
  let address = feed.address;
  let term = null;
  // A term's entry, in the feed's language's folder on a site in several.
  const termId = slug !== null && several ? `${feed.language.tag}/${slug}` : slug;
  if (feed.taxonomy) {
    const entry = await getEntry(feed.taxonomy.collection, termId);
    if (!entry) return null;
    term = entry.data.name;
    types = feed.types;
    address = feed.address.replace('{slug}', slug);
  }
  const posts = [];
  for (const type of types) {
    const date = type.fields.find((field) => field.kind === 'date').name;
    const field = feed.taxonomy ? termsField(type, feed.taxonomy) : null;
    for (const entry of await inLanguage(getCollection(type.collection), feed.language, site.languages)) {
      if (field && !(entry.data[field.name] ?? []).some((reference) => reference.id === termId)) continue;
      posts.push({ entry, type, date: entry.data[date] });
    }
  }
  if (feed.taxonomy && posts.length === 0) return null;
  posts.sort((a, b) => b.date - a.date || byText(`${a.type.collection}/${a.entry.id}`, `${b.type.collection}/${b.entry.id}`));
  const ids = postIds();
  const items = [];
  for (const { entry, type, date } of posts.slice(0, count)) {
    // At its address in its language on a site in several.
    const link = new URL(entryAddress(type, entry.id, site.languages), origin).href;
    const image = await featuredImage(entry, type, origin, getImage);
    // The ledger knows a post by its file, the start page an Admin chose by its own.
    const id = ids[isStartEntry(entry.id) ? startFile(type) : `${type.collection}/${entry.id}.md`];
    const said = summary(entry);
    const opening = image ? `<p>${imageTag(image)}</p>` : '';
    items.push({
      title: entry.data.title,
      link,
      date,
      guid: typeof id === 'string' ? { text: `${origin}/?p=${id}`, permalink: false } : { text: link, permalink: true },
      categories: await categoriesOf(entry, type, getEntries),
      description: `${opening}${said ? `<p>${html(said)}</p>` : ''}`,
      content: item === WHOLE_TEXT ? `${opening}${feedSafe(await bodyOf(entry), link)}` : null,
      image,
    });
  }
  return rssDocument({
    title: feedTitle(site, feed, { title: settings?.title, term }),
    link: `${origin}${startAddress(feed.language, site.languages)}`,
    description: settings?.search?.description ?? '',
    language: several ? feed.language.tag : languageTag,
    self: `${origin}${address}`,
  }, items);
}

// A feed's document, RSS 2.0, from its channel { title, link, description,
// language, self } and its items, each { title, link, date, guid: { text,
// permalink }, categories, description, content, image }, `content` null in
// summary mode and `image` { src, width, height, type } or null.
export function rssDocument(channel, items) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">',
    '  <channel>',
    `    <title>${xml(channel.title)}</title>`,
    `    <link>${xml(channel.link)}</link>`,
    `    <description>${xml(channel.description)}</description>`,
    `    <language>${xml(channel.language)}</language>`,
    ...(items.length > 0 ? [`    <lastBuildDate>${rfc822(items[0].date)}</lastBuildDate>`] : []),
    `    <atom:link href="${xml(channel.self)}" rel="self" type="${FEED_TYPE}"/>`,
  ];
  for (const one of items) {
    lines.push(
      '    <item>',
      `      <title>${xml(one.title)}</title>`,
      `      <link>${xml(one.link)}</link>`,
      `      <pubDate>${rfc822(one.date)}</pubDate>`,
      `      <guid isPermaLink="${one.guid.permalink}">${xml(one.guid.text)}</guid>`,
      ...one.categories.map((name) => `      <category>${xml(name)}</category>`),
      `      <description>${cdata(one.description)}</description>`,
      ...(one.content === null ? [] : [`      <content:encoded>${cdata(one.content)}</content:encoded>`]),
      ...(one.image ? [`      <media:content url="${xml(one.image.src)}" medium="image" type="${one.image.type}" width="${one.image.width}" height="${one.image.height}"/>`] : []),
      '    </item>',
    );
  }
  lines.push('  </channel>', '</rss>', '');
  return lines.join('\n');
}

// A body's HTML as the site renders it, made feed-safe for the page at the
// absolute address `page`: every address absolute, an embed's panel a link
// to its address, a directive's plain rendering its body alone, and no
// script, style, template or frame, nor a style or an event handler on an
// element.
export function feedSafe(body, page) {
  const tree = htmlToHast(body, { fragment: true });
  return tree.children.flatMap((node) => safe(node, page)).map(serialize).join('');
}

// The elements whose content a feed never holds.
const LEFT_OUT = new Set(['script', 'style', 'template', 'iframe', 'noscript', 'object', 'embed', 'link', 'meta']);

// The properties that hold an address.
const ADDRESSES = ['href', 'src', 'cite', 'poster'];

function safe(node, page) {
  if (node.type === 'text') return [node];
  if (node.type !== 'element' || LEFT_OUT.has(node.tagName)) return [];
  const { properties } = node;
  // An embed's panel (embeds.js): the link to the content's address.
  if (node.tagName === 'figure' && properties.dataEmbed !== undefined) {
    const link = node.children.find((child) => child.type === 'element' && child.tagName === 'a');
    if (!link) return [];
    const address = absolute(link.properties.href, page);
    return [element('p', {}, [element('a', { href: address }, [{ type: 'text', value: address }])])];
  }
  const children = node.children.flatMap((child) => safe(child, page));
  // A directive's plain rendering (directives.js) is its body, which a post
  // list has none of.
  if (properties.dataDirective !== undefined) return children;
  const kept = {};
  for (const [name, value] of Object.entries(properties)) {
    if (name === 'style' || /^on[A-Z]/.test(name)) continue;
    if (ADDRESSES.includes(name) && typeof value === 'string') kept[name] = absolute(value, page);
    else if (name === 'srcSet' && typeof value === 'string') kept[name] = value.split(',').map((candidate) => candidate.trim().replace(/^\S+/, (address) => absolute(address, page))).join(', ');
    else kept[name] = value;
  }
  return [element(node.tagName, kept, children)];
}

function element(tagName, properties, children) {
  return { type: 'element', tagName, properties, children };
}

// An address absolute on the public host, from the page `page` it is on;
// one with a scheme of its own stays as it is.
function absolute(address, page) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(address)) return address;
  try {
    return new URL(address, page).href;
  } catch {
    return address;
  }
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

// A node of an HTML tree as HTML.
function serialize(node) {
  if (node.type === 'text') return html(node.value);
  const attributes = Object.entries(node.properties).flatMap(([name, value]) => {
    if (value === false || value === null || value === undefined) return [];
    const attribute = attributeName(name);
    if (value === true) return [` ${attribute}`];
    return [` ${attribute}="${html(Array.isArray(value) ? value.join(' ') : String(value), true)}"`];
  }).join('');
  const open = `<${node.tagName}${attributes}>`;
  return VOID.has(node.tagName) ? open : `${open}${node.children.map(serialize).join('')}</${node.tagName}>`;
}

// An HTML attribute's name, from the name of its property in an HTML tree.
function attributeName(property) {
  const named = { className: 'class', htmlFor: 'for', acceptCharset: 'accept-charset', httpEquiv: 'http-equiv' };
  if (Object.hasOwn(named, property)) return named[property];
  if (/^data[A-Z]/.test(property)) return `data-${property.slice(4).replace(/[A-Z]/g, (capital) => `-${capital.toLowerCase()}`).replace(/^-/, '')}`;
  if (/^aria[A-Z]/.test(property)) return `aria-${property.slice(4).toLowerCase()}`;
  return property.toLowerCase();
}

// The post IDs the content folder's .post-ids.json names, by the path of
// each content file in it, or none without it.
function postIds() {
  const file = resolve(contentFolder(), POST_IDS_FILE);
  if (!existsSync(file)) return {};
  try {
    return postIdsByPath(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return {};
  }
}

// An entry's featured image as a feed shows it, { src, alt, width, height,
// type }, its address absolute on the public host, or null for a post
// without one.
async function featuredImage(entry, type, origin, getImage) {
  const field = type.fields.find((found) => found.kind === 'image');
  const image = field ? entry.data[field.name] : undefined;
  if (!image) return null;
  const width = image.src.format === 'svg' ? FEED_IMAGE_WIDTH : Math.min(FEED_IMAGE_WIDTH, image.src.width);
  const made = await getImage({ src: image.src, width, format: 'jpeg', background: '#ffffff' });
  return { src: new URL(made.src, origin).href, alt: image.alt, width: made.attributes.width, height: made.attributes.height, type: 'image/jpeg' };
}

function imageTag({ src, alt, width, height }) {
  return `<img src="${html(src, true)}" alt="${html(alt, true)}" width="${width}" height="${height}">`;
}

// The names of a post's terms, of each taxonomy its type's fields hold in
// the order they are declared, each in the order the post has them.
async function categoriesOf(entry, type, getEntries) {
  const names = [];
  for (const field of type.fields.filter((found) => found.kind === 'terms' && found.taxonomy)) {
    const references = entry.data[field.name] ?? [];
    if (references.length > 0) names.push(...(await getEntries(references)).map((term) => term.data.name));
  }
  return names;
}

function termsField(type, taxonomy) {
  return type.fields.find((field) => field.kind === 'terms' && field.taxonomy?.name === taxonomy.name);
}

function hasDate(type) {
  return type.fields.some((field) => field.kind === 'date');
}

// Each feed a build wrote into its output folder `dir` (a path) at its
// address without the last slash, as Astro writes an endpoint, moved into a
// folder of that name as FEED_FILE, which the web server answers at the
// address with and without the slash.
export function moveFeedFiles(dir, site) {
  for (const feed of siteFeeds(site)) {
    for (const file of filesAt(dir, feed.address.slice(1, -1).split('/'))) {
      const moving = `${file}.moving`;
      renameSync(file, moving);
      mkdirSync(file);
      renameSync(moving, join(file, FEED_FILE));
    }
  }
}

// The files in `dir` at a feed's segments, `{slug}` any folder.
function filesAt(dir, [segment, ...rest]) {
  const found = segment === '{slug}' ? (existsSync(dir) ? readdirSync(dir) : []) : [segment];
  return found.flatMap((name) => {
    const path = join(dir, name);
    if (!existsSync(path)) return [];
    const stats = statSync(path);
    if (rest.length === 0) return stats.isFile() ? [path] : [];
    return stats.isDirectory() ? filesAt(path, rest) : [];
  });
}

// A moment as RSS 2.0 takes it (RFC 822), in UTC.
function rfc822(date) {
  return date.toUTCString().replace(/GMT$/, '+0000');
}

function byText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function xml(text) {
  return String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// HTML in a CDATA section, whose end no text may hold.
function cdata(text) {
  return `<![CDATA[${text.replaceAll(']]>', ']]]]><![CDATA[>')}]]>`;
}

// Text as HTML, in an attribute's quotes too.
function html(text, quoted = false) {
  const escaped = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return quoted ? escaped.replaceAll('"', '&quot;') : escaped;
}
