// What the Submissions page asks of the service (ADR 0045), and what it makes of the answers: each
// form, a form's submissions a page at a time, newest first, and a form's as CSV. The service asks
// Forgejo who is asking, so each request carries what Sveltia signed in with, and an answer it may
// not have is no answer. It holds no React.

import { momentIn, valueText } from '../../submission-values.js';
import { interfaceLanguage, languageTag, say } from '../interface-language.js';

const SUBMISSIONS_PATH = '/_konzilo/submissions';

const fetching = () => globalThis.fetch.bind(globalThis);

// What the service answers at `address`, as JSON, or null when it cannot be told.
async function answered(address, { credential, get }) {
  const held = credential();
  if (!held) return null;
  try {
    const answer = await get(address, { headers: { authorization: held }, cache: 'no-store' });
    return answer.ok ? await answer.json() : null;
  } catch {
    return null;
  }
}

// Each form, { forms: [ { name, label, count } ] }, or null.
export const readForms = ({ credential, get = fetching() }) => answered(SUBMISSIONS_PATH, { credential, get });

// A form's submissions, newest first, from after the one numbered `before` where it is given:
// { submissions: [ { id, sentAt, language, fields } ], more }, or null.
export function readSubmissions({ credential, form, before = null, get = fetching() }) {
  const query = before === null ? '' : `?${new URLSearchParams({ before: String(before) })}`;
  return answered(`${SUBMISSIONS_PATH}/${encodeURIComponent(form)}${query}`, { credential, get });
}

// The separator offered first: the semicolon where the interface language writes a decimal
// comma, which a spreadsheet in that language would otherwise not split by, else the comma.
export function offeredSeparator() {
  const decimal = new Intl.NumberFormat(languageTag()).formatToParts(1.5).find(({ type }) => type === 'decimal')?.value;
  return decimal === ',' ? 'semicolon' : 'comma';
}

// A field's value as the page shows it: a text as it came, a box ticked or not, or the boxes ticked.
export const valueShown = (value) => valueText(value, { yes: say('submissions.yes'), no: say('submissions.no') });

// A moment as the page shows it, in the interface language's own form and the browser's time zone.
export const momentShown = (at) => new Date(at).toLocaleString(languageTag(), { dateStyle: 'long', timeStyle: 'short' });

// The browser's own time zone, which the file's moments are in, as the page's are.
export const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// A day as `YYYY-MM-DD` in a time zone.
const dayIn = (at, timeZone) => momentIn(timeZone)(at).slice(0, 10);

// What the browser does with a file it is given: it saves it under its name.
function saveInBrowser(blob, name) {
  const address = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), { href: address, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(address), 60_000);
}

// A form's submissions as CSV, by the separator chosen, a name of the service's, in the browser's
// time zone and the interface language, saved as `<form>-<day>.csv`. Whether it was.
export async function downloadCsv({ credential, form, separator, timeZone = browserTimeZone(), today = () => new Date(), get = fetching(), save = saveInBrowser }) {
  const held = credential();
  if (!held) return false;
  const query = new URLSearchParams({ separator, timeZone, language: interfaceLanguage() });
  try {
    const answer = await get(`${SUBMISSIONS_PATH}/${encodeURIComponent(form)}.csv?${query}`, { headers: { authorization: held }, cache: 'no-store' });
    if (!answer.ok) return false;
    save(await answer.blob(), `${form}-${dayIn(today(), timeZone)}.csv`);
    return true;
  } catch {
    return false;
  }
}
