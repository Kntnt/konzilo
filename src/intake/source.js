// The source files at one commit, read: posts, terms, and what an Admin keeps. A file
// the intake cannot read is refused here, and other files are left alone: other kinds
// of file, names with a leading dot, and folders no collection names.

import { createHash } from 'node:crypto';
import { parse, YAMLParseError } from 'yaml';
import { isObject } from '../checks.js';
import { named, say } from './words.js';

export const sha256 = (contents) => createHash('sha256').update(contents).digest('hex');

// The path a reference to a source file's collection is below, its language's folder
// on a site in several, and the file's ID.
function placeOf(rest, extension, several) {
  const parts = rest.split('/');
  if (parts.some((part) => part.startsWith('.')) || !parts.at(-1).endsWith(`.${extension}`)) return null;
  const id = parts.at(-1).slice(0, -extension.length - 1);
  if (several) return parts.length === 2 ? { tag: parts[0], id } : parts.length === 1 ? { tag: null, id } : null;
  return parts.length === 1 ? { tag: null, id } : null;
}

// A post's frontmatter and body: { fields, body, bodyLine } or { problem, line }.
function postParts(contents) {
  const text = contents.replace(/\r\n/g, '\n').replace(/^﻿/, '');
  const match = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)([\s\S]*)$/.exec(text);
  if (!match) return { problem: say('refusal.source-frontmatter'), line: 1 };
  const head = match[1] ?? '';
  let fields;
  try {
    fields = head.trim() === '' ? {} : parse(head);
  } catch (error) {
    if (error instanceof YAMLParseError) return { problem: say('refusal.source-yaml', { detail: error.code }), line: (error.linePos?.[0]?.line ?? 0) + 1 };
    throw error;
  }
  if (!isObject(fields)) return { problem: say('refusal.source-frontmatter'), line: 1 };
  return { fields, body: match[2], bodyLine: head === '' ? 3 : head.split('\n').length + 3 };
}

// A title of digits alone is a number to YAML, and still the post's title.
const titleOf = ({ title }) => (typeof title === 'number' ? String(title) : typeof title === 'string' && title.trim() !== '' ? title.trim() : null);

// What a JSON file of an Admin's holds: { value } or { refusal }.
function jsonFile(file) {
  try {
    return { value: JSON.parse(file.contents) };
  } catch (error) {
    return { refusal: named({ file: file.path, reason: say('refusal.source-json', { detail: error.message }) }) };
  }
}

const asText = (contents) => (typeof contents === 'string' ? contents : Buffer.from(contents).toString('utf8'));

// The files as { posts, terms, settings, menus, redirects, services, refusals }:
// `posts` each { key, id, language, type, path, hash, fields, body, bodyLine, title },
// its key its ID, on a site in several languages `<tag>/<ID>`, sorted by path; `terms`
// each { key, id, language, taxonomy, path, hash, value }. A post in a folder of no
// language of the site's is { language: null, unknown: <folder> }.
export function readSource(files, site) {
  const several = site.languages.length > 1;
  const collections = new Map([
    ...Object.values(site.types).map((type) => [type.collection, { type }]),
    ...Object.values(site.taxonomies).map((taxonomy) => [taxonomy.collection, { taxonomy }]),
  ]);
  const languageOf = (tag) => (several ? site.languages.find((one) => one.tag === tag) ?? null : site.languages[0] ?? null);
  const found = { posts: [], terms: [], settings: null, menus: new Map(), redirects: null, services: null, refusals: [], hashes: new Map() };
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const file of sorted) {
    const first = file.path.indexOf('/');
    const folder = first === -1 ? null : file.path.slice(0, first);
    const rest = first === -1 ? null : file.path.slice(first + 1);
    const place = collections.get(folder);
    if (place?.type) {
      const at = placeOf(rest, 'md', several);
      if (at) readPost(file, at, place.type, languageOf, found);
      continue;
    }
    if (place?.taxonomy) {
      const at = placeOf(rest, 'json', several);
      if (at) readTerm(file, at, place.taxonomy, languageOf, found);
      continue;
    }
    if (file.path === 'settings.json' || file.path === 'redirects.json' || file.path === 'services.json') {
      readAdminFile(file, file.path.slice(0, -'.json'.length), found);
    } else if (folder === 'menus' && rest.endsWith('.json') && !rest.split('/').some((part) => part.startsWith('.'))) {
      found.hashes.set(file.path, sha256(file.contents));
      const read = jsonFile({ ...file, contents: asText(file.contents) });
      if (read.refusal) found.refusals.push(read.refusal);
      found.menus.set(rest.slice(0, -'.json'.length), read.refusal ? { refused: true, path: file.path } : { value: read.value, path: file.path });
    }
  }
  return found;
}

function readAdminFile(file, name, found) {
  found.hashes.set(file.path, sha256(file.contents));
  const read = jsonFile({ ...file, contents: asText(file.contents) });
  if (read.refusal) found.refusals.push(read.refusal);
  found[name] = read.refusal ? { refused: true, path: file.path } : { value: read.value, path: file.path };
}

function readPost(file, at, type, languageOf, found) {
  const contents = asText(file.contents);
  const parts = postParts(contents);
  const language = languageOf(at.tag);
  const post = {
    key: at.tag ? `${at.tag}/${at.id}` : at.id,
    id: at.id,
    tag: at.tag,
    language,
    type,
    path: file.path,
    hash: sha256(file.contents),
    fields: parts.fields ?? {},
    body: parts.body ?? '',
    bodyLine: parts.bodyLine ?? 1,
    title: titleOf(parts.fields ?? {}),
  };
  if (parts.problem) post.unreadable = { reason: parts.problem, line: parts.line };
  found.posts.push(post);
}

function readTerm(file, at, taxonomy, languageOf, found) {
  const read = jsonFile({ ...file, contents: asText(file.contents) });
  const term = {
    key: `${taxonomy.collection}/${at.tag ? `${at.tag}/` : ''}${at.id}`,
    id: at.id,
    tag: at.tag,
    language: languageOf(at.tag),
    taxonomy,
    path: file.path,
    value: isObject(read.value) ? read.value : null,
    refusal: read.refusal ?? null,
  };
  found.terms.push(term);
}
