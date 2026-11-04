// The releases a web server serves from one folder: each a complete set of pages, and `current`,
// a link that moves to a new one all at once, so that a visitor gets one release or the other
// and never a mix. Only the one before stays with it, since a request may still be reading it.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { basename, join } from 'node:path';

const RELEASES = 'releases';
const CURRENT = 'current';
const KEPT = 2;

export function releases(folder) {
  const below = join(folder, RELEASES);
  const current = () => {
    try {
      return basename(readlinkSync(join(folder, CURRENT)));
    } catch {
      return null;
    }
  };
  return {
    current,

    // Copies `built` in as the release `name`, and makes it what visitors get.
    publish(built, name) {
      mkdirSync(below, { recursive: true });
      const making = join(below, `.${name}`);
      rmSync(making, { recursive: true, force: true });
      cpSync(built, making, { recursive: true });
      renameSync(making, join(below, name));
      const link = join(folder, `.${CURRENT}`);
      rmSync(link, { force: true });
      symlinkSync(join(RELEASES, name), link);
      renameSync(link, join(folder, CURRENT));
      this.tidy();
    },

    // Removes what no longer serves: older releases, one that a stop left half made, and
    // whatever else lies in the folder, which only this code writes in.
    tidy() {
      for (const name of readdirSync(folder)) {
        if (name !== RELEASES && name !== CURRENT) rmSync(join(folder, name), { recursive: true, force: true });
      }
      if (!existsSync(below)) return;
      const here = current();
      const names = readdirSync(below).filter((name) => lstatSync(join(below, name)).isDirectory());
      const kept = new Set(names.filter((name) => !name.startsWith('.')).sort().slice(-KEPT));
      if (here) kept.add(here);
      for (const name of names) if (!kept.has(name)) rmSync(join(below, name), { recursive: true, force: true });
    },
  };
}
