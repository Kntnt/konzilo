// The service's data (ADR 0044): one SQLite database in a volume of the site's own, which the
// archive, backups and restores carry. It holds the service's key, made once, from which its
// timing tokens and its digests of clients are derived; each form's submissions (ADR 0045), with
// how each one's mail stands; what an Admin keeps of each form, its recipients; and the service's
// settings, such as the mail adapter an Admin chooses (ADR 0003), none of which is in Git.
// Nothing in it holds a visitor's address, browser or referrer.
//
// Each change to what it holds is one step in STEPS, taken once, in order, and counted in the
// database's own `user_version`, so that a later duty, such as retention, adds a step of its own,
// such as a column of the form's, and a database made before it is brought up to it at the next
// start.

import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

// The file in the service's data folder.
export const STORE_FILE = 'service.sqlite';

const STEPS = [
  `CREATE TABLE secret (name TEXT PRIMARY KEY, value BLOB NOT NULL) STRICT;
   CREATE TABLE submission (
     id INTEGER PRIMARY KEY,
     form TEXT NOT NULL,
     sent_at TEXT NOT NULL,
     language TEXT NOT NULL,
     spam TEXT,
     fields TEXT NOT NULL
   ) STRICT;
   CREATE INDEX submission_by_form ON submission (form, sent_at);`,
  // Mail (ADR 0045): how each submission's mail stands, `pending` until the duty takes it, then
  // `sent`, `off`, `unaddressed` or `failed`, and none for spam and for what was kept before mail;
  // each form's recipients; and the service's settings, by name, each as JSON.
  `ALTER TABLE submission ADD COLUMN mail TEXT;
   ALTER TABLE submission ADD COLUMN mail_tries INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE submission ADD COLUMN mail_at TEXT;
   CREATE INDEX submission_mail_due ON submission (mail_at) WHERE mail = 'pending';
   CREATE TABLE form (name TEXT PRIMARY KEY, recipients TEXT NOT NULL DEFAULT '[]') STRICT;
   CREATE TABLE setting (name TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT;`,
  // Retention (ADR 0045): the days each form's submissions are kept, where an Admin has set them,
  // beside its recipients.
  'ALTER TABLE form ADD COLUMN retention INTEGER;',
];

