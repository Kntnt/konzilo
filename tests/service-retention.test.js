// Each form's submissions kept for its retention, and spam for seven days (ADR 0044, ADR 0045), by
// the service's timed duty in its role for editors: what is older is gone, from the service's
// data, also once the service has started again.

import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { retentionDuty } from '../src/service/retention.js';
import { openStore } from '../src/service/store.js';

const field = (name, label, value) => ({ name, label, value });
const sent = (at, words, { form = 'contact', spam = null } = {}) => ({ form, sentAt: new Date(at), language: 'en-GB', spam, fields: [field('message', 'Message', words)] });
const words = (submissions) => submissions.map(({ fields }) => fields[0].value);

describe('keeping each form\'s submissions for its retention', () => {
  let folder;
  let file;
  let store;
  let clock;

  const duty = () => retentionDuty({ store, now: () => clock });

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-retention-'));
    file = join(folder, 'service.sqlite');
  });
  after(() => rmSync(folder, { recursive: true, force: true }));
  beforeEach(() => {
    rmSync(file, { force: true });
    store = openStore(file);
    clock = new Date('2026-12-31T12:00:00Z');
  });
  afterEach(() => store.close());

  test('forgets a submission older than its form\'s retention, 30 days until an Admin sets another, and keeps the rest', () => {
    store.keep(sent('2026-12-01T11:59:59Z', 'Thirty days and a second ago'));
    store.keep(sent('2026-12-01T12:00:01Z', 'A second under thirty days ago'));
    store.keep(sent('2026-12-21T11:59:59Z', 'Ten days and a second ago', { form: 'note' }));
    store.keep(sent('2026-12-21T12:00:01Z', 'A second under ten days ago', { form: 'note' }));
    store.setFormSettings('note', { recipients: [], retention: 10 });
    duty().run();
    assert.deepEqual(words(store.submissions('contact')), ['A second under thirty days ago']);
    assert.deepEqual(words(store.submissions('note')), ['A second under ten days ago']);
  });

  test('forgets spam after seven days, or after its form\'s retention where that is shorter', () => {
    store.keep(sent('2026-12-24T11:59:59Z', 'Spam of seven days and a second', { spam: 'trap' }));
    store.keep(sent('2026-12-24T12:00:01Z', 'Spam of a second under seven days', { spam: 'too-soon' }));
    store.keep(sent('2026-12-24T11:59:59Z', 'Kept for its form\'s thirty days'));
    store.keep(sent('2026-12-28T11:59:59Z', 'Spam of three days and a second', { form: 'note', spam: 'trap' }));
    store.keep(sent('2026-12-28T12:00:01Z', 'Spam of a second under three days', { form: 'note', spam: 'trap' }));
    store.setFormSettings('note', { recipients: [], retention: 3 });
    duty().run();
    assert.deepEqual(words(store.submissions('contact')), ['Spam of a second under seven days', 'Kept for its form\'s thirty days']);
    assert.deepEqual(words(store.submissions('note')), ['Spam of a second under three days']);
  });

  test('forgets what has grown too old while the service was stopped, once it starts again', () => {
    store.keep(sent('2026-12-22T12:00:00Z', 'Eleven days old at the start'));
    store.keep(sent('2026-12-30T12:00:00Z', 'Three days old at the start'));
    store.setFormSettings('contact', { recipients: [], retention: 10 });
    duty().run();
    assert.equal(store.submissions('contact').length, 2);
    store.close();
    clock = new Date('2027-01-02T12:00:00Z');
    store = openStore(file);
    duty().run();
    assert.deepEqual(words(store.submissions('contact')), ['Three days old at the start']);
  });

  test('keeps a form the site no longer declares for the retention it had, and a form it never had one for for 30 days', () => {
    store.keep(sent('2026-12-15T12:00:00Z', 'Sixteen days old', { form: 'retired' }));
    store.keep(sent('2026-11-30T12:00:00Z', 'Thirty-one days old', { form: 'forgotten' }));
    store.keep(sent('2026-12-02T12:00:00Z', 'Twenty-nine days old', { form: 'forgotten' }));
    store.setFormSettings('retired', { recipients: [], retention: 15 });
    duty().run();
    assert.deepEqual(store.submissions('retired'), []);
    assert.deepEqual(words(store.submissions('forgotten')), ['Twenty-nine days old']);
  });

  // The service's data goes into backups and the archive (ADR 0006), which must not carry what
  // was forgotten in the free space of the database's pages, or in its log of writes.
  test('leaves nothing of what it forgets in the service\'s data files', () => {
    const WORDS = 'A message to be forgotten, word for word';
    store.keep(sent('2026-11-01T12:00:00Z', WORDS));
    store.keep(sent('2026-12-30T12:00:00Z', 'Kept'));
    duty().run();
    assert.deepEqual(words(store.submissions('contact')), ['Kept']);
    for (const held of [file, `${file}-wal`]) {
      if (existsSync(held)) assert.ok(!readFileSync(held).includes(WORDS), held);
    }
  });
});
