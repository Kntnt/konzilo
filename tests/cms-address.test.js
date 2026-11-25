// The address a post's form shows, from its values as they stand: its slug, its date and the
// term its type's address holds, whose slug and parents are read from the source repository's
// term files against a stand-in for Forgejo.

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { formAddress, termIdIn, termPathReader } from '../src/cms/parts/address.js';

const encoded = (text) => Buffer.from(text).toString('base64');

// Forgejo's contents of the source repository, each file by its path, as an editor asks for them.
function forgejo(files) {
  const asked = [];
  const answer = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  const get = async (url) => {
    const path = decodeURIComponent(new URL(url).pathname.slice('/api/v1/repos/org/source/contents/'.length));
    asked.push(path);
    if (!Object.hasOwn(files, path)) return answer({ message: 'not found' }, 404);
    return answer({ type: 'file', path, content: encoded(`${JSON.stringify(files[path])}\n`), encoding: 'base64' });
  };
  return { asked, get };
}

const SITE = 'https://example.com/';

describe('the address a post\'s form shows', () => {
  test('follows its date, in UTC, and its term as they stand, and is none while a value is missing', () => {
    const data = { slug: 'lanterns', date: '2026-03-07T23:30:00Z', category: 'ptsdptsdptsd' };
    assert.equal(formAddress(SITE, '/{year}/{month}/{day}/{slug}/', data), 'https://example.com/2026/03/07/lanterns/');
    assert.equal(formAddress(SITE, '/{year}/{month}/{day}/{slug}/', { ...data, date: '2026-04-01T08:00:00Z' }), 'https://example.com/2026/04/01/lanterns/');
    assert.equal(formAddress(SITE, '/{category}/{slug}/', data, { category: 'health/ptsd' }), 'https://example.com/health/ptsd/lanterns/');
    assert.equal(formAddress(SITE, '/{category}/{slug}/', data), '');
    assert.equal(formAddress(SITE, '/sv/{year}/{slug}/', data), 'https://example.com/sv/2026/lanterns/');
    assert.equal(formAddress(SITE, '/{slug}/', { slug: 'lanterns', parent: 'aaaaaaaaaaaa' }), '', 'a post below another');
    assert.equal(formAddress(SITE, '/{year}/{slug}/', { slug: 'lanterns' }, {}, new Date('2027-01-02T00:00:00Z')), 'https://example.com/2027/lanterns/', 'a post with no date yet, from now');
  });

  test('reads a term\'s slug and its parents\' from their files, a slug made from a name where a file gives none', async () => {
    const stand = forgejo({
      'categories/healthhealth.json': { name: 'Health and care' },
      'categories/ptsdptsdptsd.json': { name: 'PTSD', slug: 'ptsd', parent: 'healthhealth' },
      'categories/sv-SE/newsnewsnews.json': { name: 'Nyheter', slug: 'nyheter' },
    });
    const pathOf = termPathReader({ api: 'http://git/api/v1', repository: 'org/source', branch: 'main', credential: () => 'token mine', get: stand.get });
    assert.equal(await pathOf('categories', 'ptsdptsdptsd'), 'health-and-care/ptsd');
    assert.equal(await pathOf('categories', 'newsnewsnews', 'sv-SE'), 'nyheter');
    assert.equal(await pathOf('categories', 'gonegonegone'), null);
    assert.equal(await pathOf('categories', null), null);
    const asked = stand.asked.length;
    await pathOf('categories', 'ptsdptsdptsd');
    assert.equal(stand.asked.length, asked, 'each file read once a while');
  });

  test('takes the one term a field holds, as a list or alone', () => {
    assert.equal(termIdIn(['aaaaaaaaaaaa']), 'aaaaaaaaaaaa');
    assert.equal(termIdIn('aaaaaaaaaaaa'), 'aaaaaaaaaaaa');
    assert.equal(termIdIn([]), null);
    assert.equal(termIdIn(undefined), null);
  });
});
