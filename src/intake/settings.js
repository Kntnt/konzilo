// The site settings' published file: every setting that applies, typed, each with its
// value or default, since the source holds only what differs from a default and the
// published side says what the site does. A site's own settings in the order declared,
// and each of the core's groups. Refused whole, naming each setting by its path, and
// the last file stays.

import { isObject } from '../checks.js';
import { ownValue } from '../format/frontmatter.js';
import { templateProblems, variablesOf } from '../metadata-templates.js';
import { groupsIn, isSiteTitle, leastProblem, TYPES } from '../settings-groups.js';
import { IMAGE, POST } from '../site-description.js';
import { say } from './words.js';

const NOT_FOUND = 'notFound';

// A setting's path as a master's name takes it, in lowercase words joined by hyphens:
// `hero-image` for `heroImage`, `search-image` for `search.image`.
const stemOf = (path) => path.replace(/[A-Z]/g, (capital) => `-${capital.toLowerCase()}`).replaceAll('.', '-');

// What a value of a text setting must also hold to.
function textProblem(setting, value, variables) {
  if (setting.format && !new RegExp(setting.format.pattern, 'u').test(value.trim())) return `${setting.name} ${setting.format.reason}`;
  if (setting.patterns) {
    for (const line of value.split(/\r\n|\r|\n/).map((one) => one.trim()).filter(Boolean)) {
      try {
        new RegExp(line, 'iu');
      } catch {
        return say('refusal.setting-pattern', { line });
      }
    }
  }
  if (setting.template) {
    const [problem] = templateProblems(value, variables);
    if (problem) return problem;
  }
  return null;
}

// One value of a plain type: { value } or { reason }; {} for none.
function plainValue(setting, stored, variables) {
  if (typeof stored === 'object' && stored !== null) return { reason: say('refusal.setting-shape') };
  const read = ownValue(stored === undefined || stored === null ? '' : String(stored), setting);
  if (read.reason) return { reason: read.reason };
  if (read.value === undefined) return {};
  const value = read.value instanceof Date ? read.yaml : read.value;
  const least = leastProblem(value, setting);
  if (least) return { reason: least };
  if (typeof value === 'string') {
    const problem = textProblem(setting, value, variables);
    if (problem) return { reason: problem };
  }
  return { value };
}

// The settings of `declared` from `stored`, into `into`. Each problem and warning names
// the setting's path, `search.types.post.title`.
function readSettings(declared, stored, path, into, context) {
  const given = isObject(stored) ? stored : {};
  for (const setting of declared) {
    if (setting.published === false) continue;
    const at = `${path}${setting.name}`;
    const raw = localised(given[setting.name], setting, context);
    const read = settingValue(setting, raw, at, context);
    if (read.reason) context.problems.push({ setting: at, reason: read.reason });
    else if (read.value !== undefined) into[setting.name] = read.value;
    if (read.warning) context.warnings.push({ setting: at, reason: read.warning });
  }
  for (const setting of declared) {
    if (setting.requires && into[setting.requires] === false && into[setting.name] === true) into[setting.name] = false;
  }
}

// A translated setting's value in the language at hand: a site in several keeps one
// value per locale.
function localised(value, setting, { language, several }) {
  return several && setting.translated && isObject(value) ? value[language.locale] : value;
}

function settingValue(setting, raw, at, context) {
  const empty = raw === undefined || raw === null || raw === '';
  if (setting.type === POST) {
    if (empty) return {};
    return context.choice(raw, at);
  }
  if (setting.type === IMAGE) {
    if (empty) return setting.required ? { reason: say('refusal.setting-required') } : {};
    return context.image(raw, stemOf(at));
  }
  // An empty yes-or-no is a no, which a default must not turn into a yes.
  const unset = raw === undefined || raw === null || (setting.type !== 'boolean' && typeof raw === 'string' && raw.trim() === '');
  if (unset) {
    if (setting.default !== undefined) {
      if (isSiteTitle(setting.default)) return context.title === undefined ? {} : { value: context.title };
      return { value: setting.default };
    }
    if (setting.required) return { reason: say('refusal.setting-required') };
    return setting.type === 'boolean' ? { value: false } : {};
  }
  return plainValue(setting, raw, context.variables);
}

// A site's identity: its title, logo and icon, each only when set.
function identity(source, into, context) {
  const { title, logo, icon } = source;
  const own = isObject(title) ? title[context.language?.locale] : title;
  if (own !== undefined && own !== null && own !== '') {
    if (typeof own !== 'string') context.problems.push({ setting: 'title', reason: say('refusal.setting-shape') });
    else into.title = own.trim();
  }
  if (logo) {
    const read = context.image(logo, 'logo');
    if (read.reason) context.problems.push({ setting: 'logo', reason: read.reason });
    else into.logo = read.value;
    if (read.warning) context.warnings.push({ setting: 'logo', reason: read.warning });
  }
  if (icon) {
    const read = context.image(icon, 'site-icon', { icon: true });
    if (read.reason) context.problems.push({ setting: 'icon', reason: read.reason });
    else into.icon = { src: read.value.src };
  }
}

// One language's settings: { values, problems, warnings }. `hands`: `choice(id, path)`
// and `image(value, stem, { icon })`, each { value, warning } or { reason }, and
// `title`, the main language's title, for a language without its own.
export function settingsFor(site, source, language, hands) {
  const main = language === null || language.main;
  const context = { ...hands, language, several: site.languages.length > 1, problems: [], warnings: [], variables: variablesOf(null) };
  const values = {};
  identity(source, values, context);
  context.title = values.title ?? hands.title;
  readSettings(site.settings, source, '', values, context);
  const applied = main ? site.groups : groupsIn(site.groups, language.locale, hands.title);
  for (const group of applied) {
    if (group.name === NOT_FOUND) continue;
    const stored = isObject(source[group.name]) ? source[group.name] : {};
    const into = {};
    const path = `${group.name}.`;
    readSettings(group.settings, stored, path, into, context);
    for (const part of group.parts) {
      into[part.name] = {};
      readSettings(part.settings, stored[part.name], `${path}${part.name}.`, into[part.name], context);
    }
    for (const item of group.each ?? []) {
      into[item.name] = {};
      readSettings(item.settings, stored[item.name], `${path}${item.name}.`, into[item.name], context);
    }
    if (group.types !== null) {
      into[TYPES] = {};
      for (const part of group.types) {
        into[TYPES][part.type] = {};
        const variables = variablesOf(site.types[part.type]);
        readSettings(part.settings, stored[TYPES]?.[part.type], `${path}${TYPES}.${part.type}.`, into[TYPES][part.type], { ...context, variables });
      }
    }
    values[group.name] = into;
  }
  return { values, problems: context.problems, warnings: context.warnings };
}

// The IDs a settings file chooses as legal pages, and as the page for addresses not
// found.
export function chosenIn(source) {
  const legal = source?.legalPages;
  const ids = isObject(legal) ? ['privacyPolicy', 'cookiePolicy', 'accessibilityStatement'].map((name) => legal[name]).filter((id) => typeof id === 'string' && id !== '') : [];
  const page = source?.[NOT_FOUND]?.page;
  return { legalPages: [...new Set(ids)].sort(), notFound: typeof page === 'string' && page !== '' ? page : null };
}
