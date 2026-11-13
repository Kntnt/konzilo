// The notices of what the editor's application holds: every package the bundler put into it,
// by name, version and license, with its license text, in one file beside it, which the web
// server's image keeps and serves with the application. A package whose license the build cannot
// name, or whose text it cannot find, stops the build.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildEditor } from '../scripts/build-editor.js';
import { editorNotices, noticesFile } from '../scripts/notices.js';

// A folder with a core and its node_modules, each package from its files.
function folder(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'konzilo-notices-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

const MIT = 'MIT License\n\nCopyright (c) 2024 Ada\n\nPermission is hereby granted …\n';
const ISC = 'ISC License\n\nCopyright (c) 2023 Grace\n';

test('names each package the bundle holds by name, version and license, with its license text, and not the core\'s own files', (t) => {
  const root = folder(t, {
    'src/cms/editor.js': '',
    'node_modules/plain/package.json': { name: 'plain', version: '1.2.3', license: 'MIT' },
    'node_modules/plain/LICENSE': MIT,
    'node_modules/plain/lib/index.js': '',
    'node_modules/plain/lib/more.js': '',
    'node_modules/@scope/kit/package.json': { name: '@scope/kit', version: '0.4.0', license: 'ISC' },
    'node_modules/@scope/kit/LICENSE.md': ISC,
    'node_modules/@scope/kit/dist/kit.js': '',
  });
  const notices = editorNotices({
    core: root,
    files: [join(root, 'src/cms/editor.js'), join(root, 'node_modules/plain/lib/index.js'), join(root, 'node_modules/plain/lib/more.js'), join(root, 'node_modules/@scope/kit/dist/kit.js')],
  });
  assert.deepEqual(notices.packages, [
    { name: '@scope/kit', version: '0.4.0', license: 'ISC', texts: [{ file: 'LICENSE.md', text: ISC }] },
    { name: 'plain', version: '1.2.3', license: 'MIT', texts: [{ file: 'LICENSE', text: MIT }] },
  ]);
  assert.deepEqual(notices.missing, []);
});

test('says which packages have no license it can name, and which no license text, and leaves them out', (t) => {
  const root = folder(t, {
    'node_modules/unnamed/package.json': { name: 'unnamed', version: '1.0.0' },
    'node_modules/unnamed/LICENSE': MIT,
    'node_modules/unnamed/index.js': '',
    'node_modules/elsewhere/package.json': { name: 'elsewhere', version: '2.0.0', license: 'SEE LICENSE IN terms.txt' },
    'node_modules/elsewhere/terms.txt': 'Ask us.',
    'node_modules/elsewhere/index.js': '',
    'node_modules/closed/package.json': { name: 'closed', version: '3.0.0', license: 'UNLICENSED' },
    'node_modules/closed/index.js': '',
    'node_modules/textless/package.json': { name: 'textless', version: '4.0.0', license: 'MIT' },
    'node_modules/textless/index.js': '',
    'node_modules/old/package.json': { name: 'old', version: '5.0.0', licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] },
    'node_modules/old/LICENSE-MIT': MIT,
    'node_modules/old/index.js': '',
  });
  const notices = editorNotices({ core: root, files: ['unnamed', 'elsewhere', 'closed', 'textless', 'old'].map((name) => join(root, `node_modules/${name}/index.js`)) });
  assert.deepEqual(notices.packages.map(({ name, license }) => `${name} ${license}`), ['old (MIT OR Apache-2.0)']);
  assert.deepEqual(notices.missing, [
    { name: 'closed', version: '3.0.0', lacks: 'license' },
    { name: 'elsewhere', version: '2.0.0', lacks: 'license' },
    { name: 'textless', version: '4.0.0', lacks: 'text' },
    { name: 'unnamed', version: '1.0.0', lacks: 'license' },
  ]);
});

test('takes the text of a package that ships none from the texts kept for its version', (t) => {
  const root = folder(t, {
    'node_modules/textless/package.json': { name: 'textless', version: '4.0.0', license: 'MIT' },
    'node_modules/textless/index.js': '',
  });
  const files = [join(root, 'node_modules/textless/index.js')];
  const kept = { 'textless@4.0.0': { license: 'MIT', source: 'https://example.test/textless/v4.0.0/LICENSE', texts: [{ file: 'LICENSE', text: MIT }] } };
  assert.deepEqual(editorNotices({ core: root, files, kept }), {
    packages: [{ name: 'textless', version: '4.0.0', license: 'MIT', source: 'https://example.test/textless/v4.0.0/LICENSE', texts: [{ file: 'LICENSE', text: MIT }] }],
    missing: [],
  });
  assert.deepEqual(editorNotices({ core: root, files, kept: { 'textless@4.0.1': kept['textless@4.0.0'] } }).missing, [{ name: 'textless', version: '4.0.0', lacks: 'text' }]);
});

