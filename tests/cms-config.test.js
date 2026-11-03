// Sveltia's configuration, made from the site description: every post type and
// taxonomy gets a collection of files named by an ID, references go by that ID,
// and a sign-in can only go through Forgejo's OAuth.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { cmsConfig } from '../src/cms/config.js';
import { demoSource } from '../src/demo-source.js';
import { SCHEMA_TYPES, SEO_KEYS, siteDescription } from '../src/site-description.js';

const file = (path) => fileURLToPath(new URL(`../${path}`, import.meta.url));
const place = { forgejo: 'http://localhost:4403', repository: 'lantern/source', clientId: 'the-client', site: 'http://localhost:4401' };
const description = siteDescription(JSON.parse(readFileSync(file('site-template/files/site-description.json'), 'utf8')));
const config = cmsConfig(description, place);
const collection = (name) => config.collections.find((one) => one.name === name);
const field = (fields, name) => fields.find((one) => one.name === name);

test('signs in through Forgejo alone, with no token option', () => {
  assert.deepEqual(config.backend, {
    name: 'forgejo',
    repo: 'lantern/source',
    branch: 'main',
    base_url: 'http://localhost:4403',
    api_root: 'http://localhost:4403/api/v1',
    app_id: 'the-client',
    auth_methods: ['oauth'],
  });
  assert.equal(config.publish_mode, 'simple');
});

test('makes no reference to anything outside this copy of the site', () => {
  assert.deepEqual(config.media_libraries, { stock_assets: { providers: [] } });
  for (const value of [config.site_url, config.display_url, config.backend.base_url, config.backend.api_root]) {
    assert.match(value, /^http:\/\/localhost:/);
  }
});

test('names every post and term by an ID an editor cannot change', () => {
  for (const name of ['articles', 'pages', 'categories', 'tags']) {
    assert.deepEqual(collection(name).slug, { template: '{{uuid_short}}', editable: false }, name);
    assert.equal(collection(name).folder, name);
    assert.equal(collection(name).create, true);
  }
});

test('makes a new post a draft, and leaves out what the intake derives', () => {
  const { fields } = collection('articles');
  assert.equal(field(fields, 'status').default, 'draft');
  assert.deepEqual(field(fields, 'status').options.map((option) => option.value), ['draft', 'scheduled', 'published']);
  assert.equal(field(fields, 'modified'), undefined);
  assert.equal(field(fields, 'oldAddresses'), undefined);
});

test('edits a body in Konzilo\'s own field, which knows what its type takes and which forms the site has', () => {
  for (const type of Object.values(description.types)) {
    const body = field(collection(type.collection).fields, 'body');
    assert.equal(body.widget, 'konzilo-body');
    assert.deepEqual(body.elements, type.elements);
    assert.deepEqual(body.forms, Object.keys(description.forms ?? {}));
    assert.equal(body.required, false);
  }
});

test('refers to a term and a parent by ID', () => {
  const categories = field(collection('articles').fields, 'categories');
  assert.equal(categories.widget, 'relation');
  assert.equal(categories.collection, 'categories');
  assert.equal(categories.value_field, '{{slug}}');
  assert.equal(categories.multiple, true);
  assert.equal(categories.required, true);
  assert.equal(field(collection('pages').fields, 'parent').collection, 'pages');
  assert.equal(field(collection('articles').fields, 'parent'), undefined);
  assert.equal(field(collection('categories').fields, 'parent').collection, 'categories');
  assert.equal(field(collection('tags').fields, 'parent'), undefined);
});

test('shows the site\'s settings and groups in one file, and a menu in its own', () => {
  const [settings] = collection('settings').files;
  assert.equal(settings.file, 'settings.json');
  for (const name of ['title', 'logo', 'icon', ...description.groups.map((group) => group.name)]) {
    assert.ok(field(settings.fields, name), name);
  }
  for (const [name, menu] of Object.entries(description.menus)) {
    const one = collection('menus').files.find((entry) => entry.name === name);
    assert.equal(one.file, `menus/${name}.json`);
    assert.equal(one.label, menu.label);
  }
});

test('keeps what the published files never hold out of the form', () => {
  assert.doesNotMatch(JSON.stringify(config), /"recipients"|"retention"/);
});

test('gives a field only a plain value as its default, which is all Sveltia takes', () => {
  const walk = (fields) => {
    for (const one of fields) {
      if ('default' in one) assert.ok(['string', 'number', 'boolean'].includes(typeof one.default), one.name);
      if (one.fields) walk(one.fields);
    }
  };
  for (const { fields, files } of config.collections) {
    if (fields) walk(fields);
    for (const one of files ?? []) walk(one.fields);
  }
});

test('takes its labels in the site\'s language', () => {
  const swedish = cmsConfig(siteDescription({ ...JSON.parse(readFileSync(file('site-template/files/site-description.json'), 'utf8')), language: 'sv_SE' }), place);
  assert.equal(field(swedish.collections[0].fields, 'title').label, 'Titel');
  assert.equal(field(config.collections[0].fields, 'title').label, 'Title');
});

