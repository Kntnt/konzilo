// The label of the menu entry that leads to a post, which the form's name in breadcrumbs shows
// while it is empty, read from the menus' source files against a stand-in for Forgejo.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { menuLabelReader } from '../src/cms/parts/menu-label.js';

const encoded = (text) => Buffer.from(text).toString('base64');

// Forgejo's contents of the source repository, each file by its path, as an editor asks for them.
function forgejo(files) {
  const asked = [];
  const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const get = async (url, { headers = {} } = {}) => {
    const { pathname, searchParams } = new URL(url);
    asked.push({ pathname, ref: searchParams.get('ref'), authorization: headers.authorization });
    const path = decodeURIComponent(pathname.slice('/api/v1/repos/org/source/contents/'.length));
    if (!Object.hasOwn(files, path)) return answer({ message: 'not found' }, 404);
    return answer({ type: 'file', path, content: encoded(files[path]), encoding: 'base64' });
  };
  return { asked, get };
}

const menu = (items) => `${JSON.stringify({ items }, null, 2)}\n`;
const reader = (stand, credential = () => 'token mine') => menuLabelReader({ api: 'http://git/api/v1', repository: 'org/source', credential, get: stand.get });

describe('the label of the menu entry that leads to a post', () => {
  const files = {
    'menus/main.json': menu([
      { title: 'Harbour', post: 'f00d', items: [{ title: 'Quay', post: 'abc' }, { post: 'bare' }] },
      { title: 'Later', post: 'abc' },
      { title: 'Elsewhere', url: 'https://example.org/' },
      { title: 'Who we are', url: '/about/' },
    ]),
    'menus/footer.json': menu([{ title: '  The quay  ', post: 'abc' }, { title: 'Tides', post: 'tide' }]),
  };

  test('is the first entry\'s that names the post, an entry before those under it, of the first menu that has one, asked with the credential of whoever is signed in', async () => {
    const stand = forgejo(files);
    const labelOf = reader(stand);
    assert.equal(await labelOf('abc', ['menus/main.json', 'menus/footer.json']), 'Quay');
    assert.equal(await labelOf('abc', ['menus/footer.json', 'menus/main.json']), 'The quay', 'in the menus\' order, trimmed');
    assert.equal(await labelOf('tide', ['menus/main.json', 'menus/footer.json']), 'Tides', 'a later menu\'s where no earlier one names the post');
    assert.ok(stand.asked.every(({ authorization, ref }) => authorization === 'token mine' && ref === 'main'));
  });

  test('is none for a post no entry names, an entry with no label of its own, a new post and a menu with no file', async () => {
    const labelOf = reader(forgejo(files));
    assert.equal(await labelOf('nowhere', ['menus/main.json', 'menus/footer.json']), '');
    assert.equal(await labelOf('bare', ['menus/main.json']), '', 'its title, which the name falls back to');
    assert.equal(await labelOf('', ['menus/main.json']), '');
    assert.equal(await labelOf('tide', ['menus/gone.json', 'menus/footer.json']), 'Tides');
  });

  // As the site reads the menus' files (breadcrumb-levels.js): a link leads to an address, not
  // to the post that answers there, so the post at /about/ is named by its title, "About us".
  test('is none for a post a link entry leads to by its address alone', async () => {
    assert.equal(await reader(forgejo(files))('about', ['menus/main.json']), '');
  });

  test('asks nothing while nobody is signed in', async () => {
    const stand = forgejo(files);
    assert.equal(await reader(stand, () => null)('abc', ['menus/main.json']), '');
    assert.deepEqual(stand.asked, []);
  });
});
