// What the editor says of a form's lock and of a save older than the latest (ADR 0073), in both
// interface languages, a moment in the reader's own form and time zone.

import assert from 'node:assert/strict';
import { after, test } from 'node:test';

import { useInterfaceLanguage } from '../src/cms/interface-language.js';
import { conflictWords, lineWords, markWords } from '../src/cms/lock/words.js';

const zone = process.env.TZ;
process.env.TZ = 'Europe/Stockholm';
after(() => {
  process.env.TZ = zone;
  useInterfaceLanguage('en');
});

const EBBA = { name: 'Ebba Editor', since: '2026-11-23T10:00:00.000Z', yours: false };

test('names who holds a form and since when, the Editor\'s own other tab as such', () => {
  useInterfaceLanguage('en');
  assert.equal(lineWords({ mode: 'asking', holder: EBBA }), 'Ebba Editor has had this form open since 23 November 2026 at 11:00 CET.');
  assert.equal(lineWords({ mode: 'reading', holder: { ...EBBA, yours: true } }), 'You have had this form open in another tab since 23 November 2026 at 11:00 CET. You can read it here, but not change it.');
  assert.equal(lineWords({ mode: 'takenOver', holder: { name: 'Anna Admin', since: '2026-11-23T10:05:00.000Z', yours: false } }), 'Anna Admin took over this form at 23 November 2026 at 11:05 CET. Your unsaved changes stay in the fields to read and copy, and can no longer be saved.');
  useInterfaceLanguage('sv');
  assert.equal(lineWords({ mode: 'asking', holder: EBBA }), 'Ebba Editor har haft formuläret öppet sedan 23 november 2026 kl. 11:00 CET.');
});

test('marks an entry another tab holds by its holder\'s name', () => {
  useInterfaceLanguage('en');
  assert.equal(markWords({ name: 'Ebba Editor', yours: false }), 'Ebba Editor is editing');
  assert.equal(markWords({ name: 'Anna Admin', yours: true }), 'Open in your other tab');
});

test('refuses a save older than the latest naming the account of the later save and its moment', () => {
  useInterfaceLanguage('en');
  assert.deepEqual(conflictWords({ type: 'modified', name: 'ebba', date: new Date('2026-11-23T10:00:00Z') }), {
    description: 'ebba saved this entry on 23 November 2026 at 11:00 CET, after you opened it.',
    warning: 'Your changes are not saved over it, and nothing is overwritten. Reload to see the latest version; your changes are kept to read and copy.',
  });
  assert.equal(conflictWords({ type: 'modified', date: '2026-11-23T10:00:00Z' }).description, 'This entry was saved on 23 November 2026 at 11:00 CET, after you opened it.', 'Forgejo has no record of the account');
  assert.equal(conflictWords({ type: 'modified' }).description, 'This entry has been saved since you opened it.');
  assert.equal(conflictWords({ type: 'deleted' }).description, 'This entry has been deleted since you opened it.');
});

test('says a form waits for its lock, and that changes set aside as it was taken back can only be read', () => {
  useInterfaceLanguage('en');
  assert.equal(lineWords({ mode: 'checking' }), 'Checking that no other tab has this form open.');
  assert.equal(lineWords({ mode: 'staleBackup', at: '2026-11-23T10:05:00.000Z', takenOver: true }), 'These are your unsaved changes from before this form was taken over at 23 November 2026 at 11:05 CET. They can be read and copied, but not saved.');
  useInterfaceLanguage('sv');
  assert.equal(lineWords({ mode: 'checking' }), 'Kontrollerar att ingen annan flik har formuläret öppet.');
  assert.equal(lineWords({ mode: 'staleBackup', at: '2026-11-23T10:05:00.000Z', takenOver: true }), 'Det här är dina osparade ändringar från innan formuläret togs över 23 november 2026 kl. 11:05 CET. De kan läsas och kopieras, men inte sparas.');
});