// The store in `file`, made where there is none, and brought up to the last step. Two programs may
// hold it open at once, the service's two roles, each waiting a moment for the other's write.
//
// Gives { key, keep(submission), submissions(form), snapshot(form), counts(), mailDue(now),
// mailDone(id, outcome), mailLater(id, at), mailSoon(now), formSettings(), setFormSettings(form,
// settings), setting(name), setSetting(name, value), close() }:
// `key`, 32 bytes, the same from the first opening on; `keep` takes { form, sentAt, language,
// spam, fields }, `sentAt` a Date, `spam` null or why it was held as spam, and `fields` each
// { name, label, value }, and gives its number, its mail pending unless it is spam;
// `submissions` gives a form's, newest first, each as kept with its `id` and `sentAt` in
// ISO 8601, UTC, spam among them unless `spam` is false, from after the submission numbered
// `before` where it is given, and at most `limit`; `counts` gives how many each form holds that
// are not spam, by the form's name, of each form that holds one; and `snapshot` gives a form's as
// `submissions` does with `spam` false, from the data as it stood when they were first read,
// whatever is kept meanwhile: { each(), close() }, `each()` them one at a time as they are read,
// the same each time it is called, for what reads them twice and writes them out as it reads
// them, such as a file's columns and then its rows, and `close()` once they are read. It reads on
// a connection of its own, so that anything else asked of the store meanwhile is answered as the
// data stands.
//
// `mailDue` gives the submissions whose mail is pending and due by `now`, a Date, the oldest due
// first, each as `submissions` gives it with `tries`, how often its mail has failed; `mailDone`
// says how its mail ended, and `mailLater` that it failed and is due again at `at`; `mailSoon`
// makes every pending one due at `now`. `formSettings` gives what an Admin keeps of each form that
// has any, { recipients }, by the form's name, and `setFormSettings` keeps a form's. `setting`
// gives a setting by its name, as it was kept, or null, and `setSetting` keeps one, or forgets it
// for null.
export function openStore(file) {
  const database = new DatabaseSync(file);
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec('PRAGMA journal_mode = WAL');
  // What is forgotten is overwritten where it stood, rather than left in a page's free space.
  database.exec('PRAGMA secure_delete = ON');
  database.exec('BEGIN IMMEDIATE');
  try {
    const done = database.prepare('PRAGMA user_version').get().user_version;
    for (const [at, step] of STEPS.entries()) if (at >= done) database.exec(step);
    database.exec(`PRAGMA user_version = ${STEPS.length}`);
    database.prepare("INSERT OR IGNORE INTO secret (name, value) VALUES ('key', ?)").run(randomBytes(32));
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    database.close();
    throw error;
  }
  const key = Buffer.from(database.prepare("SELECT value FROM secret WHERE name = 'key'").get().value);

  const insert = database.prepare('INSERT INTO submission (form, sent_at, language, spam, fields, mail, mail_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const BY_FORM = `SELECT id, form, sent_at, language, spam, fields FROM submission
    WHERE form = :form AND (:spam OR spam IS NULL)
      AND (:before IS NULL OR (sent_at, id) < (SELECT sent_at, id FROM submission WHERE id = :before))
    ORDER BY sent_at DESC, id DESC LIMIT :limit`;
  const byForm = database.prepare(BY_FORM);
  const counted = database.prepare('SELECT form, COUNT(*) AS count FROM submission WHERE spam IS NULL GROUP BY form ORDER BY form');
  const due = database.prepare(`SELECT id, form, sent_at, language, spam, fields, mail_tries FROM submission
    WHERE mail = 'pending' AND mail_at <= ? ORDER BY mail_at, id LIMIT ?`);
  const done = database.prepare("UPDATE submission SET mail = ? WHERE id = ? AND mail = 'pending'");
  const again = database.prepare("UPDATE submission SET mail_tries = mail_tries + 1, mail_at = ? WHERE id = ? AND mail = 'pending'");
  const soon = database.prepare("UPDATE submission SET mail_at = ? WHERE mail = 'pending' AND mail_at > ?");
  const formsKept = database.prepare('SELECT name, recipients, retention FROM form ORDER BY name');
  const keepForm = database.prepare(`INSERT INTO form (name, recipients, retention) VALUES (?, ?, ?)
    ON CONFLICT (name) DO UPDATE SET recipients = excluded.recipients, retention = excluded.retention`);
  const formsHeld = database.prepare('SELECT DISTINCT form FROM submission ORDER BY form');
  const expireSent = database.prepare('DELETE FROM submission WHERE form = ? AND sent_at < ?');
  const expireSpam = database.prepare('DELETE FROM submission WHERE form = ? AND sent_at < ? AND spam IS NOT NULL');
  const settingOf = database.prepare('SELECT value FROM setting WHERE name = ?');
  const keepSetting = database.prepare('INSERT INTO setting (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value');
  const forgetSetting = database.prepare('DELETE FROM setting WHERE name = ?');

  // Whether something forgotten may still stand in the log of writes, until a checkpoint has
  // written the log into the database and emptied it. A checkpoint waits for no one: one that a
  // reading in progress holds back, such as a file being downloaded, is tried again later.
  let unsettled = false;
  const settle = () => {
    if (!unsettled) return;
    database.exec('PRAGMA busy_timeout = 0');
    try {
      if (Number(database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get().busy) === 0) unsettled = false;
    } finally {
      database.exec('PRAGMA busy_timeout = 5000');
    }
  };
  const forgot = (count) => {
    if (count > 0) {
      unsettled = true;
      settle();
    }
    return count;
  };

  const submissionOf = (row) => ({
    id: Number(row.id),
    form: row.form,
    sentAt: row.sent_at,
    language: row.language,
    spam: row.spam,
    fields: JSON.parse(row.fields),
  });

  return {
    key,
    keep({ form, sentAt, language, spam = null, fields }) {
      const at = sentAt.toISOString();
      return Number(insert.run(form, at, language, spam, JSON.stringify(fields), spam === null ? 'pending' : null, spam === null ? at : null).lastInsertRowid);
    },
    submissions(form, { spam = true, before = null, limit = null } = {}) {
      return byForm.all({ form, spam: spam ? 1 : 0, before, limit: limit ?? -1 }).map(submissionOf);
    },
    // A read transaction holds the data as it stood at its first read until it ends.
    snapshot(form) {
      const reading = new DatabaseSync(file, { readOnly: true });
      let open = true;
      try {
        reading.exec('PRAGMA busy_timeout = 5000');
        reading.exec('BEGIN');
      } catch (error) {
        reading.close();
        throw error;
      }
      return {
        * each() {
          for (const row of reading.prepare(BY_FORM).iterate({ form, spam: 0, before: null, limit: -1 })) yield submissionOf(row);
        },
        close() {
          if (!open) return;
          open = false;
          try {
            reading.exec('ROLLBACK');
          } finally {
            reading.close();
          }
        },
      };
    },
    counts() {
      return Object.fromEntries(counted.all().map(({ form, count }) => [form, Number(count)]));
    },
    mailDue(now, limit = 50) {
      return due.all(now.toISOString(), limit).map((row) => ({ ...submissionOf(row), tries: Number(row.mail_tries) }));
    },
    mailDone(id, outcome) {
      done.run(outcome, id);
    },
    mailLater(id, at) {
      again.run(at.toISOString(), id);
    },
    mailSoon(now) {
      soon.run(now.toISOString(), now.toISOString());
    },
    formSettings() {
      return Object.fromEntries(formsKept.all().map(({ name, recipients, retention }) => [name, { recipients: JSON.parse(recipients), retention: retention === null ? null : Number(retention) }]));
    },
    setFormSettings(form, { recipients, retention = null }) {
      keepForm.run(form, JSON.stringify(recipients), retention);
    },
    formsHeld() {
      return formsHeld.all().map(({ form }) => form);
    },
    expire(form, { before, spamBefore }) {
      return forgot(Number(expireSent.run(form, before.toISOString()).changes) + Number(expireSpam.run(form, spamBefore.toISOString()).changes));
    },
    settle,
    setting(name) {
      const row = settingOf.get(name);
      return row ? JSON.parse(row.value) : null;
    },
    setSetting(name, value) {
      if (value === null) forgetSetting.run(name);
      else keepSetting.run(name, JSON.stringify(value));
    },
    close() {
      database.close();
    },
  };
}
