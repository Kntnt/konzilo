#!/usr/bin/env node
// Print the current second-factor code of one of a local copy's people, for signing in:
// `docker compose run --rm code [name]`, the account `KONZILO_ACCOUNT` names where no name is
// given (src/people.js).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ACCOUNT_NAME, keyFileOf } from '../src/people.js';
import { totp } from '../src/totp.js';

const STATE = '/state';
const known = (file) => (existsSync(join(STATE, file)) ? readFileSync(join(STATE, file), 'utf8').trim() : null);

const account = known(ACCOUNT_NAME) ?? process.env.KONZILO_ACCOUNT;
const [asked = process.env.KONZILO_ACCOUNT] = process.argv.slice(2);

// The people whose keys are kept here, to name where the one asked for has none.
const people = () => [
  ...(known('account-totp') && account ? [account] : []),
  ...(existsSync(join(STATE, 'people')) ? readdirSync(join(STATE, 'people')).filter((file) => file.endsWith('-totp')).map((file) => file.slice(0, -'-totp'.length)) : []),
];

try {
  const key = known(asked ? keyFileOf(asked, account) : 'account-totp');
  if (!key) throw new Error(`no key for ${asked ?? 'the account'}; the people with one: ${people().join(', ') || 'none yet'}`);
  console.log(totp(key));
} catch (error) {
  console.error(`konzilo-code: ${error.message}`);
  process.exitCode = 1;
}
