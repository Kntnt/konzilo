// A site's content files, shaped as the intake writes them, for a test of the Astro side
// that wants a site of its own in few lines. What a test can take from the intake itself it
// does; the intake's own suite holds the rest to the format.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { embedsInFile } from '../../src/astro/reader.js';
import { registryFile } from '../../src/format/consent.js';
import { declaredServices } from '../../src/format/declared-services.js';
import { settingsFor } from '../../src/intake/settings.js';
import { SEO_KEYS, siteDescription } from '../../src/site-description.js';

const yaml = (value) => {
  if (value instanceof Date) return value.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return JSON.stringify(value);
};

// A post's file: its frontmatter, by the keys given, then its body.
export function postFile({ body = '', ...frontmatter }) {
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${yaml(value)}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

// The settings file of a site (the description as declared), by the intake's own reading
// of settings: each group that applies with its defaults, the given values over them,
// by group. A test gives a chosen post or an image as the file holds it, having no source
// files to resolve them from.
export function settingsFile(declared, { identity = {}, settings = {}, groups = {}, locale = null } = {}) {
  const site = siteDescription(declared);
  const language = locale ? site.languages.find((one) => one.locale === locale) : site.languages[0] ?? null;
  const source = { ...identity, ...settings, ...groups };
  const { values, problems } = settingsFor(site, source, language, { title: identity.title, choice: (value) => ({ value }), image: (value) => ({ value }) });
  if (problems.length > 0) throw new Error(`a test's settings: ${problems.map((one) => `${one.setting}: ${one.reason}`).join('; ')}`);
  return `${JSON.stringify(values, null, 2)}\n`;
}

// Write `files`, by their paths from `folder`.
export function writeFiles(folder, files) {
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), contents);
  }
}

// A post of a test's own site, by the fields its content file comes from, each
// at the value most posts have.
export function post(fields = {}) {
  return { ID: 1, type: 'post', status: 'publish', slug: 'hello-world', title: 'Hello world', date: '2026-10-01 08:00:00', body: '', meta: {}, terms: {}, ...fields };
}

// A term of a test's own site.
export function term(slug, name, { taxonomy = 'topic', description = '', parent = '' } = {}) {
  return { name, slug, taxonomy, description, parent };
}

// Paragraphs of a post's body.
export function paragraphs(...texts) {
  return texts.join('\n\n');
}

const moment = (text) => new Date(`${text.replace(' ', 'T')}Z`);

