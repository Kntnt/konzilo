// Konzilo's own settings groups: settings the core declares, the same on every
// site, such as search and sharing or feeds, beside the settings a site
// description declares of its own. The core's declaration is
// format/settings-groups.json.
//
// settingsGroups() checks a declaration and gives it in the form the readers
// use; groupsFor() picks the groups that apply to a site, each per-type part
// made one part per post type. settings.json holds a group's values under its
// name.

import { freeze, isObject, onlyKeys as checkedKeys, text } from './checks.js';
import { ownValue } from './format/frontmatter.js';
import declaration from './format/settings-groups.json' with { type: 'json' };
import { templateProblems, variablesOf } from './metadata-templates.js';
import { fieldName, IDENTITY, IMAGE, ownField, POST, translatedOf } from './site-description.js';
import { inLanguage, isTextInEachLanguage, TEXT_LANGUAGES } from './texts.js';

// The kinds of post type a per-type part may be limited to: those with an
// address, whose posts have a page, and those with a date.
const limits = {
  address: (type) => type.address !== null,
  date: (type) => type.fields.some((field) => field.kind === 'date'),
};

// The kinds of post type a setting of a part per post type may have a
// default for: those a part may be limited to, and a type named `page`.
const kinds = {
  ...limits,
  page: (type) => type.name === 'page',
};

// The key a group's per-type part is kept and written under, which no
// setting of a group may take.
export const TYPES = 'types';

// The default of a text that is the site's title, as settings.json holds it:
// the setting takes it while it has no value of its own, and is left out while
// the site has no title.
export const SITE_TITLE = Object.freeze({ identity: 'title' });

// Whether a setting's default is the site's title.
export function isSiteTitle(value) {
  return isObject(value) && value.identity === SITE_TITLE.identity;
}

// What a group may be repeated for, as `each` names it: each form the site
// description declares, by the form's name and label.
const EACH = ['forms'];

const checked = new WeakSet();
let core;

// The core's own groups, as declared in format/settings-groups.json.
export function coreSettingsGroups() {
  core ??= settingsGroups(declaration);
  return core;
}

