// Published content as source files, as an editor's saves would leave them: a post or a
// term under its collection's folder, named by an ID, with references by ID (ADR 0026), an
// image by its place in the media folder, and only the settings that differ from a
// default. The published demo content is the fiction's one record, and this reads it, so
// that the two cannot tell different stories, and a local copy's Forgejo starts with it.
// An ID comes from the file's place, so that seeding twice gives the same files.

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { isObject } from './checks.js';
import { publicAddress } from './format/addresses.js';
import { pageTypeOf } from './format/built-in-types.js';
import { IMAGE_LIBRARY_FOLDER } from './format/masters.js';
import { START_ENTRY, START_PAGE, startFile } from './format/start-page.js';
import { isSiteTitle } from './settings-groups.js';
import { SEO_PARTS } from './site-description.js';

// Twelve hexadecimal digits, the shape of Sveltia's {{uuid_short}}.
export const idOf = (collection, place) => createHash('sha256').update(`${collection}/${place}`).digest('hex').slice(0, 12);

const walk = (folder) => readdirSync(folder).flatMap((name) => {
  if (name.startsWith('.')) return [];
  const path = join(folder, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

// The frontmatter of a content file has one key per line, each value JSON or a date.
function parsePost(text) {
  const [, head, body] = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  const fields = {};
  for (const line of head.split('\n')) {
    const [, key, value] = /^([A-Za-z]+): (.*)$/.exec(line);
    try {
      fields[key] = JSON.parse(value);
    } catch {
      fields[key] = value;
    }
  }
  return { fields, body };
}

const scalar = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) ? value : JSON.stringify(value));

const writePost = (fields, body) => `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${scalar(value)}`).join('\n')}\n---\n${body}`;

const toMedia = (image) => {
  if (!image || typeof image !== 'object') return image;
  return { ...image, src: `/media/${image.src.split('/').at(-1)}` };
};

const mediaPath = (src) => `/media/${src.split('/').at(-1)}`;

// A post's place on a site: { collection, tag, language, place, address, id, title }. The
// start page an Admin chose, at the content folder's root, has no place of its own: `start`,
// and an ID no other post's can be.
function postsOf(description, published) {
  const several = description.languages.length > 1;
  const posts = [];
  for (const type of Object.values(description.types)) {
    const start = several || type.address === null ? undefined : published.find(({ path }) => path === startFile(type));
    if (start) {
      const { fields, body } = parsePost(start.content);
      posts.push({ type, tag: null, language: description.languages[0] ?? null, place: null, fields, body, id: idOf(type.collection, START_ENTRY), address: null, start: true });
    }
    for (const { path, content } of published) {
      if (!path.startsWith(`${type.collection}/`) || !path.endsWith('.md')) continue;
      const within = path.slice(type.collection.length + 1, -'.md'.length);
      const tag = several ? within.split('/')[0] : null;
      const language = several ? description.languages.find((one) => one.tag === tag) : description.languages[0] ?? null;
      const place = several ? within.slice(tag.length + 1) : within;
      const { fields, body } = parsePost(content);
      posts.push({ type, tag, language, place, fields, body, id: idOf(type.collection, place), address: type.address === null ? null : publicAddress(type, place, language) });
    }
  }
  return posts;
}

// Body links that lead to a post by its address, as references by its ID, and images by
// their place in the media folder, as the editing tool stores them. It reads the text
// alone, so a code block that shows such a link would change too; the demo's show none.
function bodyAsSource(body, ids) {
  return body
    .replace(/(!\[[^\]\n]*\]\()(?:\.\.\/)*media\/([^)\s]+)\)/g, (_, open, name) => `${open}/media/${name})`)
    .replace(/(?<!!)(\]\()(\/[^)\s#]*)(#[^)\s]*)?\)/g, (whole, open, address, fragment = '') => (ids.has(address) ? `${open}konzilo:${ids.get(address)}${fragment})` : whole))
    .replace(/(<a href=")(\/[^"#]*)(#[^"]*)?"/g, (whole, open, address, fragment = '') => (ids.has(address) ? `${open}konzilo:${ids.get(address)}${fragment}"` : whole));
}

