// The source repository as the editor reads it beside Sveltia, through Forgejo's API with the
// credential of whoever is signed in, on the branch the configuration names, against a stand-in
// for Forgejo.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { decodedContent, sourceOf, sourceReader } from '../src/cms/source.js';

const encoded = (text) => Buffer.from(text).toString('base64');

function forgejo(files, failing = {}) {
  const asked = [];
  const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const get = async (url, { headers = {} } = {}) => {
    const { pathname, searchParams } = new URL(url);
    asked.push({ pathname, ref: searchParams.get('ref'), authorization: headers.authorization });
    const path = decodeURIComponent(pathname.slice('/api/v1/repos/org/source/contents/'.length));
    if (failing[path]) return answer({}, failing[path]);
    if (!Object.hasOwn(files, path)) return answer({ message: 'not found' }, 404);
    // Forgejo writes base64 in lines of 60.
    return answer({ type: 'file', path, content: encoded(files[path]).replace(/(.{60})/g, '$1\n'), encoding: 'base64' });
  };
  return { asked, get };
}

const config = { backend: { name: 'gitea', api_root: 'http://git/api/v1', repo: 'org/source', branch: 'drafts' } };

test('reads where the configuration says: Forgejo\'s API, the repository and its branch', () => {
  assert.deepEqual(sourceOf(config), { api: 'http://git/api/v1', repository: 'org/source', branch: 'drafts' });
  assert.deepEqual(sourceOf({ backend: { name: 'test-repo' } }), { api: null, repository: null, branch: null }, 'nothing to read without Forgejo');
});

test('reads a file as text, with the credential of whoever is signed in, on the configured branch, and none where the branch holds none', async () => {
  const stand = forgejo({ 'menus/main.json': '{"items":[{"title":"Åtta"}]}\n'.repeat(4), 'media/a b.webp': 'x' });
  const source = sourceReader({ ...sourceOf(config), credential: () => 'token mine', get: stand.get });
  assert.equal(await source.text('menus/main.json'), '{"items":[{"title":"Åtta"}]}\n'.repeat(4));
  assert.equal(await source.text('menus/gone.json'), null);
  assert.equal(await source.exists('media/a b.webp'), true);
  assert.equal(await source.exists('media/gone.webp'), false);
  assert.deepEqual(stand.asked.map(({ pathname }) => pathname.split('/contents/')[1]), ['menus/main.json', 'menus/gone.json', 'media/a%20b.webp', 'media/gone.webp']);
  assert.ok(stand.asked.every(({ ref, authorization }) => ref === 'drafts' && authorization === 'token mine'));
});

test('throws where Forgejo fails or nobody is signed in, and asks nothing then', async () => {
  const stand = forgejo({}, { 'settings.json': 500 });
  await assert.rejects(sourceReader({ ...sourceOf(config), credential: () => 'token mine', get: stand.get }).text('settings.json'), (error) => error.status === 500);
  const before = stand.asked.length;
  await assert.rejects(sourceReader({ ...sourceOf(config), credential: () => null, get: stand.get }).text('settings.json'), /nobody is signed in/);
  assert.equal(stand.asked.length, before);
});

test('decodes what Forgejo gives as base64, in lines or not', () => {
  assert.equal(decodedContent(encoded('Smörgås')), 'Smörgås');
  assert.equal(decodedContent(`${encoded('a'.repeat(50))}`.replace(/(.{20})/g, '$1\n')), 'a'.repeat(50));
});
