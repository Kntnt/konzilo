// How publishing stands, as the service says (ADR 0031): reading it, keeping it up to date while
// someone looks, and what a status means in words. It holds no React.

import { languageTag, say } from '../interface-language.js';
import { refusalShown, wordsShown } from '../refusals.js';

const STATUS_PATH = '/_konzilo/status';
// While something is on its way it is worth asking often, and otherwise a change comes from
// someone else's save, or the clock.
const SOON = 3000;
const LATER = 15_000;

// What the service answers, or null when it cannot be told.
export async function readStatus({ credential, get = globalThis.fetch.bind(globalThis) }) {
  const held = credential();
  if (!held) return null;
  try {
    const answer = await get(STATUS_PATH, { headers: { authorization: held }, cache: 'no-store' });
    return answer.ok ? await answer.json() : null;
  } catch {
    return null;
  }
}

// A post's files: one, or one for each language, by the ID they share.
export const filesOf = (posts, collection, id) => posts.filter(({ file }) => file === `${collection}/${id}.md` || (file.startsWith(`${collection}/`) && file.endsWith(`/${id}.md`)));

// A language's folder, on a site with one for each.
export const languageOf = ({ file }) => (file.split('/').length > 2 ? file.split('/').at(-2) : null);

// Keeps `changed` told of how publishing stands, for as long as it is not closed. A page in a tab
// nobody looks at asks nothing, and catches up when it is looked at again.
export function watchStatus({ read, changed, hidden = () => globalThis.document?.hidden === true, soon = SOON, later = LATER, wait = globalThis.setTimeout.bind(globalThis), stopWaiting = globalThis.clearTimeout.bind(globalThis) }) {
  let timer = null;
  let closed = false;
  const look = async () => {
    stopWaiting(timer);
    if (closed) return;
    let pace = later;
    if (hidden()) pace = soon;
    else {
      const status = await read();
      if (closed) return;
      changed(status);
      if (status?.posts?.some(({ status: one }) => one === 'being-published')) pace = soon;
    }
    timer = wait(look, pace);
  };
  void look();
  return {
    look,
    close() {
      closed = true;
      stopWaiting(timer);
    },
  };
}

// What can start a look from outside, as a save just made.
const watching = new Set();
export const lookNow = () => {
  for (const look of watching) void look();
};
export function watchedStatus(options) {
  const watch = watchStatus(options);
  watching.add(watch.look);
  return {
    close() {
      watching.delete(watch.look);
      watch.close();
    },
  };
}

const where = ({ stillShown }) => say(stillShown ? 'publishing.stillShown' : 'publishing.notShown');
// Each refusal or warning in the interface language, with what it names in the post.
const reasonsOf = (list = []) => list.map(refusalShown);

// What a status says: its `tone`, `good`, `busy`, `bad` or `quiet`, its `words`, and any `details`.
export function statusWords(status, moment = (at) => new Date(at).toLocaleString(languageTag())) {
  switch (status.status) {
    case 'live': {
      const warnings = reasonsOf(status.warnings);
      return { tone: 'good', words: say(warnings.length > 0 ? 'publishing.liveWarned' : 'publishing.live'), details: warnings };
    }
    case 'failed':
      return { tone: 'bad', words: `${say('publishing.failed')} ${where(status)}`, details: status.refusals ? reasonsOf(status.refusals) : [wordsShown(status.reason)] };
    case 'scheduled':
      return { tone: 'quiet', words: say('publishing.scheduled', { at: moment(status.at) }), details: [] };
    case 'draft':
      return { tone: 'quiet', words: say(status.stillShown ? 'publishing.draftShown' : 'publishing.draft'), details: [] };
    default:
      return { tone: 'busy', words: say(status.stillShown ? 'publishing.beingShown' : 'publishing.being'), details: [] };
  }
}
