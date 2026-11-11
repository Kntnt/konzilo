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
// A field of a form, where it stands alone or in one of the form's field groups (ADR 0071).
const field = (fields, name) => fields.find((one) => one.name === name) ?? fields.filter((one) => one.name.startsWith('group-')).flatMap((one) => one.fields).find((one) => one.name === name);

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
  for (const name of ['articles', 'pages', 'canvases', 'authors', 'categories', 'topics']) {
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
  const category = field(collection('articles').fields, 'category');
  assert.equal(category.widget, 'relation');
  assert.equal(category.collection, 'categories');
  assert.equal(category.value_field, '{{slug}}');
  assert.equal(category.multiple, false, 'an article has one category or none');
  assert.equal(category.required, false);
  assert.equal(field(collection('articles').fields, 'topics').collection, 'topics');
  assert.equal(field(collection('articles').fields, 'topics').multiple, true);
  assert.equal(field(collection('pages').fields, 'parent').collection, 'pages');
  assert.equal(field(collection('articles').fields, 'parent'), undefined);
  assert.equal(field(collection('categories').fields, 'parent').collection, 'categories');
  assert.equal(field(collection('topics').fields, 'parent'), undefined);
});

// A relation keeps no order an editor could set, and an article's first author is its main one
// (ADR 0062), so the authors are chosen in a field of the core's own, which reads and adds to
// the authors' files where the source keeps them.
test('chooses an article\'s authors in the core\'s own field, by the folder of their files', () => {
  assert.deepEqual(field(collection('articles').fields, 'authors'), { name: 'authors', label: 'Authors', widget: 'konzilo-authors', folder: 'authors', required: false });
  const { language: _one, ...declared } = JSON.parse(readFileSync(file('site-template/files/site-description.json'), 'utf8'));
  declared.languages = ['sv_SE', 'en_GB'];
  const several = cmsConfig(siteDescription(declared), place);
  const authors = field(several.collections.find((one) => one.name === 'articles').fields, 'authors');
  assert.equal(authors.folder, 'authors/sv-SE', 'where an author\'s file in the main language is, which every author has');
  assert.equal(authors.i18n, 'duplicate', 'and the same in every language');
});

