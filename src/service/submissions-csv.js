// Submissions as CSV (ADR 0045), a form's, which Admins and Editors download from the *Submissions*
// page, or a person's, which an Admin downloads from the *Personal data* page: UTF-8 with a
// byte-order mark, its rows ended by CRLF, written a row at a time as the submissions are read,
// and never stored. Each value is written safe to open: what a
// spreadsheet would take as the start of a formula, by either separator, is written after an
// apostrophe.

import { catalogueFor, text } from '../catalogues.js';
import { momentIn, valueText } from '../submission-values.js';

// The separators a reader may choose, by the name the request gives.
export const SEPARATORS = Object.freeze({ comma: ',', semicolon: ';' });

const BYTE_ORDER_MARK = '\uFEFF';
const ROW_END = '\r\n';

// A value that begins with one of these, or that holds one, or a quote, after a comma, a
// semicolon or a line break, would start a formula, or a cell, in a spreadsheet that reads the
// file by either separator.
const STARTS_A_FORMULA = /^[=+\-@\t\r]/;
const STARTS_ONE_INSIDE = /([,;\r\n])(?=[=+\-@\t\r"])/g;

// A value safe to open: an apostrophe before each such character.
export const safe = (value) => (STARTS_A_FORMULA.test(value) ? `'${value}` : value).replace(STARTS_ONE_INSIDE, "$1'");

// A cell as CSV writes it by `separator`: in quotes, its own doubled, where it holds the
// separator, a quote or a line break.
const cell = (value, separator) => {
  const written = safe(value);
  return written.includes(separator) || /["\r\n]/.test(written) ? `"${written.replaceAll('"', '""')}"` : written;
};

const row = (values, separator) => `${values.map((value) => cell(value, separator)).join(separator)}${ROW_END}`;

// The time zone a reader names, where it is one the service knows, else UTC.
export function timeZoneOf(named) {
  if (typeof named !== 'string' || named === '' || named.length > 64) return 'UTC';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: named }).resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

// Each field of a submission by its column: its label, and which of the fields of that label in
// the submission it is, so that two fields with one label take a column each.
function* columnsOf({ fields }) {
  const seen = new Map();
  for (const { label, value } of fields) {
    const nth = (seen.get(label) ?? 0) + 1;
    seen.set(label, nth);
    yield { column: `${nth}\n${label}`, label, value };
  }
}

// Submissions as CSV, a piece at a time: the header row, after the byte-order mark, and then a row
// for each submission. `labelOf(form)`: a form's label, by its name. `each()`: the submissions,
// newest first, as the store reads them, which is asked for twice: once for the columns and once
// for the rows. `separator`: a name of SEPARATORS. `timeZone`: the one the moments are in.
// `language`: the reader's interface language, which the column names and a box's words are in.
//
// Columns: when it was sent, in the time zone its heading names by its IANA name, since a
// spreadsheet takes `YYYY-MM-DD HH:MM:SS` as a moment and the same with an offset as text; its
// form's label; then each field's label, the newest submission's in its order, then each label only older
// ones hold.
export function* submissionsCsv({ labelOf, each, separator, timeZone, language }) {
  const by = SEPARATORS[separator];
  const words = (name, values) => text(catalogueFor(language), `submissions.${name}`, values);
  const columns = new Map();
  for (const submission of each()) {
    for (const { column, label: named } of columnsOf(submission)) if (!columns.has(column)) columns.set(column, named);
  }
  yield `${BYTE_ORDER_MARK}${row([words('sentAt', { timeZone }), words('form'), ...columns.values()], by)}`;

  const moment = momentIn(timeZone);
  const box = { yes: words('yes'), no: words('no') };
  const shown = (value) => valueText(value, box);
  for (const submission of each()) {
    const values = new Map([...columnsOf(submission)].map(({ column, value }) => [column, shown(value)]));
    yield row([moment(submission.sentAt), labelOf(submission.form), ...[...columns.keys()].map((column) => values.get(column) ?? '')], by);
  }
}
