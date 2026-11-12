// A form's submissions mailed to its recipients (ADR 0045), by the service's timed duty in its role
// for editors (ADR 0044): each submission once, in its page's language, through the adapter an
// Admin chooses (ADR 0003), and none while mail is off, to a form with no recipients, or of spam.
// The duty is handed what delivers a mail; the SMTP adapter itself is proved in
// service-smtp.test.js.

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';

import { mailDuty } from '../src/service/mail.js';
import { openStore } from '../src/service/store.js';

const forms = {
  contact: { label: { en: 'Contact us', sv: 'Kontakta oss' }, fields: [{ name: 'name', kind: 'text' }, { name: 'email', kind: 'email' }, { name: 'message', kind: 'textarea' }] },
  note: { label: 'A note', fields: [] },
};
const SMTP = { adapter: 'smtp', smtp: { host: 'smtp.example.com', port: 587, security: 'starttls', username: 'site@example.com', password: 'a secret', sender: 'site@example.com' } };

const field = (name, label, value) => ({ name, label, value });
const submission = (at, { form = 'contact', spam = null, language = 'en-GB', fields = [field('name', 'Name', 'Ada'), field('message', 'Message', 'Hello')] } = {}) => ({ form, sentAt: new Date(at), language, spam, fields });

describe('mailing a form\'s submissions', () => {
  let folder;
  let store;
  let clock;
  let delivered;
  let failing;
  let warned;

  const duty = () => mailDuty({
    store,
    forms: () => forms,
    now: () => clock,
    warn: (line) => warned.push(line),
    deliver: async (settings, mail) => {
      if (failing) throw new Error(failing);
      delivered.push({ settings, mail });
      return { refused: [] };
    },
  });
  const later = (minutes) => {
    clock = new Date(clock.getTime() + minutes * 60_000);
  };

  before(() => {
    folder = mkdtempSync(join(tmpdir(), 'konzilo-mail-'));
  });
  after(() => rmSync(folder, { recursive: true, force: true }));
  beforeEach(() => {
    rmSync(join(folder, 'service.sqlite'), { force: true });
    store = openStore(join(folder, 'service.sqlite'));
    clock = new Date('2026-11-12T10:00:00Z');
    delivered = [];
    failing = null;
    warned = [];
  });
  afterEach(() => store.close());

  test('mails a submission to its form\'s recipients once, in its page\'s language, from the sender an Admin names', async () => {
    store.setSetting('mail', SMTP);
    store.setFormSettings('contact', { recipients: ['anna@example.com', 'bo@example.com'] });
    store.keep(submission('2026-11-12T09:59:50Z', { language: 'sv-SE', fields: [field('name', 'Namn', 'Ada'), field('email', 'E-post', 'ada@example.com'), field('message', 'Meddelande', 'Hej\noch hå'), field('privacy', 'Jag har läst', true), field('interests', 'Intressen', ['Webb', 'Tryck'])] }));
    await duty().run();
    await duty().run();
    assert.equal(delivered.length, 1, 'once');
    const [{ settings, mail }] = delivered;
    assert.deepEqual(settings, SMTP);
    assert.deepEqual(mail, {
      from: 'site@example.com',
      to: ['anna@example.com', 'bo@example.com'],
      replyTo: 'ada@example.com',
      subject: 'Nytt inskick: Kontakta oss',
      language: 'sv-SE',
      date: new Date('2026-11-12T09:59:50Z'),
      text: [
        'Det här skickades med formuläret Kontakta oss.',
        '',
        'Namn',
        'Ada',
        '',
        'E-post',
        'ada@example.com',
        '',
        'Meddelande',
        'Hej',
        'och hå',
        '',
        'Jag har läst',
        'Ja',
        '',
        'Intressen',
        'Webb, Tryck',
        '',
        'Alla inskick finns på sidan Inskick i redigeraren.',
        '',
      ].join('\n'),
    });
  });

  test('names a form by its name once the site no longer declares it, in British English for a language without a catalogue, and answers to no one where it has no email field', async () => {
    store.setSetting('mail', SMTP);
    store.setFormSettings('retired', { recipients: ['anna@example.com'] });
    store.keep(submission('2026-11-12T09:59:50Z', { form: 'retired', language: 'de-DE', fields: [field('email', 'Email', 'ada@example.com'), field('copy', 'Keep me posted', false)] }));
    await duty().run();
    assert.equal(delivered.length, 1);
    const { mail } = delivered[0];
    assert.equal(mail.subject, 'New submission: retired');
    assert.equal(mail.replyTo, null);
    assert.equal(mail.text, 'This was sent with the form retired.\n\nEmail\nada@example.com\n\nKeep me posted\nNo\n\nEvery submission is on the Submissions page in the editor.\n');
  });

  test('mails nothing while mail is off, and nothing kept meanwhile once an Admin turns it on', async () => {
    store.setFormSettings('contact', { recipients: ['anna@example.com'] });
    store.keep(submission('2026-11-12T09:59:00Z'));
    await duty().run();
    store.setSetting('mail', { ...SMTP, adapter: 'none' });
    store.keep(submission('2026-11-12T09:59:30Z'));
    await duty().run();
    store.setSetting('mail', SMTP);
    await duty().run();
    assert.deepEqual(delivered, []);
    store.keep(submission('2026-11-12T09:59:50Z'));
    await duty().run();
    assert.equal(delivered.length, 1, 'what comes once it is on');
  });

  test('mails spam to no one, nor a submission of a form with no recipients, then or later', async () => {
    store.setSetting('mail', SMTP);
    store.keep(submission('2026-11-12T09:59:00Z', { spam: 'trap' }));
    store.keep(submission('2026-11-12T09:59:00Z', { form: 'note' }));
    store.setFormSettings('contact', { recipients: ['anna@example.com'] });
    store.setFormSettings('note', { recipients: [] });
    await duty().run();
    store.setFormSettings('note', { recipients: ['anna@example.com'] });
    await duty().run();
    assert.deepEqual(delivered, []);
  });

  test('tries a mail that could not be sent again later, ever later, and gives it up a day after it was sent, saying why each time', async () => {
    store.setSetting('mail', SMTP);
    store.setFormSettings('contact', { recipients: ['anna@example.com'] });
    store.keep(submission('2026-11-12T10:00:00Z'));
    failing = 'smtp.example.com answered 535 Wrong to signing in';
    await duty().run();
    assert.deepEqual(store.setting('mail-failure'), { at: '2026-11-12T10:00:00.000Z', reason: failing });
    assert.match(warned.at(-1), /could not mail submission 1 of contact, and tries again at 2026-11-12T10:01:00.000Z: smtp\.example\.com answered 535/);
    later(0.5);
    await duty().run();
    assert.equal(warned.length, 1, 'not before its moment');
    later(0.5);
    await duty().run();
    assert.match(warned.at(-1), /tries again at 2026-11-12T10:03:00.000Z/);

    failing = null;
    later(2);
    await duty().run();
    assert.equal(delivered.length, 1, 'sent once the server takes it');
    assert.equal(store.setting('mail-failure'), null, 'and the failure is no longer shown');

    store.keep(submission('2026-11-12T10:03:00Z'));
    failing = 'smtp.example.com answered 421 Busy';
    for (let hours = 0; hours <= 25; hours += 1) {
      await duty().run();
      later(60);
    }
    assert.match(warned.at(-1), /gave up mailing submission 2 of contact, a day after it was sent: smtp\.example\.com answered 421 Busy/);
    const tries = warned.filter((line) => line.includes('submission 2 of contact')).length;
    failing = null;
    await duty().run();
    assert.equal(delivered.length, 1, 'given up');
    assert.ok(tries < 30, `${tries} tries, an hour apart at most`);
  });

  test('after an Admin changes the settings, tries at once what waits to be tried again', async () => {
    store.setSetting('mail', SMTP);
    store.setFormSettings('contact', { recipients: ['anna@example.com'] });
    store.keep(submission('2026-11-12T10:00:00Z'));
    failing = 'smtp.example.com answered 535 Wrong to signing in';
    await duty().run();
    failing = null;
    store.mailSoon(clock);
    await duty().run();
    assert.equal(delivered.length, 1);
  });

  test('brings a store kept before mail up to it, and mails none of the submissions it held', async () => {
    const file = join(folder, 'older.sqlite');
    rmSync(file, { force: true });
    const older = new DatabaseSync(file);
    older.exec(`CREATE TABLE secret (name TEXT PRIMARY KEY, value BLOB NOT NULL) STRICT;
      CREATE TABLE submission (id INTEGER PRIMARY KEY, form TEXT NOT NULL, sent_at TEXT NOT NULL, language TEXT NOT NULL, spam TEXT, fields TEXT NOT NULL) STRICT;
      CREATE INDEX submission_by_form ON submission (form, sent_at);
      PRAGMA user_version = 1;`);
    older.prepare('INSERT INTO submission (form, sent_at, language, spam, fields) VALUES (?, ?, ?, ?, ?)').run('contact', '2026-11-11T10:00:00.000Z', 'en-GB', null, '[]');
    older.close();
    const brought = openStore(file);
    try {
      assert.equal(brought.submissions('contact').length, 1, 'what it held is kept');
      brought.setSetting('mail', SMTP);
      brought.setFormSettings('contact', { recipients: ['anna@example.com'] });
      assert.deepEqual(brought.mailDue(clock), []);
      brought.keep(submission('2026-11-12T09:59:00Z'));
      assert.equal(brought.mailDue(clock).length, 1, 'what comes after it is mailed');
    } finally {
      brought.close();
    }
  });
});
