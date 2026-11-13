// A site's components taken from a package: the declarations its site description names by
// `componentsFrom`, a package specifier or a path in the site repository, whole, with labels of
// the site's own in each language under `componentLabels` and its own components beside them,
// and the check of what they hold, `componentChecks`, from a package too. The package here is a
// fixture, tests/packages/design, installed in each site repository as npm installs one.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { handsFor, refusalsOf } from '../src/cms/body/check.js';
import { useComponents } from '../src/cms/body/components.js';
import { cmsConfig } from '../src/cms/config.js';
import { componentChecksOf } from '../src/intake/component-checks.js';
import { reader } from '../src/intake/reader.js';
import { runnerOncePrepared } from '../src/preview/runner.js';
import { liveDescription } from '../src/service/live-description.js';
import { readSiteDescription, readSiteDescriptionWithoutTakenComponents, siteDescription, siteRules } from '../src/site-description.js';
import { everyElement, namedImages, pagePath, pageSource, run } from './lib/intake.js';

const PACKAGE = fileURLToPath(new URL('./packages/design/', import.meta.url));
const DECLARATIONS = '@fixture/design/directives/components.json';
const CHECKS = '@fixture/design/directives/checks';

const folders = [];
after(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

// A site repository with this description and these files, the fixture package installed in its
// node_modules unless `installed` is false.
function siteRepository(declared, { files = {}, installed = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'konzilo-site-package-'));
  folders.push(root);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'site', private: true, type: 'module' }));
  writeFileSync(join(root, 'site-description.json'), JSON.stringify(declared));
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
  if (installed) cpSync(PACKAGE, join(root, 'node_modules/@fixture/design'), { recursive: true });
  return root;
}

const read = (root) => readSiteDescription(join(root, 'site-description.json'));
const readForNoBody = (root) => readSiteDescriptionWithoutTakenComponents(join(root, 'site-description.json'));

// A site of every core element, which takes the package's components, and whose page takes them.
const taking = (extra = {}) => ({
  ...everyElement,
  componentsFrom: DECLARATIONS,
  types: { page: { ...everyElement.types.page, elements: [...everyElement.types.page.elements, 'section', 'eyebrow', 'list-directive'] } },
  ...extra,
});

