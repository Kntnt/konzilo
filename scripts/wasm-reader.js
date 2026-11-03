// Sätteri's WebAssembly build, for the editor: the field reads a body as the site does.
//
// npm will not install it. The package declares `cpu: wasm32`, so npm skips it as
// `satteri`'s optional dependency, and refuses it as a direct one without `--force`,
// which would turn the platform check off for every other package. The lockfile holds
// it all the same, as `satteri`'s optional dependency, with its version, address and
// integrity, and those of what it needs, so that is the pin: this folder holds exactly
// what the lockfile names, each file checked against its integrity before it is
// unpacked. It lies under `node_modules`, so that `npm ci` clears it, in a folder npm
// does not read.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WASM_READER = '@bruits/satteri-wasm32-wasi';

const root = fileURLToPath(new URL('../', import.meta.url));
const folder = join(root, 'node_modules/.konzilo-wasm-reader');

// The lockfile's entries for the reader and all it needs, by their paths in the lockfile,
// found as Node would find them: a package's own `node_modules` first, then those above.
export function wasmReaderEntries(packages) {
  const found = new Map();
  const add = (path) => {
    if (found.has(path)) return;
    const entry = packages[path];
    if (!entry) throw new Error(`the lockfile has no ${path}`);
    found.set(path, entry);
    for (const name of Object.keys({ ...entry.dependencies, ...entry.peerDependencies })) add(resolveFrom(packages, path, name));
  };
  add(`node_modules/${WASM_READER}`);
  return found;
}

function resolveFrom(packages, from, name) {
  for (let at = from; at.includes('node_modules/'); at = at.slice(0, at.lastIndexOf('/node_modules/'))) {
    const nested = `${at}/node_modules/${name}`;
    if (packages[nested]) return nested;
    if (!at.includes('/node_modules/')) break;
  }
  const top = `node_modules/${name}`;
  if (packages[top]) return top;
  throw new Error(`the lockfile does not say where ${from} finds ${name}`);
}

const digestOf = (bytes, algorithm) => createHash(algorithm).update(bytes).digest('base64');

async function unpack(path, { resolved, integrity }, into) {
  const [algorithm, expected] = integrity.split(/-(.*)/s);
  const answer = await fetch(resolved);
  if (!answer.ok) throw new Error(`${resolved}: ${answer.status}`);
  const bytes = Buffer.from(await answer.arrayBuffer());
  if (digestOf(bytes, algorithm) !== expected) throw new Error(`${resolved} does not match its integrity in the lockfile`);
  const target = join(into, path);
  mkdirSync(target, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), 'konzilo-wasm-reader-'));
  try {
    const file = join(scratch, 'package.tgz');
    writeFileSync(file, bytes);
    const run = spawnSync('tar', ['-xzf', file, '-C', target, '--strip-components=1'], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`tar: ${run.stderr}`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// The folder of the reader's package, fetched if this checkout has not got it yet.
export async function wasmReaderFolder() {
  const { packages } = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const entries = wasmReaderEntries(packages);
  const stamp = join(folder, 'integrity');
  const wanted = [...entries.values()].map((entry) => entry.integrity).join('\n');
  let held = null;
  try {
    held = readFileSync(stamp, 'utf8');
  } catch {
    // Not fetched yet.
  }
  if (held !== wanted) {
    rmSync(folder, { recursive: true, force: true });
    await Promise.all([...entries].map(([path, entry]) => unpack(path, entry, folder)));
    mkdirSync(dirname(stamp), { recursive: true });
    writeFileSync(stamp, wanted);
  }
  return join(folder, 'node_modules', WASM_READER);
}
