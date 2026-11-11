// The authors as the authors field reads and adds to them, against a stand-in for Forgejo. Compose
// has the real one, and the field in a browser what an editor does with them.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { authorsIn } from '../src/cms/authors/terms.js';

const encoded = (text) => Buffer.from(text).toString('base64');
const decoded = (text) => Buffer.from(text, 'base64').toString();

function forgejo({ files = {}, failing = {} } = {}) {
  const asked = [];
  const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const get = async (url, { method = 'GET', headers = {}, body } = {}) => {
    const { pathname, searchParams } = new URL(url);
    asked.push({ method, pathname, query: Object.fromEntries(searchParams), authorization: headers.authorization, body: body && JSON.parse(body) });
    if (failing[pathname]) return answer({}, failing[pathname]);
    const contents = '/api/v1/repos/org/source/contents';
    if (pathname === contents && method === 'POST') {
      for (const { path, content } of JSON.parse(body).files) files[path] = { sha: `new${Object.keys(files).length}`, text: decoded(content) };
      return answer({}, 201);
    }
    if (pathname.startsWith(`${contents}/`)) {
      const folder = decodeURIComponent(pathname.slice(contents.length + 1));
      const inside = Object.entries(files).filter(([path]) => path.startsWith(`${folder}/`));
      if (inside.length === 0) return answer({ message: 'not found' }, 404);
      return answer(inside.map(([path, { sha }]) => ({ name: path.split('/').pop(), path, sha, type: path.slice(folder.length + 1).includes('/') ? 'dir' : 'file' })));
    }
    if (pathname.endsWith('/git/blobs')) {
      return answer(searchParams.get('shas').split(',').map((sha) => ({ sha, content: encoded(Object.values(files).find((one) => one.sha === sha).text), encoding: 'base64' })));
    }
    throw new Error(`nothing to say of ${method} ${pathname}`);
  };
  return { asked, get, files };
}

const authorsOf = (stand, { folder = 'authors', credential = () => 'token mine', id = '0123456789ab' } = {}) => authorsIn({ api: 'http://git/api/v1', repository: 'org/source', folder, credential, get: stand.get, id: () => id });
const term = (values, sha) => ({ sha, text: `${JSON.stringify(values, null, 2)}\n` });

describe('the authors', () => {
  test('are the terms in their folder, each with its name and ID, asked for with the credential of whoever is signed in', async () => {
    const stand = forgejo({
      files: {
        'authors/rafael-berg.json': term({ name: 'Rafael Berg', description: 'A librarian.' }, 'r1'),
        'authors/0a1b2c3d4e5f.json': term({ name: 'Åsa Lind' }, 'a1'),
        'authors/ines-holm.json': term({ name: '  Ines Holm ' }, 'i1'),
        'authors/nameless.json': term({ description: 'No name' }, 'n1'),
        'authors/broken.json': { sha: 'b1', text: 'not json' },
        'authors/notes.txt': { sha: 't1', text: 'not a term' },
        'categories/harbours.json': term({ name: 'Harbours' }, 'c1'),
      },
    });
    const byId = (authors) => authors.sort((one, other) => one.id.localeCompare(other.id));
    assert.deepEqual(byId(await authorsOf(stand).list()), [
      { id: '0a1b2c3d4e5f', name: 'Åsa Lind' },
      { id: 'ines-holm', name: 'Ines Holm' },
      { id: 'rafael-berg', name: 'Rafael Berg' },
    ]);
    assert.ok(stand.asked.every(({ authorization }) => authorization === 'token mine'));
    assert.deepEqual(stand.asked.find(({ pathname }) => pathname.endsWith('/git/blobs')).query.shas.split(',').sort(), ['a1', 'b1', 'i1', 'n1', 'r1'], 'nothing but terms is read');
  });

  test('are read from the main language\'s folder on a site in several, and are none before the first', async () => {
    const stand = forgejo({ files: { 'authors/sv-SE/ines-holm.json': term({ name: 'Ines Holm' }, 'i1'), 'authors/en-GB/ines-holm.json': term({ name: 'Ines Holm, in English' }, 'i2') } });
    assert.deepEqual(await authorsOf(stand, { folder: 'authors/sv-SE' }).list(), [{ id: 'ines-holm', name: 'Ines Holm' }]);
    assert.deepEqual(await authorsOf(forgejo()).list(), []);
  });

  test('ask for each file once while a page is open', async () => {
    const stand = forgejo({ files: { 'authors/ines-holm.json': term({ name: 'Ines Holm' }, 'i1') } });
    const authors = authorsOf(stand);
    await authors.list();
    stand.asked.length = 0;
    assert.deepEqual(await authors.list(), [{ id: 'ines-holm', name: 'Ines Holm' }]);
    assert.equal(stand.asked.filter(({ pathname }) => pathname.endsWith('/git/blobs')).length, 0);
  });

  test('take a new author as one commit of its own file at once, named by a new ID, and list it from then on', async () => {
    const stand = forgejo({ files: { 'authors/ines-holm.json': term({ name: 'Ines Holm' }, 'i1') } });
    const authors = authorsOf(stand);
    assert.deepEqual(await authors.add({ name: '  Ada Lind ', biography: ' Writes of lighthouses.\n' }), { id: '0123456789ab', name: 'Ada Lind' });
    const [commit] = stand.asked.filter(({ method }) => method === 'POST');
    assert.equal(commit.body.branch, 'main');
    assert.equal(commit.body.message, 'Add the author Ada Lind');
    assert.deepEqual(commit.body.files.map(({ operation, path }) => ({ operation, path })), [{ operation: 'create', path: 'authors/0123456789ab.json' }]);
    assert.deepEqual(JSON.parse(stand.files['authors/0123456789ab.json'].text), { name: 'Ada Lind', description: 'Writes of lighthouses.' });
    assert.deepEqual((await authors.list()).map(({ id }) => id).sort(), ['0123456789ab', 'ines-holm']);

    await authorsOf(stand, { id: 'ba9876543210' }).add({ name: 'Ben Holm', biography: '   ' });
    assert.deepEqual(JSON.parse(stand.files['authors/ba9876543210.json'].text), { name: 'Ben Holm' }, 'with no biography where none is written');
  });

  test('take no author without a name', async () => {
    const stand = forgejo();
    await assert.rejects(authorsOf(stand).add({ name: '  ' }), /no name/);
    assert.equal(stand.asked.length, 0);
  });

  test('ask nothing of anyone with nobody signed in, and say when Forgejo refuses', async () => {
    const stand = forgejo();
    await assert.rejects(authorsOf(stand, { credential: () => null }).list(), /nobody is signed in/);
    assert.equal(stand.asked.length, 0);
    const refusing = forgejo({ failing: { '/api/v1/repos/org/source/contents': 403 } });
    await assert.rejects(authorsOf(refusing).add({ name: 'Ada Lind' }), /403/);
  });
});
