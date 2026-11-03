// The content collections of a site, made from its site description: one per
// post type, read from the Markdown files the intake writes into
// content/<collection>/, one per taxonomy, read from its terms' JSON files,
// on a site in several languages each from its language's folder,
// content/<collection>/<tag>/,
// `menus`, one entry per menu from content/menus/<menu>.json,
// `settings`, whose one entry, `site`, is the site settings from
// content/settings.json: the site's identity, its title, logo and
// icon, its own settings, and each of Konzilo's own settings
// groups that applies to the site under its name. On a site in
// several languages, `menus` has an entry `<tag>/<menu>` per
// language and menu, from content/menus/<tag>/<menu>.json, and `settings`
// an entry per language by its tag, from content/settings/<tag>.json; the
// site template reads those of the page's language (site-settings.js).
// `consent`, whose one entry, `registry`, is the service registry from
// content/consent.json; and `notFound`, whose entry `page` is the
// 404 page an Admin chose, its title and body, from content/not-found.md,
// and which is empty where none serves; on a site in several
// languages, its translation in each other language is an entry by the
// language's tag, from content/not-found/<tag>.md.
// Each schema is strict and types every value as its field or setting
// declares, so a template never meets content it does not expect.
//
// A post type's schema, and the settings', is a function, as Astro takes it
// when a schema needs its image() helper: an image's address, next to the
// content file in content/media/, becomes an image Astro's <Image> and
// <Picture> take.
//
// A preview build (preview.js) reads the preview's own content files instead,
// from the folder KONZILO_CONTENT names.

import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { defineCollection } from 'astro/content/config';
import { createReference } from 'astro/content/runtime';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { CATEGORIES, CONSENT_FILE, CONSENT_GROUP, HOST_KINDS, LIFETIME, SAFEGUARDS, STORAGE_KINDS } from '../format/consent.js';
import { NOT_FOUND, NOT_FOUND_FILE, NOT_FOUND_FOLDER } from '../format/not-found.js';
import { isSource, OTHER_ANSWERS } from '../format/redirects.js';
import { isSiteTitle, TYPES } from '../settings-groups.js';
import { declaredNames, DEPARTURES, IMAGE, OLD_ADDRESSES, OTHER_ADDRESSES, POST, readSiteDescription, SCHEMA_TYPES, SITE_DESCRIPTION_FILE, siteDescription, TRANSLATION_KEY } from '../site-description.js';
import { SETTINGS_ENTRY } from './languages.js';

// The same function as `reference` from astro:content, which only Astro's own
// modules can import.
const reference = createReference();

