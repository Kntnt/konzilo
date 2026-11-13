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
import { demoSource, leadsToLeftOut } from '../src/demo-source.js';
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
