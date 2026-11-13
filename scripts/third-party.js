#!/usr/bin/env node
// Write THIRD-PARTY.md: every package the lock names, with its version and the
// license the lock records, so that each has its line and none is forgotten when
// one is added. A test holds the file to the lock (tests/licenses.test.js).
//
//   third-party    write THIRD-PARTY.md from package-lock.json
//
// The lock, not node_modules, is read: an install holds only the packages of the
// machine's own platform, and the lock names those of every platform.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { byText } from './notices.js';

const root = new URL('../', import.meta.url);

// A package's name is what follows the last `node_modules/` of its path in the lock.
// One that is installed at two places in the same version has one line.
export const packages = (lock) => {
  const lines = new Map();
  for (const [path, { version, license }] of Object.entries(lock.packages)) {
    if (path === '') continue;
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    lines.set(`${name}@${version}`, { name, version, license: license ?? 'none named' });
  }
  return [...lines.values()].sort((a, b) => byText(a.name, b.name) || byText(a.version, b.version));
};

export const render = (lock) =>
  [
    '# Packages the core installs',
    '',
    'Every package that `package-lock.json` names, on every platform, with the version and the license the lock records. Each comes under its own license, whose text is in its own folder once it is installed. `scripts/third-party.js` writes this file, and a test fails when it has fallen behind the lock.',
    '',
    '[`ACKNOWLEDGEMENTS.md`](ACKNOWLEDGEMENTS.md) names what Konzilo is built on, with thanks, and says how the licenses fit. What the editor\'s application holds is in `third-party-notices.txt` beside it, each package with its license text, which its build writes.',
    '',
    '| Package | Version | License |',
    '|---|---|---|',
    ...packages(lock).map(({ name, version, license }) => `| [\`${name}\`](https://www.npmjs.com/package/${name}) | ${version} | ${license} |`),
    '',
  ].join('\n');

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const lock = JSON.parse(readFileSync(new URL('package-lock.json', root), 'utf8'));
  writeFileSync(new URL('THIRD-PARTY.md', root), render(lock));
  console.log(`THIRD-PARTY.md: ${packages(lock).length} packages`);
}
