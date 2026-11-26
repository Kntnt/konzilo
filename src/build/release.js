// The releases a web server serves from one folder: each a complete set of pages with the web
// server's rules beside them, the redirects the service reads, and the consent revision it reads
// where the build wrote one, and `current`, a link that moves to a new one all at once, so that a
// visitor gets one release or the other and never a mix. Only the one before stays with it, since
// a request may still be reading it.

import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { ALTERNATE_MARKS } from './web-server.js';

const RELEASES = 'releases';
const CURRENT = 'current';
const KEPT = 2;
const PAGES = 'pages';
const RULES = 'web-rules.caddy';
// The release's redirects as the build wrote them, beside its pages, which the log of addresses
// not found reads (ADR 0040).
const REDIRECTS = '_redirects';
// What a build writes for the web server, and no address of a visitor's.
export const FOR_THE_WEB_SERVER = ['_headers', '_redirects', '_markdown'];
// What a public build writes for the service: its consent revision with what its pages showed
// (ADR 0049), which the release holds beside its pages, where the service reads it.
const FOR_THE_SERVICE = '_consent.json';
const CONSENT = 'consent.json';

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

    // Copies `built` in as the release `name`, with these rules and the build's redirects beside
    // its pages and the marks of its Markdown alternates among them, `marks`, each an empty file
    // at its path from the pages' root (web-server.js), in place of any the build wrote there, and
    // makes it what visitors get. The web server looks for a change of its rules by itself, and
    // for a mark at each request. `alone`: no release from before stays, as after a purge, which
    // one may hold what it took (ADR 0078).
    publish(built, name, rules = '', marks = [], { alone = false } = {}) {
      mkdirSync(below, { recursive: true });
      const making = join(below, `.${name}`);
      rmSync(making, { recursive: true, force: true });
      cpSync(built, join(making, PAGES), { recursive: true });
      writeFileSync(join(making, REDIRECTS), existsSync(join(built, REDIRECTS)) ? readFileSync(join(built, REDIRECTS)) : '');
      for (const file of FOR_THE_WEB_SERVER) rmSync(join(making, PAGES, file), { force: true });
      if (existsSync(join(making, PAGES, FOR_THE_SERVICE))) renameSync(join(making, PAGES, FOR_THE_SERVICE), join(making, CONSENT));
      rmSync(join(making, PAGES, ALTERNATE_MARKS), { recursive: true, force: true });
      for (const mark of marks) {
        mkdirSync(dirname(join(making, PAGES, mark)), { recursive: true });
        writeFileSync(join(making, PAGES, mark), '');
      }
      writeFileSync(join(making, RULES), rules);
      renameSync(making, join(below, name));
      const link = join(folder, `.${CURRENT}`);
      rmSync(link, { force: true });
      symlinkSync(join(RELEASES, name), link);
      renameSync(link, join(folder, CURRENT));
      this.tidy(alone ? 1 : KEPT);
    },

    // Removes what no longer serves: older releases, one that a stop left half made, and
    // whatever else lies in the folder, which only this code writes in.
    tidy(kept = KEPT) {
      for (const name of readdirSync(folder)) {
        if (name !== RELEASES && name !== CURRENT) rmSync(join(folder, name), { recursive: true, force: true });
      }
      if (!existsSync(below)) return;
      const here = current();
      const names = readdirSync(below).filter((name) => lstatSync(join(below, name)).isDirectory());
      const staying = new Set(names.filter((name) => !name.startsWith('.')).sort().slice(-kept));
      if (here) staying.add(here);
      for (const name of names) if (!staying.has(name)) rmSync(join(below, name), { recursive: true, force: true });
    },
  };
}
