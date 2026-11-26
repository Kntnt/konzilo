#!/usr/bin/env node
// The purge's container's one program (ADR 0078): it holds the instance's account's credential,
// which alone may rewrite the source repository's history (ADR 0007), takes nothing from outside
// but the purge, or the search for a passage, the service asks for in the folder the two of them
// alone share, and sleeps until one is asked for. It holds the builds back by the folder it shares
// with the builder. It finds Forgejo, its credential and the folder it works in where the
// arrangement says (src/arrangement.js).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { arrangement } from '../src/arrangement.js';
import { buildControl } from '../src/build/record.js';
import { purgeControl } from '../src/purge/control.js';
import { forgejoPurge, forgejoSearch } from '../src/purge/forgejo.js';
import { purgeOnRequest } from '../src/purge/program.js';

const { forgejo: FORGEJO, secrets, work } = arrangement();
const { KONZILO_REPOSITORY: repository } = process.env;

const control = buildControl('/control');
const token = readFileSync(join(secrets, 'token'), 'utf8').trim();

let stopping = false;
process.on('SIGTERM', () => {
  stopping = true;
  process.exit(0);
});

await purgeOnRequest({
  control,
  purgeControl: purgeControl('/purge-control'),
  purge: forgejoPurge({ forgejo: FORGEJO, repository, token, work, control }),
  search: forgejoSearch({ forgejo: FORGEJO, repository, token, work }),
  going: () => !stopping,
});
