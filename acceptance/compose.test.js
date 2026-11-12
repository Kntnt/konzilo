// A site in Compose, from outside, as a developer and an editor meet it: one command
// brings it up, Forgejo is closed but for what signing in and saving need, and a real
// browser signs in with both factors and saves. Everything else about the format and
// the integration is proved below this, in the suite proper (ADR 0014).

import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { intake } from '../src/intake/index.js';
import { readSiteDescription } from '../src/site-description.js';
import { sharp } from '../tests/lib/images.js';
import { readCsv } from '../tests/lib/csv.js';
import { OWN_DEMO, writeOwnDemoContent } from '../tests/lib/demo-content.js';
import { namedImages, NOW, sourcePost } from '../tests/lib/intake.js';
import { ENGINES, openEditor, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const inspect = (id) => JSON.parse(execFileSync('docker', ['inspect', id], { encoding: 'utf8' }))[0];

describe('a site in Compose', () => {
  let site;
  let token;

  // Node's fetch keeps connections, and one left from before a restart gives a reset,
  // which says nothing about the site.
  const get = async (url, init) => {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (!['ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      return fetch(url, init);
    }
  };

  // The instance's credential, read as an operator could, to look at what was saved.
  const api = async (path) => {
    const answer = await get(`${site.origin.git}/api/v1${path}`, { headers: { authorization: `token ${token}` } });
    assert.equal(answer.status, 200, path);
    return answer.json();
  };
  const repository = () => `/repos/${site.name}/source`;
  const fileNamed = async (collection, title) => {
    const files = await api(`${repository()}/contents/${collection}`);
    for (const file of files) {
      const { content } = await api(`${repository()}/contents/${file.path}`);
      const text = Buffer.from(content, 'base64').toString();
      if (text.includes(`title: ${title}`) || text.includes(`title: "${title}"`)) return { path: file.path, text };
    }
    return null;
  };

  // The source repository as it stands, through the intake.
  const throughIntake = async () => {
    const { tree } = await api(`${repository()}/git/trees/main?recursive=true`);
    const files = [];
    for (const { path: name, type } of tree) {
      if (type !== 'blob' || name.startsWith('.')) continue;
      // An original in LFS is no text to read: the seam says what a master would be.
      if (name.startsWith('media/')) {
        files.push({ path: name, contents: 'an original' });
        continue;
      }
      const { content } = await api(`${repository()}/contents/${name}`);
      files.push({ path: name, contents: Buffer.from(content, 'base64').toString() });
    }
    const description = readSiteDescription(join(site.directory, 'site-description.json'));
    return intake({ files, site: description, now: NOW, images: namedImages(), changes: {} });
  };

  // Each editor's commit, and that a post's file is the last it touched.
  const lastCommit = async (path) => (await api(`${repository()}/commits?path=${path}&limit=1`))[0];

  const waitForFile = async (page, path, holds) => {
    const deadline = Date.now() + 30_000;
    for (;;) {
      const { content } = await api(`${repository()}/contents/${path}`);
      const text = Buffer.from(content, 'base64').toString();
      if (holds(text)) return text;
      if (Date.now() > deadline) return text;
      await page.waitForTimeout(500);
    }
  };

  // What a visitor would meet at an address, as it comes to hold these words, or what it held
  // when the time was up.
  const onTheSite = async (address, words, { within = 60_000, wait = (ms) => new Promise((go) => setTimeout(go, ms)) } = {}) => {
    const deadline = Date.now() + within;
    for (;;) {
      const answer = await get(`${site.origin.site}${address}`);
      const text = await answer.text();
      if (answer.status === 200 && text.includes(words)) return text;
      if (Date.now() > deadline) return `${answer.status} ${text}`;
      await wait(250);
    }
  };
  const addressOf = (text) => `/${/^slug: "?([^"\n]+)"?$/m.exec(text)[1]}/`;

  // Until a service started again says it is healthy, for at most a minute.
  const healthy = async (service) => {
    const deadline = Date.now() + 60_000;
    while (!site.compose('ps', '--format', 'json', service).includes('"Health":"healthy"') && Date.now() < deadline) {
      await new Promise((go) => setTimeout(go, 500));
    }
  };

  // What the repository holds of an entry of the image library, by the file it names.
  const libraryEntries = async () => {
    const entries = [];
    for (const { path: place } of await api(`${repository()}/contents/image-library`)) {
      const { content } = await api(`${repository()}/contents/${place}`);
      entries.push({ place, ...JSON.parse(Buffer.from(content, 'base64').toString()) });
    }
    return entries;
  };
  const picture = (of, headers = { authorization: `token ${token}` }) => get(`${site.origin.admin}/_konzilo/thumbnail?of=${encodeURIComponent(of)}`, { headers });

  // The chooser, from a new block after whatever the body holds.
  // From wherever a save left the page, the post it names.
  const openArticle = async (page, title) => {
    await page.goto(`${site.origin.admin}/#/collections/articles`);
    await page.getByText(title).first().click();
  };

  // Sveltia puts a long form's fields on the page only as a person scrolls near them, so this
  // turns the wheel over the form until the field at `key` is there, and brings it into view.
  const bringNear = async (page, key) => {
    const field = page.locator(`section.field[data-key-path="${key}"]`);
    const box = await page.locator('section.field[data-key-path="group-name"]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, Math.min(Math.max(box.y + 5, 10), page.viewportSize().height - 10));
    for (let tries = 0; await field.count() === 0 && tries < 40; tries += 1) {
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(250);
    }
    await field.scrollIntoViewIfNeeded();
  };

  const openChooser = async (page, row = 'image', title = 'Choose an image', name = 'Image') => {
    const editor = page.locator('.konzilo-body-visual .ProseMirror');
    await editor.waitFor({ timeout: 30_000 });
    await editor.locator('> p').last().click();
    // A paragraph runs over several lines, where End goes to the end of one.
    await editor.locator('> p').last().evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      range.collapse(false);
      const selection = document.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.keyboard.type(`/${row}`, { delay: 30 });
    // The menu narrows a moment after the keys, and Enter takes the row it marks.
    await page.locator('.milkdown-slash-menu li.hover', { hasText: name }).waitFor();
    await page.keyboard.press('Enter');
    const chooser = page.getByRole('dialog', { name: title });
    await chooser.waitFor();
    return chooser;
  };
  const shows = (element) => element.evaluate((image) => image.complete && image.naturalWidth > 0);

  // The instance's credential, acting as this account does, which is as Forgejo sees a save.
  const asAccount = async (method, path, body, login, { expect = [200, 201, 204] } = {}) => {
    const answer = await get(`${site.origin.git}/api/v1${path}${login ? `?sudo=${login}` : ''}`, {
      method,
      headers: { authorization: `token ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.ok(expect.includes(answer.status), `${method} ${path}: ${answer.status}`);
    const text = await answer.text();
    return text ? JSON.parse(text) : null;
  };
  const saveFile = async (path, contents, login, identity = {}) => {
    const held = await get(`${site.origin.git}/api/v1${repository()}/contents/${path}`, { headers: { authorization: `token ${token}` } });
    const sha = held.status === 200 ? (await held.json()).sha : undefined;
    return asAccount(sha ? 'PUT' : 'POST', `${repository()}/contents/${path}`, { content: Buffer.from(contents).toString('base64'), message: 'A save', ...(sha ? { sha } : {}), ...identity }, login);
  };
  const status = async () => {
    const answer = await get(`${site.origin.admin}/_konzilo/status`, { headers: { authorization: `token ${token}` } });
    assert.equal(answer.status, 200);
    return answer.json();
  };
  const statusBecomes = async (file, wanted, { within = 60_000 } = {}) => {
    const deadline = Date.now() + within;
    for (;;) {
      const { posts } = await status();
      const post = posts.find((one) => one.file === file);
      if (post?.status === wanted || Date.now() > deadline) return post;
      await new Promise((go) => setTimeout(go, 500));
    }
  };

  before(async () => {
    site = await makeSite();
    site.up('--build');
    token = site.state('instance-token');
  }, { timeout: 900_000 });

  after(() => site?.remove());

  test('answers on its hosts, once one command returns', async () => {
    const start = await fetch(`${site.origin.site}/`);
    assert.equal(start.status, 200);
    assert.match(await start.text(), /The Gentle Garden/);
    assert.equal((await fetch(`${site.origin.site}/quiet-harbours-and-the-lantern/`)).status, 200);
    assert.equal((await fetch(`${site.origin.site}/no-such-page/`)).status, 404);
    assert.equal((await fetch(`${site.origin.admin}/`)).status, 200);
    assert.equal((await fetch(`${site.origin.git}/api/healthz`)).status, 200);
  });

  test('has ports on the web server alone, on this machine alone', () => {
    const services = site.compose('ps', '--format', 'json').trim().split('\n').map((line) => JSON.parse(line));
    const published = services.flatMap((service) => service.Publishers.filter((one) => one.PublishedPort > 0).map((one) => ({ ...one, service: service.Service })));
    assert.equal(published.length, 4);
    for (const one of published) {
      assert.equal(one.service, 'web');
      assert.equal(one.URL, '127.0.0.1');
    }
  });

  test('runs every container locked down, with no one holding Docker\'s socket', () => {
    const ids = site.compose('ps', '--all', '--quiet').trim().split('\n');
    assert.ok(ids.length >= 5);
    for (const id of ids) {
      const { Name: name, HostConfig: host, Config: config, Mounts: mounts } = inspect(id);
      assert.equal(host.ReadonlyRootfs, true, `${name} read-only`);
      assert.deepEqual(host.CapDrop, ['ALL'], `${name} capabilities`);
      assert.deepEqual(host.CapAdd, null, `${name} adds none`);
      assert.ok(host.SecurityOpt.includes('no-new-privileges:true'), `${name} no new privileges`);
      assert.ok(host.Memory > 0, `${name} memory limit`);
      assert.ok(host.PidsLimit > 0, `${name} process limit`);
      assert.ok(!['', 'root', '0'].includes(config.User.split(':')[0]), `${name} runs as ${config.User || 'root'}`);
      for (const mount of mounts) assert.doesNotMatch(mount.Source, /docker\.sock/, name);
    }
  });

  test('keeps Forgejo closed at the proxy, but for what signing in and saving need', async () => {
    const status = async (path) => (await fetch(`${site.origin.git}${path}`, { redirect: 'manual' })).status;
    for (const path of [
      '/',
      '/explore/repos',
      '/explore/users',
      '/user/sign_up',
      '/user/settings',
      '/user/settings/applications',
      '/admin',
      '/api/swagger',
      '/konzilo',
      `/${site.name}`,
      `/${site.name}/source`,
      `/${site.name}/source/settings`,
      `/${site.name}/source.git/info/refs?service=git-upload-pack`,
      '/metrics',
    ]) {
      assert.equal(await status(path), 404, path);
    }
    for (const path of ['/user/login', '/user/forgot_password', '/user/recover_account', '/api/healthz']) {
      assert.equal(await status(path), 200, path);
    }
  });

  test('makes no token through the proxy, however the address is written', async () => {
    const authorization = `Basic ${Buffer.from('anna:local-only-account-password').toString('base64')}`;
    for (const path of [
      '/api/v1/users/anna/tokens',
      '/API/v1/users/anna/tokens',
      '/api/v1/USERS/anna/tokens',
      '/api//v1/users/anna/tokens',
      '/api/v1//users/anna/tokens',
      '/api/v1/users/anna/tokens/',
      '/api/v1/users/anna%2Ftokens',
      '/api/v1/./users/anna/tokens',
      '/api/v1/user/applications/oauth2',
      '/api/v1/user/keys',
      '/api/v1/user/gpg_keys',
    ]) {
      const answer = await fetch(`${site.origin.git}${path}`, {
        method: 'POST',
        headers: { authorization, 'x-forgejo-otp': site.code(), 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'stolen', scopes: ['write:repository'] }),
      });
      assert.notEqual(answer.status, 201, path);
      assert.ok(answer.status >= 400, `${path}: ${answer.status}`);
    }
  });

  test('gives a password alone nothing', async () => {
    const answer = await fetch(`${site.origin.git}/api/v1/user`, {
      headers: { authorization: `Basic ${Buffer.from('anna:local-only-account-password').toString('base64')}` },
    });
    assert.ok([401, 403].includes(answer.status), String(answer.status));
  });

  test('prints the account\'s code, six digits', () => {
    assert.match(site.code(), /^\d{6}$/);
  });

  test('holds the demo content as source files, media in LFS', async () => {
    const articles = await api(`${repository()}/contents/articles`);
    assert.equal(articles.length, 6);
    for (const file of articles) assert.match(file.name, /^[0-9a-f]{12}\.md$/);
    const media = await api(`${repository()}/contents/media`);
    assert.ok(media.length > 0);
    const read = (kind) => fetch(`${site.origin.git}/api/v1${repository()}/${kind}/media/${media[0].name}`, { headers: { authorization: `token ${token}` } });
    const pointer = await read('raw');
    assert.equal(pointer.status, 200);
    assert.match(await pointer.text(), /^version https:\/\/git-lfs/, 'Git holds a pointer');
    const image = await read('media');
    assert.equal(image.status, 200);
    assert.ok((await image.arrayBuffer()).byteLength > 1000, 'and LFS the file');
    const lfs = await api(`${repository()}/contents/.gitattributes`);
    assert.match(Buffer.from(lfs.content, 'base64').toString(), /media\/\*\* filter=lfs/);
  });

  test('gives the account write access through its team, and no ownership, and Reviewers a team that reads', async () => {
    const teams = await api(`/orgs/${site.name}/teams`);
    assert.deepEqual(teams.map((team) => team.name).sort(), ['Owners', 'admins', 'editors', 'reviewers']);
    const permission = (name) => teams.find((team) => team.name === name).permission;
    assert.equal(permission('admins'), 'write');
    assert.equal(permission('editors'), 'write');
    assert.equal(permission('reviewers'), 'read');
    const member = (name) => api(`/teams/${teams.find((team) => team.name === name).id}/members`);
    assert.deepEqual((await member('admins')).map((user) => user.login), ['anna']);
    assert.deepEqual((await member('Owners')).map((user) => user.login), ['konzilo']);
  });

  // Each engine edits a post of its own, so that the order they run in does not matter.
  const POST_OF = { chromium: 'Patient rivers and the meadow', firefox: 'Golden harbours and the harbour', webkit: 'Hidden meadows and the bridge' };
  // And an image of its own, or the second to upload would bring the same file.
  const ENGINE_COLOURS = { chromium: '#aa3322', firefox: '#22aa33', webkit: '#2233aa' };

  for (const engine of Object.keys(ENGINES)) {
    describe(engine, () => {
      let session;

      before(async () => {
        session = await openEditor(engine, site);
      });

      after(() => session?.browser.close());

      test('offers no sign-in with a token', async () => {
        await session.page.getByRole('button', { name: /Forgejo/ }).waitFor();
        assert.equal(await session.page.getByRole('button', { name: /token/i }).count(), 0);
      });

      test('signs in with both factors, and answers the consent page by itself', async () => {
        await signIn(session, site);
        await session.page.getByText('Articles').first().waitFor();
        await session.page.getByText('Quiet harbours and the lantern').waitFor();
      });

      test('saves a change to a post, as the person signed in', async () => {
        const title = `A title saved in ${engine}`;
        const { page } = session;
        const before = await fileNamed('articles', POST_OF[engine]);
        await page.getByText(POST_OF[engine]).first().click();
        // An article's working name, and its main headline, which its page shows.
        const field = page.getByRole('textbox', { name: 'Working name' });
        await field.waitFor();
        await field.fill(title);
        await page.getByRole('textbox', { name: 'Main headline' }).fill(title);
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        // "Saved" on screen is no proof, so ask Forgejo.
        const deadline = Date.now() + 30_000;
        let saved = null;
        while (saved === null && Date.now() < deadline) {
          saved = await fileNamed('articles', title);
          if (saved === null) await page.waitForTimeout(500);
        }
        assert.ok(saved, 'the title reached the repository');
        assert.equal(saved.path, before.path, 'a post keeps its file');
        const [commit] = await api(`${repository()}/commits?path=${saved.path}&limit=1`);
        assert.equal(commit.author?.login ?? commit.commit.author.name, 'anna');
      });

      test('shows it to visitors within a minute, and says so', async () => {
        const title = `A title saved in ${engine}`;
        const saved = await fileNamed('articles', title);
        assert.match(await onTheSite(addressOf(saved.text), title), new RegExp(title));
        const { page } = session;
        // An article's form has no publishing row (ADR 0071): the Publishing page says how it
        // stands, and its page opens from beside its slug.
        await page.goto(`${site.origin.admin}/#/collections/articles`);
        await page.getByRole('radio', { name: 'Publishing' }).click();
        await page.getByRole('row', { name: new RegExp(title) }).getByText('Live on the site.').waitFor({ timeout: 30_000 });
        await openArticle(page, title);
        const link = page.getByRole('link', { name: 'Show the page ↗', exact: true });
        assert.equal(await link.getAttribute('href'), `${site.origin.site}${addressOf(saved.text)}`);
        assert.equal(await page.locator('section.field[data-key-path="publishing"]').count(), 0, 'with no publishing row in its form');
        assert.doesNotMatch((await fileNamed('articles', title)).text, /publishing/, 'and nothing of it in the file');
        await page.goBack();
      });

      test('leaves a body alone when it is only opened and clicked in', async () => {
        const { page } = session;
        await page.getByText(`A title saved in ${engine}`).first().click();
        const editor = page.locator('.konzilo-body-visual .ProseMirror');
        await editor.waitFor({ timeout: 30_000 });
        // The field goes on without its check if it does not load, so nothing else would tell.
        assert.equal(await page.locator('.konzilo-body-note:visible').count(), 0, 'the early check is on');
        await page.getByRole('button', { name: 'Save', exact: true }).waitFor();
        await editor.click();
        await page.getByRole('textbox', { name: 'Working name' }).click();
        await page.waitForTimeout(300);
        assert.equal(await page.getByRole('button', { name: 'Save', exact: true }).isDisabled(), true, 'nothing to save');
      });

      test('saves text typed and made bold in the body, and the intake takes it', async () => {
        const { page } = session;
        const word = `typed${engine}`;
        const editor = page.locator('.konzilo-body-visual .ProseMirror');
        await editor.locator('p').first().click();
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowUp' : 'Control+Home');
        await page.keyboard.type(`${word} `, { delay: 30 });
        await page.waitForTimeout(100);
        await editor.locator('p').first().evaluate((paragraph, text) => {
          const node = paragraph.firstChild;
          const range = document.createRange();
          range.setStart(node, 0);
          range.setEnd(node, text.length);
          const selection = document.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }, word);
        await page.waitForTimeout(100);
        await page.keyboard.press(`${process.platform === 'darwin' ? 'Meta' : 'Control'}+b`);
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        const saved = await fileNamed('articles', `A title saved in ${engine}`);
        const text = await waitForFile(page, saved.path, (held) => held.includes(`**${word}**`));
        assert.match(text, new RegExp(`\\*\\*${word}\\*\\* `), 'the file holds the bold text');
        const commit = await lastCommit(saved.path);
        assert.equal(commit.author?.login ?? commit.commit.author.name, 'anna');
        const taken = await throughIntake();
        assert.deepEqual(taken.refusals.map((refusal) => refusal.message), [], 'the intake refuses nothing');
        assert.ok(taken.files.some(({ path, contents }) => path.endsWith('.md') && String(contents).includes(`**${word}**`)), 'and publishes the text');
      });

      test('chooses an image from the library with its texts, changes them in the post alone, and a visitor sees it', async () => {
        const { page } = session;
        const title = `A title saved in ${engine}`;
        // Two pictures can be described alike, and a person tells them apart by looking. An engine
        // before this one has uploaded an entry with a caption, which what is typed here would join.
        const entries = await libraryEntries();
        const entry = entries.find(({ alt, caption }) => !caption && entries.filter((other) => other.alt === alt).length === 1);
        await openArticle(page, title);
        const chooser = await openChooser(page);
        const choice = chooser.getByRole('button', { name: entry.alt, exact: true });
        await choice.waitFor({ timeout: 30_000 });
        await page.waitForFunction(() => [...document.querySelectorAll('.konzilo-chooser-item img')].some((image) => image.complete && image.naturalWidth > 0), null, { timeout: 30_000 });
        await choice.click();
        const image = page.locator(`.konzilo-image[data-src="${entry.src}"]`).last();
        await image.locator('.konzilo-image-picture[data-state="shown"]').waitFor({ timeout: 30_000 });
        assert.equal(await shows(image.locator('img')), true);
        const own = `${entry.alt}, as ${engine} has it`;
        await image.getByRole('button', { name: 'Edit the image' }).click();
        const editing = page.getByRole('dialog', { name: 'Edit the image' });
        const held = editing.getByRole('textbox', { name: 'Alt text' });
        assert.equal(await held.inputValue(), entry.alt);
        assert.notEqual(await held.evaluate((input) => getComputedStyle(input).caretColor), 'rgba(0, 0, 0, 0)', 'with a caret to write at');
        await held.fill(own);
        await editing.getByRole('button', { name: 'Done' }).click();
        await editing.waitFor({ state: 'detached' });
        await image.locator('.konzilo-image-caption').click();
        await page.keyboard.type(`A caption in ${engine}`, { delay: 20 });
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        const saved = await fileNamed('articles', title);
        const written = `![${own.replaceAll('_', '\\_')}](${entry.src})\\\nA caption in ${engine}`;
        const inTheFile = await waitForFile(page, saved.path, (text) => text.includes(written));
        assert.ok(inTheFile.includes(written), `${written}\nis not in\n${inTheFile}`);
        assert.deepEqual((await libraryEntries()).find(({ place }) => place === entry.place), entry, 'the library keeps its own texts');
        const shown = await onTheSite(addressOf(saved.text), `A caption in ${engine}`);
        const figure = new RegExp(`<figure>\\s*<button[^>]*>\\s*<img[^>]*alt="${own}"[^>]*>\\s*</button>\\s*<figcaption>A caption in ${engine}</figcaption>\\s*</figure>`);
        assert.match(shown, figure);
      });

      test('uploads a new image, which joins the library, becomes the choice, and is published', async () => {
        const { page } = session;
        const title = `A title saved in ${engine}`;
        const bytes = await sharp({ create: { width: 1400, height: 900, channels: 3, background: ENGINE_COLOURS[engine] } }).png().toBuffer();
        await openArticle(page, title);
        const chooser = await openChooser(page);
        await chooser.getByRole('button', { name: 'Upload a new image' }).click();
        await chooser.locator('input[type=file]').setInputFiles({ name: `En ny bild i ${engine}.png`, mimeType: 'image/png', buffer: bytes });
        await chooser.getByRole('textbox', { name: 'Alt text' }).fill(`Uploaded in ${engine}`);
        await chooser.getByRole('textbox', { name: 'Caption' }).fill(`Its caption in ${engine}`);
        await chooser.getByRole('button', { name: 'Upload and use' }).click();
        await chooser.waitFor({ state: 'detached', timeout: 30_000 });

        const entry = (await libraryEntries()).find(({ alt }) => alt === `Uploaded in ${engine}`);
        assert.equal(entry.caption, `Its caption in ${engine}`);
        assert.match(entry.src, new RegExp(`^/media/en-ny-bild-i-${engine}-[0-9a-f]{10}\\.png$`));
        const inGit = await (await get(`${site.origin.git}/api/v1${repository()}/raw${entry.src}`, { headers: { authorization: `token ${token}` } })).text();
        assert.match(inGit, /^version https:\/\/git-lfs/, 'Git holds a pointer');
        const inLfs = await get(`${site.origin.git}/api/v1${repository()}/media${entry.src}`, { headers: { authorization: `token ${token}` } });
        assert.deepEqual(Buffer.from(await inLfs.arrayBuffer()), bytes, 'and LFS the file');
        const commit = await lastCommit(entry.place);
        assert.equal((await lastCommit(entry.src.slice(1))).sha, commit.sha, 'both in one commit');
        assert.equal(commit.author?.login ?? commit.commit.author.name, 'anna');

        const image = page.locator(`.konzilo-image[data-src="${entry.src}"]`);
        assert.equal(await image.locator('.konzilo-image-picture img').getAttribute('alt'), `Uploaded in ${engine}`);
        await image.locator('.konzilo-image-picture[data-state="shown"]').waitFor({ timeout: 30_000 });
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        const saved = await fileNamed('articles', title);
        const written = `![Uploaded in ${engine}](${entry.src})\\\nIts caption in ${engine}`;
        assert.ok((await waitForFile(page, saved.path, (text) => text.includes(written))).includes(written));
        const shown = await onTheSite(addressOf(saved.text), `Its caption in ${engine}`);
        const [, address] = new RegExp(`<img[^>]*src="([^"]+)"[^>]*alt="Uploaded in ${engine}"|<img[^>]*alt="Uploaded in ${engine}"[^>]*src="([^"]+)"`).exec(shown).filter(Boolean);
        const served = await get(`${site.origin.site}${address}`);
        assert.equal(served.status, 200, address);
        assert.match(served.headers.get('content-type'), /^image\//);
      });

      test('makes a gallery from the library, puts it in order, and a visitor sees it', async () => {
        const { page } = session;
        const title = `A title saved in ${engine}`;
        const entries = await libraryEntries();
        const [first, second] = entries.filter(({ alt, caption }) => !caption && entries.filter((other) => other.alt === alt).length === 1);
        await openArticle(page, title);
        const chooser = await openChooser(page, 'gallery', 'Choose images', 'Gallery');
        await chooser.getByRole('button', { name: first.alt, exact: true }).click();
        await chooser.getByRole('button', { name: second.alt, exact: true }).click();
        await chooser.getByRole('button', { name: 'Add 2 images' }).click();
        await chooser.waitFor({ state: 'detached' });

        const gallery = page.locator('.konzilo-gallery-field').last();
        await gallery.locator('.konzilo-image-picture[data-state="shown"]').first().waitFor({ timeout: 30_000 });
        await gallery.getByRole('button', { name: 'Edit the gallery' }).click();
        const editing = page.getByRole('dialog', { name: 'Edit the gallery' });
        assert.notEqual(await editing.getByRole('textbox').first().evaluate((input) => getComputedStyle(input).caretColor), 'rgba(0, 0, 0, 0)', 'with a caret to write at');
        await editing.locator('.konzilo-gallery-row').last().getByRole('button', { name: 'Move earlier' }).click();
        await editing.getByRole('button', { name: 'Done' }).click();
        await editing.waitFor({ state: 'detached' });
        await gallery.locator('.konzilo-gallery-caption').click();
        await page.keyboard.type(`A gallery in ${engine}`, { delay: 20 });
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        const saved = await fileNamed('articles', title);
        const written = `![${second.alt}](${second.src})\n![${first.alt}](${first.src})\nA gallery in ${engine}`;
        const inTheFile = await waitForFile(page, saved.path, (text) => text.includes(written));
        assert.ok(inTheFile.includes(written), `${written}\nis not in\n${inTheFile}`);
        const shown = await onTheSite(addressOf(saved.text), `A gallery in ${engine}`);
        assert.match(shown, new RegExp(`<figure class="konzilo-gallery">.*alt="${second.alt}".*alt="${first.alt}".*<figcaption>A gallery in ${engine}</figcaption>`, 's'));
      });

      test('embeds an address from `/embed`, and a visitor is asked for consent', async () => {
        const { page } = session;
        const title = `A title saved in ${engine}`;
        const video = 'https://www.youtube.com/watch?v=Kz3pQ8vXw1A';
        await openArticle(page, title);
        const adding = await openChooser(page, 'embed', 'Embed content', 'Embed');
        await adding.getByRole('textbox', { name: 'The address' }).fill(video);
        await adding.getByRole('button', { name: 'Done' }).click();
        await adding.waitFor({ state: 'detached' });
        assert.match(await page.locator('.konzilo-embed-field').last().textContent(), /YouTube/);
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        const saved = await fileNamed('articles', title);
        const inTheFile = await waitForFile(page, saved.path, (text) => text.includes(`\n${video}\n`) || text.endsWith(`\n${video}`));
        assert.ok(inTheFile.includes(video), inTheFile);
        const shown = await onTheSite(addressOf(saved.text), 'data-embed="youtube"');
        assert.match(shown, /<figure class="konzilo-embed" data-embed="youtube">/);
      });

      test('shows a visitor its images over the page, and steps through a gallery, by every way there is', async () => {
        const { page } = session;
        const saved = await fileNamed('articles', `A title saved in ${engine}`);
        const address = addressOf(saved.text);
        await onTheSite(address, `A gallery in ${engine}`);
        await page.goto(`${site.origin.site}${address}`);

        const gallery = page.locator('figure.konzilo-gallery').last();
        const large = page.locator('dialog.konzilo-lightbox[open]');
        const previous = large.locator('.konzilo-lightbox-previous');
        const next = large.locator('.konzilo-lightbox-next');
        const atPlace = (place) => page.waitForFunction((wanted) => {
          const strip = document.querySelector('dialog.konzilo-lightbox[open] ul');
          return Math.abs(strip.scrollLeft / strip.clientWidth - wanted) < 0.02;
        }, place);
        const locked = () => page.evaluate(() => getComputedStyle(document.documentElement).overflowY === 'hidden');

        await gallery.locator('button.konzilo-lightbox-open').nth(1).click();
        await large.waitFor();
        await atPlace(1);
        assert.equal(await large.evaluate((dialog) => dialog.matches(':modal')), true);
        assert.equal(await locked(), true, 'with the page behind it still');
        assert.equal(await large.evaluate((dialog) => getComputedStyle(dialog, '::backdrop').backgroundColor), 'rgba(0, 0, 0, 0.9)');
        assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'UL', 'with the keys on the strip');

        const picture = large.locator('li').nth(1).locator('img');
        await page.waitForFunction(() => {
          const image = document.querySelectorAll('dialog.konzilo-lightbox[open] li img')[1];
          return image.complete && image.naturalWidth > 0;
        });
        const box = await picture.boundingBox();
        const before = await previous.boundingBox();
        assert.ok(box.height > 300, `as large as it can be: ${box.width} by ${box.height}`);
        assert.ok(before.x + before.width <= box.x, 'with the arrow outside the picture');
        assert.equal(await large.locator('li').nth(1).locator('.konzilo-lightbox-place').textContent(), '2 of 2');
        assert.equal(await next.isVisible(), false, 'and none where there is no more');

        await page.keyboard.press('ArrowLeft');
        await atPlace(0);
        assert.equal(await previous.isVisible(), false);
        await page.keyboard.press('ArrowRight');
        await atPlace(1);
        await previous.click();
        await atPlace(0);
        await next.click();
        await atPlace(1);

        await page.keyboard.press('Escape');
        await large.waitFor({ state: 'hidden' });
        assert.equal(await locked(), false, 'and the page is free again');

        await gallery.locator('button.konzilo-lightbox-open').nth(0).click();
        await large.waitFor();
        await atPlace(0);
        await page.mouse.click(4, 4);
        await large.waitFor({ state: 'hidden' });

        const alone = page.locator(':not(.konzilo-gallery) > figure > button.konzilo-lightbox-open').first();
        await alone.click();
        await large.waitFor();
        assert.equal(await large.locator('.konzilo-lightbox-step').count(), 0, 'a single image has no arrows');
        await large.getByRole('button', { name: 'Close' }).click();
        await large.waitFor({ state: 'hidden' });
      });

      test('chooses authors by name, adds a new one without leaving the form, puts them in order by dragging, and publishes them in that order', async () => {
        const { page } = session;
        const title = `A title saved in ${engine}`;
        const newName = `Author from ${engine}`;
        await openArticle(page, title);
        await bringNear(page, 'group-terms.authors');
        const field = page.locator('section.field[data-key-path="group-terms.authors"]');
        const chips = () => field.locator('.konzilo-authors-name').allTextContents();
        await field.locator('.konzilo-authors-name', { hasText: 'Ines Holm' }).waitFor({ timeout: 30_000 });
        if ((await chips()).includes('Rafael Berg')) {
          await field.getByRole('button', { name: 'Remove Rafael Berg' }).click();
        }
        assert.deepEqual(await chips(), ['Ines Holm']);

        const box = field.getByRole('combobox', { name: 'Authors' });
        await box.click();
        await page.keyboard.type('berg', { delay: 20 });
        await field.getByRole('option', { name: 'Rafael Berg' }).waitFor();
        await page.keyboard.press('Enter');
        assert.deepEqual(await chips(), ['Ines Holm', 'Rafael Berg']);

        await field.getByRole('button', { name: 'Add a new author' }).click();
        const dialog = page.getByRole('dialog', { name: 'A new author' });
        await dialog.getByRole('textbox', { name: 'Name' }).fill(newName);
        await dialog.getByRole('textbox', { name: 'Biography' }).fill(`Writes of ${engine}.`);
        await dialog.getByRole('button', { name: 'Add the author' }).click();
        await dialog.waitFor({ state: 'detached', timeout: 30_000 });
        assert.deepEqual(await chips(), ['Ines Holm', 'Rafael Berg', newName]);
        assert.match(page.url(), /\/entries\//, 'still in the form');

        // Each author by the ID its file is named by, the new one's committed at once.
        const ids = {};
        for (const { path: place, name } of await api(`${repository()}/contents/authors`)) {
          const { content } = await api(`${repository()}/contents/${place}`);
          ids[JSON.parse(Buffer.from(content, 'base64').toString()).name] = name.replace(/\.json$/, '');
        }
        assert.match(ids[newName] ?? '', /^[0-9a-f]{12}$/);
        const made = await lastCommit(`authors/${ids[newName]}.json`);
        assert.equal(made.author?.login ?? made.commit.author.name, 'anna');

        // Clear of the form's toolbar, which stays at the top of the pane as it scrolls.
        await field.locator('.konzilo-authors-chip').first().evaluate((chip) => chip.scrollIntoView({ block: 'center' }));
        const from = await field.locator('.konzilo-authors-chip', { hasText: newName }).boundingBox();
        const to = await field.locator('.konzilo-authors-chip', { hasText: 'Ines Holm' }).boundingBox();
        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 - 8, from.y + from.height / 2 + 2, { steps: 3 });
        await page.mouse.move(to.x + 6, to.y + to.height / 2, { steps: 8 });
        await field.locator('.konzilo-authors-chip[data-drop="before"]').waitFor();
        await page.mouse.up();
        assert.deepEqual(await chips(), [newName, 'Ines Holm', 'Rafael Berg']);
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        const saved = await fileNamed('articles', title);
        const order = [ids[newName], ids['Ines Holm'], ids['Rafael Berg']];
        const inOrder = (text) => order.every((id, at) => text.indexOf(id) !== -1 && (at === 0 || text.indexOf(order[at - 1]) < text.indexOf(id)));
        const text = await waitForFile(page, saved.path, inOrder);
        assert.ok(inOrder(text), `${order.join(', ')} in that order in\n${text}`);
        const taken = await throughIntake();
        assert.deepEqual(taken.refusals.map((refusal) => refusal.message), [], 'the intake refuses nothing');
        const slugs = `authors: ["author-from-${engine}","ines-holm","rafael-berg"]`;
        assert.ok(taken.files.some(({ contents }) => String(contents).includes(`title: "${title}"`) && String(contents).includes(slugs)), `a content file with ${slugs}`);
        const shown = await onTheSite(addressOf(saved.text), newName);
        assert.match(shown, new RegExp(`<p class="meta-line">[^<]*(?:<time [^>]*>[^<]*</time>[^<]*)? by ${newName}, Ines Holm, Rafael Berg</p>`));
      });

      test('asks nothing outside this copy of the site, and breaks no policy', () => {
        assert.deepEqual(session.seen.outside, []);
        assert.deepEqual(session.seen.refused, []);
        assert.deepEqual(session.seen.errors, []);
      });
    });
  }

  describe('the image library', () => {
    test('starts with the pictures the demo content shows', async () => {
      const entries = await libraryEntries();
      assert.ok(entries.length > 0);
      for (const { place, src, alt } of entries) {
        assert.match(place, /^image-library\/[0-9a-f]{12}\.json$/);
        assert.match(src, /^\/media\//);
        assert.ok(alt);
      }
    });

    test('keeps its entries out of what is published', async () => {
      const { tree } = await api(`/repos/${site.name}/content/git/trees/main?recursive=true`);
      assert.ok(tree.length > 0);
      assert.deepEqual(tree.filter(({ path }) => path.startsWith('image-library')), []);
    });

    test('takes a new entry in its own form too, and the chooser finds it; removing it leaves the original', async () => {
      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site);
        const { page } = session;
        await page.getByRole('treeitem', { name: /Image library/ }).click();
        await page.goto(`${site.origin.admin}/#/collections/image-library/new`);
        const bytes = await sharp({ create: { width: 1300, height: 800, channels: 3, background: '#208060' } }).jpeg().toBuffer();
        await page.getByRole('textbox', { name: 'Alt text' }).fill('Made in the form');
        const place = page.locator('.field[data-key-path="src"]');
        await place.locator('input[type=file]').first().setInputFiles({ name: 'from-the-form.jpg', mimeType: 'image/jpeg', buffer: bytes });
        await place.locator('img').waitFor();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        let entry;
        for (const deadline = Date.now() + 30_000; !entry && Date.now() < deadline; await page.waitForTimeout(500)) entry = (await libraryEntries()).find(({ alt }) => alt === 'Made in the form');
        assert.ok(entry, 'the entry reached the repository');
        assert.equal(entry.caption, undefined);
        assert.match(entry.src, /^\/media\/from-the-form-[0-9a-f]{10}\.jpg$/, 'named as the library names an upload');

        // The chooser reads Forgejo for itself, so a post opened now has it.
        await page.goto(`${site.origin.admin}/#/collections/articles/new`);
        await page.locator('.konzilo-body-visual .ProseMirror').waitFor({ timeout: 30_000 });
        await page.locator('.konzilo-body-visual .ProseMirror').click();
        await page.keyboard.type('/image', { delay: 30 });
        await page.locator('.milkdown-slash-menu li.hover', { hasText: 'Image' }).waitFor();
        await page.keyboard.press('Enter');
        const chooser = page.getByRole('dialog', { name: 'Choose an image' });
        await chooser.getByRole('button', { name: 'Made in the form', exact: true }).waitFor({ timeout: 30_000 });
        await page.keyboard.press('Escape');

        await page.goto(`${site.origin.admin}/#/collections/image-library/entries/${entry.place.split('/')[1].replace('.json', '')}`);
        await page.getByRole('button', { name: 'Show Editor Options' }).click();
        await page.getByRole('menuitem', { name: /Delete/ }).click();
        await page.locator('[role=alertdialog] button, [role=dialog] button').filter({ hasText: 'Delete' }).click();
        for (const deadline = Date.now() + 30_000; (await libraryEntries()).some(({ alt }) => alt === 'Made in the form') && Date.now() < deadline;) await page.waitForTimeout(500);
        assert.equal((await libraryEntries()).some(({ alt }) => alt === 'Made in the form'), false, 'the entry went');
        assert.equal((await picture(entry.src.slice('/media/'.length))).status, 404, 'and its original with it, which no other entry names');
        assert.deepEqual(session.seen.refused, []);
        assert.deepEqual(session.seen.outside, []);
      } finally {
        await session.browser.close();
      }
    });

    describe('its small pictures', () => {
      const original = (width, height, format, options = {}) => sharp({ create: { width, height, channels: 3, background: '#334455', ...options } })[format]().toBuffer();
      const brought = async (name, bytes) => saveFile(`media/${name}`, bytes, 'anna');

      test('go only to whoever may write', async () => {
        const [{ src }] = await libraryEntries();
        const name = src.split('/').at(-1);
        assert.equal((await picture(name, {})).status, 401);
        assert.equal((await picture(name, { authorization: 'token nothing-at-all' })).status, 401);
        assert.equal((await get(`${site.origin.site}/_konzilo/thumbnail?of=${encodeURIComponent(name)}`, { headers: { authorization: `token ${token}` } })).status, 404, 'and only on the editor\'s host');
      });

      test('are small, whatever the original, within what the service may use', async () => {
        const large = await original(6000, 4000, 'jpeg', { noise: { type: 'gaussian', mean: 128, sigma: 30 } });
        assert.ok(large.length > 5_000_000, `${large.length} bytes`);
        await brought('a-large-photo.jpg', large);
        const answer = await picture('a-large-photo.jpg');
        assert.equal(answer.status, 200);
        const bytes = Buffer.from(await answer.arrayBuffer());
        assert.equal(answer.headers.get('content-type'), 'image/webp');
        assert.ok(bytes.length < large.length / 10, `${bytes.length} of ${large.length} bytes`);
        const { width } = await sharp(bytes).metadata();
        assert.equal(width, 640);
      });

      test('are made of the largest a file may open up to, within what the service may use', async () => {
        await brought('opens-up-large.png', await original(9900, 9900, 'png'));
        const answer = await picture('opens-up-large.png');
        assert.equal(answer.status, 200);
        assert.equal((await sharp(Buffer.from(await answer.arrayBuffer())).metadata()).width, 640);
      });

      test('are none of a file that opens up larger than that, and the service stays', async () => {
        await brought('opens-up-huge.png', await original(12_000, 12_000, 'png'));
        assert.equal((await picture('opens-up-huge.png')).status, 415);
        const [{ src }] = await libraryEntries();
        assert.equal((await picture(src.split('/').at(-1))).status, 200);
      });
    });
  });

  describe('in Swedish', () => {
    test('speaks the site\'s interface language in a browser in another, and the editor\'s own once chosen, on files it holds itself', async () => {
      const session = await openEditor('chromium', site, { locale: 'sv-SE' });
      try {
        await session.page.getByRole('button', { name: /Sign In with/ }).waitFor();
        await session.page.evaluate(() => localStorage.setItem('sveltia-cms.prefs', JSON.stringify({ locale: 'sv' })));
        await session.page.reload();
        await session.page.getByRole('button', { name: /Logga in med/ }).waitFor();
        assert.deepEqual(session.seen.outside, []);
      } finally {
        await session.browser.close();
      }
    });
  });

  describe('a body the site cannot publish', () => {
    test('is refused in the browser with the reason, makes no commit, loses no text, and saves once it is fixed', async () => {
      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site);
        const { page } = session;
        const reader = page.waitForResponse((response) => response.url().endsWith('.wasm'));
        await page.getByText('Northern islands and the meadow').first().click();
        assert.equal((await reader).headers()['content-encoding'] !== undefined, true, 'its 3 MB of WebAssembly travel compressed');
        await page.getByRole('button', { name: 'Show Markdown' }).click();
        const source = page.locator('.konzilo-body-source');
        const was = await source.inputValue();
        await source.fill(`# A title in the body\n\n${was}`);
        const { path } = await fileNamed('articles', 'Northern islands and the meadow');
        const before = await lastCommit(path);
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        const dialog = page.getByRole('alertdialog');
        await dialog.getByText('The site cannot publish this, so nothing has been saved').waitFor();
        await dialog.getByText('level 1', { exact: false }).waitFor();
        assert.equal(await dialog.getByText('Please try again later').count(), 0);
        assert.equal((await lastCommit(path)).sha, before.sha, 'no commit');
        await dialog.getByRole('button', { name: 'OK' }).click();
        assert.equal(await source.inputValue(), `# A title in the body\n\n${was}`, 'the editor\'s text is all there');

        await source.fill(`## A heading in the body\n\n${was}`);
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        const text = await waitForFile(page, path, (held) => held.includes('## A heading in the body'));
        assert.match(text, /^## A heading in the body$/m);
        assert.notEqual((await lastCommit(path)).sha, before.sha);
        assert.deepEqual(session.seen.outside, []);
        assert.deepEqual(session.seen.refused, []);
      } finally {
        await session.browser.close();
      }
    });
  });

  describe('search and sharing', () => {
    // An article whose file holds no search yet, so that the group is made at Save (ADR 0029).
    test('are saved in the groups an editor sees, also in a post whose file holds none, and the intake publishes them as one map', async () => {
      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site);
        const { page } = session;
        await page.getByText('Quiet harbours and the lantern').first().click();
        await page.locator('.konzilo-body-visual .ProseMirror').waitFor({ timeout: 30_000 });
        // What holds something is open already, and a click would close it. A long form
        // renders what is below the window as it comes near, so each group is brought near,
        // and each bar goes to the top.
        const open = async (name) => {
          await bringNear(page, name.toLowerCase());
          const bar = page.locator('button[aria-expanded]', { hasText: name }).first();
          if (await bar.getAttribute('aria-expanded') === 'false') await bar.click();
          await bar.evaluate((element) => element.scrollIntoView({ block: 'start' }));
        };
        await open('Search');
        await page.getByRole('textbox', { name: 'Title tag' }).fill('A title tag in parts');
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        const { path } = await fileNamed('articles', 'Quiet harbours and the lantern');
        const text = await waitForFile(page, path, (held) => held.includes('A title tag in parts'));
        assert.match(text, /^search:\n {2}title: A title tag in parts\n(?! )/m);
        const taken = await throughIntake();
        assert.deepEqual(taken.refusals.map((refusal) => refusal.message), []);
        assert.ok(taken.files.some(({ contents }) => String(contents).includes('seo: {"title":"A title tag in parts"')), 'and publishes the title tag');
      } finally {
        await session.browser.close();
      }
    });
  });

  describe('a new post', () => {
    test('is a draft, in a file named by an ID, with its references by ID', async () => {
      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site);
        const { page } = session;
        await page.getByRole('button', { name: 'Create New Entry' }).click();
        await page.getByRole('textbox', { name: 'Working name' }).fill('A new post');
        await page.getByRole('textbox', { name: 'Main headline' }).fill('A new post');
        // An article's one category, in a field Sveltia renders as it comes near.
        await bringNear(page, 'group-terms.category');
        await page.getByRole('radio', { name: 'Kitchens' }).first().click();
        await page.getByRole('button', { name: 'Save', exact: true }).click();
        const deadline = Date.now() + 30_000;
        let saved = null;
        while (saved === null && Date.now() < deadline) {
          saved = await fileNamed('articles', 'A new post');
          if (saved === null) await page.waitForTimeout(500);
        }
        assert.ok(saved, 'the post reached the repository');
        assert.match(saved.path, /^articles\/[0-9a-f]{12}\.md$/);
        assert.match(saved.text, /^status: draft$/m);
        assert.match(saved.text, /^category: "?[0-9a-f]{12}"?$/m);
        assert.doesNotMatch(saved.text, /^seo:/m, 'closed parts leave nothing in the file');
      } finally {
        await session.browser.close();
      }
    });
  });

  // A visitor sends the demo's contact form (ADR 0044, ADR 0045): the web server passes it to the
  // service in its role for visitors, which keeps it in the service's data.
  describe('a visitor\'s form', () => {
    const CONTACT = '/pages/contact/';
    const OUTCOME = '#konzilo-form-contact-sent';
    // The address the service is told the visitor has, as the web server saw it.
    let visitor = null;

    // What the service keeps of the contact form, newest first, read through its store in its
    // own container.
    const kept = () => JSON.parse(site.compose('exec', '-T', 'visitors', 'node', '--no-warnings', '--input-type=module', '-e', [
      "import { openStore } from '/konzilo/src/service/store.js';",
      "const store = openStore('/service-data/service.sqlite');",
      "console.log(JSON.stringify(store.submissions('contact')));",
      'store.close();',
    ].join('\n')));
    const message = (submission) => submission.fields.find(({ name }) => name === 'message').value;

    // A request through the web server, every header as given: { status, headers, body, json }.
    const toTheSite = (method, path, { headers = {}, body } = {}) => new Promise((resolve, reject) => {
      const asked = httpRequest(new URL(path, site.origin.site), { method, headers, agent: false }, (answer) => {
        const chunks = [];
        answer.on('data', (chunk) => chunks.push(chunk));
        answer.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            // Not JSON.
          }
          resolve({ status: answer.statusCode, headers: answer.headers, body: text, json });
        });
      });
      asked.on('error', reject);
      asked.end(body);
    });
    // As the page's script sends from a page of the site's own.
    const fromThePage = () => ({ 'Sec-Fetch-Site': 'same-origin', Origin: site.origin.site, Accept: 'application/json' });
    const tokenOf = async () => (await toTheSite('GET', '/_konzilo/forms/contact/token', { headers: fromThePage() })).json.token;
    const sendJson = (fields, headers = fromThePage()) => toTheSite('POST', '/_konzilo/forms/contact', {
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ _page: CONTACT, _website: '', ...fields }),
    });
    const filledIn = { name: 'Ada Lovelace', email: 'ada@example.com', privacy: true };
    const wait = (ms) => new Promise((go) => setTimeout(go, ms));

    // The contact page in a browser of `engine`, with JavaScript or without, its form filled in
    // as a visitor fills it, with `words` for a message, and sent.
    const sendInBrowser = async (engine, { javaScript, words }) => {
      const browser = await ENGINES[engine].launch();
      try {
        const context = await browser.newContext({ javaScriptEnabled: javaScript, locale: 'en-GB', viewport: { width: 1280, height: 1600 } });
        const page = await context.newPage();
        const refused = [];
        page.on('console', (line) => {
          if (/content.security.policy|refused to/i.test(line.text())) refused.push(line.text());
        });
        await page.goto(`${site.origin.site}${CONTACT}`);
        // The form comes into use, and its script asks for its token; a person takes a while.
        await page.locator('[name="name"]').fill(`Ada in ${engine}`);
        await page.locator('[name="email"]').fill('ada@example.com');
        await page.locator('[name="message"]').fill(words);
        await page.locator('[name="privacy"]').check();
        if (javaScript) await page.waitForTimeout(3500);
        await page.getByRole('button', { name: 'Send' }).click();
        if (!javaScript) await page.waitForURL(`**${CONTACT}${OUTCOME}`);
        const outcome = page.locator(OUTCOME);
        await outcome.waitFor({ state: 'visible' });
        assert.equal((await outcome.textContent()).trim(), 'Thank you. Your message has been sent.', `${engine}: ${words}`);
        if (javaScript) assert.equal(new URL(page.url()).hash, '', 'sent in place');
        assert.deepEqual(refused, [], `${engine}: ${words}`);
      } finally {
        await browser.close();
      }
    };

    test('is sent with JavaScript and without in every engine, says each time that it was sent, and is kept with its labels and language', async () => {
      const sent = [];
      for (const engine of Object.keys(ENGINES)) {
        for (const javaScript of [true, false]) {
          const words = `Sent from ${engine} ${javaScript ? 'with' : 'without'} JavaScript.`;
          await sendInBrowser(engine, { javaScript, words });
          sent.push(words);
        }
      }
      const submissions = kept();
      assert.deepEqual(submissions.map(message).reverse(), sent);
      for (const submission of submissions) {
        assert.equal(submission.spam, null, message(submission));
        assert.equal(submission.language, 'en-GB');
        assert.deepEqual(submission.fields.map(({ label }) => label), ['Name', 'Email', 'Message', 'I have read the privacy policy']);
        assert.equal(submission.fields.at(-1).value, true);
      }
    }, { timeout: 300_000 });

    test('refuses a field left out, a field it does not declare, a value too long, a missing token and another site\'s page, and holds the trap and a token too fresh as spam', async () => {
      const token = await tokenOf();
      assert.match(token, /^[0-9]+\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{43}$/);
      await wait(3500);
      const answers = {
        missing: await sendJson({ ...filledIn, _token: token, message: '' }),
        unknown: await sendJson({ ...filledIn, _token: token, message: 'Hello', company: 'Lovelace AB' }),
        long: await sendJson({ ...filledIn, _token: token, message: 'Hello', name: 'A'.repeat(201) }),
        tokenless: await sendJson({ ...filledIn, message: 'Without a token' }),
        elsewhere: await sendJson({ ...filledIn, _token: token, message: 'From elsewhere' }, { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://elsewhere.example' }),
        trap: await sendJson({ ...filledIn, _token: token, message: 'Caught in the trap', _website: 'https://spam.example' }),
      };
      // A token given a moment ago.
      const tooFresh = await sendJson({ ...filledIn, _token: await tokenOf(), message: 'Too fresh' });
      const said = Object.fromEntries(Object.entries({ ...answers, tooFresh }).map(([why, { status, json }]) => [why, [status, json]]));
      assert.deepEqual(said, {
        missing: [400, { outcome: 'invalid', fields: { message: 'missing' } }],
        unknown: [400, { outcome: 'refused' }],
        long: [400, { outcome: 'invalid', fields: { name: 'too-long' } }],
        tokenless: [403, { outcome: 'refused' }],
        elsewhere: [403, { outcome: 'refused' }],
        trap: [200, { outcome: 'sent' }],
        tooFresh: [200, { outcome: 'sent' }],
      });
      const [last, before] = kept();
      assert.deepEqual([[message(last), last.spam], [message(before), before.spam]], [['Too fresh', 'too-soon'], ['Caught in the trap', 'trap']]);
    });

    // What the two tests before sent through the site's form, read on the Submissions page by the
    // account signed in, in the site's interface language and in the other, and downloaded as CSV
    // by the separator each offers (ADR 0045); the spam they held is in neither.
    test('shows what was sent on the Submissions page to the account signed in, in both interface languages, spam left out, and downloads it as CSV by each separator', async () => {
      const sentWords = kept().filter(({ spam }) => spam === null).map(message);
      const spamWords = kept().filter(({ spam }) => spam !== null).map(message);
      assert.ok(sentWords.length > 0 && spamWords.length > 0, 'something sent, and spam to leave out');

      for (const path of ['/_konzilo/submissions', '/_konzilo/submissions/contact', '/_konzilo/submissions/contact.csv?separator=comma']) {
        assert.equal((await get(`${site.origin.admin}${path}`)).status, 401, path);
        assert.equal((await get(`${site.origin.admin}${path}`, { headers: { authorization: 'token nothing-at-all' } })).status, 401, path);
        assert.equal((await get(`${site.origin.site}${path}`, { headers: { authorization: `token ${token}` } })).status, 404, `${path}, on the editor's host alone`);
      }
      const { forms } = await (await get(`${site.origin.admin}/_konzilo/submissions`, { headers: { authorization: `token ${token}` } })).json();
      assert.deepEqual(forms, [{ name: 'contact', label: 'Contact us', count: sentWords.length }]);

      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site);
        const { page } = session;
        const read = async ({ name, form, separator, by, download, sentAt, formColumn, yes }) => {
          await page.getByRole('radio', { name, exact: true }).click();
          await page.getByRole('combobox', { name: form }).waitFor();
          for (const words of sentWords) await page.getByText(words, { exact: true }).waitFor();
          for (const words of spamWords) assert.equal(await page.getByText(words).count(), 0, words);
          assert.equal(await page.getByRole('radio', { name: separator, exact: true }).isChecked(), true, `${separator}, offered by the interface language`);
          const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: download }).click()]);
          assert.match(file.suggestedFilename(), /^contact-\d{4}-\d\d-\d\d\.csv$/);
          const bytes = readFileSync(await file.path());
          assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'UTF-8 with a byte-order mark');
          const text = bytes.toString('utf8');
          assert.doesNotMatch(text, /[^\r]\n/, 'every row ended by CRLF');
          const [header, ...rows] = readCsv(text, by);
          // The moments are in the browser's time zone, which the page and the file both name.
          const zone = await page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
          await page.getByText(`${sentAt} (${zone})`, { exact: true }).first().waitFor();
          assert.deepEqual(header, [`${sentAt} (${zone})`, formColumn, 'Name', 'Email', 'Message', 'I have read the privacy policy']);
          assert.deepEqual(rows.map((row) => row[4]), sentWords, 'newest first, spam left out');
          for (const row of rows) {
            assert.match(row[0], /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
            assert.deepEqual([row[1], row[5]], ['Contact us', yes]);
          }
        };
        await read({ name: 'Submissions', form: 'Form', separator: 'Commas', by: ',', download: 'Download as CSV', sentAt: 'Sent at', formColumn: 'Form', yes: 'Yes' });
        await page.evaluate(() => localStorage.setItem('sveltia-cms.prefs', JSON.stringify({ ...JSON.parse(localStorage.getItem('sveltia-cms.prefs') ?? '{}'), locale: 'sv' })));
        await page.reload();
        await read({ name: 'Inskick', form: 'Formulär', separator: 'Semikolon', by: ';', download: 'Ladda ned som CSV', sentAt: 'Skickat', formColumn: 'Formulär', yes: 'Ja' });
        assert.deepEqual(session.seen.outside, []);
        assert.deepEqual(session.seen.refused, []);
        assert.deepEqual(session.seen.errors, []);
      } finally {
        await session.browser.close();
      }
    }, { timeout: 300_000 });

    // Mail (ADR 0003, ADR 0045): off until an Admin turns it on, on the Mail page, with each form's
    // recipients, which the service keeps and no file of the source holds; and then each
    // submission once, in its page's language, which this local copy writes to the service's log
    // and sends nowhere.
    test('mails nothing until an Admin turns mail on, on the Mail page, and then each submission to its form\'s recipients, which a local copy writes to its log and sends nowhere', async () => {
      const RECIPIENTS = ['recipient-one@example.com', 'recipient-two@example.com'];
      const LOCAL = 'A local copy sends no mail.';
      const mailLog = () => site.compose('logs', '--no-color', 'editors').split('\n').map((line) => line.replace(/^[^|]*\| ?/, '')).join('\n');
      // How each of the contact form's submissions stands, read from the service's data.
      const mailOf = () => JSON.parse(site.compose('exec', '-T', 'editors', 'node', '--no-warnings', '--input-type=module', '-e', [
        "import { DatabaseSync } from 'node:sqlite';",
        "const data = new DatabaseSync('/service-data/service.sqlite', { readOnly: true });",
        "console.log(JSON.stringify(data.prepare(\"SELECT fields, spam, mail FROM submission WHERE form = 'contact' ORDER BY id\").all().map(({ fields, spam, mail }) => ({ message: JSON.parse(fields).find(({ name }) => name === 'message').value, spam, mail }))));",
      ].join('\n')));
      const settled = async (holds, within = 30_000) => {
        const deadline = Date.now() + within;
        for (let held = mailOf(); ; held = mailOf()) {
          if (holds(held) || Date.now() > deadline) return held;
          await wait(500);
        }
      };

      assert.equal((await get(`${site.origin.admin}/_konzilo/mail`)).status, 401);
      assert.equal((await get(`${site.origin.site}/_konzilo/mail`, { headers: { authorization: `token ${token}` } })).status, 404, 'on the editor\'s host alone');
      const off = await (await get(`${site.origin.admin}/_konzilo/mail`, { headers: { authorization: `token ${token}` } })).json();
      assert.deepEqual([off.local, off.adapter, off.forms], [true, 'none', [{ name: 'contact', label: 'Contact us', recipients: [], retention: 30 }]]);

      const formToken = await tokenOf();
      await wait(3500);
      assert.equal((await sendJson({ ...filledIn, _token: formToken, message: 'Sent before mail was on.' })).json.outcome, 'sent');
      const before = await settled((held) => held.every(({ mail }) => mail !== 'pending'));
      assert.equal(before.at(-1).message, 'Sent before mail was on.');
      for (const { message: words, spam, mail } of before) assert.equal(mail, spam === null ? 'off' : null, `${words}: mailed to no one while mail is off, and spam never`);
      assert.ok(!mailLog().includes(LOCAL));

      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site);
        const { page } = session;
        await page.getByRole('radio', { name: 'Mail', exact: true }).click();
        await page.getByText('This is a local copy: it sends no mail').waitFor();
        await page.getByRole('radio', { name: 'By SMTP, through a mail server' }).check();
        await page.getByLabel('Mail server', { exact: true }).fill('smtp.invalid');
        await page.getByLabel('Port', { exact: true }).fill('587');
        await page.getByLabel('Username', { exact: true }).fill('site@example.com');
        await page.getByLabel('Password', { exact: true }).fill('a secret');
        await page.getByLabel('Sender\'s address', { exact: true }).fill('site@example.com');
        const recipients = () => page.getByRole('group', { name: 'Contact us', exact: true }).getByLabel('Recipients', { exact: true });
        await recipients().fill(RECIPIENTS.join('\n'));
        await page.getByRole('button', { name: 'Save' }).click();
        await page.getByText('Saved.', { exact: true }).waitFor();
        await page.reload();
        await page.getByRole('radio', { name: 'Mail', exact: true }).click();
        await recipients().waitFor();
        assert.equal(await recipients().inputValue(), RECIPIENTS.join('\n'));
        assert.equal(await page.getByLabel('Password', { exact: true }).getAttribute('placeholder'), 'Kept: leave it empty to keep it');
        assert.equal(await page.getByLabel('Password', { exact: true }).inputValue(), '', 'never given back');
        assert.deepEqual(session.seen.outside, []);
        assert.deepEqual(session.seen.refused, []);
        assert.deepEqual(session.seen.errors, []);
      } finally {
        await session.browser.close();
      }

      const sent = { ...filledIn, name: 'Ada Lovelace', message: 'Sent once mail was on.\nOn two lines.' };
      assert.equal((await sendJson({ ...sent, _token: formToken })).json.outcome, 'sent');
      const after = await settled((held) => held.at(-1).mail === 'sent');
      assert.equal(after.at(-1).mail, 'sent');
      assert.deepEqual(after.slice(0, -1).map(({ mail }) => mail), before.map(({ mail }) => mail), 'nothing kept while mail was off is mailed once it is on');
      const log = mailLog();
      assert.equal(log.split(LOCAL).length - 1, 1, 'one mail');
      const mail = log.slice(log.indexOf(LOCAL));
      assert.match(mail, /^A local copy sends no mail\. This is what it would have sent through smtp\.invalid:587:\nFrom: site@example\.com\nTo: recipient-one@example\.com, recipient-two@example\.com\nReply-To: ada@example\.com\nSubject: New submission: Contact us\nDate: [A-Z][a-z]{2}, \d\d [A-Z][a-z]{2} \d{4} \d\d:\d\d:\d\d \+0000\nContent-Language: en-GB\n\nThis was sent with the form Contact us\.\n\nName\nAda Lovelace\n\nEmail\nada@example\.com\n\nMessage\nSent once mail was on\.\nOn two lines\.\n\nI have read the privacy policy\nYes\n\nEvery submission is on the Submissions page in the editor\.\n/);
      assert.doesNotMatch(log, /could not mail|gave up mailing/);

      // What the Admin set is in no file of the source.
      const { tree } = await api(`${repository()}/git/trees/main?recursive=true`);
      for (const { path: name, type } of tree) {
        if (type !== 'blob' || name.startsWith('media/')) continue;
        const { content } = await api(`${repository()}/contents/${name}`);
        const text = Buffer.from(content, 'base64').toString();
        for (const kept of [...RECIPIENTS, 'smtp.invalid', 'a secret']) assert.ok(!text.includes(kept), `${kept} in ${name}`);
      }
    }, { timeout: 300_000 });

    // Retention (ADR 0044, ADR 0045): each form's submissions kept for the days an Admin sets beside
    // its recipients, 30 until then, and spam for seven, forgotten by the service in its role for
    // editors at its start and each minute; and a person's submissions, which an Admin finds by
    // what they wrote on the Personal data page, downloads and erases, after which no page,
    // download or file of the service holds them.
    test('keeps each form\'s submissions for the days an Admin sets beside its recipients, and spam for seven, also across a restart, and lets an Admin find, download and erase a person\'s', async () => {
      const DAY = 24 * 60 * 60_000;
      const daysAgo = (days) => new Date(Date.now() - days * DAY).toISOString();
      const submission = (days, words, { name = 'Ada Lovelace', email = 'ada@example.com', spam = null } = {}) => ({
        form: 'contact',
        sentAt: daysAgo(days),
        language: 'en-GB',
        spam,
        fields: [
          { name: 'name', label: 'Name', value: name },
          { name: 'email', label: 'Email', value: email },
          { name: 'message', label: 'Message', value: words },
          { name: 'privacy', label: 'I have read the privacy policy', value: true },
        ],
      });
      // Kept in the service's data as the role for visitors keeps a submission, at the moment given.
      const keepDirectly = (submissions) => site.compose('exec', '-T', 'visitors', 'node', '--no-warnings', '--input-type=module', '-e', [
        "import { openStore } from '/konzilo/src/service/store.js';",
        "const store = openStore('/service-data/service.sqlite');",
        `for (const one of ${JSON.stringify(submissions)}) store.keep({ ...one, sentAt: new Date(one.sentAt) });`,
        'store.close();',
      ].join('\n'));
      const messages = () => kept().map(message);
      const dataFiles = () => site.compose('exec', '-T', 'editors', 'sh', '-c', 'cat /service-data/*');

      // What grew too old while the service for editors was stopped is gone once it starts.
      site.compose('stop', 'editors');
      try {
        keepDirectly([
          submission(40, 'Forty days old'),
          submission(11, 'Eleven days old'),
          submission(8, 'Spam of eight days', { spam: 'trap' }),
          submission(6, 'Spam of six days', { spam: 'trap' }),
        ]);
      } finally {
        site.compose('start', 'editors');
        await healthy('editors');
      }
      const restarted = messages();
      for (const words of ['Forty days old', 'Spam of eight days']) assert.ok(!restarted.includes(words), `${words}: gone`);
      for (const words of ['Eleven days old', 'Spam of six days']) assert.ok(restarted.includes(words), `${words}: kept`);
      assert.ok(!dataFiles().includes('Forty days old'), 'and nothing of it left in the service\'s data');

      keepDirectly([
        submission(2, 'Grace\'s first message', { name: 'Grace Hopper', email: 'grace@example.com' }),
        submission(1, 'Grace\'s second message', { name: 'Grace Hopper', email: 'Grace@Example.com' }),
        submission(1, 'Someone else\'s message', { name: 'Linus', email: 'linus@example.com' }),
      ]);

      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site);
        const { page } = session;

        // The days an Admin sets beside a form's recipients, and what is older is gone at once.
        await page.getByRole('radio', { name: 'Mail', exact: true }).click();
        const days = () => page.getByRole('group', { name: 'Contact us', exact: true }).getByLabel('Days kept', { exact: true });
        assert.equal(await days().inputValue(), '30');
        await days().fill('10');
        await page.getByRole('button', { name: 'Save' }).click();
        await page.getByText('Saved.', { exact: true }).waitFor();
        await page.reload();
        await page.getByRole('radio', { name: 'Mail', exact: true }).click();
        await days().waitFor();
        assert.equal(await days().inputValue(), '10');
        assert.ok(!messages().includes('Eleven days old'), 'gone with the save');
        assert.ok(messages().includes('Spam of six days'), 'spam kept for seven days, or fewer where its form\'s submissions are');

        // A person's submissions, found by what they wrote in any case, downloaded and erased.
        await page.getByRole('radio', { name: 'Personal data', exact: true }).click();
        await page.getByLabel('What the person wrote', { exact: true }).fill('GRACE@example.com');
        await page.getByRole('button', { name: 'Find', exact: true }).click();
        await page.getByText('Submissions found: 2.').waitFor();
        const found = page.getByRole('checkbox', { name: /^Contact us, / });
        assert.equal(await found.count(), 2);
        for (const box of await found.all()) assert.equal(await box.isChecked(), true, 'each ticked');
        const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as CSV' }).click()]);
        assert.match(file.suggestedFilename(), /^personal-data-\d{4}-\d\d-\d\d\.csv$/);
        const [header, ...rows] = readCsv(readFileSync(await file.path()).toString('utf8'), ',');
        assert.deepEqual(header.slice(1), ['Form', 'Name', 'Email', 'Message', 'I have read the privacy policy']);
        assert.deepEqual(rows.map((row) => row[4]), ['Grace\'s second message', 'Grace\'s first message']);
        await page.getByRole('button', { name: 'Erase those ticked' }).click();
        await page.getByRole('button', { name: 'Erase for good' }).click();
        await page.getByText('Erased: 2.').waitFor();
        await page.getByText('No submission holds that.').waitFor();

        // In no page or download after.
        await page.getByRole('radio', { name: 'Submissions', exact: true }).click();
        await page.getByText('Someone else\'s message', { exact: true }).waitFor();
        assert.equal(await page.getByText(/Grace/).count(), 0);
        const [form] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download as CSV' }).click()]);
        const text = readFileSync(await form.path()).toString('utf8');
        assert.ok(text.includes('Someone else\'s message'));
        assert.doesNotMatch(text, /Grace/);
        assert.deepEqual(session.seen.outside, []);
        assert.deepEqual(session.seen.refused, []);
        assert.deepEqual(session.seen.errors, []);
      } finally {
        await session.browser.close();
      }
      assert.ok(!messages().some((words) => words.startsWith('Grace')));
      assert.ok(!dataFiles().includes('Grace'), 'nothing of it left in the service\'s data');
    }, { timeout: 300_000 });

    // The service mounts the site's folder whole, so that a site description replaced, as Git
    // writes one, reaches both its roles without a restart (ADR 0044).
    test('takes a form its site description declares once the file is replaced, in both of the service\'s roles, without a restart', async () => {
      const file = join(site.directory, 'site-description.json');
      const held = readFileSync(file, 'utf8');
      const replace = (text) => {
        const next = `${file}.next`;
        writeFileSync(next, text);
        renameSync(next, file);
      };
      const declared = JSON.parse(held);
      declared.forms.note = { label: 'A note', fields: [{ name: 'note', label: 'Note', kind: 'textarea', required: true }] };
      const now = async () => ({
        token: (await toTheSite('GET', '/_konzilo/forms/note/token', { headers: fromThePage() })).status,
        listed: (await (await get(`${site.origin.admin}/_konzilo/submissions`, { headers: { authorization: `token ${token}` } })).json()).forms.map(({ name }) => name),
      });
      // What the service says within a few seconds, as the file system tells the container.
      const becomes = async (wanted) => {
        const deadline = Date.now() + 10_000;
        for (let said = await now(); ; said = await now()) {
          if (JSON.stringify(said) === JSON.stringify(wanted) || Date.now() > deadline) return said;
          await wait(250);
        }
      };
      assert.deepEqual(await now(), { token: 404, listed: ['contact'] }, 'no such form yet');
      try {
        replace(`${JSON.stringify(declared, null, 2)}\n`);
        assert.deepEqual(await becomes({ token: 200, listed: ['contact', 'note'] }), { token: 200, listed: ['contact', 'note'] });
      } finally {
        replace(held);
      }
      assert.deepEqual(await becomes({ token: 404, listed: ['contact'] }), { token: 404, listed: ['contact'] }, 'gone with the file put back');
    });

    test('is passed on by the web server with what ADR 0044 lists alone, and nothing kept holds the visitor\'s address or browser', async () => {
      const standIn = `${site.name}-visitors-stand-in`;
      const echo = "require('node:http').createServer((asked, answer) => { asked.resume(); asked.on('end', () => answer.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(asked.headers))); }).listen(4200);";
      site.compose('stop', 'visitors');
      try {
        site.compose('run', '-d', '--use-aliases', '--name', standIn, '--entrypoint', 'node', 'visitors', '-e', echo);
        const theVisitors = {
          Cookie: 'session=someone',
          'User-Agent': 'Mozilla/5.0 (a visitor\'s browser)',
          Authorization: 'Basic c2l0ZTpwYXNzd29yZA==',
          'Accept-Language': 'sv-SE',
          'X-Forwarded-For': '192.0.2.7',
          Forwarded: 'for=192.0.2.7',
          'X-Real-IP': '192.0.2.7',
          'X-Konzilo-Client': '192.0.2.7',
          'X-Konzilo-Host': 'forged.example',
          'Sec-CH-UA': '"Chromium";v="141"',
          DNT: '1',
        };
        let told = null;
        for (let tries = 0; told === null && tries < 40; tries += 1) {
          const answer = await toTheSite('POST', '/_konzilo/forms/contact?from=menu', {
            headers: { ...theVisitors, 'Sec-Fetch-Site': 'same-origin', Origin: site.origin.site, Referer: `${site.origin.site}${CONTACT}`, 'Content-Type': 'application/json' },
            body: '{}',
          });
          if (answer.status === 200 && answer.json) told = answer.json;
          else await wait(250);
        }
        assert.ok(told, 'the stand-in answers');
        assert.equal(told['content-type'], 'application/json');
        assert.equal(told.origin, site.origin.site);
        assert.equal(told.referer, `${site.origin.site}${CONTACT}`);
        assert.equal(told['sec-fetch-site'], 'same-origin');
        assert.equal(told['x-konzilo-host'], new URL(site.origin.site).host);
        assert.match(told['x-konzilo-client'], /^[0-9a-f.:]+$/);
        visitor = told['x-konzilo-client'];
        const own = ['host', 'content-length', 'content-type', 'origin', 'referer', 'sec-fetch-site', 'x-konzilo-client', 'x-konzilo-host', 'accept-encoding'];
        assert.deepEqual(Object.keys(told).filter((name) => !own.includes(name)), []);
        for (const [name, value] of Object.entries(told)) {
          if (!['origin', 'referer'].includes(name)) assert.doesNotMatch(value, /192\.0\.2\.7|someone|a visitor's browser|sv-SE|forged|c2l0ZTpw/, name);
        }
      } finally {
        spawnSync('docker', ['rm', '-f', standIn], { encoding: 'utf8' });
        site.compose('start', 'visitors');
        await healthy('visitors');
      }
      const held = site.compose('exec', '-T', 'visitors', 'sh', '-c', 'cat /service-data/*');
      assert.ok(held.includes('Sent from chromium with JavaScript.'), 'what was sent is there');
      for (const words of [visitor, 'Mozilla', 'HeadlessChrome', 'Firefox', 'AppleWebKit', '/pages/contact/']) assert.ok(!held.includes(words), words);
    });

    test('refuses a client that sends too many in a window, and says when to try again', async () => {
      const token = await tokenOf();
      await wait(3500);
      let refused = null;
      // Within two windows' worth, should the window turn.
      for (let sends = 0; refused === null && sends < 22; sends += 1) {
        const answer = await sendJson({ ...filledIn, _token: token, message: `Number ${sends}` });
        if (answer.status === 429) refused = answer;
        else assert.equal(answer.json.outcome, 'sent');
      }
      assert.ok(refused, 'a send is refused');
      assert.equal(refused.json.outcome, 'too-many');
      const seconds = Number(refused.headers['retry-after']);
      assert.ok(seconds > 0 && seconds <= 600, String(seconds));
      assert.equal(refused.json.retryAfter, seconds);
    });

    test('shows the release\'s page that says the message was not sent while the service is stopped, and the page\'s own message with JavaScript', async () => {
      site.compose('stop', 'visitors');
      try {
        const down = await toTheSite('POST', '/_konzilo/forms/contact', { headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...fromThePage() }, body: `_page=${encodeURIComponent(CONTACT)}&message=Hello` });
        assert.equal(down.status, 502);
        assert.match(down.headers['content-type'], /^text\/html/);
        assert.equal(down.headers['cache-control'], 'no-store');
        assert.match(down.body, /<h1>Your message was not sent<\/h1>/);
        assert.match(down.body, /valley@example\.com/);
        assert.equal((await toTheSite('GET', '/_konzilo/form-not-sent.html')).status, 502, 'served in place of the service alone');
        assert.equal((await toTheSite('GET', '/')).status, 200);

        const browser = await ENGINES.chromium.launch();
        try {
          for (const javaScript of [false, true]) {
            const context = await browser.newContext({ javaScriptEnabled: javaScript, viewport: { width: 1280, height: 1600 } });
            const page = await context.newPage();
            await page.goto(`${site.origin.site}${CONTACT}`);
            await page.locator('[name="name"]').fill('Ada');
            await page.locator('[name="email"]').fill('ada@example.com');
            await page.locator('[name="message"]').fill('Nobody is there.');
            await page.locator('[name="privacy"]').check();
            const [answer] = await Promise.all([javaScript ? null : page.waitForNavigation(), page.getByRole('button', { name: 'Send' }).click()]);
            if (javaScript) {
              await page.locator('#konzilo-form-contact-unavailable').waitFor({ state: 'visible' });
            } else {
              assert.equal(answer.status(), 502);
              await page.getByRole('heading', { name: 'Your message was not sent' }).waitFor();
            }
            await context.close();
          }
        } finally {
          await browser.close();
        }
      } finally {
        site.compose('start', 'visitors');
        await healthy('visitors');
      }
      const token = await tokenOf();
      assert.ok(token, 'and it answers again once started');
    });
  });

  describe('publishing', () => {
    let category;
    const file = (id) => `articles/${id}.md`;
    const published = (slug, fields = {}, body = 'Plain words.') => sourcePost({ title: slug, slug, status: 'published', date: '2026-01-01T10:00:00Z', headline: slug, category: [category], ...fields }, body);

    before(async () => {
      category = (await api(`${repository()}/contents/categories`))[0].name.replace(/\.json$/, '');
    });

    test('keeps what is published in a repository no team reaches', async () => {
      const content = await api(`/repos/${site.name}/content`);
      assert.equal(content.private, true);
      assert.ok((await api(`/repos/${site.name}/content/commits?limit=1`)).length > 0);
      const ledger = await api(`/repos/${site.name}/content/contents/.post-ids.json`);
      assert.ok(ledger.size > 0);
      for (const team of await api(`/orgs/${site.name}/teams`)) {
        if (team.name === 'Owners') continue;
        assert.deepEqual((await api(`/teams/${team.id}/repos`)).map(({ name }) => name), ['source'], team.name);
      }
    });

    test('tells nobody how publishing stands who may not write', async () => {
      assert.equal((await get(`${site.origin.admin}/_konzilo/status`)).status, 401);
      assert.equal((await get(`${site.origin.admin}/_konzilo/status`, { headers: { authorization: 'token nothing-at-all' } })).status, 401);
    });

    test('takes a draft off the site, and puts it back', async () => {
      await saveFile(file('aaaaaaaaaaaa'), published('off-and-on'), 'anna');
      assert.match(await onTheSite('/off-and-on/', 'Plain words.'), /Plain words\./);
      await saveFile(file('aaaaaaaaaaaa'), published('off-and-on', { status: 'draft' }), 'anna');
      assert.equal((await statusBecomes(file('aaaaaaaaaaaa'), 'draft')).status, 'draft');
      assert.equal((await get(`${site.origin.site}/off-and-on/`)).status, 404);
      await saveFile(file('aaaaaaaaaaaa'), published('off-and-on'), 'anna');
      assert.match(await onTheSite('/off-and-on/', 'Plain words.'), /Plain words\./);
    });

    // What the public host answers at an address, without following it, once it answers this.
    const answeredWith = async (address, status, { within = 15_000 } = {}) => {
      const deadline = Date.now() + within;
      for (;;) {
        const answer = await get(`${site.origin.site}${address}`, { redirect: 'manual' });
        if (answer.status === status || Date.now() > deadline) return answer;
        await new Promise((go) => setTimeout(go, 250));
      }
    };

    test('leads an old address on when a post moves, keeping the visitor\'s query', async () => {
      await saveFile(file('bbbbbbbbbbbb'), published('before-the-move'), 'anna');
      await onTheSite('/before-the-move/', 'Plain words.');
      await saveFile(file('bbbbbbbbbbbb'), published('after-the-move'), 'anna');
      await onTheSite('/after-the-move/', 'Plain words.');
      const moved = await answeredWith('/before-the-move/', 301);
      assert.equal(moved.status, 301);
      assert.equal(new URL(moved.headers.get('location'), site.origin.site).pathname, '/after-the-move/');
      const withQuery = await answeredWith('/before-the-move?from=a-link', 301);
      assert.equal(new URL(withQuery.headers.get('location'), site.origin.site).search, '?from=a-link');
    });

    test('answers an Admin\'s rules from the web server, before any file', async () => {
      await saveFile('redirects.json', JSON.stringify({ rules: [
        { from: '/a-rule/', to: '/after-the-move/', status: 302 },
        { from: '/gone-for-good/', status: 410 },
        { from: '/with-a-query/?one=1&two=2', to: 'https://www.example.com/there/', status: 301 },
        { from: '^/numbered/(\\d+)$', to: '/landed/$1/', status: 308 },
      ] }), 'anna');
      const rule = await answeredWith('/a-rule/', 302, { within: 60_000 });
      assert.equal(rule.status, 302);
      assert.equal(new URL(rule.headers.get('location'), site.origin.site).pathname, '/after-the-move/');
      assert.equal((await answeredWith('/a-rule', 302)).status, 302, 'also without its last slash');
      const gone = await answeredWith('/gone-for-good/', 410);
      assert.equal(gone.status, 410);
      assert.match(await gone.text(), /<html/, 'with the site\'s own page');
      for (const address of ['/with-a-query/?one=1&two=2', '/with-a-query/?two=2&one=1']) {
        const asked = await answeredWith(address, 301);
        assert.equal(asked.headers.get('location'), 'https://www.example.com/there/', address);
      }
      assert.equal((await answeredWith('/with-a-query/?one=1', 404, { within: 1000 })).status, 404, 'and not for another query');
      const numbered = await answeredWith('/numbered/12', 308);
      assert.equal(new URL(numbered.headers.get('location'), site.origin.site).pathname, '/landed/12/');
      assert.equal((await answeredWith('/numbered/twelve', 404, { within: 1000 })).status, 404);
    });

    test('sends the release\'s headers on every answer, and nothing of what they came from', async () => {
      for (const [address, status] of [['/', 200], ['/no-such-page/', 404], ['/a-rule/', 302]]) {
        const answer = await answeredWith(address, status);
        assert.equal(answer.status, status, address);
        assert.match(answer.headers.get('content-security-policy') ?? '', /default-src 'self'/, address);
        assert.equal(answer.headers.get('x-content-type-options'), 'nosniff', address);
        assert.match(answer.headers.get('strict-transport-security') ?? '', /max-age=/, address);
      }
      for (const address of ['/_headers', '/_redirects', '/_markdown', '/web-rules.caddy', '/../web-rules.caddy']) assert.equal((await get(`${site.origin.site}${address}`)).status, 404, address);
    });

    // Search (ADR 0053): what is published, through the web server's route to Typesense, which
    // every build indexes and writes the route to. What a search answers, once it answers so.
    const searched = async (query, { within = 60_000, until = () => true } = {}) => {
      const deadline = Date.now() + within;
      for (;;) {
        const answer = await get(`${site.origin.site}/_konzilo/search?${new URLSearchParams({ page: '1', ...query })}`);
        const body = answer.status === 200 ? await answer.json() : null;
        if ((body !== null && until(body)) || Date.now() > deadline) return { answer, body };
        await new Promise((go) => setTimeout(go, 500));
      }
    };
    const addresses = (body) => (body?.hits ?? []).map(({ document }) => document.address).sort();
    // The build log's last line, once it says what `holds` asks; the line follows the record.
    const lastLine = async (holds) => {
      const deadline = Date.now() + 10_000;
      for (;;) {
        const line = JSON.parse(site.compose('exec', '-T', 'builder', 'tail', '-n', '1', '/control/build-log.jsonl'));
        if (holds(line) || Date.now() > deadline) return line;
        await new Promise((go) => setTimeout(go, 250));
      }
    };

    test('finds what is published, by a word and by a part of one, and nothing taken off or kept from search engines', async () => {
      const whole = await searched({ q: 'landscape' }, { until: (body) => body.found > 0 });
      assert.ok(whole.body?.found > 0, 'the demo content, from the first build');
      assert.equal(whole.answer.headers.get('cache-control'), 'no-store');
      assert.match(whole.answer.headers.get('content-type'), /^application\/json/);

      const words = 'A word only this post holds: quetzalcoatlus, & more.';
      await saveFile(file('0a0a0a0a0a0a'), published('a-searched-post', {}, words), 'anna');
      await onTheSite('/a-searched-post/', 'quetzalcoatlus');
      assert.deepEqual(addresses((await searched({ q: 'quetzalcoatlus' }, { until: (body) => body.found === 1 })).body), ['/a-searched-post/']);
      assert.deepEqual(addresses((await searched({ q: 'quetzalcoatlus & more' })).body), ['/a-searched-post/'], 'an & in the query is a word of it');
      assert.ok(addresses((await searched({ q: 'coatlus' })).body).includes('/a-searched-post/'), 'a part of a word of the body finds it, inside the word');
      await saveFile(file('0a0a0a0a0a0a'), published('a-searched-post', { status: 'draft' }, words), 'anna');
      assert.equal((await searched({ q: 'quetzalcoatlus' }, { until: (body) => body.found === 0 })).body.found, 0, 'a draft is not found');
      await saveFile(file('0a0a0a0a0a0a'), published('a-searched-post', { search: { noindex: true } }, words), 'anna');
      // Live again, which the record says once the build, its index too, is done.
      assert.equal((await statusBecomes(file('0a0a0a0a0a0a'), 'live')).status, 'live');
      assert.equal((await searched({ q: 'quetzalcoatlus' }, { within: 0 })).body.found, 0, 'nor one kept from search engines');
    });

    test('takes q, page and filter_by alone, answers the rest as the dev server does, and holds no key where a visitor reaches', async () => {
      const asked = await searched({ q: 'landscape', per_page: '250', include_fields: 'body' });
      assert.equal(asked.body.request_params.per_page, 10);
      assert.ok(asked.body.hits.length > 0 && asked.body.hits.every(({ document }) => !('body' in document)));
      assert.equal((await searched({ q: 'landscape', filter_by: 'type:=nothing' })).body.found, 0);
      const posted = await get(`${site.origin.site}/_konzilo/search?q=landscape`, { method: 'POST' });
      assert.equal(posted.status, 405);
      assert.equal(posted.headers.get('allow'), 'GET');
      assert.deepEqual(await posted.json(), { message: 'Search takes GET alone.' });
      assert.equal((await get(`${site.origin.site}/_konzilo/search/keys`)).status, 404);
      assert.equal((await get(`${site.origin.site}/search-route.caddy`)).status, 404);

      const route = site.compose('exec', '-T', 'web', 'cat', '/srv/search/search-route.caddy');
      const keys = [
        /X-TYPESENSE-API-KEY `([^`]+)`/.exec(route)[1],
        site.compose('exec', '-T', 'builder', 'cat', '/secret/typesense-search-key').trim(),
        site.compose('exec', '-T', 'builder', 'cat', '/secret/typesense-admin-key').trim(),
      ];
      for (const address of ['/', '/search/?q=landscape', '/_konzilo/search?q=landscape&page=1']) {
        const answer = await get(`${site.origin.site}${address}`);
        const seen = `${JSON.stringify([...answer.headers])}${await answer.text()}`;
        for (const key of keys) assert.ok(!seen.includes(key), `${address} holds no key`);
      }
      const inReleases = site.compose('exec', '-T', 'web', 'sh', '-c', 'for key in "$@"; do grep -rlF -- "$key" /srv/site; done; true', 'sh', ...keys);
      assert.equal(inReleases.trim(), '', 'nor does any release');
    });

    test('shows the results on the search page, and says that search does not answer while Typesense is stopped, every other page still there', async () => {
      const session = await openEditor('chromium', site);
      try {
        const { page } = session;
        await page.goto(`${site.origin.site}/search/?q=landscape`);
        await page.locator('.konzilo-search-results li a').first().waitFor();
        assert.match(await page.getByRole('status').textContent(), /results? for “landscape”/);
        site.compose('stop', 'typesense');
        try {
          const down = await get(`${site.origin.site}/_konzilo/search?q=landscape&page=1`);
          assert.equal(down.status, 502);
          assert.deepEqual(await down.json(), { message: 'Search does not answer.' });
          await page.goto(`${site.origin.site}/search/?q=landscape`);
          await page.getByRole('status').filter({ hasText: 'Search does not answer right now. Try again in a while.' }).waitFor();
          assert.equal((await get(`${site.origin.site}/`)).status, 200);
          assert.deepEqual(session.seen.refused, []);
          assert.deepEqual(session.seen.outside, []);

          // A build while it is stopped: the release goes live, unindexed.
          await saveFile(file('0b0b0b0b0b0b'), published('while-search-sleeps', {}, 'Plain words: ornithopter.'), 'anna');
          await onTheSite('/while-search-sleeps/', 'ornithopter');
          assert.equal((await statusBecomes(file('0b0b0b0b0b0b'), 'live')).status, 'live');
          const line = await lastLine((one) => one.unindexed === true);
          assert.equal(line.outcome, 'live');
          assert.equal(line.unindexed, true);
        } finally {
          site.compose('start', 'typesense');
          await healthy('typesense');
        }
        // The next build makes the index, of what was published while it was stopped too.
        await saveFile(file('0b0b0b0b0b0b'), published('while-search-sleeps', {}, 'Plain words: ornithopter, again.'), 'anna');
        assert.deepEqual(addresses((await searched({ q: 'ornithopter' }, { within: 90_000, until: (body) => body.found === 1 })).body), ['/while-search-sleeps/']);
        assert.equal((await lastLine((one) => one.unindexed === undefined)).unindexed, undefined);
      } finally {
        await session.browser.close();
      }
    });

    test('breaks no policy of its own, in a real browser', async () => {
      const session = await openEditor('chromium', site);
      try {
        const { page } = session;
        const articles = await Promise.all((await api(`${repository()}/contents/articles`)).map(async ({ path: place }) => Buffer.from((await api(`${repository()}/contents/${place}`)).content, 'base64').toString()));
        const text = articles.find((article) => /^status: "?published"?$/m.test(article) && /^slug: /m.test(article));
        for (const address of ['/', addressOf(text)]) {
          const answer = await page.goto(`${site.origin.site}${address}`, { waitUntil: 'networkidle' });
          assert.equal(answer.status(), 200, address);
          assert.ok(answer.headers()['content-security-policy'], address);
          assert.deepEqual(session.seen.refused, [], address);
          assert.deepEqual(session.seen.outside, [], address);
        }
      } finally {
        await session.browser.close();
      }
    });

    test('keeps a refused post\'s last version, publishes the rest, and says why', async () => {
      await saveFile(file('cccccccccccc'), published('keeps-its-page', {}, 'The last good words.'), 'anna');
      await onTheSite('/keeps-its-page/', 'The last good words.');
      await saveFile(file('cccccccccccc'), published('keeps-its-page', { category: ['nosuchtermxxx'] }, 'Words that are refused.'), 'anna');
      await saveFile(file('dddddddddddd'), published('saved-after-it', {}, 'Words beside it.'), 'anna');
      await onTheSite('/saved-after-it/', 'Words beside it.');
      const refused = await statusBecomes(file('cccccccccccc'), 'failed');
      assert.equal(refused.status, 'failed');
      assert.equal(refused.stillShown, true);
      assert.ok(refused.refusals.length > 0);
      const page = await (await get(`${site.origin.site}/keeps-its-page/`)).text();
      assert.match(page, /The last good words\./);
      assert.doesNotMatch(page, /Words that are refused/);
      await saveFile(file('cccccccccccc'), published('keeps-its-page', {}, 'Fixed words.'), 'anna');
      await onTheSite('/keeps-its-page/', 'Fixed words.');
    });

    test('goes by who pushed, whatever a commit says of its author', async () => {
      const menu = 'menus/main.json';
      const before = await api(`${repository()}/contents/${menu}`);
      const held = Buffer.from(before.content, 'base64').toString();
      const items = JSON.parse(held);
      const withEntry = (name) => JSON.stringify({ ...items, items: [...(items.items ?? []), { title: name, url: 'https://example.com/' }] });
      // An Editor, who writes as the Admin would have it.
      await asAccount('POST', '/admin/users', { username: 'erik', email: 'erik@localhost.invalid', password: 'a-long-enough-password', must_change_password: false, send_notify: false, visibility: 'private' }, null);
      const teams = await api(`/orgs/${site.name}/teams`);
      await asAccount('PUT', `/teams/${teams.find(({ name }) => name === 'editors').id}/members/erik`, null, null);
      const { commit } = await saveFile(menu, withEntry('Forged by an Editor'), 'erik', { author: { name: 'anna', email: 'anna@localhost.invalid' }, committer: { name: 'anna', email: 'anna@localhost.invalid' } });
      assert.equal(commit.author.email, 'anna@localhost.invalid', 'the commit says it is the Admin\'s');
      const deadline = Date.now() + 60_000;
      let refusals = [];
      while (refusals.length === 0 && Date.now() < deadline) {
        ({ others: { refusals } } = await status());
        if (refusals.length === 0) await new Promise((go) => setTimeout(go, 500));
      }
      assert.equal(refusals[0]?.file, menu);
      assert.match(refusals[0].reason, /^erik is no Admin/);
      assert.doesNotMatch(await (await get(`${site.origin.site}/`)).text(), /Forged by an Editor/);
      await saveFile(menu, withEntry('Saved by an Admin'), 'anna');
      assert.match(await onTheSite('/', 'Saved by an Admin'), /Saved by an Admin/);
      // Recorded only after the release is current.
      const until = Date.now() + 10_000;
      while ((await status()).others.refusals.length > 0 && Date.now() < until) await new Promise((go) => setTimeout(go, 200));
      assert.deepEqual((await status()).others.refusals, []);
    });

    test('shows every post on a page of its own, in the editor', async () => {
      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site);
        const { page } = session;
        await page.getByRole('radio', { name: 'Publishing' }).click();
        const row = page.getByRole('row', { name: /keeps-its-page/ });
        await row.getByText('Live on the site.').waitFor({ timeout: 30_000 });
        assert.equal(await row.getByRole('link', { name: 'keeps-its-page' }).getAttribute('href'), '#/collections/articles/entries/cccccccccccc');
        await page.getByRole('row', { name: /A new post/ }).getByText('A draft, which is not on the site.').waitFor();
        assert.deepEqual(session.seen.refused, []);
        assert.deepEqual(session.seen.outside, []);
      } finally {
        await session.browser.close();
      }
    });

    test('brings out a scheduled post at its moment, with nothing saved after', async () => {
      const moment = new Date(Math.ceil((Date.now() + 20_000) / 1000) * 1000).toISOString().replace('.000', '');
      await saveFile(file('eeeeeeeeeeee'), published('comes-out-by-itself', { status: 'scheduled', date: moment }), 'anna');
      const waiting = await statusBecomes(file('eeeeeeeeeeee'), 'scheduled');
      assert.equal(new Date(waiting.at).getTime(), new Date(moment).getTime());
      assert.equal((await get(`${site.origin.site}/comes-out-by-itself/`)).status, 404);
      // The clock looks at the start of each minute, and the build takes some seconds.
      assert.match(await onTheSite('/comes-out-by-itself/', 'Plain words.', { within: 110_000 }), /Plain words\./);
      assert.equal(await (await statusBecomes(file('eeeeeeeeeeee'), 'live')).status, 'live');
    }, { timeout: 180_000 });

    test('finds a save by itself when the webhook never comes', async () => {
      for (const { id } of await api(`${repository()}/hooks`)) await asAccount('DELETE', `${repository()}/hooks/${id}`, null, null);
      await saveFile(file('ffffffffffff'), published('found-by-the-clock'), 'anna');
      assert.match(await onTheSite('/found-by-the-clock/', 'Plain words.', { within: 90_000 }), /Plain words\./);
    }, { timeout: 120_000 });
  });

  describe('over its life', () => {
    test('keeps a team to the source at a start, also one made when a team had every repository', async () => {
      const teams = await api(`/orgs/${site.name}/teams`);
      const editors = teams.find(({ name }) => name === 'editors');
      await asAccount('PATCH', `/teams/${editors.id}`, { name: 'editors', permission: 'write', includes_all_repositories: true, units_map: { 'repo.code': 'write' } }, null);
      await asAccount('PUT', `/teams/${editors.id}/repos/${site.name}/content`, null, null);
      assert.deepEqual((await api(`/teams/${editors.id}/repos`)).map(({ name }) => name).sort(), ['content', 'source'], 'as a site seeded then has it');
      site.compose('down');
      site.up();
      assert.equal((await api(`/teams/${editors.id}`)).includes_all_repositories, false);
      assert.deepEqual((await api(`/teams/${editors.id}/repos`)).map(({ name }) => name), ['source']);
    });

    test('a second start changes nothing, and what was saved stays across a stop', async () => {
      const client = site.state('oauth-client');
      const [before] = await api(`${repository()}/commits?limit=1`);
      const release = () => site.compose('exec', '-T', 'builder', 'readlink', '/public/current').trim();
      const was = release();
      site.up();
      assert.equal(site.state('oauth-client'), client);
      assert.equal((await api(`${repository()}/commits?limit=1`))[0].sha, before.sha);
      assert.ok((await api(`${repository()}/hooks`)).length > 0, 'a start makes sure of the webhook');
      site.compose('down');
      site.up();
      assert.equal((await api(`${repository()}/commits?limit=1`))[0].sha, before.sha);
      assert.equal(site.state('oauth-client'), client);
      assert.equal(release(), was, 'and builds nothing again');
      assert.equal((await get(`${site.origin.site}/found-by-the-clock/`)).status, 200);
    });
  });
});

// A site repository that keeps demo content of its own in demo-content/ (ADR 0025): the seed fills
// the source repository with it in place of the core's, and the editor and the public site show it.
describe('a site with demo content of its own, in Compose', () => {
  let site;
  let token;

  const api = async (path) => {
    const answer = await fetch(`${site.origin.git}/api/v1${path}`, { headers: { authorization: `token ${token}` } });
    assert.equal(answer.status, 200, path);
    return answer.json();
  };
  const repository = () => `/repos/${site.name}/source`;
  const text = async (path) => Buffer.from((await api(`${repository()}/contents/${path}`)).content, 'base64').toString();

  before(async () => {
    site = await makeSite({ name: `accept-own-${process.pid}` });
    await writeOwnDemoContent(join(site.directory, 'demo-content'));
    site.up('--build');
    token = site.state('instance-token');
  }, { timeout: 900_000 });

  after(() => site?.remove());

  test('holds it as source files, its media in LFS, and nothing of the core\'s', async () => {
    const articles = await api(`${repository()}/contents/articles`);
    assert.equal(articles.length, 1);
    assert.match(articles[0].name, /^[0-9a-f]{12}\.md$/);
    const article = await text(articles[0].path);
    assert.match(article, new RegExp(`^title: "?${OWN_DEMO.article.title}"?$`, 'm'));
    assert.match(article, /^status: "?published"?$/m);
    assert.equal((await api(`${repository()}/contents/pages`)).length, 1);
    const media = await api(`${repository()}/contents/media`);
    assert.deepEqual(media.map((file) => file.name.replace(/[0-9a-f]{10}\.webp$/, '…')), ['lamps-along-the-northern-quay-…']);
    const read = (kind) => fetch(`${site.origin.git}/api/v1${repository()}/${kind}/media/${media[0].name}`, { headers: { authorization: `token ${token}` } });
    assert.match(await (await read('raw')).text(), /^version https:\/\/git-lfs/, 'Git holds a pointer');
    assert.ok((await (await read('media')).arrayBuffer()).byteLength > 1000, 'and LFS the file');
    assert.match(JSON.parse(await text('settings.json')).title, new RegExp(OWN_DEMO.title));
  });

  test('shows it to visitors, and nothing of the core\'s', async () => {
    const start = await (await fetch(`${site.origin.site}/`)).text();
    assert.match(start, new RegExp(OWN_DEMO.title));
    assert.doesNotMatch(start, /The Gentle Garden/);
    assert.match(await (await fetch(`${site.origin.site}${OWN_DEMO.article.address}`)).text(), new RegExp(OWN_DEMO.article.words));
    assert.match(await (await fetch(`${site.origin.site}${OWN_DEMO.page.address}`)).text(), new RegExp(OWN_DEMO.page.words));
    assert.equal((await fetch(`${site.origin.site}/quiet-harbours-and-the-lantern/`)).status, 404);
  });

  test('shows it in the editor', async () => {
    const session = await openEditor('chromium', site);
    try {
      await signIn(session, site);
      await session.page.getByText('Articles').first().waitFor();
      await session.page.getByText(OWN_DEMO.article.title).waitFor();
      assert.equal(await session.page.getByText('Quiet harbours and the lantern').count(), 0);
    } finally {
      await session.browser.close();
    }
  });
});
