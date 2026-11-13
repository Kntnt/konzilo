// The notices of what the editor's application holds (ADR 0072): each package the bundler put
// into it, by name, version and license, with its license text, found from the bundler's own
// record of the files that went in, not from the lock, which holds more than the bundle.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULES = `node_modules${sep}`;

// By code units, since a sort by the machine's language would differ between machines.
export const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const byPackage = (a, b) => byText(a.name, b.name) || byText(a.version ?? '', b.version ?? '');

// A file that holds a license or a notice, by its name: `LICENSE`, `LICENSE.md`, `LICENCE-MIT`,
// `COPYING`, `NOTICE`, or a font's `noto-mono.LICENSE.txt`, and no code.
export const isLicenseFile = (name) => /(^|[.\-_])(licen[cs]e|copying|notice)([.\-_]|$)/i.test(name) && !/\.(c?js|mjs|ts|map)$/i.test(name);

// The folder and name of the package a file lies in: what follows its last `node_modules/`.
export function packageOf(file) {
  const at = file.lastIndexOf(MODULES);
  if (at === -1) return null;
  const parts = file.slice(at + MODULES.length).split(sep);
  const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  return { folder: file.slice(0, at + MODULES.length) + name.replace('/', sep), name };
}

// A package's license as its manifest names it: an SPDX expression, or the old `licenses` list,
// any one of which may be chosen. Not a pointer to a file, and not a refusal of any license.
export function licenseOf({ license, licenses }) {
  let named = null;
  if (typeof license === 'string') named = license;
  else if (typeof license?.type === 'string') named = license.type;
  else if (Array.isArray(licenses)) {
    const types = licenses.map((each) => (typeof each === 'string' ? each : each?.type)).filter((type) => typeof type === 'string');
    named = types.length > 1 ? `(${types.join(' OR ')})` : (types[0] ?? null);
  }
  if (named === null || named.trim() === '' || /^(UNLICENSED|SEE LICEN[CS]E IN)\b/i.test(named.trim())) return null;
  return named.trim();
}

const licenseFiles = (folder) =>
  readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && isLicenseFile(entry.name))
    .map((entry) => join(folder, entry.name))
    .sort(byText);

// The packages a bundled file's own source map names, other than its own package: each by name,
// and by the version in the path of pnpm's store, `.pnpm/<name>@<version>[_<peers>]/`, else none.
// A source is a path where the package was built, not where it is installed, so it is read as it
// is written: a source with no `node_modules/` in it is the package's own.
function packagesWithin(file, own) {
  const mapFile = `${file}.map`;
  if (!existsSync(mapFile)) return [];
  let sources;
  try {
    sources = JSON.parse(readFileSync(mapFile, 'utf8')).sources ?? [];
  } catch {
    return [];
  }
  const found = [];
  for (const source of sources) {
    const at = source.lastIndexOf('node_modules/');
    if (at === -1) continue;
    const parts = source.slice(at + 'node_modules/'.length).split('/');
    const name = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
    if (name === own) continue;
    const store = /(?:^|\/)\.pnpm\/([^/]+)\/node_modules\/$/.exec(source.slice(0, at + 'node_modules/'.length));
    const prefix = `${name.replace('/', '+')}@`;
    const version = store?.[1].startsWith(prefix) ? store[1].slice(prefix.length).split('_')[0] : null;
    found.push({ name, version });
  }
  return found;
}

// Where a kept text came from, what to know of it, and the text.
const keptText = ({ source, note, texts }) => ({ source, ...(note ? { note } : {}), texts });

// The core's own files, outside its `node_modules`, are under the core's license.
const isInside = (core, file) => file.startsWith(`${core.replace(/[/\\]$/, '')}${sep}`);

// A module the bundler writes itself, `\0vite/…` or `\0rolldown/…`, as a file of its package,
// where Node finds Vite from here and Rolldown from Vite.
function bundlerFile(id) {
  if (!id.startsWith('\0')) return null;
  const vite = fileURLToPath(import.meta.resolve('vite'));
  if (id.startsWith('\0vite/')) return vite;
  if (id.startsWith('\0rolldown/')) return createRequire(vite).resolve('rolldown');
  return null;
}

// A license file stands beside a bundled file when it is in the same folder and its name starts
// with that file's stem, `noto-mono.LICENSE.txt` beside `noto-mono-latin-400-normal.woff2`, or
// it names no file at all, `LICENSE`.
function isBeside(file, path) {
  if (dirname(file) !== dirname(path)) return false;
  const name = path.slice(dirname(path).length + 1);
  const stem = name.split(/[.\-_](?:licen[cs]e|copying|notice)/i)[0];
  return stem === '' || file.slice(dirname(file).length + 1).startsWith(stem);
}

