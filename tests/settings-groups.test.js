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

test('lets a text list the defaults it once had, `formerDefaults`, each a text, and no other setting', () => {
  const consent = (setting) => problemsOf({ ...declared, consent: { ...declared.consent, settings: { ...declared.consent.settings, ...setting } } }).filter((problem) => problem.startsWith('consent.'));
  assert.deepEqual(consent({}), []);
  assert.deepEqual(consent({ bannerText: { ...declared.consent.settings.bannerText, formerDefaults: ['An old text.', ''] } }), ['consent.settings.bannerText.formerDefaults: must be a list of the texts the setting once had as its default']);
  assert.deepEqual(consent({ bannerText: { ...declared.consent.settings.bannerText, formerDefaults: 'An old text.' } }), ['consent.settings.bannerText.formerDefaults: must be a list of the texts the setting once had as its default']);
  const related = problemsOf({ ...declared, related: { ...declared.related, settings: { ...declared.related.settings, freshness: { ...declared.related.settings.freshness, formerDefaults: ['false'] } } } });
  assert.deepEqual(related.filter((problem) => problem.startsWith('related.')), ['related.settings.freshness.formerDefaults: only a text has former defaults']);
});
