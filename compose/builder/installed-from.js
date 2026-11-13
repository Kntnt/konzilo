// What a site's dependencies are installed from, as one hash, which prepare-site.sh keeps beside
// an install that ended and compares at the next start: the site's package.json, its lock and
// its .npmrc, each as it is or as absent; for each dependency pinned by a path, such as a core's
// checkout or a package in the site's vendor/, the files there, a folder's without its
// node_modules and what a dot hides, or a tarball's bytes; and the Node and the platform it was
// installed for.
//
//   node installed-from.js <the site's folder>

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const site = resolve(process.argv[2]);
const hash = createHash('sha256');
const add = (...parts) => {
  for (const part of parts) hash.update(part).update('\0');
};

const file = (name, path) => add(name, ...(existsSync(path) ? ['present', readFileSync(path)] : ['absent']));

// A folder's files in a fixed order, each by its path in it.
function folder(name, root) {
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const inner = join(path, entry.name);
      if (entry.isDirectory()) walk(inner);
      else if (entry.isSymbolicLink()) add(name, relative(root, inner), 'link', readlinkSync(inner));
      else if (entry.isFile()) add(name, relative(root, inner), readFileSync(inner));
    }
  };
  walk(root);
}

add(process.version, process.platform, process.arch);
for (const name of ['package.json', 'package-lock.json', '.npmrc']) file(name, join(site, name));

const manifest = existsSync(join(site, 'package.json')) ? JSON.parse(readFileSync(join(site, 'package.json'), 'utf8')) : {};
for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
  for (const [name, spec] of Object.entries(manifest[field] ?? {}).sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (typeof spec !== 'string' || !spec.startsWith('file:')) continue;
    const path = resolve(site, spec.slice('file:'.length));
    if (!existsSync(path)) file(name, path);
    else if (statSync(path).isDirectory()) folder(name, path);
    else file(name, path);
  }
}

process.stdout.write(`${hash.digest('hex')}\n`);