// What the editor's bundle owes notice of, from the files the bundler put into it: `packages`,
// each with its license and texts, and `missing`, each package whose license has no name the
// build can give, or whose text or version it cannot find, which the build refuses. `kept` holds,
// by `name@version`, the texts a package does not ship, with where each was taken from, and the
// license of a package within another's bundle, which is nowhere installed.
export function editorNotices({ core, files, kept = {} }) {
  const folders = new Map();
  const missing = new Map();
  for (const id of files) {
    const file = bundlerFile(id) ?? id;
    const found = packageOf(file);
    if (!found) {
      if (!isInside(core, file)) missing.set(id, { name: id, version: null, lacks: 'owner' });
      continue;
    }
    if (!folders.has(found.folder)) folders.set(found.folder, { ...found, files: [] });
    folders.get(found.folder).files.push(file);
  }

  const packages = new Map();
  const within = new Map();
  for (const { folder, files: bundled } of folders.values()) {
    const manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
    const { name, version } = manifest;
    const key = `${name}@${version}`;
    // The package's own license files, and those beside a file it gave the bundle, such as a font's.
    const beside = new Set(bundled.map((file) => dirname(file)).filter((at) => at !== folder));
    const paths = [...licenseFiles(folder), ...[...beside].sort(byText).flatMap((at) => licenseFiles(at).filter((path) => bundled.some((file) => isBeside(file, path))))];
    const texts = paths.map((path) => ({ file: relative(folder, path).split(sep).join('/'), text: readFileSync(path, 'utf8') }));
    const license = licenseOf(manifest);
    const keeping = texts.length === 0 ? kept[key] : undefined;
    if (license === null) missing.set(key, { name, version, lacks: 'license' });
    else if (keeping) packages.set(key, { name, version, license, ...keptText(keeping) });
    else if (texts.length === 0) missing.set(key, { name, version, lacks: 'text' });
    else packages.set(key, { name, version, license, texts });
    for (const file of bundled) {
      for (const held of packagesWithin(file, name)) within.set(`${held.name}@${held.version}`, { ...held, within: name });
    }
  }

  for (const [key, { name, version, within: outer }] of within) {
    if (packages.has(key) || missing.has(key)) continue;
    const keeping = kept[key];
    if (version === null) missing.set(key, { name, version, within: outer, lacks: 'version' });
    else if (!keeping || typeof keeping.license !== 'string') missing.set(key, { name, version, within: outer, lacks: 'text' });
    else packages.set(key, { name, version, license: keeping.license, within: outer, ...keptText(keeping) });
  }
  return { packages: [...packages.values()].sort(byPackage), missing: [...missing.values()].sort(byPackage) };
}

const RULE = '='.repeat(80);

const what = ({ lacks }) =>
  ({ license: 'no license it can name', text: 'no license text', version: 'no version its source map gives', owner: 'not a file of the core, of a package or of the bundler' })[lacks];

// The notices as one text file, or an error naming each package that is missing, with what it lacks.
export function noticesFile(options) {
  const { packages, missing } = editorNotices(options);
  if (missing.length > 0) {
    const lines = missing.map((entry) => `  ${JSON.stringify(entry.name).slice(1, -1)}${entry.version ? ` ${entry.version}` : ''}${entry.within ? `, within ${entry.within}` : ''}: ${what(entry)}`);
    throw new Error(`the editor's bundle holds packages it cannot give notice of:\n${lines.join('\n')}\nA license text that a package does not ship is kept in src/cms/notice-texts.json, which \`node scripts/notice-texts.js\` writes; a package with no license it can name stays out of the editor.`);
  }
  const core = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const repository = (core.repository?.url ?? core.repository ?? '').replace(/^git\+/, '').replace(/\.git$/, '');
  return [
    'Third-party notices of Konzilo\'s editor',
    '',
    `The editor's application is built from Konzilo's own code, under ${core.license}, whose source is at ${repository}, and from the packages below. Each package comes under its own license, whose name and text follow its name and version. A package "within" another came inside that package's own bundle.`,
    '',
    `${packages.length} packages`,
    ...packages.flatMap(({ name, version, license, within, source, note, texts }) => [
      '',
      RULE,
      `${name} ${version}${within ? `, within ${within}` : ''}`,
      `License: ${license}`,
      ...(source ? [`Text from: ${source}`] : []),
      ...(note ? [note] : []),
      RULE,
      ...texts.flatMap(({ file, text }) => ['', `--- ${file} ---`, '', text.replace(/\s+$/, '')]),
    ]),
    '',
  ].join('\n');
}
