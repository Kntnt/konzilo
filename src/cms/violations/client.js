// What the *Policy violations* page asks of the service (ADR 0051), and what it makes of the
// answers: the counts of what the site's policy blocked, an Admin's alone, and what was blocked in
// words where it had no address. It holds no React.

import { say } from '../interface-language.js';
import { askAsAdmin, fetching } from '../service.js';

const VIOLATIONS_PATH = '/_konzilo/violations';

// The counts, { counts: { days, most, violations, rest } }, each violation { page, directive,
// blocked, count, lastSeen }, the most recently seen first, and `rest` { count, lastSeen } or null;
// or { adminOnly } for one who may write and is no Admin, or null where it cannot be told.
export const readViolations = ({ credential, ask = fetching() }) => askAsAdmin(VIOLATIONS_PATH, { method: 'GET' }, {
  credential,
  ask,
  read: async (answer) => (answer.ok ? { counts: await answer.json() } : null),
});

// What was blocked as the page shows it: code with no address in words, and an origin or a scheme
// as it is.
const WORDS = { inline: 'violations.inline', eval: 'violations.eval' };
export const blockedShown = (blocked) => (Object.hasOwn(WORDS, blocked) ? say(WORDS[blocked]) : blocked);
