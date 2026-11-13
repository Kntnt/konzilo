// Where a local copy's demo content comes from (ADR 0025): the site repository's own, in its
// `demo-content/`, published content files as the core's are, else the core's. The command
// that fills a local copy's content folder and Compose's seed both ask here, so that a
// developer's copy and the editor's start from the same fiction.
//
// A post of the demo content dated after the moment it is read is a scheduled post: the seed
// makes it a scheduled source file, which the intake publishes at its moment, and a copy
// without Compose, which has no clock that publishes, leaves it out. Both ask here too, so
// that they cannot disagree on which post that is.

import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
 * @param {string} text a post's content file
 * @param {Date} now the moment it is read
 * @returns {boolean} whether the post is dated after that moment, and so is scheduled for its date
 */
export function isScheduled(text, now) {
  const head = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text)?.[1] ?? '';
  const date = /^date: "?([^"\n]+?)"?$/m.exec(head)?.[1];
  return date !== undefined && new Date(date) > now;
}

/**
 * Copy a site repository's demo content into a content folder, all but each post that is
 * scheduled at `now`.
 * @param {string} site the site repository's folder
 * @param {string} content the content folder to fill
 * @param {Date} [now] the moment of copying
 * @returns {{ from: string, scheduled: string[] }} the folder copied, and each post left out, by its path in it
 */
export function copyDemoContent(site, content, now = new Date()) {
  const from = demoContentOf(site);
  const scheduled = [];
  cpSync(from, content, {
    recursive: true,
    filter: (path) => {
      if (!path.endsWith('.md') || !isScheduled(readFileSync(path, 'utf8'), now)) return true;
      scheduled.push(path.slice(from.length + 1));
      return false;
    },
  });
  return { from, scheduled: scheduled.sort() };
}
