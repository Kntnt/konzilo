#!/usr/bin/env node
// Read a checkout of the source repository at one commit, and write the content folder,
// in the site's build, as the site's user. The checks are one function with no input or
// output of its own (src/intake/index.js); this is what reads and writes for it.
//
//   konzilo-intake <checkout> (--admins <file> --reviewers <file> --pushers <file> | --no-roles) [--site <folder>] [--content <folder>] [--confirm <code>]
//
// --admins    a JSON list of the accounts that are Admins
// --reviewers a JSON list of the accounts that are Reviewers, who change nothing
// --pushers   a JSON object giving, by each commit, the account that pushed it, as the host
//             recorded it, since what a commit says of its author anyone can write
// --no-roles  hold nothing to a role, as in a developer's own checkout: said out loud,
//             so that a build that forgets the list stops rather than lets everyone through
// --site      the site repository, whose site-description.json it reads; here by default
// --content   the content folder; $KONZILO_CONTENT or `content` by default
// --confirm   the code of a deletion the guard stopped, which holds for this build alone
//
// It prints what the build reports, as JSON: { refusals, warnings, posts, written, removed, next }.
// A refusal is data, and exits 0, with other posts published. It exits 3 when the guard
// stops it, having written and removed nothing; 1 when the check itself breaks, with
// nothing written; 2 for a wrong call.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { POST_IDS_FILE } from '../src/format/write.js';
import { postFiles, walk, writeContent } from '../src/intake/content-folder.js';
import { componentChecksOf } from '../src/intake/component-checks.js';
import { imagesFrom, namedOriginals } from '../src/intake/images.js';
import { deletion, intake } from '../src/intake/index.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE } from '../src/site-description.js';

const usage = () => {
  console.error('usage: konzilo-intake <checkout> (--admins <file> --reviewers <file> --pushers <file> | --no-roles) [--site <folder>] [--content <folder>] [--confirm <code>]');
  process.exit(2);
};

let parsed;
try {
  parsed = parseArgs({ allowPositionals: true, options: { site: { type: 'string' }, content: { type: 'string' }, confirm: { type: 'string' }, admins: { type: 'string' }, reviewers: { type: 'string' }, pushers: { type: 'string' }, 'no-roles': { type: 'boolean' } } });
} catch {
  usage();
}
const [given] = parsed.positionals;
if (!given || parsed.positionals.length > 1) usage();
if (Boolean(parsed.values.admins) === Boolean(parsed.values['no-roles'])) usage();
if (Boolean(parsed.values.admins) !== Boolean(parsed.values.pushers) || Boolean(parsed.values.admins) !== Boolean(parsed.values.reviewers)) usage();

const checkout = resolve(given);
const siteFolder = resolve(parsed.values.site ?? '.');
const content = resolve(parsed.values.content ?? process.env.KONZILO_CONTENT ?? 'content');

// Who last changed each of the paths: Git's log, newest first, and the first time a
// path is named is the last time it changed. Without renames, or moving a file away would
// name only where it went. A shallow clone would blame its one commit for every file, so
// it stops the check. A commit no one is known to have pushed is no Admin's, and no
// Reviewer's. A Reviewer is one whatever else their account is (ADR 0008).
function lastChanges(admins, reviewers, pushers) {
  const shallow = execFileSync('git', ['rev-parse', '--is-shallow-repository'], { cwd: checkout, encoding: 'utf8' }).trim();
  if (shallow !== 'false') throw new Error('a shallow clone cannot say who last changed a file; give the intake the whole history');
  const log = execFileSync('git', ['log', '--no-renames', '--format=%x00%H', '--name-only'], { cwd: checkout, encoding: 'utf8', maxBuffer: 1024 * 1024 * 256 });
  const changes = {};
  for (const commit of log.split('\0').slice(1)) {
    const [hash, ...paths] = commit.split('\n');
    const by = Object.hasOwn(pushers, hash) ? pushers[hash] : null;
    for (const path of paths) {
      if (path === '' || Object.hasOwn(changes, path)) continue;
      const reviewer = by !== null && reviewers.includes(by);
      changes[path] = { by, admin: !reviewer && by !== null && admins.includes(by), reviewer };
    }
  }
  return changes;
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

try {
  const site = readSiteDescription(join(siteFolder, SITE_DESCRIPTION_FILE));
  // An original reaches the function only through the seam.
  const paths = walk(checkout).map((path) => relative(checkout, path));
  const files = paths.filter((path) => !path.startsWith('media/')).map((path) => ({ path, contents: readFileSync(join(checkout, path), 'utf8') }));
  const media = join(content, 'media');
  const masters = new Map(walk(media).map((path) => [relative(media, path), () => readFileSync(path)]));
  const originals = paths.filter((path) => path.startsWith('media/')).map((path) => ({ path, contents: () => readFileSync(join(checkout, path)) }));
  const images = await imagesFrom(namedOriginals(originals, files), masters);
  const ledgerFile = join(content, POST_IDS_FILE);
  const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : null;
  const changes = parsed.values.admins ? lastChanges(readJson(parsed.values.admins), readJson(parsed.values.reviewers), readJson(parsed.values.pushers)) : {};
  const adminHost = process.env.KONZILO_ADMIN_ORIGIN ? new URL(process.env.KONZILO_ADMIN_ORIGIN).hostname : null;

  const components = await componentChecksOf(site, siteFolder);
  const result = intake({ files, site, now: new Date(), ledger, changes, images, adminHost, components });

  const guard = deletion(postFiles(content, site), result, { confirmed: parsed.values.confirm ?? null });
  if (guard.stop) {
    console.log(JSON.stringify({ stopped: { reason: guard.reason, count: guard.count, total: guard.total, paths: guard.paths, code: guard.code }, refusals: result.refusals, warnings: result.warnings, posts: result.posts, next: result.next }, null, 2));
    process.exit(3);
  }

  const { written, removed } = writeContent(content, site, result);
  console.log(JSON.stringify({ refusals: result.refusals, warnings: result.warnings, posts: result.posts, written, removed, next: result.next }, null, 2));
} catch (error) {
  console.error(`konzilo-intake: the check broke, and nothing was written: ${error.stack ?? error.message}`);
  process.exit(1);
}
