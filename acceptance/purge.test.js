// An Admin's purge (ADR 0078), in a site in Compose, with an Admin and an Editor signed in: a post
// the Editor published and deleted is purged from the *Deleted* page, by the keyboard, after its
// steps, in each browser engine; afterwards neither repository, cloned anew from Forgejo, holds any
// revision of it, Forgejo answers for none of its commits, the service names it nowhere, its rules
// are gone and its addresses answer as unknown, every other form's History reads as before, the
// role check reads the same pushers, and the next build and the live preview work on the rewritten
// history. In one engine: an image library entry's original goes from LFS unless a current file
// names it, an Editor sees no way to purge, and others' open forms are run over or waited for.

import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';

import { ENGINES, openEditor, seeded, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const USER = 'sveltia-cms.user';
// A purge waits for Forgejo to let go of what went, and an LFS object only a minute after it came.
const PURGED_WITHIN = 600_000;

describe('an Admin\'s purge', () => {
  let site;
  let token;
  const sessions = {};
  let template;

  const get = async (url, init) => {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (!['ECONNRESET', 'UND_ERR_SOCKET'].includes(error.cause?.code)) throw error;
      return fetch(url, init);
    }
  };
  const repository = () => `/repos/${site.name}/source`;
  const api = async (path, init = {}, { allow = [] } = {}) => {
    const answer = await get(`${site.origin.git}/api/v1${path}`, { ...init, headers: { authorization: `token ${token}`, ...(init.body ? { 'content-type': 'application/json' } : {}) } });
    assert.ok(answer.ok || allow.includes(answer.status), `${path}: ${answer.status}`);
    const text = await answer.text();
    return answer.ok && text ? JSON.parse(text) : { status: answer.status };
  };
  const base64 = (text) => Buffer.from(text).toString('base64');
  const fileOf = async (path) => {
    const { content, sha } = await api(`${repository()}/contents/${path}`);
    return { text: Buffer.from(content, 'base64').toString(), sha };
  };
  // Saves from outside the editor, as `login`, whose push the feed names.
  const changeAs = (login, files, message = 'A save from outside the editor') => api(`${repository()}/contents?sudo=${login}`, { method: 'POST', body: JSON.stringify({ branch: 'main', message, files }) });
  const pushAs = async (login, path, change) => {
    const { text, sha } = await fileOf(path);
    await changeAs(login, [{ operation: 'update', path, sha, content: base64(change(text)) }]);
  };
  const head = async () => (await api(`${repository()}/branches/main`)).commit.id;
  const commitsOf = async (path) => (await api(`${repository()}/commits?path=${encodeURIComponent(path)}&limit=50&stat=false&files=false&verification=false`)).map(({ sha }) => sha);
  const inBuilder = (...command) => site.compose('exec', '-T', 'builder', ...command);
  const record = () => JSON.parse(inBuilder('cat', '/control/published.json'));
  // Until a build has read the source as it stands, and given its record.
  const built = async ({ within = 300_000 } = {}) => {
    const deadline = Date.now() + within;
    for (;;) {
      const now = await head();
      try {
        const read = record();
        if (read.source === now && !inBuilder('ls', '/control').split('\n').includes('building')) return read;
      } catch {
        // No record yet.
      }
      assert.ok(Date.now() < deadline, 'no build read the source in time');
      await new Promise((go) => setTimeout(go, 2000));
    }
  };
  // A repository cloned anew from Forgejo, inside the copy, where Git reaches it: every path any
  // commit of any branch holds, and each commit and file that holds `marker`.
  const clonedAnew = (name, marker) => {
    const out = site.compose('run', '--rm', '--no-deps', '-T', '--entrypoint', 'sh', 'purge', '-c', [
      'set -e',
      'cd /tmp',
      `H="Authorization: Basic $(printf 'konzilo:%s' "$(cat /secret/token)" | base64 -w0)"`,
      `git -c http.extraHeader="$H" clone --quiet --mirror http://forgejo:3000/${site.name}/${name}.git r`,
      'cd r',
      'echo "#paths"',
      'git log --all --format= --name-only | sort -u',
      'echo "#marked"',
      `git rev-list --all | xargs -r git grep -l -F -e '${marker}' -- || true`,
    ].join('\n'));
    const [, paths = '', marked = ''] = out.split(/^#(?:paths|marked)$/m);
    return { paths: new Set(paths.split('\n').filter(Boolean)), marked: marked.split('\n').filter(Boolean) };
  };
  // What the service names of a file's revisions, as an Editor's form reads them.
  const service = async (login, path, query = {}) => {
    const address = new URL(`${site.origin.admin}${path}`);
    for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value);
    const answer = await get(address, { headers: { authorization: `token ${JSON.parse(sessions[login]).token}` } });
    const text = await answer.text();
    return { status: answer.status, body: text ? JSON.parse(text) : null };
  };
  const historyOf = async (path) => (await service('anna', '/_konzilo/revisions', { path })).body.revisions.map(({ account, moment }) => [account?.login ?? null, moment]);
  // A new published post, saved by `login`, with a word of its own in its body.
  const newPost = async (login, title, marker) => {
    const id = randomBytes(6).toString('hex');
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let text = template.replace(/^title: .*$/m, `title: ${JSON.stringify(title)}`);
    text = /^slug: /m.test(text) ? text.replace(/^slug: .*$/m, `slug: ${slug}`) : text.replace(/^title: .*$/m, (line) => `${line}\nslug: ${slug}`);
    text = text.replace(/^headline: .*$/m, `headline: ${JSON.stringify(title)}`);
    text = `${text.trimEnd()}\n\nA paragraph that says ${marker}.\n`;
    const path = `articles/${id}.md`;
    await changeAs(login, [{ operation: 'create', path, content: base64(text) }]);
    return { id, path, title, slug };
  };
  const remove = async (login, paths) => {
    const files = [];
    for (const path of paths) files.push({ operation: 'delete', path, sha: (await fileOf(path)).sha });
    await changeAs(login, files);
  };

  const pageOf = async (engine, login) => {
    const session = await openEditor(engine, site);
    session.page.on('dialog', (dialog) => dialog.accept());
    await session.page.evaluate(([key, user]) => localStorage.setItem(key, user), [USER, sessions[login]]);
    await session.page.reload();
    await session.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
    return session;
  };
  const go = (page, hash) => page.evaluate((to) => {
    window.location.hash = to;
  }, hash);
  const press = async (page, locator, key = 'Enter') => {
    await locator.focus();
    await page.keyboard.press(key);
  };
  // The purge's steps, by the keyboard, from the *Deleted* page: the row's button, that it is
  // meant, the name written, and then `course`, as the forms others have open leave it.
  const purgeBySteps = async (page, { path, title, course = 'Purge for good now' }) => {
    await go(page, '#/pages/deleted');
    const row = page.locator(`.konzilo-deleted tr[data-path="${path}"]`);
    await row.waitFor({ timeout: 60_000 });
    await press(page, row.getByRole('button', { name: `Purge “${title}” for good…` }));
    const dialog = page.getByRole('dialog', { name: `Purge “${title}” for good?` });
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'konzilo-purge-heading', 'the heading has the focus');
    assert.match(await dialog.textContent(), /There is no way back/);
    assert.match(await dialog.textContent(), /The backups keep it until they expire, and are the last way back until then\./);
    await press(page, dialog.getByRole('button', { name: 'I mean it: go on' }));
    const box = dialog.getByRole('textbox', { name: `To purge it for good, write its name, “${title}”:` });
    await box.waitFor();
    assert.match(await dialog.textContent(), /There is no way back/, 'said again at the next step');
    assert.equal(await dialog.getByRole('button', { name: 'Purge for good', exact: true }).isDisabled(), true, 'not before the name is written');
    await box.focus();
    await page.keyboard.type(title);
    await page.keyboard.press('Enter');
    const chosen = dialog.getByRole('button', { name: course });
    await chosen.waitFor({ timeout: 30_000 });
    return { dialog, choose: () => press(page, chosen) };
  };
  const purgedOnPage = (page, title) => page.getByText(`“${title}” was purged for good.`).waitFor({ timeout: PURGED_WITHIN });

  before(async () => {
    site = await makeSite({ name: `accept-purge-${process.pid}`, people: 'anna:admin,ebba:editor' });
    site.up('--build');
    token = site.state('instance-token');
    const articles = (await api(`${repository()}/contents/articles`)).filter(({ name }) => name.endsWith('.md'));
    template = (await fileOf(articles[0].path)).text;
    for (const login of ['anna', 'ebba']) {
      const session = await openEditor('chromium', site);
      try {
        await signIn(session, site, seeded(site, login));
        await session.page.getByText('Articles').first().waitFor({ timeout: 60_000 });
        sessions[login] = await session.page.evaluate((key) => localStorage.getItem(key), USER);
      } finally {
        await session.browser.close();
      }
    }
  }, { timeout: 1_200_000 });

  after(() => site?.remove());

  for (const engine of Object.keys(ENGINES)) {
    describe(engine, () => {
      let anna;
      let ebba;

      before(async () => {
        anna = await pageOf(engine, 'anna');
        ebba = await pageOf(engine, 'ebba');
      }, { timeout: 300_000 });

      after(async () => {
        await anna?.browser.close();
        await ebba?.browser.close();
      });

      test('purges a deleted post from both histories, with its rules, and carries over every other save', { timeout: 1_200_000 }, async () => {
        const marker = `purge-marker-${engine}-${process.pid}`;
        const post = await newPost('ebba', `Purged ${engine} ${process.pid}`, marker);
        const published = await built();
        const { address } = published.posts[post.path];
        assert.ok(address, 'it was published');
        await pushAs('anna', 'redirects.json', (text) => {
          const read = JSON.parse(text);
          read.rules = [...(read.rules ?? []), { from: `/kept-${engine}-${process.pid}/`, to: '/', status: 301 }, { from: `/to-${post.slug}/`, to: address, status: 301 }, { from: `/also-${post.slug}/`, post: post.id, status: 302 }];
          return `${JSON.stringify(read, null, 2)}\n`;
        });
        // Another post's saves after it, which the purge rewrites.
        const other = (await api(`${repository()}/contents/articles`)).find(({ name }) => name.endsWith('.md') && !name.startsWith(post.id)).path;
        await pushAs('ebba', other, (text) => text.replace(/^title: .*$/m, `title: "Kept ${engine}"`));
        await built();
        assert.equal((await get(`${site.origin.site}/to-${post.slug}/`, { redirect: 'manual' })).status, 301);
        await remove('ebba', [post.path]);
        await built();
        const before = { other: await historyOf(other), rules: await historyOf('redirects.json'), deleted: await commitsOf(post.path) };
        assert.ok(before.deleted.length >= 2);

        // An Editor has no way to purge.
        await go(ebba.page, '#/pages/deleted');
        await ebba.page.locator(`.konzilo-deleted tr[data-path="${post.path}"]`).waitFor({ timeout: 60_000 });
        assert.equal(await ebba.page.getByRole('button', { name: /Purge/ }).count(), 0);
        assert.equal((await service('ebba', '/_konzilo/purge')).status, 403);

        const { choose } = await purgeBySteps(anna.page, post);
        await choose();
        await purgedOnPage(anna.page, post.title);
        const purgedAt = Date.now();
        await anna.page.waitForFunction(() => !document.querySelector('.konzilo-deleted-state[role="status"]')?.textContent.startsWith('Reading'), null, { timeout: 60_000 });
        await anna.page.locator('.konzilo-deleted table, .konzilo-deleted-state').first().waitFor({ timeout: 60_000 });
        assert.equal(await anna.page.locator(`.konzilo-deleted tr[data-path="${post.path}"]`).count(), 0, 'the page lists it no more');
        assert.match(await anna.page.locator('.konzilo-deleted').textContent(), /the last by Anna|the last by anna/i, 'and says who purged, and when');

        // Nothing of it in either repository cloned anew, nor in Forgejo.
        const source = clonedAnew('source', marker);
        assert.ok(!source.paths.has(post.path));
        assert.deepEqual(source.marked, []);
        const content = clonedAnew('content', marker);
        assert.deepEqual(content.marked, []);
        assert.deepEqual(clonedAnew('content', post.id).marked, [], 'not in the ledger either');
        assert.deepEqual(clonedAnew('source', `/to-${post.slug}/`).marked, [], 'nor its rules, in any revision');
        assert.deepEqual(clonedAnew('source', `/also-${post.slug}/`).marked, []);
        for (const commit of before.deleted) assert.equal((await api(`${repository()}/git/commits/${commit}`, {}, { allow: [404] })).status, 404, `Forgejo holds ${commit}`);
        assert.deepEqual(await commitsOf(post.path), []);

        // Its addresses answer as unknown; every other form's History reads as before.
        const latest = await built();
        for (const at of [address, `/to-${post.slug}/`, `/also-${post.slug}/`]) assert.equal((await get(`${site.origin.site}${at}`, { redirect: 'manual' })).status, 404, at);
        assert.deepEqual(await historyOf(other), before.other, 'the same revisions, moments and accounts');
        assert.deepEqual(await historyOf('redirects.json'), before.rules);
        assert.equal((await service('anna', '/_konzilo/deleted')).body.deleted.some(({ path }) => path === post.path), false);

        // The role check reads the same pushers, and the next build made a release of its own.
        const pushers = JSON.parse(inBuilder('cat', '/work/roles/pushers.json'));
        const [newest] = await commitsOf(other);
        assert.equal(pushers[newest], 'ebba', 'a rewritten save is still the Editor\'s');
        assert.equal(latest.outcome, 'live');
        assert.equal(inBuilder('ls', '/public/releases').trim().split('\n').length, 1, 'no release from before stays');

        // The live preview, which starts again within half a minute of a purge, shows the site at the
        // moment of a form, on the rewritten history.
        await new Promise((go) => setTimeout(go, Math.max(0, 40_000 - (Date.now() - purgedAt))));
        await anna.page.goto(`${site.origin.admin}/#/collections/articles/entries/${other.split('/').at(-1).replace(/\.md$/, '')}`);
        await anna.page.getByRole('textbox', { name: 'Working name' }).waitFor({ timeout: 60_000 });
        const frame = anna.page.frameLocator('iframe.preview').frameLocator('iframe');
        await frame.locator('h1').first().waitFor({ timeout: 180_000 });
        await go(anna.page, '#/collections/articles');
      });

      if (engine === 'chromium') {
        test('takes an image library entry\'s original from LFS, unless a current file names it', { timeout: 1_200_000 }, async () => {
          const lfs = async (objects) => {
            const answer = await get(`${site.origin.git}/${site.name}/source.git/info/lfs/objects/batch`, {
              method: 'POST',
              headers: { authorization: `Basic ${Buffer.from(`konzilo:${token}`).toString('base64')}`, accept: 'application/vnd.git-lfs+json', 'content-type': 'application/vnd.git-lfs+json' },
              body: JSON.stringify({ operation: 'download', transfers: ['basic'], objects }),
            });
            return (await answer.json()).objects;
          };
          const oidOfFile = async (path) => {
            const answer = await get(`${site.origin.git}/api/v1${repository()}/media/${path}`, { headers: { authorization: `token ${token}` } });
            assert.ok(answer.ok, `${path}: ${answer.status}`);
            return createHash('sha256').update(Buffer.from(await answer.arrayBuffer())).digest('hex');
          };
          const shared = (await api(`${repository()}/contents/media`)).find(({ name }) => /\.(?:jpe?g|png|webp)$/.test(name)).name;
          const id = randomBytes(6).toString('hex');
          const entry = `image-library/${id}.json`;
          const original = `media/purged-${process.pid}.png`;
          const bytes = randomBytes(4096);
          await changeAs('ebba', [
            { operation: 'create', path: original, content: bytes.toString('base64') },
            { operation: 'create', path: entry, content: base64(JSON.stringify({ src: `/${original}`, alt: 'Purged' })) },
          ]);
          const oid = createHash('sha256').update(bytes).digest('hex');
          const sharedOid = await oidOfFile(`media/${shared}`);
          assert.equal((await lfs([{ oid, size: bytes.length }]))[0].error, undefined, 'the original is in LFS');
          await pushAs('ebba', entry, () => JSON.stringify({ src: `/media/${shared}`, alt: 'Shared' }));
          await remove('ebba', [entry, original]);

          const asked = await service('anna', '/_konzilo/deleted', { collection: 'image-library' });
          assert.ok(asked.body.deleted.some(({ path }) => path === entry));
          const answer = await get(`${site.origin.admin}/_konzilo/purge`, { method: 'POST', headers: { authorization: `token ${JSON.parse(sessions.anna).token}`, 'content-type': 'application/json' }, body: JSON.stringify({ path: entry, course: 'anyway' }) });
          assert.equal(answer.status, 202);
          const { purge } = await answer.json();
          const deadline = Date.now() + PURGED_WITHIN;
          for (;;) {
            const now = (await service('anna', '/_konzilo/purge')).body.purge;
            if (now?.id === purge.id && ['done', 'failed'].includes(now.state)) {
              assert.equal(now.state, 'done', JSON.stringify(now));
              break;
            }
            assert.ok(Date.now() < deadline, 'the purge did not end in time');
            await new Promise((go) => setTimeout(go, 2000));
          }
          const [gone, kept] = await lfs([{ oid, size: bytes.length }, { oid: sharedOid, size: 1 }]);
          assert.equal(gone.error?.code, 404, 'its own original is gone from LFS');
          assert.equal(kept.error, undefined, 'one a current file names stays');
          assert.ok(!clonedAnew('source', original).paths.has(original));
        });

        test('run anyway: the tab with a form open is warned and loads again, and then the purge runs', { timeout: 1_200_000 }, async () => {
          const post = await newPost('ebba', `Run over ${process.pid}`, `run-over-${process.pid}`);
          await built();
          await remove('ebba', [post.path]);
          await built();
          const other = (await api(`${repository()}/contents/articles`)).find(({ name }) => name.endsWith('.md')).path;
          await go(ebba.page, `#/collections/articles/entries/${other.split('/').at(-1).replace(/\.md$/, '')}`);
          await ebba.page.getByRole('textbox', { name: 'Working name' }).waitFor({ timeout: 60_000 });

          const { dialog, choose } = await purgeBySteps(anna.page, { ...post, course: 'Run anyway' });
          assert.match(await dialog.textContent(), /ebba has had Articles “.*” open since/);
          const loaded = ebba.page.waitForEvent('load', { timeout: 120_000 });
          await choose();
          const warned = ebba.page.getByRole('dialog', { name: 'This page loads again' });
          await warned.waitFor({ timeout: 60_000 });
          assert.match(await warned.textContent(), /the changes in this form that have not been saved are lost/);
          await loaded;
          await purgedOnPage(anna.page, post.title);
          await go(ebba.page, '#/collections/articles');
        });

        test('wait: no form opens until the one open closes, and then the purge runs', { timeout: 1_200_000 }, async () => {
          const post = await newPost('ebba', `Waited for ${process.pid}`, `waited-for-${process.pid}`);
          await built();
          await remove('ebba', [post.path]);
          await built();
          const [one, two] = (await api(`${repository()}/contents/articles`)).filter(({ name }) => name.endsWith('.md')).map(({ name }) => name.replace(/\.md$/, ''));
          await ebba.page.reload();
          await go(ebba.page, `#/collections/articles/entries/${one}`);
          await ebba.page.getByRole('textbox', { name: 'Working name' }).waitFor({ timeout: 60_000 });

          const { choose } = await purgeBySteps(anna.page, { ...post, course: 'Wait until they are done' });
          await choose();
          await anna.page.getByText('Waiting for the forms that are open to close.').waitFor({ timeout: 60_000 });

          // Another tab trying to open a form is told that a purge is waiting.
          const third = await ebba.context.newPage();
          await third.goto(`${site.origin.admin}/#/collections/articles/entries/${two}`);
          const shut = third.getByRole('dialog', { name: 'A purge is under way' });
          await shut.waitFor({ timeout: 60_000 });
          assert.match(await shut.textContent(), /Forms open again once it is done/);
          await new Promise((go) => setTimeout(go, 5000));
          assert.equal((await service('anna', '/_konzilo/purge')).body.purge.state, 'waiting', 'not while the form is open');

          await go(ebba.page, '#/collections/articles');
          await purgedOnPage(anna.page, post.title);
          await third.close();
        });
      }

      test('asks nothing outside this copy of the site, and breaks no policy', () => {
        for (const session of [anna, ebba]) {
          assert.deepEqual(session.seen.outside, []);
          assert.deepEqual(session.seen.refused, []);
        }
      });
    });
  }
});
