// Konzilo's own settings groups as settingsGroups() checks a declaration of them
// (src/settings-groups.js): each problem named by its path in the declaration.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import declared from '../src/format/settings-groups.json' with { type: 'json' };
import { settingsGroups } from '../src/settings-groups.js';

const problemsOf = (declaration) => {
  try {
    settingsGroups(declaration);
    return [];
  } catch (error) {
    return error.message.split('\n').slice(1).map((line) => line.trim());
  }
};

test('refuses `when` and `unless` on a group repeated for each form, each by its own path', () => {
  const whenAndUnless = problemsOf({ ...declared, forms: { ...declared.forms, when: ['types.*.address'], unless: ['languages'] } });
  assert.deepEqual(whenAndUnless.filter((problem) => problem.startsWith('forms.')), [
    'forms.when: a group repeated for each form applies to every site that declares one',
    'forms.unless: a group repeated for each form applies to every site that declares one',
  ]);
  const unless = problemsOf({ ...declared, forms: { ...declared.forms, unless: ['languages'] } });
  assert.deepEqual(unless.filter((problem) => problem.startsWith('forms.')), ['forms.unless: a group repeated for each form applies to every site that declares one']);
  assert.deepEqual(problemsOf(declared), []);
});
