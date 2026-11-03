// A value of a setting or a field, given as text, to the type it declares:
// { value, yaml }, no value when it
// is empty, or { reason }.
export function ownValue(stored, field) {
  return metaReaders[field.type](stored ?? '', field);
}

// A value as text, to the field's type.
const metaReaders = {
  string: (stored, { options }) => {
    const value = stored.trim();
    if (value === '') return {};
    if (options && !options.includes(value)) return { reason: `the site cannot publish ${JSON.stringify(value)}, which is not one of the field's choices` };
    return { value, yaml: JSON.stringify(value) };
  },
  number: (stored) => {
    if (stored === '') return {};
    const value = Number(stored);
    if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(stored) || !Number.isFinite(value)) return { reason: `the site cannot publish ${JSON.stringify(stored)} as a number` };
    return { value, yaml: String(value) };
  },
  integer: (stored) => {
    if (stored === '') return {};
    const value = Number(stored);
    if (!/^-?\d+$/.test(stored) || !Number.isSafeInteger(value)) return { reason: `the site cannot publish ${JSON.stringify(stored)} as a whole number` };
    return { value, yaml: String(value) };
  },
  // Yes is `1` or `true`, and no is `0`, `false` or empty.
  boolean: (stored) => {
    if (['1', 'true'].includes(stored)) return { value: true, yaml: 'true' };
    if (['', '0', 'false'].includes(stored)) return { value: false, yaml: 'false' };
    return { reason: `the site cannot publish ${JSON.stringify(stored)} as yes or no` };
  },
  // A day, `YYYY-MM-DD`, which YAML reads as midnight UTC.
  date: (stored) => {
    if (stored === '') return {};
    const value = new Date(`${stored}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stored) || Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== stored) {
      return { reason: `the site cannot publish ${JSON.stringify(stored)} as a date` };
    }
    return { value, yaml: stored };
  },
};
