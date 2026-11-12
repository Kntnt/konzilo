// What the *Personal data* page asks of the service (ADR 0045), and what it makes of the answers: a
// person's submissions found by what they wrote, those an Admin chooses downloaded as CSV for the
// person, and erased. It holds no React.

import { askAsAdmin, fetching } from '../service.js';
import { downloadCsvFrom } from '../submissions/client.js';

const PERSONAL_DATA_PATH = '/_konzilo/personal-data';

// What the service answers to `method` at the path with `query`, as JSON: { answer }, { adminOnly }
// for one who may write and is no Admin, or null where it cannot be told.
const answered = (method, query, { credential, ask }) => askAsAdmin(`${PERSONAL_DATA_PATH}?${new URLSearchParams(query)}`, { method }, {
  credential,
  ask,
  read: async (answer) => (answer.ok ? { answer: await answer.json() } : null),
});

// The submissions that hold `text`, newest first, at most a hundred: { found: { submissions, more } },
// each submission { id, form, label, sentAt, language, spam, fields }, or { adminOnly }, or null.
// An empty text finds nothing, and so asks only whether the one signed in may search.
export async function findTheirs({ credential, text, ask = fetching() }) {
  const given = await answered('GET', text === '' ? {} : { text }, { credential, ask });
  return given?.answer ? { found: given.answer } : given;
}

// The submissions numbered `ids` erased: { erased }, how many, or { adminOnly }, or null.
export async function eraseTheirs({ credential, ids, ask = fetching() }) {
  const given = await answered('DELETE', { ids: ids.join(',') }, { credential, ask });
  return given?.answer ? { erased: given.answer.erased } : given;
}

// The submissions numbered `ids` as CSV, saved as `personal-data-<day>.csv`. Whether they were.
export const downloadTheirs = ({ ids, ...options }) => downloadCsvFrom({ ...options, path: `${PERSONAL_DATA_PATH}.csv`, query: { ids: ids.join(',') }, named: 'personal-data' });
