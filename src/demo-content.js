// Where a local copy's demo content comes from (ADR 0025): the site repository's own, in its
// `demo-content/`, published content files as the core's are, else the core's. The command
// that fills a local copy's content folder and Compose's seed both ask here, so that a
// developer's copy and the editor's start from the same fiction.
//
// A post of the demo content dated after the moment it is read is a scheduled post: the seed
// makes it a scheduled source file, which the intake publishes at its moment, and a copy
// without Compose, which has no clock that publishes, leaves it out. Both ask here too, so
// that they cannot disagree on which post that is. The page for addresses not found is never
// scheduled, whatever its date, since it has no address at which it could wait.

import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { isObject } from './checks.js';
import { NOT_FOUND_FILE, NOT_FOUND_FOLDER } from './format/not-found.js';

// The folder, in a site repository, that holds its own demo content.
const SITE_DEMO_CONTENT = 'demo-content';

const CORE_DEMO_CONTENT = fileURLToPath(new URL('../site-template/demo-content', import.meta.url));

/**
 * @param {string} site the site repository's folder
 * @returns {string} the folder of published demo content a local copy of it starts with
 */
export function demoContentOf(site) {
  const own = join(site, SITE_DEMO_CONTENT);
  return existsSync(own) ? own : CORE_DEMO_CONTENT;
}

/**
 * A post's content file as its frontmatter and its body, the frontmatter read as the YAML the
 * content format writes it in (content-format.md), Windows line endings as the others. A file
 * without frontmatter is all body.
 * @param {string} text a post's content file
 * @returns {{ fields: object, body: string }}
 */
export function readPost(text) {
  const unix = text.replace(/\r\n/g, '\n');
  const match = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)([\s\S]*)$/.exec(unix);
  if (!match) return { fields: {}, body: unix };
  const fields = (match[1] ?? '').trim() === '' ? {} : parse(match[1]);
  return { fields: isObject(fields) ? fields : {}, body: match[2] };
}

/**
 * @param {object} fields a post's frontmatter, as readPost() gives it
 * @param {Date} now the moment it is read
 * @returns {boolean} whether the post is dated after that moment, and so is scheduled for its date
 */
export function isScheduled(fields, now) {
  const { date } = fields;
  return (typeof date === 'string' || date instanceof Date) && new Date(date) > now;
}

/**
 * Copy a site repository's demo content into a content folder, all but each post that is
 * scheduled at `now`, the page for addresses not found never among them.
 * @param {string} site the site repository's folder
 * @param {string} content the content folder to fill
 * @param {{ now?: Date }} [options] `now`, the moment of copying, after which a post's date makes it scheduled
 * @returns {{ from: string, scheduled: string[] }} the folder copied, and each post left out, by its path in it
 */
export function copyDemoContent(site, content, { now = new Date() } = {}) {
  const from = demoContentOf(site);
  const scheduled = [];
  cpSync(from, content, {
    recursive: true,
    filter: (path) => {
      const inner = path.slice(from.length + 1);
      if (!path.endsWith('.md') || inner === NOT_FOUND_FILE || inner.startsWith(`${NOT_FOUND_FOLDER}/`)) return true;
      if (!isScheduled(readPost(readFileSync(path, 'utf8')).fields, now)) return true;
      scheduled.push(inner);
      return false;
    },
  });
  return { from, scheduled: scheduled.sort() };
}
