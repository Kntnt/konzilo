// The consent records (ADR 0049): the site's proof of each choice a visitor makes on its own pages,
// which the consent client sends to /_konzilo/consent (src/consent/client.js) and the service
// keeps for 13 months.
//
// - In its role for visitors, the service takes a record only from a page of the site's own, of a
//   consent revision the site has published, with exactly that revision's categories and services,
//   and stores the consent ID, the time, the revision, the states, how the choice was made, the
//   page's path and its language, and nothing of the visitor: no address and no browser. Over
//   3600 records in one of the clock's hours, or over 100 of one client in its window of ten
//   minutes (visitors.js), a record is counted, not stored, and answered `429`, so that the client
//   keeps it beside the choice and sends it once more at a later page view.
// - Each revision is kept with what its pages showed the visitor, in each language, which every
//   public build writes beside the release's pages (src/astro/consent.js) and the role for
//   visitors reads from the release in use, as it moves, before it decides on a record: a record
//   from a new release finds its revision there.
// - In its role for editors, a timed duty forgets a record, and a day's count of those not
//   stored, 13 months after it, overwritten where it stood, as a submission is (ADR 0044).

import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { RELEASE_CONSENT_REVISION } from '../build/release.js';
import { CONSENT_ID } from '../consent/consent-id.js';
import { DAY } from './day.js';

export const CONSENT_RECORDS_PATH = '/_konzilo/consent';

// The service's data for the records (ADR 0044), a numbered step of store.js: each revision's
// words, a version for each language and each time its pages' words changed, from when the
// release that showed them went live; each record; and how many were counted, not stored, on
// each day, in UTC.
export const CONSENT_RECORDS_STEP = `CREATE TABLE consent_revision (
     id INTEGER PRIMARY KEY,
     revision TEXT NOT NULL,
     categories TEXT NOT NULL,
     language TEXT NOT NULL,
     shown TEXT NOT NULL,
     since TEXT NOT NULL
   ) STRICT;
   CREATE INDEX consent_revision_by_language ON consent_revision (revision, language, since);
   CREATE TABLE consent_record (
     id INTEGER PRIMARY KEY,
     consent_id TEXT NOT NULL,
     chosen TEXT NOT NULL,
     revision TEXT NOT NULL,
     categories TEXT NOT NULL,
     services TEXT NOT NULL,
     how TEXT NOT NULL,
     control TEXT NOT NULL,
     path TEXT NOT NULL,
     language TEXT NOT NULL,
     UNIQUE (consent_id, chosen)
   ) STRICT;
   CREATE INDEX consent_record_by_time ON consent_record (chosen);
   CREATE TABLE consent_unstored (day TEXT PRIMARY KEY, count INTEGER NOT NULL) STRICT;`;

