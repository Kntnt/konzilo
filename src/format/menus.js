// What a menu's entry may hold, for the editor's form and the intake alike. It imports
// nothing, so that the editor and the build both run it.

// A description's most characters, counted as the editor's form counts them, after the trim:
// a line under an entry, as a large menu shows it.
export const MENU_DESCRIPTION_LENGTH = 160;

// The first entry of `menus`, each a menu's entries, in the order the site description declares
// the menus, of which `leads(entry)` holds: of the first menu that has one, the first in reading
// order, an entry before those under it; null where none does.
export function firstEntry(menus, leads) {
  const within = (entries) => {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (entry === null || typeof entry !== 'object') continue;
      if (leads(entry)) return entry;
      const below = within(entry.items);
      if (below !== null) return below;
    }
    return null;
  };
  for (const entries of menus) {
    const found = within(entries);
    if (found !== null) return found;
  }
  return null;
}

// An entry's label, trimmed, or '' for an entry with none of its own.
export const labelOf = (entry) => (typeof entry?.title === 'string' ? entry.title.trim() : '');
