// The policy's violations (ADR 0051): the reports each release's Content Security Policy has
// browsers send to /_konzilo/violations, as `report-uri` and `report-to`, taken by the service in
// its role for visitors (ADR 0044) and kept as counts of the page's path, the effective directive
// and what was blocked, with when each was last seen, and nothing of the visitor: no address,
// browser or referrer. An Admin reads them on the editor's *Policy violations* page, through the
// role for editors.

import { DAY } from './day.js';
import { perClient, secondsUntil } from './per-client.js';

export const VIOLATIONS_PATH = '/_konzilo/violations';

// The most a body takes, in bytes and in reports: every report holds the whole policy, which a
// site with many hashes makes long.
const BODY_LIMIT = 128 * 1024;
const REPORTS_IN_A_BODY = 100;

// The most of a page's path that is kept, in characters.
const PATH_LENGTH = 300;

// The most reports counted of one client in a window of ten minutes (visitors.js).
const REPORTS_IN_A_WINDOW = 100;

// The most entries kept of pages, directives and what was blocked; past them, a new combination
// counts into one entry for the rest, whose three are empty.
export const ENTRIES_AT_MOST = 1000;

// The days an entry is kept after it was last seen.
export const VIOLATION_DAYS = 30;

// The directives a violation is reported by, as the browsers name them.
const DIRECTIVES = new Set([
  'default-src', 'script-src', 'script-src-elem', 'script-src-attr', 'style-src', 'style-src-elem', 'style-src-attr',
  'img-src', 'font-src', 'connect-src', 'media-src', 'object-src', 'frame-src', 'child-src', 'worker-src', 'manifest-src',
  'prefetch-src', 'fenced-frame-src', 'base-uri', 'form-action', 'frame-ancestors', 'navigate-to', 'sandbox', 'webrtc',
  'require-trusted-types-for', 'trusted-types',
]);

const CSP_REPORT = 'application/csp-report';
const REPORTS_JSON = 'application/reports+json';

// A report as either format gives it, { page, directive, blocked, source }, each as the browser
// wrote it, `source` the file that asked for what was blocked, or null for anything else. Under
// the older type, WebKit sends one report in the Reporting API's shape.
const asGiven = (type, one) => {
  if (one === null || typeof one !== 'object') return null;
  if (type === CSP_REPORT && !Object.hasOwn(one, 'type')) {
    const report = one['csp-report'];
    if (report === null || typeof report !== 'object') return null;
    return { page: report['document-uri'], directive: report['effective-directive'], blocked: report['blocked-uri'], source: report['source-file'] };
  }
  if (one.type !== 'csp-violation' || one.body === null || typeof one.body !== 'object') return null;
  return { page: one.body.documentURL ?? one.url, directive: one.body.effectiveDirective, blocked: one.body.blockedURL, source: one.body.sourceFile };
};

// The reports a body holds, as given, or null for a body that is none.
const reportsIn = (type, body) => {
  let parsed;
  try {
    parsed = JSON.parse(body.toString('utf8'));
  } catch {
    return null;
  }
  if (type === CSP_REPORT) return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? [parsed] : null;
  return Array.isArray(parsed) ? parsed : null;
};

// The keywords a browser writes for what was blocked that had no address: code in the page itself,
// and code made from a text, WebAssembly's among it; and those of what no policy of the site's
// blocks, and an older browser's `self`, which say nothing of what was blocked.
const KEYWORDS = { inline: 'inline', eval: 'eval', 'wasm-eval': 'eval', self: null, 'trusted-types-policy': null, 'trusted-types-sink': null };

// The schemes whose origin is kept; of any other, the scheme alone.
const ORIGINS = new Set(['http', 'https', 'ws', 'wss']);

// The schemes of browsers' extensions, whose addresses would tell which a visitor has, and whose
// violations are no fault of the site's.
const EXTENSIONS = new Set(['chrome-extension', 'moz-extension', 'safari-extension', 'safari-web-extension', 'ms-browser-extension', 'webkit-masked-url']);

// An address's scheme, in lower case, or null: of a whole address, or of a scheme alone, which is
// how a browser writes an address with no origin in a report.
const schemeOf = (given) => /^([a-z][a-z0-9+.-]*)(?::|$)/i.exec(given)?.[1].toLowerCase() ?? null;

// Whether an address is an extension's.
const extension = (given) => typeof given === 'string' && EXTENSIONS.has(schemeOf(given.trim()));

// What was blocked, as it is kept: the origin of an address on the web, the scheme alone of any
// other, written with its colon as a policy writes one, or `inline` or `eval`; or null.
const blockedOf = (given) => {
  if (typeof given !== 'string') return null;
  const text = given.trim();
  if (Object.hasOwn(KEYWORDS, text)) return KEYWORDS[text];
  const scheme = schemeOf(text);
  if (scheme === null) return null;
  if (!ORIGINS.has(scheme)) return `${scheme}:`;
  try {
    return new URL(text).origin;
  } catch {
    return null;
  }
};

// The path of a page of the site's own, by `ownPage(address)`, without its query, at most 300
// characters of it; or null.
const pathOf = (given, ownPage) => {
  if (typeof given !== 'string' || !ownPage(given)) return null;
  try {
    return [...new URL(given).pathname].slice(0, PATH_LENGTH).join('');
  } catch {
    return null;
  }
};

