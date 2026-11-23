// A post's page in a tab of its own (ADR 0032), by the button in the post's form (open-in-tab.js):
// the page the preview shows for the form open, and at which moment, which the preview tells, and
// the address the button opens, at the moment just after the post goes out, now for one out
// already or with none.

import { atMoment } from './client.js';
import { momentKey } from './paths.js';

// The address of the page in a tab, the preview's own, at the moment it is shown at.
export const tabAddress = ({ origin, address, moment }) => `${origin}${atMoment(address, momentKey(moment))}`;

// The page the preview last showed: { form, address, moment }, or null where the form has none.
let shown = null;
const watchers = new Set();
export const pageShown = {
  set(page) {
    shown = page;
    for (const watcher of [...watchers]) watcher();
  },
  get: () => shown,
  // The page shown for `form`, or null.
  shownFor: (form) => (shown !== null && shown.form === form ? shown : null),
  watch(watcher) {
    watchers.add(watcher);
    return () => watchers.delete(watcher);
  },
};
