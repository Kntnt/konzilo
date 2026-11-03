#!/usr/bin/env node
// Print the current second-factor code of a local copy's seeded account, for
// signing in: `docker compose run --rm code`.

import { readFileSync } from 'node:fs';

import { totp } from '../src/totp.js';

console.log(totp(readFileSync('/state/account-totp', 'utf8').trim()));
