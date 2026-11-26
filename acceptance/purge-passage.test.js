// An Admin's purge of a passage (ADR 0078), in a site in Compose, with an Admin and an Editor
// signed in: a passage an Editor saved into a post, an image library entry and a save's message is
// found on the *Purge a passage* page, by the keyboard, in every revision that holds it, the
// current version marked and linked to its form, and the purge refused while it is there; once
// the Admin has saved the post without it and the entry is deleted, the purge, by the keyboard
// through its steps, takes it from every old revision. Afterwards neither repository, cloned anew
// from Forgejo, holds it in any file or message, Forgejo answers for none of the commits that went,
// no answer of the service holds it, and the post's History shows the same revisions, moments and
// accounts as before. An Editor has no way in. In the other engines, the page and the purge's
// first steps by the keyboard.

import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';

import { ENGINES, openEditor, seeded, signIn } from './lib/editor.js';
import { makeSite } from './lib/site.js';

const USER = 'sveltia-cms.user';
// A purge waits for Forgejo to let go of what went.
const PURGED_WITHIN = 600_000;

describe('an Admin\'s purge of a passage', () => {
  let site;
  let token;
  const sessions = {};
  let template;
  let picture;

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
  const pushAs = async (login, path, change, message) => {
    const { text, sha } = await fileOf(path);
    await changeAs(login, [{ operation: 'update', path, sha, content: base64(change(text)) }], message);
  };
  const head = async () => (await api(`${repository()}/branches/main`)).commit.id;
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
  // A repository cloned anew from Forgejo, inside the copy, where Git reaches it: each commit and
  // file of any branch that holds `marker`, and each commit whose message does.
  const clonedAnew = (name, marker) => {
    const out = site.compose('run', '--rm', '--no-deps', '-T', '--entrypoint', 'sh', 'purge', '-c', [
      'set -e',
      'cd /tmp',
      `H="Authorization: Basic $(printf 'konzilo:%s' "$(cat /secret/token)" | base64 -w0)"`,
      `git -c http.extraHeader="$H" clone --quiet --mirror http://forgejo:3000/${site.name}/${name}.git r`,
      'cd r',
      'echo "#files"',
      `git rev-list --all | xargs -r git grep -i -l -F -e '${marker}' -- || true`,
      'echo "#messages"',
      `git log --all --format=%H%n%B | grep -i -c -F -e '${marker}' || true`,
    ].join('\n'));
    const [, files = '', messages = '0'] = out.split(/^#(?:files|messages)$/m);
    return { files: files.split('\n').filter(Boolean), messages: Number(messages.trim()) };
  };
  const service = async (login, path, query = {}) => {
    const address = new URL(`${site.origin.admin}${path}`);
    for (const [name, value] of Object.entries(query)) address.searchParams.set(name, value);
    const answer = await get(address, { headers: { authorization: `token ${JSON.parse(sessions[login]).token}` } });
    const text = await answer.text();
    return { status: answer.status, body: text ? JSON.parse(text) : null };
  };
  const historyOf = async (path) => (await service('anna', '/_konzilo/revisions', { path })).body.revisions;
  const shape = (revisions) => revisions.map(({ account, moment }) => [account?.login ?? null, moment]);

  // A new published post and an image library entry, saved by `login`, each holding `passage`, in
  // a save whose message names it.
  const saveWith = async (login, title, passage) => {
    const id = randomBytes(6).toString('hex');
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    let text = template.replace(/^title: .*$/m, `title: ${JSON.stringify(title)}`);
    text = /^slug: /m.test(text) ? text.replace(/^slug: .*$/m, `slug: ${slug}`) : text.replace(/^title: .*$/m, (line) => `${line}\nslug: ${slug}`);
    text = text.replace(/^headline: .*$/m, `headline: ${JSON.stringify(title)}`);
    text = `${text.trimEnd()}\n\nFor bookings, call ${passage} on weekdays.\n`;
    const post = `articles/${id}.md`;
    const entry = `image-library/${randomBytes(6).toString('hex')}.json`;
    await changeAs(login, [
      { operation: 'create', path: post, content: base64(text) },
      { operation: 'create', path: entry, content: base64(`${JSON.stringify({ src: `/media/${picture}`, alt: `A portrait of ${passage}` }, null, 2)}\n`) },
    ], `Add the booking line for ${passage}`);
    return { id, post, entry, title };
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
  // The page's search, by the keyboard: the passage written in its field, and Enter.
  const searchFor = async (page, passage) => {
    await go(page, '#/pages/purge-passage');
    const field = page.getByRole('searchbox', { name: 'Passage' });
    await field.waitFor({ timeout: 60_000 });
    await field.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(passage);
    await page.keyboard.press('Enter');
    await page.locator('.konzilo-passage-found, .konzilo-passage-state:not([role="status"])').first().waitFor({ timeout: 120_000 });
    return page.locator('.konzilo-passage');
  };
  // The purge's steps, by the keyboard, from the page's button: that it is meant, and the passage
  // written again; then what is to be chosen.
  const purgeBySteps = async (page, passage) => {
    await press(page, page.getByRole('button', { name: 'Purge from every old revision…' }));
    const dialog = page.getByRole('dialog', { name: 'Purge the passage from every old revision?' });
    await dialog.waitFor();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'konzilo-purge-heading', 'the heading has the focus');
    assert.match(await dialog.textContent(), /There is no way back/);
    assert.match(await dialog.textContent(), /The backups keep it until they expire/);
    await press(page, dialog.getByRole('button', { name: 'I mean it: go on' }));
    const box = dialog.getByRole('textbox', { name: 'To purge it for good, write the passage again:' });
    await box.waitFor();
    assert.equal(await dialog.getByRole('button', { name: 'Purge for good', exact: true }).isDisabled(), true, 'not before the passage is written');
    await box.focus();
    await page.keyboard.type(passage);
    await page.keyboard.press('Enter');
    return dialog;
  };

  before(async () => {
    site = await makeSite({ name: `accept-passage-${process.pid}`, people: 'anna:admin,ebba:editor' });
    site.up('--build');
    token = site.state('instance-token');
    const articles = (await api(`${repository()}/contents/articles`)).filter(({ name }) => name.endsWith('.md'));
    template = (await fileOf(articles[0].path)).text;
    picture = (await api(`${repository()}/contents/media`)).find(({ name }) => /\.(?:jpe?g|png|webp)$/.test(name)).name;
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

      test('an Editor has no way in', async () => {
        await go(ebba.page, '#/pages/purge-passage');
        await ebba.page.getByText('Only an Admin may find a passage in every old revision and purge it.').waitFor({ timeout: 60_000 });
        assert.equal(await ebba.page.getByRole('searchbox', { name: 'Passage' }).count(), 0);
        const answer = await get(`${site.origin.admin}/_konzilo/purge/search`, { method: 'POST', headers: { authorization: `token ${JSON.parse(sessions.ebba).token}`, 'content-type': 'application/json' }, body: JSON.stringify({ passage: 'Ebba Editor' }) });
        assert.equal(answer.status, 403);
      });

      if (engine === 'chromium') {
        test('finds a passage in every revision, refuses while a current version holds it, and purges it from every old one', { timeout: 1_200_000 }, async () => {
          const passage = `Märta Lind, 070-${process.pid}`;
          const saved = await saveWith('ebba', `Bookings ${process.pid}`, passage);
          await built();
          await pushAs('ebba', saved.post, (text) => text.replace(/^title: .*$/m, `title: ${JSON.stringify(`${saved.title}, changed`)}`));
          await built();

          // Found, the current versions first and marked, linked to their forms; no purge.
          let shown = await searchFor(anna.page, passage.toUpperCase());
          const current = anna.page.locator('section[aria-labelledby="konzilo-passage-current"]');
          await current.waitFor();
          assert.match(await shown.textContent(), /Revisions that hold it: 3\. Files: 2\. Saves that name it in their message: 1\./);
          assert.match(await current.getByRole('alert').textContent(), /It cannot be purged while the current version of a file holds it/);
          assert.equal(await current.locator(`li[data-path="${saved.post}"] mark`).first().textContent(), passage);
          assert.match(await current.locator(`li[data-path="${saved.post}"]`).textContent(), /\(the current version\)/);
          const link = current.getByRole('link', { name: `Open Articles “${saved.title}, changed”` });
          assert.equal(await link.getAttribute('href'), `#/collections/articles/entries/${saved.id}`);
          assert.equal(await anna.page.getByRole('button', { name: 'Purge from every old revision…' }).count(), 0, 'no purge while a current version holds it');

          // The Admin saves the post without it, and the entry is deleted; then it is purged.
          const before = { post: shape(await historyOf(saved.post)), head: await head() };
          await pushAs('anna', saved.post, (text) => text.replace(`call ${passage} on weekdays`, 'call the office on weekdays'));
          await changeAs('ebba', [{ operation: 'delete', path: saved.entry, sha: (await fileOf(saved.entry)).sha }]);
          await built();
          before.post = shape(await historyOf(saved.post));
          before.head = await head();
          shown = await searchFor(anna.page, passage);
          await anna.page.locator('section[aria-labelledby="konzilo-passage-old"]').waitFor();
          assert.equal(await anna.page.locator('section[aria-labelledby="konzilo-passage-current"]').count(), 0);

          const dialog = await purgeBySteps(anna.page, passage);
          await press(anna.page, dialog.getByRole('button', { name: 'Purge for good now' }));
          await anna.page.getByText(/^The passage was purged\. Revisions changed: 3\. Files: 2\. Messages of saves changed: 1\.$/).waitFor({ timeout: PURGED_WITHIN });
          assert.doesNotMatch(await anna.page.locator('.konzilo-passage').textContent(), /Märta/i, 'the page says nothing of the passage');

          // Nowhere in either repository cloned anew, in Forgejo, or in what the service answers.
          for (const name of ['source', 'content']) assert.deepEqual(clonedAnew(name, passage), { files: [], messages: 0 }, name);
          assert.equal((await api(`${repository()}/git/commits/${before.head}`, {}, { allow: [404] })).status, 404, 'Forgejo holds the old head no more');
          const revisions = await historyOf(saved.post);
          assert.ok(revisions.every(({ text }) => !text?.toLowerCase().includes(passage.toLowerCase())));
          assert.deepEqual(shape(revisions), before.post, 'the same revisions, moments and accounts');
          assert.ok(revisions.some(({ text }) => text?.includes('For bookings, call  on weekdays.')), 'nothing marks where it was');
          const deleted = await service('anna', '/_konzilo/deleted', { collection: 'image-library' });
          assert.ok(deleted.body.deleted.some(({ path }) => path === saved.entry), 'the deleted entry stays deleted, without it');
          assert.ok(!JSON.stringify(deleted.body).includes(passage));
          const latest = await built();
          assert.equal(latest.outcome, 'live');
        });
      } else {
        test('finds a passage by the keyboard, and takes the purge\'s first steps', { timeout: 600_000 }, async () => {
          const passage = `Nils Holm ${engine} ${process.pid}`;
          const saved = await saveWith('ebba', `Holm ${engine} ${process.pid}`, passage);
          await pushAs('ebba', saved.post, (text) => text.replace(`call ${passage} on weekdays`, 'call the office on weekdays'));
          await changeAs('ebba', [{ operation: 'delete', path: saved.entry, sha: (await fileOf(saved.entry)).sha }]);
          const shown = await searchFor(anna.page, passage);
          await anna.page.locator('section[aria-labelledby="konzilo-passage-old"]').waitFor();
          assert.match(await shown.textContent(), /Revisions that hold it: 2\. Files: 2\. Saves that name it in their message: 1\./);
          const dialog = await purgeBySteps(anna.page, passage);
          await dialog.getByRole('button', { name: 'Purge for good now' }).waitFor({ timeout: 30_000 });
          await anna.page.keyboard.press('Escape');
          await dialog.waitFor({ state: 'detached' });
          assert.equal(await anna.page.evaluate(() => document.activeElement?.textContent), 'Purge from every old revision…', 'the focus goes back');
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
