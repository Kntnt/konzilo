// A live preview's runs: the source as it stands and the drafts someone looks at, into a
// content folder, and what comes back to the pane.

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, beforeEach, describe, test } from 'node:test';

import { parse } from 'yaml';

import { draftFile, keyOfPath, pathProblem, unsavedImage } from '../src/preview/draft.js';
import { previewRunner } from '../src/preview/runner.js';
import { gitSource } from '../src/preview/source.js';
import { siteDescription } from '../src/site-description.js';
import { namedImages, sourcePost } from './lib/intake.js';

const site = {
  language: 'en_GB',
  images: { smallestWidth: 1, displayWidth: 1 },
  types: {
    page: { label: 'Page', plural: 'Pages', collection: 'pages', hierarchical: true, address: '/pages/{path}/', elements: ['paragraph'], fields: { image: {} } },
    note: { label: 'Note', plural: 'Notes', collection: 'notes', elements: ['paragraph'] },
  },
};
const several = {
  languages: ['sv_SE', 'en_GB'],
  images: { smallestWidth: 1, displayWidth: 1 },
  types: { page: { label: 'Page', plural: 'Pages', collection: 'pages', address: { sv_SE: '/{slug}/', en_GB: '/en/{slug}/' }, elements: ['paragraph'] } },
};

const folders = [];
const makeFolder = () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'konzilo-preview-')));
  folders.push(folder);
  return folder;
};
after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

describe('a draft\'s file', () => {
  test('leaves out what a form holds empty, as a save does', () => {
    const file = draftFile({ title: 'A title', slug: '', parent: null, seo: { search: { title: '' }, advanced: { noindex: false } }, tags: [], body: 'Some words.' });
    assert.equal(file, '---\ntitle: A title\nseo:\n  advanced:\n    noindex: false\n---\n\nSome words.\n');
  });

  test('has nothing to say of a form with nothing in it', () => {
    assert.equal(draftFile({}), '---\n---\n\n');
  });

  test('is read back with the same words, whatever they hold', () => {
    const title = 'Quotes: "a", a colon, # and\na line';
    assert.equal(parse(/^---\n([\s\S]*)---\n/.exec(draftFile({ title }))[1]).title, title);
  });
});

describe('a draft\'s path', () => {
  const one = siteDescription(site);
  const two = siteDescription(several);

  test('is a post\'s file in the folder of a type with pages', () => {
    assert.equal(pathProblem('pages/abc-1.md', one), null);
    assert.equal(pathProblem('sv/abc.md', one) === null, false);
    for (const path of ['notes/abc.md', 'pages/abc.txt', 'pages/.abc.md', 'pages/a/abc.md', '../pages/abc.md', 'pages/../../abc.md', 'settings.json', '', null, 42]) {
      assert.ok(pathProblem(path, one), String(path));
    }
  });

  test('is in its language\'s folder on a site in several', () => {
    assert.equal(pathProblem(`pages/${two.languages[0].tag}/abc.md`, two), null);
    assert.ok(pathProblem('pages/abc.md', two));
    assert.ok(pathProblem('pages/fi/abc.md', two));
  });

  test('gives its key in the ledger', () => {
    assert.equal(keyOfPath('pages/abc.md'), 'abc');
    assert.equal(keyOfPath('pages/sv/abc.md'), 'sv/abc');
  });
});

describe('an unsaved image', () => {
  test('has a plain name below media/, and comes as base64', () => {
    assert.deepEqual(unsavedImage({ name: 'a-1.png', data: Buffer.from('hello').toString('base64') }), { path: 'media/a-1.png', contents: Buffer.from('hello') });
    for (const name of ['../a.png', '.a.png', 'a/b.png', '', undefined]) assert.ok(unsavedImage({ name, data: 'x' }).reason, String(name));
    assert.ok(unsavedImage({ name: 'a.png' }).reason);
  });
});

