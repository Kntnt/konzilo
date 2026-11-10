#!/usr/bin/env node
// Write Sveltia's configuration for a site, from its description and where this
// copy of it runs, on a local start and at deploy. It is never committed, so
// nothing can drift (ADR 0029). The file is in the site's interface language, and
// beside it, `config.<language>.json` for a file `config.json`, is one in each
// language the interface comes in, which the editor takes for an editor who has
// chosen one (ADR 0066).
//
//   konzilo-cms <the site's folder> <the file to write>
//
// KONZILO_FORGEJO_ORIGIN, KONZILO_SITE_ORIGIN, KONZILO_REPOSITORY and
// KONZILO_OAUTH_CLIENT say where, and KONZILO_PREVIEW_ORIGIN where its live preview
// is, if it has one. Refuses a description the checker refuses.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { INTERFACE_LANGUAGES } from '../src/catalogues.js';
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

const description = readSiteDescription(join(resolve(site), SITE_DESCRIPTION_FILE));
const place = {
  forgejo: needed('KONZILO_FORGEJO_ORIGIN'),
  site: needed('KONZILO_SITE_ORIGIN'),
  repository: needed('KONZILO_REPOSITORY'),
  clientId: needed('KONZILO_OAUTH_CLIENT'),
  preview: process.env.KONZILO_PREVIEW_ORIGIN || null,
};
const write = (file, config) => writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);

mkdirSync(dirname(resolve(out)), { recursive: true });
write(out, cmsConfig(description, place));
for (const language of INTERFACE_LANGUAGES) write(out.replace(/(\.json)?$/, `.${language}.json`), cmsConfig(description, { ...place, language }));
