// Where a local copy's demo content comes from (ADR 0025): the site repository's own, in its
// `demo-content/`, published content files as the core's are, else the core's. The command
// that fills a local copy's content folder and Compose's seed both ask here, so that a
// developer's copy and the editor's start from the same fiction.

import { existsSync } from 'node:fs';
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
