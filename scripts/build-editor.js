#!/usr/bin/env node
// Build the editor's static files: Sveltia's npm build at its pin, with each patch
// of src/cms/patches.json. `dist/` holds addresses at a CDN, so the npm build it is
// (ADR 0029), and a browser cannot load its bare imports, so it is bundled. A patch
// whose text has moved fails the build: a raise of what it patches must look at each again.
//
// The body field reads through Sätteri's WebAssembly build, which npm will not install, so
// `wasm-reader.js` brings it as the lockfile pins it. The `browser` condition makes `satteri`
// take it, and it creates workers at start, which are modules.
//
//   build-editor <folder to write>

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

import { WASM_READER, wasmReaderFolder } from './wasm-reader.js';

const editorRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../src/cms');

// `input` is an HTML page to build instead of the editor's own; a test's page has no Sveltia,
// so it takes only the other patches.
export async function buildEditor(out, { input = join(editorRoot, 'index.html') } = {}) {
  const every = JSON.parse(readFileSync(join(editorRoot, 'patches.json'), 'utf8'));
  const patches = input === join(editorRoot, 'index.html') ? every : every.filter((patch) => !patch.module.startsWith('@sveltia/'));

  const transform = (code, id) => {
    const path = id.split('?')[0];
    let result = code;
    for (const patch of patches) {
      if (!path.endsWith(`/node_modules/${patch.module}`)) continue;
      const parts = result.split(patch.find);
      if (parts.length !== 2) {
        throw new Error(`the patch "${patch.find}" of ${patch.module} matches ${parts.length - 1} times, not once. ${patch.why}`);
      }
      result = parts.join(patch.replace);
      patch.applied = true;
    }
    return result === code ? null : { code: result, map: null };
  };

  const patched = {
    name: 'konzilo-patches',
    enforce: 'pre',
    transform,
    buildEnd(error) {
      if (error) return;
      const missed = patches.filter((patch) => !patch.applied);
      if (missed.length > 0) throw new Error(`patches never reached their module: ${missed.map((patch) => patch.module).join(', ')}`);
    },
  };

  await build({
    root: dirname(input),
    configFile: false,
    logLevel: 'warn',
    plugins: [patched],
    resolve: {
      conditions: ['browser', 'module', 'import', 'default'],
      alias: { [WASM_READER]: await wasmReaderFolder() },
    },
    worker: { format: 'es', plugins: () => [{ name: 'konzilo-patches-in-workers', enforce: 'pre', transform }] },
    build: {
      outDir: resolve(out),
      emptyOutDir: true,
      target: 'esnext',
      sourcemap: false,
      chunkSizeWarningLimit: 100_000,
      rollupOptions: { input },
    },
  });
}

if (import.meta.main) {
  const out = process.argv[2];
  if (!out) {
    console.error('usage: build-editor <folder to write>');
    process.exit(2);
  }
  await buildEditor(out);
}
