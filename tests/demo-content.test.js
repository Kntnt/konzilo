// A fresh clone of a site repository starts with fictional demo content: the
// site's own, in its demo-content/, else the core's. No live site may ever show
// either: `npm run build` runs the same command on a server, so a public host
// with no content is a fault, not a site to fill.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { copyDemoContent } from '../src/demo-content.js';
import { demoSource, idOf, leadsToLeftOut } from '../src/demo-source.js';
import { intake } from '../src/intake/index.js';
import { siteDescription } from '../src/site-description.js';
import { namedImages } from './lib/intake.js';

const command = fileURLToPath(new URL('../bin/konzilo-demo-content.js', import.meta.url));

// A site's own demo content with one post out and one dated ahead, which is scheduled.
const MOMENT = '2026-12-01T07:00:00Z';
const BEFORE = new Date('2026-11-12T10:00:00Z');
const AFTER = new Date('2026-12-01T07:00:30Z');
const description = siteDescription({
  language: 'en_GB',
  types: { story: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { date: {} } } },
});
const contentFile = (title, date) => `---\ntitle: ${JSON.stringify(title)}\ndate: ${date}\nmodified: ${date}\n---\n\nThe lamps are lit.\n`;
const scheduledDemo = (site) => {
  mkdirSync(join(site, 'demo-content/articles'), { recursive: true });
  writeFileSync(join(site, 'demo-content/articles/lamps-along-the-quay.md'), contentFile('Lamps along the quay', '2026-10-20T08:00:00Z'));
  writeFileSync(join(site, 'demo-content/articles/the-winter-lamps.md'), contentFile('The winter lamps', MOMENT));
  writeFileSync(join(site, 'demo-content/settings.json'), '{\n  "title": "The Lamplighters\' Almanac"\n}\n');
};

