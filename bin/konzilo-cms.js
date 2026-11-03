#!/usr/bin/env node
// Write Sveltia's configuration for a site, from its description and where this
// copy of it runs, on a local start and at deploy. It is never committed, so
// nothing can drift (ADR 0029).
//
//   konzilo-cms <the site's folder> <the file to write>
//
// KONZILO_FORGEJO_ORIGIN, KONZILO_SITE_ORIGIN, KONZILO_REPOSITORY and
// KONZILO_OAUTH_CLIENT say where. Refuses a description the checker refuses.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { cmsConfig } from '../src/cms/config.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE } from '../src/site-description.js';

const [site, out] = process.argv.slice(2);
if (!site || !out) {
  console.error('usage: konzilo-cms <the site\'s folder> <the file to write>');
  process.exit(2);
}

const needed = (name) => {
  const value = process.env[name];
  if (!value) {
    console.error(`konzilo-cms: ${name} is not set`);
    process.exit(2);
  }
  return value;
};

const config = cmsConfig(readSiteDescription(join(resolve(site), SITE_DESCRIPTION_FILE)), {
  forgejo: needed('KONZILO_FORGEJO_ORIGIN'),
  site: needed('KONZILO_SITE_ORIGIN'),
  repository: needed('KONZILO_REPOSITORY'),
  clientId: needed('KONZILO_OAUTH_CLIENT'),
});

mkdirSync(dirname(resolve(out)), { recursive: true });
writeFileSync(out, `${JSON.stringify(config, null, 2)}\n`);
