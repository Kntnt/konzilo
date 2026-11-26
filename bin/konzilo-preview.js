#!/usr/bin/env node
// The preview container's one program (ADR 0032): the gate, which stands at once, and behind
// it the runs of the intake and Astro's dev server, which wait until someone opens an entry or
// a page.
// It takes its settings from the environment, as Compose gives them, and finds Forgejo, its
// credentials and the folder it works in where the arrangement says (src/arrangement.js), by
// default the container's own. The dev server gets none of this environment, and the credential
// is never passed to anything but Git.

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { arrangement } from '../src/arrangement.js';
import { prepareSiteCode } from '../src/site-code.js';
import { readSiteDescriptionWithoutTakenComponents, SITE_DESCRIPTION_FILE } from '../src/site-description.js';
import { devServer } from '../src/preview/dev-server.js';
import { previewGate } from '../src/preview/gate.js';
import { runnerOncePrepared } from '../src/preview/runner.js';
import { gitSource } from '../src/preview/source.js';
import { purgeMarks, purgeRecordReader } from '../src/purge/mark.js';

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

const readToken = readFileSync(join(secrets, 'read-token'), 'utf8').trim();

// After a purge (ADR 0078), the checkout of the source and the content folder go, as they may
// hold what it took, and the preview starts again, with nothing of them in its memory: at once as
// it starts, and within half a minute of a purge while it runs, Compose starting it again.
const SOURCE_FOLDER = join(work, 'source');
const purges = purgeMarks({ reader: purgeRecordReader({ forgejo: FORGEJO, repository, token: readToken }), file: join(work, 'purge-mark') });
const forgetWhatWasPurged = async () => {
  if (!await purges.take()) return false;
  rmSync(SOURCE_FOLDER, { recursive: true, force: true });
  rmSync(`${SITE_FOLDER}/content`, { recursive: true, force: true });
  purges.done();
  return true;
};
const purgesLookedAt = forgetWhatWasPurged().catch((error) => {
  console.error(`The preview could not tell whether a purge was made: ${error.message}`);
});
setInterval(() => {
  forgetWhatWasPurged().then((purged) => {
    if (!purged) return;
    console.error('A purge was made, so the preview starts again.');
    process.exit(0);
  }, (error) => console.error(`The preview could not tell whether a purge was made: ${error.message}`));
}, 30_000).unref();

// The site's code first, as it now is, without what a site repository may hold of a local copy's
// content, or its own demo content, with its dependencies installed only when what they are
// installed from has changed.
const prepared = purgesLookedAt.then(() => prepareSiteCode(work)).then(() => {
  mkdirSync(`${SITE_FOLDER}/content`, { recursive: true });
});
prepared.catch((error) => console.error(`The preview could not prepare the site: ${error.message}`));

// A link to the admin host is refused, unless the site has the same name, as on a local copy.
const adminName = new URL(adminOrigin).hostname;
const adminHost = new URL(siteOrigin).hostname === adminName ? null : adminName;

const source = gitSource({
  remote: `${FORGEJO}/${repository}.git`,
  user: READER,
  token: readToken,
  folder: SOURCE_FOLDER,
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
  // A dev server finds a content folder with something in it: the site as it stands now.
  before: async () => {
    await runner.show(null);
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
