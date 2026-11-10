// The site template's own design (site-template/files/), built by Astro as a
// new site repository has it, from content files the intake's command
// writes: its header shows the site's logo, linking to the start page, with
// the logo's alt text, or the site's title where there is no logo, and each
// page's <title> takes the title, among Konzilo's search and
// sharing tags in its head, with the links to the site's icons;
// its footer shows the publisher's details after the footer text, or none of
// them without a publisher's name. Its 404 page, 404.html, shows
// the page an Admin chose in the site's frame, or the core's plain text in
// the site's language. An article shows its categories,
// each after its parents, and its tags. On a site in several
// languages its frame shows the menu, the settings and the title of the
// page's language.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { astroEnvironment } from './lib/astro.js';
import { paragraphs, post, term, writeContent } from './lib/content.js';
import { drawing, plainImage, sharp, shortHash } from './lib/images.js';

const template = fileURLToPath(new URL('../site-template/files/', import.meta.url));
const core = fileURLToPath(new URL('../', import.meta.url));
const astro = join(core, 'node_modules/astro/bin/astro.mjs');

// The demo model's posts, as a build hands them out: an article
// in a category below another, with two tags, and a page.
const posts = [
  post({
    ID: 1,
    slug: 'harbour-lights',
    title: 'Harbour lights',
    modified: '2026-10-02 09:00:00',
    body: paragraphs('The lantern keeps the harbour.'),
    terms: {
      category: [term('local', 'Local news', { taxonomy: 'category', parent: 'news' })],
      tag: [term('lanterns', 'Lanterns', { taxonomy: 'tag' }), term('harbours', 'Harbours', { taxonomy: 'tag' })],
    },
    term_parents: { category: [term('news', 'News', { taxonomy: 'category', description: 'What happened.' })] },
  }),
  post({ ID: 2, type: 'page', slug: 'about', title: 'About', modified: '2026-10-02 09:00:00', body: paragraphs('About us.') }),
];

// A site repository as `new-site` makes one from the template, its node
// modules the core's, with the core itself as the Konzilo package.
function siteRepository() {
  const repository = mkdtempSync(join(tmpdir(), 'konzilo-template-'));
  for (const file of ['astro.config.mjs', 'site-description.json']) cpSync(join(template, file), join(repository, file));
  cpSync(join(template, 'src'), join(repository, 'src'), { recursive: true });
  for (const file of readdirSync(join(repository, 'src'), { recursive: true })) {
    const path = join(repository, 'src', file);
    if (path.endsWith('.astro') || path.endsWith('.mjs')) writeFileSync(path, readFileSync(path, 'utf8').replaceAll('@NAME@', 'lantern'));
  }
  const modules = join(repository, 'node_modules');
  mkdirSync(join(modules, '@kntnt'), { recursive: true });
  for (const name of readdirSync(join(core, 'node_modules'))) symlinkSync(join(core, 'node_modules', name), join(modules, name));
  symlinkSync(core, join(modules, '@kntnt/konzilo'));
  mkdirSync(join(repository, 'content'));
  return repository;
}

// Export the posts with the site settings, as a build does, then build: the
// built page at a path, null for a file the build did not write, and
// `warnings`, none.
function build(repository, identity, { given = posts, settings: own = {}, menu = [] } = {}) {
  const file = join(repository, 'site-settings.json');
  writeFileSync(file, JSON.stringify({ menus: { main: menu }, settings: { footerText: 'Open every day.', ...own }, redirects: [], identity }));
  const exported = writeContent(repository, given);
  assert.equal(exported.status, 0, exported.stderr);
  const built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
  assert.equal(built.status, 0, built.stderr + built.stdout);
  const page = (path) => (existsSync(join(repository, 'dist', path)) ? readFileSync(join(repository, 'dist', path), 'utf8') : null);
  return page;
}

const header = (html) => /<header>(.*?)<\/header>/s.exec(html)?.[1];
const main = (html) => /<(?:main|article) class="body-text"[^>]*>(.*?)<\/(?:main|article)>/s.exec(html)?.[1];
const footer = (html) => /<footer>(.*?)<\/footer>/s.exec(html)?.[1];
const head = (html) => /<head>(.*?)<\/head>/s.exec(html)?.[1];
const title = (html) => /<title>(.*?)<\/title>/s.exec(html)?.[1];

// The publisher's details in a footer, each line as a visitor reads it.
const details = (html) => /<address\b[^>]*>(.*?)<\/address>/s.exec(html)?.[1].match(/<p\b[^>]*>.*?<\/p>/gs).map((line) => line.replace(/<[^>]+>/g, '').trim());