// What is kept of a report, { page, directive, blocked }, or null for one that is not counted: one
// of a page not the site's own, of a directive no policy has, or one an extension caused, by what
// it blocked or the file that asked for it.
const keptOf = (given, ownPage) => {
  if (given === null || extension(given.blocked) || extension(given.source)) return null;
  const page = pathOf(given.page, ownPage);
  const directive = typeof given.directive === 'string' ? given.directive.trim().toLowerCase() : null;
  const blocked = blockedOf(given.blocked);
  if (page === null || !DIRECTIVES.has(directive) || blocked === null) return null;
  return { page, directive, blocked };
};

// The counts in the service's data, `store` as store.js opens it.
//
// Gives { count(reports, at), shown(), expire(before) }: `count` counts each report, { page,
// directive, blocked }, as seen at `at`, a Date, into its own entry, or, past 1,000 entries, a new
// one into the entry for the rest; `shown` gives the counts as the Admin's page shows them, { days, most, violations,
// rest }, `days` those an entry is kept after it was last seen, `most` the entries kept at most,
// `violations` each { page, directive, blocked, count, lastSeen }, the most recently seen first,
// and `rest` { count, lastSeen }, or null while there is none; `expire` forgets each entry last
// seen before `before`, a Date, overwritten where it stood, and gives how many.
export function violationCounts(store) {
  const countInEntry = store.prepare('UPDATE violation SET count = count + ?, last_seen = ? WHERE page = ? AND directive = ? AND blocked = ?');
  const entries = store.prepare("SELECT COUNT(*) AS entries FROM violation WHERE page <> ''");
  const insert = store.prepare(`INSERT INTO violation (page, directive, blocked, count, last_seen) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (page, directive, blocked) DO UPDATE SET count = count + excluded.count, last_seen = excluded.last_seen`);
  const entriesShown = store.prepare("SELECT page, directive, blocked, count, last_seen FROM violation WHERE page <> '' ORDER BY last_seen DESC, count DESC, page, directive, blocked");
  const entryForTheRest = store.prepare("SELECT count, last_seen FROM violation WHERE page = ''");
  const forgetSeenBefore = store.prepare('DELETE FROM violation WHERE last_seen < ?');
  return {
    count(reports, at) {
      const seen = at.toISOString();
      const by = new Map();
      for (const report of reports) {
        const key = JSON.stringify([report.page, report.directive, report.blocked]);
        by.set(key, (by.get(key) ?? 0) + 1);
      }
      if (by.size === 0) return;
      store.inOne(() => {
        let held = Number(entries.get().entries);
        for (const [key, times] of by) {
          const [page, directive, blocked] = JSON.parse(key);
          if (Number(countInEntry.run(times, seen, page, directive, blocked).changes) > 0) continue;
          if (held < ENTRIES_AT_MOST) {
            insert.run(page, directive, blocked, times, seen);
            held += 1;
          } else {
            insert.run('', '', '', times, seen);
          }
        }
      });
    },
    shown() {
      const other = entryForTheRest.get();
      return {
        days: VIOLATION_DAYS,
        most: ENTRIES_AT_MOST,
        violations: entriesShown.all().map((row) => ({ page: row.page, directive: row.directive, blocked: row.blocked, count: Number(row.count), lastSeen: row.last_seen })),
        rest: other ? { count: Number(other.count), lastSeen: other.last_seen } : null,
      };
    },
    expire(before) {
      return store.forgot(Number(forgetSeenBefore.run(before.toISOString()).changes));
    },
  };
}

// The duty that forgets each entry 30 days after it was last seen, which the service in its role
// for editors runs at its start, so that what grew too old while it was stopped is gone once it
// starts, and then each minute (ADR 0044). `store`: as store.js opens it. `now()`: the moment.
//
// Gives { run() }, which forgets them, and gives how many it forgot.
export function violationsDuty({ store, now = () => new Date() }) {
  const counts = violationCounts(store);
  return {
    run: () => counts.expire(new Date(now().getTime() - VIOLATION_DAYS * DAY)),
  };
}

// The violations' kind, for the role for visitors. `store`: as store.js opens it. `now()`: the moment.
export function violationsKind({ store, now }) {
  const counts = violationCounts(store);

  // How many reports each client has had counted in its window.
  const ofClients = perClient(REPORTS_IN_A_WINDOW);
  return {
    path: VIOLATIONS_PATH,
    methods: ['POST'],
    types: [CSP_REPORT, REPORTS_JSON],
    limit: BODY_LIMIT,

    take({ below, type, body, fromSite, ownPage, client }) {
      if (below !== '') return { status: 404 };
      const reports = reportsIn(type, body);
      if (reports === null) return { status: 400 };
      if (reports.length > REPORTS_IN_A_BODY) return { status: 413 };
      if (!fromSite) return { status: 403 };
      const room = ofClients.room(client);
      if (room === 0) return { status: 429, retryAfter: secondsUntil(client.ends.getTime(), now().getTime()) };
      const kept = reports.map((one) => keptOf(asGiven(type, one), ownPage)).filter((one) => one !== null).slice(0, room);
      counts.count(kept, now());
      ofClients.count(client, kept.length);
      return { status: 204 };
    },
  };
}
