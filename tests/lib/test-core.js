// A copy of the core's npm package whose rule data registers directives of
// the suite's own. The core's registry holds the post list and the form alone,
// so the suite tests directives in a copy: the package's src/, bin/ and
// package.json in a folder of their own, its node_modules linked to the core's,
// and its rules.json given the suite's elements beside the core's.

import { cpSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const core = fileURLToPath(new URL('../../', import.meta.url));

// `elements`: the rule data's entries for the suite's elements, by name.
// Returns { root, rules, url(path), remove() }: the copy's folder, its rule
// data, the file URL of a path in it, to import(), and its removal.
export function testCore(elements) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-test-core-')));
  for (const part of ['src', 'bin', 'package.json']) cpSync(join(core, part), join(root, part), { recursive: true });
  symlinkSync(join(core, 'node_modules'), join(root, 'node_modules'));
  const file = join(root, 'src/format/rules.json');
  const rules = JSON.parse(readFileSync(file, 'utf8'));
  rules.elements = { ...rules.elements, ...elements };
  writeFileSync(file, `${JSON.stringify(rules, null, 2)}\n`);
  return {
    root,
    rules,
    url: (path) => pathToFileURL(join(root, path)).href,
    remove: () => rmSync(root, { recursive: true, force: true }),
  };
}
