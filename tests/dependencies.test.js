// Every package the core imports is one it declares. In this repository's own
// node_modules a package a test tool brings along resolves too, so a missing line
// only shows when a real site installs the core as a copy.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { matchesIntegrity, WASM_READER, wasmReaderEntries } from '../scripts/wasm-reader.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(core, 'package.json'), 'utf8'));

const shipped = execFileSync('git', ['ls-files', 'src', 'bin'], { cwd: core, encoding: 'utf8' })
  .split('\n')
  .filter((path) => /\.(js|mjs|astro)$/.test(path));

// A site has Astro by its own pin, and only the web server's image holds the editor,
// built from this repository's own dependencies.
const provided = new Set(['astro', '@sveltia/cms', '@milkdown/crepe', '@milkdown/kit', ...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

const packageOf = (specifier) => specifier.split('/').slice(0, specifier.startsWith('@') ? 2 : 1).join('/');

test('every package the shipped code imports is declared', () => {
  const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {})]);
  const missing = new Map();
  for (const path of shipped) {
    const text = readFileSync(join(core, path), 'utf8');
    for (const [, specifier] of text.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"`\n]*?from\s+['"]([^'"]+)['"]|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g)) {
      if (!specifier || /^[./#]/.test(specifier) || specifier.startsWith('astro:') || specifier.startsWith('virtual:')) continue;
      const name = packageOf(specifier);
      if (!provided.has(name) && !provided.has(specifier) && !declared.has(name)) missing.set(name, path);
    }
  }
  assert.deepEqual([...missing], []);
});

test('the editor is not among them, since only the web server\'s image holds it', () => {
  assert.equal(manifest.dependencies['@sveltia/cms'], undefined);
  assert.equal(manifest.devDependencies['@sveltia/cms'], execFileSync('sh', [join(core, 'scripts/versions'), 'SVELTIA'], { encoding: 'utf8' }).trim());
  const milkdown = execFileSync('sh', [join(core, 'scripts/versions'), 'MILKDOWN'], { encoding: 'utf8' }).trim();
  for (const name of ['@milkdown/crepe', '@milkdown/kit']) {
    assert.equal(manifest.dependencies[name], undefined);
    assert.equal(manifest.devDependencies[name], milkdown);
  }
});

// npm will not install Sätteri's WebAssembly build, so the editor's build brings it as the
// lockfile pins it, as `satteri`'s optional dependency: the same version by construction, as
// long as the lockfile says so, and each file checked against its integrity.
test('the lockfile pins the reader in the browser to the reader on the server, with integrity', () => {
  const { packages } = JSON.parse(readFileSync(join(core, 'package-lock.json'), 'utf8'));
  const satteri = packages['node_modules/satteri'];
  assert.equal(satteri.version, manifest.dependencies.satteri);
  assert.equal(satteri.optionalDependencies[WASM_READER], satteri.version);
  const entries = wasmReaderEntries(packages);
  assert.equal(entries.get(`node_modules/${WASM_READER}`).version, satteri.version);
  assert.ok(entries.size > 1, 'it needs a runtime');
  for (const [path, entry] of entries) {
    assert.match(entry.integrity, /^sha512-[A-Za-z0-9+/]+=*$/, path);
    assert.match(entry.resolved, /^https:\/\/registry\.npmjs\.org\//, path);
  }
  // From `openssl dgst -sha512 -binary`, not from the code under test.
  const integrity = 'sha512-TdfYTsDfbUNuzSTYKjMH6td8Eo7sRLLYhlHz16+SX+BaAMPlavODJGUznHRfLXSfWGMcf0foClEtUtqRT+lDbA==';
  assert.equal(matchesIntegrity(Buffer.from('konzilo'), integrity), true);
  assert.equal(matchesIntegrity(Buffer.from('konzilp'), integrity), false);
});