describe('a demo content file dated ahead, which is a scheduled post', () => {
  let site;
  before(() => {
    site = mkdtempSync(join(tmpdir(), 'konzilo-demo-scheduled-'));
    scheduledDemo(site);
  });
  after(() => rmSync(site, { recursive: true, force: true }));

  const statusOf = (files, title) => /^status: "?([a-z]+)"?$/m.exec(files.find(({ content }) => content.includes(`title: "${title}"`)).content)[1];
  const run = (source, now, ledger = null) => intake({ files: source.map(({ path, content }) => ({ path, contents: content })), site: description, now, ledger, images: namedImages() });

  test('is seeded as a scheduled source file with its moment, beside the published ones', () => {
    const source = demoSource(description, join(site, 'demo-content'), { now: BEFORE });
    assert.equal(statusOf(source, 'Lamps along the quay'), 'published');
    assert.equal(statusOf(source, 'The winter lamps'), 'scheduled');
    assert.match(source.find(({ content }) => content.includes('The winter lamps')).content, /^date: 2026-12-01T07:00:00Z$/m);
  });

  test('waits off the site until its moment, and the intake publishes it then, with nothing to say', () => {
    const source = demoSource(description, join(site, 'demo-content'), { now: BEFORE });
    const seeded = run(source, BEFORE);
    assert.deepEqual(seeded.refusals, []);
    assert.deepEqual(seeded.files.map(({ path }) => path).filter((path) => path.startsWith('articles/')), ['articles/lamps-along-the-quay.md']);
    assert.equal(seeded.next, MOMENT);
    const at = run(source, AFTER, seeded.ledger);
    assert.deepEqual(at.refusals, []);
    assert.deepEqual(at.warnings, []);
    const live = at.files.find(({ path }) => path === 'articles/the-winter-lamps.md');
    assert.match(live.contents, /^date: 2026-12-01T07:00:00Z$/m);
  });

  test('is an ordinary published post to a seed after its moment', () => {
    const source = demoSource(description, join(site, 'demo-content'), { now: AFTER });
    assert.equal(statusOf(source, 'The winter lamps'), 'published');
  });

  // A copy that leaves the post out has no page at its address, which nothing else says.
  test('is named, where a copy leaves it out, by each link and menu entry of what it copies that leads to it, refusing nothing', () => {
    const demo = mkdtempSync(join(tmpdir(), 'konzilo-demo-leading-'));
    try {
      mkdirSync(join(demo, 'articles'));
      mkdirSync(join(demo, 'menus'));
      writeFileSync(join(demo, 'articles/the-winter-lamps.md'), contentFile('The winter lamps', MOMENT));
      writeFileSync(join(demo, 'articles/lamps-along-the-quay.md'), `---\ntitle: "Lamps along the quay"\ndate: 2026-10-20T08:00:00Z\n---\n\nSee [the winter lamps](/the-winter-lamps/), <a href="/the-winter-lamps/#first">the first</a> and [the quay](/lamps-along-the-quay/).\n`);
      writeFileSync(join(demo, 'menus/main.json'), JSON.stringify({ items: [{ title: 'Quay', url: '/lamps-along-the-quay/', items: [{ title: 'Winter', url: '/the-winter-lamps/' }] }] }));
      assert.deepEqual(leadsToLeftOut(description, demo, ['articles/the-winter-lamps.md']), [
        'articles/lamps-along-the-quay.md: a link leads to /the-winter-lamps/, The winter lamps, a post dated ahead that is left out, so it leads to no page',
        'articles/lamps-along-the-quay.md: a link leads to /the-winter-lamps/, The winter lamps, a post dated ahead that is left out, so it leads to no page',
        'menus/main.json: the entry "Winter" leads to /the-winter-lamps/, The winter lamps, a post dated ahead that is left out, so it leads to no page',
      ]);
      assert.deepEqual(leadsToLeftOut(description, demo, []), []);
    } finally {
      rmSync(demo, { recursive: true, force: true });
    }
  });

  // A copy without Compose has no clock that publishes: what it copies is what it shows.
  test('is left out of a content folder filled before its moment, and copied as published after it', () => {
    const before = join(site, 'content-before');
    assert.deepEqual(copyDemoContent(site, before, { now: BEFORE }).scheduled, ['articles/the-winter-lamps.md']);
    assert.deepEqual(readdirSync(join(before, 'articles')), ['lamps-along-the-quay.md']);
    const after = join(site, 'content-after');
    assert.deepEqual(copyDemoContent(site, after, { now: AFTER }).scheduled, []);
    assert.deepEqual(readdirSync(join(after, 'articles')).sort(), ['lamps-along-the-quay.md', 'the-winter-lamps.md']);
  });
});

// A post of the demo content whose frontmatter says `status: draft`, a key only demo content
// carries, which a content folder never holds.
const draftFile = (title, date) => `---\ntitle: ${JSON.stringify(title)}\nstatus: "draft"\n${date ? `date: ${date}\n` : ''}---\n\nThe lamps are not lit yet.\n`;
const draftDemo = (site) => {
  scheduledDemo(site);
  writeFileSync(join(site, 'demo-content/articles/the-unlit-lamps.md'), draftFile('The unlit lamps'));
};

