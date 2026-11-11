// A post's source file, read into its form's field groups and written back flat (ADR 0071). A
// group is a field of Sveltia's whose value holds the fields it covers, and a source file holds
// those fields flat, as content-format.md says, so the editor reads and writes post files in a
// format of its own: Sveltia's YAML front matter, with each group made from the fields it holds
// as read, and written back as fields again.
//
// `groups` is what the configuration's `konzilo.groups` gives for one format: each group's name,
// and the fields it holds in every form of that format. A field is in the same group in every
// form of a format (config.js), so a file is read alike whatever collection it is of, which the
// format is not told.

import { parse } from 'yaml';

const FRONT_MATTER = /^---[ \t]*\n(?:(?<head>[\s\S]*?)\n)?---[ \t]*(?:\n(?<body>[\s\S]*))?$/s;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);

// The file as Sveltia reads YAML front matter: what it holds, with the text below as `body`.
export function frontMatterOf(text) {
  const found = FRONT_MATTER.exec(text.replace(/\r\n?/g, '\n').trim());
  if (!found) return { body: text };
  const { head = '', body } = found.groups;
  const read = parse(head);
  const fields = isObject(read) ? read : {};
  return Object.hasOwn(fields, 'body') ? fields : { ...fields, body: body?.replace(/^\n/, '') };
}

// A post's values with each group made from the fields it holds, in their place.
export function grouped(data, groups) {
  const made = {};
  const held = new Map(Object.entries(groups).flatMap(([group, fields]) => fields.map((name) => [name, group])));
  for (const [key, value] of Object.entries(data)) {
    if (!held.has(key)) {
      made[key] = value;
      continue;
    }
    const group = held.get(key);
    made[group] = { ...made[group], [key]: value };
  }
  return made;
}

// What a post holds, as its source file holds it: each group's fields in the group's place, in
// its order, and nothing of a field left empty, as Sveltia leaves out an empty optional field. A
// field of a group found beside it, from a file written otherwise, goes, since the group's is
// what the form shows.
export function flattened(data, groups) {
  const covered = new Set(Object.keys(data).filter((key) => isObject(data[key]) && Object.hasOwn(groups, key)).flatMap((key) => groups[key]));
  const flat = {};
  for (const [key, value] of Object.entries(data)) {
    if (Object.hasOwn(groups, key) && isObject(value)) {
      for (const name of groups[key]) if (Object.hasOwn(value, name) && !isEmpty(value[name])) flat[name] = value[name];
    } else if (!covered.has(key)) {
      flat[key] = value;
    }
  }
  return flat;
}

// A post's values as the rest of the editor reads them, flat, with each group's fields as they
// are now: the preview, a field's fallback, and the checks at Save.
export function formValues(data, groups) {
  if (!isObject(data)) return data;
  const flat = { ...data };
  for (const [group, fields] of Object.entries(groups)) {
    if (!Object.hasOwn(data, group)) continue;
    delete flat[group];
    if (!isObject(data[group])) continue;
    for (const name of fields) if (Object.hasOwn(data[group], name)) flat[name] = data[group][name];
  }
  return flat;
}

// The format itself, for `CMS.registerCustomFormat` under Sveltia's own name: read as Sveltia
// reads it, into the groups, and written by Sveltia's own formatter, from the fields.
export function sourceFormat(groups) {
  return {
    fromFile: (text) => grouped(frontMatterOf(text), groups),
    toFile: (data, { serialize }) => serialize(flattened(data, groups)),
  };
}
