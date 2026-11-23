// What the editor says of a form's revisions (ADR 0074), in the interface language: each text by
// its name and values, a moment in the reader's own form and time zone (refusals.js).

import { wordsShown } from '../refusals.js';

const moment = (at) => ({ moment: new Date(at).toISOString() });

export const savedWords = (at) => wordsShown({ name: 'history.saved', values: { moment: moment(at) } });

export const accountWords = (account) => (account
  ? wordsShown({ name: 'history.by', values: { account: account.name } })
  : wordsShown({ name: 'history.byUnknown' }));

// A revision as a choice of what to compare: when it was saved, and by whom.
export const choiceWords = ({ moment: at, account }) => (account
  ? wordsShown({ name: 'history.choice', values: { moment: moment(at), account: account.name } })
  : wordsShown({ name: 'history.choiceUnknown', values: { moment: moment(at) } }));

// The latest save, which a save older than it is refused by, as a choice of what to compare.
export const latestWords = ({ account, at }) => (account && at
  ? wordsShown({ name: 'history.latest', values: { account, moment: moment(at) } })
  : wordsShown({ name: 'history.latestUnnamed' }));

// A text by name with one moment, `{moment}`, in it.
export const withMoment = (name, at) => wordsShown({ name, values: { moment: moment(at) } });
