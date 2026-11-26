// What an Admin's *Feeds* page asks of the service in its role for editors (ADR 0079): the
// incoming feeds, to an Admin alone, as the mail settings are, an Editor told only that, and
// whoever may not write nothing. A feed added is read at once, which takes its first read, and a
// feed removed releases its posts before it goes, or stays where they could not be saved.

import { answerJson, answerMethods, asAdmin, jsonOf } from './answers.js';
import { checkFeed, feedsShown } from './feed-settings.js';

export const FEEDS_PAGE_PATH = '/_konzilo/feeds';

// The most a feed's settings take, as JSON.
const FEED_LIMIT = 64 * 1024;

// The page's answers. `store`: as store.js opens it, or null. `feeds`: the feed reader, as
// feeds.js gives it, or null. `site()`: the site description in use, as checked, which a feed's
// type and language are chosen from. `record()`: the last build's record, as record.js reads it,
// which says what it refused. `adminOf(credential)`: as answers.js's asAdmin() takes it. `now()`:
// the moment. `warn`: the service's log.
//
// Gives { owns(pathname), answer(incoming, outgoing, pathname) }.
export function feedsPage({ store, feeds, site, record, adminOf, now, warn = console.error }) {
  return {
    owns: (pathname) => pathname === FEEDS_PAGE_PATH || pathname.startsWith(`${FEEDS_PAGE_PATH}/`),

    async answer(incoming, outgoing, pathname) {
      const below = pathname.slice(FEEDS_PAGE_PATH.length);
      const methods = below === '' ? ['GET', 'POST'] : ['PUT', 'DELETE'];
      if (!methods.includes(incoming.method)) return answerMethods(incoming, outgoing, methods);
      if (!store || !feeds || !site()) {
        incoming.resume();
        return answerJson(outgoing, 404, {});
      }
      if (!await asAdmin(incoming, outgoing, adminOf)) return undefined;
      const shown = () => feedsShown({ store, site: site(), record: record() });
      if (incoming.method === 'GET') return answerJson(outgoing, 200, shown());
      const id = below === '' ? null : Number(below.slice(1));
      if (id !== null && (!Number.isSafeInteger(id) || !store.feeds().some((one) => one.id === id))) {
        incoming.resume();
        return answerJson(outgoing, 404, {});
      }
      if (incoming.method === 'DELETE') {
        incoming.resume();
        try {
          await feeds.release(id);
        } catch (error) {
          warn(`The feed's posts could not be released: ${error.message}`);
          return answerJson(outgoing, 502, {});
        }
        return answerJson(outgoing, 200, shown());
      }
      const given = await jsonOf(incoming, outgoing, FEED_LIMIT);
      if (given === undefined) return undefined;
      const checked = checkFeed(given, { store, site: site(), id });
      if (checked.problems) return answerJson(outgoing, 400, { problems: checked.problems });
      if (id === null) {
        const added = store.addFeed({ ...checked.feed, at: now() });
        void feeds.read(added).catch((error) => warn(`The feed reader broke: ${error.message}`));
        return answerJson(outgoing, 201, shown());
      }
      store.changeFeed(id, checked.feed);
      return answerJson(outgoing, 200, shown());
    },
  };
}