describe('the runs', () => {
  let content;
  let files;
  let refreshes;
  let imageRuns;
  let moment;

  const runner = (described = site) => previewRunner({
    site: described,
    content,
    now: () => new Date(moment),
    images: async (originals) => {
      imageRuns.push(originals.map(({ path }) => path));
      return namedImages();
    },
    source: {
      refresh: async () => {
        refreshes += 1;
      },
      head: () => 'a-commit',
      files: () => Object.entries(files).map(([path, contents]) => ({ path, contents })),
      originals: () => [],
    },
  });
  const read = (path) => readFileSync(join(content, path), 'utf8');

  beforeEach(() => {
    content = makeFolder();
    files = { 'pages/live.md': sourcePost({ title: 'Live', status: 'published' }, 'Words.') };
    refreshes = 0;
    imageRuns = [];
    moment = '2026-11-03T12:00:00Z';
  });

  test('its first run writes what the source publishes, and no draft', async () => {
    files['pages/waiting.md'] = sourcePost({ title: 'Waiting', status: 'draft' }, 'Words.');
    await runner().refresh();
    assert.ok(existsSync(join(content, 'pages/live.md')));
    assert.equal(existsSync(join(content, 'pages/waiting.md')), false);
  });

  test('a draft gets a page and an address, and its source file need not exist', async () => {
    const shown = await runner().take({ path: 'pages/new-one.md', fields: { title: 'New one', body: 'Words of mine.' } });
    assert.deepEqual(shown, { address: '/pages/new-one/', refusals: [] });
    assert.match(read('pages/new-one.md'), /Words of mine\./);
  });

  test('a draft stands in for its saved file, whatever its status', async () => {
    const shown = await runner().take({ path: 'pages/live.md', fields: { title: 'Live', status: 'draft', body: 'Other words.' } });
    assert.equal(shown.refusals.length, 0);
    assert.match(read('pages/live.md'), /Other words\./);
  });

  test('a refused draft says why, by its field, and its last good page stands', async () => {
    const preview = runner();
    await preview.take({ path: 'pages/new-one.md', fields: { title: 'New one', body: 'Words of mine.' } });
    const before = read('pages/new-one.md');
    const shown = await preview.take({ path: 'pages/new-one.md', fields: { slug: 'new-one', body: 'Other words.' } });
    assert.ok(shown.refusals.some(({ field, reason }) => field === 'title' && /title/.test(reason)), JSON.stringify(shown));
    assert.equal(shown.address, '/pages/new-one/');
    assert.equal(read('pages/new-one.md'), before);
  });

  test('tells a draft nothing of another post\'s refusal', async () => {
    files['pages/broken.md'] = sourcePost({ title: '', status: 'published' }, 'Words.');
    const shown = await runner().take({ path: 'pages/new-one.md', fields: { title: 'New one' } });
    assert.deepEqual(shown.refusals, []);
  });

  test('two people\'s drafts stay side by side, until one has been left for a while', async () => {
    const preview = runner();
    await preview.take({ path: 'pages/one.md', fields: { title: 'One' } });
    await preview.take({ path: 'pages/two.md', fields: { title: 'Two' } });
    assert.ok(existsSync(join(content, 'pages/one.md')));
    assert.ok(existsSync(join(content, 'pages/two.md')));
    moment = '2026-11-03T12:16:00Z';
    await preview.take({ path: 'pages/two.md', fields: { title: 'Two' } });
    assert.equal(existsSync(join(content, 'pages/one.md')), false);
    assert.ok(existsSync(join(content, 'pages/two.md')));
  });

  test('leaves a file that has not changed alone', async () => {
    const preview = runner();
    await preview.take({ path: 'pages/one.md', fields: { title: 'One' } });
    const before = read('pages/live.md');
    await preview.take({ path: 'pages/one.md', fields: { title: 'One again' } });
    assert.equal(read('pages/live.md'), before);
  });

  test('asks the source each run, one run at a time', async () => {
    const preview = runner();
    const both = await Promise.all([
      preview.take({ path: 'pages/one.md', fields: { title: 'One' } }),
      preview.take({ path: 'pages/two.md', fields: { title: 'Two' } }),
    ]);
    assert.deepEqual(both.map(({ address }) => address), ['/pages/one/', '/pages/two/']);
    assert.equal(refreshes, 2);
  });

  test('a run that breaks leaves the next one able to go', async () => {
    const preview = runner();
    const { files: real } = { files };
    files = null;
    await assert.rejects(preview.take({ path: 'pages/one.md', fields: { title: 'One' } }));
    files = real;
    assert.equal((await preview.take({ path: 'pages/one.md', fields: { title: 'One' } })).address, '/pages/one/');
  });

  test('reads what originals are once per commit, and again for an unsaved image', async () => {
    const preview = runner();
    await preview.take({ path: 'pages/one.md', fields: { title: 'One' } });
    await preview.take({ path: 'pages/one.md', fields: { title: 'One again' } });
    assert.equal(imageRuns.length, 1);
    await preview.take({ path: 'pages/one.md', fields: { title: 'One', image: { src: '/media/new.png', alt: 'A picture' } }, images: [{ name: 'new.png', data: Buffer.from('bytes').toString('base64') }] });
    assert.equal(imageRuns.length, 2);
    assert.deepEqual(imageRuns[1], ['media/new.png']);
  });

  test('checks what it is given before anything runs', () => {
    const preview = runner();
    assert.equal(preview.problem({ path: 'pages/one.md', fields: {} }), null);
    assert.ok(preview.problem({ path: '../one.md', fields: {} }));
    assert.ok(preview.problem({ path: 'pages/one.md' }));
    assert.ok(preview.problem({ path: 'pages/one.md', fields: [] }));
    assert.ok(preview.problem({ path: 'pages/one.md', fields: {}, images: 'no' }));
    assert.ok(preview.problem({ path: 'pages/one.md', fields: {}, images: [{ name: '../x', data: '' }] }));
    assert.ok(preview.problem());
  });
});

