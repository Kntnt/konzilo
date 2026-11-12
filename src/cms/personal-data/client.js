// What the *Personal data* page asks of the service (ADR 0045), and what it makes of the answers: a
// person's submissions found by what they wrote, those an Admin chooses downloaded as CSV for the
// person, and erased. The service asks Forgejo who is asking, so each request carries what Sveltia
// signed in with. It holds no React.

import { downloadCsvFrom } from '../submissions/client.js';

const PERSONAL_DATA_PATH = '/_konzilo/personal-data';

const fetching = () => globalThis.fetch.bind(globalThis);

// What the service answers to `method` at the path with `query`, as JSON: { answer }, { adminOnly }
// for one who may write and is no Admin, or null where it cannot be told.
async function answered(method, query, { credential, ask }) {
  const held = credential();
  if (!held) return null;
  try {
    const answer = await ask(`${PERSONAL_DATA_PATH}?${new URLSearchParams(query)}`, { method, headers: { authorization: held }, cache: 'no-store' });
    if (answer.status === 403) return { adminOnly: true };
    return answer.ok ? { answer: await answer.json() } : null;
  } catch {
    return null;
  }
}

// The submissions that hold `text`, newest first, at most a hundred: { found: { submissions, more } },
// each submission { id, form, label, sentAt, language, spam, fields }, or { adminOnly }, or null.
export async function findTheirs({ credential, text, ask = fetching() }) {
  const given = await answered('GET', { text }, { credential, ask });
  return given?.answer ? { found: given.answer } : given;
}

// The submissions numbered `ids` erased: { erased }, how many, or { adminOnly }, or null.
export async function eraseTheirs({ credential, ids, ask = fetching() }) {
  const given = await answered('DELETE', { ids: ids.join(',') }, { credential, ask });
  return given?.answer ? { erased: given.answer.erased } : given;
}

// The submissions numbered `ids` as CSV, saved as `personal-data-<day>.csv`. Whether they were.
export const downloadTheirs = ({ ids, ...options }) => downloadCsvFrom({ ...options, path: `${PERSONAL_DATA_PATH}.csv`, query: { ids: ids.join(',') }, named: 'personal-data' });
