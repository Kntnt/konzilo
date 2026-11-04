#!/usr/bin/env node
// The service, in its role for editors (ADR 0044): it takes Forgejo's webhook, keeps time, and
// says how publishing stands. It has a credential that can only read the source repository.

import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

import { buildControl } from '../src/build/record.js';
import { editorsService, nextMinute } from '../src/service/editors.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE } from '../src/site-description.js';

const PORT = 4100;
const FORGEJO = 'http://forgejo:3000';
const { KONZILO_REPOSITORY: repository } = process.env;

const site = readSiteDescription(`/site/${SITE_DESCRIPTION_FILE}`);
const collections = Object.values(site.types).map(({ collection }) => collection);

const service = editorsService({
  forgejo: FORGEJO,
  repository,
  token: readFileSync('/secret/read-token', 'utf8').trim(),
  control: buildControl('/control'),
  isPost: (file) => file.endsWith('.md') && collections.includes(file.split('/')[0]),
});

const server = createServer((incoming, outgoing) => {
  service.request(incoming, outgoing).catch((error) => {
    console.error(`The service broke: ${error.stack ?? error.message}`);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  });
});
server.listen(PORT);

const atEachMinute = () => {
  setTimeout(async () => {
    await service.tick().catch((error) => console.error(`The service's clock broke: ${error.stack ?? error.message}`));
    atEachMinute();
  }, nextMinute(Date.now()));
};
atEachMinute();

process.on('SIGTERM', () => process.exit(0));