// `site`: the site description as declared; by default the site's own,
// site-description.json at the root of the site repository. `groups`:
// Konzilo's own settings groups, as settingsGroups() reads them; by default
// the core's own.
export function collections(site, { groups } = {}) {
  const read = site === undefined
    ? readSiteDescription(resolve(SITE_DESCRIPTION_FILE), groups)
    : siteDescription(site, groups);
  const { types, taxonomies, menus, settings, groups: applied, languages } = read;
  // What a body's directives name of the site description, its forms, which
  // the site's reader checks as it renders a body: a body is rendered
  // again when it changes.
  const forms = declaredNames(read);
  // On a site in several languages, each language's posts, terms, menus and
  // settings are in a folder or a file of its own.
  const tags = languages.length > 1 ? languages.map((language) => language.tag) : null;
  const inFolders = (pattern) => (tags === null ? pattern : `${alternatives(tags)}/${pattern}`);
  return Object.fromEntries([
    ...Object.values(types).map((type) => [
      type.collection,
      defineCollection({ loader: loader(files(type, inFolders(type.hierarchical ? '**/*.md' : '*.md')), { type, tags, forms }), schema: ({ image }) => z.strictObject(postSchema(type, image)) }),
    ]),
    ...Object.values(taxonomies).map((taxonomy) => [
      taxonomy.collection,
      defineCollection({ loader: loader(files(taxonomy, inFolders('*.json')), { taxonomy, tags }), schema: termSchema(taxonomy) }),
    ]),
    ...(Object.keys(menus).length === 0 ? [] : [[
      'menus',
      defineCollection({
        loader: loader({ pattern: menuFiles(menus, tags), base: `${contentFolder()}/menus`, generateId: ({ entry }) => entry.replace(/\.json$/, '') }, { menus, tags }),
        schema: z.strictObject({ items: z.array(menuEntry) }),
      }),
    ]]),
    // Every site has an identity, so every site has the settings. The 404
    // page's group is the collection notFound instead.
    ['settings', defineCollection({
      loader: loader(tags === null
        ? { pattern: 'settings.json', base: contentFolder(), generateId: () => SETTINGS_ENTRY }
        : { pattern: `${alternatives(tags)}.json`, base: `${contentFolder()}/settings`, generateId: ({ entry }) => entry.replace(/\.json$/, '') }, { settings, groups: applied, tags }),
      schema: ({ image }) => z.strictObject({
        ...identitySchema(image),
        ...settingsSchema(settings, image),
        ...Object.fromEntries(applied.filter((group) => group.name !== NOT_FOUND).map((group) => [group.name, groupSchema(group, image)])),
      }),
    })],
    // Every site has a 404 page, the template's own where none is chosen,
    // and on a site in several languages each language its own.
    [NOT_FOUND, defineCollection({
      loader: loader(tags === null
        ? { pattern: NOT_FOUND_FILE, base: contentFolder(), generateId: () => 'page' }
        : { pattern: [NOT_FOUND_FILE, `${NOT_FOUND_FOLDER}/${alternatives(tags)}.md`], base: contentFolder(), generateId: ({ entry }) => (entry === NOT_FOUND_FILE ? 'page' : entry.slice(NOT_FOUND_FOLDER.length + 1, -'.md'.length)) }, { notFound: NOT_FOUND_FILE, tags, forms }),
      schema: z.strictObject({ title: z.string() }),
    })],
    ...(!applied.some((group) => group.name === CONSENT_GROUP) ? [] : [[
      'consent',
      defineCollection({
        loader: loader({ pattern: CONSENT_FILE, base: contentFolder(), generateId: () => 'registry' }, { consent: CONSENT_GROUP }),
        schema: registrySchema,
      }),
    ]]),
  ]);
}

// The service registry (format/consent.js): the revision and the day it
// last changed, the categories with their services, each service's facts in
// the site's language, the departures and the consent texts.
const text = z.string().min(1);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((value) => new Date(`${value}T00:00:00Z`));
const country = z.string().regex(/^[A-Z]{2}$/);
const registrySchema = z.strictObject({
  revision: z.string().regex(/^[0-9a-f]{16}$/),
  revised: day,
  categories: z.array(z.strictObject({ id: z.enum(CATEGORIES), name: text, description: text, services: z.array(z.string()).min(1) })),
  services: z.array(z.strictObject({
    id: z.string(),
    name: text,
    category: z.enum(CATEGORIES),
    provider: z.strictObject({ name: text, country, privacyPolicy: z.url({ protocol: /^https$/ }) }).nullable(),
    purpose: text,
    storage: z.array(z.strictObject({ name: text, kind: z.enum(STORAGE_KINDS), lifetime: z.string().regex(LIFETIME), party: z.enum(['first', 'third']) })),
    hosts: z.strictObject(Object.fromEntries(HOST_KINDS.map((kind) => [kind, z.array(z.string())]))),
    transfers: z.array(z.strictObject({ country: country.nullable(), safeguards: z.array(z.enum(SAFEGUARDS)) })),
    necessity: text.nullable(),
  })),
  departures: z.array(z.strictObject({ departure: z.enum(Object.keys(DEPARTURES)), service: z.string().optional(), reason: text })),
  texts: z.strictObject({
    banner: z.strictObject({ title: text, text, accept: text, reject: text, customise: text }),
    dialog: z.strictObject({ title: text, introduction: text, accept: text, reject: text, save: text, close: text }),
    footer: z.strictObject({ change: text, withdraw: text }),
    placeholder: z.strictObject({ question: text, button: text }),
  }),
});

