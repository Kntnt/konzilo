// What a run of the intake means for the content folder: the files it writes, and what
// the site owns there that no longer stays. The command and the live preview both write
// through this, so that a file that has not changed keeps its bytes and its time.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { startFile } from '../format/start-page.js';

export const walk = (folder) => (existsSync(folder) ? readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  if (entry.name.startsWith('.')) return [];
  const path = join(folder, entry.name);
  return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
}) : []);

const owned = (content, collection, extension) => walk(join(content, collection)).map((path) => relative(content, path)).filter((path) => path.endsWith(extension));

// The posts' files: those in a collection's folder, and the start page's at the root.
export const postFiles = (content, site) => Object.values(site.types).flatMap((type) => [
  ...owned(content, type.collection, '.md'),
  ...(existsSync(join(content, startFile(type))) ? [startFile(type)] : []),
]);

// Writes what `result`, the intake's, holds, and removes what the site owns that it no
// longer keeps: each post's and term's file in a collection's folder, and each master. A
// name with a leading dot and any other kind of file is left alone. A master already
// there stays, and a file that has not changed is not touched, so that a content
// repository's history, and a dev server's reloads, change only where the content does.
export function writeContent(content, site, result) {
  const media = join(content, 'media');
  const terms = Object.values(site.taxonomies).flatMap((taxonomy) => owned(content, taxonomy.collection, '.json'));
  const pictures = walk(media).map((path) => relative(content, path)).filter((path) => /\.(?:webp|svg)$/.test(path));
  const notFound = [...(existsSync(join(content, 'not-found.md')) ? ['not-found.md'] : []), ...owned(content, 'not-found', '.md')];
  const stays = new Set([...result.files.map(({ path }) => path), ...result.keep]);
  const removed = [...postFiles(content, site), ...terms, ...pictures, ...notFound].filter((path) => !stays.has(path)).sort();
  const written = [];
  for (const { path, contents } of result.files) {
    const target = join(content, path);
    const bytes = Buffer.from(contents);
    if (existsSync(target) && (path.startsWith('media/') || readFileSync(target).equals(bytes))) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    written.push(path);
  }
  for (const path of removed) {
    rmSync(join(content, path));
    for (let folder = dirname(join(content, path)); folder !== content && folder.startsWith(content) && readdirSync(folder).length === 0; folder = dirname(folder)) rmdirSync(folder);
  }
  return { written, removed };
}
