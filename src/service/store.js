// The service's data (ADR 0044): one SQLite database in a volume of the site's own, which the
// archive, backups and restores carry. It holds the service's key, made once, from which its
// timing tokens and its digests of clients are derived, and each form's submissions (ADR 0045).
// Nothing in it holds a visitor's address, browser or referrer.
//
// Each change to what it holds is one step in STEPS, taken once, in order, and counted in the
// database's own `user_version`, so that a later duty, such as mail or retention, adds a step of
// its own and a database made before it is brought up to it at the next start.

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
];

// The store in `file`, made where there is none, and brought up to the last step. Two programs may
// hold it open at once, the service's two roles, each waiting a moment for the other's write.
//
// Gives { key, keep(submission), submissions(form), eachSubmission(form), counts(), close() }:
// `key`, 32 bytes, the same from the first opening on; `keep` takes { form, sentAt, language, spam, fields }, `sentAt` a Date,
// `spam` null or why it was held as spam, and `fields` each { name, label, value }, and gives its
// number; `submissions` gives a form's, newest first, each as kept with its `id` and `sentAt` in
// ISO 8601, UTC, spam among them unless `spam` is false, from after the submission numbered
// `before` where it is given, and at most `limit`; `counts` gives how many each form holds that
// are not spam, by the form's name, of each form that holds one; and `eachSubmission` gives a
// form's as `submissions` does with `spam` false, one at a time as they are read, for what writes
// them out as it reads them, while anything else is asked of the store meanwhile.
export function openStore(file) {
  const database = new DatabaseSync(file);
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec('PRAGMA journal_mode = WAL');
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

  const insert = database.prepare('INSERT INTO submission (form, sent_at, language, spam, fields) VALUES (?, ?, ?, ?, ?)');
  const BY_FORM = `SELECT id, form, sent_at, language, spam, fields FROM submission
    WHERE form = :form AND (:spam OR spam IS NULL)
      AND (:before IS NULL OR (sent_at, id) < (SELECT sent_at, id FROM submission WHERE id = :before))
    ORDER BY sent_at DESC, id DESC LIMIT :limit`;
  const byForm = database.prepare(BY_FORM);
  const counted = database.prepare('SELECT form, COUNT(*) AS count FROM submission WHERE spam IS NULL GROUP BY form ORDER BY form');

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
      return Number(insert.run(form, sentAt.toISOString(), language, spam, JSON.stringify(fields)).lastInsertRowid);
    },
    submissions(form, { spam = true, before = null, limit = null } = {}) {
      return byForm.all({ form, spam: spam ? 1 : 0, before, limit: limit ?? -1 }).map(submissionOf);
    },
    // A statement of its own, which nothing else asked meanwhile resets.
    * eachSubmission(form) {
      for (const row of database.prepare(BY_FORM).iterate({ form, spam: 0, before: null, limit: -1 })) yield submissionOf(row);
    },
    counts() {
      return Object.fromEntries(counted.all().map(({ form, count }) => [form, Number(count)]));
    },
    close() {
      database.close();
    },
  };
}
