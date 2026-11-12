// What a site description names beside itself in the site repository: the components it takes,
// `componentsFrom`, and the module that checks what they hold, `componentChecks`. Each is a path
// in the site repository, from its root, or a package specifier, a scoped package's name and the
// path of a file it exports, such as `@kntnt/konzilo-design/directives/checks`, which is found
// as Node finds a `require()` of it in the site repository: in the repository's node_modules, by
// the package's `exports`, under `default` or a plain path, since Node resolves an import from
// another folder only behind a flag. Every reader finds the same file so, whichever copy of the
// core it runs.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// A path's segments: none empty, none `.` or `..`, and no backslash or colon, so that a path
// stays in the repository.
const SEGMENTS = String.raw`(?!.*(?:^|\/)\.\.?(?:\/|$))(?!.*\/\/)[^\\:]+`;

// A package specifier: `@`, a scope, a package's name, and the path of a file it exports.
const PACKAGE_SPECIFIER = new RegExp(String.raw`^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?:\/${SEGMENTS})?$`);

// Whether a value names a file of a package, rather than a path in the site repository.
export function isPackageSpecifier(value) {
  return typeof value === 'string' && PACKAGE_SPECIFIER.test(value);
}

// Whether a value is a path in the site repository from its root, with one of these extensions,
// such as `checks/components.js`, or a package specifier.
export function isSiteFile(value, extensions) {
  if (isPackageSpecifier(value)) return true;
  return typeof value === 'string' && !value.startsWith('@') && !value.startsWith('/')
    && new RegExp(`^${SEGMENTS}$`).test(value) && extensions.some((extension) => value.endsWith(extension));
}

// The file a value names, from the site repository at `folder`: a path joined to it, and a
// package specifier as the repository finds it. Throws, naming the value, where a package does
// not have it.
export function siteFile(value, folder) {
  if (!isPackageSpecifier(value)) return join(folder, value);
  try {
    return createRequire(join(folder, 'package.json')).resolve(value);
  } catch (error) {
    const [first] = String(error.message).split('\n');
    throw new Error(`${value} cannot be found in the site repository's packages: ${first}`);
  }
}

// The JSON of the file a value names, from the site repository at `folder`. Throws, naming the
// value, where it cannot be found, read or parsed.
export function siteJson(value, folder) {
  const file = siteFile(value, folder);
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`${value} cannot be read: ${error.message}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${value} is not JSON: ${error.message}`);
  }
}
