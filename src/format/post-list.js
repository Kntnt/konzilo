// A post list's and a directive's settings as a content file gives them,
// checked against what the site declares. Each problem is a reason by its name
// in the core's catalogues and the values that fill it (refusals.js), which the
// intake gives the editor and the build writes in British English.

import { british } from '../refusals.js';

const said = (name, values = {}) => ({ name, values });

// A post's later pages follow one list, so a post holds at most one list with
// pages of its own.
export const SECOND_PAGED_LIST = said('refusal.list-paged-twice');

// Why the site cannot publish an attribute that names something the site
// description declares (its `declared`, such as a form) with this value, or
// null when the site declares it: the attribute's `refusal`, `{value}` the
// value and `{declared}` what the site declares under that key, or `none`.
// `declared` is what the site declares, the names by the key
// (declaredNames() in site-description.js).
export function declaredProblem(attribute, value, declared) {
  const names = declared[attribute.declared] ?? [];
  if (names.includes(value)) return null;
  return british({ name: attribute.refusal.name, values: { value: String(value), declared: names.length === 0 ? { name: 'about.none' } : { and: names } } });
}

// The post list: its settings, the directive's attributes as the content file
// gives them, each of its type, against what the
// site's lists may name (`lists`, postListModel() in site-description.js).
// `attributes` are the directive's own, with their defaults; the others are
// the options of its presentation. Returns { problems, settings, query }: why
// the site cannot publish the list; the settings, typed; and the query the
// evaluator takes (post-lists.js).
//
// A list's terms are `<taxonomy>:<term>,<term>`, taxonomies apart by a
// space, each taxonomy one its type takes; its conditions are
// `<field><op><value>`, apart by `;`, each op `=`, `!=`, `<`, `<=`, `>` or
// `>=`, a `;` and a `%` in a text's value written as `%3B` and `%25`.
export function readPostList(given, lists, { attributes } = {}) {
  const problems = [];
  const settings = { ...given };
  const defaults = Object.fromEntries(Object.entries(attributes).filter(([, setting]) => Object.hasOwn(setting, 'default')).map(([name, setting]) => [name, setting.default]));
  const values = { ...defaults, ...given };
  const query = {
    type: values.type,
    include: {},
    exclude: {},
    where: [],
    order: undefined,
    direction: undefined,
    orderType: undefined,
    offset: values.offset,
    number: values.number,
    leaveOutThis: values.leaveOutThis,
    leaveOutShown: values.leaveOutShown,
  };

  const type = typeof values.type === 'string' && Object.hasOwn(lists.types, values.type) ? lists.types[values.type] : null;
  if (values.type !== undefined && !type) problems.push(said('refusal.list-type', { type: JSON.stringify(values.type) }));
  if (type) {
    for (const key of ['include', 'exclude']) {
      if (values[key] === undefined) continue;
      const read = listTerms(key, values[key], type, problems);
      if (!read) continue;
      query[key] = read.groups;
      if (read.text === '') delete settings[key];
      else settings[key] = read.text;
    }
    if (values.where !== undefined) query.where = listConditions(values.where, type, problems);
    const order = listOrder(values, type, problems);
    Object.assign(query, order);
  }

  const known = Object.keys(lists.presentations);
  const presentation = typeof values.presentation === 'string' && Object.hasOwn(lists.presentations, values.presentation) ? lists.presentations[values.presentation] : null;
  if (values.presentation !== undefined && !presentation) {
    const offered = known.length === 0 ? said('about.presentations-none') : said('about.presentations', { presentations: { and: known } });
    problems.push(said('refusal.list-presentation', { presentation: JSON.stringify(values.presentation), offered }));
  }
  if (presentation) {
    const options = new Map(presentation.options.map((option) => [option.name, option]));
    for (const [name, value] of Object.entries(given)) {
      if (Object.hasOwn(attributes, name)) continue;
      const option = options.get(name);
      if (!option) {
        if (value !== false) problems.push(said('refusal.list-option', { presentation: JSON.stringify(values.presentation), option: JSON.stringify(name) }));
        continue;
      }
      // A file holds each value as text, which the option's type reads.
      if (typeof value === 'string' && option.type !== 'string') {
        const typed = option.type === 'integer' ? (/^-?(0|[1-9][0-9]*)$/.test(value) ? Number(value) : undefined) : { true: true, false: false }[value];
        if (typed === undefined) {
          problems.push(said('refusal.list-option-value', { option: JSON.stringify(name), value: JSON.stringify(value) }));
          continue;
        }
        settings[name] = typed;
      }
      if (option.options && !option.options.includes(value)) {
        problems.push(said('refusal.list-option-choice', { option: JSON.stringify(name), choices: { or: option.options.map((one) => JSON.stringify(one)) }, value: JSON.stringify(value) }));
      }
    }
    for (const option of presentation.options) {
      if (option.required && (given[option.name] === undefined || given[option.name] === '')) {
        problems.push(said('refusal.list-option-required', { presentation: JSON.stringify(values.presentation), option: JSON.stringify(option.name) }));
      }
    }
  }
  return { problems, settings, query };
}

