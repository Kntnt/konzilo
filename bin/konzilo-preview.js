#!/usr/bin/env node
// The preview container's one program (ADR 0032): the gate, which stands at once, and behind
// it the runs of the intake and Astro's dev server, which wait until someone opens an entry or
// a page.
// It takes its settings from the environment, as Compose gives them, and finds Forgejo, its
// credentials and the folder it works in where the arrangement says (src/arrangement.js), by
// default the container's own. The dev server gets none of this environment, and the credential
// is never passed to anything but Git.

import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { arrangement } from '../src/arrangement.js';
import { readSiteDescriptionWithoutTakenComponents, SITE_DESCRIPTION_FILE } from '../src/site-description.js';
import { devServer } from '../src/preview/dev-server.js';
import { previewGate } from '../src/preview/gate.js';
import { runnerOncePrepared } from '../src/preview/runner.js';
import { gitSource } from '../src/preview/source.js';

const run = promisify(execFile);

const PORT = 4000;
const DEV_PORT = 4001;
const { forgejo: FORGEJO, secrets, work } = arrangement();
const SITE_FOLDER = join(work, 'site');
const HOME = join(work, 'home');
const READER = 'preview-reader';
// The preview's own OAuth client, which the seed makes, for a sign-in in a tab of its own.
const CLIENT = join(secrets, 'oauth-client');

const {
  KONZILO_SITE: site,
  KONZILO_REPOSITORY: repository,
  KONZILO_SITE_ORIGIN: siteOrigin,
  KONZILO_ADMIN_ORIGIN: adminOrigin,
  KONZILO_FORGEJO_ORIGIN: forgejoOrigin,
  KONZILO_PREVIEW_ORIGIN: origin,
} = process.env;

// The site's code first, as it now is, without what a site repository may hold of a local copy's
// content, or its own demo content, with its dependencies installed only when what they are
// installed from has changed.
const prepared = run('sh', ['/konzilo/compose/builder/prepare-site.sh', work, '--exclude=./content', '--exclude=./demo-content'], { cwd: '/site', maxBuffer: 1024 * 1024 * 64 }).then(() => {
  mkdirSync(`${SITE_FOLDER}/content`, { recursive: true });
});
prepared.catch((error) => console.error(`The preview could not prepare the site: ${error.message}`));

// A link to the admin host is refused, unless the site has the same name, as on a local copy.
const adminName = new URL(adminOrigin).hostname;
const adminHost = new URL(siteOrigin).hostname === adminName ? null : adminName;

const source = gitSource({
  remote: `${FORGEJO}/${repository}.git`,
  user: READER,
  token: readFileSync(join(secrets, 'read-token'), 'utf8').trim(),
  folder: join(work, 'source'),
  home: HOME,
});

// The site description as the gate reads it at once, from the site's folder, and the runs of the
// intake, once the site's code is prepared, with the components it takes.
const described = readSiteDescriptionWithoutTakenComponents(`/site/${SITE_DESCRIPTION_FILE}`);
const runner = runnerOncePrepared({ described, prepared, folder: SITE_FOLDER, source, content: `${SITE_FOLDER}/content`, adminHost });
runner.ready.catch((error) => console.error(`The preview could not read the site: ${error.message}`));

const dev = devServer({
  root: SITE_FOLDER,
  port: DEV_PORT,
  environment: {
    PATH: process.env.PATH,
    HOME,
    KONZILO_PREVIEW: '1',
    KONZILO_ORIGIN: siteOrigin,
    ASTRO_TELEMETRY_DISABLED: '1',
    ASTRO_DISABLE_UPDATE_CHECK: 'true',
  },
  // A dev server finds a content folder with something in it.
  before: async () => {
    await runner.refresh();
  },
});

const gate = previewGate({
  origin,
  adminOrigin,
  forgejo: FORGEJO,
  forgejoOrigin: forgejoOrigin ?? null,
  clientId: existsSync(CLIENT) ? readFileSync(CLIENT, 'utf8').trim() || null : null,
  language: described.interfaceLanguage,
  repository,
  cookieName: `${site}_preview`,
  dev,
  runner,
});

const server = createServer((incoming, outgoing) => {
  gate.request(incoming, outgoing).catch((error) => {
    console.error(`The preview's gate broke: ${error.stack ?? error.message}`);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  });
});
server.on('upgrade', (incoming, socket, head) => gate.upgrade(incoming, socket, head));
server.listen(PORT, '127.0.0.1');

process.on('SIGTERM', () => {
  dev.stop();
  process.exit(0);
});
