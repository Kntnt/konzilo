// A site in Compose, from outside, as a developer and an editor meet it: one command
// brings it up, Forgejo is closed but for what signing in and saving need, and a real
// browser signs in with both factors and saves. Everything else about the format and
// the integration is proved below this, in the suite proper (ADR 0014).

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { after, before, describe, test } from 'node:test';

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
    assert.equal(published.length, 3);
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

      test('asks nothing outside this copy of the site, and breaks no policy', () => {
        assert.deepEqual(session.seen.outside, []);
        assert.deepEqual(session.seen.refused, []);
        assert.deepEqual(session.seen.errors, []);
      });
    });
  }

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
      } finally {
        await session.browser.close();
      }
    });
  });

  describe('over its life', () => {
    test('a second start changes nothing, and what was saved stays across a stop', async () => {
      const client = site.state('oauth-client');
      const [before] = await api(`${repository()}/commits?limit=1`);
      site.up();
      assert.equal(site.state('oauth-client'), client);
      assert.equal((await api(`${repository()}/commits?limit=1`))[0].sha, before.sha);
      site.compose('down');
      site.up();
      assert.equal((await api(`${repository()}/commits?limit=1`))[0].sha, before.sha);
      assert.equal(site.state('oauth-client'), client);
    });
  });
});
