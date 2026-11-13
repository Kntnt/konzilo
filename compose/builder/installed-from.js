// What a site's dependencies are installed from, as one hash, which prepare-site.sh keeps beside
// an install that ended and compares at the next start: the site's package.json, its lock and
// its .npmrc, each as it is or as absent; for each package the site pins by a path, a tarball's
// bytes, such as a release's package in the site's vendor/, or what a folder's package ships,
// such as a core's checkout: its package.json and what its `files` names, or, where it names
// none, every file but its node_modules and what a dot hides; and the Node and the platform it
// was installed for. What a folder holds beside what its package ships, a test's or a build's
// output, counts for nothing, and a file it ships that cannot be read is named.
//
//   node installed-from.js <the site's folder>

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const site = resolve(process.argv[2]);
const hash = createHash('sha256');

// By code units, since a sort by the machine's language would differ between machines.
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Each part into the hash, apart from the next.
const hashParts = (...parts) => {
  for (const part of parts) hash.update(part).update('\0');
};

const contentsOf = (path) => {
  try {
    return readFileSync(path);
  } catch (error) {
    throw new Error(`installed-from: cannot read ${path}: ${error.code ?? error.message}`);
  }
};

// The file at `path`, under `name`, as it is or as absent.
const hashFile = (name, path) => hashParts(name, ...(existsSync(path) ? ['present', contentsOf(path)] : ['absent']));

// The files below `path` in a fixed order, under `name`, each by its path from `root`, but a
// node_modules and what a dot hides.
function hashFolder(name, root, path = root) {
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) => byText(a.name, b.name))) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const inner = join(path, entry.name);
    if (entry.isDirectory()) hashFolder(name, root, inner);
    else if (entry.isSymbolicLink()) hashParts(name, relative(root, inner), 'link', readlinkSync(inner));
    else if (entry.isFile()) hashParts(name, relative(root, inner), contentsOf(inner));
  }
}

// What the package in the folder `root` ships, under `name`: its package.json and each file or
// folder its `files` names, or, where it names none, or names one by a pattern, which npm reads
// as a glob, every file of the folder.
function hashPackage(name, root) {
  const manifest = join(root, 'package.json');
  const shipped = existsSync(manifest) ? JSON.parse(contentsOf(manifest).toString('utf8')).files : undefined;
  if (!Array.isArray(shipped) || shipped.some((entry) => typeof entry !== 'string' || /[*?[\]{}!]/.test(entry))) {
    hashFolder(name, root);
    return;
  }
  hashFile(name, manifest);
  for (const entry of [...shipped].sort(byText)) {
    const path = join(root, entry);
    if (existsSync(path) && statSync(path).isDirectory()) hashFolder(name, root, path);
    else hashParts(name, relative(root, path), ...(existsSync(path) ? ['present', contentsOf(path)] : ['absent']));
  }
}

try {
  hashParts(process.version, process.platform, process.arch);
  for (const name of ['package.json', 'package-lock.json', '.npmrc']) hashFile(name, join(site, name));
  const manifest = existsSync(join(site, 'package.json')) ? JSON.parse(readFileSync(join(site, 'package.json'), 'utf8')) : {};
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    for (const [name, spec] of Object.entries(manifest[field] ?? {}).sort(([a], [b]) => byText(a, b))) {
      if (typeof spec !== 'string' || !spec.startsWith('file:')) continue;
      const pinned = resolve(site, spec.slice('file:'.length));
      if (existsSync(pinned) && statSync(pinned).isDirectory()) hashPackage(name, pinned);
      else hashFile(name, pinned);
    }
  }
  process.stdout.write(`${hash.digest('hex')}\n`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