// Published content as source files. `published`: each { path, content }, as the content
// folder holds them.
export function sourceFrom(description, published) {
  const files = [];
  const several = description.languages.length > 1;
  const posts = postsOf(description, published);
  const ids = new Map(posts.filter((post) => post.address).map((post) => [post.address, post.id]));
  const titled = new Map(posts.filter((post) => post.address).map((post) => [post.address, post]));
  const fieldsTaking = new Map();
  for (const type of Object.values(description.types)) {
    for (const field of type.fields) {
      if (field.kind === 'terms') fieldsTaking.set(field.name, field.taxonomy.collection);
    }
  }

  for (const taxonomy of Object.values(description.taxonomies)) {
    for (const { path, content } of published) {
      if (!path.startsWith(`${taxonomy.collection}/`) || !path.endsWith('.json')) continue;
      const within = path.slice(taxonomy.collection.length + 1, -'.json'.length);
      const tag = several ? within.split('/')[0] : null;
      const slug = several ? within.slice(tag.length + 1) : within;
      const term = JSON.parse(content);
      const { parent, ...rest } = term;
      const written = {
        ...rest,
        slug,
        ...(parent ? { parent: idOf(taxonomy.collection, parent.split('/').at(-1)) } : {}),
      };
      files.push({ path: `${taxonomy.collection}/${tag ? `${tag}/` : ''}${idOf(taxonomy.collection, slug)}.json`, content: `${JSON.stringify(written, null, 2)}\n` });
    }
  }

  // A content file holds these in one flat map, and a source file in the three groups an
  // editor sees, each a key of its own, the sharing image with its alt text.
  const seoInParts = (flat) => Object.fromEntries(Object.entries(SEO_PARTS).flatMap(([part, keys]) => {
    const inPart = Object.fromEntries(Object.entries(keys).filter(([, as]) => Object.hasOwn(flat, as)).map(([key, as]) => [key, as === 'socialImage' ? { src: mediaPath(flat.socialImage), alt: flat.socialImageAlt } : flat[as]]));
    return Object.keys(inPart).length === 0 ? [] : [[part, inPart]];
  }));

  for (const post of posts) {
    const { type, tag, place, fields, body, id } = post;
    const { modified: _modified, oldAddresses: _old, ...kept } = fields;
    // The start page's slug is made from its title, as a new post's is.
    const segments = post.start ? [] : place.split('/');
    const written = post.start ? { title: kept.title, status: 'published' } : { title: kept.title, slug: segments.at(-1), status: 'published' };
    if (segments.length > 1) written.parent = idOf(type.collection, segments.slice(0, -1).join('/'));
    for (const [key, value] of Object.entries(kept)) {
      if (key === 'title') continue;
      if (fieldsTaking.has(key)) written[key] = value.map((term) => idOf(fieldsTaking.get(key), term.split('/').at(-1)));
      else if (key === 'image') written.image = toMedia(value);
      else if (key === 'teaser') written.teaser = value.image ? { ...value, image: toMedia(value.image) } : value;
      else if (key === 'seo') Object.assign(written, seoInParts(value));
      else written[key] = value;
    }
    files.push({ path: `${type.collection}/${tag ? `${tag}/` : ''}${id}.md`, content: writePost(written, bodyAsSource(body, ids)) });
  }

  for (const { path, content } of published) {
    if (path.startsWith('media/')) files.push({ path, content });
  }

  // The image library starts with what the posts show, each picture once, with the words its first
  // post has for it.
  const inLibrary = new Set();
  for (const { fields: { image } } of posts) {
    const hash = /-([0-9a-f]{10})\.[a-z]+$/.exec(image?.src ?? '')?.[1];
    if (!hash || inLibrary.has(hash)) continue;
    inLibrary.add(hash);
    const { src, alt } = toMedia(image);
    files.push({ path: `${IMAGE_LIBRARY_FOLDER}/${idOf(IMAGE_LIBRARY_FOLDER, hash)}.json`, content: `${JSON.stringify({ src, alt }, null, 2)}\n` });
  }

  // The page for addresses not found is a post an Admin chooses, of a type with an address.
  const notFound = published.find(({ path }) => path === 'not-found.md');
  const notFoundId = notFound ? notFoundPost(description, notFound, ids, files) : null;

  // The start page an Admin chose is the post at the content folder's root.
  const startId = posts.find((post) => post.start)?.id ?? null;

  // What an Admin sets: a choice of a post by its ID, an image by its place in the media
  // folder, and only what differs from a default.
  const settings = published.find(({ path }) => path === 'settings.json');
  if (settings || notFoundId || startId) {
    const source = settingsAsSource(description, settings ? JSON.parse(settings.content) : {}, titled);
    if (startId) source[START_PAGE] = { page: startId };
    if (notFoundId) source.notFound = { page: notFoundId };
    files.push({ path: 'settings.json', content: `${JSON.stringify(source, null, 2)}\n` });
  }
  const rules = published.find(({ path }) => path === 'redirects.json');
  if (rules) files.push({ path: 'redirects.json', content: rules.content });
  for (const { path, content } of published) {
    if (!path.startsWith('menus/') || !path.endsWith('.json')) continue;
    const menu = JSON.parse(content);
    files.push({ path, content: `${JSON.stringify({ items: entriesAsSource(menu.items, ids, titled) }, null, 2)}\n` });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return files;
}

function notFoundPost(description, { content }, ids, files) {
  const type = pageTypeOf(description.types);
  const { fields, body } = parsePost(content);
  const id = idOf(type.collection, 'not-found');
  files.push({ path: `${type.collection}/${id}.md`, content: writePost({ title: fields.title, slug: 'not-found', status: 'published' }, bodyAsSource(body, ids)) });
  return id;
}

// A menu's entries by their posts' IDs, with a label only where it differs from the
// post's title, and a description where the entry has one.
function entriesAsSource(items, ids, titled) {
  return items.map(({ title, url, description, items: under }) => {
    const id = ids.get(url);
    const lead = id
      ? { ...(titled.get(url).fields.title === title ? {} : { title }), post: id }
      : { title, ...(url === undefined ? {} : { url }) };
    return { ...lead, ...(description === undefined ? {} : { description }), ...(under ? { items: entriesAsSource(under, ids, titled) } : {}) };
  });
}

function differs(setting, value, title) {
  if (setting.default === undefined) return true;
  return JSON.stringify(isSiteTitle(setting.default) ? title : setting.default) !== JSON.stringify(value);
}

// A setting's value as source holds it, or undefined for what a default gives.
function settingAsSource(setting, value, title, titled) {
  if (value === undefined) return undefined;
  if (setting.type === 'post') return titled.get(value.url)?.id;
  if (setting.type === 'image') return { ...value, src: mediaPath(value.src) };
  return differs(setting, value, title) ? value : undefined;
}

// Settings as source holds them: what differs from a default, each part kept only when
// anything in it does.
function settingsAsSource(description, published, titled) {
  const out = {};
  const { title, logo, icon } = published;
  if (title !== undefined) out.title = title;
  if (logo) out.logo = toMedia(logo);
  if (icon) out.icon = toMedia(icon);
  const copy = (settings, values, into) => {
    for (const setting of settings) {
      const kept = settingAsSource(setting, values?.[setting.name], title, titled);
      if (kept !== undefined) into[setting.name] = kept;
    }
  };
  copy(description.settings, published, out);
  for (const group of description.groups) {
    const values = published[group.name];
    if (!isObject(values)) continue;
    const into = {};
    copy(group.settings, values, into);
    const part = (name, settings, source, target) => {
      const inner = {};
      copy(settings, source, inner);
      if (Object.keys(inner).length > 0) target[name] = inner;
    };
    for (const one of group.parts) part(one.name, one.settings, values[one.name], into);
    for (const one of group.each ?? []) part(one.name, one.settings, values[one.name], into);
    if (group.types !== null) {
      const types = {};
      for (const one of group.types) part(one.type, one.settings, values.types?.[one.type], types);
      if (Object.keys(types).length > 0) into.types = types;
    }
    if (Object.keys(into).length > 0) out[group.name] = into;
  }
  return out;
}

/**
 * @param {object} description the form siteDescription() returns
 * @param {string} demo the folder of published demo content
 * @returns {{ path: string, content: string|Buffer }[]} every source file, sorted by path
 */
export function demoSource(description, demo) {
  const published = [];
  for (const path of walk(demo)) {
    const inner = relative(demo, path);
    published.push({ path: inner, content: inner.startsWith('media/') ? readFileSync(path) : readFileSync(path, 'utf8') });
  }
  return sourceFrom(description, published);
}

// Originals live in Git LFS (ADR 0026).
export const GIT_ATTRIBUTES = 'media/** filter=lfs diff=lfs merge=lfs -text\n';