// A package that ships a bundle of its own, as Sveltia does, holds packages that are not
// installed: its own bundler's record, the source map beside a file, names them, with their
// versions in the paths of pnpm's store. Their texts are kept, as they are nowhere installed.
test('names the packages within a package\'s own bundle from its source map, with the texts kept for them, and the license files beside what it bundled', (t) => {
  const map = { version: 3, sources: [
    '../../src/lib/app.js',
    '../../node_modules/.pnpm/@x+inner@2.1.0_peer@1.0.0/node_modules/@x/inner/dist/a.js',
    '../../node_modules/.pnpm/@x+inner@2.1.0_peer@1.0.0/node_modules/@x/inner/dist/b.js',
    '../../node_modules/.pnpm/tiny@0.3.0/node_modules/tiny/index.js',
    '../../node_modules/.pnpm/plain@1.2.3/node_modules/plain/lib/index.js',
    '../../node_modules/flat/index.js',
  ], mappings: '' };
  const root = folder(t, {
    'node_modules/@vendor/app/package.json': { name: '@vendor/app', version: '1.0.0', license: 'MIT' },
    'node_modules/@vendor/app/LICENSE.txt': MIT,
    'node_modules/@vendor/app/npm/index.js': '',
    'node_modules/@vendor/app/npm/index.js.map': map,
    'node_modules/@vendor/app/npm/assets/font.woff2': '',
    'node_modules/@vendor/app/npm/assets/font.LICENSE.txt': 'SIL Open Font License',
    'node_modules/@vendor/app/npm/assets/unused.LICENSE.txt': 'not beside anything bundled',
    'node_modules/plain/package.json': { name: 'plain', version: '1.2.3', license: 'MIT' },
    'node_modules/plain/LICENSE': MIT,
    'node_modules/plain/lib/index.js': '',
  });
  const files = ['@vendor/app/npm/index.js', '@vendor/app/npm/assets/font.woff2', 'plain/lib/index.js'].map((path) => join(root, 'node_modules', path));
  const kept = {
    '@x/inner@2.1.0': { license: 'Apache-2.0', source: 'https://registry.example.test/@x/inner/-/inner-2.1.0.tgz', texts: [{ file: 'LICENSE', text: 'Apache License' }, { file: 'NOTICE', text: 'Inner, by X' }] },
    'plain@1.2.3': { license: 'MIT', source: 'unused', texts: [{ file: 'LICENSE', text: 'unused' }] },
  };
  const notices = editorNotices({ core: root, files, kept });
  assert.deepEqual(notices.packages, [
    { name: '@vendor/app', version: '1.0.0', license: 'MIT', texts: [{ file: 'LICENSE.txt', text: MIT }, { file: 'npm/assets/font.LICENSE.txt', text: 'SIL Open Font License' }] },
    { name: '@x/inner', version: '2.1.0', license: 'Apache-2.0', within: '@vendor/app', source: 'https://registry.example.test/@x/inner/-/inner-2.1.0.tgz', texts: [{ file: 'LICENSE', text: 'Apache License' }, { file: 'NOTICE', text: 'Inner, by X' }] },
    { name: 'plain', version: '1.2.3', license: 'MIT', texts: [{ file: 'LICENSE', text: MIT }] },
  ]);
  assert.deepEqual(notices.missing, [
    { name: 'flat', version: null, within: '@vendor/app', lacks: 'version' },
    { name: 'tiny', version: '0.3.0', within: '@vendor/app', lacks: 'text' },
  ]);
});

test('writes the notices as one text, each package with its license and its texts, and refuses to write them while one is missing', (t) => {
  const root = folder(t, {
    'node_modules/plain/package.json': { name: 'plain', version: '1.2.3', license: 'MIT' },
    'node_modules/plain/LICENSE': MIT,
    'node_modules/plain/index.js': '',
    'node_modules/@vendor/app/package.json': { name: '@vendor/app', version: '1.0.0', license: 'MIT' },
    'node_modules/@vendor/app/LICENSE': MIT,
    'node_modules/@vendor/app/index.js': '',
    'node_modules/@vendor/app/index.js.map': { version: 3, sources: ['../node_modules/.pnpm/tiny@0.3.0/node_modules/tiny/index.js'], mappings: '' },
    'node_modules/textless/package.json': { name: 'textless', version: '4.0.0', license: 'MIT' },
    'node_modules/textless/index.js': '',
    'node_modules/unnamed/package.json': { name: 'unnamed', version: '1.0.0' },
    'node_modules/unnamed/index.js': '',
  });
  const kept = { 'tiny@0.3.0': { license: 'ISC', source: 'https://spdx.example.test/ISC.txt', note: 'The standard text.', texts: [{ file: 'ISC.txt', text: ISC }] } };
  const text = noticesFile({ core: root, files: [join(root, 'node_modules/plain/index.js'), join(root, 'node_modules/@vendor/app/index.js')], kept });
  for (const part of [
    '\nplain 1.2.3\nLicense: MIT\n',
    `\n--- LICENSE ---\n\n${MIT}`,
    '\ntiny 0.3.0, within @vendor/app\nLicense: ISC\nText from: https://spdx.example.test/ISC.txt\nThe standard text.\n',
    `\n--- ISC.txt ---\n\n${ISC}`,
  ]) assert.ok(text.includes(part), part);
  assert.ok(text.indexOf('@vendor/app 1.0.0') < text.indexOf('plain 1.2.3') && text.indexOf('plain 1.2.3') < text.indexOf('tiny 0.3.0'), 'by name');
  assert.match(text, /^3 packages\b/m);

  assert.throws(
    () => noticesFile({ core: root, files: ['plain', 'textless', 'unnamed', '@vendor/app'].map((name) => join(root, `node_modules/${name}/index.js`)) }),
    (error) => {
      assert.match(error.message, /textless 4\.0\.0: no license text/);
      assert.match(error.message, /tiny 0\.3\.0, within @vendor\/app: no license text/);
      assert.match(error.message, /unnamed 1\.0\.0: no license it can name/);
      assert.match(error.message, /node scripts\/notice-texts\.js/);
      return true;
    },
  );
});

