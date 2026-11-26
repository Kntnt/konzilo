// What a site's builds leave behind, in one folder that the builder and the service share:
// the build request, the record of the last build, the code of a deletion an operator has
// confirmed, and the build log (ADR 0031); and what a purge needs of them, which the purge's own
// program shares too (ADR 0078): two marks, one while a purge holds the builds back and one while
// a build runs, so that neither runs while the other does. What the service asks of the purge's
// program is in a folder the builder does not share (purge/control.js). Written whole and then
// moved into place, so that a reader never meets half a file.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REQUEST = 'build-request';
const RECORD = 'published.json';
const CONFIRMED = 'confirmed-deletion';
const LOG = 'build-log.jsonl';
const PURGING = 'purging';
const BUILDING = 'building';

export function buildControl(folder) {
  const place = (name) => join(folder, name);
  const whole = (name, text) => {
    mkdirSync(dirname(place(name)), { recursive: true });
    writeFileSync(`${place(name)}.new`, text);
    renameSync(`${place(name)}.new`, place(name));
  };
  return {
    // A request written during a build stays for one more; many are one.
    request: () => whole(REQUEST, ''),
    requested: () => existsSync(place(REQUEST)),
    takeRequest: () => rmSync(place(REQUEST), { force: true }),

    record: () => {
      try {
        return JSON.parse(readFileSync(place(RECORD), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') return null;
        throw error;
      }
    },
    writeRecord: (record) => whole(RECORD, `${JSON.stringify(record, null, 2)}\n`),

    confirm: (code) => whole(CONFIRMED, `${code}\n`),
    // Holds for the next build alone, whatever that build finds (ADR 0028).
    takeConfirmed: () => {
      if (!existsSync(place(CONFIRMED))) return null;
      const code = readFileSync(place(CONFIRMED), 'utf8').trim();
      rmSync(place(CONFIRMED));
      return code;
    },

    log: (line) => {
      mkdirSync(folder, { recursive: true });
      appendFileSync(place(LOG), `${JSON.stringify(line)}\n`);
    },
    // The build log without each line `names(line)` says names what a purge took, its text.
    scrubLog: (names) => {
      if (!existsSync(place(LOG))) return;
      const lines = readFileSync(place(LOG), 'utf8').split('\n').filter((line) => line !== '' && !names(line));
      whole(LOG, lines.map((line) => `${line}\n`).join(''));
    },

    // A purge holds the builds back while it runs, and waits for one that runs to end: each says
    // so first and then looks at the other, so that one of them always sees the other.
    holdBuilds: () => whole(PURGING, ''),
    releaseBuilds: () => rmSync(place(PURGING), { force: true }),
    buildsHeld: () => existsSync(place(PURGING)),
    building: (now) => (now ? whole(BUILDING, '') : rmSync(place(BUILDING), { force: true })),
    isBuilding: () => existsSync(place(BUILDING)),
  };
}