// The content folder of a site (its description as declared) that has these
// posts, as the intake writes it: each post's file, each term's, the settings
// and the redirect rules, and which post each file is. A post that is not
// published has no file. `siteSettings` is { menus, settings, identity, groups,
// redirects }.
export function writeSite(folder, declared, posts, { menus = {}, settings = {}, identity = { title: 'The Quiet Lantern' }, groups = {}, languages = {}, redirects = [], registry = null } = {}) {
  const site = siteDescription(declared);
  for (const { collection } of [...Object.values(site.types), ...Object.values(site.taxonomies)]) rmSync(join(folder, collection), { recursive: true, force: true });
  rmSync(join(folder, 'not-found.md'), { force: true });
  rmSync(join(folder, 'not-found'), { recursive: true, force: true });
  const files = {};
  const ids = {};
  const byId = new Map(posts.map((one) => [one.ID, one]));
  const pathOf = (one) => {
    const chain = [one.slug];
    for (let parent = byId.get(one.parent); parent; parent = byId.get(parent.parent)) chain.unshift(parent.slug);
    return chain.join('/');
  };
  const localeOf = (one) => one.locale ?? one.meta?._locale?.[0] ?? site.languages[0]?.locale ?? null;
  const notFoundId = groups.notFound?.page;
  for (const one of posts) {
    const type = site.types[one.type];
    if (!type || one.status !== 'publish') continue;
    // The 404 page's post has no address of its own, and its own file.
    const set = one.translationKey ?? one.meta?._original_post?.[0];
    const chosenPost = notFoundId === undefined ? null : posts.find(({ ID }) => String(ID) === String(notFoundId));
    const chosenSet = chosenPost?.translationKey ?? chosenPost?.meta?._original_post?.[0];
    if (chosenPost && (one === chosenPost || (set && set === chosenSet))) {
      const language = site.languages.find(({ locale }) => locale === localeOf(one));
      files[one === chosenPost || !language ? 'not-found.md' : `not-found/${language.tag}.md`] = postFile({ title: one.title, body: one.body });
      continue;
    }
    const front = { title: one.title };
    for (const field of type.fields) {
      if (field.kind === 'date' && one.date) front[field.name] = moment(one.date);
      else if (field.kind === 'modified') front[field.name] = moment(one.modified ?? one.date);
      else if (field.kind === 'excerpt' && one.excerpt) front[field.name] = one.excerpt;
      else if (field.kind === 'image' && one.image) front[field.name] = one.image;
      else if (field.kind === 'seo' && one.seo) front[field.name] = one.seo;
      else if (['breadcrumb', 'eyebrow', 'headline', 'subheadline', 'standfirst', 'teaser'].includes(field.kind) && one[field.kind] !== undefined) front[field.name] = one[field.kind];
      else if (field.kind === 'terms') {
        const terms = one.terms?.[field.taxonomy?.name] ?? [];
        const folder = site.languages.length > 1 ? `${site.languages.find(({ locale }) => locale === localeOf(one)).tag}/` : '';
        front[field.name] = terms.map((found) => `${folder}${found.slug}`).sort();
        for (const found of [...terms, ...(one.term_parents?.[field.taxonomy?.name] ?? [])]) {
          const parent = found.parent ? { parent: found.parent } : {};
          const description = found.description ? { description: found.description } : {};
          files[`${field.taxonomy.collection}/${folder}${found.slug}.json`] = `${JSON.stringify({ name: found.names?.[localeOf(one)] ?? found.name, ...description, ...parent }, null, 2)}\n`;
        }
      } else if (field.kind === 'meta' && one.fields?.[field.name] !== undefined) front[field.name] = one.fields[field.name];
    }
    if (set) front.translationKey = createHash('sha256').update(String(set)).digest('hex').slice(0, 16);
    const rules = (one.rules ?? []).filter((rule) => !rule.automatic);
    const language = site.languages.length > 1 ? site.languages.find(({ locale }) => locale === localeOf(one)) : null;
    const own = typeof type.address === 'string' ? type.address.replace('{slug}', one.slug).replace('{path}', pathOf(one)) : null;
    // A post in the main language answers at its address without the prefix too.
    const unprefixed = language?.main && own ? [own] : [];
    const old = [...(one.oldAddresses ?? []), ...(one.rules ?? []).filter((rule) => rule.automatic).map((rule) => rule.address), ...unprefixed].filter((address) => language?.main || address !== own);
    if (type.address !== null && old.length > 0) front.oldAddresses = [...new Set(old)].sort();
    if (type.address !== null && rules.length > 0) front.otherAddresses = rules.map(({ address, answer }) => ({ address, answer })).sort((a, b) => (a.address < b.address ? -1 : 1));
    const path = `${type.collection}/${language ? `${language.tag}/` : ''}${pathOf(one)}.md`;
    files[path] = postFile({ ...front, body: one.body });
    ids[path] = one.ID;
  }
  const menuFile = (entries) => `${JSON.stringify({ items: entries.map(({ title, url }) => ({ title, url })) }, null, 2)}\n`;
  if (site.languages.length > 1) {
    site.languages.forEach(({ locale, tag }, index) => {
      for (const [name, entries] of Object.entries(index === 0 ? menus : languages[locale]?.menus ?? {})) files[`menus/${tag}/${name}.json`] = menuFile(entries);
    });
  } else {
    for (const [name, entries] of Object.entries(menus)) files[`menus/${name}.json`] = menuFile(entries);
  }
  if (site.languages.length > 1) {
    site.languages.forEach(({ locale, tag }, index) => {
      const own = index === 0 ? { identity, settings, groups } : languages[locale] ?? {};
      files[`settings/${tag}.json`] = settingsFile(declared, { identity: index === 0 ? identity : { ...identity, title: own.title ?? identity.title }, settings: own.settings ?? {}, groups: own.groups ?? {}, locale: index === 0 ? null : locale });
    });
  } else files['settings.json'] = settingsFile(declared, { identity, settings, groups });
  files['redirects.json'] = `${JSON.stringify({ rules: redirects }, null, 2)}\n`;
  files['.post-ids.json'] = `${JSON.stringify({ posts: Object.fromEntries(Object.entries(ids).sort().map(([path, id]) => [String(id), { path }])) }, null, 2)}\n`;
  if (registry !== null) files['consent.json'] = `${JSON.stringify(registry, null, 2)}\n`;
  writeFiles(folder, files);
}