// A declaration as declared (the parsed JSON, group name to group) to the
// form the readers use, the groups in the order declared:
//
//   [ { name, label, description, when, settings, parts: [ { name, label, description, settings } ],
//       types: { only, settings } or null, table, each } ]
//
// `settings` are the group's settings in the form of a site's own, each with its `default` as settings.json holds it when one is
// declared, and `published: false` when it stays out of the published files and
// the site never gets it, such as a form's recipients. `each` names what the group's
// settings are repeated for, `forms`, or is null: such a group has no
// settings, parts or table of its own, but a part with its settings for
// each form the site declares, by the form's name, and applies to every
// site that declares one. `parts` are the group's named parts, each a set of
// settings kept and written under its name, in the order declared, such as
// the start page's templates, with the text the page shows under its label,
// `description`, or null. `types` is the part repeated for each post
// type, limited by `only` to the types with an address or with a date, or
// for every type. `table` lists the named parts the page shows as the first
// rows of one table with the part per post type, a column per setting; null
// when the page shows each part on its own.
// `when` lists the paths into the site description of which one must lead
// to a value for the group to apply to a site; null when the group applies
// to every site. Throws an Error naming every problem. What it returns it
// takes back as it is.
export function settingsGroups(declared) {
  if (checked.has(declared)) return declared;
  const problems = [];
  const groups = [];
  if (!isObject(declared)) problems.push('the settings groups must be a JSON object of groups by name');
  else for (const [name, group] of Object.entries(declared)) groups.push(groupOf(name, group, name, problems));
  if (problems.length > 0) {
    throw new Error(`the core's settings groups are not valid:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  }
  const result = freeze(groups);
  checked.add(result);
  return result;
}

// The groups that apply to a site: `declared` is its site description as
// declared, which each group's `when` reads, `types` its post types as
// checked and `language` its language, a locale or null. Each
// group's named parts are as declared. Each group's per-type part becomes
// `types`, one part for each post type it is repeated for, in the order the
// site declares them: [ { type, label, settings } ], `label` the type's
// plural, each setting with the default for the kind of type it is
// (`defaultFor`). A default in each language is the one in the site's
// language (texts.js); a translated setting's keeps the text in each of the
// core's languages beside it, as `defaults`, from which each of a site's
// languages takes its own (groupsIn()).
//
// A group repeated for each form has no settings of its own (`settings` is
// empty) and `each`, one part for each form the site declares, in its order:
// [ { name, label, settings } ], `name` and `label` the form's, `forms` as
// siteDescription() reads them. Any other group's `each` is null.
export function groupsFor(declared, types, groups, language = null, forms = {}) {
  const inSite = (settings) => settings.map((setting) => (isTextInEachLanguage(setting.default)
    ? { ...setting, default: inLanguage(setting.default, language), ...(setting.translated ? { defaults: setting.default } : {}) }
    : setting));
  const each = { forms: Object.values(forms).filter((form) => form !== null) };
  const applies = (group) => (group.each === null
    ? group.when === null || group.when.some((path) => reaches(declared, path.split('.')))
    : each[group.each].length > 0);
  // A group whose every setting stays out of the published files gives the
  // site nothing: neither the settings file nor Astro has it.
  const gives = (group) => group.types !== null
    || [...group.settings, ...group.parts.flatMap((part) => part.settings)].some((setting) => setting.published !== false);
  return groups.filter((group) => applies(group) && gives(group)).map((group) => ({
    name: group.name,
    label: group.label,
    description: group.description,
    settings: group.each === null ? inSite(group.settings) : [],
    parts: group.parts.map((part) => ({ name: part.name, label: part.label, description: part.description, settings: inSite(part.settings) })),
    types: group.types === null ? null : Object.values(types)
      .filter((type) => type !== null && (group.types.only === null || limits[group.types.only](type)))
      .map((type) => ({ type: type.name, label: type.plural, settings: inSite(forType(group.types.settings, type)) })),
    table: group.table,
    each: group.each === null ? null : each[group.each].map((item) => ({ name: item.name, label: item.label, settings: inSite(group.settings) })),
  }));
}

// The groups that apply to a site, as groupsFor() gives them, for one of
// the site's languages other than its main one, `locale`: a
// translated setting's default in each language is the one in that
// language, and a setting that is not translated, whose value is the same in
// every language, has the site's title as its default as `title`, the title
// as the main language's settings file holds it, or no default when that has
// none.
export function groupsIn(groups, locale, title) {
  const inLanguageOf = (settings) => settings.map((setting) => {
    if (setting.translated) return setting.defaults ? { ...setting, default: inLanguage(setting.defaults, locale) } : setting;
    if (!isSiteTitle(setting.default)) return setting;
    const { default: _, ...rest } = setting;
    return title === undefined ? rest : { ...rest, default: title };
  });
  return groups.map((group) => ({
    ...group,
    settings: inLanguageOf(group.settings),
    parts: group.parts.map((part) => ({ ...part, settings: inLanguageOf(part.settings) })),
    types: group.types === null ? null : group.types.map((part) => ({ ...part, settings: inLanguageOf(part.settings) })),
    each: group.each === null ? null : group.each.map((item) => ({ ...item, settings: inLanguageOf(item.settings) })),
  }));
}

// A part per post type's settings for one type: each with a default for
// the kind of type it is, by the order its `defaultFor` gives them, takes
// it in place of its `default`.
function forType(settings, type) {
  return settings.map(({ defaultFor, ...setting }) => {
    const kind = Object.keys(defaultFor ?? {}).find((found) => kinds[found](type));
    return kind === undefined ? setting : { ...setting, default: defaultFor[kind] };
  });
}

// Whether a path leads to a value in the description as declared: `*`
// stands for every key, a name in a list for that item of it, and false and
// null are no value.
function reaches(value, [first, ...rest]) {
  if (first === undefined) return value !== undefined && value !== null && value !== false;
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value) && first !== '*') return value.includes(first) && reaches(first, rest);
  const inner = first === '*' ? Object.values(value) : Object.hasOwn(value, first) ? [value[first]] : [];
  return inner.some((found) => reaches(found, rest));
}

// What names the declaration in a problem with its keys.
const WHOLE = 'the core\'s settings groups';

function groupOf(name, group, path, problems) {
  if (!/^[a-z][a-zA-Z0-9]*$/.test(name)) {
    problems.push(`${path}: a group's name must be letters and digits in lowercase camelCase, starting with a lowercase letter`);
  } else if (IDENTITY.includes(name)) {
    problems.push(`${path}: ${name} is where the site settings hold the site's ${name}; give the group another name`);
  }
  if (!isObject(group)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  onlyKeys(group, ['label', 'description', 'when', 'table', 'settings', 'parts', 'types', 'each'], path, problems);
  const each = group.each === undefined ? null : group.each;
  if (each !== null && !EACH.includes(each)) {
    problems.push(`${path}.each: must be ${EACH.join(' or ')}, the declarations the group is repeated for`);
  }
  const repeated = each !== null && EACH.includes(each);
  if (repeated) {
    if (group.when !== undefined) problems.push(`${path}.when: a group repeated for each form applies to every site that declares one`);
    for (const key of ['parts', 'types', 'table']) {
      if (group[key] !== undefined) problems.push(`${path}.${key}: a group repeated for each form has its settings alone`);
    }
  }
  const result = {
    name,
    label: text(group.label, `${path}.label`, problems),
    description: text(group.description, `${path}.description`, problems),
    when: repeated ? null : whenOf(group.when, `${path}.when`, problems),
    settings: group.settings === undefined ? [] : settingsOf(group.settings, `${path}.settings`, problems, repeated ? 'each' : 'group'),
    each: repeated ? each : null,
  };
  result.parts = group.parts === undefined || repeated ? [] : partsOf(group.parts, result.settings, `${path}.parts`, problems);
  result.types = group.types === undefined || repeated ? null : typesOf(group.types, `${path}.types`, problems);
  result.table = group.table === undefined || repeated ? null : tableOf(group.table, result, `${path}.table`, problems);
  if (group.settings === undefined && group.parts === undefined && group.types === undefined) {
    problems.push(`${path}: must declare settings, parts, a part per post type or more than one of them`);
  }
  return result;
}

// The paths into the site description of which one must lead to a value
// for the group to apply, or null for a group that applies to every site.
function whenOf(when, path, problems) {
  if (when === undefined) return null;
  const pattern = /^([A-Za-z0-9_/-]+|\*)(\.([A-Za-z0-9_/-]+|\*))*$/;
  if (!Array.isArray(when) || when.length === 0 || !when.every((found) => typeof found === 'string' && pattern.test(found))) {
    problems.push(`${path}: must list paths into the site description, each of names or * joined by dots, such as "types.*.feed"`);
    return null;
  }
  return [...when];
}

// The named parts the page shows as the first rows of one table with the
// part per post type, a row per part and per type and a column per setting:
// each part declares the same yes-or-no settings as the part per post type,
// in the same order.
function tableOf(table, group, path, problems) {
  if (!Array.isArray(table) || !table.every((name) => typeof name === 'string') || new Set(table).size !== table.length) {
    problems.push(`${path}: must list the names of the group's parts that are rows of the table, each once`);
    return null;
  }
  if (group.types === null) {
    problems.push(`${path}: a table is the part per post type's, so the group must declare one`);
    return null;
  }
  const columns = group.types.settings.map((setting) => setting.name).join();
  if (group.types.settings.some((setting) => setting.type !== 'boolean')) {
    problems.push(`${path}: a table shows only yes-or-no settings, which the part per post type's must all be`);
  }
  for (const name of table) {
    const part = group.parts.find((found) => found.name === name);
    if (!part) problems.push(`${path}: ${name} is not one of the group's parts`);
    else if (part.settings.map((setting) => setting.name).join() !== columns || part.settings.some((setting) => setting.type !== 'boolean')) {
      problems.push(`${path}: ${name} must declare the settings of the part per post type, in its order, to be a row of its table`);
    }
  }
  return [...table];
}

// A group's named parts, each a set of settings kept and written under its
// name beside the group's own settings, which no part's name may take, and
// optionally a description, which the page shows under the part's label.
function partsOf(parts, settings, path, problems) {
  if (!isObject(parts)) {
    problems.push(`${path}: must be an object`);
    return [];
  }
  const result = [];
  for (const [name, part] of Object.entries(parts)) {
    const at = `${path}.${name}`;
    if (!fieldName(name, at, problems)) continue;
    if (name === TYPES) {
      problems.push(`${at}: is where a group keeps its part per post type; give the part another name`);
      continue;
    }
    if (settings.some((setting) => setting.name === name)) {
      problems.push(`${at}: is also the name of one of the group's settings; give the part another name`);
      continue;
    }
    if (!isObject(part)) {
      problems.push(`${at}: must be an object`);
      continue;
    }
    onlyKeys(part, ['label', 'description', 'settings'], at, problems);
    result.push({
      name,
      label: text(part.label, `${at}.label`, problems),
      description: part.description === undefined ? null : text(part.description, `${at}.description`, problems),
      settings: settingsOf(part.settings, `${at}.settings`, problems, 'part'),
    });
  }
  return result;
}

// A group's part per post type: the settings each type gets, and the kind
// of type it is limited to, or null for every type.
function typesOf(types, path, problems) {
  if (!isObject(types)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  onlyKeys(types, ['only', 'settings'], path, problems);
  if (types.only !== undefined && !Object.hasOwn(limits, types.only)) {
    problems.push(`${path}.only: must be ${Object.keys(limits).join(' or ')}, the post types the part is limited to`);
  }
  return { only: types.only ?? null, settings: settingsOf(types.settings, `${path}.settings`, problems, 'types') };
}

// A group's settings, `where` it declares them: among its own (`group`),
// in a named part (`part`), in its part per post type (`types`) or in a
// group repeated for each form (`each`); a part must declare at least one.
function settingsOf(settings, path, problems, where = 'group') {
  const inPart = where !== 'group';
  if (!isObject(settings) || (inPart && Object.keys(settings).length === 0)) {
    problems.push(`${path}: must be an object${inPart ? ' that declares at least one' : ''}`);
    return [];
  }
  const result = [];
  for (const [name, setting] of Object.entries(settings)) {
    const read = settingOf(name, setting, `${path}.${name}`, problems, where);
    if (!read) continue;
    if (read.requires !== undefined) requiredBy(read, result, `${path}.${name}.requires`, problems);
    result.push(read);
  }
  return result;
}

// A yes-or-no setting that requires another, declared before it among the
// same settings, which is off wherever that one is off.
function requiredBy(read, before, path, problems) {
  const required = before.find((setting) => setting.name === read.requires);
  if (typeof read.requires !== 'string' || !required) {
    problems.push(`${path}: must name a setting declared before it, among the same settings`);
    delete read.requires;
  } else if (read.type !== 'boolean' || required.type !== 'boolean') {
    problems.push(`${path}: only a yes-or-no setting requires another, which must be one too`);
    delete read.requires;
  }
}

// A group's setting: in the form of a site's own, with its default, which
// must be a value of its type that the site publishes as it is declared; and in
// a part per post type, the default for the types with an address or a
// date, or for a type named `page`, `defaultFor`, which such a type takes
// in place of `default`. A text may be a metadata template (`template`,
// metadata-templates.js), whose default names only the variables every site
// knows, and in a part per post type every type; a text shown as a text area
// may hold regular expressions, one per line (`patterns`, ai-visibility.js),
// and a text shown as text may declare its form (`format`, formatOf()).
// A number may have a least value (`min`), which its default and every
// value kept must reach. A yes-or-no setting may require another
// (`requires`, checked by settingsOf()), any setting may have a help text
// the page shows with its control (`help`), and any but one of a part per post
// type may stay out of the published files (`published: false`). A text a visitor reads
// is `translated`, as a site's own setting may be
// (translatedOf()): on a site in several languages it has a value in each,
// and none that stays out of the published files is.
function settingOf(name, setting, path, problems, where) {
  if (!fieldName(name, path, problems)) return null;
  if (name === TYPES) {
    problems.push(`${path}: is where a group keeps its part per post type; give the setting another name`);
    return null;
  }
  if (!isObject(setting)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  const { default: given, defaultFor, template, help, requires, patterns, format, published, translated, min, ...declared } = setting;
  const read = ownField(name, declared, path, problems, WHOLE);
  if (min !== undefined) {
    if (read.type !== 'integer' && read.type !== 'number') problems.push(`${path}.min: only a number has a least value`);
    else if (read.type === 'integer' ? !Number.isSafeInteger(min) : typeof min !== 'number' || !Number.isFinite(min)) problems.push(`${path}.min: must be ${expected[read.type]}`);
    else read.min = min;
  }
  if (translatedOf(translated, read, path, problems)) {
    if (published === false) problems.push(`${path}.translated: a setting that stays out of the published files is never written, in any language`);
    else read.translated = true;
  }
  if (published !== undefined) {
    if (where === 'types') problems.push(`${path}.published: a part per post type is written whole`);
    else if (published !== false) problems.push(`${path}.published: must be false, for a setting that stays out of the published files, or left out`);
    else read.published = false;
  }
  if (help !== undefined) read.help = text(help, `${path}.help`, problems);
  if (requires !== undefined) read.requires = requires;
  if (patterns !== undefined) {
    if (patterns !== true) problems.push(`${path}.patterns: must be true, or left out`);
    else if (read.type !== 'string' || read.control !== 'textarea') problems.push(`${path}.patterns: only a text shown as a text area holds patterns, one per line`);
    else read.patterns = true;
  }
  if (format !== undefined) {
    const form = formatOf(format, `${path}.format`, problems);
    if (read.type !== 'string' || read.control !== 'text' || read.patterns || template !== undefined) problems.push(`${path}.format: only a text shown as text, which is neither a template nor patterns, has a form`);
    else if (form) read.format = form;
  }
  if (template !== undefined) {
    if (template !== true) problems.push(`${path}.template: must be true, or left out`);
    else if (read.type !== 'string' || !textControls.includes(read.control)) problems.push(`${path}.template: only a text shown as text or a text area is a template`);
    else read.template = true;
  }
  defaultsOf(read, given, path, problems);
  if (defaultFor !== undefined) read.defaultFor = defaultsFor(read, defaultFor, given, where, path, problems);
  if (read.template && read.default !== undefined) {
    const variables = variablesOf(where === 'types' ? ANY_TYPE : null);
    const defaults = typeof read.default === 'string' ? { '': read.default } : isSiteTitle(read.default) ? {} : read.default;
    for (const [language, text] of Object.entries(defaults)) {
      for (const problem of templateProblems(text, variables)) problems.push(`${path}.default${language ? `.${language}` : ''}: ${problem}`);
    }
  }
  return read;
}

// The form a text must have, `{ pattern, reason }`: a regular expression
// of the whole value, from ^ to $, read with the u flag, and
// what the refusal of a value without that form says after the setting's
// name, such as `must be the container's ID as Matomo gives it`. The value
// is matched with its ends trimmed; an empty value has no form to check.
function formatOf(format, path, problems) {
  if (!isObject(format)) {
    problems.push(`${path}: must be { "pattern": …, "reason": … }`);
    return null;
  }
  onlyKeys(format, ['pattern', 'reason'], path, problems);
  const { pattern, reason } = format;
  let compiled = null;
  if (typeof pattern !== 'string' || !pattern.startsWith('^') || !pattern.endsWith('$') || pattern.includes('\x01')) {
    problems.push(`${path}.pattern: must be a regular expression of the whole value, from ^ to $`);
  } else {
    try {
      compiled = new RegExp(pattern, 'u');
    } catch (error) {
      problems.push(`${path}.pattern: is not a regular expression: ${error.message}`);
    }
  }
  text(reason, `${path}.reason`, problems);
  return compiled && typeof reason === 'string' && reason.trim() !== '' ? Object.freeze({ pattern, reason }) : null;
}

// A post type that declares no field, whose variables every type knows.
const ANY_TYPE = Object.freeze({ label: 'its label', fields: [] });

// A setting's default into `read`, as declared: one value, or a text in
// each of the core's languages.
function defaultsOf(read, given, path, problems) {
  if (given !== undefined && read.type === POST) {
    problems.push(`${path}.default: a choice of a post has no default, since no post is on every site`);
    return;
  }
  if (given !== undefined && read.type === IMAGE) {
    problems.push(`${path}.default: an image has no default, since no image is on every site`);
    return;
  }
  if (given === undefined || !Object.hasOwn(defaultTexts, read.type)) return;
  if (read.type === 'string' && isObject(given) && Object.hasOwn(given, 'identity')) {
    if (!textControls.includes(read.control)) {
      problems.push(`${path}.default: only a text shown as text or a text area has the site's title as its default`);
    } else if (!isSiteTitle(given) || Object.keys(given).length !== 1) {
      problems.push(`${path}.default: the only part of the site's identity a default can be is its title, { "identity": "title" }`);
    } else {
      read.default = SITE_TITLE;
    }
    return;
  }
  if (read.type === 'string' && isObject(given)) {
    // A text's default in each of the core's languages (texts.js).
    if (!textControls.includes(read.control)) {
      problems.push(`${path}.default: only a text shown as text or a text area has a default in each language`);
    } else if (!isTextInEachLanguage(given)) {
      problems.push(`${path}.default: must give the text in English and Swedish, as { "en": …, "sv": … }`);
    } else {
      const each = TEXT_LANGUAGES.map((language) => defaultOf(given[language], read, `${path}.default.${language}`, problems));
      if (!each.includes(undefined)) read.default = Object.fromEntries(TEXT_LANGUAGES.map((language, i) => [language, each[i]]));
    }
    return;
  }
  const value = defaultOf(given, read, `${path}.default`, problems);
  if (value !== undefined) read.default = value;
}

// The defaults of a setting of a part per post type for the types with an
// address or a date, by that kind; the others take its `default`.
function defaultsFor(read, defaultFor, given, where, path, problems) {
  const at = `${path}.defaultFor`;
  if (where !== 'types') {
    problems.push(`${at}: only a setting of a part per post type has a default for some types`);
    return undefined;
  }
  if (!isObject(defaultFor)) {
    problems.push(`${at}: must be an object of a default by the types it is for, ${listed(kinds)}`);
    return undefined;
  }
  if (given === undefined) {
    problems.push(`${at}: a setting with a default for some types needs a default for the others`);
    return undefined;
  }
  const result = {};
  for (const [kind, value] of Object.entries(defaultFor)) {
    if (!Object.hasOwn(kinds, kind)) {
      problems.push(`${at}.${kind}: must be ${listed(kinds)}, the types the default is for`);
      continue;
    }
    const typed = defaultOf(value, read, `${at}.${kind}`, problems);
    if (typed !== undefined) result[kind] = typed;
  }
  return result;
}

// The controls a text with a default in each language may be shown with.
const textControls = ['text', 'textarea'];

// A default of a setting as read, which must be a value of its type that the
// site publishes as it is declared; undefined, with the problem, when it is
// not.
function defaultOf(given, read, path, problems) {
  const stored = defaultTexts[read.type](given);
  if (stored === undefined) {
    problems.push(`${path}: must be ${expected[read.type]}`);
    return undefined;
  }
  const published = ownValue(stored, read);
  if (published.reason) {
    problems.push(`${path}: ${published.reason}`);
    return undefined;
  }
  if (published.value === undefined) {
    problems.push(`${path}: must not be empty`);
    return undefined;
  }
  const value = published.value instanceof Date ? published.yaml : published.value;
  const least = leastProblem(value, read);
  if (least !== null) {
    problems.push(`${path}: ${least}`);
    return undefined;
  }
  if (value === given) return value;
  problems.push(`${path}: must be what the site publishes of it, ${JSON.stringify(value)}`);
  return undefined;
}

// Why a number is below the least value its setting takes (`min`), or null
// when it is not, or the setting takes any.
export function leastProblem(value, { type, min }) {
  if (min === undefined || typeof value !== 'number' || value >= min) return null;
  return `the site cannot publish ${value} here, which takes ${type === 'integer' ? 'a whole number' : 'a number'} from ${min}`;
}

// A default as text, read as a kept value is; undefined when it is not of its setting's
// type.
const defaultTexts = {
  string: (value) => (typeof value === 'string' ? value : undefined),
  number: (value) => (typeof value === 'number' ? String(value) : undefined),
  integer: (value) => (Number.isSafeInteger(value) ? String(value) : undefined),
  boolean: (value) => (typeof value === 'boolean' ? (value ? '1' : '') : undefined),
  date: (value) => (typeof value === 'string' ? value : undefined),
};

const expected = {
  string: 'a string',
  number: 'a number',
  integer: 'a whole number',
  boolean: 'true or false',
  date: 'a day, "YYYY-MM-DD"',
};

// The keys of an object, as words: `a`, `a or b`, `a, b or c`.
function listed(object) {
  const keys = Object.keys(object);
  return keys.length === 1 ? keys[0] : `${keys.slice(0, -1).join(', ')} or ${keys.at(-1)}`;
}

function onlyKeys(object, allowed, path, problems) {
  checkedKeys(object, allowed, path, problems, WHOLE);
}
