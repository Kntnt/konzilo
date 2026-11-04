// What a site's builds leave behind, in one folder that the builder and the service share:
// the build request, the record of the last build, the code of a deletion an operator has
// confirmed, and the build log (ADR 0031). Written whole and then moved into place, so that
// a reader never meets half a file.

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const REQUEST = 'build-request';
const RECORD = 'published.json';
const CONFIRMED = 'confirmed-deletion';
const LOG = 'build-log.jsonl';

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
  };
}
