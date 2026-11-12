// The site description of the code in use, as the service reads it (ADR 0044): read again when
// its file changes, a description that cannot be read leaving the last one that could in use,
// which it says. A file replaced, as Git and an editor write one, is a new file, which its inode
// tells apart from the old one even where its size and its moment are the same; Compose mounts the
// site's folder for the service rather than the file alone, since a mount of one file holds on to
// the file it was made with (compose/compose.yaml). The service reads no body, so it reads the
// description without the components it takes from a package, which the site's folder need not
// have installed.

import { statSync } from 'node:fs';

import { readSiteDescription } from '../site-description.js';

// `file`: the site description's path. `warn`: where it says that it goes on with the last one.
// Gives a function that gives the description as checked.
export function liveDescription(file, { warn = console.error } = {}) {
  const described = () => readSiteDescription(file, undefined, { componentsFrom: false });
  let held = { at: null, site: described() };
  return () => {
    let at = null;
    try {
      const { ino, mtimeMs, size } = statSync(file);
      at = `${ino}:${mtimeMs}:${size}`;
    } catch {
      return held.site;
    }
    if (at === held.at) return held.site;
    try {
      held = { at, site: described() };
    } catch (error) {
      warn(`The service goes on with the site description it read before: ${error.message}`);
      held = { ...held, at };
    }
    return held.site;
  };
}
