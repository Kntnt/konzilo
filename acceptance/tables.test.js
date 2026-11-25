// A table's aligned columns as a browser draws them, in each browser engine, from the static
// build of a site made from the site template with its demo content (ADR 0021): a simple and a
// structured table added to the demo content's article, each with a column of each alignment,
// reach the page with `data-align` and no style, and the template's rule stands each cell's text
// at the start of its line, in its centre or at its end, as written: on the left, in the middle
// and on the right of a page read from left to right, and mirrored on one read from right to left.

import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { astroEnvironment, nodeSync } from '../tests/lib/astro.js';
import { ENGINES } from './lib/editor.js';

const core = fileURLToPath(new URL('../', import.meta.url));
const template = join(core, 'site-template/files');
const astro = join(core, 'node_modules/astro/bin/astro.mjs');

const ARTICLE = '/every-element/';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.png': 'image/png' };

// Two tables, each with a column not aligned and one of each alignment, their headings wider
// than the text below them, so that the text has room to stand anywhere in its cell.
const SIMPLE = [
  '| Plain heading | Start heading | Centre heading | End heading |',
  '| --- | :--- | :---: | ---: |',
  '| A | B | C | D |',
].join('\n');
const STRUCTURED = [
  '<table>',
  '<caption>Aligned</caption>',
  '<thead>',
  '<tr><th>Plain heading</th><th style="text-align: left">Start heading</th><th style="text-align: center">Centre heading</th><th style="text-align: right">End heading</th></tr>',
  '</thead>',
  '<tbody>',
  '<tr><td>A</td><td style="text-align: left">B</td><td style="text-align: center">C</td><td style="text-align: right">D</td></tr>',
  '</tbody>',
  '</table>',
].join('\n');

// A site repository as `new-site` makes one from the template, its node modules the core's, with
// the core itself as the Konzilo package, given the demo content as a first build gives it, and
// the two tables at the end of its article.
function siteRepository() {
  const repository = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-tables-')));
  for (const file of ['astro.config.mjs', 'site-description.json', 'package.json']) cpSync(join(template, file), join(repository, file));
  cpSync(join(template, 'src'), join(repository, 'src'), { recursive: true });
  const modules = join(repository, 'node_modules');
  mkdirSync(join(modules, '@kntnt'), { recursive: true });
  for (const name of readdirSync(join(core, 'node_modules'))) {
    if (name !== '@kntnt' && !name.startsWith('.')) symlinkSync(join(core, 'node_modules', name), join(modules, name));
  }
  symlinkSync(core, join(modules, '@kntnt/konzilo'));
  const copied = nodeSync([join(core, 'bin/konzilo-demo-content.js')], { cwd: repository, encoding: 'utf8', env: { ...astroEnvironment, KONZILO_ORIGIN: 'http://localhost:4321' } });
  assert.equal(copied.status, 0, copied.stderr + copied.stdout);
  const article = join(repository, 'content/articles/every-element.md');
  writeFileSync(article, `${readFileSync(article, 'utf8').trimEnd()}\n\n${SIMPLE}\n\n${STRUCTURED}\n`);
  return repository;
}

// The build's files, as the public host serves them.
function serve(dist) {
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = join(dist, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(dist) || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

describe('a table\'s aligned columns, as a browser draws them from the site template', () => {
  let repository;
  let server;
  let origin;

  before(async () => {
    repository = siteRepository();
    const built = nodeSync([astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(built.status, 0, built.stderr + built.stdout);
    server = await serve(join(repository, 'dist'));
    origin = `http://127.0.0.1:${server.address().port}`;
  });

  // A build that failed has no server to close.
  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (repository) rmSync(repository, { recursive: true, force: true });
  });

  // The last two tables of the article, read `direction`: for each, every cell of its body row,
  // with its `data-align` and `style`, and where its text stands in it, `left`, `middle` or
  // `right`, within a pixel.
  async function drawn(engine, direction) {
    const browser = await ENGINES[engine].launch();
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(`${origin}${ARTICLE}`);
      return await page.evaluate((dir) => [...document.querySelectorAll('article .konzilo-table')].slice(-2).map((box) => {
        box.dir = dir;
        return [...box.querySelectorAll('tbody td')].map((cell) => {
          const shape = getComputedStyle(cell);
          const rect = cell.getBoundingClientRect();
          const left = rect.left + parseFloat(shape.borderLeftWidth) + parseFloat(shape.paddingLeft);
          const right = rect.right - parseFloat(shape.borderRightWidth) - parseFloat(shape.paddingRight);
          const range = document.createRange();
          range.selectNodeContents(cell);
          const text = range.getBoundingClientRect();
          const near = (a, b) => Math.abs(a - b) <= 1;
          const at = near(text.left, left) ? 'left' : near(text.right, right) ? 'right' : near(text.left + text.width / 2, (left + right) / 2) ? 'middle' : `elsewhere: ${text.left}–${text.right} in ${left}–${right}`;
          return { align: cell.getAttribute('data-align'), style: cell.getAttribute('style'), at };
        });
      }), direction);
    } finally {
      await browser.close();
    }
  }

  const cells = (...at) => [null, 'start', 'center', 'end'].map((align, column) => ({ align, style: null, at: at[column] }));

  for (const engine of Object.keys(ENGINES)) {
    test(`${engine}: stands each cell's text at the start, the centre or the end of its line, as its column is aligned, from left to right and from right to left`, async () => {
      assert.deepEqual(await drawn(engine, 'ltr'), [cells('left', 'left', 'middle', 'right'), cells('left', 'left', 'middle', 'right')], 'from left to right: the simple table, then the structured');
      assert.deepEqual(await drawn(engine, 'rtl'), [cells('right', 'right', 'middle', 'left'), cells('right', 'right', 'middle', 'left')], 'from right to left: the simple table, then the structured');
    });
  }
});
