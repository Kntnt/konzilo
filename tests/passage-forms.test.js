// The form each source file is edited in, by Sveltia's configuration, which the *Purge a passage*
// page links each file that holds a passage to (ADR 0078): a post's, a term's or an image library
// entry's by its ID, in any language, a menu's and the settings' by their file, and none for a
// file no form edits.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formOfPath } from '../src/cms/passage/forms.js';

const COLLECTIONS = [
  { name: 'articles', label: 'Articles', folder: 'articles', extension: 'md' },
  { name: 'topics', label: 'Topics', folder: 'topics', extension: 'json' },
  { name: 'image-library', label: 'Image library', folder: 'image-library', extension: 'json' },
  { name: 'settings', label: 'Settings', files: [{ name: 'settings', label: 'Settings', file: 'settings.json' }] },
  { name: 'menus', label: 'Menus', files: [{ name: 'main-sv-SE', label: 'Main menu (sv-SE)', file: 'menus/sv-SE/main.json' }] },
];

test('names the form a source file is edited in, and where it opens', () => {
  assert.deepEqual(formOfPath(COLLECTIONS, 'articles/aaaaaaaaaaaa.md'), { collection: 'articles', entry: 'aaaaaaaaaaaa', label: 'Articles', file: false, hash: '#/collections/articles/entries/aaaaaaaaaaaa' });
  assert.deepEqual(formOfPath(COLLECTIONS, 'articles/sv-SE/aaaaaaaaaaaa.md')?.entry, 'aaaaaaaaaaaa');
  assert.deepEqual(formOfPath(COLLECTIONS, 'image-library/bbbbbbbbbbbb.json')?.hash, '#/collections/image-library/entries/bbbbbbbbbbbb');
  assert.deepEqual(formOfPath(COLLECTIONS, 'settings.json'), { collection: 'settings', entry: 'settings', label: 'Settings', file: true, hash: '#/collections/settings/entries/settings' });
  assert.deepEqual(formOfPath(COLLECTIONS, 'menus/sv-SE/main.json')?.label, 'Main menu (sv-SE)');
});

test('names none for a file no form edits', () => {
  assert.equal(formOfPath(COLLECTIONS, 'redirects.json'), null);
  assert.equal(formOfPath(COLLECTIONS, 'articles-old/aaaaaaaaaaaa.md'), null);
  assert.equal(formOfPath(COLLECTIONS, 'articles/a/b/aaaaaaaaaaaa.md'), null);
});
