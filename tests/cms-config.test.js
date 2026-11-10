// Sveltia's configuration, made from the site description: every post type and
// taxonomy gets a collection of files named by an ID, references go by that ID,
// and a sign-in can only go through Forgejo's OAuth.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
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

describe('the interface language', () => {
  const declared = () => JSON.parse(readFileSync(file('site-template/files/site-description.json'), 'utf8'));
  const swedish = siteDescription({ ...declared(), language: 'sv_SE' });
  const title = (made) => field(made.collections[0].fields, 'title').label;

  test('takes the core\'s labels in the site\'s interface language, or in the one it is made for, and says which', () => {
    assert.equal(title(cmsConfig(swedish, place)), 'Titel');
    assert.equal(cmsConfig(swedish, place).konzilo.language, 'sv');
    assert.equal(title(cmsConfig(swedish, { ...place, language: 'en' })), 'Title');
    assert.equal(cmsConfig(swedish, { ...place, language: 'en' }).konzilo.language, 'en');
    assert.equal(title(config), 'Title');
    assert.equal(config.konzilo.language, 'en');
    assert.equal(title(cmsConfig(siteDescription({ ...declared(), interfaceLanguage: 'sv' }), place)), 'Titel');
  });

  test('shows a site\'s own label given by language in the interface language, and one given as one text in every language', () => {
    const given = declared();
    given.language = 'sv_SE';
    given.types.article.label = { en: 'Article', sv: 'Artikel' };
    given.types.article.plural = { en: 'Articles', sv: 'Artiklar' };
    given.types.article.fields.size = { label: { en: 'Size', sv: 'Storlek' }, type: 'string', control: 'text' };
    given.taxonomies.category.plural = { en: 'Categories', sv: 'Kategorier' };
    given.menus.main.label = { en: 'Main menu', sv: 'Huvudmeny' };
    given.settings.footerText.label = { en: 'Footer text', sv: 'Sidfotstext' };
    given.components = { card: { label: { en: 'Card', sv: 'Kort' }, form: 'container', body: 'blocks', attributes: { tone: { type: 'string', label: { en: 'Tone', sv: 'Ton' } } } } };
    const site = siteDescription(given);
    for (const [language, words] of [
      ['sv', { articles: 'Artiklar', article: 'Artikel', size: 'Storlek', categories: 'Kategorier', menu: 'Huvudmeny', footer: 'Sidfotstext', card: 'Kort', tone: 'Ton' }],
      ['en', { articles: 'Articles', article: 'Article', size: 'Size', categories: 'Categories', menu: 'Main menu', footer: 'Footer text', card: 'Card', tone: 'Tone' }],
    ]) {
      const made = cmsConfig(site, { ...place, language });
      const one = (name) => made.collections.find((each) => each.name === name);
      assert.equal(one('articles').label, words.articles, language);
      assert.equal(one('articles').label_singular, words.article, language);
      assert.equal(field(one('articles').fields, 'size').label, words.size, language);
      assert.equal(field(one('articles').fields, 'categories').label, words.categories, language);
      assert.equal(one('categories').label, words.categories, language);
      assert.equal(one('menus').files[0].label, words.menu, language);
      assert.equal(field(one('settings').files[0].fields, 'footerText').label, words.footer, language);
      assert.equal(made.konzilo.components.card.label, words.card, language);
      assert.equal(made.konzilo.components.card.attributes.tone.label, words.tone, language);
      // One text is the same in every language.
      assert.equal(one('pages').label, 'Pages', language);
      assert.equal(one('tags').label, 'Tags', language);
    }
  });

  test('shows the core\'s settings groups in the interface language, Breadcrumbs among them, with their headings, labels and help', () => {
    const breadcrumbs = (language) => {
      const made = cmsConfig(swedish, { ...place, language });
      const group = field(made.collections.find((one) => one.name === 'settings').files[0].fields, 'breadcrumbs');
      const article = field(field(group.fields, 'types').fields, 'article');
      const current = field(article.fields, 'current');
      return { heading: group.label, description: group.hint, label: current.label, help: current.hint };
    };
    assert.deepEqual(breadcrumbs('sv'), {
      heading: 'Brödsmulor',
      description: 'Om en sidas brödsmulor slutar med sidan själv, per typ. Den strukturerade datan har alltid med sidan själv; en sida direkt under startsidan har inga brödsmulor utan den.',
      label: 'Sidan själv sist',
      help: 'När den är av slutar brödsmulorna på nivån ovanför sidan.',
    });
    assert.deepEqual(breadcrumbs('en'), {
      heading: 'Breadcrumbs',
      description: 'Whether a page\'s breadcrumbs end with the page itself, by type. The structured data always holds the page itself; a page right under the start page has no breadcrumbs without it.',
      label: 'The page itself last',
      help: 'Off, the breadcrumbs end at the level above the page.',
    });
  });

  test('is written by konzilo-cms beside the site\'s own: one configuration in each language the interface comes in', () => {
    const folder = mkdtempSync(join(tmpdir(), 'konzilo-cms-'));
    const site = join(folder, 'site');
    mkdirSync(site);
    writeFileSync(join(site, 'site-description.json'), JSON.stringify({ ...declared(), language: 'sv_SE' }));
    const ran = spawnSync(process.execPath, [file('bin/konzilo-cms.js'), site, join(folder, 'out/config.json')], {
      encoding: 'utf8',
      env: { ...process.env, KONZILO_FORGEJO_ORIGIN: 'http://localhost:1', KONZILO_SITE_ORIGIN: 'http://localhost:2', KONZILO_REPOSITORY: 'a/b', KONZILO_OAUTH_CLIENT: 'c' },
    });
    assert.equal(ran.status, 0, ran.stderr);
    const written = (name) => JSON.parse(readFileSync(join(folder, 'out', name), 'utf8'));
    assert.deepEqual(readdirSync(join(folder, 'out')).sort(), ['config.en.json', 'config.json', 'config.sv.json']);
    assert.equal(written('config.json').konzilo.language, 'sv');
    assert.equal(title(written('config.json')), 'Titel');
    assert.equal(title(written('config.sv.json')), 'Titel');
    assert.equal(title(written('config.en.json')), 'Title');
    assert.equal(written('config.en.json').konzilo.language, 'en');
  });
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

test('says where the live preview is, and which collections have pages to show there', () => {
  const given = cmsConfig(description, { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2', preview: 'http://localhost:3' });
  const withPages = Object.values(description.types).filter((type) => type.address).map((type) => type.collection);
  assert.deepEqual(given.konzilo, { language: 'en', preview: { origin: 'http://localhost:3', collections: withPages } });
  assert.ok(withPages.length > 0);
  assert.deepEqual(cmsConfig(description, { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' }).konzilo, { language: 'en' });
});

test('holds search and sharing per language on a site in several', () => {
  const { language: _one, ...declared } = JSON.parse(readFileSync(file('site-template/files/site-description.json'), 'utf8'));
  declared.languages = ['sv_SE', 'en_GB'];
  for (const type of Object.values(declared.types)) {
    if (typeof type.address === 'string') type.address = { sv_SE: type.address, en_GB: type.address.replace(/^\/(?=[a-z]+\/)/, '/en-') };
  }
  const several = cmsConfig(siteDescription(declared), place);
  const fields = several.collections.find((one) => one.name === 'articles').fields;
  const groups = fields.filter((one) => ['search', 'sharing', 'structured'].includes(one.name));
  assert.deepEqual(groups.map((one) => one.name), ['search', 'sharing', 'structured']);
  for (const group of groups) {
    assert.equal(group.i18n, true);
    for (const one of group.fields) assert.equal(one.i18n, true);
  }
});

describe('the image library', () => {
  const describedWith = (elements) => siteDescription({
    language: 'en_GB',
    images: { smallestWidth: 400, displayWidth: 1280 },
    types: { page: { label: 'Page', plural: 'Pages', collection: 'pages', address: '/{slug}/', elements } },
  });
  const place = { forgejo: 'http://git', repository: 'a/b', clientId: 'c', site: 'http://site' };
  const libraryOf = (elements) => cmsConfig(describedWith(elements), place).collections.find(({ name }) => name === 'image-library');

  test('is a collection of its own, in a folder of its own, each entry an image with its texts', () => {
    const library = libraryOf(['paragraph', 'image']);
    assert.equal(library.folder, 'image-library');
    assert.equal(library.format, 'json');
    assert.equal(library.create, true);
    assert.equal(library.i18n, undefined, 'in one language, since what a post holds of it is the post\'s');
    assert.deepEqual(library.fields.map(({ name, widget, required }) => [name, widget, required]), [['src', 'konzilo-image', true], ['alt', 'string', true], ['caption', 'string', false]]);
    assert.equal(library.fields[0].upload, true, 'its own file is uploaded, not chosen');
    assert.equal(library.thumbnail, 'src');
  });

  test('is there on every site, since every image field chooses from it, the logo\'s too', () => {
    assert.equal(libraryOf(['paragraph']).folder, 'image-library');
    const settings = cmsConfig(describedWith(['paragraph']), place).collections.find(({ name }) => name === 'settings').files[0].fields;
    assert.deepEqual(settings.filter(({ name }) => ['logo', 'icon'].includes(name)).map(({ widget, alt }) => [widget, alt]), [['konzilo-image', true], ['konzilo-image', false]]);
  });

  test('tells a body how narrow an upload may be', () => {
    const [page] = cmsConfig(describedWith(['paragraph', 'image']), place).collections;
    assert.equal(page.fields.find(({ name }) => name === 'body').smallestWidth, 400);
  });

  test('is no name a type may take', () => {
    assert.throws(() => siteDescription({
      language: 'en_GB',
      types: { picture: { label: 'Picture', plural: 'Pictures', collection: 'image-library', address: '/{slug}/', elements: ['paragraph'] } },
    }), /image-library is the collection of the image library/);
  });
});