describe('a demo content file that says it is a draft', () => {
  let site;
  before(() => {
    site = mkdtempSync(join(tmpdir(), 'konzilo-demo-draft-'));
    draftDemo(site);
  });
  after(() => rmSync(site, { recursive: true, force: true }));

  const seeded = (now = BEFORE) => demoSource(description, join(site, 'demo-content'), { now });
  const fileOf = (source, title) => source.find(({ content }) => content.includes(`title: "${title}"`)).content;

  test('is seeded as a draft source file, as an editor\'s save of a draft leaves it, beside the published and the scheduled ones', () => {
    const source = seeded();
    assert.equal(fileOf(source, 'The unlit lamps'), '---\ntitle: "The unlit lamps"\nslug: "the-unlit-lamps"\nstatus: "draft"\n---\n\nThe lamps are not lit yet.\n');
    assert.match(fileOf(source, 'Lamps along the quay'), /^status: "published"$/m);
    assert.match(fileOf(source, 'The winter lamps'), /^status: "scheduled"$/m);
  });

  test('stays off the public site, and the live preview shows it now', () => {
    const source = seeded().map(({ path, content }) => ({ path, contents: content }));
    const draft = source.find(({ contents }) => contents.includes('title: "The unlit lamps"')).path;
    const run = (preview) => intake({ files: source, site: description, now: BEFORE, images: namedImages(), ...(preview ? { preview } : {}) });
    const published = run();
    assert.deepEqual(published.refusals, []);
    assert.deepEqual(published.files.map(({ path }) => path).filter((path) => path.startsWith('articles/')), ['articles/lamps-along-the-quay.md']);
    assert.deepEqual(published.posts.find(({ file }) => file === draft).state, 'off');
    const previewed = run([draft]);
    assert.deepEqual(previewed.refusals, []);
    assert.match(previewed.files.find(({ path }) => path === 'articles/the-unlit-lamps.md').contents, /^title: "The unlit lamps"$/m);
  });

  // A copy without Compose has no live preview: what it copies is what the public site shows.
  test('is left out of a content folder, before and after any moment, apart from the posts dated ahead', () => {
    for (const [now, scheduled, kept] of [[BEFORE, ['articles/the-winter-lamps.md'], ['lamps-along-the-quay.md']], [AFTER, [], ['lamps-along-the-quay.md', 'the-winter-lamps.md']]]) {
      const content = join(site, `content-${now.getTime()}`);
      const copied = copyDemoContent(site, content, { now });
      assert.deepEqual(copied.drafts, ['articles/the-unlit-lamps.md']);
      assert.deepEqual(copied.scheduled, scheduled);
      assert.deepEqual(readdirSync(join(content, 'articles')).sort(), kept);
    }
  });

  // Its date, where it has one, is its moment, as an editor's draft keeps the date it was given,
  // from which the live preview shows it; it stays a draft.
  test('is a draft dated ahead too, in the seed with its date and in a copy, which leaves it out as a draft', () => {
    const demo = mkdtempSync(join(tmpdir(), 'konzilo-demo-draft-ahead-'));
    try {
      mkdirSync(join(demo, 'demo-content/articles'), { recursive: true });
      writeFileSync(join(demo, 'demo-content/articles/the-spring-lamps.md'), draftFile('The spring lamps', MOMENT));
      const [file] = demoSource(description, join(demo, 'demo-content'), { now: BEFORE });
      assert.equal(file.content, `---\ntitle: "The spring lamps"\nslug: "the-spring-lamps"\nstatus: "draft"\ndate: ${MOMENT}\n---\n\nThe lamps are not lit yet.\n`);
      const copied = copyDemoContent(demo, join(demo, 'content'), { now: BEFORE });
      assert.deepEqual([copied.drafts, copied.scheduled], [['articles/the-spring-lamps.md'], []]);
    } finally {
      rmSync(demo, { recursive: true, force: true });
    }
  });

  // `draft` is the one status demo content says; the seed and a copy read any other as none, and
  // so agree on what a post is.
  test('is the one status demo content says, the seed reading another as none, as a copy does', () => {
    const demo = mkdtempSync(join(tmpdir(), 'konzilo-demo-status-'));
    try {
      mkdirSync(join(demo, 'demo-content/articles'), { recursive: true });
      writeFileSync(join(demo, 'demo-content/articles/the-winter-lamps.md'), `---\ntitle: "The winter lamps"\nstatus: "published"\ndate: ${MOMENT}\n---\n\nThe lamps are lit.\n`);
      const [file] = demoSource(description, join(demo, 'demo-content'), { now: BEFORE });
      assert.match(file.content, /^status: "scheduled"$/m);
      assert.deepEqual(copyDemoContent(demo, join(demo, 'content'), { now: BEFORE }).scheduled, ['articles/the-winter-lamps.md']);
    } finally {
      rmSync(demo, { recursive: true, force: true });
    }
  });
});

