// The fixtures of every body element: each is the exact form of a case of that
// element, as the intake writes it, and reads through the site's own reader with
// no problem, as the HTML that fixtures/rendered.json holds for it. The file was
// checked by hand against what the element means when it was made; a change to
// it is a change to what a site renders, which a site's CSS may rest on.
//
// No body element carries a class but those the reader has a reason for: the
// core's own, `konzilo-*`, and what GFM writes of a task list, a code block's
// language and the footnotes' heading.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { readContentFile } from '../src/astro/reader.js';

const root = fileURLToPath(new URL('./fixtures/', import.meta.url));
const rendered = JSON.parse(readFileSync(join(root, 'rendered.json'), 'utf8'));
const frontmatter = '---\ntitle: "Hello world"\n---\n\n';
const ALLOWED_CLASS = /^(?:konzilo-[a-z-]+|language-[a-z0-9-]+|sr-only|footnotes|contains-task-list|task-list-item|data-footnote-backref)$/;

const elements = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

for (const element of elements) {
  describe(element, () => {
    for (const name of readdirSync(join(root, element)).filter((file) => file.endsWith('.md')).sort()) {
      const key = `${element}/${name.slice(0, -'.md'.length)}`;
      test(key, () => {
        const { html, problems } = readContentFile(frontmatter + readFileSync(join(root, element, name), 'utf8'));
        assert.deepEqual(problems, []);
        assert.equal(html, rendered[key]);
        for (const [, classes] of html.matchAll(/ class="([^"]*)"/g)) {
          for (const name of classes.split(/\s+/)) assert.match(name, ALLOWED_CLASS, html);
        }
      });
    }
  });
}

test('rendered.json holds no case without its fixture', () => {
  const known = new Set(elements.flatMap((element) => readdirSync(join(root, element)).filter((file) => file.endsWith('.md')).map((file) => `${element}/${file.slice(0, -'.md'.length)}`)));
  assert.deepEqual(Object.keys(rendered).filter((key) => !known.has(key)), []);
});
