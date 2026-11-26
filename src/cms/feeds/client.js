// What the *Feeds* page asks of the service (ADR 0079), and what it makes of the answers: the
// incoming feeds, adding, changing and removing one, and each problem beside its field; and why a
// feed could not be read, which the *Publishing* page says too. It holds no React.

import { say } from '../interface-language.js';
import { askAsAdmin, fetching } from '../service.js';

const FEEDS_PATH = '/_konzilo/feeds';

// What the service answers, as the page takes it: { feeds }, { problems } for a feed it refused,
// { adminOnly } for one who may write and is no Admin, or null where it cannot be told.
const answered = (address, init, { credential, ask }) => askAsAdmin(address, init, {
  credential,
  ask,
  read: async (answer) => {
    if (answer.status === 400) {
      const { problems } = await answer.json();
      return problems ? { problems } : null;
    }
    return answer.ok ? { feeds: await answer.json() } : null;
  },
});
const withJson = (method, given) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(given) });

// The feeds, { feeds, types, languages }, as { feeds }.
export const readFeeds = ({ credential, ask = fetching() }) => answered(FEEDS_PATH, { method: 'GET' }, { credential, ask });

// A feed an Admin adds, { address, type, language, every }.
export const addFeed = ({ credential, given, ask = fetching() }) => answered(FEEDS_PATH, withJson('POST', given), { credential, ask });

// What an Admin changes of the feed numbered `id`, { type, language, every }.
export const changeFeed = ({ credential, id, given, ask = fetching() }) => answered(`${FEEDS_PATH}/${id}`, withJson('PUT', given), { credential, ask });

// The feed numbered `id` removed, its posts released first.
export const removeFeed = ({ credential, id, ask = fetching() }) => answered(`${FEEDS_PATH}/${id}`, { method: 'DELETE' }, { credential, ask });

const PROBLEMS = {
  missing: 'feeds.problemMissing',
  'not-address': 'feeds.problemNotAddress',
  taken: 'feeds.problemTaken',
  unknown: 'feeds.problemUnknown',
  'not-choosable': 'feeds.problemNotChoosable',
  'not-minutes': 'feeds.problemNotMinutes',
  malformed: 'feeds.problemMalformed',
};

// The service's problems, by the setting's name, each as the page shows it beside its field.
export const feedProblemsShown = (problems) => Object.fromEntries(Object.entries(problems).map(([field, problem]) => [field, say(PROBLEMS[problem] ?? PROBLEMS.malformed)]));

// Why a feed could not be read, by its kind as the service keeps it (src/service/feeds.js).
const FAILURES = {
  unreachable: 'feeds.failureUnreachable',
  timeout: 'feeds.failureTimeout',
  status: 'feeds.failureStatus',
  'too-large': 'feeds.failureTooLarge',
  'not-a-feed': 'feeds.failureNotAFeed',
  'no-type': 'feeds.failureNoType',
  'not-saved': 'feeds.failureNotSaved',
  other: 'feeds.failureOther',
};

// Why a feed could not be read, { kind, status }, in the interface language.
export const failureShown = ({ kind, status }) => say(Object.hasOwn(FAILURES, kind) ? FAILURES[kind] : FAILURES.other, { status: String(status ?? '') });
