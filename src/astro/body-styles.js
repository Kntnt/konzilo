// The site's body styles: the stylesheets a site names to the integration for
// the body text of its posts. Every page loads them.

import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// The integration's option `bodyStyles`, checked: null for a site that names
// no body styles, else `{ stylesheets }`, each stylesheet as Vite imports it,
// a file of the site's (`./` from the root of the site repository) as its
// path, a package's stylesheet by its name. Throws, naming the option, on
// anything else.
export function bodyStylesOf({ bodyStyles } = {}, root) {
  if (bodyStyles === undefined || (Array.isArray(bodyStyles) && bodyStyles.length === 0)) return null;
  if (!Array.isArray(bodyStyles) || bodyStyles.some((sheet) => typeof sheet !== 'string' || sheet.trim() === '')) {
    throw new Error(`Konzilo's option bodyStyles must be a list of stylesheets, each a path from the site's root such as './src/styles/body.css' or a package's stylesheet by its name, not ${JSON.stringify(bodyStyles)}`);
  }
  const stylesheets = bodyStyles.map((sheet) => (sheet.startsWith('./') || sheet.startsWith('../') ? fileURLToPath(new URL(sheet, root)) : sheet));
  return { stylesheets };
}

// The script every page runs in its server part, which makes each page load
// the body styles, as Astro bundles the CSS a page imports.
export function pageImports({ stylesheets }) {
  return stylesheets.map((sheet) => `import ${JSON.stringify(sheet)};`).join('\n');
}

// The file a stylesheet's address names, below the site's base, by the
// folders `folders` (each `[prefix, folder]`, the first match taken); null
// for an address on another host or of no file there.
function fileFinder(base, folders) {
  const prefix = base.endsWith('/') ? base : `${base}/`;
  return (address) => {
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(address) || !address.startsWith('/')) return null;
    let path;
    try {
      path = decodeURIComponent(address.replace(/[?#].*$/s, ''));
    } catch {
      return null;
    }
    const below = path.startsWith(prefix) ? path.slice(prefix.length - 1) : path;
    for (const [start, folder] of folders) {
      if (!below.startsWith(start)) continue;
      const file = start === '/@fs/' ? below.slice('/@fs'.length) : join(folder, below.slice(start.length));
      const inside = start === '/@fs/' || !relative(folder, file).startsWith('..');
      if (inside && isAbsolute(file) && existsSync(file) && statSync(file).isFile()) return file;
    }
    return null;
  };
}

// The files of a build's stylesheet: what Vite wrote into the release, and
// the public folder's files, which Astro copies into it too.
export const releaseFiles = (dir, base) => fileFinder(base, [['/', dir]]);
