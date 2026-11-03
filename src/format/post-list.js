// A post list's and a directive's settings as a content file gives them,
// checked against what the site declares.
//
// A post's later pages follow one list, so a post holds at most one list with
// pages of its own.
export const SECOND_PAGED_LIST = 'the site cannot publish a second list with pages of its own; turn off Pages in one of them';

// Why the site cannot publish an attribute that names something the site
// description declares (its `declared`, such as a form) with this value, or
// null when the site declares it: the attribute's `refusal`, `{value}` the
// value and `{declared}` what the site declares under that key, or `none`.
// `declared` is what the site declares, the names by the key
// (declaredNames() in site-description.js).
export function declaredProblem(attribute, value, declared) {
  const names = declared[attribute.declared] ?? [];
  if (names.includes(value)) return null;
  return attribute.refusal.replaceAll('{value}', String(value)).replaceAll('{declared}', names.length === 0 ? 'none' : listed(names));
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
  if (values.type !== undefined && !type) problems.push(`the site has no post type ${JSON.stringify(values.type)} to list`);
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
    const offered = known.length === 0 ? 'it declares none' : `it has ${listed(known)}`;
    problems.push(`the site has no presentation ${JSON.stringify(values.presentation)} for a list; ${offered}`);
  }
  if (presentation) {
    const options = new Map(presentation.options.map((option) => [option.name, option]));
    for (const [name, value] of Object.entries(given)) {
      if (Object.hasOwn(attributes, name)) continue;
      const option = options.get(name);
      if (!option) {
        if (value !== false) problems.push(`the presentation ${JSON.stringify(values.presentation)} has no option ${JSON.stringify(name)}`);
        continue;
      }
      // A file holds each value as text, which the option's type reads.
      if (typeof value === 'string' && option.type !== 'string') {
        const typed = option.type === 'integer' ? (/^-?(0|[1-9][0-9]*)$/.test(value) ? Number(value) : undefined) : { true: true, false: false }[value];
        if (typed === undefined) {
          problems.push(`the site cannot publish the setting ${JSON.stringify(name)} with the value ${JSON.stringify(value)}`);
          continue;
        }
        settings[name] = typed;
      }
      if (option.options && !option.options.includes(value)) {
        problems.push(`the option ${JSON.stringify(name)} is one of ${listed(option.options.map((one) => JSON.stringify(one)))}, not ${JSON.stringify(value)}`);
      }
    }
    for (const option of presentation.options) {
      if (option.required && (given[option.name] === undefined || given[option.name] === '')) {
        problems.push(`the presentation ${JSON.stringify(values.presentation)} needs the option ${JSON.stringify(option.name)}`);
      }
    }
  }
  return { problems, settings, query };
}

// A list of words as a sentence gives them: `a`, `a and b`, `a, b and c`.
function listed(words) {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
}

// A list's terms to include or to exclude: { groups, text }, the slugs by
// taxonomy and the setting as the file holds it, or null after a problem.
function listTerms(key, value, type, problems) {
  const malformed = () => {
    problems.push(`the setting ${JSON.stringify(key)} names terms as taxonomy:term,term, one taxonomy after another, not as ${JSON.stringify(value)}`);
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
      problems.push(`${type.plural} take no terms of the taxonomy ${JSON.stringify(name)}`);
      return null;
    }
    if (Object.hasOwn(groups, name)) {
      problems.push(`the setting ${JSON.stringify(key)} names the taxonomy ${JSON.stringify(name)} twice`);
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
      problems.push(`the setting "where" holds conditions as field=value, one after another with ";" between them, not as ${JSON.stringify(written)}`);
      continue;
    }
    const [, field, op, text] = parts;
    if (!Object.hasOwn(type.fields, field)) {
      problems.push(`${type.plural} have no field ${JSON.stringify(field)} to filter on`);
      continue;
    }
    const declared = type.fields[field];
    if (!ORDERED_FIELDS.includes(declared.type) && !['=', '!='].includes(op)) {
      problems.push(`the field ${JSON.stringify(field)} is compared only with = and !=, not ${op}`);
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
  const not = (what) => ({ reason: `the field ${JSON.stringify(field)} is ${what}, not ${JSON.stringify(text)}` });
  switch (type) {
    case 'number':
      return /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(text) ? { value: Number(text) } : not('a number');
    case 'integer':
      return /^-?(0|[1-9][0-9]*)$/.test(text) ? { value: Number(text) } : not('a whole number');
    case 'boolean':
      return text === 'true' || text === 'false' ? { value: text === 'true' } : not('yes or no, true or false');
    case 'date': {
      const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
      const valid = day && new Date(`${text}T00:00:00Z`).toISOString().slice(0, 10) === text;
      return valid ? { value: text } : not('a day, YYYY-MM-DD');
    }
    case 'choice': {
      const value = conditionText(text);
      return options.includes(value) ? { value } : { reason: `the field ${JSON.stringify(field)} is one of ${listed(options.map((one) => JSON.stringify(one)))}, not ${JSON.stringify(value)}` };
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
    if (type.taxonomies.length === 0) problems.push(`${type.plural} have no terms to relate by`);
    if (values.direction !== undefined) problems.push('a related list is ranked by the terms its posts share, so it takes no direction');
    return { order, direction: 'descending', orderType: undefined };
  }
  if (order !== 'title' && !Object.hasOwn(type.fields, order)) {
    problems.push(`${type.plural} have no field ${JSON.stringify(order)} to order by`);
    return {};
  }
  const direction = values.direction ?? (order === 'date' || order === 'modified' ? 'descending' : 'ascending');
  return { order, direction, orderType: order === 'title' ? undefined : type.fields[order].type };
}
