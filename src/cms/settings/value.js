// What the core's field for a setting with a default shows and keeps (register.js, ADR 0033):
// the default while the settings file holds no value, and no value once the default is chosen
// again, or the field is emptied, so that the file holds only what differs from a default, and a
// default the core changes reaches a site that never changed the setting.

const isEmpty = (value) => value === undefined || value === null || value === '';

// What the field shows, from what the setting holds, `held`, and its default, `preset`.
export function shownValue(held, preset) {
  return isEmpty(held) ? preset : held;
}

// What the setting holds once `chosen` is chosen: nothing, as an empty value, which is left out of
// the file, where it is the default or empty; otherwise what is chosen.
export function keptValue(chosen, preset) {
  return isEmpty(chosen) || chosen === preset ? '' : chosen;
}
