// Two revisions of a form side by side (ADR 0074), and what restoring one puts into the form. A
// revision's values are as Sveltia holds a form's, a flat map from each value's key path, such as
// `teaser.headline` or `topics.0`, to the value; the form's fields are its configuration's, with
// their labels in the interface language. Each field is compared by its kind, under its labels and
// those of what holds it, in the form's order; a value no field of the form holds today is a field
// the form no longer has, named by its key. It knows nothing of the page.

import { itemsBetween, wordsBetween } from './differences.js';

const BODIES = new Set(['konzilo-body', 'markdown', 'richtext']);
const IMAGES = new Set(['konzilo-image', 'image']);
const FILES = new Set(['file']);
const HOLDERS = new Set(['object', 'konzilo-group']);
// A post's own status, its moment and its triggers, which restoring leaves as they are, so that it
// never publishes or unpublishes by itself: the post's top-level fields so named, which a field group
// only shows together in the form.
const KEPT = ['status', 'date', 'triggers'];
const GROUP = 'konzilo-group';

const labelOf = (field) => (typeof field.label === 'string' && field.label !== '' ? field.label : field.name);
const holds = (field) => HOLDERS.has(field.widget) && Array.isArray(field.fields);

// The form's fields as [{ path, labels, field, topLevel }], each that holds a value, in the form's
// order, `topLevel` where only field groups hold it, as the file holds it at its top; and the paths
// of what holds them.
function fieldsOf(fields, prefix = '', labels = [], topLevel = true) {
  const found = [];
  const holders = [];
  for (const field of fields ?? []) {
    const path = prefix === '' ? field.name : `${prefix}.${field.name}`;
    const named = [...labels, labelOf(field)];
    if (holds(field)) {
      holders.push({ path, labels: named });
      const inner = fieldsOf(field.fields, path, named, topLevel && field.widget === GROUP);
      found.push(...inner.found);
      holders.push(...inner.holders);
    } else found.push({ path, labels: named, field, topLevel });
  }
  return { found, holders };
}

const within = (key, path) => key === path || key.startsWith(`${path}.`);

// The value at `path` in a flat map: the value itself, or what is below it, made whole again.
export function valueAt(values, path) {
  if (Object.hasOwn(values, path)) return values[path];
  const below = Object.keys(values).filter((key) => key.startsWith(`${path}.`));
  if (below.length === 0) return undefined;
  const root = {};
  for (const key of below) {
    const parts = key.slice(path.length + 1).split('.');
    let at = root;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) at[part] = values[key];
      else at = (at[part] ??= {});
    });
  }
  // An object whose keys are all places in order is a list.
  const listed = (value) => {
    if (value === null || typeof value !== 'object') return value;
    const keys = Object.keys(value);
    const inner = Object.fromEntries(keys.map((key) => [key, listed(value[key])]));
    return keys.length > 0 && keys.every((key, index) => key === String(index)) ? keys.map((key) => inner[key]) : inner;
  };
  return listed(root);
}

const isEmpty = (value) => value === undefined || value === null || value === ''
  || (Array.isArray(value) && value.length === 0)
  || (typeof value === 'object' && value !== null && Object.keys(value).length === 0);
const alike = (a, b) => (isEmpty(a) && isEmpty(b)) || JSON.stringify(a) === JSON.stringify(b);
const asList = (value) => (isEmpty(value) ? [] : Array.isArray(value) ? value : [value]);

function kindOf(field, before, after) {
  if (BODIES.has(field.widget)) return 'body';
  if (IMAGES.has(field.widget)) return 'image';
  if (FILES.has(field.widget)) return 'file';
  if (field.widget === 'list' || field.multiple === true || Array.isArray(before) || Array.isArray(after)) return 'list';
  const scalar = (value) => isEmpty(value) || typeof value === 'string';
  return scalar(before) && scalar(after) ? 'text' : 'value';
}

// The two revisions `before` and `after` field by field: [{ path, labels, kind, change, before,
// after, ... }], `change` `alike` or `changed`, `kind` one of `text`, with its `parts` word by word,
// `body`, which bodies.js compares, `image`, `file`, `list`, with its `items`, `value`, or
// `vanished`, a value no field of the form holds today.
export function compareForms({ fields, before, after }) {
  const { found, holders } = fieldsOf(fields);
  const rows = [];
  for (const { path, labels, field } of found) {
    const [was, is] = [valueAt(before, path), valueAt(after, path)];
    const kind = kindOf(field, was, is);
    const row = { path, labels, kind, field, change: alike(was, is) ? 'alike' : 'changed', before: was, after: is };
    if (kind === 'text') row.parts = wordsBetween(was ?? '', is ?? '');
    if (kind === 'list') row.items = itemsBetween(asList(was), asList(is));
    rows.push(row);
  }
  // What no field holds, named by its key below the deepest holder it is in, after that holder's
  // own fields.
  const covered = (key) => found.some(({ path }) => within(key, path)) || holders.some(({ path }) => key === path);
  const vanished = new Map();
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (covered(key)) continue;
    const holder = holders.filter(({ path }) => key.startsWith(`${path}.`)).sort((a, b) => b.path.length - a.path.length)[0];
    const rest = holder ? key.slice(holder.path.length + 1) : key;
    const name = rest.split('.')[0];
    const path = holder ? `${holder.path}.${name}` : name;
    if (!vanished.has(path)) vanished.set(path, { labels: [...(holder?.labels ?? []), name], holder: holder?.path ?? '' });
  }
  for (const [path, { labels, holder }] of vanished) {
    const [was, is] = [valueAt(before, path), valueAt(after, path)];
    const row = { path, labels, kind: 'vanished', change: alike(was, is) ? 'alike' : 'changed', before: was, after: is };
    // After the last row of the holder it stood in.
    const last = rows.findLastIndex((one) => holder === '' || within(one.path, holder));
    rows.splice(holder === '' || last === -1 ? rows.length : last + 1, 0, row);
  }
  return rows;
}

// The form's values once `revision` is restored into it, from `current`: each value of a field the
// form has today as the revision holds it, and for a post its own status and its date as they are;
// a value no field holds stays as it is.
export function restoredValues({ fields, current, revision }) {
  const { found } = fieldsOf(fields);
  const own = found.filter(({ field, topLevel }) => topLevel && KEPT.includes(field.name));
  const isPost = own.some(({ field }) => field.name === 'status');
  const kept = isPost ? own.map(({ path }) => path) : [];
  const restored = found.map(({ path }) => path).filter((path) => !kept.includes(path));
  const fromRevision = (key) => restored.some((path) => within(key, path));
  return {
    ...Object.fromEntries(Object.entries(current).filter(([key]) => !fromRevision(key))),
    ...Object.fromEntries(Object.entries(revision).filter(([key]) => fromRevision(key))),
  };
}

// A post's status in a revision, by the label of its option, or null for a form with no status.
export function statusOf({ fields, values }) {
  const status = fieldsOf(fields).found.find(({ field, topLevel }) => topLevel && field.name === 'status');
  if (!status) return null;
  const value = values[status.path];
  if (isEmpty(value)) return null;
  const option = (status.field.options ?? []).find((one) => (typeof one === 'object' ? one?.value : one) === value);
  return typeof option === 'object' && typeof option?.label === 'string' ? option.label : String(value);
}