// A list's terms to include or to exclude: { groups, text }, the slugs by
// taxonomy and the setting as the file holds it, or null after a problem.
function listTerms(key, value, type, problems) {
  const malformed = () => {
    problems.push(said('refusal.list-terms', { setting: JSON.stringify(key), value: JSON.stringify(value) }));
    return null;
  };
  if (typeof value !== 'string') return malformed();
  const groups = {};
  const written = [];
  for (const group of value.split(' ').filter((part) => part !== '')) {
    const parts = /^([a-z][a-z0-9_]*):([^,]+(?:,[^,]+)*)$/.exec(group);
    if (!parts) return malformed();
    const [, name, list] = parts;
    const taxonomy = type.taxonomies.find((one) => one.name === name);
    if (!taxonomy) {
      problems.push(said('refusal.list-taxonomy', { plural: { label: type.plural }, taxonomy: JSON.stringify(name) }));
      return null;
    }
    if (Object.hasOwn(groups, name)) {
      problems.push(said('refusal.list-taxonomy-twice', { setting: JSON.stringify(key), taxonomy: JSON.stringify(name) }));
      return null;
    }
    const slugs = [];
    for (const one of list.split(',')) {
      if (!/^[a-z0-9_-]+$/.test(one)) return malformed();
      slugs.push(one);
    }
    if (slugs.length === 0) continue;
    groups[name] = slugs;
    written.push(`${name}:${slugs.join(',')}`);
  }
  return { groups, text: written.join(' ') };
}

const ORDERED_FIELDS = ['number', 'integer', 'date'];

// A list's conditions, each { field, op, value, type }, typed as its field.
function listConditions(value, type, problems) {
  const conditions = [];
  if (typeof value !== 'string') return conditions;
  for (const written of value.split(';')) {
    const parts = /^([a-zA-Z][a-zA-Z0-9_]*)(!=|<=|>=|=|<|>)(.*)$/s.exec(written);
    if (!parts) {
      problems.push(said('refusal.list-where', { value: JSON.stringify(written) }));
      continue;
    }
    const [, field, op, text] = parts;
    if (!Object.hasOwn(type.fields, field)) {
      problems.push(said('refusal.list-where-field', { plural: { label: type.plural }, field: JSON.stringify(field) }));
      continue;
    }
    const declared = type.fields[field];
    if (!ORDERED_FIELDS.includes(declared.type) && !['=', '!='].includes(op)) {
      problems.push(said('refusal.list-where-operator', { field: JSON.stringify(field), operator: op }));
      continue;
    }
    const typed = conditionValue(field, declared, text);
    if (typed.reason) problems.push(typed.reason);
    else conditions.push({ field, op, value: typed.value, type: declared.type });
  }
  return conditions;
}

// A condition's value, as its field's type reads it: { value } or { reason }.
function conditionValue(field, { type, options }, text) {
  const not = (what) => ({ reason: said('refusal.list-where-value', { field: JSON.stringify(field), kind: said(`about.kind-${what}`), value: JSON.stringify(text) }) });
  switch (type) {
    case 'number':
      return /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text) ? { value: Number(text) } : not('number');
    case 'integer':
      return /^-?(0|[1-9][0-9]*)$/.test(text) ? { value: Number(text) } : not('integer');
    case 'boolean':
      return text === 'true' || text === 'false' ? { value: text === 'true' } : not('boolean');
    case 'date': {
      const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
      const valid = day && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;
      return valid ? { value: text } : not('date');
    }
    case 'choice': {
      const value = conditionText(text);
      return options.includes(value) ? { value } : { reason: said('refusal.list-where-choice', { field: JSON.stringify(field), choices: { or: options.map((one) => JSON.stringify(one)) }, value: JSON.stringify(value) }) };
    }
    default:
      return { value: conditionText(text) };
  }
}

// A text's value in a condition, with `;` and `%` as `%3B` and `%25`.
function conditionText(text) {
  return text.replace(/%(3B|25)/gi, (escape) => (escape.toUpperCase() === '%3B' ? ';' : '%'));
}

// A list's order and direction, each as it is or as it falls by default:
// newest first for a type with a date, else by title; ascending, but for a
// date or a modified date, newest first. { order, direction, orderType }.
function listOrder(values, type, problems) {
  const order = values.order ?? (Object.hasOwn(type.fields, 'date') ? 'date' : 'title');
  if (order === 'related') {
    if (type.taxonomies.length === 0) problems.push(said('refusal.list-related', { plural: { label: type.plural } }));
    if (values.direction !== undefined) problems.push(said('refusal.list-related-direction'));
    return { order, direction: 'descending', orderType: undefined };
  }
  if (order !== 'title' && !Object.hasOwn(type.fields, order)) {
    problems.push(said('refusal.list-order', { plural: { label: type.plural }, field: JSON.stringify(order) }));
    return {};
  }
  const direction = values.direction ?? (order === 'date' || order === 'modified' ? 'descending' : 'ascending');
  return { order, direction, orderType: order === 'title' ? undefined : type.fields[order].type };
}