// The core's demo content gives a local copy's Reviewer something the live preview shows and the
// public site does not.
test('the core\'s demo content holds one draft, an article, which the live preview shows and neither the public site nor a copy does', () => {
  const template = siteDescription(JSON.parse(readFileSync(fileURLToPath(new URL('../site-template/files/site-description.json', import.meta.url)), 'utf8')));
  const core = fileURLToPath(new URL('../site-template/demo-content', import.meta.url));
  const now = new Date('2026-11-25T12:00:00Z');
  const source = demoSource(template, core, { now });
  const drafts = source.filter(({ content }) => typeof content === 'string' && /^status: "draft"$/m.test(content));
  assert.deepEqual(drafts.map(({ path }) => path), [`articles/${idOf('articles', 'distant-workshops-and-the-river')}.md`]);
  const files = source.map(({ path, content }) => ({ path, contents: content }));
  const published = intake({ files, site: template, now, images: namedImages() });
  assert.deepEqual(published.refusals, []);
  assert.equal(published.files.some(({ path }) => path === 'articles/distant-workshops-and-the-river.md'), false);
  const previewed = intake({ files, site: template, now, images: namedImages(), preview: [drafts[0].path] });
  assert.deepEqual(previewed.refusals, []);
  assert.match(previewed.files.find(({ path }) => path === 'articles/distant-workshops-and-the-river.md').contents, /^headline: "Distant workshops and the river"$/m);
  const site = mkdtempSync(join(tmpdir(), 'konzilo-demo-core-'));
  try {
    const copied = copyDemoContent(site, join(site, 'content'), { now });
    assert.deepEqual([copied.drafts, copied.scheduled], [['articles/distant-workshops-and-the-river.md'], []]);
    assert.equal(existsSync(join(site, 'content/articles/distant-workshops-and-the-river.md')), false);
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});

// A date as YAML may write it, in single quotes, with a comment after it, or with Windows line
// endings: the seed and a copy without Compose read each as the content format does, and agree
// that the post is scheduled.
test('reads a date dated ahead as the content format does, quoted singly, with a comment, or with Windows line endings', () => {
  const site = mkdtempSync(join(tmpdir(), 'konzilo-demo-dates-'));
  try {
    mkdirSync(join(site, 'demo-content/articles'), { recursive: true });
    const forms = {
      'quoted.md': `---\ntitle: "Quoted"\ndate: '${MOMENT}'\n---\n\nAhead.\n`,
      'commented.md': `---\ntitle: "Commented"\ndate: "${MOMENT}" # the first of winter\n---\n\nAhead.\n`,
      'windows.md': `---\r\ntitle: "Windows"\r\ndate: ${MOMENT}\r\n---\r\n\r\nAhead.\r\n`,
    };
    for (const [name, text] of Object.entries(forms)) writeFileSync(join(site, 'demo-content/articles', name), text);
    assert.deepEqual(copyDemoContent(site, join(site, 'content'), { now: BEFORE }).scheduled, ['articles/commented.md', 'articles/quoted.md', 'articles/windows.md']);
    const source = demoSource(description, join(site, 'demo-content'), { now: BEFORE });
    for (const title of ['Quoted', 'Commented', 'Windows']) {
      assert.match(source.find(({ content }) => content.includes(`title: "${title}"`)).content, /^status: "scheduled"$/m, title);
    }
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});

// The page for addresses not found has no address at which it could wait, so it is never
// scheduled, whatever its date; the start page an Admin chose, dated ahead, waits in the seed and
// is left out by a copy, as any post dated ahead.
test('never schedules the page for addresses not found, dated ahead, in the seed or a copy, and schedules a chosen start page in both alike', () => {
  const site = mkdtempSync(join(tmpdir(), 'konzilo-demo-root-'));
  try {
    mkdirSync(join(site, 'demo-content/articles'), { recursive: true });
    writeFileSync(join(site, 'demo-content/articles/lamps-along-the-quay.md'), contentFile('Lamps along the quay', '2026-10-20T08:00:00Z'));
    writeFileSync(join(site, 'demo-content/not-found.md'), contentFile('Not here', MOMENT));
    writeFileSync(join(site, 'demo-content/start.story.md'), contentFile('Welcome', MOMENT));
    const copied = copyDemoContent(site, join(site, 'content'), { now: BEFORE });
    assert.deepEqual(copied.scheduled, ['start.story.md']);
    assert.ok(existsSync(join(site, 'content/not-found.md')), 'the page for addresses not found is copied');
    const source = demoSource(description, join(site, 'demo-content'), { now: BEFORE });
    const statusOf = (title) => /^status: "?([a-z]+)"?$/m.exec(source.find(({ content }) => content.includes(`title: "${title}"`)).content)[1];
    assert.deepEqual(['Not here', 'Welcome', 'Lamps along the quay'].map(statusOf), ['published', 'scheduled', 'published']);
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});

// A chosen start page's file holds its own slug, so the seed gives it back to the source, and the
// site puts it at its own address again once it is no longer chosen.
test('takes a chosen start page through the seed with its own slug, which it has again once no longer chosen', () => {
  const site = mkdtempSync(join(tmpdir(), 'konzilo-demo-start-'));
  try {
    mkdirSync(join(site, 'demo-content/articles'), { recursive: true });
    writeFileSync(join(site, 'demo-content/articles/lamps-along-the-quay.md'), contentFile('Lamps along the quay', '2026-10-20T08:00:00Z'));
    writeFileSync(join(site, 'demo-content/start.story.md'), '---\ntitle: "Welcome to the almanac of the lamplighters"\nslug: "home"\ndate: 2026-10-01T08:00:00Z\nmodified: 2026-10-01T08:00:00Z\n---\n\nWelcome.\n');
    const source = demoSource(description, join(site, 'demo-content'), { now: BEFORE });
    const seeded = source.find(({ content }) => content.includes('title: "Welcome to the almanac of the lamplighters"'));
    assert.match(seeded.content, /^slug: "home"$/m);
    const files = (from) => from.map(({ path, content }) => ({ path, contents: content }));
    const chosen = intake({ files: files(source), site: description, now: BEFORE, images: namedImages() });
    assert.deepEqual(chosen.refusals, []);
    assert.match(chosen.files.find(({ path }) => path === 'start.story.md').contents, /^slug: "home"$/m);
    const unchosen = source.map((file) => (file.path === 'settings.json' ? { ...file, content: '{}\n' } : file));
    const left = intake({ files: files(unchosen), site: description, now: BEFORE, ledger: chosen.ledger, images: namedImages() });
    assert.ok(left.files.some(({ path }) => path === 'articles/home.md'), 'at its own address, /home/');
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});

// In a hierarchical type the start page keeps its parent too, and its children their parent.
test('takes a chosen start page below another, with children of its own, through the seed to the same places', () => {
  const site = mkdtempSync(join(tmpdir(), 'konzilo-demo-start-'));
  const pages = siteDescription({ language: 'en_GB', types: { section: { label: 'Section', plural: 'Sections', collection: 'pages', address: '/{path}/', hierarchical: true, elements: ['paragraph'], fields: { date: {} } } } });
  try {
    mkdirSync(join(site, 'demo-content/pages/about/welcome'), { recursive: true });
    writeFileSync(join(site, 'demo-content/pages/about.md'), contentFile('About', '2026-10-01T08:00:00Z'));
    writeFileSync(join(site, 'demo-content/start.section.md'), '---\ntitle: "Welcome"\nslug: "welcome"\nparent: "about"\ndate: 2026-10-01T08:00:00Z\n---\n\nWelcome.\n');
    writeFileSync(join(site, 'demo-content/pages/about/welcome/team.md'), contentFile('The team', '2026-10-01T08:00:00Z'));
    const source = demoSource(pages, join(site, 'demo-content'), { now: BEFORE });
    const chosen = intake({ files: source.map(({ path, content }) => ({ path, contents: content })), site: pages, now: BEFORE, images: namedImages() });
    assert.deepEqual(chosen.refusals, []);
    assert.deepEqual(chosen.files.map(({ path }) => path).filter((path) => path.endsWith('.md')).sort(), ['pages/about.md', 'pages/about/welcome/team.md', 'start.section.md']);
    assert.match(chosen.files.find(({ path }) => path === 'start.section.md').contents, /^slug: "welcome"\nparent: "about"$/m);
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});

describe('konzilo-demo-content', () => {
  let folder;
  let count = 0;

  const run = (origin, prepare = () => {}) => {
    const cwd = join(folder, `site-${(count += 1)}`);
    mkdirSync(cwd);
    prepare(cwd);
    const env = { ...process.env };
    delete env.KONZILO_ORIGIN;
    delete env.KONZILO_CONTENT;
    if (origin) env.KONZILO_ORIGIN = origin;
    return { ...spawnSync(process.execPath, [command], { cwd, env, encoding: 'utf8' }), content: join(cwd, 'content') };
  };

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-demo-content-'));
  });

  after(() => rmSync(folder, { recursive: true, force: true }));

  for (const origin of [undefined, 'http://localhost:4321']) {
    test(`fills a local copy with no content, ${origin ?? 'with no origin given'}`, () => {
      const { status, content, stderr } = run(origin);
      assert.equal(status, 0, stderr);
      assert.ok(readdirSync(content).length > 0);
    });
  }

  // A site repository's own, in demo-content/, as the core's is shaped.
  const ownDemoContent = (cwd) => {
    mkdirSync(join(cwd, 'demo-content/articles'), { recursive: true });
    writeFileSync(join(cwd, 'demo-content/articles/lamps-along-the-quay.md'), '---\ntitle: "Lamps along the quay"\n---\n\nThe lamps are lit.\n');
    writeFileSync(join(cwd, 'demo-content/settings.json'), '{\n  "title": "The Lamplighters\' Almanac"\n}\n');
  };

  test('fills a local copy with no content from the site\'s own demo content, and with nothing of the core\'s', () => {
    const { status, content, stderr } = run(undefined, ownDemoContent);
    assert.equal(status, 0, stderr);
    assert.deepEqual(readdirSync(content, { recursive: true }).sort(), ['articles', 'articles/lamps-along-the-quay.md', 'settings.json']);
    assert.match(readFileSync(join(content, 'settings.json'), 'utf8'), /The Lamplighters' Almanac/);
  });

  test('refuses a public host with no content, and copies nothing, of the site\'s own demo content as of the core\'s', () => {
    for (const prepare of [undefined, ownDemoContent]) {
      const { status, content, stderr } = run('https://www.example.com', prepare);
      assert.equal(status, 1);
      assert.match(stderr, /demo content is not for a public host: https:\/\/www\.example\.com/);
      assert.equal(existsSync(content), false);
    }
  });

  test('leaves out a post of the site\'s own demo content that is dated ahead, and says so', () => {
    const { status, content, stdout, stderr } = run(undefined, (cwd) => {
      ownDemoContent(cwd);
      writeFileSync(join(cwd, 'demo-content/articles/the-last-lamp.md'), contentFile('The last lamp', '2999-01-01T07:00:00Z'));
    });
    assert.equal(status, 0, stderr);
    assert.deepEqual(readdirSync(join(content, 'articles')), ['lamps-along-the-quay.md']);
    assert.match(stdout, /left out articles\/the-last-lamp\.md, a post dated ahead, which only Compose schedules/);
  });

  test('leaves out a draft of the site\'s own demo content, and says so, and of each link and menu entry that leads to it', () => {
    const { status, content, stdout, stderr } = run(undefined, (cwd) => {
      ownDemoContent(cwd);
      writeFileSync(join(cwd, 'site-description.json'), JSON.stringify({ language: 'en_GB', types: { story: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { date: {} } } } }));
      writeFileSync(join(cwd, 'demo-content/articles/the-unlit-lamps.md'), draftFile('The unlit lamps'));
      mkdirSync(join(cwd, 'demo-content/menus'));
      writeFileSync(join(cwd, 'demo-content/menus/main.json'), JSON.stringify({ items: [{ title: 'Unlit', url: '/the-unlit-lamps/' }] }));
    });
    assert.equal(status, 0, stderr);
    assert.deepEqual(readdirSync(join(content, 'articles')), ['lamps-along-the-quay.md']);
    assert.match(stdout, /^konzilo: left out articles\/the-unlit-lamps\.md, a draft, which only the live preview in Compose shows$/m);
    assert.match(stdout, /^konzilo: menus\/main\.json: the entry "Unlit" leads to \/the-unlit-lamps\/, The unlit lamps, a draft that is left out, so it leads to no page$/m);
  });

  test('says of each link and menu entry it copies that leads to a post it leaves out, and copies them all the same', () => {
    const { status, content, stdout, stderr } = run(undefined, (cwd) => {
      ownDemoContent(cwd);
      writeFileSync(join(cwd, 'site-description.json'), JSON.stringify({ language: 'en_GB', types: { story: { label: 'Article', plural: 'Articles', collection: 'articles', address: '/{slug}/', elements: ['paragraph'], fields: { date: {} } } } }));
      writeFileSync(join(cwd, 'demo-content/articles/the-last-lamp.md'), contentFile('The last lamp', '2999-01-01T07:00:00Z'));
      mkdirSync(join(cwd, 'demo-content/menus'));
      writeFileSync(join(cwd, 'demo-content/menus/main.json'), JSON.stringify({ items: [{ title: 'Last', url: '/the-last-lamp/' }] }));
    });
    assert.equal(status, 0, stderr);
    assert.match(stdout, /^konzilo: menus\/main\.json: the entry "Last" leads to \/the-last-lamp\/, The last lamp, a post dated ahead that is left out, so it leads to no page$/m);
    assert.ok(existsSync(join(content, 'menus/main.json')));
  });

  test('leaves a site that has content as it is, on any host', () => {
    for (const origin of [undefined, 'https://www.example.com']) {
      const { status, content, stderr } = run(origin, (cwd) => mkdirSync(join(cwd, 'content')));
      assert.equal(status, 0, stderr);
      assert.deepEqual(readdirSync(content), []);
    }
  });
});

// The image library starts with what the posts show, each picture with what its first post holds
// beside it, its alt text and its focal point, as an editor's choice of it would have copied them.
// An editor's menu entry or link to a term's page is a reference by the term's ID, as one to a post's is, so the seed
// gives back the ID that the published file keeps, and the site tells the entry from a link to the same address.
test('takes a menu entry and a body\'s link to a term\'s page through the seed as references by the term\'s ID', () => {
  const site = mkdtempSync(join(tmpdir(), 'konzilo-demo-terms-'));
  const article = siteDescription({ language: 'en_GB', images: { smallestWidth: 400, displayWidth: 1280 }, menus: { main: { label: 'Main menu' } }, types: { article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } }, taxonomies: { category: { address: '/category/{path}/' } } });
  try {
    mkdirSync(join(site, 'demo-content/articles'), { recursive: true });
    mkdirSync(join(site, 'demo-content/categories'), { recursive: true });
    mkdirSync(join(site, 'demo-content/menus'), { recursive: true });
    writeFileSync(join(site, 'demo-content/categories/lamps.json'), JSON.stringify({ name: 'Lamps' }));
    writeFileSync(join(site, 'demo-content/categories/gas-lamps.json'), JSON.stringify({ name: 'Gas lamps', parent: 'lamps' }));
    writeFileSync(join(site, 'demo-content/articles/quay.md'), '---\ntitle: "The quay"\ndate: 2026-10-20T08:00:00Z\nmodified: 2026-10-20T08:00:00Z\nheadline: "The quay"\ncategory: ["lamps/gas-lamps"]\n---\n\nMore in [the gas lamps](/category/lamps/gas-lamps/).\n');
    writeFileSync(join(site, 'demo-content/menus/main.json'), JSON.stringify({ items: [
      { title: 'Lamps', url: '/category/lamps/', items: [{ title: 'All the gas lamps', url: '/category/lamps/gas-lamps/' }] },
      { title: 'The quay', url: '/quay/' },
    ] }));
    const source = demoSource(article, join(site, 'demo-content'), { now: BEFORE });
    const lamps = idOf('categories', 'lamps');
    const gas = idOf('categories', 'gas-lamps');
    const menu = JSON.parse(source.find(({ path }) => path === 'menus/main.json').content);
    assert.deepEqual(menu.items, [
      { post: lamps, items: [{ title: 'All the gas lamps', post: gas }] },
      { post: idOf('articles', 'quay') },
    ]);
    assert.match(source.find(({ path }) => path.startsWith('articles/')).content, new RegExp(`\\[the gas lamps\\]\\(konzilo:${gas}\\)`));
    const taken = intake({ files: source.map(({ path, content }) => ({ path, contents: content })), site: article, now: BEFORE, images: namedImages() });
    assert.deepEqual(taken.refusals, []);
    assert.deepEqual(JSON.parse(taken.files.find(({ path }) => path === 'menus/main.json').contents).items, [
      { title: 'Lamps', post: lamps, url: '/category/lamps/', items: [{ title: 'All the gas lamps', post: gas, url: '/category/lamps/gas-lamps/' }] },
      { title: 'The quay', post: idOf('articles', 'quay'), url: '/quay/' },
    ]);
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});

test('starts the image library with each picture a post shows, its alt text and its focal point copied as the post holds them', () => {
  const site = mkdtempSync(join(tmpdir(), 'konzilo-demo-library-'));
  try {
    const article = siteDescription({ language: 'en_GB', images: { smallestWidth: 400, displayWidth: 1280 }, types: { article: { collection: 'articles', address: '/{slug}/', elements: ['paragraph'] } } });
    mkdirSync(join(site, 'demo-content/articles'), { recursive: true });
    mkdirSync(join(site, 'demo-content/media'), { recursive: true });
    writeFileSync(join(site, 'demo-content/media/lamps-0123456789.webp'), 'a master');
    writeFileSync(join(site, 'demo-content/media/quay-9876543210.webp'), 'a master');
    const piece = (title, image) => `---\ntitle: ${JSON.stringify(title)}\ndate: 2026-10-20T08:00:00Z\nmodified: 2026-10-20T08:00:00Z\nheadline: ${JSON.stringify(title)}\nimage: ${JSON.stringify(image)}\n---\n\nThe lamps are lit.\n`;
    writeFileSync(join(site, 'demo-content/articles/lamps.md'), piece('Lamps', { src: '../media/lamps-0123456789.webp', alt: 'Lamps on the quay', focalPoint: { x: 0.2, y: 0.7 } }));
    writeFileSync(join(site, 'demo-content/articles/quay.md'), piece('Quay', { src: '../media/quay-9876543210.webp', alt: 'The quay' }));
    const library = demoSource(article, join(site, 'demo-content'), { now: BEFORE }).filter(({ path }) => path.startsWith('image-library/')).map(({ content }) => JSON.parse(content));
    assert.deepEqual(library.sort((a, b) => a.alt.localeCompare(b.alt)), [
      { src: '/media/lamps-0123456789.webp', alt: 'Lamps on the quay', focalPoint: { x: 0.2, y: 0.7 } },
      { src: '/media/quay-9876543210.webp', alt: 'The quay' },
    ]);
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
});
