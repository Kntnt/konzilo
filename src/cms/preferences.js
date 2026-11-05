// What Konzilo would have Sveltia do, set once, before Sveltia reads its preferences as it loads: an
// entry stays open when it is saved, since how it stands on the site shows there. Sveltia keeps its preferences
// in the browser, and writes its own default among them, so this goes by a mark of its own, and a
// person who then changes it in Sveltia's settings keeps what they chose.

const PREFERENCES = 'sveltia-cms.prefs';
const SET = 'konzilo.preferences-set';

export function setPreferences(storage = globalThis.localStorage) {
  if (storage.getItem(SET) !== null) return;
  let held = null;
  try {
    held = JSON.parse(storage.getItem(PREFERENCES));
  } catch {
    // Sveltia starts over from what cannot be read, and so does this.
  }
  storage.setItem(PREFERENCES, JSON.stringify({ ...(held && typeof held === 'object' ? held : {}), closeOnSave: false }));
  storage.setItem(SET, '1');
}