// A term: its name, its description when it has one, and, in a hierarchical
// taxonomy, its parent, a term of the same collection.
function termSchema({ collection, hierarchical }) {
  return z.strictObject({
    name: z.string(),
    description: z.string().min(1).optional(),
    ...(hierarchical ? { parent: reference(collection).optional() } : {}),
  });
}

// The files of a type's or a taxonomy's collection, each entry's id its file
// name: the intake names a post's file by its slug and a term's by its
// slug, and a post of a hierarchical type's by its path, in folders, so its
// id is the path, `about-us/team`. On a site in several
// languages each file is in its language's folder, so its id begins with
// the language's tag, `sv-SE/om-oss`.
function files(declared, pattern) {
  return { pattern, base: `${contentFolder()}/${declared.collection}`, generateId: ({ entry }) => entry.replace(/\.(md|json)$/, '') };
}

// The content folder the collections read: content/ in the site repository,
// or, in a preview build, the preview's own, which KONZILO_CONTENT names.
export function contentFolder() {
  return process.env.KONZILO_CONTENT || './content';
}

// The frontmatter of a post: its title, then each declared field, the key of
// its translation set on a site in several languages when it has a
// translation, and in a type with an address the post's old
// addresses, any addresses on the site it was live at, and its other
// addresses, each with its answer, a redirect's status or `show`,
// when it has any. `image` is
// Astro's helper for an image's address.
function postSchema(type, image) {
  const old = z.array(z.string().refine(isSource, 'not an address on the site')).optional();
  const other = z.array(z.strictObject({
    address: z.string().refine(isSource, 'not an address on the site'),
    answer: z.union(OTHER_ANSWERS.map((answer) => z.literal(answer))),
  })).optional();
  return Object.fromEntries([
    ['title', z.string()],
    ...type.fields.map((field) => [field.name, fieldSchema(field, image)]),
    [TRANSLATION_KEY, z.string().regex(/^[0-9a-f]{16}$/).optional()],
    ...(type.address === null ? [] : [[OLD_ADDRESSES, old], [OTHER_ADDRESSES, other]]),
  ]);
}

function fieldSchema(field, image) {
  switch (field.kind) {
    case 'date':
    case 'modified':
      return z.date();
    case 'excerpt':
      return optional(z.string(), field);
    case 'image':
      return optional(z.strictObject({ src: image(), alt: z.string().min(1) }), field);
    case 'seo':
      return seoSchema(image);
    case 'terms':
      return z.array(reference(field.taxonomy.collection)).min(field.required ? 1 : 0);
    case 'meta':
      return field.type === 'boolean' ? z.boolean() : optional(metaSchema(field), field);
    default:
      throw new Error(`no schema for a field of the kind ${field.kind}`);
  }
}

// The search and sharing fields: only what the post sets, its sharing image
// an image as the featured image's is, always with its alt text.
function seoSchema(image) {
  const text = z.string().min(1).optional();
  return z.strictObject({
    title: text,
    breadcrumb: text,
    description: text,
    socialTitle: text,
    socialDescription: text,
    socialImage: image().optional(),
    socialImageAlt: text,
    schema: z.enum(SCHEMA_TYPES).optional(),
    noindex: z.literal(true).optional(),
    nofollow: z.literal(true).optional(),
  }).refine(
    (seo) => (seo.socialImage === undefined) === (seo.socialImageAlt === undefined),
    { message: 'a sharing image comes with its alt text, and alt text with its image' },
  ).optional();
}

function metaSchema({ type, options, min }) {
  const least = (schema) => (min === undefined ? schema : schema.min(min));
  switch (type) {
    case 'string':
      return options ? z.enum(options) : z.string();
    case 'number':
      return least(z.number());
    case 'integer':
      return least(z.number().int());
    case 'date':
      return z.date();
    default:
      throw new Error(`no schema for a field of the type ${type}`);
  }
}

