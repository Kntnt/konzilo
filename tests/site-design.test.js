// What a site's design can count on (docs/site-design.md): every class the core's markup writes
// is written down there, and nothing there is gone from the markup.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../', import.meta.url));
const folders = ['src/astro', 'src/consent'].map((folder) => join(core, folder));
const sources = folders.flatMap((folder) => readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.(astro|js)$/.test(entry.name)).map(({ name }) => readFileSync(join(folder, name), 'utf8')));

// A class as the markup has it, with a name filled in at the time as `<>`.
const classesIn = (source) => {
  const found = new Set();
  const lists = [
    ...source.matchAll(/class="([^"]*)"/g),
    ...source.matchAll(/class=\{`([^`]*)`\}/g),
    ...source.matchAll(/className = '([^']*)'/g),
    ...source.matchAll(/className: \['([^']*)'\]/g),
  ];
  for (const [, list] of lists) {
    for (const name of list.replace(/\$\{[^}]*\}/g, '<>').split(/\s+/)) {
      if (name.startsWith('konzilo-')) found.add(name);
    }
  }
  return found;
};

test('every class the core\'s markup writes is in the document, and nothing else is', () => {
  const inMarkup = new Set(sources.flatMap((source) => [...classesIn(source)]));
  const document = readFileSync(join(core, 'docs/site-design.md'), 'utf8');
  const written = new Set([...document.matchAll(/`\.(konzilo-[a-z0-9-]*(?:<[a-z]+>)?)`/g)].map(([, name]) => name.replace(/<[a-z]+>/, '<>')));
  assert.deepEqual([...inMarkup].filter((name) => !written.has(name)).sort(), [], 'in the markup and not in the document');
  assert.deepEqual([...written].filter((name) => !inMarkup.has(name)).sort(), [], 'in the document and not in the markup');
});
