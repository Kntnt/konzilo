// A site in Compose, from outside, as a developer and an editor meet it: one command
// brings it up, Forgejo is closed but for what signing in and saving need, and a real
// browser signs in with both factors and saves. Everything else about the format and
// the integration is proved below this, in the suite proper (ADR 0014).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import { intake } from '../src/intake/index.js';
import { readSiteDescription } from '../src/site-description.js';
import { sharp } from '../tests/lib/images.js';
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
      if (error.cause?.code !== 'ECONNRESET') throw error;
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

  test('gives the account write access through its team, and no ownership', async () => {
    const teams = await api(`/orgs/${site.name}/teams`);
    assert.deepEqual(teams.map((team) => team.name).sort(), ['Owners', 'admins', 'editors']);
    const permission = (name) => teams.find((team) => team.name === name).permission;
    assert.equal(permission('admins'), 'write');
    assert.equal(permission('editors'), 'write');
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
        const field = page.getByRole('textbox', { name: 'Title' });
        await field.waitFor();
        await field.fill(title);
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
        // A save goes back to the list, so the post is opened again.
        const { page } = session;
        await page.getByText(title).first().click();
        await page.getByText('Live on the site.').waitFor({ timeout: 30_000 });
        const link = page.getByRole('link', { name: 'Show the page' });
        assert.equal(await link.getAttribute('href'), `${site.origin.site}${addressOf(saved.text)}`);
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
        await page.getByRole('textbox', { name: 'Title' }).click();
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
        await page.getByText(title).first().click();
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
        const figure = new RegExp(`<figure>\\s*<img[^>]*alt="${own}"[^>]*>\\s*<figcaption>A caption in ${engine}</figcaption>\\s*</figure>`);
        assert.match(shown, figure);
      });

      test('uploads a new image, which joins the library, becomes the choice, and is published', async () => {
        const { page } = session;
        const title = `A title saved in ${engine}`;
        const bytes = await sharp({ create: { width: 1400, height: 900, channels: 3, background: ENGINE_COLOURS[engine] } }).png().toBuffer();
        await page.getByText(title).first().click();
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
        await page.getByText(title).first().click();
        const chooser = await openChooser(page, 'gallery', 'Choose images', 'Gallery');
        await chooser.getByRole('button', { name: first.alt, exact: true }).click();
        await chooser.getByRole('button', { name: second.alt, exact: true }).click();
        await chooser.getByRole('button', { name: 'Add 2 images' }).click();
        await chooser.waitFor({ state: 'detached' });

        const gallery = page.locator('.konzilo-gallery-field').last();
        await gallery.locator('.konzilo-image-picture[data-state="shown"]').first().waitFor({ timeout: 30_000 });
        await gallery.locator('.konzilo-image').last().getByRole('button', { name: 'Move earlier' }).click();
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
        assert.equal(entry.src, '/media/from-the-form.jpg');

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
        assert.equal((await picture('from-the-form.jpg')).status, 200, 'and the original stays, which a post may name');
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
    test('speaks the browser\'s language, on files it holds itself', async () => {
      const session = await openEditor('chromium', site, { locale: 'sv-SE' });
      try {
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
    test('are saved in the parts an editor sees, and the intake publishes them flat', async () => {
      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site);
        const { page } = session;
        await page.getByText('Northern islands and the meadow').first().click();
        await page.locator('.konzilo-body-visual .ProseMirror').waitFor({ timeout: 30_000 });
        // What holds something is open already, and a click would close it. A long form
        // renders what is below the window as it comes near, so each bar goes to the top.
        const open = async (name) => {
          const bar = page.locator('button[aria-expanded]', { hasText: name }).first();
          if (await bar.getAttribute('aria-expanded') === 'false') await bar.click();
          await bar.evaluate((element) => element.scrollIntoView({ block: 'start' }));
        };
        await open('Search and sharing');
        await open('In search results');
        await page.getByRole('textbox', { name: 'Title tag' }).fill('A title tag in parts');
        await page.getByRole('button', { name: 'Save', exact: true }).click();

        const { path } = await fileNamed('articles', 'Northern islands and the meadow');
        const text = await waitForFile(page, path, (held) => held.includes('A title tag in parts'));
        assert.match(text, /^seo:\n {2}search:\n {4}title: A title tag in parts$/m);
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
        await page.getByRole('textbox', { name: 'Title' }).fill('A new post');
        await page.getByRole('checkbox', { name: 'Kitchens' }).first().click();
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
        assert.match(saved.text, /^categories:\n\s+- [0-9a-f]{12}$/m);
        assert.doesNotMatch(saved.text, /^seo:/m, 'closed parts leave nothing in the file');
      } finally {
        await session.browser.close();
      }
    });
  });

  describe('publishing', () => {
    let category;
    const file = (id) => `articles/${id}.md`;
    const published = (slug, fields = {}, body = 'Plain words.') => sourcePost({ title: slug, slug, status: 'published', date: '2026-01-01T10:00:00Z', categories: [category], ...fields }, body);

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
      await saveFile(file('cccccccccccc'), published('keeps-its-page', { categories: ['nosuchtermxxx'] }, 'Words that are refused.'), 'anna');
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
