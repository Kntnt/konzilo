// What an Admin's *Consent records* page asks of the service in its role for editors (ADR 0049):
// the choices of each day of a span, a consent ID's records with what their revision showed the
// visitor, and the records of a span of days as CSV, every day and moment in UTC. An Admin's
// alone, as the *Mail* page is: an Editor is told only that, and whoever may not write nothing.

import { catalogueFor, text } from '../catalogues.js';
import { CONSENT_ID } from '../consent/consent-id.js';
import { momentIn } from '../submission-values.js';
import { DAY } from './day.js';
import { row, SEPARATORS } from './submissions-csv.js';

export const CONSENT_RECORDS_PAGE_PATH = '/_konzilo/consent-records';

// The most days a span takes: the 13 months records are kept, and a little more.
const SPAN_AT_MOST = 400;

// The categories, in the order the CSV's columns take them.
const CATEGORIES = ['necessary', 'functional', 'statistics', 'marketing'];

const BYTE_ORDER_MARK = '\uFEFF';

// A day as `YYYY-MM-DD`, where it is one, or null.
const dayOf = (given) => {
  if (typeof given !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(given)) return null;
  const at = Date.parse(`${given}T00:00:00Z`);
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === given ? given : null;
};

// The span a request names, { from, to }, of at most SPAN_AT_MOST days, or null.
function spanOf(searchParams) {
  const from = dayOf(searchParams.get('from'));
  const to = dayOf(searchParams.get('to'));
  if (from === null || to === null || to < from) return null;
  return (Date.parse(to) - Date.parse(from)) / DAY + 1 <= SPAN_AT_MOST ? { from, to } : null;
}

// A consent ID as the client makes one, in small letters, or null.
const consentIdOf = (given) => {
  const id = typeof given === 'string' ? given.toLowerCase() : '';
  return CONSENT_ID.test(id) ? id : null;
};

// Records as CSV, a piece at a time: the header row, after the byte-order mark, and then a row for
// each record, as `each()` gives them, oldest first. `separator`: a name of SEPARATORS.
// `language`: the reader's interface language, which the column names and the words are in.
//
// Columns: the consent ID; when the choice was made, in UTC, as a spreadsheet takes a moment; the
// consent revision; the language the visitor was shown; the page's path; the part of the consent
// the choice was made in and its control; each category, allowed or not, empty where the
// revision has no such category; and the services allowed and those refused, by their ids.
export function* consentRecordsCsv({ each, separator, language }) {
  const by = SEPARATORS[separator];
  const catalogue = catalogueFor(language);
  const words = (name) => text(catalogue, `consentRecords.${name}`);
  yield `${BYTE_ORDER_MARK}${row([
    words('id'), words('chosen'), words('revision'), words('language'), words('path'), words('how'), words('control'),
    ...CATEGORIES.map((category) => text(catalogue, `site.settings.consent.${category}Name`)),
    words('allowed'), words('refused'),
  ], by)}`;
  const moment = momentIn('UTC');
  const yesOrNo = (state) => (state === undefined ? '' : words(state ? 'yes' : 'no'));
  for (const record of each()) {
    const services = Object.keys(record.services).sort();
    yield row([
      record.id,
      moment(record.chosen),
      record.revision,
      record.language,
      record.path,
      words(`how.${record.how}`),
      words(`control.${record.control}`),
      ...CATEGORIES.map((category) => yesOrNo(record.categories[category])),
      services.filter((service) => record.services[service]).join(' '),
      services.filter((service) => !record.services[service]).join(' '),
    ], by);
  }
}

// The page's answers. `store`: as store.js opens it. `adminOf(credential)`: whether the one asking
// may use the Admin's pages, true or false, or null for whoever may not write. `answerJson` and
// `answerCsv`: how the role for editors answers JSON, and a file written a piece at a time.
//
// Gives { owns(pathname), answer(incoming, outgoing, pathname, searchParams) }.
export function consentRecordsPage({ store, adminOf, answerJson, answerCsv }) {
  return {
    owns: (pathname) => pathname === CONSENT_RECORDS_PAGE_PATH || pathname === `${CONSENT_RECORDS_PAGE_PATH}.csv`,

    async answer(incoming, outgoing, pathname, searchParams) {
      incoming.resume();
      if (incoming.method !== 'GET') {
        outgoing.writeHead(405, { allow: 'GET', 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
        return outgoing.end('{}');
      }
      if (!store) return answerJson(outgoing, 404, {});
      const admin = await adminOf(incoming.headers.authorization);
      if (admin !== true) return answerJson(outgoing, admin === null ? 401 : 403, {});
      if (pathname.endsWith('.csv')) {
        const span = spanOf(searchParams);
        const separator = searchParams.get('separator');
        if (span === null || !Object.hasOwn(SEPARATORS, separator ?? '')) return answerJson(outgoing, 400, {});
        // The rows from one moment's data, whatever is kept or forgotten while they are written.
        const reading = store.consentRecords.snapshot(span.from, span.to);
        try {
          return await answerCsv(outgoing, 'consent-records', consentRecordsCsv({ each: () => reading.each(), separator, language: searchParams.get('language') }));
        } finally {
          reading.close();
        }
      }
      if (searchParams.has('id')) {
        const id = consentIdOf(searchParams.get('id'));
        if (id === null) return answerJson(outgoing, 400, {});
        return answerJson(outgoing, 200, { records: store.consentRecords.of(id) });
      }
      const span = spanOf(searchParams);
      if (span === null) return answerJson(outgoing, 400, {});
      return answerJson(outgoing, 200, { days: store.consentRecords.days(span.from, span.to) });
    },
  };
}