describe('a site description that takes its components from a package', () => {
  test('takes every component the package declares, whole, into the rule data its bodies are read against', () => {
    const site = read(siteRepository(taking()));
    assert.deepEqual(Object.keys(site.components), ['section', 'eyebrow', 'list']);
    assert.equal(site.components.section.form, 'container');
    assert.deepEqual(site.components.section.attributes.surface.values, ['page', 'raised']);
    assert.equal(site.components.list.element, 'list-directive');
    assert.equal(site.componentsFrom, DECLARATIONS);
    assert.equal(siteRules(site).elements['list-directive'].directive.name, 'list');
  });

  test('gives a component it takes, and its attributes, the site\'s labels in each language, over the package\'s British English', () => {
    const site = read(siteRepository(taking({
      componentLabels: {
        section: { label: { sv: 'Sektion' }, attributes: { surface: { label: { sv: 'Yta' } }, anchor: { label: { en: 'Anchor', sv: 'Ankare' } } } },
        list: { label: 'Serie' },
      },
    })));
    const place = { site: 'https://example.com', forgejo: 'https://git.example.com', repository: 'site/source', clientId: 'id' };
    const swedish = cmsConfig(site, { ...place, language: 'sv' }).konzilo.components;
    const english = cmsConfig(site, { ...place, language: 'en' }).konzilo.components;
    assert.equal(swedish.section.label, 'Sektion');
    assert.equal(english.section.label, 'Section');
    assert.equal(swedish.section.attributes.surface.label, 'Yta');
    assert.equal(english.section.attributes.surface.label, 'Surface');
    assert.equal(swedish.section.attributes.anchor.label, 'Ankare');
    assert.equal(english.section.attributes.anchor.label, 'Anchor');
    assert.equal(swedish.list.label, 'Serie');
    assert.equal(english.list.label, 'Serie');
    assert.equal(english.eyebrow.label, 'Eyebrow');
    assert.deepEqual(swedish.section.attributes.surface.values, ['page', 'raised']);
  });

  test('takes the site\'s own components beside the package\'s, after them', () => {
    const declared = taking({ components: { booking: { label: 'Booking', form: 'leaf', body: 'none' } } });
    declared.types.page.elements.push('booking');
    const site = read(siteRepository(declared));
    assert.deepEqual(Object.keys(site.components), ['section', 'eyebrow', 'list', 'booking']);
    assert.equal(siteRules(site).elements.booking.directive.name, 'booking');
  });

  for (const [what, extra, problem] of [
    ['a component of its own named as one it takes', { components: { section: { label: 'Section', form: 'leaf', body: 'none' } } }, /components\.section: @fixture\/design\/directives\/components\.json declares section too, and a site gives a component it takes its labels alone, under componentLabels/],
    ['labels for a component the package does not declare', { componentLabels: { hero: { label: 'Hero' } } }, /componentLabels\.hero: @fixture\/design\/directives\/components\.json declares no component hero/],
    ['a label for an attribute the component does not have', { componentLabels: { section: { attributes: { tone: { label: 'Tone' } } } } }, /componentLabels\.section\.attributes\.tone: section, as @fixture\/design\/directives\/components\.json declares it, has no attribute tone/],
    ['more than labels', { componentLabels: { section: { form: 'leaf' } } }, /componentLabels\.section\.form: is not part of the labels of a component the site takes/],
    ['a label by language without British English where the package gives none', { componentLabels: { section: { attributes: { anchor: { label: { sv: 'Ankare' } } } } } }, /componentLabels\.section\.attributes\.anchor\.label: gives no en/],
    ['a label in a language the interface does not come in', { componentLabels: { section: { label: { xx: 'Section' } } } }, /componentLabels\.section\.label\.xx: xx is not a language Konzilo's interface comes in/],
  ]) {
    test(`refuses ${what}`, () => {
      assert.throws(() => read(siteRepository(taking(extra))), problem);
    });
  }

  test('takes them from a JSON file in the site repository, by its path from the root, too', () => {
    const files = { 'design/components.json': JSON.stringify({ eyebrow: { label: 'Eyebrow', form: 'leaf', body: 'text' } }) };
    const declared = { ...everyElement, componentsFrom: 'design/components.json', types: { page: { ...everyElement.types.page, elements: ['paragraph', 'eyebrow'] } } };
    assert.deepEqual(Object.keys(read(siteRepository(declared, { files, installed: false })).components), ['eyebrow']);
  });

  test('finds a package as Node finds a require() of it, linked into the site repository from elsewhere, or in a folder above it', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'konzilo-package-elsewhere-'));
    folders.push(elsewhere);
    cpSync(PACKAGE, elsewhere, { recursive: true });
    const linked = siteRepository(taking(), { installed: false });
    mkdirSync(join(linked, 'node_modules/@fixture'), { recursive: true });
    symlinkSync(elsewhere, join(linked, 'node_modules/@fixture/design'));
    assert.deepEqual(Object.keys(read(linked).components), ['section', 'eyebrow', 'list']);
    const above = siteRepository({}, { installed: true });
    const below = join(above, 'sites/one');
    mkdirSync(below, { recursive: true });
    writeFileSync(join(below, 'site-description.json'), JSON.stringify(taking()));
    assert.deepEqual(Object.keys(read(below).components), ['section', 'eyebrow', 'list']);
  });

  // The components a description takes, as a process whose working folder is `cwd` reads it by `path`.
  function componentsReadBy(path, cwd) {
    const module = fileURLToPath(new URL('../src/site-description.js', import.meta.url));
    const script = `import(${JSON.stringify(module)}).then(({ readSiteDescription }) => console.log(JSON.stringify(Object.keys(readSiteDescription(${JSON.stringify(path)}).components))))`;
    const ran = spawnSync(process.execPath, ['-e', script], { cwd, encoding: 'utf8' });
    assert.equal(ran.status, 0, ran.stderr);
    return JSON.parse(ran.stdout);
  }

  test('takes them where the description is read by a relative path, from the site repository\'s folder or from another', () => {
    const root = siteRepository(taking());
    assert.deepEqual(componentsReadBy('site-description.json', root), ['section', 'eyebrow', 'list']);
    assert.deepEqual(componentsReadBy(relative(tmpdir(), join(root, 'site-description.json')), tmpdir()), ['section', 'eyebrow', 'list']);
  });

  test('refuses a package the site repository has not installed, naming it', () => {
    assert.throws(() => read(siteRepository(taking(), { installed: false })), /componentsFrom: @fixture\/design\/directives\/components\.json cannot be found in the site repository's packages: Cannot find module/);
  });

  test('says how a package exports a file it is to find, where it exports it for import alone', () => {
    const files = {
      'node_modules/@fixture/esm/package.json': JSON.stringify({ name: '@fixture/esm', type: 'module', exports: { './components.json': { import: './components.json' } } }),
      'node_modules/@fixture/esm/components.json': '{}',
    };
    assert.throws(() => read(siteRepository(taking({ componentsFrom: '@fixture/esm/components.json' }), { files })), /componentsFrom: @fixture\/esm\/components\.json cannot be found in the site repository's packages: .*; a package exports the file under "default", or by a plain path/);
  });

  test('names a problem of what it takes by the file it is in', () => {
    const files = { 'design/components.json': JSON.stringify({ eyebrow: { label: 'Eyebrow', form: 'leaf', body: 'blocks' } }) };
    const declared = { ...everyElement, componentsFrom: 'design/components.json' };
    assert.throws(() => read(siteRepository(declared, { files, installed: false })), /componentsFrom: design\/components\.json: eyebrow\.body: a leaf's body is none or text/);
    assert.throws(() => read(siteRepository(declared, { files: { 'design/components.json': '[]' }, installed: false })), /componentsFrom: design\/components\.json: must be an object of components, by name/);
    assert.throws(() => read(siteRepository(declared, { files: { 'design/components.json': '{' }, installed: false })), /componentsFrom: design\/components\.json is not JSON/);
  });

  test('refuses a value that is neither a JSON file\'s path in the site repository nor a package specifier', () => {
    for (const value of ['/etc/components.json', '../components.json', 'components.js', '@fixture', '@fixture/design/../other/components.json', '@fixture/design/./components.json', '@fixture/design/directives/', 42]) {
      assert.throws(() => read(siteRepository(taking({ componentsFrom: value }))), /componentsFrom: must be the path of a JSON file in the site repository, from its root, such as components\.json, or a package specifier, a scoped package's name and the path of a file it exports, such as @example\/design\/directives\/components\.json$/m, String(value));
    }
  });

  test('is read without what it takes where it is checked without a site repository, and reads no body so', () => {
    const site = siteDescription(taking());
    assert.equal(site.components, null);
    assert.throws(() => siteRules(site), /the site description was read without the components it takes \(componentsFrom\), so no body can be read against it/);
  });

  test('refuses labels for components it takes none of', () => {
    assert.throws(() => read(siteRepository({ ...everyElement, componentLabels: { section: { label: 'Section' } } })), /componentLabels: gives labels to the components the site takes, and it takes none \(componentsFrom\)/);
  });
});

describe('the check of what the components hold, from a package', () => {
  const out = (site, components, body) => run({ [pagePath]: pageSource(body) }, site, { components }).refusals.map((one) => one.message);

  test('refuses a post for each reason the package\'s module gives', async () => {
    const root = siteRepository(taking({ componentChecks: CHECKS }));
    const site = read(root);
    assert.equal(site.componentChecks, CHECKS);
    const components = await componentChecksOf(site, root);
    assert.deepEqual(out(site, components, ':::list\n- One\n:::'), []);
    assert.ok(out(site, components, ':::list\nNo list\n:::').some((one) => /a series holds one list/.test(one)));
  });

  test('checks the site\'s own components by its own module, which may ask the package\'s', async () => {
    const declared = taking({
      componentChecks: 'checks.js',
      components: { booking: { label: 'Booking', form: 'container', body: 'blocks' } },
    });
    declared.types.page.elements.push('booking');
    const checks = [
      `import { componentProblems as designs } from '${CHECKS}';`,
      'export function componentProblems(name, attributes, blocks) {',
      '  return name === "booking" ? (blocks.length > 0 ? [] : ["a booking says what is booked"]) : designs(name, attributes, blocks);',
      '}',
    ].join('\n');
    const root = siteRepository(declared, { files: { 'checks.js': checks } });
    const site = read(root);
    const components = await componentChecksOf(site, root);
    assert.ok(out(site, components, ':::booking\n:::').some((one) => /a booking says what is booked/.test(one)));
    assert.ok(out(site, components, ':::list\nNo list\n:::').some((one) => /a series holds one list/.test(one)));
  });

  test('breaks the check where the site repository has not installed the package, naming it', async () => {
    const root = siteRepository({ ...everyElement, components: { box: { label: 'Box', form: 'container', body: 'blocks' } }, componentChecks: CHECKS }, { installed: false });
    await assert.rejects(componentChecksOf(read(root), root), /the site's componentChecks, @fixture\/design\/directives\/checks, cannot be read: @fixture\/design\/directives\/checks cannot be found in the site repository's packages/);
  });

  test('refuses a value that is neither a module\'s path in the site repository nor a package specifier', () => {
    for (const value of ['/etc/checks.js', '../checks.js', 'checks.json', '@fixture']) {
      assert.throws(() => read(siteRepository(taking({ componentChecks: value }))), /componentChecks: must be the path of a JavaScript module in the site repository, from its root, such as component-checks\.js, or a package specifier, a scoped package's name and the path of a file it exports, such as @example\/design\/directives\/checks$/m, value);
    }
  });
});

describe('the editor\'s configuration, as konzilo-cms writes it, and its early check', () => {
  let root;
  let written;
  before(() => {
    root = siteRepository(taking({
      componentChecks: CHECKS,
      componentLabels: { section: { label: { sv: 'Sektion' }, attributes: { surface: { label: { sv: 'Yta' } } } } },
    }));
    const command = fileURLToPath(new URL('../bin/konzilo-cms.js', import.meta.url));
    const ran = spawnSync(process.execPath, [command, root, join(root, 'out/config.json')], {
      cwd: tmpdir(),
      encoding: 'utf8',
      env: { ...process.env, KONZILO_FORGEJO_ORIGIN: 'http://localhost:1', KONZILO_SITE_ORIGIN: 'http://localhost:2', KONZILO_REPOSITORY: 'a/b', KONZILO_OAUTH_CLIENT: 'c' },
    });
    assert.equal(ran.status, 0, ran.stderr);
    written = (name) => JSON.parse(readFileSync(join(root, 'out', name), 'utf8'));
  });
  after(() => useComponents({}));

  test('gives the editor the components the site takes from the package, with the site\'s labels in each language', () => {
    const { section, eyebrow, list } = written('config.sv.json').konzilo.components;
    assert.equal(section.label, 'Sektion');
    assert.equal(section.attributes.surface.label, 'Yta');
    assert.deepEqual(section.attributes.surface.values, ['page', 'raised']);
    assert.equal(eyebrow.label, 'Eyebrow');
    assert.equal(list.element, 'list-directive');
    assert.equal(written('config.en.json').konzilo.components.section.label, 'Section');
  });

  test('has the early check read the package\'s components from the configuration, refuse by the site\'s labels, and run no check of the package\'s', () => {
    useComponents(written('config.sv.json').konzilo.components);
    const { elements } = read(root).types.page;
    assert.deepEqual(refusalsOf(':::section{surface="raised"}\n\n::eyebrow[Over]\n\n:::', handsFor(reader, { elements })), []);
    const refused = refusalsOf(':::section\n\nText\n\n:::', handsFor(reader, { elements: ['paragraph'] }));
    assert.deepEqual(refused.map(({ reason }) => reason.values.element), [{ label: 'Sektion' }]);
    assert.deepEqual(refusalsOf(':::list\n\nNo list\n\n:::', handsFor(reader, { elements })), [], 'the intake alone refuses what the package\'s check refuses');
  });
});

describe('the intake\'s command', () => {
  test('finds the package from the site repository it is given, and refuses what the package\'s check refuses', () => {
    const root = siteRepository(taking({ componentChecks: CHECKS }), {
      files: {
        'source/pages/1a2b3c4d5e6f.md': pageSource(':::list\nNo list\n:::'),
        'source/pages/6f5e4d3c2b1a.md': pageSource(':::list\n- One\n:::').replace('slug: "hello-world"', 'slug: "series"'),
      },
    });
    const command = fileURLToPath(new URL('../bin/konzilo-intake.js', import.meta.url));
    const result = spawnSync(process.execPath, [command, join(root, 'source'), '--no-roles', '--site', root, '--content', join(root, 'content')], { cwd: tmpdir(), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.deepEqual(report.refusals.map(({ file }) => file), ['pages/1a2b3c4d5e6f.md']);
    assert.match(report.refusals[0].message, /a series holds one list/);
    assert.match(readFileSync(join(root, 'content/pages/series.md'), 'utf8'), /:::list\n\n- One\n\n:::/);
  });
});

describe('a reader that reads no body', () => {
  test('reads the description without the components it takes, where the site repository has not installed the package', () => {
    const root = siteRepository(taking({ componentLabels: { section: { label: { sv: 'Sektion' } } }, components: { booking: { label: 'Booking', form: 'leaf', body: 'none' } } }), { installed: false });
    const site = readForNoBody(root);
    assert.equal(site.components, null);
    assert.equal(site.componentsFrom, DECLARATIONS);
    assert.ok(site.types.page.elements.includes('section'));
    assert.throws(() => siteRules(site), /the site description was read without the components it takes \(componentsFrom\), so no body can be read against it/);
  });

  test('refuses all the same what it can tell is wrong', () => {
    const root = siteRepository(taking({ componentLabels: { section: { label: 42 } }, components: { box: { label: 'Box', form: 'leaf', body: 'blocks' } } }), { installed: false });
    assert.throws(() => readForNoBody(root), (error) => /componentLabels\.section\.label: must be a non-empty string/.test(error.message) && /components\.box\.body: a leaf's body is none or text/.test(error.message));
  });

  test('is the service, which reads the forms, and no body', () => {
    const root = siteRepository({ ...taking(), forms: { contact: { label: 'Contact', fields: [{ name: 'note', label: 'Note', kind: 'textarea' }] } } }, { installed: false });
    assert.deepEqual(Object.keys(liveDescription(join(root, 'site-description.json'))().forms), ['contact']);
  });
});

describe('the live preview, whose gate stands before the site\'s code is prepared', () => {
  test('answers a draft at once by the description without what it takes, and runs the intake with the package\'s components and check once the code is prepared', async () => {
    const declared = taking({ componentChecks: CHECKS, componentLabels: { section: { label: { sv: 'Sektion' } } } });
    // The site's folder, as the preview's container mounts it, with no package installed, and the
    // copy of its code the container prepares, with its packages.
    const described = readForNoBody(siteRepository(declared, { installed: false }));
    const work = siteRepository(declared);
    const content = join(work, 'content');
    mkdirSync(content);
    let prepare;
    const prepared = new Promise((resolve) => {
      prepare = resolve;
    });
    const source = { refresh: async () => {}, head: () => 'a-commit', files: () => [{ path: pagePath, contents: pageSource(':::section\n\n::eyebrow[Over]\n\n:::') }], originals: () => [] };
    const runner = runnerOncePrepared({ described, prepared, folder: work, content, source, images: async () => namedImages() });
    assert.equal(runner.problem({ path: pagePath, fields: {} }), null);
    assert.match(runner.problem({ path: 'elsewhere/1a2b3c4d5e6f.md', fields: {} }), /./);
    assert.equal(runner.at('/hello-world/'), null);
    prepare();
    await runner.refresh();
    assert.equal(runner.at('/hello-world/').refusals.length, 0);
    assert.match(readFileSync(join(content, 'pages/hello-world.md'), 'utf8'), /:::section\n\n::eyebrow\[Over\]\n\n:::/);
    const { refusals } = await runner.take({ path: pagePath, fields: { title: 'Hello world', slug: 'hello-world', status: 'published', body: ':::list\nNo list\n:::' } });
    assert.ok(refusals.some(({ reason }) => /a series holds one list/.test(reason)), JSON.stringify(refusals));
  });

  test('says what the package lacks once the code is prepared, and answers a draft all the same', async () => {
    const declared = taking();
    const described = readForNoBody(siteRepository(declared, { installed: false }));
    const work = siteRepository(declared, { installed: false });
    const source = { refresh: async () => {}, head: () => 'a-commit', files: () => [], originals: () => [] };
    const runner = runnerOncePrepared({ described, prepared: Promise.resolve(), folder: work, content: join(work, 'content'), source });
    await assert.rejects(runner.ready, /componentsFrom: @fixture\/design\/directives\/components\.json cannot be found in the site repository's packages/);
    await assert.rejects(runner.refresh(), /cannot be found in the site repository's packages/);
    assert.equal(runner.problem({ path: pagePath, fields: {} }), null);
  });
});