describe('the site template, built by Astro', () => {
  let repository;
  let logo;

  before(() => {
    repository = siteRepository();
    logo = join(repository, 'lantern.svg');
    writeFileSync(logo, drawing({ width: 240, height: 60 }));
  });

  after(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  test('shows the logo in the header, linking to the start page, with its alt text, and the title in each page\'s <title>', () => {
    const page = build(repository, { title: 'Lantern &amp; Co', logo: { id: 12, original: logo, alt: 'A lantern by the harbour' }, icon: null });

    const link = /<a [^>]*href="\/"[^>]*>(.*?)<\/a>/s.exec(header(page('index.html')))?.[1];
    assert.match(link, new RegExp(`^<img src="/_astro/logo-${shortHash(drawing({ width: 240, height: 60 }))}\\.[^"]+\\.svg" alt="A lantern by the harbour"[^>]* width="240" height="60"[^>]*>$`));
    assert.equal(title(page('index.html')), 'Lantern &amp; Co');
    assert.equal(title(page('harbour-lights/index.html')), 'Harbour lights – Lantern &amp; Co');
    assert.equal(title(page('pages/about/index.html')), 'About – Lantern &amp; Co');
  });

  test('takes the title as the logo\'s alt text where the logo has none, and shows the title in the header where there is no logo', () => {
    const plain = build(repository, { title: 'Lantern', logo: { id: 12, original: logo, alt: '' }, icon: null });
    assert.match(header(plain('index.html')), /<img [^>]*alt="Lantern"/);

    const without = build(repository, { title: 'Lantern', logo: null, icon: null });
    assert.match(header(without('index.html')), /<a [^>]*href="\/"[^>]*>Lantern<\/a>/);
    assert.doesNotMatch(header(without('index.html')), /<img/);
  });

  // The site's name is its title alone: the template keeps no name of
  // its own, such as the one `new-site` gave its repository.
  test('shows no name of its own while the site has no title, and an empty link to the start page nowhere', () => {
    const untitled = build(repository, { title: '', logo: null, icon: null });
    assert.doesNotMatch(untitled('index.html'), /lantern|@NAME@/i);
    assert.doesNotMatch(header(untitled('index.html')), /<a [^>]*href="\/"[^>]*>\s*<\/a>/);

    const logoAlone = build(repository, { title: '', logo: { id: 12, original: logo, alt: '' }, icon: null });
    assert.doesNotMatch(header(logoAlone('index.html')), /lantern|@NAME@/i);
    assert.match(header(logoAlone('index.html')), /<a [^>]*href="\/"[^>]*><img [^>]*\balt(?:="")?[ >]/);
  });

  test('shows the cookie declaration after the body of the post chosen as the cookie policy, a page or an article, and of no other', () => {
    const identity = { title: 'Lantern', logo: null, icon: null };
    const page = build(repository, identity, { settings: { legalPages: { cookiePolicy: '2' } } });
    assert.match(main(page('pages/about/index.html')), /<p>About us\.<\/p>\s*<div class="konzilo-declaration"/);
    assert.doesNotMatch(page('harbour-lights/index.html'), /konzilo-declaration"/);

    const article = build(repository, identity, { settings: { legalPages: { cookiePolicy: '1' } } });
    assert.match(main(article('harbour-lights/index.html')), /<p>The lantern keeps the harbour\.<\/p>\s*<div class="konzilo-declaration"/);
    assert.doesNotMatch(article('pages/about/index.html'), /konzilo-declaration"/);
  });

  // The frame's styles are no body styles: every page has them.
  test('loads the frame\'s styles on every page, the start page\'s list among what they reach', () => {
    const page = build(repository, { title: 'Lantern', logo: null, icon: null });
    const styles = (html) => [
      ...[...html.matchAll(/<link [^>]*rel="stylesheet"[^>]*href="\/([^"]+)"/g)].map(([, file]) => page(file)),
      ...[...html.matchAll(/<style[^>]*>(.*?)<\/style>/gs)].map(([, css]) => css),
    ].join('');
    for (const path of ['index.html', 'harbour-lights/index.html', 'pages/about/index.html', '404.html']) {
      assert.match(styles(page(path)), /\.site-name\{/, path);
    }
    assert.match(page('index.html'), /<main[^>]*>\s*<ul class="post-list"/);
  });

  test('shows an article\'s categories, each after its parents, and its tags, outside its body text\'s own lists', () => {
    const page = build(repository, { title: 'Lantern', logo: null, icon: null })('harbour-lights/index.html');
    const list = (name) => [...page.matchAll(new RegExp(`<ul class="${name}"[^>]*>(.*?)</ul>`, 'gs'))]
      .flatMap(([, items]) => [...items.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map(([, item]) => item));
    assert.deepEqual(list('categories'), ['News › Local news']);
    assert.deepEqual(list('tags'), ['Harbours', 'Lanterns']);
    assert.match(page, /<div class="terms"[^>]*>\s*<ul class="categories"/);
  });

  test('puts Konzilo\'s search and sharing tags in each page\'s head, the post\'s for a post\'s page and the start page\'s for the start page', () => {
    const page = build(repository, { title: 'Lantern', logo: null, icon: null });
    const canonical = (html) => /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
    const description = (html) => /<meta name="description" content="([^"]*)"/.exec(html)?.[1];

    assert.equal(canonical(page('index.html')), 'https://www.example.com/');
    assert.equal(canonical(page('harbour-lights/index.html')), 'https://www.example.com/harbour-lights/');
    assert.equal(canonical(page('pages/about/index.html')), 'https://www.example.com/pages/about/');
    assert.equal(description(page('harbour-lights/index.html')), 'The lantern keeps the harbour.');
    assert.match(page('harbour-lights/index.html'), /<meta property="og:type" content="article">/);
    assert.match(page('pages/about/index.html'), /<meta property="og:type" content="website">/);
    assert.equal([...page('harbour-lights/index.html').matchAll(/<title>/g)].length, 1);
  });

  test('links the icons made from the site icon in each page\'s head, through Konzilo\'s Head', () => {
    const icon = join(repository, 'icon.svg');
    writeFileSync(icon, drawing({ width: 100, height: 100 }));
    const page = build(repository, { title: 'Lantern', logo: null, icon: { id: 13, original: icon } });

    for (const path of ['index.html', 'harbour-lights/index.html', 'pages/about/index.html']) {
      const links = [...head(page(path)).matchAll(/<link [^>]*rel="(?:icon|apple-touch-icon|manifest)"[^>]*>/g)].map(([link]) => /href="([^"]+)"/.exec(link)[1]);
      assert.deepEqual(links, ['/favicon.ico', '/icon.svg', '/apple-touch-icon.png', '/site.webmanifest'], path);
    }
    assert.equal(JSON.parse(page('site.webmanifest')).name, 'Lantern');
  });

  test('gives the manifest and each page\'s theme-color the starter styles\' link colour and page background, the tokens it names primary and base', () => {
    const icon = join(repository, 'icon.svg');
    writeFileSync(icon, drawing({ width: 100, height: 100 }));
    const page = build(repository, { title: 'Lantern', logo: null, icon: { id: 13, original: icon } });

    const manifest = JSON.parse(page('site.webmanifest'));
    assert.deepEqual([manifest.theme_color, manifest.background_color], ['#0b57d0', '#ffffff']);
    for (const path of ['index.html', 'harbour-lights/index.html', 'pages/about/index.html']) {
      assert.deepEqual([...head(page(path)).matchAll(/<meta name="theme-color" content="([^"]*)">/g)].map(([, colour]) => colour), ['#0b57d0'], path);
    }
  });

  // What e-handelslagen asks a site that offers services to show,
  // from the publisher of the search and sharing settings.
  test('shows the publisher\'s name, organisation number, postal address, email, VAT number, trade register and supervisory authority in every page\'s footer, after the footer text', () => {
    const publisher = {
      name: 'Lantern Bay AB', organisationNumber: '556677-8899', vatNumber: 'SE556677889901', tradeRegister: 'Bolagsverket',
      supervisoryAuthority: 'Finansinspektionen\nBox 7821\n103 97 Stockholm', street: 'Harbour Road 1', postalCode: '123 45', locality: 'Lantern Bay', country: 'Sweden',
      email: 'hello@example.com', telephone: '+46 8 123 456',
    };
    const page = build(repository, { title: 'Lantern', logo: null, icon: null }, { settings: { search: { publisher } } });
    for (const path of ['index.html', 'harbour-lights/index.html', 'pages/about/index.html']) {
      const shown = footer(page(path));
      assert.deepEqual(details(shown), [
        'Lantern Bay AB',
        'Organisation number 556677-8899',
        'Harbour Road 1, 123 45 Lantern Bay, Sweden',
        'hello@example.com',
        'VAT number SE556677889901',
        'Trade register Bolagsverket',
        'Supervisory authority Finansinspektionen, Box 7821, 103 97 Stockholm',
      ], path);
      assert.match(shown, /<a href="mailto:hello@example\.com">hello@example\.com<\/a>/);
      assert.ok(shown.indexOf('Open every day.') < shown.indexOf('<address'), 'the details come after the footer text');
    }

    // The name is the site's title by default; a detail left empty is not shown.
    const titled = build(repository, { title: 'Lantern', logo: null, icon: null }, { settings: { search: { publisher: { locality: 'Lantern Bay' } } } });
    assert.deepEqual(details(footer(titled('index.html'))), ['Lantern', 'Lantern Bay']);
  });

  test('shows none of the publisher\'s details without a publisher\'s name', () => {
    const page = build(repository, { title: null, logo: null, icon: null }, { settings: { search: { publisher: { organisationNumber: '556677-8899', email: 'hello@example.com' } } } });

    assert.doesNotMatch(footer(page('index.html')), /<address|556677-8899|hello@example\.com/);
  });

  test('builds the chosen 404 page as 404.html, its title and body in the site\'s frame with its menu, and gives it no page of its own', () => {
    const notFound = post({
      ID: 3,
      type: 'page',
      slug: 'not-found',
      title: 'Not found',
      modified: '2026-10-02 09:00:00',
      body: '## Nothing here\n\n- Try the menu',
    });
    const menu = [{ ID: 11, type: 'custom', url: '/pages/about/', title: 'About us', menu_item_parent: '0', menu_order: '1' }];
    const page = build(repository, { title: 'Lantern', logo: null, icon: null }, { given: [...posts, notFound], settings: { notFound: { page: '3' } }, menu });

    const html = page('404.html');
    assert.equal(title(html), 'Not found – Lantern');
    assert.match(html, /<h1>Not found<\/h1>/);
    assert.match(html, /<h2[^>]*>Nothing here<\/h2>/);
    assert.match(html, /<li>Try the menu<\/li>/);
    assert.match(header(html), /<nav aria-label="Main menu"[^>]*>.*<a href="\/pages\/about\/">About us<\/a>/s);
    assert.equal(page('pages/not-found/index.html'), null);
    // Nor is it in the sitemap, which lists the types' collections.
    assert.match(page('sitemap.xml'), /\/pages\/about\//);
    assert.doesNotMatch(page('sitemap.xml'), /not-found/);
  });

  // Its file lies at the content folder's root, not in a collection's
  // folder, so its images' addresses climb no folder.
  test('builds the core\'s plain text as 404.html where no page is chosen, in the site\'s language, whatever language its editors work in', () => {
    const english = build(repository, { title: 'Lantern', logo: null, icon: null })('404.html');
    assert.equal(title(english), 'Page not found – Lantern');
    assert.match(english, /<html lang="en-GB">/);
    assert.match(english, /<p>There is no page at this address\./);

    const description = join(repository, 'site-description.json');
    const declared = readFileSync(description, 'utf8');
    try {
      writeFileSync(description, JSON.stringify({ ...JSON.parse(declared), language: 'sv_SE', interfaceLanguage: 'en' }));
      const swedish = build(repository, { title: 'Lantern', logo: null, icon: null })('404.html');
      assert.equal(title(swedish), 'Sidan finns inte – Lantern');
      assert.match(swedish, /<p>Det finns ingen sida på den här adressen\./);
      assert.match(swedish, /<label for="konzilo-search-box-query">Sök<\/label>/, 'search');
      assert.match(swedish, /"name":"Startsida"/, 'the breadcrumbs');
    } finally {
      writeFileSync(description, declared);
    }
  });

  // A page whose post list has pages of its own: Harbour lights
  // and twelve older stories, newest first, five a page, at /pages/news/,
  // /page/2/ and /page/3/.
  test("builds a page's list with pages at its later pages, each with the presentation's pager, from page 2 noindex and canonical to itself", () => {
    const category = { category: [term('local', 'Local news', { taxonomy: 'category' })] };
    const modified = '2026-10-02 09:00:00';
    const articles = Array.from({ length: 12 }, (_, i) => post({
      ID: 10 + i,
      slug: `story-${i + 1}`,
      title: `Story ${i + 1}`,
      date: `2026-09-${String(i + 1).padStart(2, '0')} 08:00:00`,
      modified: modified,
      body: paragraphs('A story.'),
      terms: category,
    }));
    const news = post({
      ID: 30,
      type: 'page',
      slug: 'news',
      title: 'News',
      modified: modified,
      body: '::post-list{type="article" number="5" pages="true" presentation="list"}',
    });
    const page = build(repository, { title: 'Lantern', logo: null, icon: null }, { given: [...posts, ...articles, news] });

    const titles = (path) => [...main(page(path)).matchAll(/<li><a href="\/[^"]+\/">([^<]*)<\/a>/g)].map(([, one]) => one);
    assert.deepEqual(titles('pages/news/index.html'), ['Harbour lights', 'Story 12', 'Story 11', 'Story 10', 'Story 9']);
    assert.deepEqual(titles('pages/news/page/2/index.html'), ['Story 8', 'Story 7', 'Story 6', 'Story 5', 'Story 4']);
    assert.deepEqual(titles('pages/news/page/3/index.html'), ['Story 3', 'Story 2', 'Story 1']);
    assert.equal(page('pages/news/page/4/index.html'), null);

    const pager = /<nav class="konzilo-pager" aria-label="Pages">.*?<\/nav>/s.exec(main(page('pages/news/page/2/index.html')))?.[0];
    assert.match(pager, /<a href="\/pages\/news\/page\/2\/" aria-label="Page 2" aria-current="page">2<\/a>/);
    assert.match(pager, /<a href="\/pages\/news\/" rel="prev">Previous page<\/a>/);
    const canonical = (html) => /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1];
    const robots = (html) => /<meta name="robots" content="([^"]*)"/.exec(html)?.[1];
    assert.equal(canonical(page('pages/news/index.html')), 'https://www.example.com/pages/news/');
    assert.equal(robots(page('pages/news/index.html')), undefined);
    assert.equal(canonical(page('pages/news/page/2/index.html')), 'https://www.example.com/pages/news/page/2/');
    assert.equal(robots(page('pages/news/page/2/index.html')), 'noindex');
    assert.match(page('_redirects'), /^\/pages\/news\/page\/1\/ \/pages\/news\/ 301$/m);
    assert.doesNotMatch(page('sitemap.xml'), /\/page\/\d/);
  });

  // Term pages: with the categories at /category/{slug}/, News
  // has its page, with its description, Harbour lights from its child Local
  // news, and eleven stories of its own, newest first, ten a page; the tags
  // still have none.
  test('builds a page for each category once the categories declare an address, its posts newest first with pages, and none for a tag', () => {
    const description = join(repository, 'site-description.json');
    const declared = readFileSync(description, 'utf8');
    const modified = '2026-10-02 09:00:00';
    const stories = Array.from({ length: 11 }, (_, i) => post({
      ID: 40 + i,
      slug: `story-${i + 1}`,
      title: `Story ${i + 1}`,
      date: `2026-09-${String(i + 1).padStart(2, '0')} 08:00:00`,
      modified: modified,
      body: paragraphs('A story.'),
      terms: { category: [term('news', 'News', { taxonomy: 'category', description: 'What happened.' })] },
    }));
    try {
      const read = JSON.parse(declared);
      writeFileSync(description, JSON.stringify({ ...read, taxonomies: { ...read.taxonomies, category: { ...read.taxonomies.category, address: '/category/{slug}/' } } }));
      const page = build(repository, { title: 'Lantern', logo: null, icon: null }, { given: [...posts, ...stories] });

      const termMain = (html) => /<main class="term-page"[^>]*>(.*?)<\/main>/s.exec(html)?.[1];
      const titles = (path) => [...termMain(page(path)).matchAll(/<li><a href="\/[^"]+\/">([^<]*)<\/a>/g)].map(([, one]) => one);
      assert.match(termMain(page('category/news/index.html')), /<h1>News<\/h1>\s*<p class="term-description">What happened\.<\/p>/);
      assert.deepEqual(titles('category/news/index.html'), ['Harbour lights', ...Array.from({ length: 9 }, (_, i) => `Story ${11 - i}`)]);
      assert.deepEqual(titles('category/news/page/2/index.html'), ['Story 2', 'Story 1']);
      assert.deepEqual(titles('category/local/index.html'), ['Harbour lights']);
      assert.equal(title(page('category/news/index.html')), 'News – Lantern');
      assert.equal(page('tag/lanterns/index.html'), null);
      assert.match(page('sitemap.xml'), /<loc>https:\/\/www\.example\.com\/category\/news\/<\/loc>/);
    } finally {
      writeFileSync(description, declared);
    }
  });
});

describe('the site template\'s form component, placed by a template', () => {
  let repository;
  let page;

  before(() => {
    repository = siteRepository();
    // The demo model declares no form: a contact form, and a page of the
    // site's design that places it.
    const description = join(repository, 'site-description.json');
    const form = { label: 'Contact us', fields: [{ name: 'message', label: 'Message', kind: 'textarea', required: true }] };
    writeFileSync(description, JSON.stringify({ ...JSON.parse(readFileSync(description, 'utf8')), forms: { contact: form } }));
    writeFileSync(join(repository, 'src/pages/contact.astro'), [
      '---',
      "import Site from '../layouts/Site.astro';",
      "import Form from '../components/Form.astro';",
      '---',
      '<Site title="Contact"><main><h1>Contact</h1><Form name="contact" /></main></Site>',
      '',
    ].join('\n'));
    page = build(repository, { title: 'Lantern', logo: null, icon: null })('contact/index.html');
  });

  after(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  test('renders the declared form, posting to its address on the endpoint', () => {
    assert.match(page, /<form class="konzilo-form" id="konzilo-form-contact" method="post" action="\/_konzilo\/forms\/contact" aria-label="Contact us"/);
  });

  test('styles it: an outcome shows when its fragment is the page\'s, the trap field stays out of sight, and what the script has not shown stays hidden', () => {
    const css = [...page.matchAll(/<style[^>]*>(.*?)<\/style>/gs)].map((match) => match[1])
      .concat([...page.matchAll(/<link rel="stylesheet" href="\/([^"]+)"/g)].map((match) => readFileSync(join(repository, 'dist', match[1]), 'utf8')))
      .join('\n');
    assert.match(css, /\.konzilo-form-outcome:target\s*\{[^}]*display:\s*block/);
    assert.match(css, /\.konzilo-form-trap\s*\{[^}]*position:\s*absolute/);
    assert.match(css, /\.konzilo-form \[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
  });
});

// The name of a translation set.
const guid = (id) => `set-${id}`;

// A post in `locale`, of the translation set `set`, if any, beside the post's own
// meta.
function translated(fields, { locale, set } = {}) {
  return post({ modified: '2026-10-02 09:00:00', ...fields, meta: { ...fields.meta, _locale: [locale], ...(set ? { _original_post: [set] } : {}) } });
}

// An embed in a body: the address alone.
const embed = (url) => url;
const video = 'https://www.youtube.com/watch?v=Kz3pQ8vXw1A';

describe('the site template in Swedish and English, built by Astro', () => {
  let repository;
  let page;
  let built;

  // A Swedish article and its English translation, each with an embed, a
  // Swedish article with no translation, an English one with none, and a
  // Swedish page, in a category named in both languages; and a Swedish page
  // whose English translation is hidden from search engines.
  const category = { ...term('hamnar', 'Hamnar', { taxonomy: 'category' }), names: { en_GB: 'Harbours' } };
  const given = [
    translated({ ID: 1, slug: 'hamnljus', title: 'Hamnljus', body: [paragraphs('Lyktan lyser.'), embed(video)].join('\n\n'), terms: { category: [category] } }, { locale: 'sv_SE', set: guid(1) }),
    translated({ ID: 2, slug: 'harbour-lights', title: 'Harbour lights', body: [paragraphs('The lantern shines.'), embed(video)].join('\n\n'), terms: { category: [category] } }, { locale: 'en_GB', set: guid(1) }),
    translated({ ID: 3, slug: 'bara-svenska', title: 'Bara på svenska', date: '2026-09-30 08:00:00', body: paragraphs('Ingen översättning.'), terms: { category: [category] } }, { locale: 'sv_SE' }),
    translated({ ID: 4, slug: 'english-only', title: 'English only', date: '2026-10-02 08:00:00', body: paragraphs('No translation.'), terms: { category: [category] } }, { locale: 'en_GB' }),
    translated({ ID: 5, type: 'page', slug: 'om-oss', title: 'Om oss', body: paragraphs('Vi.') }, { locale: 'sv_SE' }),
    translated({ ID: 6, type: 'page', slug: 'hamnen', title: 'Hamnen', body: paragraphs('Hamnen.') }, { locale: 'sv_SE', set: guid(6) }),
    translated({ ID: 7, type: 'page', slug: 'the-harbour', title: 'The harbour', body: paragraphs('The harbour.'), meta: { seo_noindex: ['1'] } }, { locale: 'en_GB', set: guid(6) }),
  ];

  before(() => {
    repository = siteRepository();
    const file = join(repository, 'site-description.json');
    const { language, settings, ...description } = JSON.parse(readFileSync(file, 'utf8'));
    writeFileSync(file, JSON.stringify({ languages: ['sv_SE', 'en_GB'], ...description, settings: { footerText: { ...settings.footerText, translated: true } } }));
    const settingsFile = join(repository, 'site-settings.json');
    writeFileSync(settingsFile, JSON.stringify({
      menus: { main: [menuEntry(11, 'Verkstaden', '/sv/verkstaden/')] },
      settings: { footerText: 'Öppet varje dag.' },
      redirects: [],
      identity: { title: 'Lyktan', logo: null, icon: null },
      languages: { en_GB: { title: 'The Lantern', menus: { main: [menuEntry(21, 'The workshop', '/en/workshop/')] }, settings: { footerText: 'Open every day.' } } },
    }));
    const exported = writeContent(repository, given);
    assert.equal(exported.status, 0, exported.stderr);
    built = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    page = (path) => (existsSync(join(repository, 'dist', path)) ? readFileSync(join(repository, 'dist', path), 'utf8') : null);
  });

  after(() => {
    rmSync(repository, { recursive: true, force: true });
  });

  const languageTag = (html) => /<html lang="([^"]*)"/.exec(html)?.[1];
  const hreflang = (html) => [...head(html).matchAll(/<link rel="alternate" hreflang="([^"]*)" href="([^"]*)">/g)].map(([, tag, href]) => [tag, href]);
  const switcher = (html) => /<nav class="language-switcher" aria-label="([^"]*)"[^>]*>(.*?)<\/nav>/s.exec(html);
  const choices = (html) => [...(switcher(html)?.[2] ?? '').matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map(([, item]) => item.replace(/ data-astro-[^=]+="[^"]*"/g, '').trim());

  test('succeeds', () => {
    assert.equal(built.status, 0, built.stderr + built.stdout);
  });

  test('builds each post under its language\'s prefix, in its language, and no page for a translation it has not got', () => {
    assert.equal(languageTag(page('sv/hamnljus/index.html')), 'sv-SE');
    assert.match(main(page('sv/hamnljus/index.html')), /<h1>Hamnljus<\/h1>/);
    assert.equal(languageTag(page('en/harbour-lights/index.html')), 'en-GB');
    assert.match(main(page('en/harbour-lights/index.html')), /<h1>Harbour lights<\/h1>/);
    assert.equal(languageTag(page('sv/pages/om-oss/index.html')), 'sv-SE');
    assert.equal(page('en/bara-svenska/index.html'), null);
    assert.equal(page('en/hamnljus/index.html'), null);
    assert.equal(page('sv/english-only/index.html'), null);
    assert.equal(page('en/pages/om-oss/index.html'), null);
    assert.equal(page('harbour-lights/index.html'), null);
  });

  test('builds each language\'s start page under its prefix, in its language, listing that language\'s articles alone, newest first', () => {
    const swedish = page('sv/index.html');
    const english = page('en/index.html');
    assert.equal(languageTag(swedish), 'sv-SE');
    assert.equal(languageTag(english), 'en-GB');
    const listed = (html) => [...(/<main>(.*?)<\/main>/s.exec(html)?.[1] ?? '').matchAll(/<a href="([^"]*)"[^>]*>([^<]*)<\/a>/g)].map(([, href, text]) => [href, text]);
    assert.deepEqual(listed(swedish), [['/sv/hamnljus/', 'Hamnljus'], ['/sv/bara-svenska/', 'Bara på svenska']]);
    assert.deepEqual(listed(english), [['/en/english-only/', 'English only'], ['/en/harbour-lights/', 'Harbour lights']]);
    assert.match(header(swedish), /<a class="site-name" href="\/sv\/"/);
    assert.match(header(english), /<a class="site-name" href="\/en\/"/);
  });

  test('leads the site\'s root to the main language\'s start page, and each Swedish post\'s address without the prefix to the post, in _redirects and as pages that send a browser on', () => {
    const lines = page('_redirects').split('\n');
    assert.ok(lines.includes('/ /sv/ 301'), page('_redirects'));
    assert.ok(lines.includes('/hamnljus/ /sv/hamnljus/ 301'), page('_redirects'));
    assert.ok(lines.includes('/pages/om-oss/ /sv/pages/om-oss/ 301'), page('_redirects'));
    assert.equal(lines.filter((line) => line.startsWith('/harbour-lights/')).length, 0);
    assert.match(page('index.html'), /<meta http-equiv="refresh" content="0;url=\/sv\/">/);
    assert.match(page('hamnljus/index.html'), /<meta http-equiv="refresh" content="0;url=\/sv\/hamnljus\/">/);
  });

  test('links a post and its translation to each other in the language switcher, each language by its own name, and the start pages to each other', () => {
    assert.equal(switcher(page('sv/hamnljus/index.html'))?.[1], 'Språk');
    assert.deepEqual(choices(page('sv/hamnljus/index.html')), [
      '<span aria-current="page" lang="sv-SE">Svenska</span>',
      '<a href="/en/harbour-lights/" hreflang="en-GB" lang="en-GB">English</a>',
    ]);
    assert.equal(switcher(page('en/harbour-lights/index.html'))?.[1], 'Languages');
    assert.deepEqual(choices(page('en/harbour-lights/index.html')), [
      '<a href="/sv/hamnljus/" hreflang="sv-SE" lang="sv-SE">Svenska</a>',
      '<span aria-current="page" lang="en-GB">English</span>',
    ]);
    assert.deepEqual(choices(page('en/index.html')), [
      '<a href="/sv/" hreflang="sv-SE" lang="sv-SE">Svenska</a>',
      '<span aria-current="page" lang="en-GB">English</span>',
    ]);
    assert.equal(switcher(page('sv/bara-svenska/index.html')), null);
    assert.equal(switcher(page('sv/pages/om-oss/index.html')), null);
  });

  test('gives a post and its translation hreflang links to each, itself included, and x-default to the Swedish one; the start pages likewise; and none to a post without a translation', () => {
    const pair = [
      ['sv-SE', 'https://www.example.com/sv/hamnljus/'],
      ['en-GB', 'https://www.example.com/en/harbour-lights/'],
      ['x-default', 'https://www.example.com/sv/hamnljus/'],
    ];
    assert.deepEqual(hreflang(page('sv/hamnljus/index.html')), pair);
    assert.deepEqual(hreflang(page('en/harbour-lights/index.html')), pair);
    const starts = [['sv-SE', 'https://www.example.com/sv/'], ['en-GB', 'https://www.example.com/en/'], ['x-default', 'https://www.example.com/sv/']];
    assert.deepEqual(hreflang(page('sv/index.html')), starts);
    assert.deepEqual(hreflang(page('en/index.html')), starts);
    assert.deepEqual(hreflang(page('sv/bara-svenska/index.html')), []);
    assert.deepEqual(hreflang(page('en/english-only/index.html')), []);
  });

  test('says each page\'s own address and language in its search and sharing tags and its structured data', () => {
    const english = page('en/harbour-lights/index.html');
    assert.match(english, /<link rel="canonical" href="https:\/\/www\.example\.com\/en\/harbour-lights\/">/);
    assert.match(english, /<meta property="og:locale" content="en_GB">/);
    assert.match(english, /"inLanguage":"en-GB"/);
    assert.doesNotMatch(english, /"inLanguage":"sv-SE"/);
    assert.match(page('sv/hamnljus/index.html'), /<meta property="og:locale" content="sv_SE">/);
    assert.match(page('en/index.html'), /<link rel="canonical" href="https:\/\/www\.example\.com\/en\/">/);
  });

  test('shows each page\'s frame in its language: the main menu, the footer text and the title, and the 404 page the main language\'s', () => {
    for (const [path, shown] of [
      ['sv/index.html', { link: '<a href="/sv/verkstaden/">Verkstaden</a>', footer: 'Öppet varje dag.', title: 'Lyktan' }],
      ['en/index.html', { link: '<a href="/en/workshop/">The workshop</a>', footer: 'Open every day.', title: 'The Lantern' }],
      ['en/harbour-lights/index.html', { link: '<a href="/en/workshop/">The workshop</a>', footer: 'Open every day.', title: 'Harbour lights – The Lantern' }],
      ['404.html', { link: '<a href="/sv/verkstaden/">Verkstaden</a>', footer: 'Öppet varje dag.', title: 'Sidan finns inte – Lyktan' }],
    ]) {
      assert.ok(header(page(path)).includes(shown.link), `${path}: ${header(page(path))}`);
      assert.match(footer(page(path)), new RegExp(`<p class="footer-text"[^>]*>${shown.footer}</p>`), path);
      assert.equal(title(page(path)), shown.title, path);
    }
    assert.equal(languageTag(page('404.html')), 'sv-SE');
  });

  test('takes the theme colour from the main language\'s start page', () => {
    assert.match(head(page('en/harbour-lights/index.html')), /<meta name="theme-color" content="#0b57d0">/);
  });

  test('lists each language\'s start page and each post at its address in the sitemap, and not the root, which leads on', () => {
    const listed = [...page('sitemap.xml').matchAll(/<loc>https:\/\/www\.example\.com([^<]*)<\/loc>/g)].map(([, path]) => path);
    assert.deepEqual(listed, ['/sv/', '/en/', '/en/english-only/', '/en/harbour-lights/', '/sv/bara-svenska/', '/sv/hamnljus/', '/sv/pages/hamnen/', '/sv/pages/om-oss/']);
  });

  test('gives each page in the sitemap its translations as alternates, itself included, and x-default the Swedish one, as its head links them; a page alone, itself; and a translation hidden from search engines neither a place nor an alternate', () => {
    const sitemap = page('sitemap.xml');
    assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9" xmlns:xhtml="http:\/\/www\.w3\.org\/1999\/xhtml">\n/);
    const at = 'https://www.example.com';
    const alternates = Object.fromEntries([...sitemap.matchAll(/<url>\n {4}<loc>([^<]*)<\/loc>\n(?: {4}<lastmod>[^<]*<\/lastmod>\n)?((?: {4}<xhtml:link [^>]*\/>\n)*) {2}<\/url>/g)]
      .map(([, loc, links]) => [loc.slice(at.length), [...links.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]*)" href="([^"]*)"\/>/g)].map(([, tag, href]) => [tag, href])]));
    const pair = [['sv-SE', `${at}/sv/hamnljus/`], ['en-GB', `${at}/en/harbour-lights/`], ['x-default', `${at}/sv/hamnljus/`]];
    const starts = [['sv-SE', `${at}/sv/`], ['en-GB', `${at}/en/`], ['x-default', `${at}/sv/`]];
    const alone = (path, tag, main) => [[tag, `${at}${path}`], ...(main ? [['x-default', `${at}${path}`]] : [])];
    assert.deepEqual(alternates, {
      '/sv/': starts,
      '/en/': starts,
      '/en/english-only/': alone('/en/english-only/', 'en-GB', false),
      '/en/harbour-lights/': pair,
      '/sv/bara-svenska/': alone('/sv/bara-svenska/', 'sv-SE', true),
      '/sv/hamnljus/': pair,
      '/sv/pages/hamnen/': alone('/sv/pages/hamnen/', 'sv-SE', true),
      '/sv/pages/om-oss/': alone('/sv/pages/om-oss/', 'sv-SE', true),
    });
    // The heads link the same translations: the pair each other, and the
    // pages left with themselves alone none.
    for (const path of ['sv/hamnljus/', 'en/harbour-lights/', 'sv/', 'en/']) assert.deepEqual(hreflang(page(`${path}index.html`)), alternates[`/${path}`], path);
    assert.deepEqual(hreflang(page('sv/pages/hamnen/index.html')), []);
    assert.deepEqual(hreflang(page('en/pages/the-harbour/index.html')), []);
    // Visitors still switch to it.
    assert.deepEqual(choices(page('sv/pages/hamnen/index.html')), [
      '<span aria-current="page" lang="sv-SE">Svenska</span>',
      '<a href="/en/pages/the-harbour/" hreflang="en-GB" lang="en-GB">English</a>',
    ]);
    assert.match(head(page('en/pages/the-harbour/index.html')), /<meta name="robots" content="noindex">/);
  });

  // A feed per language, below the prefix, and below a term's
  // address in that language, holding that language's posts alone, its
  // language the tag, its titles from the translated settings.
  test('gives each language its feeds below its prefix, with its posts alone, its language and its titles, and leads each feed\'s address without a prefix to the main language\'s', () => {
    const links = (path) => [...(page(path) ?? '').matchAll(/<link>([^<]*)<\/link>/g)].map(([, link]) => link).slice(1);
    const channel = (path) => {
      const text = page(path) ?? '';
      const tag = (name) => new RegExp(`<channel>.*?<${name}>([^<]*)</${name}>`, 's').exec(text)?.[1];
      return { title: tag('title'), link: tag('link'), language: tag('language'), self: /<atom:link href="([^"]*)"/.exec(text)?.[1] };
    };
    const swedish = ['https://www.example.com/sv/hamnljus/', 'https://www.example.com/sv/bara-svenska/'];
    const english = ['https://www.example.com/en/english-only/', 'https://www.example.com/en/harbour-lights/'];
    assert.deepEqual(links('sv/feed/index.rss'), swedish);
    // A guid by the post's ID, so that a moved post is no new item to a feed reader.
    assert.match(page('sv/feed/index.rss'), /<guid isPermaLink="false">https:\/\/www\.example\.com\/\?p=[^<]+<\/guid>/);
    assert.deepEqual(links('en/feed/index.rss'), english);
    assert.deepEqual(links('sv/category/hamnar/feed/index.rss'), swedish);
    assert.deepEqual(links('en/category/hamnar/feed/index.rss'), english);
    assert.deepEqual(channel('sv/feed/index.rss'), { title: 'Lyktan', link: 'https://www.example.com/sv/', language: 'sv-SE', self: 'https://www.example.com/sv/feed/' });
    assert.deepEqual(channel('en/feed/index.rss'), { title: 'The Lantern', link: 'https://www.example.com/en/', language: 'en-GB', self: 'https://www.example.com/en/feed/' });
    assert.equal(channel('sv/category/hamnar/feed/index.rss').title, 'Lyktan – Hamnar');
    assert.equal(channel('en/category/hamnar/feed/index.rss').title, 'The Lantern – Harbours');
    // A page links its language's feeds.
    const feeds = (path) => [...head(page(path)).matchAll(/<link rel="alternate" type="application\/rss\+xml" href="([^"]*)" title="([^"]*)">/g)].map(([, href, named]) => [href, named]);
    assert.deepEqual(feeds('sv/hamnljus/index.html'), [['https://www.example.com/sv/feed/', 'Lyktan']]);
    assert.deepEqual(feeds('en/harbour-lights/index.html'), [['https://www.example.com/en/feed/', 'The Lantern']]);
    // The addresses of the site's one-language days lead on.
    assert.equal(page('feed/index.rss'), null);
    const lines = page('_redirects').split('\n');
    assert.ok(lines.includes('/feed/ /sv/feed/ 301'), page('_redirects'));
    assert.ok(lines.includes('/category/hamnar/feed/ /sv/category/hamnar/feed/ 301'), page('_redirects'));
  });

  // An unknown address below a language's prefix gets the 404
  // page in that language; without a chosen page, the core's plain text
  // in that language, as the root's is in the main language.
  test('builds a 404 page for each language below its prefix, in its language and its frame, beside the root\'s in the main language', () => {
    assert.equal(languageTag(page('sv/404.html')), 'sv-SE');
    assert.match(main(page('sv/404.html')), /<h1>Sidan finns inte<\/h1>/);
    assert.equal(languageTag(page('en/404.html')), 'en-GB');
    assert.match(main(page('en/404.html')), /<h1>Page not found<\/h1>/);
    assert.match(main(page('en/404.html')), /<a href="\/en\/">Go to the start page<\/a>/);
    assert.ok(header(page('en/404.html')).includes('<a href="/en/workshop/">The workshop</a>'));
    assert.equal(title(page('en/404.html')), 'Page not found – The Lantern');
    assert.match(main(page('404.html')), /<h1>Sidan finns inte<\/h1>/);
    assert.equal(page('sv/404/index.html'), null);
    assert.equal(page('en/404/index.html'), null);
  });

  // A language's search page searches that language alone, with
  // that language's analysis; it is a page under the language's prefix.
  test('builds a search page for each language below its prefix, in its language, which searches that language alone, and leads the address without a prefix to the main language\'s', () => {
    const swedish = page('sv/search/index.html');
    const english = page('en/search/index.html');
    assert.equal(languageTag(swedish), 'sv-SE');
    assert.match(page('sv/search/index.html').match(/<main>(.*?)<\/main>/s)?.[1] ?? '', /<h1>Sök<\/h1>/);
    assert.match(page('sv/search/index.html').match(/<main>(.*?)<\/main>/s)?.[1] ?? '', /data-language="sv_SE"/);
    assert.match(page('sv/search/index.html').match(/<main>(.*?)<\/main>/s)?.[1] ?? '', /<form role="search" method="get" action="\/sv\/search\/">/);
    assert.equal(languageTag(english), 'en-GB');
    assert.match(page('en/search/index.html').match(/<main>(.*?)<\/main>/s)?.[1] ?? '', /<h1>Search<\/h1>/);
    assert.match(page('en/search/index.html').match(/<main>(.*?)<\/main>/s)?.[1] ?? '', /data-language="en_GB"/);
    for (const html of [swedish, english]) assert.match(head(html), /<meta name="robots" content="noindex">/);
    assert.match(header(page('en/harbour-lights/index.html')), /<form class="konzilo-search-box" role="search" method="get" action="\/en\/search\/">/);
    assert.match(header(page('sv/hamnljus/index.html')), /<form class="konzilo-search-box" role="search" method="get" action="\/sv\/search\/">/);
    assert.deepEqual(choices(english), [
      '<a href="/sv/search/" hreflang="sv-SE" lang="sv-SE">Svenska</a>',
      '<span aria-current="page" lang="en-GB">English</span>',
    ]);
    assert.deepEqual(hreflang(english), []);
    assert.equal(page('search/index.html')?.includes('url=/sv/search/'), true);
    assert.ok(page('_redirects').split('\n').includes('/search/ /sv/search/ 301'), page('_redirects'));
  });

  test('makes each post\'s Markdown alternate at its address in its language, and each language\'s start page\'s, and none of the root, which leads on', () => {
    assert.match(page('sv/hamnljus.md'), /^canonical_url: "https:\/\/www\.example\.com\/sv\/hamnljus\/"$/m);
    assert.match(page('en/harbour-lights.md'), /^canonical_url: "https:\/\/www\.example\.com\/en\/harbour-lights\/"$/m);
    assert.match(page('sv.md'), /^canonical_url: "https:\/\/www\.example\.com\/sv\/"$/m);
    assert.notEqual(page('en.md'), null);
    assert.equal(page('index.md'), null);
    assert.match(head(page('en/harbour-lights/index.html')), /<link rel="alternate" type="text\/markdown" href="https:\/\/www\.example\.com\/en\/harbour-lights\.md">/);
  });

  test('keeps a page\'s breadcrumbs within its language, from its language\'s start page, named in its language, and by default shows none right under it', () => {
    assert.doesNotMatch(main(page('sv/pages/om-oss/index.html')), /<nav aria-label="Brödsmulor">/);
    assert.match(page('sv/pages/om-oss/index.html'), /"@type":"BreadcrumbList".*?"item":"https:\/\/www\.example\.com\/sv\/".*?"name":"Om oss"/s);
  });

  test('writes dates in the page\'s language', () => {
    assert.match(page('sv/hamnljus/index.html'), /<time datetime="2026-10-01T08:00:00\.000Z">1 oktober 2026<\/time>/);
    assert.match(page('en/harbour-lights/index.html'), /<time datetime="2026-10-01T08:00:00\.000Z">1 October 2026<\/time>/);
  });

  test('asks for consent to an embed in the page\'s language', () => {
    const button = (html) => /<button type="button" class="konzilo-embed-allow">([^<]*)<\/button>/.exec(html)?.[1];
    assert.equal(button(page('sv/hamnljus/index.html')), 'Tillåt och spela upp');
    assert.equal(button(page('en/harbour-lights/index.html')), 'Allow and play');
    const noScript = (html) => /<p class="konzilo-embed-no-script">([^<]*)<\/p>/.exec(html)?.[1];
    assert.match(noScript(page('sv/hamnljus/index.html')), /^Webbplatsens skript/);
    assert.match(noScript(page('en/harbour-lights/index.html')), /^The site&#39;s script|^The site's script/);
  });

  test('writes the logo and the icon in every language, their masters named from the language\'s settings file, and the manifest with the main language\'s title', () => {
    const file = join(repository, 'site-settings.json');
    const logo = join(repository, 'lantern.svg');
    const icon = join(repository, 'icon.svg');
    writeFileSync(logo, drawing({ width: 240, height: 60 }));
    writeFileSync(icon, drawing({ width: 100, height: 100 }));
    const identity = { title: 'Lyktan', logo: { id: 12, original: logo, alt: 'En lykta' }, icon: { id: 13, original: icon } };
    writeFileSync(file, JSON.stringify({ menus: {}, settings: {}, redirects: [], identity, languages: { en_GB: { title: 'The Lantern' } } }));
    const again = writeContent(repository, given);
    assert.equal(again.status, 0, again.stderr);
    const rebuilt = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(rebuilt.status, 0, rebuilt.stderr + rebuilt.stdout);
    for (const path of ['sv/index.html', 'en/index.html']) {
      assert.match(header(page(path)), /<img src="\/_astro\/logo-[^"]+\.svg" alt="En lykta"/, path);
      assert.match(head(page(path)), /<link rel="icon" href="\/icon\.svg" type="image\/svg\+xml">/, path);
    }
    assert.equal(JSON.parse(page('site.webmanifest')).name, 'Lyktan');
  });

  // The chosen 404 page is a page in the main language, and an
  // unknown address below another language's prefix gets its translation
  // there, which has no address of its own either.
  test('builds the chosen 404 page\'s translation as its language\'s 404 page, and gives the translation no page of its own', () => {
    const file = join(repository, 'site-settings.json');
    const identity = { title: 'Lyktan', logo: null, icon: null };
    writeFileSync(file, JSON.stringify({ menus: {}, settings: { notFound: { page: '6' } }, redirects: [], identity, languages: { en_GB: { title: 'The Lantern' } } }));
    const again = writeContent(repository, given);
    assert.equal(again.status, 0, again.stderr);
    assert.ok(existsSync(join(repository, 'content', 'not-found', 'en-GB.md')));
    const rebuilt = spawnSync(process.execPath, [astro, 'build'], { cwd: repository, encoding: 'utf8', env: astroEnvironment });
    assert.equal(rebuilt.status, 0, rebuilt.stderr + rebuilt.stdout);
    for (const path of ['404.html', 'sv/404.html']) {
      assert.match(main(page(path)), /<h1>Hamnen<\/h1>\s*<p>Hamnen\.<\/p>/, path);
      assert.equal(languageTag(page(path)), 'sv-SE', path);
    }
    assert.match(main(page('en/404.html')), /<h1>The harbour<\/h1>\s*<p>The harbour\.<\/p>/);
    assert.equal(languageTag(page('en/404.html')), 'en-GB');
    assert.equal(page('sv/pages/hamnen/index.html'), null);
    assert.equal(page('en/pages/the-harbour/index.html'), null);
  });
});

// A custom link of a menu, as a build hands it out.
function menuEntry(ID, title, url) {
  return { ID, menu_order: 1, menu_item_parent: 0, type: 'custom', object: 'custom', object_id: ID, title, url, target: '', attr_title: '', description: '', classes: [''], xfn: '' };
}
