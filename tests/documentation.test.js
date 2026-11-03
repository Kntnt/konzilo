// The documents hold together: every decision is in the index, and every link
// between the repository's own files reaches a file and a heading that exist. A
// renamed decision or a moved file breaks nothing else, so only this notices.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const core = fileURLToPath(new URL('../', import.meta.url));

// A site's content and the suite's fixtures are Markdown too, but their links are
// addresses on a site, not paths in this repository.
const documents = execFileSync('git', ['ls-files', '*.md'], { cwd: core, encoding: 'utf8' })
  .split('\n')
  .filter((path) => path && !path.startsWith('tests/fixtures/') && !path.startsWith('site-template/demo-content/'));

// Fenced code and code spans show syntax; a link in them is not a link.
const prose = (text) => text.replace(/^```[\s\S]*?^```/gm, '').replace(/`[^`\n]*`/g, '');

// The anchor GitHub gives a heading.
const anchor = (heading) =>
  heading
    .replace(/[*_`]/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');

const anchors = (text) => new Set([...prose(text).matchAll(/^#{1,6}\s+(.+?)\s*$/gm)].map((match) => anchor(match[1])));

test('every decision is in the index, and the index names none that is gone', () => {
  const folder = join(core, 'docs/adr');
  const index = readFileSync(join(folder, 'README.md'), 'utf8');
  const decisions = readdirSync(folder).filter((name) => /^\d{4}-.*\.md$/.test(name));
  assert.ok(decisions.length > 0);
  for (const name of decisions) assert.ok(index.includes(`(${name})`), `${name} is not in docs/adr/README.md`);
  for (const [, name] of index.matchAll(/\]\((\d{4}-[^)]+\.md)\)/g)) assert.ok(decisions.includes(name), `the index names ${name}`);
});

test('every link between the repository\'s own files reaches a file and a heading', () => {
  const broken = [];
  for (const document of documents) {
    const text = readFileSync(join(core, document), 'utf8');
    for (const [, link] of prose(text).matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:/i.test(link)) continue;
      const [path, heading] = link.split('#');
      const target = path ? resolve(dirname(join(core, document)), path) : join(core, document);
      if (!existsSync(target)) broken.push(`${document}: ${link}`);
      else if (heading && target.endsWith('.md') && !anchors(readFileSync(target, 'utf8')).has(heading)) {
        broken.push(`${document}: ${link}, no such heading in ${relative(core, target)}`);
      }
    }
  }
  assert.deepEqual(broken, []);
});
