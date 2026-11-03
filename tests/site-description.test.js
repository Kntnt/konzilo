// The checker names every problem in a site description by its path, whatever
// the description holds: a value of the wrong kind is a problem to report, and
// never a crash that hides the others.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { siteDescription } from '../src/site-description.js';

for (const language of ['Swedish', 'sv-SE', '', 42, null, ['sv_SE']]) {
  test(`names a language of ${JSON.stringify(language)} as a problem, among the others`, () => {
    assert.throws(() => siteDescription({ language }), (error) => {
      assert.notEqual(error.name, 'ReferenceError', error.message);
      assert.match(error.message, new RegExp(`language: ${JSON.stringify(JSON.stringify(language)).slice(1, -1).replace(/[[\]]/g, '\\$&')} is not a locale`));
      assert.match(error.message, /types/);
      return true;
    });
  });
}
