// Small checks the npm package's readers share: the site description's
// checker (site-description.js), the settings groups' (settings-groups.js)
// and the other readers. Each checker names a problem
// by its path in what it reads and gathers every problem at once.

// Whether a value is a plain object: not null, not an array.
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// A problem for each key of `object` that `allowed` does not hold, named by
// its path and as no part of `whole`.
export function onlyKeys(object, allowed, path, problems, whole) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) problems.push(`${path ? `${path}.` : ''}${key}: is not part of ${whole}`);
  }
}

// A value that must be a non-empty string, with a problem if it is not.
export function text(value, path, problems) {
  if (typeof value !== 'string' || value.trim() === '') problems.push(`${path}: must be a non-empty string`);
  return value;
}

// A value frozen through and through, and returned.
export function freeze(value) {
  if (value !== null && typeof value === 'object') {
    for (const inner of Object.values(value)) freeze(inner);
    Object.freeze(value);
  }
  return value;
}