// The files of the declared menus alone, in each language's folder on a
// site in several, `tags` the languages' tags, or null; a menu no longer
// declared keeps its file, which the site no longer reads.
function menuFiles(menus, tags) {
  const files = `${alternatives(Object.keys(menus))}.json`;
  return tags === null ? files : `${alternatives(tags)}/${files}`;
}

// One name, or a glob's alternatives of several.
function alternatives(names) {
  return names.length === 1 ? names[0] : `{${names.join(',')}}`;
}

// A menu's entry: its label, its address unless it only holds others, and
// the entries under it, a list in every entry.
const menuEntry = z.strictObject({
  title: z.string(),
  url: z.string().optional(),
  get items() {
    return z.array(menuEntry).default([]);
  },
});

// The site's identity, each part only when it is set: its title,
// its logo, an image with its alt text when the attachment has one, and its
// icon, an image. `image` is Astro's helper for an image's address, next to
// settings.json in content/media/.
function identitySchema(image) {
  return {
    title: z.string().min(1).optional(),
    logo: z.strictObject({ src: image(), alt: z.string().min(1).optional() }).optional(),
    icon: z.strictObject({ src: image() }).optional(),
  };
}

// Settings by name, each as JSON holds it; `image` is Astro's helper for an
// image's address.
function settingsSchema(settings, image) {
  return Object.fromEntries(settings.map((setting) => [setting.name, settingSchema(setting, image)]));
}

// A group of Konzilo's own: its settings, each always there when it has a
// default but the site's title, which a site may lack, and but those
// that stay out of the published files, each of its named parts under its name, a group
// repeated for each form each form's settings by the form's name, and its
// per-type part as `types`, each post type's settings by the type's name.
function groupSchema(group, image) {
  const settings = (declared) => settingsSchema(declared
    .filter((setting) => setting.published !== false)
    .map((setting) => (setting.default === undefined || isSiteTitle(setting.default) ? setting : { ...setting, required: true })), image);
  return z.strictObject({
    ...settings(group.settings),
    ...Object.fromEntries(group.parts.map((part) => [part.name, z.strictObject(settings(part.settings))])),
    ...Object.fromEntries((group.each ?? []).map((item) => [item.name, z.strictObject(settings(item.settings))])),
    ...(group.types === null ? {} : {
      [TYPES]: z.strictObject(Object.fromEntries(group.types.map((part) => [part.type, z.strictObject(settings(part.settings))]))),
    }),
  });
}

// A chosen post, as a menu entry for a post: its title and its current
// address. The intake leaves it out while the post has no page.
const chosenPost = z.strictObject({ title: z.string(), url: z.string() });

// A setting as JSON holds it: a day as its text, `YYYY-MM-DD`, which a
// template gets as a date at midnight UTC, as a field's; a chosen post as
// its title and address; a chosen image as an image, as the logo is, with its
// alt text when the attachment has one.
function settingSchema(setting, image) {
  if (setting.type === 'boolean') return z.boolean();
  if (setting.type === POST) return chosenPost.optional();
  if (setting.type === IMAGE) return optional(z.strictObject({ src: image(), alt: z.string().min(1).optional() }), setting);
  const schema = setting.type === 'date'
    ? z.string().regex(/^\d{4}-\d{2}-\d{2}$/).transform((day) => new Date(`${day}T00:00:00Z`))
    : metaSchema(setting);
  return optional(schema, setting);
}

// A field without a value is left out of the file, unless it is required.
function optional(schema, { required }) {
  return required ? schema : schema.optional();
}

// The files of a collection, as `glob` finds them. Astro keeps what it has
// read between runs and reads again only the files that change, so when the
// description of the collection changes, it forgets what it read.
function loader(found, declared) {
  const files = glob(found);
  const described = createHash('sha256').update(JSON.stringify(declared)).digest('hex');
  return {
    name: 'konzilo-content-files',
    load: async (context) => {
      if (context.meta.get('site-description') !== described) {
        context.store.clear();
        context.meta.set('site-description', described);
      }
      return files.load(context);
    },
  };
}
