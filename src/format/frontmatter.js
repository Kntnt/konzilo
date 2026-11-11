// A value of a setting or a field, given as text, to the type it declares:
// { value, yaml }, no value when it is empty, or { reason }, by its name in the
// core's catalogues and the values that fill it (refusals.js).
export function ownValue(stored, field) {
  return metaReaders[field.type](stored ?? '', field);
}

// A value as text, to the field's type.
const not = (name, given) => ({ reason: { name: `refusal.${name}`, values: { value: JSON.stringify(given) } } });

const metaReaders = {
  string: (stored, { options }) => {
    const value = stored.trim();
    if (value === '') return {};
    if (options && !options.includes(value)) return not('value-choice', value);
    return { value, yaml: JSON.stringify(value) };
  },
  number: (stored) => {
    if (stored === '') return {};
    const value = Number(stored);
    if (!/^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(stored) || !Number.isFinite(value)) return not('value-number', stored);
    return { value, yaml: String(value) };
  },
  integer: (stored) => {
    if (stored === '') return {};
    const value = Number(stored);
    if (!/^-?\d+$/.test(stored) || !Number.isSafeInteger(value)) return not('value-integer', stored);
    return { value, yaml: String(value) };
  },
  // Yes is `1` or `true`, and no is `0`, `false` or empty.
  boolean: (stored) => {
    if (['1', 'true'].includes(stored)) return { value: true, yaml: 'true' };
    if (['', '0', 'false'].includes(stored)) return { value: false, yaml: 'false' };
    return not('value-boolean', stored);
  },
  // A day, `YYYY-MM-DD`, which YAML reads as midnight UTC.
  date: (stored) => {
    if (stored === '') return {};
    const value = new Date(`${stored}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(stored) || Number.isNaN(value.valueOf()) || value.toISOString().slice(0, 10) !== stored) {
      return not('value-date', stored);
    }
    return { value, yaml: stored };
  },
};