test('writes each language in a folder of its own on a site in several', () => {
  const { language: _one, ...declared } = JSON.parse(readFileSync(file('site-template/files/site-description.json'), 'utf8'));
  declared.languages = ['sv_SE', 'en_GB'];
  for (const type of Object.values(declared.types)) {
    if (typeof type.address === 'string') type.address = { sv_SE: type.address, en_GB: type.address.replace(/^\/(?=[a-z]+\/)/, '/en-') };
  }
  const several = cmsConfig(siteDescription(declared), place);
  assert.deepEqual(several.i18n.locales, ['sv-SE', 'en-GB']);
  assert.equal(several.i18n.default_locale, 'sv-SE');
  assert.equal(several.i18n.canonical_slug.key, 'translationKey');
  const { fields } = several.collections[0];
  assert.equal(field(fields, 'title').i18n, true);
  assert.equal(field(fields, 'status').i18n, 'duplicate');
});

test('every file of the demo source fits the collections, by ID', () => {
  const files = demoSource(description, file('site-template/demo-content'));
  const paths = files.map((one) => one.path);
  assert.ok(paths.includes('settings.json'));
  assert.ok(paths.includes('menus/main.json'));
  assert.ok(paths.some((path) => /^media\/.+\.webp$/.test(path)));
  assert.equal(paths.includes('consent.json'), false, 'the intake makes that');
  const posts = files.filter((one) => /^(articles|pages)\//.test(one.path));
  assert.equal(posts.length, 14);
  for (const post of posts) assert.match(post.path, /^(articles|pages)\/[0-9a-f]{12}\.md$/);

  const terms = new Set(files.filter((one) => one.path.startsWith('categories/')).map((one) => /([0-9a-f]{12})\.json$/.exec(one.path)[1]));
  const article = posts.find((one) => one.content.includes('title: "Quiet harbours and the lantern"')).content;
  assert.match(article, /\nslug: "quiet-harbours-and-the-lantern"\n/);
  assert.match(article, /\nstatus: "published"\n/);
  assert.doesNotMatch(article, /\nmodified:/);
  const categories = JSON.parse(/\ncategories: (\[.*\])\n/.exec(article)[1]);
  assert.equal(categories.length, 2);
  for (const id of categories) assert.ok(terms.has(id), id);
  assert.match(article, /\nimage: \{"src":"\/media\/quiet-harbours-and-the-lantern-737b017c8a\.webp",/);
});

test('gives a child page its parent by ID, and gives the same files each time', () => {
  const files = demoSource(description, file('site-template/demo-content'));
  const child = files.find((one) => one.path.startsWith('pages/') && one.content.includes('title: "Bright librarys and the bridge"'));
  const parent = files.find((one) => one.path.startsWith('pages/') && one.content.includes('title: "Northern orchards and the lantern"'));
  const parentId = /([0-9a-f]{12})\.md$/.exec(parent.path)[1];
  assert.match(child.content, new RegExp(`\\nparent: "${parentId}"\\n`));
  assert.deepEqual(demoSource(description, file('site-template/demo-content')).map((one) => one.path), files.map((one) => one.path));
});

test('makes nothing from inside another\'s form, but for a post\'s terms', () => {
  const allowed = [];
  const walk = (fields) => {
    for (const one of fields ?? []) {
      if (one.widget === 'relation' && one.allow_add !== false) allowed.push(one.name);
      walk(one.fields);
    }
  };
  for (const entry of config.collections) {
    walk(entry.fields);
    for (const file of entry.files ?? []) walk(file.fields);
  }
  assert.deepEqual([...new Set(allowed)].sort(), ['categories', 'tags']);
});

test('holds search and sharing in closed parts, each key once, with nothing required', () => {
  for (const type of Object.values(description.types)) {
    const seo = field(collection(type.collection).fields, 'seo');
    if (!seo) continue;
    assert.equal(seo.accordion, true);
    assert.equal(seo.collapsed, true);
    assert.equal(seo.required, false);
    assert.deepEqual(seo.fields.map((part) => part.name), ['search', 'sharing', 'advanced']);
    const keys = seo.fields.flatMap((part) => {
      assert.equal(part.accordion, true);
      assert.equal(part.collapsed, true);
      assert.equal(part.required, false);
      return part.fields.map((one) => {
        assert.equal(one.required, false);
        return one.name;
      });
    });
    assert.deepEqual([...keys].sort(), [...SEO_KEYS].sort());
    assert.deepEqual(field(field(seo.fields, 'advanced').fields, 'schema').options, [...SCHEMA_TYPES]);
    // What the field holds is a name: the levels themselves follow from where the post sits.
    const breadcrumb = field(field(seo.fields, 'search').fields, 'breadcrumb');
    assert.equal(breadcrumb.label, 'Name in breadcrumbs');
    assert.match(breadcrumb.hint, /instead of the title/i);
    assert.match(breadcrumb.hint, /follow/i);
  }
});

test('holds search and sharing per language on a site in several', () => {
  const { language: _one, ...declared } = JSON.parse(readFileSync(file('site-template/files/site-description.json'), 'utf8'));
  declared.languages = ['sv_SE', 'en_GB'];
  for (const type of Object.values(declared.types)) {
    if (typeof type.address === 'string') type.address = { sv_SE: type.address, en_GB: type.address.replace(/^\/(?=[a-z]+\/)/, '/en-') };
  }
  const several = cmsConfig(siteDescription(declared), place);
  const seo = several.collections.find((one) => one.name === 'articles').fields.find((one) => one.name === 'seo');
  assert.equal(seo.i18n, true);
  for (const part of seo.fields) {
    assert.equal(part.i18n, true);
    for (const one of part.fields) assert.equal(one.i18n, true);
  }
});
