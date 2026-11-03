#!/usr/bin/env node
// Read a checkout of the source repository at one commit, and write the content folder,
// in the site's build, as the site's user. The checks are one function with no input or
// output of its own (src/intake/index.js); this is what reads and writes for it.
//
//   konzilo-intake <checkout> [--site <folder>] [--content <folder>] [--confirm <code>] [--admins <file>]
//
// --site      the site repository, whose site-description.json it reads; here by default
// --content   the content folder; $KONZILO_CONTENT or `content` by default
// --confirm   the code of a deletion the guard stopped, which holds for this build alone
// --admins    a JSON list of the addresses of the accounts that are Admins, against which
//             it reads who last changed each file, from Git's log: without it, nothing
//             is held to a role, as in a developer's own checkout
//
// It prints what the build reports, as JSON: { refusals, warnings, written, removed, next }.
// A refusal is data, and exits 0, with other posts published. It exits 3 when the guard
// stops it, having written and removed nothing; 1 when the check itself breaks, with
// nothing written; 2 for a wrong call.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { POST_IDS_FILE } from '../src/format/write.js';
import { imagesFrom } from '../src/intake/images.js';
import { deletion, intake } from '../src/intake/index.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE } from '../src/site-description.js';

const usage = () => {
  console.error('usage: konzilo-intake <checkout> [--site <folder>] [--content <folder>] [--confirm <code>] [--admins <file>]');
  process.exit(2);
};

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { site: { type: 'string' }, content: { type: 'string' }, confirm: { type: 'string' }, admins: { type: 'string' } } });
} catch {
  usage();
}
const [given] = parsed.positionals;
if (!given || parsed.positionals.length > 1) usage();

const checkout = resolve(given);
const siteFolder = resolve(parsed.values.site ?? '.');
const content = resolve(parsed.values.content ?? process.env.KONZILO_CONTENT ?? 'content');

const walk = (folder) => (existsSync(folder) ? readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
  if (entry.name.startsWith('.')) return [];
  const path = join(folder, entry.name);
  return entry.isDirectory() ? walk(path) : entry.isFile() ? [path] : [];
}) : []);

// Who last changed each of the paths: Git's log, newest first, and the first time a
// path is named is the last time it changed.
function lastChanges(admins) {
  const log = execFileSync('git', ['log', '--format=%x00%ae', '--name-only'], { cwd: checkout, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
  const changes = {};
  for (const commit of log.split('\0').slice(1)) {
    const [by, ...paths] = commit.split('\n');
    for (const path of paths) {
      if (path !== '' && !Object.hasOwn(changes, path)) changes[path] = { by, admin: admins.includes(by) };
    }
  }
  return changes;
}

try {
  const site = readSiteDescription(join(siteFolder, SITE_DESCRIPTION_FILE));
  const files = walk(checkout).map((path) => {
    const inner = relative(checkout, path);
    return { path: inner, contents: inner.startsWith('media/') ? readFileSync(path) : readFileSync(path, 'utf8') };
  });
  const media = join(content, 'media');
  const masters = new Map(walk(media).map((path) => [relative(media, path), readFileSync(path)]));
  const images = await imagesFrom(files.filter(({ path }) => path.startsWith('media/')), masters);
  const ledgerFile = join(content, POST_IDS_FILE);
  const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : null;
  const admins = parsed.values.admins ? JSON.parse(readFileSync(parsed.values.admins, 'utf8')) : null;
  const changes = admins ? lastChanges(admins) : {};
  const adminHost = process.env.KONZILO_ADMIN_ORIGIN ? new URL(process.env.KONZILO_ADMIN_ORIGIN).hostname : null;

  const result = intake({ files, site, now: new Date(), ledger, changes, images, adminHost });

  // What the site owns: each post's and term's file in a collection's folder, and each
  // master. A name with a leading dot and any other kind of file is left alone.
  const owned = (collection, extension) => walk(join(content, collection)).map((path) => relative(content, path)).filter((path) => path.endsWith(extension));
  const posts = Object.values(site.types).flatMap((type) => owned(type.collection, '.md'));
  const terms = Object.values(site.taxonomies).flatMap((taxonomy) => owned(taxonomy.collection, '.json'));
  const pictures = walk(media).map((path) => relative(content, path)).filter((path) => /\.(?:webp|svg)$/.test(path));
  const notFound = [...(existsSync(join(content, 'not-found.md')) ? ['not-found.md'] : []), ...owned('not-found', '.md')];

  const guard = deletion(posts, result, { confirmed: parsed.values.confirm ?? null });
  if (guard.stop) {
    console.log(JSON.stringify({ stopped: { reason: guard.reason, count: guard.count, total: guard.total, paths: guard.paths, code: guard.code }, refusals: result.refusals, warnings: result.warnings }, null, 2));
    process.exit(3);
  }

  const stays = new Set([...result.files.map(({ path }) => path), ...result.keep]);
  const removed = [...posts, ...terms, ...pictures, ...notFound].filter((path) => !stays.has(path)).sort();
  const written = [];
  for (const { path, contents } of result.files) {
    const target = join(content, path);
    const bytes = Buffer.from(contents);
    // A master already there is left alone, and a file that has not changed is too, so
    // that the content repository's history changes only where the content does.
    if (existsSync(target) && (path.startsWith('media/') || readFileSync(target).equals(bytes))) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    written.push(path);
  }
  for (const path of removed) {
    rmSync(join(content, path));
    for (let folder = dirname(join(content, path)); folder !== content && folder.startsWith(content) && readdirSync(folder).length === 0; folder = dirname(folder)) rmdirSync(folder);
  }
  console.log(JSON.stringify({ refusals: result.refusals, warnings: result.warnings, written, removed, next: result.next }, null, 2));
} catch (error) {
  console.error(`konzilo-intake: the check broke, and nothing was written: ${error.stack ?? error.message}`);
  process.exit(1);
}
