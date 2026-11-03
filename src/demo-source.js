// The demo content as source files, as an editor's saves would leave them, for a
// local copy's Forgejo to start with: a post or a term under its collection's
// folder, named by an ID, with references by ID (ADR 0026). The published demo
// content is the fiction's one record, and this reads it, so that the two cannot
// tell different stories. An ID comes from the file's place, so that seeding twice
// gives the same files.

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Twelve hexadecimal digits, the shape of Sveltia's {{uuid_short}}.
const idOf = (collection, slug) => createHash('sha256').update(`${collection}/${slug}`).digest('hex').slice(0, 12);

const walk = (folder) => readdirSync(folder).flatMap((name) => {
  const path = join(folder, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

// The demo's frontmatter has one key per line, each value JSON or a date.
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

const scalar = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value : JSON.stringify(value));

const writePost = (fields, body) => `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${scalar(value)}`).join('\n')}\n---\n${body}`;

const toMedia = (image) => {
  if (!image || typeof image !== 'object') return image;
  return { ...image, src: `/media/${image.src.split('/').at(-1)}` };
};

/**
 * @param {object} description the form siteDescription() returns
 * @param {string} demo the folder of published demo content
 * @returns {{ path: string, content: string|Buffer }[]} every source file, sorted by path
 */
export function demoSource(description, demo) {
  const files = [];
  const fieldsTaking = new Map();
  for (const type of Object.values(description.types)) {
    for (const field of type.fields) {
      if (field.kind === 'terms') fieldsTaking.set(field.name, field.taxonomy.collection);
    }
  }

  for (const taxonomy of Object.values(description.taxonomies)) {
    const folder = join(demo, taxonomy.collection);
    if (!existsSync(folder)) continue;
    for (const path of walk(folder)) {
      const slug = relative(folder, path).replace(/\.json$/, '');
      const term = JSON.parse(readFileSync(path, 'utf8'));
      const { parent, ...rest } = term;
      const written = {
        ...rest,
        slug,
        ...(parent ? { parent: idOf(taxonomy.collection, parent) } : {}),
      };
      files.push({ path: `${taxonomy.collection}/${idOf(taxonomy.collection, slug)}.json`, content: `${JSON.stringify(written, null, 2)}\n` });
    }
  }

  for (const type of Object.values(description.types)) {
    const folder = join(demo, type.collection);
    if (!existsSync(folder)) continue;
    for (const path of walk(folder)) {
      const place = relative(folder, path).replace(/\.md$/, '');
      const { fields, body } = parsePost(readFileSync(path, 'utf8'));
      const segments = place.split('/');
      const slug = segments.at(-1);
      const { modified: _derived, ...kept } = fields;
      const written = { title: kept.title, slug, status: 'published' };
      if (segments.length > 1) written.parent = idOf(type.collection, segments.slice(0, -1).join('/'));
      for (const [key, value] of Object.entries(kept)) {
        if (key === 'title') continue;
        if (fieldsTaking.has(key)) written[key] = value.map((term) => idOf(fieldsTaking.get(key), term));
        else if (key === 'image') written.image = toMedia(value);
        else written[key] = value;
      }
      const id = idOf(type.collection, place);
      files.push({ path: `${type.collection}/${id}.md`, content: writePost(written, body) });
    }
  }

  const media = join(demo, 'media');
  if (existsSync(media)) {
    for (const path of walk(media)) files.push({ path: `media/${relative(media, path)}`, content: readFileSync(path) });
  }

  // Values an Admin sets: an image points into the media folder.
  const settingsFile = join(demo, 'settings.json');
  if (existsSync(settingsFile)) {
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    const written = { ...settings };
    for (const key of ['logo', 'icon']) if (written[key]) written[key] = toMedia(written[key]);
    files.push({ path: 'settings.json', content: `${JSON.stringify(written, null, 2)}\n` });
  }
  for (const name of ['redirects.json']) {
    const path = join(demo, name);
    if (existsSync(path)) files.push({ path: name, content: readFileSync(path, 'utf8') });
  }
  const menus = join(demo, 'menus');
  if (existsSync(menus)) {
    for (const path of walk(menus)) files.push({ path: `menus/${relative(menus, path)}`, content: readFileSync(path, 'utf8') });
  }

  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return files;
}

// Originals live in Git LFS (ADR 0026).
export const GIT_ATTRIBUTES = 'media/** filter=lfs diff=lfs merge=lfs -text\n';
