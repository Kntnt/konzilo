// What the editor says of a form's lock and of a save older than the latest (ADR 0073), in the
// interface language: each text by its name and values, a moment in the reader's own form and
// time zone (refusals.js).

import { wordsShown } from '../refusals.js';

const moment = (at) => ({ moment: new Date(at).toISOString() });

// Who holds a form, and since when: another Editor, or the Editor's own other tab.
export const heldWords = (holder) => (holder.yours
  ? wordsShown({ name: 'lock.heldByYou', values: { since: moment(holder.since) } })
  : wordsShown({ name: 'lock.heldBy', values: { name: holder.name, since: moment(holder.since) } }));

// The line above a read-only form: why it is read-only.
export function lineWords(state) {
  switch (state.mode) {
    case 'asking':
      return heldWords(state.holder);
    case 'reading':
      return state.holder
        ? `${heldWords(state.holder)} ${wordsShown({ name: 'lock.reading' })}`
        : wordsShown({ name: 'lock.free' });
    case 'takenOver':
      return state.holder.yours
        ? wordsShown({ name: 'lock.takenOverByYou', values: { at: moment(state.holder.since) } })
        : wordsShown({ name: 'lock.takenOver', values: { name: state.holder.name, at: moment(state.holder.since) } });
    case 'adminOnly':
      return wordsShown({ name: 'lock.adminOnly' });
    case 'checking':
      return wordsShown({ name: 'lock.checking' });
    case 'staleBackup':
      return wordsShown({ name: state.takenOver ? 'lock.takenBack' : 'lock.staleBackup', values: { at: moment(state.at) } });
    default:
      return '';
  }
}

// What the list of entries says of an entry another tab holds.
export const markWords = (mark) => (mark.yours ? wordsShown({ name: 'lock.markYours' }) : wordsShown({ name: 'lock.mark', values: { name: mark.name } }));

// Sveltia's words for a form older than the entry's latest save, as the core's refusal: what
// happened, `description`, and what that means, `warning`. `type` is `modified` or `deleted`,
// `name` the account that saved, and `date` when.
export function conflictWords({ type, name, date }) {
  if (type === 'deleted') return { description: wordsShown({ name: 'lock.deletedAfter' }), warning: wordsShown({ name: 'lock.notRecreated' }) };
  const at = date ? moment(date) : null;
  const description = name && at
    ? wordsShown({ name: 'lock.savedAfter', values: { account: name, moment: at } })
    : wordsShown({ name: 'lock.savedAfterUnnamed' });
  return { description, warning: wordsShown({ name: 'lock.notOverwritten' }) };
}