// The one test here that runs the real build, a few seconds on a laptop.
test('the editor\'s build writes the notices beside the bundle, with every package it bundled and its license text, and the page links to them', async (t) => {
  const out = mkdtempSync(join(tmpdir(), 'konzilo-editor-'));
  t.after(() => rmSync(out, { recursive: true, force: true }));
  await buildEditor(out);
  const text = readFileSync(join(out, 'third-party-notices.txt'), 'utf8');
  assert.match(readFileSync(join(out, 'index.html'), 'utf8'), /<link rel="license" href="\.\/third-party-notices\.txt">/);

  // Each package by its heading, between two rules, with its license, and a text of some length
  // under it, up to the next heading.
  const headings = [...text.matchAll(/^={80}\n(\S+ \S+(?:, within \S+)?)\nLicense: \S.*\n(?:(?!={80}\n).*\n){0,2}={80}\n/gm)];
  const named = new Map();
  headings.forEach((heading, at) => {
    const under = text.slice(heading.index + heading[0].length, headings[at + 1]?.index ?? text.length);
    assert.ok(under.replace(/^--- .+ ---$/gm, '').trim().length > 100, `${heading[1]}: its text`);
    named.set(heading[1].split(' ')[0], heading[1]);
  });
  const versions = new Set(headings.map((heading) => heading[1].split(',')[0]));
  assert.equal(versions.size, headings.length, 'each version of a package once');
  assert.match(text, new RegExp(`^${headings.length} packages$`, 'm'));

  // What the editor is known to hold: Sveltia and what its own bundle holds, Milkdown and
  // ProseMirror, Shiki's grammars, the Markdown reader's WebAssembly and its runtime, and Vite's helpers.
  for (const name of ['@sveltia/cms', 'svelte', 'react', 'isomorphic-git', '@milkdown/crepe', 'prosemirror-view', '@shikijs/langs', '@bruits/satteri-wasm32-wasi', '@napi-rs/wasm-runtime', 'vite']) {
    assert.ok(named.has(name), name);
  }
  assert.match(named.get('svelte'), /, within @sveltia\/cms$/);
  assert.ok(named.size > 150, `${named.size} packages`);

  // The texts are the packages' own, a font's beside it too.
  const sveltia = fileURLToPath(new URL('../node_modules/@sveltia/cms/', import.meta.url));
  assert.ok(text.includes(readFileSync(join(sveltia, 'LICENSE.txt'), 'utf8').trim()));
  assert.ok(text.includes(readFileSync(join(sveltia, 'npm/assets/noto-mono.LICENSE.txt'), 'utf8').trim()));
});

// The bundler writes helpers of its own into the bundle, as modules with no file, `\0vite/…`
// and `\0rolldown/…`: they are Vite's and Rolldown's code, and owe their notices too.
test('names Vite and Rolldown for the helpers they write into the bundle, and refuses a file it cannot say whose it is', (t) => {
  const root = folder(t, { 'src/cms/editor.js': '' });
  const installed = (name) => JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version;
  const notices = editorNotices({ core: root, files: [join(root, 'src/cms/editor.js'), '\0vite/preload-helper.js', '\0rolldown/runtime.js', '\0unknown:thing', '/somewhere/else.js'] });
  assert.deepEqual(notices.packages.map(({ name, version, license }) => `${name} ${version} ${license}`), [`rolldown ${installed('rolldown')} MIT`, `vite ${installed('vite')} MIT`]);
  assert.ok(notices.packages.every(({ texts }) => texts.some(({ text }) => text.includes('Permission is hereby granted'))));
  assert.deepEqual(notices.missing, [
    { name: '\0unknown:thing', version: null, lacks: 'owner' },
    { name: '/somewhere/else.js', version: null, lacks: 'owner' },
  ]);
});
