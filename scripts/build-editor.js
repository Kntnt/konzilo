#!/usr/bin/env node
// Build the editor's static files: Sveltia's npm build at its pin, with each patch
// of src/cms/patches.json. `dist/` holds addresses at a CDN, so the npm build it is
// (ADR 0029), and a browser cannot load its bare imports, so it is bundled. A patch
// whose text has moved fails the build: a raise of Sveltia must look at each again.
//
//   build-editor <folder to write>

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../src/cms');
const out = process.argv[2];
if (!out) {
  console.error('usage: build-editor <folder to write>');
  process.exit(2);
}

const patches = JSON.parse(readFileSync(join(root, 'patches.json'), 'utf8'));

const patched = {
  name: 'konzilo-sveltia-patches',
  enforce: 'pre',
  transform(code, id) {
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
  },
  buildEnd(error) {
    if (error) return;
    const missed = patches.filter((patch) => !patch.applied);
    if (missed.length > 0) throw new Error(`patches never reached their module: ${missed.map((patch) => patch.module).join(', ')}`);
  },
};

await build({
  root,
  configFile: false,
  logLevel: 'warn',
  plugins: [patched],
  build: {
    outDir: resolve(out),
    emptyOutDir: true,
    target: 'esnext',
    sourcemap: false,
    chunkSizeWarningLimit: 100_000,
    rollupOptions: { input: join(root, 'index.html') },
  },
});