// The records in the store, on its `database`, opened from `file`. `forgot(count)` overwrites
// what was just forgotten and empties the log of writes, as store.js does for a submission.
//
// Gives { keepRevision(published, at), revision(revision), keep(record), notStored(at), of(id),
// days(from, to), snapshot(from, to), expire(before) }:
// `keepRevision` keeps a revision as a release holds it, { revision, categories, languages }, each
// language's words a version of their own from `at`, a Date, the moment the release went live,
// where they are not the words its latest version holds; `revision` gives { categories,
// languages } of a revision kept, or null. `keep` stores a record as the client sends it, once:
// the same consent ID and time again change nothing. `notStored` counts one record not stored on
// the day of `at`. `of` gives a consent ID's records, oldest first, each with `shown`, what its
// revision's pages showed in its language at its time, the version live then, or the first one
// for a record made before any, by a visitor's clock behind the site's, or null where none was
// kept. `days` gives, for each day from `from` to `to`, `YYYY-MM-DD` in UTC, how many
// records each control made, and how many were not stored. `snapshot` gives the records of those
// days, oldest first, from the data as it stood when they were first read: { each(), close() }.
// `expire` forgets the records made before `before`, a Date, and the counts of the days before
// its day, and gives how many records.
export function consentRecordStore(database, { file, forgot }) {
  const keepVersion = database.prepare('INSERT INTO consent_revision (revision, categories, language, shown, since) VALUES (?, ?, ?, ?, ?)');
  const latestVersion = database.prepare('SELECT shown FROM consent_revision WHERE revision = ? AND language = ? ORDER BY since DESC, id DESC LIMIT 1');
  const revisionOf = database.prepare('SELECT categories, language FROM consent_revision WHERE revision = ? ORDER BY language');
  const insert = database.prepare(`INSERT OR IGNORE INTO consent_record (consent_id, chosen, revision, categories, services, how, control, path, language)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const count = database.prepare('INSERT INTO consent_unstored (day, count) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET count = count + 1');
  const byId = database.prepare(`SELECT r.consent_id, r.chosen, r.revision, r.categories, r.services, r.how, r.control, r.path, r.language,
      (SELECT v.shown FROM consent_revision v WHERE v.revision = r.revision AND v.language = r.language
        ORDER BY v.since <= r.chosen DESC, CASE WHEN v.since <= r.chosen THEN v.since END DESC, v.since ASC, v.id DESC LIMIT 1) AS shown
    FROM consent_record r WHERE r.consent_id = ? ORDER BY r.chosen, r.id`);
  const RECORDS = `SELECT consent_id, chosen, revision, categories, services, how, control, path, language FROM consent_record
    WHERE chosen >= :from AND chosen < :to ORDER BY chosen, id`;
  const byDay = database.prepare(`SELECT substr(chosen, 1, 10) AS day, control, COUNT(*) AS count FROM consent_record
    WHERE chosen >= ? AND chosen < ? GROUP BY day, control`);
  const unstored = database.prepare('SELECT day, count FROM consent_unstored WHERE day >= ? AND day <= ?');
  const expireRecords = database.prepare('DELETE FROM consent_record WHERE chosen < ?');
  const expireCounts = database.prepare('DELETE FROM consent_unstored WHERE day < ?');

  const recordOf = (row) => ({
    id: row.consent_id,
    chosen: row.chosen,
    revision: row.revision,
    categories: JSON.parse(row.categories),
    services: JSON.parse(row.services),
    how: row.how,
    control: row.control,
    path: row.path,
    language: row.language,
  });
  // The first moment after a day, `YYYY-MM-DD`.
  const dayAfter = (day) => new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString();

  return {
    keepRevision({ revision, categories, languages }, at) {
      for (const [language, words] of Object.entries(languages)) {
        const shown = JSON.stringify(words);
        if (latestVersion.get(revision, language)?.shown !== shown) keepVersion.run(revision, JSON.stringify(categories), language, shown, at.toISOString());
      }
    },
    revision(revision) {
      const rows = revisionOf.all(revision);
      if (rows.length === 0) return null;
      return { categories: JSON.parse(rows[0].categories), languages: [...new Set(rows.map(({ language }) => language))] };
    },
    keep({ id, chosen, revision, categories, services, how, control, path, language }) {
      insert.run(id, chosen, revision, JSON.stringify(categories), JSON.stringify(services), how, control, path, language);
    },
    notStored(at) {
      count.run(at.toISOString().slice(0, 10));
    },
    of(id) {
      return byId.all(id).map((row) => ({ ...recordOf(row), shown: row.shown === null ? null : JSON.parse(row.shown) }));
    },
    days(from, to) {
      const found = new Map();
      for (let day = from; day <= to; day = dayAfter(day).slice(0, 10)) found.set(day, { day, ...Object.fromEntries(CONTROLS.map((control) => [control, 0])), notStored: 0 });
      for (const { day, control, count: made } of byDay.all(`${from}T00:00:00.000Z`, dayAfter(to))) {
        if (found.has(day) && CONTROLS.includes(control)) found.get(day)[control] = Number(made);
      }
      for (const { day, count: made } of unstored.all(from, to)) found.get(day).notStored = Number(made);
      return [...found.values()];
    },
    // A read transaction holds the data as it stood at its first read until it ends.
    snapshot(from, to) {
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
          for (const row of reading.prepare(RECORDS).iterate({ from: `${from}T00:00:00.000Z`, to: dayAfter(to) })) yield recordOf(row);
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
    expire(before) {
      const forgotten = Number(expireRecords.run(before.toISOString()).changes);
      const counts = Number(expireCounts.run(before.toISOString().slice(0, 10)).changes);
      forgot(forgotten + counts);
      return forgotten;
    },
  };
}

// How a choice was made, the part of the consent it was made in and its control, as the client
// names them, and the controls the Admin's page counts.
const HOWS = ['banner', 'dialog', 'placeholder', 'withdrawal'];
export const CONTROLS = ['accept', 'reject', 'save', 'allow', 'withdraw'];

// A record's fields, exactly.
const FIELDS = ['id', 'chosen', 'revision', 'categories', 'services', 'how', 'control', 'path', 'language'].sort();

// A moment as the client writes it, Date's own ISO 8601, in UTC.
const MOMENT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;
// A consent revision, a hash's first 16 hexadecimal digits (src/consent/registry.js).
const REVISION = /^[0-9a-f]{16}$/;
// A page's path, as a browser writes one, in printable ASCII, with no space or backslash.
const PATH = /^\/(?![/\\])[\x21-\x5b\x5d-\x7e]*$/;

// The most a record takes, as JSON: its states, one for each of the site's services.
const BODY_LIMIT = 32 * 1024;

// A record the client sent at `at` is taken up to a day after it, by a visitor's clock that runs
// ahead, and up to its 13 months before.
const AHEAD = DAY;

// The moment `months` before `at`, on the same day of the month, or on the last day of a month
// too short to have it: 13 months before 31 December is 30 November.
export const monthsBefore = (at, months) => {
  const date = new Date(at);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() - months);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, last));
  return date;
};

// Records are kept 13 months (ADR 0049).
export const RECORD_MONTHS = 13;

// How soon a release's revision that could not be read is read again, in milliseconds.
const AGAIN = 1000;

// The limits: records in one of the clock's hours, and of one client in its window.
const IN_AN_HOUR = 3600;
const OF_A_CLIENT = 100;
const HOUR = 60 * 60_000;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

// The states of a record, an object of booleans with exactly `names` as its keys.
const statesOf = (given, names) => isObject(given)
  && Object.keys(given).length === names.length
  && names.every((name) => typeof given[name] === 'boolean');

// A record as the client sends it, as JSON, or null for anything else: a body that is no record,
// or a record with a field more or less, or a field of another shape.
function recordIn(body, now) {
  let given;
  try {
    given = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
  if (!isObject(given) || JSON.stringify(Object.keys(given).sort()) !== JSON.stringify(FIELDS)) return null;
  const { id, chosen, revision, how, control, path, language } = given;
  if (typeof id !== 'string' || !CONSENT_ID.test(id)) return null;
  if (typeof chosen !== 'string' || !MOMENT.test(chosen) || Number.isNaN(Date.parse(chosen))) return null;
  const at = Date.parse(chosen);
  if (at > now.getTime() + AHEAD || at < monthsBefore(now, RECORD_MONTHS).getTime()) return null;
  if (typeof revision !== 'string' || !REVISION.test(revision)) return null;
  if (!HOWS.includes(how) || !CONTROLS.includes(control)) return null;
  if (typeof path !== 'string' || path.length > 2048 || !PATH.test(path)) return null;
  if (typeof language !== 'string' || language.length > 64 || !/^[A-Za-z0-9-]+$/.test(language)) return null;
  return given;
}

// Whether a record names exactly its revision's categories and services, and a language its pages
// were shown in.
function matches(record, { categories, languages }) {
  const services = [...new Set(Object.values(categories).flat())];
  return statesOf(record.categories, Object.keys(categories))
    && statesOf(record.services, services)
    && languages.includes(record.language);
}

// The consent revisions the site has published, from the releases in `folder`, as the web server
// serves them (src/build/release.js): `current`, the release in use, holds its revision with what
// its pages showed, which is kept in `store` as soon as `current` has moved to it, from the moment
// it moved, which the link's own time says, since the builder makes a new link to move it. A
// release whose revision could not be read, as one read while it was written, is read again at
// the next look, at most once a second, and said in the log once. `now()`: the moment.
//
// Gives { look() }, which keeps the revision of the release in use where `current` has moved since
// it was last read.
export function publishedRevisions({ folder, store, warn = console.error, now = () => new Date() }) {
  // The release whose revision was last kept, and the one that could not be read, with when.
  let seen;
  let failed = null;
  const unread = (at, why) => {
    if (failed?.at !== at && why !== null) warn(`The service could not read the consent revision of the release in use: ${why}`);
    failed = { at, tried: now().getTime() };
  };
  return {
    look() {
      if (folder === null) return;
      let at;
      try {
        at = readlinkSync(join(folder, 'current'));
      } catch {
        at = null;
      }
      if (at === seen) return;
      if (failed?.at === at && now().getTime() - failed.tried < AGAIN) return;
      if (at === null) {
        seen = null;
        failed = null;
        return;
      }
      let held;
      let live;
      try {
        live = lstatSync(join(folder, 'current')).mtime;
        held = JSON.parse(readFileSync(join(folder, 'current', RELEASE_CONSENT_REVISION), 'utf8'));
      } catch (error) {
        unread(at, error.code === 'ENOENT' ? null : error.message);
        return;
      }
      if (!isRevision(held)) {
        unread(at, `${RELEASE_CONSENT_REVISION} is not one`);
        return;
      }
      store.consentRecords.keepRevision(held, live);
      seen = at;
      failed = null;
    },
  };
}

// Whether a release's file holds a consent revision, as the build writes one: { revision,
// categories, languages }, each category its services' ids, and each language's words an object.
const isRevision = (held) => isObject(held)
  && typeof held.revision === 'string' && REVISION.test(held.revision)
  && isObject(held.categories) && Object.values(held.categories).every((services) => Array.isArray(services) && services.every((service) => typeof service === 'string'))
  && isObject(held.languages) && Object.values(held.languages).every(isObject);

// The kind (ADR 0044) that takes the records. `store`: as store.js opens it. `revisions`: as
// publishedRevisions() gives them. `now()`: the moment.
export function consentRecordsKind({ store, revisions, now }) {
  // How many records were taken in the clock's hour, and of each client in its window, by its
  // digest, held in memory alone and forgotten as the hour or the window ends.
  const hour = { at: null, count: 0 };
  const clients = { window: null, by: new Map() };

  return {
    path: CONSENT_RECORDS_PATH,
    methods: ['POST'],
    types: ['application/json'],
    limit: BODY_LIMIT,

    take({ below, body, fromSite, client }) {
      if (below !== '') return { status: 404 };
      if (!fromSite) return { status: 403, json: { outcome: 'refused' } };
      const moment = now();
      const record = recordIn(body, moment);
      if (record === null) return { status: 400, json: { outcome: 'refused' } };
      revisions.look();
      const revision = store.consentRecords.revision(record.revision);
      if (revision === null || !matches(record, revision)) return { status: 400, json: { outcome: 'refused' } };

      const thisHour = Math.floor(moment.getTime() / HOUR);
      if (hour.at !== thisHour) Object.assign(hour, { at: thisHour, count: 0 });
      if (clients.window !== client.ends.getTime()) {
        clients.window = client.ends.getTime();
        clients.by.clear();
      }
      const ofClient = clients.by.get(client.digest) ?? 0;
      hour.count += 1;
      clients.by.set(client.digest, ofClient + 1);
      if (hour.count > IN_AN_HOUR || ofClient + 1 > OF_A_CLIENT) {
        store.consentRecords.notStored(moment);
        const ends = hour.count > IN_AN_HOUR ? (thisHour + 1) * HOUR : client.ends.getTime();
        return { status: 429, json: { outcome: 'too-many' }, retryAfter: Math.max(1, Math.ceil((ends - moment.getTime()) / 1000)) };
      }
      store.consentRecords.keep(record);
      return { status: 204 };
    },
  };
}

// The timed duty that forgets each record 13 months after it was made, and each day's count of
// those not stored, in the role for editors. `store`: as store.js opens it.
//
// Gives { run() }, which forgets them, and gives how many records.
export function consentRetention({ store, now = () => new Date() }) {
  return {
    run() {
      const forgotten = store.consentRecords.expire(monthsBefore(now(), RECORD_MONTHS));
      store.settle();
      return forgotten;
    },
  };
}
