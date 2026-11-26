// What the *Consent records* page asks of the service (ADR 0049), and what it makes of the
// answers: the choices per day of a span, a consent ID's records with what their revision showed,
// and a span's records downloaded as CSV, every day and moment in UTC. It holds no React.

import { CONSENT_ID } from '../../consent/consent-id.js';
import { askAsAdmin, fetching } from '../service.js';
import { downloadCsvFrom } from '../submissions/client.js';

const CONSENT_RECORDS_PATH = '/_konzilo/consent-records';

// What the service answers at the path with `query`, as JSON: the answer, { adminOnly } for one who
// may write and is no Admin, or null where it cannot be told.
const answered = (query, { credential, ask }) => askAsAdmin(`${CONSENT_RECORDS_PATH}?${new URLSearchParams(query)}`, {}, {
  credential,
  ask,
  read: async (answer) => (answer.ok ? answer.json() : null),
});

// The choices of each day from `from` to `to`, `YYYY-MM-DD` in UTC: { days }, each day { day,
// accept, reject, save, allow, withdraw, notStored }, or { adminOnly }, or null.
export const readDays = ({ credential, from, to, ask = fetching() }) => answered({ from, to }, { credential, ask });

// A consent ID's records, oldest first, each with `shown`, what its revision showed the visitor:
// { records }, or { adminOnly }, or null.
export const findRecords = ({ credential, id, ask = fetching() }) => answered({ id }, { credential, ask });

// The records of the days from `from` to `to` as CSV, saved as `consent-records-<day>.csv`, the
// day in UTC, as the file's moments are. Whether they were.
export const downloadRecords = ({ from, to, ...options }) => downloadCsvFrom({ ...options, path: `${CONSENT_RECORDS_PATH}.csv`, query: { from, to }, named: 'consent-records', timeZone: 'UTC' });

// The last `count` days, today among them, in UTC: { from, to }.
export function lastDays(count, today = () => new Date()) {
  const to = today();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - (count - 1)));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// A consent ID as a visitor copies it from the cookie declaration, in small letters, or null for
// what is none.
export function consentIdOf(given) {
  const id = given.trim().toLowerCase();
  return CONSENT_ID.test(id) ? id : null;
}
