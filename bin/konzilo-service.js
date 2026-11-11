#!/usr/bin/env node
// The service (ADR 0044), one program in two roles, each a container of its own, named as its
// first argument:
//
// - `editors`: it takes Forgejo's webhook, keeps time, says how publishing stands, shows small
//   pictures of images, and shows Admins and Editors the forms' submissions from the service's
//   data. It has a credential that can only read the source repository.
// - `visitors`: it takes what visitors' browsers send below /_konzilo/, which the web server
//   passes on, such as a site's forms (ADR 0045), and keeps it in the service's data. It reaches
//   nothing.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

import { buildControl } from '../src/build/record.js';
import { editorsService, nextMinute } from '../src/service/editors.js';
import { liveDescription } from '../src/service/live-description.js';
import { openStore, STORE_FILE } from '../src/service/store.js';
import { thumbnails } from '../src/service/thumbnails.js';
import { visitorsService } from '../src/service/visitors.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE } from '../src/site-description.js';

// In the site's folder, which Compose mounts whole, so that a description replaced is seen.
const DESCRIPTION = `/site/${SITE_DESCRIPTION_FILE}`;
// The service's data, which both roles open: the role for visitors keeps the forms' submissions
// there, and the role for editors shows them.
const SERVICE_DATA = '/service-data';

// A request answered, or 500 where the service broke, which it says in its own log, with nothing
// of the request.
const serve = (service, port, options = {}) => {
  const server = createServer(options, (incoming, outgoing) => {
    service.request(incoming, outgoing).catch((error) => {
      console.error(`The service broke: ${error.stack ?? error.message}`);
      if (!outgoing.headersSent) outgoing.writeHead(500, { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      outgoing.end();
    });
  });
  server.listen(port);
  return server;
};

function editors(store) {
  const PORT = 4100;
  const FORGEJO = 'http://forgejo:3000';
  const { KONZILO_REPOSITORY: repository } = process.env;

  const site = readSiteDescription(DESCRIPTION);
  const collections = Object.values(site.types).map(({ collection }) => collection);
  const described = liveDescription(DESCRIPTION);

  const token = readFileSync('/secret/read-token', 'utf8').trim();

  const service = editorsService({
    forgejo: FORGEJO,
    repository,
    token,
    control: buildControl('/control'),
    pictures: thumbnails({ forgejo: FORGEJO, repository, token, folder: '/thumbnails' }),
    store,
    forms: () => described().forms,
    isPost: (file) => file.endsWith('.md') && collections.includes(file.split('/')[0]),
  });
  serve(service, PORT);

  const atEachMinute = () => {
    setTimeout(async () => {
      await service.tick().catch((error) => console.error(`The service's clock broke: ${error.stack ?? error.message}`));
      atEachMinute();
    }, nextMinute(Date.now()));
  };
  atEachMinute();
}

function visitors(store) {
  const PORT = 4200;
  // The public site's origin, whose host a form's page is on.
  const hosts = process.env.KONZILO_SITE_ORIGIN ? [new URL(process.env.KONZILO_SITE_ORIGIN).host] : [];
  const service = visitorsService({ site: liveDescription(DESCRIPTION), store, hosts });
  // Each request within ten seconds (ADR 0044).
  serve(service, PORT, { requestTimeout: 10_000, headersTimeout: 10_000 });
}

const roles = { editors, visitors };
const role = process.argv[2];
if (!Object.hasOwn(roles, role)) {
  console.error(`konzilo-service: name its role, ${Object.keys(roles).join(' or ')}`);
  process.exit(2);
}
// Either role opens the service's data once, and stops one way, its data closed first.
const store = openStore(join(SERVICE_DATA, STORE_FILE));
process.on('SIGTERM', () => {
  store.close();
  process.exit(0);
});
roles[role](store);
