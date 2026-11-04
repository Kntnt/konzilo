#!/usr/bin/env node
// An operator's confirmation of a deletion the guard stopped (ADR 0028): the code the build's
// log gave, which holds for the next build alone, and only for exactly that deletion.
//
//   docker compose exec builder node /konzilo/bin/konzilo-confirm.js <code>

import { buildControl } from '../src/build/record.js';

const [code] = process.argv.slice(2);
if (!/^[0-9a-f]{8}$/.test(code ?? '')) {
  console.error('usage: konzilo-confirm <the eight digits of the deletion\'s code>');
  process.exit(2);
}
const control = buildControl('/control');
control.confirm(code);
control.request();
console.log('Confirmed for the next build, which is now asked for.');