const decoded = (text) => text.replaceAll('&amp;', '&');
const decodedTitle = (value) => (typeof value === 'string' ? decoded(value) : value);
const stamp = new Date('2026-10-27T12:00:00Z');
const identityDefault = { title: 'The Quiet Lantern' };

// A setting's value as a test gives it, as the settings file holds it: a yes as
// true, a number as a number.
function typed(value, setting) {
  if (setting.type === 'boolean' && typeof value === 'string') return value === '1' || value === 'true';
  if ((setting.type === 'integer' || setting.type === 'number') && typeof value === 'string' && value !== '') return Number(value);
  return value;
}

// Stands in for a build's intake in a site repository at `repository`: reads its
// site-description.json and its site-settings.json, if any, and writes the
// content folder from `posts`, as writeSite() does, with the service registry.
// `meta` holds what a post's file comes from by name: `old_slug`, `live_address`,
// `seo_<key>`, `thumbnail` and `image_alt`, and a field of the site's own as
// `field_<name>`. Gives { status: 0, stderr: '' }.
export function writeContent(repository, posts, settingsPath = join(repository, 'site-settings.json')) {
  const declared = JSON.parse(readFileSync(join(repository, 'site-description.json'), 'utf8'));
  const site = siteDescription(declared);
  const given = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) : {};
  const content = join(repository, 'content');
  const media = join(content, 'media');
  const shaped = posts.map((one) => {
    const meta = one.meta ?? {};
    const first = (key) => meta[key]?.[0];
    const type = site.types[one.type] ?? Object.values(site.types)[0];
    const master = (id) => {
      const original = one.attachments?.[id]?.original;
      if (!original) return null;
      const bytes = readFileSync(original);
      const name = `${one.slug}-${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}${extname(original)}`;
      mkdirSync(media, { recursive: true });
      writeFileSync(join(media, name), bytes);
      return name;
    };
    const seo = {};
    for (const key of SEO_KEYS) {
      const value = first(`seo_${key.replace(/[A-Z]/g, (capital) => `_${capital.toLowerCase()}`)}`);
      if (value === undefined || value === '') continue;
      seo[key] = key === 'noindex' || key === 'nofollow' ? value === '1' : key === 'socialImage' ? `../media/${master(value)}` : value;
    }
    const thumbnail = first('thumbnail') && master(first('thumbnail'));
    const addressOf = (slug) => type?.address?.replace?.('{slug}', slug).replace('{path}', slug);
    const old = [...(meta.old_slug ?? []).map(addressOf), ...(meta.live_address ?? [])];
    const fields = Object.fromEntries(Object.entries(meta).filter(([key]) => key.startsWith('field_')).map(([key, [value]]) => [key.slice('field_'.length), typed(value, type?.fields.find((field) => field.name === key.slice('field_'.length)) ?? {})]));
    return {
      ...one,
      // A test's post of the template's site is of its first type.
      type: site.types[one.type] ? one.type : Object.keys(site.types)[0],
      title: decoded(one.title),
      seo: Object.keys(seo).length > 0 ? seo : undefined,
      breadcrumb: first('breadcrumb') || undefined,
      // A post of a type that requires a main headline, as the built-in article does, has its
      // title as one where the test gives none.
      headline: one.headline ?? (type?.fields.some((field) => field.kind === 'headline' && field.required) ? decoded(one.title) : undefined),
      image: thumbnail ? { src: `../media/${thumbnail}`, alt: first('image_alt') ?? '' } : undefined,
      oldAddresses: old.length > 0 ? old : undefined,
      fields,
    };
  });
  // A setting that chooses a post gives its ID; the file holds its title and
  // address.
  const chosen = (id) => {
    const one = shaped.find(({ ID }) => String(ID) === String(id));
    const type = one && site.types[one.type];
    if (!type?.address || one.status !== 'publish') return undefined;
    return { title: one.title, url: type.address.replace('{slug}', one.slug).replace('{path}', one.slug) };
  };
  const groups = {};
  const own = {};
  for (const [name, value] of Object.entries(given.settings ?? {})) {
    if (site.groups.some((group) => group.name === name)) groups[name] = value;
    else own[name] = value;
  }
  // The default sharing image gives its ID; the file holds its master and alt text.
  if (typeof groups.search?.image === 'string') {
    const owner = posts.find((one) => one.attachments?.[groups.search.image]);
    const attachment = given.attachments?.[groups.search.image] ?? owner?.attachments[groups.search.image];
    if (attachment) {
      const bytes = readFileSync(attachment.original);
      const name = `search-image-${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}${extname(attachment.original)}`;
      mkdirSync(media, { recursive: true });
      writeFileSync(join(media, name), bytes);
      groups.search = { ...groups.search, image: { src: `media/${name}`, ...(attachment.alt ? { alt: attachment.alt } : {}) } };
    }
  }
  for (const name of ['privacyPolicy', 'cookiePolicy', 'accessibilityStatement']) {
    const id = groups.legalPages?.[name];
    if (id === undefined) continue;
    const post = chosen(id);
    if (post) groups.legalPages[name] = post;
    else delete groups.legalPages[name];
  }
  writeSite(content, declared, shaped, {
    menus: given.menus ?? {},
    settings: own,
    groups,
    identity: Object.fromEntries(Object.entries(given.identity ?? identityDefault).filter(([, value]) => value !== null && value !== undefined && value !== '').map(([key, value]) => {
      if (typeof value !== 'object' || !value.original) return [key, decodedTitle(value)];
      const bytes = readFileSync(value.original);
      const name = `${key}-${createHash('sha256').update(bytes).digest('hex').slice(0, 10)}${extname(value.original)}`;
      mkdirSync(media, { recursive: true });
      writeFileSync(join(media, name), bytes);
      return [key, { src: `${site.languages.length > 1 ? '../' : ''}media/${name}`, ...(value.alt ? { alt: value.alt } : {}) }];
    })),
    languages: Object.fromEntries(Object.entries(given.languages ?? {}).map(([locale, one]) => {
      const [ownOf, groupsOf] = [{}, {}];
      for (const [name, value] of Object.entries(one.settings ?? {})) (site.groups.some((group) => group.name === name) ? groupsOf : ownOf)[name] = value;
      return [locale, { title: one.title, menus: one.menus, settings: ownOf, groups: groupsOf }];
    })),
    redirects: [
      ...(given.redirects ?? []).filter(({ from }) => !from.startsWith('^')).map(({ id, ...rule }) => rule).sort((a, b) => (a.from < b.from ? -1 : 1)),
      ...(given.redirects ?? []).filter(({ from }) => from.startsWith('^')).map(({ id, from, ...rule }) => ({ pattern: from, ...rule })),
    ],
  });
  const embeds = new Set();
  for (const one of shaped) if (site.types[one.type] && one.status === 'publish') embedsInFile(postFile({ title: 'x', body: one.body }), embeds);
  const settings = JSON.parse(readFileSync(join(content, site.languages.length > 1 ? `settings/${site.languages[0].tag}.json` : 'settings.json'), 'utf8'));
  const { services: declaredList } = declaredServices(given.services ?? []);
  const { file } = registryFile({ site, settings, embeds: [...embeds].sort(), now: stamp, declared: declaredList });
  writeFileSync(join(content, file.path), file.contents);
  return { status: 0, stderr: '' };
}

// Writes `siteSettings` into site-settings.json in `folder`, and gives the
// arguments a build hands on.
export const identity = Object.freeze({ title: 'The Quiet Lantern', logo: null, icon: null });
export function siteSettingsArgs(folder, siteSettings = { menus: {}, settings: {}, identity }) {
  writeFileSync(join(folder, 'site-settings.json'), JSON.stringify(siteSettings));
  return [];
}