describe('an unsaved image, through the real seam', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==', 'base64');
  const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>';
  const sourceOf = () => ({ refresh: async () => {}, head: () => 'a-commit', files: () => [], originals: () => [] });
  const fields = (src) => ({ title: 'One', image: { src, alt: 'A picture' }, body: 'Words.' });

  test('gets a master, in the preview\'s own folder', async () => {
    const content = makeFolder();
    const preview = previewRunner({ site, content, source: sourceOf() });
    const shown = await preview.take({ path: 'pages/one.md', fields: fields('/media/new.png'), images: [{ name: 'new.png', data: PNG.toString('base64') }] });
    assert.deepEqual(shown.refusals, []);
    const page = readFileSync(join(content, 'pages/one.md'), 'utf8');
    const master = /media\/([\w-]+-[0-9a-f]{10}\.webp)/.exec(page)?.[1];
    assert.ok(master, page);
    assert.ok(existsSync(join(content, 'media', master)));
  });

  test('an SVG with a script is refused here as at a save', async () => {
    const content = makeFolder();
    const preview = previewRunner({ site, content, source: sourceOf() });
    const shown = await preview.take({ path: 'pages/one.md', fields: fields('/media/new.svg'), images: [{ name: 'new.svg', data: Buffer.from(SVG).toString('base64') }] });
    assert.ok(shown.refusals.length > 0, JSON.stringify(shown));
    assert.ok(shown.refusals.some(({ reason }) => /script/i.test(reason)), JSON.stringify(shown));
  });
});

describe('the source, as Git gives it', () => {
  const made = ({ fails = () => false, moment = { now: 0 } } = {}) => {
    const calls = [];
    const folder = makeFolder();
    const source = gitSource({
      remote: 'http://forgejo:3000/a/source.git',
      user: 'preview-reader',
      token: 'a-token',
      folder,
      home: join(folder, '.home'),
      now: () => moment.now,
      warn: () => {},
      command: async (command, args, options) => {
        calls.push({ command, args, options });
        if (args[0] === 'init') mkdirSync(join(folder, '.git'));
        if (fails(args)) throw new Error(`${args[0]} failed`);
        return { stdout: 'a-commit\n' };
      },
    });
    return { source, calls, folder };
  };

  test('never writes its credential where Git keeps settings, or names it on a command line', async () => {
    const { source, calls } = made();
    await source.refresh();
    for (const { args, options } of calls) {
      assert.doesNotMatch(args.join(' '), /a-token/);
      assert.equal(options.env.GIT_CONFIG_KEY_0, 'http.extraHeader');
      assert.equal(options.env.GIT_CONFIG_VALUE_0, `Authorization: Basic ${Buffer.from('preview-reader:a-token').toString('base64')}`);
      assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
    }
    assert.ok(calls.some(({ args }) => args.join(' ') === 'remote add origin http://forgejo:3000/a/source.git'));
    assert.equal(source.head(), 'a-commit');
  });

  test('asks seldom, while a draft\'s runs come often', async () => {
    const moment = { now: 0 };
    const { source, calls } = made({ moment });
    await source.refresh();
    const fetches = () => calls.filter(({ args }) => args[0] === 'fetch').length;
    moment.now = 5000;
    await source.refresh();
    assert.equal(fetches(), 1);
    moment.now = 11_000;
    await source.refresh();
    assert.equal(fetches(), 2);
  });

  test('goes on with what it has when Forgejo does not answer, and asks again', async () => {
    let down = false;
    const { source, calls } = made({ fails: (args) => down && args[0] === 'fetch' });
    await source.refresh();
    down = true;
    await source.refresh();
    await source.refresh();
    assert.equal(source.head(), 'a-commit');
    assert.ok(calls.filter(({ args }) => args[0] === 'fetch').length >= 1);
  });

  test('says so when it has nothing to go on with', async () => {
    const { source } = made({ fails: (args) => args[0] === 'fetch' });
    await assert.rejects(source.refresh(), /fetch failed/);
  });

  test('reads the checkout, with originals apart, and nothing of Git\'s', async () => {
    const { source, folder } = made();
    mkdirSync(join(folder, 'pages'));
    mkdirSync(join(folder, 'media'));
    writeFileSync(join(folder, 'pages/a.md'), 'a page');
    writeFileSync(join(folder, 'settings.json'), '{}');
    writeFileSync(join(folder, 'media/a.png'), 'bytes');
    writeFileSync(join(folder, '.gitattributes'), 'x');
    assert.deepEqual(source.files().map(({ path }) => path).sort(), ['pages/a.md', 'settings.json']);
    assert.deepEqual(source.originals().map(({ path }) => path), ['media/a.png']);
    assert.equal(source.originals()[0].contents().toString(), 'bytes');
  });
});