test('gives the built-in types and taxonomies the core\'s labels in the interface language, and an author a biography', () => {
  const labels = (made) => Object.fromEntries(made.collections.filter((one) => one.label_singular).map((one) => [one.name, [one.label_singular, one.label]]));
  assert.deepEqual(labels(config), {
    articles: ['Article', 'Articles'],
    pages: ['Page', 'Pages'],
    canvases: ['Canvas', 'Canvases'],
    authors: ['Author', 'Authors'],
    categories: ['Category', 'Categories'],
    topics: ['Topic', 'Topics'],
    'image-library': ['Image', 'Image library'],
  });
  const swedish = cmsConfig(description, { ...place, language: 'sv' });
  assert.deepEqual(Object.values(labels(swedish)).slice(0, 6), [['Artikel', 'Artiklar'], ['Sida', 'Sidor'], ['Tom sida', 'Tomma sidor'], ['Författare', 'Författare'], ['Kategori', 'Kategorier'], ['Ämne', 'Ämnen']]);
  assert.equal(field(collection('articles').fields, 'authors').label, 'Authors');
  assert.equal(field(swedish.collections.find((one) => one.name === 'articles').fields, 'category').label, 'Kategori');
  assert.equal(field(collection('authors').fields, 'description').label, 'Biography');
  assert.equal(field(swedish.collections.find((one) => one.name === 'authors').fields, 'description').label, 'Biografi');
  assert.equal(field(collection('categories').fields, 'description').label, 'Description');
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

test('gives a field only a plain value as its default, which is all Sveltia takes, and a field group its fields\' defaults', () => {
  const plainValue = (value) => ['string', 'number', 'boolean'].includes(typeof value);
  const walk = (fields) => {
    for (const one of fields) {
      if ('default' in one && one.widget === 'konzilo-group') assert.deepEqual(one.default, Object.fromEntries(one.fields.filter((member) => 'default' in member).map((member) => [member.name, member.default])), one.name);
      else if ('default' in one) assert.ok(plainValue(one.default), one.name);
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
  const title = (made) => field(made.collections.find((one) => one.name === 'pages').fields, 'title').label;

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
    given.types.article.fields = { size: { label: { en: 'Size', sv: 'Storlek' }, type: 'string', control: 'text' } };
    given.taxonomies.category.label = { en: 'Section', sv: 'Avdelning' };
    given.taxonomies.category.plural = { en: 'Sections', sv: 'Avdelningar' };
    given.taxonomies.topics.plural = 'Tags';
    given.menus.main.label = { en: 'Main menu', sv: 'Huvudmeny' };
    given.settings.footerText.label = { en: 'Footer text', sv: 'Sidfotstext' };
    given.components = { card: { label: { en: 'Card', sv: 'Kort' }, form: 'container', body: 'blocks', attributes: { tone: { type: 'string', label: { en: 'Tone', sv: 'Ton' } } } } };
    const site = siteDescription(given);
    for (const [language, words] of [
      ['sv', { articles: 'Artiklar', article: 'Artikel', size: 'Storlek', section: 'Avdelning', sections: 'Avdelningar', pages: 'Sidor', menu: 'Huvudmeny', footer: 'Sidfotstext', card: 'Kort', tone: 'Ton' }],
      ['en', { articles: 'Articles', article: 'Article', size: 'Size', section: 'Section', sections: 'Sections', pages: 'Pages', menu: 'Main menu', footer: 'Footer text', card: 'Card', tone: 'Tone' }],
    ]) {
      const made = cmsConfig(site, { ...place, language });
      const one = (name) => made.collections.find((each) => each.name === name);
      assert.equal(one('articles').label, words.articles, language);
      assert.equal(one('articles').label_singular, words.article, language);
      assert.equal(field(one('articles').fields, 'size').label, words.size, language);
      assert.equal(field(one('articles').fields, 'category').label, words.section, language);
      assert.equal(one('categories').label, words.sections, language);
      assert.equal(one('pages').label, words.pages, language, 'the core\'s, where the site gives none');
      assert.equal(one('menus').files[0].label, words.menu, language);
      assert.equal(field(one('settings').files[0].fields, 'footerText').label, words.footer, language);
      assert.equal(made.konzilo.components.card.label, words.card, language);
      assert.equal(made.konzilo.components.card.attributes.tone.label, words.tone, language);
      // One text is the same in every language.
      assert.equal(one('topics').label, 'Tags', language);
    }
  });

  test('keeps the defaults that visitors read in the content\'s language, whatever the interface language', () => {
    const consentOf = (made) => field(made.collections.find((one) => one.name === 'settings').files[0].fields, 'consent').fields;
    for (const language of ['sv', 'en']) {
      const one = consentOf(cmsConfig(siteDescription({ ...declared(), language: 'sv_SE', interfaceLanguage: 'en' }), { ...place, language }));
      assert.equal(field(one, 'bannerTitle').default, 'Din integritet', language);
      assert.equal(field(one, 'placeholderQuestion').default, 'Vill du låta {service} spela upp det här innehållet?', language);
      const { language: _, ...inOne } = declared();
      const several = consentOf(cmsConfig(siteDescription({ ...inOne, languages: ['sv_SE', 'en_GB'] }), { ...place, language }));
      assert.deepEqual(field(several, 'bannerTitle').fields.map((each) => [each.name, each.default]), [['sv_SE', 'Din integritet'], ['en_GB', 'Your privacy']], language);
    }
    const english = consentOf(cmsConfig(siteDescription({ ...declared(), language: 'en_GB', interfaceLanguage: 'sv' }), place));
    assert.equal(field(english, 'bannerTitle').default, 'Your privacy');
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

  test('shows the half-life of related posts among the settings groups in the interface language, with its default, and the switch for freshness', () => {
    const related = (language) => {
      const made = cmsConfig(swedish, { ...place, language });
      const group = field(made.collections.find((one) => one.name === 'settings').files[0].fields, 'related');
      const setting = (name) => {
        const { label, widget, default: given } = field(group.fields, name);
        return { label, widget, default: given };
      };
      return { heading: group.label, freshness: setting('freshness'), halfLife: setting('halfLife') };
    };
    assert.deepEqual(related('sv'), {
      heading: 'Relaterade inlägg',
      freshness: { label: 'Färskhet', widget: 'boolean', default: true },
      halfLife: { label: 'Halveringstid i dagar', widget: 'number', default: 90 },
    });
    assert.deepEqual(related('en'), {
      heading: 'Related posts',
      freshness: { label: 'Freshness', widget: 'boolean', default: true },
      halfLife: { label: 'Half-life in days', widget: 'number', default: 90 },
    });
  });

  test('shows every settings text of the catalogues in the settings groups, and in Swedish nothing beside them but the site\'s own', () => {
    const given = declared();
    given.forms = { contact: { label: 'Contact', fields: [{ name: 'email', label: 'Email', kind: 'email', required: true }] } };
    const site = siteDescription(given);
    const catalogue = (language) => JSON.parse(readFileSync(file(`src/catalogues/${language}.json`), 'utf8'));
    // A form's recipients and the days its submissions are kept stay out of the published files,
    // and so out of the form.
    const unshown = ['settings.forms.recipients.label', 'settings.forms.retention.label'];
    const groupsIn = (language) => {
      const fields = cmsConfig(site, { ...place, language }).collections.find((one) => one.name === 'settings').files[0].fields;
      return fields.filter((one) => site.groups.some((group) => group.name === one.name));
    };
    const shown = (fields, texts = new Set()) => {
      for (const one of fields) {
        texts.add(one.label);
        if (one.hint) texts.add(one.hint);
        for (const option of one.options ?? []) texts.add(option.label);
        if (one.fields) shown(one.fields, texts);
      }
      return texts;
    };
    for (const language of ['en', 'sv']) {
      const texts = shown(groupsIn(language));
      const settings = Object.entries(catalogue(language)).filter(([name]) => name.startsWith('settings.') && !unshown.includes(name));
      assert.deepEqual(settings.filter(([, one]) => !texts.has(one)), [], `${language}: settings texts the form does not show`);
    }
    const swedish = new Set(Object.values(catalogue('sv')));
    const own = new Set([...Object.values(site.types).map((type) => type.plural), ...Object.values(site.forms).map((form) => form.label)]);
    assert.deepEqual([...shown(groupsIn('sv'))].filter((one) => !swedish.has(one) && !own.has(one)), [], 'texts in neither the Swedish catalogue nor the site description');
  });

  test('labels a select\'s options in the interface language and keeps their values, and keeps each default visitors read in the content\'s language', () => {
    for (const [language, labels] of [['sv', ['Sammanfattningen', 'Hela texten']], ['en', ['The summary', 'The whole text']]]) {
      const groups = cmsConfig(description, { ...place, language }).collections.find((one) => one.name === 'settings').files[0].fields;
      const item = field(field(groups, 'feeds').fields, 'item');
      assert.deepEqual(item.options, [{ value: 'The summary', label: labels[0] }, { value: 'The whole text', label: labels[1] }], language);
      assert.equal(item.default, 'The summary', language);
      assert.equal(field(field(groups, 'consent').fields, 'bannerTitle').default, 'Your privacy', language);
    }
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
  const categories = JSON.parse(/\ncategory: (\[.*\])\n/.exec(article)[1]);
  assert.equal(categories.length, 1);
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

test('makes nothing from inside another\'s form, but for a post\'s category and topics', () => {
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
  assert.deepEqual([...new Set(allowed)].sort(), ['category', 'topics']);
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

describe('the canonical address', () => {
  const declared = () => JSON.parse(readFileSync(file('site-template/files/site-description.json'), 'utf8'));
  const canonicalOf = (made, name) => field(field(made.collections.find((one) => one.name === name).fields, 'search').fields, 'canonical');

  test('is a field of search, after the description, which shows the post\'s own address from its type\'s address and its slug while it is empty', () => {
    assert.deepEqual(field(collection('articles').fields, 'search').fields.map((one) => one.name), ['title', 'description', 'canonical', 'noindex', 'nofollow']);
    const canonical = canonicalOf(config, 'articles');
    assert.equal(canonical.label, 'Canonical address');
    assert.equal(canonical.required, false);
    assert.equal(canonical.widget, 'konzilo-text');
    assert.equal(canonical.fallback, 'ownAddress');
    assert.equal(canonical.address, '/{slug}/');
    assert.equal(canonicalOf(config, 'pages').address, '/pages/{slug}/');
    assert.equal(canonical.placeholder, 'The post\'s own address');
    assert.match(canonical.hint, /published elsewhere first/);
  });

  test('takes a whole http:// or https:// address alone, and says so', () => {
    const [source, words] = canonicalOf(config, 'articles').pattern;
    const pattern = new RegExp(source);
    for (const address of ['https://elsewhere.example.org/the-original/', 'http://elsewhere.example.org', 'https://elsewhere.example.org:8443/a?b=c#d']) assert.ok(pattern.test(address), address);
    for (const address of ['the-original/', '/the-original/', '//elsewhere.example.org/', 'ftp://elsewhere.example.org/', 'https://', 'https://elsewhere.example.org/the original/', 'https://keeper@elsewhere.example.org/']) assert.ok(!pattern.test(address), address);
    assert.equal(words, 'Write a whole web address, starting with https:// or http://, such as https://www.example.com/the-original/.');
  });

  test('on a site in several languages shows the address in the language of the pane, after its prefix', () => {
    const given = declared();
    delete given.language;
    given.languages = ['sv_SE', 'en_GB'];
    given.types.page.address = { sv_SE: '/sidor/{path}/', en_GB: '/pages/{path}/' };
    const made = cmsConfig(siteDescription(given), place);
    assert.deepEqual(canonicalOf(made, 'articles').address, { 'sv-SE': '/sv/{slug}/', 'en-GB': '/en/{slug}/' });
    assert.deepEqual(canonicalOf(made, 'pages').address, { 'sv-SE': '/sv/sidor/{slug}/', 'en-GB': '/en/pages/{slug}/' });
  });

  test('is in the interface language', () => {
    const swedish = cmsConfig(siteDescription({ ...declared(), language: 'sv_SE' }), place);
    const canonical = canonicalOf(swedish, 'articles');
    assert.equal(canonical.label, 'Kanonisk adress');
    assert.equal(canonical.placeholder, 'Inläggets egen adress');
    assert.equal(canonical.pattern[1], 'Skriv en hel webbadress som börjar med https:// eller http://, till exempel https://www.example.com/originalet/.');
  });
});

test('says where the live preview is, and which collections have pages to show there', () => {
  const given = cmsConfig(description, { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2', preview: 'http://localhost:3' });
  const withPages = Object.values(description.types).filter((type) => type.address).map((type) => type.collection);
  const { groups: _groups, ...konzilo } = given.konzilo;
  assert.deepEqual(konzilo, { language: 'en', preview: { origin: 'http://localhost:3', collections: withPages } });
  assert.ok(withPages.length > 0);
  const { groups: _none, ...without } = cmsConfig(description, { forgejo: 'http://localhost:1', repository: 'a/b', clientId: 'c', site: 'http://localhost:2' }).konzilo;
  assert.deepEqual(without, { language: 'en' });
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

// A post's form in field groups: each one section with one menu over every field it covers. A
// group of several fields is one field of Sveltia's, of the core's own type or an object, which
// the editor reads from and writes to a source file whose fields stay flat (ADR 0071).
describe('the form\'s field groups', () => {
  const shape = (name, made = config) => made.collections.find((one) => one.name === name).fields.map((one) => (one.name.startsWith('group-') ? [one.name, one.fields.map((member) => member.name)] : one.name));

  test('give the article its form in story 23\'s order, with no publishing row', () => {
    assert.deepEqual(shape('articles'), [
      ['group-name', ['title', 'breadcrumb', 'slug']],
      ['group-status', ['status', 'date']],
      'image',
      ['group-terms', ['authors', 'category', 'topics']],
      ['group-headline', ['eyebrow', 'headline', 'subheadline']],
      'standfirst',
      'body',
      'teaser',
      'search',
      'sharing',
      'structured',
      'otherAddresses',
    ]);
  });

  test('keep a page\'s and a canvas\'s publishing row, after their status', () => {
    assert.deepEqual(shape('pages'), [['group-name', ['title', 'breadcrumb', 'slug']], ['group-status', ['status']], 'publishing', 'parent', 'body', 'search', 'sharing', 'structured', 'otherAddresses']);
    assert.deepEqual(shape('canvases'), [['group-name', ['title', 'slug']], ['group-status', ['status']], 'publishing', 'body', 'search', 'sharing', 'structured', 'otherAddresses']);
  });

  test('draw a group of the core\'s fields in the core\'s own field, and the terms, which only Sveltia draws, in an object', () => {
    const fields = collection('articles').fields;
    for (const name of ['group-name', 'group-status', 'group-headline']) {
      assert.equal(field(fields, name).widget, 'konzilo-group', name);
      assert.equal(field(fields, name).required, false, name);
    }
    const terms = field(fields, 'group-terms');
    assert.equal(terms.widget, 'object');
    assert.equal(terms.required, true, 'its fields show, with no box to tick');
    assert.equal(terms.collapsed, false);
    // Each has a name for the section, which a heading shows only where the group asks for one.
    for (const name of ['group-name', 'group-status', 'group-terms', 'group-headline']) assert.equal(typeof field(fields, name).label, 'string', name);
    assert.equal(field(fields, 'group-headline').label, 'Headline');
    assert.equal(field(cmsConfig(description, { ...place, language: 'sv' }).collections[0].fields, 'group-headline').label, 'Rubrik');
  });

  test('give the slug its default from the name in breadcrumbs, and leave the required working name and main headline without one', () => {
    const fields = collection('articles').fields;
    assert.equal(field(fields, 'slug').computed, 'slug');
    assert.equal(field(fields, 'title').label, 'Working name');
    for (const name of ['title', 'headline']) {
      assert.equal(field(fields, name).required, true, name);
      assert.equal(field(fields, name).default, undefined, name);
    }
    assert.equal(field(fields, 'status').default, 'draft');
    assert.deepEqual(field(fields, 'group-status').default, { status: 'draft' }, 'a new post is a draft');
  });

  test('tell the editor which fields each group holds, so that a source file keeps them flat', () => {
    assert.deepEqual(config.konzilo.groups, {
      'group-name': ['title', 'breadcrumb', 'slug'],
      'group-status': ['status', 'date'],
      'group-terms': ['authors', 'category', 'topics'],
      'group-headline': ['eyebrow', 'headline', 'subheadline'],
    });
  });

  test('keep each field\'s language on a site in several: a group of fields alike in each is alike, and one with a text per language is per language', () => {
    const { language: _one, ...declared } = JSON.parse(readFileSync(file('site-template/files/site-description.json'), 'utf8'));
    declared.languages = ['sv_SE', 'en_GB'];
    for (const type of Object.values(declared.types)) {
      if (typeof type.address === 'string') type.address = { sv_SE: type.address, en_GB: type.address.replace(/^\/(?=[a-z]+\/)/, '/en-') };
    }
    const { fields } = cmsConfig(siteDescription(declared), place).collections[0];
    // Sveltia keeps a field's language as a whole, so the slug, alike in each, is a group apart.
    assert.deepEqual(fields.slice(0, 3).map((one) => one.name), ['group-name', 'group-slug', 'group-status']);
    assert.equal(field(fields, 'group-name').i18n, true);
    assert.deepEqual(field(fields, 'group-name').fields.map((one) => [one.name, one.i18n]), [['title', true], ['breadcrumb', true]]);
    assert.equal(field(fields, 'group-slug').i18n, 'duplicate');
    assert.equal(field(fields, 'group-status').i18n, 'duplicate');
    assert.equal(field(fields, 'group-terms').i18n, 'duplicate');
    assert.equal(field(fields, 'group-headline').i18n, true);
  });

  test('group the core\'s fields of a site\'s own type as the built-in types group them, so that a field is in the same group in every form', () => {
    const made = cmsConfig(siteDescription({
      language: 'en_GB',
      images: { smallestWidth: 400, displayWidth: 1280 },
      types: {
        article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] },
        story: { label: 'Story', plural: 'Stories', collection: 'stories', address: '/stories/{slug}/', elements: ['paragraph'], fields: { date: {}, mood: { label: 'Mood', type: 'string', control: 'text' }, headline: { required: true }, topics: { taxonomy: 'topics' } } },
      },
    }), place);
    assert.deepEqual(shape('stories', made), [['group-name', ['title', 'slug']], ['group-status', ['status', 'date']], 'publishing', 'body', 'mood', ['group-headline', ['headline']], ['group-terms', ['topics']], 'otherAddresses']);
    assert.deepEqual(made.konzilo.groups['group-status'], ['status', 'date']);
  });
});
