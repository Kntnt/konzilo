#!/usr/bin/env node
// The preview container's one program (ADR 0032): the gate, which stands at once, and behind
// it the runs of the intake and Astro's dev server, which wait until someone opens an entry.
// It takes its settings from the environment, as Compose gives them, and its folders are the
// container's own. The dev server gets none of this environment, and the credential is never
// passed to anything but Git.

import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { promisify } from 'node:util';

import { componentChecksOf } from '../src/intake/component-checks.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE } from '../src/site-description.js';
import { devServer } from '../src/preview/dev-server.js';
import { previewGate } from '../src/preview/gate.js';
import { previewRunner } from '../src/preview/runner.js';
import { gitSource } from '../src/preview/source.js';

const run = promisify(execFile);

const PORT = 4000;
const DEV_PORT = 4001;
const SITE_FOLDER = '/work/site';
const FORGEJO = 'http://forgejo:3000';
const READER = 'preview-reader';

const {
  KONZILO_SITE: site,
  KONZILO_REPOSITORY: repository,
  KONZILO_SITE_ORIGIN: siteOrigin,
  KONZILO_ADMIN_ORIGIN: adminOrigin,
  KONZILO_PREVIEW_ORIGIN: origin,
} = process.env;

// The site's code first, without what a site repository may hold of a local copy's content.
const prepared = run('sh', ['/konzilo/compose/builder/prepare-site.sh', '--exclude=./content'], { maxBuffer: 1024 * 1024 * 64 }).then(() => {
  mkdirSync(`${SITE_FOLDER}/content`, { recursive: true });
});
prepared.catch((error) => console.error(`The preview could not prepare the site: ${error.message}`));

// A link to the admin host is refused, unless the site has the same name, as on a local copy.
const adminName = new URL(adminOrigin).hostname;
const adminHost = new URL(siteOrigin).hostname === adminName ? null : adminName;

const source = gitSource({
  remote: `${FORGEJO}/${repository}.git`,
  user: READER,
  token: readFileSync('/secret/read-token', 'utf8').trim(),
  folder: '/work/source',
  home: '/work/home',
});

const described = readSiteDescription(`/site/${SITE_DESCRIPTION_FILE}`);
const runner = previewRunner({ site: described, source, content: `${SITE_FOLDER}/content`, adminHost, components: await componentChecksOf(described, '/site') });

const dev = devServer({
  root: SITE_FOLDER,
  port: DEV_PORT,
  environment: {
    PATH: process.env.PATH,
    HOME: '/work/home',
    KONZILO_PREVIEW: '1',
    KONZILO_ORIGIN: siteOrigin,
    ASTRO_TELEMETRY_DISABLED: '1',
    ASTRO_DISABLE_UPDATE_CHECK: 'true',
  },
  // A dev server finds a content folder with something in it.
  before: async () => {
    await prepared;
    await runner.refresh();
  },
});

const gate = previewGate({
  origin,
  adminOrigin,
  forgejo: FORGEJO,
  repository,
  cookieName: `${site}_preview`,
  dev,
  runner: {
    problem: runner.problem,
    take: async (draft) => {
      await prepared;
      return runner.take(draft);
    },
  },
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
