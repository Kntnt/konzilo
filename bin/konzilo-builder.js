#!/usr/bin/env node
// The builder container's one program (ADR 0031): it prepares the site's code once, writes the
// editor's configuration, and then sleeps and builds when asked. It builds once at each start,
// which costs nothing when nothing has changed, since a new image is new code. A first build
// that makes no site stops it, so that `up --wait` says so at once.

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';

import { astroBuild, intakeCommand, siteBuild } from '../src/build/build.js';
import { buildControl } from '../src/build/record.js';
import { releases } from '../src/build/release.js';
import { contentRepository, sourceRepository } from '../src/build/repositories.js';
import { buildOnRequest } from '../src/build/requests.js';
import { forgejoRoles } from '../src/build/roles.js';
import { searchDocumentsCommand, siteSearch } from '../src/build/search-index.js';
import { walk } from '../src/intake/content-folder.js';
import { readSiteDescription } from '../src/site-description.js';

const run = promisify(execFile);

const SITE_FOLDER = '/work/site';
const FORGEJO = 'http://forgejo:3000';
// Typesense, in the network the web server shares with it (compose.yaml).
const TYPESENSE = 'http://typesense:8108';
// Where the web server reads the route to search from, outside every release.
const SEARCH_ROUTE_FILE = '/search-route/search-route.caddy';
const ACCOUNT = 'builder';
const HOME = '/work/home';
const INSTANCE = 'konzilo';

const {
  KONZILO_SITE: site,
  KONZILO_REPOSITORY: repository,
  KONZILO_ORIGIN: origin,
  KONZILO_ADMIN_ORIGIN: adminOrigin,
} = process.env;

const secret = (name) => readFileSync(`/secret/${name}`, 'utf8').trim();
const token = secret('token');
const access = { user: ACCOUNT, token, home: HOME };

// What names the site's code as it stands: the files it was given, none of what a local copy
// keeps beside them, and the core it has installed. Not the folder it builds in, where a build
// leaves files of its own.
function codeOf(site, core) {
  const hash = createHash('sha256');
  const own = readdirSync(site).filter((name) => !['node_modules', 'dist', 'content', 'demo-content', 'local-secrets'].includes(name) && !name.startsWith('.'));
  const files = [
    ...own.flatMap((name) => (statSync(join(site, name)).isDirectory() ? walk(join(site, name)) : [join(site, name)])),
    ...walk(core).filter((path) => !relative(core, path).includes('node_modules')),
  ].sort();
  for (const path of files) hash.update(`${path}\0`).update(readFileSync(path)).update('\0');
  return hash.digest('hex');
}

await run('sh', ['/konzilo/compose/builder/prepare-site.sh', '--exclude=./content', '--exclude=./demo-content'], { maxBuffer: 1024 * 1024 * 64 });

await run(process.execPath, ['/konzilo/bin/konzilo-cms.js', SITE_FOLDER, '/admin-config/config.json'], {
  env: { ...process.env, KONZILO_OAUTH_CLIENT: secret('oauth-client') },
});

const environment = { PATH: process.env.PATH, HOME, ASTRO_TELEMETRY_DISABLED: '1', KONZILO_ORIGIN: origin };
const control = buildControl('/control');
const live = releases('/public');
const source = sourceRepository({ remote: `${FORGEJO}/${repository}.git`, folder: '/work/source', access });
const content = contentRepository({ remote: `${FORGEJO}/${repository.split('/')[0]}/content.git`, folder: `${SITE_FOLDER}/content`, access });

const build = siteBuild({
  site,
  origin,
  code: codeOf('/site', `${SITE_FOLDER}/node_modules/@kntnt/konzilo`),
  source,
  content,
  roles: forgejoRoles({ forgejo: FORGEJO, repository, token: secret('roles-token'), instance: INSTANCE, folder: '/work/roles' }),
  control,
  live,
  intake: intakeCommand({
    program: '/konzilo/bin/konzilo-intake.js',
    siteFolder: SITE_FOLDER,
    contentFolder: content.folder,
    // A link to the admin host is refused, unless the site has the same name, as on a local copy.
    environment: { PATH: process.env.PATH, HOME, ...(new URL(adminOrigin).hostname === new URL(origin).hostname ? {} : { KONZILO_ADMIN_ORIGIN: adminOrigin }) },
  }),
  astro: astroBuild({ folder: SITE_FOLDER, environment }),
  // Of the site's code as it stands, which is the same for this builder's life; its documents by
  // the core the site has installed, which has the site's Astro to read its content files with.
  index: siteSearch({
    typesense: TYPESENSE,
    key: secret('typesense-admin-key'),
    searchKey: secret('typesense-search-key'),
    collection: site,
    site: readSiteDescription(join(SITE_FOLDER, 'site-description.json')),
    documents: searchDocumentsCommand({
      program: join(SITE_FOLDER, 'node_modules/@kntnt/konzilo/bin/konzilo-search.js'),
      site: join(SITE_FOLDER, 'site-description.json'),
      content: content.folder,
      environment,
    }),
    route: SEARCH_ROUTE_FILE,
  }),
});

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
  process.exit(0);
});

control.request();
let first = true;
await buildOnRequest({
  control,
  build,
  going: () => !stopping,
  built: () => {
    if (!first) return;
    first = false;
    if (live.current() === null) {
      console.error('The first build made no site, so this copy has nothing to show.');
      process.exit(1);
    }
    writeFileSync('/tmp/built', '');
  },
});
