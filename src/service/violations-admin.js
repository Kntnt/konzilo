// What an Admin's *Policy violations* page asks of the service in its role for editors (ADR 0051):
// the counts of what the site's policy blocked, to an Admin alone, as the *Mail* page's settings
// are, an Editor told only that, and whoever may not write nothing.

import { answerJson, answerMethods, asAdmin } from './answers.js';
import { violationCounts, VIOLATIONS_PATH } from './violations.js';

// The page's answers. `store`: as store.js opens it, or null. `adminOf(credential)`: as answers.js's
// asAdmin() takes it.
//
// Gives { owns(pathname), answer(incoming, outgoing) }.
export function violationsPage({ store, adminOf }) {
  const counts = store ? violationCounts(store) : null;
  return {
    owns: (pathname) => pathname === VIOLATIONS_PATH,

    async answer(incoming, outgoing) {
      if (incoming.method !== 'GET') return answerMethods(incoming, outgoing, ['GET']);
      incoming.resume();
      if (!counts) return answerJson(outgoing, 404, {});
      if (!await asAdmin(incoming, outgoing, adminOf)) return undefined;
      return answerJson(outgoing, 200, counts.shown());
    },
  };
}
