// The releases a web server serves from one folder: each a complete set of pages with the web
// server's rules beside them, and `current`, a link that moves to a new one all at once, so that
// a visitor gets one release or the other and never a mix. Only the one before stays with it,
// since a request may still be reading it.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const RELEASES = 'releases';
const CURRENT = 'current';
const KEPT = 2;
const PAGES = 'pages';
const RULES = 'web-rules.caddy';
// What a build writes for the web server, and no address of a visitor's.
export const FOR_THE_WEB_SERVER = ['_headers', '_redirects', '_markdown'];

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

    // Copies `built` in as the release `name`, with these rules beside its pages, and makes it
    // what visitors get. The web server looks for a change of its rules by itself.
    publish(built, name, rules = '') {
      mkdirSync(below, { recursive: true });
      const making = join(below, `.${name}`);
      rmSync(making, { recursive: true, force: true });
      cpSync(built, join(making, PAGES), { recursive: true });
      for (const file of FOR_THE_WEB_SERVER) rmSync(join(making, PAGES, file), { force: true });
      writeFileSync(join(making, RULES), rules);
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
