// What a field group's menu does to the fields it covers (ADR 0071), as values, so that the
// group can tell which of Revert Changes, Restore Default and Clear would change anything, and
// grey the others.
//
// - Revert Changes gives each field what the file held, or a new post's first values.
// - Restore Default gives each field its default. A required field without one keeps what it
//   holds, so that restoring never empties it.
// - Clear empties each field.
// A computed default, such as the slug made from the name in breadcrumbs, counts as a default:
// Restore Default and Clear both give it, worked out from what the other fields then hold.

import { breadcrumbOf, slugFrom } from '../../format/article-parts.js';

// Each computed default by its name in a field's `computed`, from a post's values, flat.
const COMPUTED = {
  slug: (data) => slugFrom(breadcrumbOf(data)),
};

export function computedDefault(name, data) {
  return Object.hasOwn(COMPUTED, name) ? COMPUTED[name](data) : '';
}

const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
const same = (one, other) => (isEmpty(one) && isEmpty(other)) || JSON.stringify(one) === JSON.stringify(other);

// Every field of the group, as `fields` declares them, with a value, empty where it has none.
export function holding(fields, value) {
  return Object.fromEntries(fields.map((field) => [field.name, value?.[field.name] ?? '']));
}

// The values a new post starts with.
const firstValues = (fields, data) => withComputed(fields, Object.fromEntries(fields.map((field) => [field.name, 'default' in field ? field.default : ''])), data);

// The computed defaults worked out last, from the other fields as they then are.
function withComputed(fields, values, data) {
  const made = { ...values };
  for (const field of fields.filter((one) => one.computed)) made[field.name] = computedDefault(field.computed, { ...data, ...made });
  return made;
}

/**
 * What each action of a group's menu would give its fields, and whether that changes anything.
 * @param {object} group
 * @param {object[]} group.fields the group's fields, as the configuration declares them
 * @param {object} group.value what the group holds now
 * @param {object | null} group.read the fields as the file held them, or null for a new post
 * @param {object} group.data the post's other values, flat, which a computed default reads
 * @returns {{ revert: { value, changes }, restore: { value, changes }, clear: { value, changes } }}
 */
export function actionsOf({ fields, value, read, data = {} }) {
  const now = holding(fields, value);
  const given = {
    revert: read === null ? firstValues(fields, data) : holding(fields, read),
    restore: withComputed(fields, Object.fromEntries(fields.map((field) => {
      if ('default' in field) return [field.name, field.default];
      if (field.required === true && !field.computed) return [field.name, now[field.name]];
      return [field.name, ''];
    })), data),
    clear: withComputed(fields, Object.fromEntries(fields.map((field) => [field.name, ''])), data),
  };
  return Object.fromEntries(Object.entries(given).map(([action, values]) => [action, { value: values, changes: fields.some((field) => !same(values[field.name], now[field.name])) }]));
}

// The fields of a group that are required and empty.
export function missing(fields, value) {
  return fields.filter((field) => field.required === true && isEmpty(value?.[field.name]));
}
