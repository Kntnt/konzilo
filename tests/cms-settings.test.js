// A setting with a default in the editor (ADR 0033): its field shows the default while the
// settings file holds no value, and choosing the default again leaves the file with none, so that
// a default the core changes reaches the site.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { keptValue, shownValue } from '../src/cms/settings/value.js';

test('shows the default while the setting holds no value, and what it holds otherwise', () => {
  for (const none of [undefined, null, '']) {
    assert.equal(shownValue(none, true), true);
    assert.equal(shownValue(none, 90), 90);
    assert.equal(shownValue(none, 'The summary'), 'The summary');
  }
  assert.equal(shownValue(false, true), false, 'a switch turned off is off');
  assert.equal(shownValue(0, 90), 0);
  assert.equal(shownValue(30, 90), 30);
  assert.equal(shownValue('The whole text', 'The summary'), 'The whole text');
});

test('leaves the setting with no value when its default is chosen again, or when it is emptied, and keeps any other', () => {
  assert.equal(keptValue(true, true), '');
  assert.equal(keptValue(90, 90), '');
  assert.equal(keptValue('–', '–'), '');
  assert.equal(keptValue(false, true), false);
  assert.equal(keptValue(30, 90), 30);
  assert.equal(keptValue('|', '–'), '|');
  for (const none of [undefined, null, '']) assert.equal(keptValue(none, 90), '', 'the default again, as the site would have it');
});
