// The site description: the one file in a site repository,
// `site-description.json` at its root, that declares the site's content
// model. Astro reads what it declares as typed content collections.
//
// siteDescription() checks a description as declared and returns it in the
// form the readers use. Every problem is named at once, by its path in the
// file; a description with any problem is refused whole.

import { readFileSync } from 'node:fs';
import { freeze, isObject, onlyKeys as checkedKeys, text } from './checks.js';
import { MEDIA_FOLDER } from './format/masters.js';
import rules from './format/rules.json' with { type: 'json' };
import { coreSettingsGroups, groupsFor, settingsGroups } from './settings-groups.js';

// Where a site keeps its description, relative to the site repository's root.
export const SITE_DESCRIPTION_FILE = 'site-description.json';

// The reserved paths: everything below this prefix, on the site's own host
// and its pre-launch address, belongs to the site's services, its public
// endpoint and its search. No type's address and no page
// of a build may lie there.
export const RESERVED_PREFIX = '/_konzilo/';

// A locale's shape: a language subtag
// of two or three lowercase letters, then a region of two capitals, then a
// variant, such as `fi`, `sv_SE` or `de_DE_formal`.
export const LOCALE = /^[a-z]{2,3}(?:_[A-Z]{2}(?:_[A-Za-z0-9]+)?)?$/;

// The language tag of a locale, as HTML takes it (BCP 47): the locale's first
// two parts joined by a hyphen, `sv-SE` for
// `sv_SE` and `de-DE` for `de_DE_formal`. A site that declares no language,
// whose locale is null, says `en`.
export function languageTag(locale) {
  return locale === null ? 'en' : locale.split('_').slice(0, 2).join('-');
}

// The fields the core gives meaning to, by the name the content file gives
// them, each with the keys it takes. The title is always written, so it is not
// declared. The content format document names each (content-format.md).
export const CORE_FIELDS = Object.freeze({
  date: Object.freeze([]),
  modified: Object.freeze([]),
  excerpt: Object.freeze(['required']),
  image: Object.freeze(['required']),
});

// The value types of the site's own fields and settings, and the editor
// controls each may be shown with. A post and an image are a site setting's
// alone: the choice of one published post of a type with an address, written
// as the post's title and current address, and the choice of an image, written
// as its master's address with its alt text. The content format document names
// each type (content-format.md).
export const SETTING_TYPES = Object.freeze({
  string: Object.freeze(['text', 'textarea', 'select']),
  number: Object.freeze(['number']),
  integer: Object.freeze(['number']),
  boolean: Object.freeze(['toggle']),
  date: Object.freeze(['date']),
  post: Object.freeze(['post']),
  image: Object.freeze(['image']),
});

// The type of a setting that chooses a post.
export const POST = 'post';

// The type of a setting that chooses an image.
export const IMAGE = 'image';

// The value types of a post's fields of the site's own, which never choose a
// post or an image.
export const FIELD_TYPES = Object.freeze(Object.fromEntries(Object.entries(SETTING_TYPES).filter(([type]) => type !== POST && type !== IMAGE)));

// The frontmatter key that holds a post's old addresses, the addresses it had
// before its slug changed, in every type with an address. Every
// such post has them, so no field is declared by this name.
export const OLD_ADDRESSES = 'oldAddresses';

// The frontmatter key that holds a post's other addresses, the rules that
// lead to it, in every type with an address.
export const OTHER_ADDRESSES = 'otherAddresses';

// The frontmatter key that names a post's translation set, on a site in
// several languages, when the post has a translation.
export const TRANSLATION_KEY = 'translationKey';

// Konzilo's own field group, the search and sharing fields: `"seo": {}` among
// a type's fields, which takes no keys. These are the frontmatter's `seo` map's
// keys, in the map's order.
export const SEO_FIELD = 'seo';
export const SEO_KEYS = Object.freeze(['title', 'breadcrumb', 'description', 'socialTitle', 'socialDescription', 'socialImage', 'socialImageAlt', 'schema', 'noindex', 'nofollow']);

// The site's identity: its title, logo and site icon, which settings.json holds
// before the site's own settings, under these names. No setting of the site's own, and no settings
// group of Konzilo's, takes one of them.
export const IDENTITY = Object.freeze(['title', 'logo', 'icon']);

// The elements a type's posts may hold in their bodies, by the rule data's names.
function elementsOf(elements, path, problems) {
  if (!Array.isArray(elements) || !elements.every((element) => typeof element === 'string')) {
    problems.push(`${path}: must list the elements the type takes, by name`);
    return [];
  }
  for (const element of elements) {
    if (!Object.hasOwn(rules.elements, element)) problems.push(`${path}: the core cannot publish the element ${JSON.stringify(element)}`);
  }
  if (new Set(elements).size !== elements.length) problems.push(`${path}: names an element twice`);
  return [...elements];
}

// The structured data types a post may be given in place of its type's
// template, schema.org's names, which the rule data lists.
export const SCHEMA_TYPES = Object.freeze([...rules.structuredDataTypes]);

// The descriptions checked, by the settings groups they were checked with,
// and what siteDescription() returned.
const checked = new WeakMap();
const results = new WeakSet();

// A description as declared (the parsed JSON) to the form the readers use:
//
//   { language: <locale> or null,
//     languages: [ { locale, tag, prefix, main } ],
//     types: { <post type>: { name, label, plural, collection, address, feed, hierarchical, search, elements, fields } },
//     taxonomies: { <taxonomy>: { name, label, plural, collection, hierarchical, address, feed } },
//     images: { smallestWidth, displayWidth } or null,
//     menus: { <menu>: { name, label } },
//     settings: [ { name, label, type, control, options, required, translated } ],
//     consent: { departures: [ { departure, service, reason } ] },
//     security: { includeSubDomains, frameAncestors: [ <origin> ] },
//     forms: { <form>: { name, label, fields: [ { name, label, kind, required, maxLength, options, help } ] } },
//     search: { address } or null,
//     groups: [ { name, label, description, settings, types, each } ] }
//
// The language is the one the site's content is written in, a locale,
// or null for a site that declares none; on a site with several languages, its
// main language. The languages are the site's, in the order declared, the main
// language first: each by its locale (`sv_SE`), its
// language tag (`sv-SE`, languageTag()), its prefix, the first segment of its
// pages' addresses, and whether it is the main language. A prefix is the
// language subtag (`sv`), or the whole tag in lowercase
// (`en-gb`) where another of the site's locales starts with the same subtag,
// as two variants of one language do. A site with one language gives it with
// no prefix (null), and a site that declares none gives none. A type's address is
// where visitors reach each of its posts, a path from the site's root with
// `{slug}` as its last segment, or `{path}` in a hierarchical type, whose
// posts have parents (format/addresses.js); null for a type whose posts have
// no page of their own. On a site with several languages it may be an object
// of an address by locale, one for each language, as declared. A type's
// `search` says whether its posts are in the site's search: every
// type with an address is, on a site with search, unless it declares
// `"search": false`. A type's `feed` is the address of its RSS feed, and a
// taxonomy's that of each term's, with `{slug}` for the term's slug, or null
// for none. A taxonomy's `address` is where visitors reach each of
// its terms' pages, as a type's is, with `{slug}`, or `{path}` in a
// hierarchical taxonomy, the slugs of the term's parents and its own; null for
// a taxonomy whose terms have no page, which no taxonomy has unless it
// declares one. Each field is { name, kind, required } and what its
// kind needs: `date`, `modified`, `excerpt` and `image`, the core's own; `seo`
// ({ keys }, SEO_KEYS), Konzilo's own; `terms` ({ taxonomy }) or `meta`
// ({ label, type, control, options }). `images`
// gives the widths uploads are checked against: an image narrower than the
// smallest is refused, one narrower than the display width the site usually
// shows images at is warned about. A menu is a place in the site's design,
// named as the design names it, and on a site with several
// languages a place per language. The site settings take the form of a type's
// fields of the site's own, in the order declared, and a text may be
// `translated`, true only when declared, with a value per language. `consent` holds the site's departures from
// the consent rules, each one of DEPARTURES with its reason, a
// necessaryService's naming its service, in the order declared; none for a
// site that declares none. `security` holds the site's opt-ins to its security
// headers: HSTS for every subdomain of its host too, and the
// origins, each `https://` and a host, that may frame its pages beside its
// own; none for a site that declares none. `forms` are the forms the site
// declares, each by the last segment of its address on the endpoint,
// /_konzilo/forms/<form>, with its label and its fields in order: each field
// of one of FIELD_KINDS, with whether it is required, a text's `maxLength` in
// characters, a choice's `options` and a `help` text or null. `search` is the
// site's search, the public address of its search page, or null for
// a site without search, which has no search page, box or index. `groups` are
// Konzilo's own settings groups as settingsGroups() reads them, by default the
// core's (settings-groups.js): no setting of the site's own takes the name of
// any of them, and the result's `groups` are those that apply to the site, as
// groupsFor() gives them. Throws an Error naming every problem. What it
// returns it takes back as it is.
export function siteDescription(declared, groups = coreSettingsGroups()) {
  if (results.has(declared)) return declared;
  const read = settingsGroups(groups);
  if (!checked.has(read)) checked.set(read, new WeakMap());
  const known = checked.get(read);
  if (declared !== null && typeof declared === 'object' && known.has(declared)) return known.get(declared);
  const problems = [];
  const result = description(declared, read, problems);
  if (problems.length > 0) {
    throw new Error(`the site description is not valid:\n${problems.map((problem) => `  ${problem}`).join('\n')}`);
  }
  known.set(declared, result);
  results.add(result);
  return result;
}

// What a post list of the site may name, as format/post-list.js checks a list
// against it:
//
//   { types: { <type>: { plural, taxonomies: [ { name, label } ],
//                        fields: { <field>: { type, options } } } },
//     presentations: { <presentation>: { options: [ { name, type, options, required } ] } } }
//
// A type's taxonomies are those its fields hold the terms of, in order; its
// fields are those a list filters on and orders by, `date` and `modified`, of
// the type `date`, and the site's own: `text`, `choice` (a
// select, with its options), `boolean`, `number`, `integer` or `date`. A
// presentation's options are of the type `string`, `integer` or `boolean`,
// a select's with its options.
export function postListModel({ types, presentations }) {
  const fieldOf = (field) => {
    if (field.kind === 'date' || field.kind === 'modified') return { type: 'date' };
    if (field.control === 'select') return { type: 'choice', options: field.options ?? [] };
    return { type: field.type === 'string' ? 'text' : field.type };
  };
  return {
    types: Object.fromEntries(Object.values(types).filter(Boolean).map((type) => [type.name, {
      plural: type.plural,
      taxonomies: type.fields.filter((field) => field.kind === 'terms' && field.taxonomy).map(({ taxonomy }) => ({ name: taxonomy.name, label: taxonomy.label })),
      fields: Object.fromEntries(type.fields.filter((field) => ['date', 'modified', 'meta'].includes(field.kind)).map((field) => [field.name, fieldOf(field)])),
    }])),
    presentations: Object.fromEntries(Object.values(presentations ?? {}).filter(Boolean).map((presentation) => [presentation.name, {
      options: presentation.options.map(({ name, type, options, required }) => ({ name, type, ...(options ? { options } : {}), required })),
    }])),
  };
}

// What the site declares that a directive's attribute may name (`declared`
// in the rule data), as format/post-list.js checks such an attribute against
// it: the names of what it declares, by the key they are declared under, `forms` the names
// of its forms.
export function declaredNames({ forms }) {
  return { forms: Object.keys(forms ?? {}) };
}

// The site description in a file, checked with `groups` as siteDescription()
// checks it.
export function readSiteDescription(file, groups) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    throw new Error(`the site description cannot be read: ${error.message}`);
  }
  let declared;
  try {
    declared = JSON.parse(text);
  } catch (error) {
    throw new Error(`the site description ${file} is not JSON: ${error.message}`);
  }
  return siteDescription(declared, groups);
}

function description(declared, groups, problems) {
  if (!isObject(declared)) {
    problems.push('the site description must be a JSON object');
    return null;
  }
  onlyKeys(declared, ['language', 'languages', 'images', 'types', 'taxonomies', 'presentations', 'menus', 'settings', 'consent', 'security', 'forms', 'search'], '', problems);
  const languages = languagesOf(declared, problems);
  const language = languages.length > 0 ? languages[0].locale : null;
  const collections = new Map();
  const addresses = { languages, taken: new Map(), told: new Set(), searched: declared.search !== undefined };
  const taxonomies = {};
  for (const [name, taxonomy] of entries(declared.taxonomies, 'taxonomies', problems, false)) {
    taxonomies[name] = taxonomyOf(name, taxonomy, `taxonomies.${name}`, { collections, addresses }, problems);
  }
  const types = {};
  for (const [name, type] of entries(declared.types, 'types', problems, true)) {
    types[name] = typeOf(name, type, `types.${name}`, { collections, taxonomies, addresses }, problems);
  }
  feedsOf(types, taxonomies, problems);
  const presentations = {};
  const optionTypes = new Map();
  for (const [name, presentation] of entries(declared.presentations, 'presentations', problems, false)) {
    presentations[name] = presentationOf(name, presentation, `presentations.${name}`, optionTypes, problems);
  }
  const search = searchOf(declared.search, { types, taxonomies, languages }, problems);
  const images = imagesOf(declared.images, types, problems);
  const menus = {};
  for (const [name, menu] of entries(declared.menus, 'menus', problems, false)) {
    menus[name] = menuOf(name, menu, `menus.${name}`, problems);
  }
  const settings = [];
  for (const [name, setting] of entries(declared.settings, 'settings', problems, false)) {
    const read = settingOf(name, setting, `settings.${name}`, groups, problems);
    if (read) settings.push(read);
  }
  const consent = consentOf(declared.consent, problems);
  const security = securityOf(declared.security, problems);
  const forms = {};
  for (const [name, form] of entries(declared.forms, 'forms', problems, false)) {
    forms[name] = formOf(name, form, `forms.${name}`, problems);
  }
  return freeze({ language, languages, types, taxonomies, presentations, images, menus, settings, consent, security, forms, search, groups: groupsFor(declared, types, groups, language, forms) });
}

// An origin that may frame the site's pages: `https://` and a host, in
// lowercase, with no port, path or wildcard.
const FRAMING_ORIGIN = /^https:\/\/[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;

// What the site opts in to of its security headers: HSTS that
// holds for every subdomain of its host too, which would force HTTPS on the
// customer's every other subdomain, and the origins that may frame its
// pages beside its own. Nothing else of the headers is the site's.
function securityOf(security, problems) {
  const none = { includeSubDomains: false, frameAncestors: [] };
  if (security === undefined) return none;
  if (!isObject(security)) {
    problems.push('security: must be an object');
    return none;
  }
  onlyKeys(security, ['includeSubDomains', 'frameAncestors'], 'security', problems);
  const includeSubDomains = flag(security.includeSubDomains, 'security.includeSubDomains', problems);
  const declared = security.frameAncestors ?? [];
  if (!Array.isArray(declared)) {
    problems.push('security.frameAncestors: must list the origins that may frame the site');
    return { includeSubDomains, frameAncestors: [] };
  }
  const frameAncestors = [];
  declared.forEach((origin, index) => {
    const path = `security.frameAncestors.${index + 1}`;
    if (typeof origin !== 'string' || !FRAMING_ORIGIN.test(origin)) {
      problems.push(`${path}: ${JSON.stringify(origin)} is no origin that may frame the site; give https:// and the host in lowercase, with no port, path or wildcard, such as https://www.example.com`);
    } else if (frameAncestors.includes(origin)) {
      problems.push(`${path}: lists ${origin} again`);
    } else {
      frameAncestors.push(origin);
    }
  });
  return { includeSubDomains, frameAncestors };
}

// The kinds of a form's field, each with the rules it takes beside its
// name, label and kind, in the order they are checked. A field of a text
// kind takes at most `most` characters, `maxLength` when none is declared.
// An acceptance is a box that must be ticked, such as reading the privacy
// policy, so it is always required; a checkbox is a yes or a no, never
// required.
export const FIELD_KINDS = Object.freeze({
  text: { rules: ['required', 'maxLength', 'help'], maxLength: 200, most: 1000 },
  email: { rules: ['required', 'maxLength', 'help'], maxLength: 254, most: 254 },
  tel: { rules: ['required', 'maxLength', 'help'], maxLength: 50, most: 50 },
  textarea: { rules: ['required', 'maxLength', 'help'], maxLength: 5000, most: 10000 },
  select: { rules: ['required', 'options', 'help'] },
  radio: { rules: ['required', 'options', 'help'] },
  checkbox: { rules: ['help'] },
  checkboxes: { rules: ['required', 'options', 'help'] },
  acceptance: { rules: ['help'], required: true },
});

// The most characters a form's text fields take together, so that a
// submission's body stays within what the endpoint takes.
export const FORM_CHARACTERS = 20000;

// A form's name is the last segment of its address on the endpoint,
// /_konzilo/forms/<form>, and its key in the forms' settings group.
const FORM_NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

// A field's name is its name in the form's HTML and in a submission. The
// endpoint's own fields, such as the page a submission came from, start with
// an underscore, which no declared field may.
const FORM_FIELD_NAME = /^[a-z][a-z0-9_]*$/;

// A form: its label, which names it to editors, in a notification's subject
// and on the Site settings page, and its fields in order.
function formOf(name, form, path, problems) {
  if (!FORM_NAME.test(name)) {
    problems.push(`${path}: a form's name must be lowercase letters and digits, with single hyphens inside, starting with a letter`);
  }
  if (!isObject(form)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  onlyKeys(form, ['label', 'fields'], path, problems);
  const result = { name, label: text(form.label, `${path}.label`, problems), fields: [] };
  if (!Array.isArray(form.fields) || form.fields.length === 0 || !form.fields.every(isObject)) {
    problems.push(`${path}.fields: must list the form's fields, at least one, each an object`);
    return result;
  }
  const names = new Map();
  form.fields.forEach((field, index) => {
    const read = formFieldOf(field, `${path}.fields.${index + 1}`, names, problems);
    if (read) result.fields.push(read);
  });
  const characters = result.fields.reduce((sum, field) => sum + (field.maxLength ?? 0), 0);
  if (characters > FORM_CHARACTERS) {
    problems.push(`${path}.fields: take ${characters} characters together, and a form takes at most ${FORM_CHARACTERS}`);
  }
  return result;
}

function formFieldOf(field, path, names, problems) {
  onlyKeys(field, ['name', 'label', 'kind', 'required', 'maxLength', 'options', 'help'], path, problems);
  const { name, kind } = field;
  if (typeof name !== 'string' || !FORM_FIELD_NAME.test(name)) {
    problems.push(`${path}.name: a field's name must be lowercase letters, digits and underscores, starting with a letter`);
  } else if (names.has(name)) {
    problems.push(`${path}.name: ${name} is also the name of ${names.get(name)}`);
  } else {
    names.set(name, path);
  }
  const label = text(field.label, `${path}.label`, problems);
  if (typeof kind !== 'string' || !Object.hasOwn(FIELD_KINDS, kind)) {
    const known = Object.keys(FIELD_KINDS);
    problems.push(`${path}.kind: ${JSON.stringify(kind)} is not one of ${known.slice(0, -1).join(', ')} and ${known.at(-1)}`);
    return null;
  }
  const rules = FIELD_KINDS[kind];
  const article = /^[aeiou]/.test(kind) ? 'an' : 'a';
  for (const rule of ['required', 'maxLength', 'options', 'help']) {
    if (field[rule] !== undefined && !rules.rules.includes(rule)) {
      const always = rules.required ? ', which must always be ticked' : '';
      const taken = rules.rules.length === 1 ? rules.rules[0] : `${rules.rules.slice(0, -1).join(', ')} and ${rules.rules.at(-1)}`;
      problems.push(`${path}.${rule}: is not a rule ${article} ${kind} field takes${always}; it takes ${taken}`);
    }
  }
  const read = { name, label, kind, required: rules.required ?? (rules.rules.includes('required') ? flag(field.required, `${path}.required`, problems) : false) };
  if (rules.rules.includes('maxLength')) {
    const given = field.maxLength ?? rules.maxLength;
    if (!Number.isSafeInteger(given) || given < 1 || given > rules.most) {
      problems.push(`${path}.maxLength: must be a whole number from 1 to ${rules.most}, the most ${article} ${kind} field takes`);
    }
    read.maxLength = given;
  }
  if (rules.rules.includes('options')) {
    const { options } = field;
    if (!Array.isArray(options) || options.length === 0 || !options.every((option) => typeof option === 'string' && option.trim() !== '')
      || new Set(options).size !== options.length) {
      problems.push(`${path}.options: must list the choices, each a different, non-empty string`);
      read.options = [];
    } else {
      read.options = [...options];
    }
  }
  read.help = field.help === undefined ? null : text(field.help, `${path}.help`, problems);
  return read;
}

// The departures a site may make from the consent rules, each by
// its name, and whether it names a service. The list is closed: nothing
// else of the rules can be departed from.
export const DEPARTURES = Object.freeze({
  // The tag manager loads before the visitor's choice, its tags reading the
  // consent signal.
  tagManagerBeforeConsent: { service: false },
  // A named service counts as necessary, which is always on.
  necessaryService: { service: true },
});

// What the site declares of consent: its departures from the consent rules,
// each with its reason, which the site repository keeps as the record of a
// deliberate departure.
function consentOf(consent, problems) {
  if (consent === undefined) return { departures: [] };
  if (!isObject(consent)) {
    problems.push('consent: must be an object');
    return { departures: [] };
  }
  onlyKeys(consent, ['departures'], 'consent', problems);
  if (consent.departures === undefined) return { departures: [] };
  if (!Array.isArray(consent.departures) || !consent.departures.every(isObject)) {
    problems.push('consent.departures: must list the departures, each an object');
    return { departures: [] };
  }
  const departures = [];
  const seen = new Map();
  consent.departures.forEach((declared, index) => {
    const path = `consent.departures.${index + 1}`;
    const read = departureOf(declared, path, problems);
    if (!read) return;
    const key = `${read.departure}\n${read.service ?? ''}`;
    if (seen.has(key)) problems.push(`${path}: departs as ${seen.get(key)} does`);
    else seen.set(key, path);
    departures.push(read);
  });
  return { departures };
}

function departureOf(declared, path, problems) {
  onlyKeys(declared, ['departure', 'service', 'reason'], path, problems);
  const { departure, service, reason } = declared;
  const kind = typeof departure === 'string' && Object.hasOwn(DEPARTURES, departure) ? DEPARTURES[departure] : null;
  if (!kind) {
    const allowed = Object.keys(DEPARTURES);
    problems.push(`${path}.departure: ${JSON.stringify(departure)} is not a departure the core allows; it allows ${allowed.slice(0, -1).join(', ')} and ${allowed.at(-1)}`);
  }
  if (typeof reason !== 'string' || reason.trim() === '') problems.push(`${path}.reason: must say why the site departs from the consent rules`);
  if (kind?.service && (typeof service !== 'string' || !SERVICE_ID.test(service))) {
    problems.push(`${path}.service: must name the service that counts as necessary, by its id`);
  } else if (kind && !kind.service && service !== undefined) {
    problems.push(`${path}.service: names no service in this departure`);
  }
  if (!kind) return null;
  return kind.service ? { departure, service, reason } : { departure, reason };
}

// A service's id in the service registry, as the rule data names an embed's
// service.
export const SERVICE_ID = /^[a-z][a-z0-9-]*$/;

// The site's languages, as the read form gives them: its one language
//, none for a description that declares none, or its several
//.
function languagesOf({ language, languages }, problems) {
  if (languages !== undefined) {
    if (language !== undefined) problems.push('languages: a site declares its one language in language or its several in languages, not both');
    return severalLanguages(languages, problems);
  }
  if (language === undefined) return [];
  if (typeof language === 'string' && LOCALE.test(language)) return [{ locale: language, tag: languageTag(language), prefix: null, main: true }];
  problems.push(`language: ${JSON.stringify(language)} is not one of ${LANGUAGES.slice(0, -1).join(', ')} and ${LANGUAGES.at(-1)}`);
  return [];
}

// Several languages, locales in order, the main language first.
function severalLanguages(languages, problems) {
  const locales = Array.isArray(languages) ? languages : [];
  const seen = new Map();
  const tags = new Map();
  const read = [];
  locales.forEach((locale, index) => {
    const path = `languages.${index + 1}`;
    if (typeof locale !== 'string' || !LOCALE.test(locale)) {
      problems.push(`${path}: ${JSON.stringify(locale)} is not a locale, such as "sv_SE" or "en_GB"`);
      return;
    }
    if (seen.has(locale)) {
      problems.push(`${path}: ${locale} is also ${seen.get(locale)}`);
      return;
    }
    seen.set(locale, path);
    const tag = languageTag(locale);
    if (tags.has(tag)) {
      problems.push(`${path}: ${locale} gives the language tag ${tag}, as ${tags.get(tag)} does`);
      return;
    }
    tags.set(tag, path);
    read.push({ locale, tag });
  });
  if (locales.length < 2) {
    problems.push('languages: must list at least two languages, locales such as "sv_SE", the main language first; a site with one declares it in language');
  }
  return read.map(({ locale, tag }, index) => ({ locale, tag, prefix: prefixOf(tag, read), main: index === 0 }));
}

// A language's prefix:
// the language subtag, unless another of the site's locales starts with it.
function prefixOf(tag, languages) {
  const subtag = tag.split('-')[0];
  const variants = languages.filter(({ locale }) => locale.startsWith(subtag));
  return (variants.length > 1 ? tag : subtag).toLowerCase();
}

// The widths uploads are checked against, which a site with a featured
// image, images in body text or a sharing image must give.
function imagesOf(images, types, problems) {
  const having = (has) => Object.entries(types).find(([, type]) => type && has(type))?.[0];
  const featured = having((type) => type.fields.some((field) => field.kind === 'image'));
  const inBody = having((type) => type.elements.includes('image'));
  const sharing = having((type) => type.fields.some((field) => field.kind === 'seo'));
  if (images === undefined) {
    const widths = 'images: must give the smallest width and the display width, since';
    if (featured) problems.push(`${widths} types.${featured}.fields.image is a featured image`);
    else if (inBody) problems.push(`${widths} types.${inBody}.elements holds image, images in body text`);
    else if (sharing) problems.push(`${widths} types.${sharing}.fields.seo holds a sharing image`);
    return null;
  }
  if (!isObject(images)) {
    problems.push('images: must be an object');
    return null;
  }
  onlyKeys(images, ['smallestWidth', 'displayWidth'], 'images', problems);
  const width = (key) => {
    const value = images[key];
    if (Number.isSafeInteger(value) && value >= 1) return value;
    problems.push(`images.${key}: must be a whole number of pixels, at least 1`);
    return null;
  };
  const [smallestWidth, displayWidth] = [width('smallestWidth'), width('displayWidth')];
  if (smallestWidth !== null && displayWidth !== null && displayWidth < smallestWidth) {
    problems.push(`images.displayWidth: must be at least the smallest width, ${smallestWidth}`);
  }
  return { smallestWidth, displayWidth };
}

// The content collections of the site's own content files, beside those of
// its types and taxonomies, by what the collection holds.
const siteCollections = {
  menus: 'the site\'s menus',
  settings: 'the site settings',
  consent: 'the service registry',
};

// A menu: its name is the file of its entries and its entry in the
// collection `menus`, and its label is the place's name.
function menuOf(name, menu, path, problems) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    problems.push(`${path}: a menu's name must be lowercase letters, digits and hyphens, starting with a letter`);
  }
  if (!isObject(menu)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  onlyKeys(menu, ['label'], path, problems);
  return { name, label: text(menu.label, `${path}.label`, problems) };
}

// The attributes of every post list, which no option of a
// presentation may take, since a list writes the options of its
// presentation as attributes of its own beside them: those of each block
// the rule data writes as a directive that takes the options of the
// presentation an attribute names (`optionsOf`).
const LIST_ATTRIBUTES = new Set(Object.values(rules.elements)
  .filter((rule) => rule.directive?.optionsOf)
  .flatMap((rule) => Object.keys(rule.directive.attributes ?? {})));

// What a directive's attribute is never called.
const RESERVED_ATTRIBUTES = ['id', 'class', 'content'];

// The value types of a presentation's options, those a directive's
// attribute takes, and the controls each may be shown with.
const optionControls = { string: SETTING_TYPES.string, integer: SETTING_TYPES.integer, boolean: SETTING_TYPES.boolean };

// A presentation: a way the site's design shows a post list, its
// label the name it is offered by, and its options in the form of a
// setting, which a list writes as attributes of its own. An option that two
// presentations both have is one attribute, of one type, which
// `optionTypes` keeps by name.
function presentationOf(name, presentation, path, optionTypes, problems) {
  if (!/^[a-z][a-z0-9-]*$/.test(name)) {
    problems.push(`${path}: a presentation's name must be lowercase letters, digits and hyphens, starting with a letter`);
  }
  if (!isObject(presentation)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  onlyKeys(presentation, ['label', 'options'], path, problems);
  const result = { name, label: text(presentation.label, `${path}.label`, problems), options: [] };
  for (const [option, declared] of entries(presentation.options, `${path}.options`, problems, false)) {
    const where = `${path}.options.${option}`;
    if (!/^[a-z][a-zA-Z0-9]*$/.test(option)) {
      problems.push(`${where}: an option's name must be letters and digits, starting with a lowercase letter`);
      continue;
    }
    if (RESERVED_ATTRIBUTES.includes(option)) {
      problems.push(`${where}: no attribute of a directive is called id, class or content; give the option another name`);
      continue;
    }
    if (LIST_ATTRIBUTES.has(option)) {
      problems.push(`${where}: is an attribute of every post list; give the option another name`);
      continue;
    }
    if (!isObject(declared)) {
      problems.push(`${where}: must be an object`);
      continue;
    }
    const read = ownField(option, declared, where, problems, undefined, optionControls);
    const other = optionTypes.get(option);
    if (other && Object.hasOwn(optionControls, read.type) && other.type !== read.type) {
      problems.push(`${where}: is an option of ${other.presentation} too, of the type ${other.type}; give it the same type or another name`);
    } else if (!other && Object.hasOwn(optionControls, read.type)) {
      optionTypes.set(option, { presentation: name, type: read.type });
    }
    result.options.push(read);
  }
  return result;
}

// A site setting: a value of the site's own, in the form of a type's field,
// and `translated: true` for a text with a value in each of the site's
// languages (translatedOf()). Konzilo's own groups are kept and written
// under their names.
function settingOf(name, setting, path, groups, problems) {
  if (!fieldName(name, path, problems)) return null;
  if (IDENTITY.includes(name)) {
    problems.push(`${path}: ${name} is where the site settings hold the site's ${name}; give the setting another name`);
    return null;
  }
  const group = groups.find((found) => found.name === name);
  if (group) {
    problems.push(`${path}: ${name} is the name of Konzilo's own settings group ${JSON.stringify(group.label)}; give the setting another name`);
    return null;
  }
  if (!isObject(setting)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  const { translated, ...declared } = setting;
  const read = ownField(name, declared, path, problems);
  if (translatedOf(translated, read, path, problems)) read.translated = true;
  return read;
}

// Whether a setting, as read, is translated: it has a value in
// each of the site's languages, kept per language and written into each
// language's settings file, where every other setting has one value for
// every language. Only a text shown as text or a text area is, as a
// visitor reads it; `translated` is true, false or left out. A site in one
// language has the one value. Settings groups of Konzilo's own declare it
// the same way (settings-groups.js).
export function translatedOf(translated, read, path, problems) {
  if (translated === undefined || translated === false) return false;
  if (translated !== true) {
    problems.push(`${path}.translated: must be true or false`);
    return false;
  }
  if (read.type !== 'string' || !['text', 'textarea'].includes(read.control)) {
    problems.push(`${path}.translated: only a text shown as text or a text area is translated`);
    return false;
  }
  return true;
}

function typeOf(name, type, path, site, problems) {
  if (!/^[a-z][a-z0-9_-]{0,19}$/.test(name)) {
    problems.push(`${path}: a post type's name must be lowercase letters, digits, hyphens and underscores, starting with a letter, at most 20`);
  }
  if (!isObject(type)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  onlyKeys(type, ['label', 'plural', 'collection', 'address', 'feed', 'hierarchical', 'search', 'elements', 'fields'], path, problems);
  const hierarchical = flag(type.hierarchical, `${path}.hierarchical`, problems);
  const address = addressOf(name, type.address, hierarchical, `${path}.address`, site.addresses, problems);
  const result = {
    name,
    label: text(type.label, `${path}.label`, problems),
    plural: text(type.plural, `${path}.plural`, problems),
    collection: collectionOf(type.collection, `${path}.collection`, site.collections, problems),
    address,
    feed: feedAddressOf(type.feed, `${path}.feed`, false, problems),
    hierarchical,
    search: takesPart(type.search, address, site.addresses.searched, `${path}.search`, problems),
    elements: elementsOf(type.elements, `${path}.elements`, problems),
    fields: [],
  };
  const taken = new Set();
  for (const [field, declared] of entries(type.fields, `${path}.fields`, problems, false)) {
    const read = fieldOf(field, declared, `${path}.fields.${field}`, site.taxonomies, problems);
    if (!read) continue;
    if (read.kind === 'terms' && read.taxonomy) {
      if (taken.has(read.taxonomy.name)) problems.push(`${path}.fields.${field}: a second field for the taxonomy ${read.taxonomy.name}`);
      taken.add(read.taxonomy.name);
    }
    result.fields.push(read);
  }
  if (result.feed !== null) {
    if (result.address === null) problems.push(`${path}.feed: a feed links each post to its page, and ${name} has no address`);
    if (!hasDate(result)) problems.push(`${path}.feed: a feed lists posts by their date, and ${name} has none; declare "date": {} among its fields`);
  }
  return result;
}

function taxonomyOf(name, taxonomy, path, { collections, addresses }, problems) {
  if (!/^[a-z][a-z0-9_]{0,31}$/.test(name)) {
    problems.push(`${path}: a taxonomy's name must be lowercase letters, digits and underscores, starting with a letter, at most 32`);
  }
  if (!isObject(taxonomy)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  onlyKeys(taxonomy, ['label', 'plural', 'collection', 'hierarchical', 'address', 'feed'], path, problems);
  const hierarchical = flag(taxonomy.hierarchical, `${path}.hierarchical`, problems);
  return {
    name,
    label: text(taxonomy.label, `${path}.label`, problems),
    plural: text(taxonomy.plural, `${path}.plural`, problems),
    collection: collectionOf(taxonomy.collection, `${path}.collection`, collections, problems),
    hierarchical,
    address: termAddressOf(name, taxonomy.address, hierarchical, `${path}.address`, addresses, problems),
    feed: feedAddressOf(taxonomy.feed, `${path}.feed`, true, problems),
  };
}

// The address of each term's page of a taxonomy, or null for a taxonomy
// whose terms have none, which is every taxonomy that declares none: one path from the site's root, ending in `{slug}`, the term's slug,
// or in a hierarchical taxonomy `{slug}` or `{path}`, the slugs of its
// parents and its own, held to a type's rules. No type or other taxonomy has it in any of
// the site's languages, and a site in several languages gives its terms'
// pages one address, in its main language.
function termAddressOf(name, address, hierarchical, path, addresses, problems) {
  if (address === undefined) return null;
  if (!onePath(address, { name, hierarchical, kind: 'taxonomy' }, path, problems)) return null;
  const { languages } = addresses;
  for (const { locale } of languages.length > 0 ? languages : [{ locale: null }]) claim(address, locale, path.replace(/\.address$/, ''), path, addresses, problems);
  return address;
}

// Whether a type (as read) declares a date among its fields.
function hasDate(type) {
  return type.fields.some((field) => field.kind === 'date');
}

// The address of a type's feed, or of the feed of each term of a taxonomy
// (`term`), as declared: a path from the site's root, ending in
// `/`, whose segments are lowercase letters, digits, hyphens and
// underscores, and in a taxonomy's one of them `{slug}`, the term's slug,
// never the last, which is the form of a post's or a term's own page. Null
// for none, and for one with a problem.
function feedAddressOf(feed, path, term, problems) {
  if (feed === undefined) return null;
  const example = term ? '"/category/{slug}/feed/"' : '"/feed/"';
  if (typeof feed !== 'string' || !/^(\/([a-z0-9_][a-z0-9_-]*|\{slug\}))+\/$/.test(feed)) {
    problems.push(`${path}: must be a path from the site's root that ends in /, such as ${example}, in lowercase letters, digits, hyphens and underscores${term ? ', with {slug} for the term\'s slug' : ''}`);
    return null;
  }
  const segments = feed.slice(1, -1).split('/');
  const slugs = segments.filter((segment) => segment === '{slug}').length;
  if (!term && slugs > 0) {
    problems.push(`${path}: a type has one feed, so its address holds no {slug}, such as ${example}`);
    return null;
  }
  if (term && slugs !== 1) {
    problems.push(`${path}: a taxonomy has a feed for each term, so its address holds {slug}, the term's slug, once, such as ${example}`);
    return null;
  }
  if (term && segments.at(-1) === '{slug}') {
    problems.push(`${path}: ends in {slug}, where a post or a term's page would be; end it in a segment of its own, such as ${example}`);
    return null;
  }
  const below = [RESERVED_PREFIX, ...rules.addresses.reserved.filter((entry) => entry.endsWith('/*')).map((entry) => entry.slice(0, -1))]
    .find((prefix) => feed.startsWith(prefix));
  if (below !== undefined) {
    problems.push(`${path}: ${feed} lies below ${below}, which the site keeps for itself; give the feed another address`);
    return null;
  }
  return feed;
}

// The feeds of a site against each other and against what they list: a
// taxonomy's feeds hold the posts of the types that take it and have a date
// and an address, so one such type must; and no two feeds may have one
// address, which they could where every segment of one is the other's or
// `{slug}`. Each pair is told once, at the later.
function feedsOf(types, taxonomies, problems) {
  for (const taxonomy of Object.values(taxonomies)) {
    if (taxonomy?.feed == null) continue;
    const listed = Object.values(types).some((type) => type !== null && type.address !== null && hasDate(type)
      && type.fields.some((field) => field.kind === 'terms' && field.taxonomy?.name === taxonomy.name));
    if (!listed) {
      problems.push(`taxonomies.${taxonomy.name}.feed: a term's feed holds the posts of the types that take ${taxonomy.name} and have a date and an address, and no type does`);
    }
  }
  const feeds = [
    ...Object.values(types).filter((type) => type?.feed != null).map((type) => [`types.${type.name}`, type.feed]),
    ...Object.values(taxonomies).filter((taxonomy) => taxonomy?.feed != null).map((taxonomy) => [`taxonomies.${taxonomy.name}`, taxonomy.feed]),
  ];
  const meet = (a, b) => {
    const [x, y] = [a.slice(1, -1).split('/'), b.slice(1, -1).split('/')];
    return x.length === y.length && x.every((segment, i) => segment === y[i] || segment === '{slug}' || y[i] === '{slug}');
  };
  feeds.forEach(([path, feed], index) => {
    const other = feeds.slice(0, index).find(([, earlier]) => meet(earlier, feed));
    if (other) problems.push(`${path}.feed: ${feed} could be the address of the feed of ${other[0]} too, at ${other[1]}`);
  });
}

// A template reads a field or a setting as `entry.data.<name>`.
export function fieldName(name, path, problems) {
  if (/^[a-z][a-zA-Z0-9_]*$/.test(name)) return true;
  problems.push(`${path}: a field's name must be letters, digits and underscores, starting with a lowercase letter`);
  return false;
}

function fieldOf(name, field, path, taxonomies, problems) {
  if (!fieldName(name, path, problems)) return null;
  if (name === 'title') {
    problems.push(`${path}: every post has its title; it is not declared`);
    return null;
  }
  if (name === OLD_ADDRESSES) {
    problems.push(`${path}: a post's old addresses are kept under this name; it is not declared`);
    return null;
  }
  if (name === OTHER_ADDRESSES) {
    problems.push(`${path}: a post's other addresses are kept under this name; it is not declared`);
    return null;
  }
  if (name === TRANSLATION_KEY) {
    problems.push(`${path}: a post's translation set is kept under this name; it is not declared`);
    return null;
  }
  if (!isObject(field)) {
    problems.push(`${path}: must be an object`);
    return null;
  }
  if (Object.hasOwn(CORE_FIELDS, name)) {
    onlyKeys(field, CORE_FIELDS[name], path, problems);
    return { name, kind: name, required: flag(field.required, `${path}.required`, problems) };
  }
  if (name === SEO_FIELD) {
    if (['label', 'type', 'control', 'options'].some((key) => Object.hasOwn(field, key))) {
      problems.push(`${path}: the search and sharing fields are kept under this name; give the field of the site's own another`);
      return null;
    }
    onlyKeys(field, [], path, problems);
    return { name, kind: 'seo', keys: SEO_KEYS, required: false };
  }
  if (Object.hasOwn(field, 'taxonomy')) {
    onlyKeys(field, ['taxonomy', 'required'], path, problems);
    const taxonomy = Object.hasOwn(taxonomies, field.taxonomy) ? taxonomies[field.taxonomy] : null;
    if (!taxonomy) problems.push(`${path}.taxonomy: ${JSON.stringify(field.taxonomy)} is not a taxonomy the site description declares`);
    return { name, kind: 'terms', taxonomy, required: flag(field.required, `${path}.required`, problems) };
  }
  return metaField(name, field, path, problems);
}

// A field of the site's own.
function metaField(name, field, path, problems) {
  if (field.type === POST) {
    problems.push(`${path}.type: only a site setting can choose a post; a post's field cannot`);
    return null;
  }
  if (field.type === IMAGE) {
    problems.push(`${path}.type: only a site setting can be an image; a post's field cannot`);
    return null;
  }
  return { kind: 'meta', ...ownField(name, field, path, problems, undefined, FIELD_TYPES) };
}

// A value of the site's own: its label, its type, the control that shows it,
// a select's options, and whether it is required. `whole` names what declares
// it in a problem with its keys: the site description, or the core's
// settings groups (settings-groups.js). `takes`: the types it may have, each
// with its controls; a field's are those of a setting but a post.
export function ownField(name, field, path, problems, whole, takes = SETTING_TYPES) {
  onlyKeys(field, ['label', 'type', 'control', 'options', 'required'], path, problems, whole);
  const result = {
    name,
    label: text(field.label, `${path}.label`, problems),
    type: field.type,
    control: field.control,
    required: flag(field.required, `${path}.required`, problems),
  };
  if (!Object.hasOwn(takes, field.type)) {
    problems.push(`${path}.type: ${JSON.stringify(field.type)} is not one of ${Object.keys(takes).join(', ')}`);
    return result;
  }
  if (!takes[field.type].includes(field.control)) {
    const shown = takes[field.type];
    const list = shown.length === 1 ? shown[0] : `${shown.slice(0, -1).join(', ')} or ${shown.at(-1)}`;
    problems.push(`${path}.control: ${JSON.stringify(field.control)} cannot show a field of the type ${field.type}, which takes ${list}`);
  }
  if (field.type === 'boolean' && field.required !== undefined) {
    problems.push(`${path}.required: a yes-or-no field always has a value`);
  }
  if (field.type === POST && field.required !== undefined) {
    problems.push(`${path}.required: a chosen post can lose its page at any time, and the site then leaves it out, so it cannot be required`);
  }
  if (field.control === 'select' || field.options !== undefined) {
    if (field.control !== 'select') {
      problems.push(`${path}.options: only a field shown as a select has options`);
    } else if (!Array.isArray(field.options) || field.options.length === 0
      || !field.options.every((option) => typeof option === 'string' && option !== '')
      || new Set(field.options).size !== field.options.length) {
      problems.push(`${path}.options: must list the choices, each a different, non-empty string`);
    } else {
      result.options = [...field.options];
    }
  }
  return result;
}

// Whether a type's posts are in the site's search: on a site with
// search, every type with an address is, unless it declares `"search":
// false`; a type without one has no page to find.
function takesPart(declared, address, searched, path, problems) {
  if (declared !== undefined && typeof declared !== 'boolean') {
    problems.push(`${path}: must be true or false`);
    return false;
  }
  if (declared === true && address === null) {
    problems.push(`${path}: a type without an address has no page that search could find; leave search out`);
    return false;
  }
  return searched && address !== null && declared !== false;
}

// The site's search: the public address of its search page, a
// path from the site's root that ends in `/`, or null for a site without
// search. No page of the site's services' is a search page (RESERVED_PREFIX),
// nor any language's start page. A type whose own folder holds the address,
// as /news/{slug}/ holds /news/search/, is refused, since its posts are what
// that folder is for; a type at the root, as /{slug}/ and /{path}/ are,
// could give any address, and the intake refuses the one post that would
// take the search page's (two types' addresses are left to their posts
// the same way).
function searchOf(search, { types, taxonomies, languages }, problems) {
  if (search === undefined) return null;
  if (!isObject(search)) {
    problems.push('search: must be an object that gives the search page\'s address, such as { "address": "/search/" }');
    return null;
  }
  onlyKeys(search, ['address'], 'search', problems);
  const { address } = search;
  if (typeof address !== 'string' || !/^(\/[a-z0-9_][a-z0-9_-]*)+\/$/.test(address)) {
    const given = address === undefined ? '' : `${JSON.stringify(address)} `;
    problems.push(`search.address: ${given}must be a path from the site's root that ends in /, such as "/search/", in lowercase letters, digits, hyphens and underscores`);
    return null;
  }
  if (address.startsWith(RESERVED_PREFIX)) {
    problems.push(`search.address: ${address} lies below ${RESERVED_PREFIX}, where the site's services answer; give the search page another address`);
    return null;
  }
  const start = languages.length > 1 ? languages.find(({ prefix }) => address === `/${prefix}/`) : undefined;
  if (start) {
    problems.push(`search.address: ${address} is the start page of ${start.locale}; give the search page another address`);
    return null;
  }
  for (const type of Object.values(types)) {
    if (!type || type.address === null) continue;
    const given = typeof type.address === 'string' ? [[type.address, `types.${type.name}.address`]]
      : Object.entries(type.address).map(([locale, one]) => [one, `types.${type.name}.address.${locale}`]);
    for (const [pattern, path] of given) {
      const folder = pattern.slice(0, pattern.indexOf('{'));
      if (folder === '/' || address === folder || !address.startsWith(folder)) continue;
      const rest = address.slice(folder.length, -1);
      if (type.hierarchical || !rest.includes('/')) {
        problems.push(`${path}: ${pattern} can give a post the search page's address, ${address}; give the search page an address outside ${folder}`);
      }
    }
  }
  // A term's page is the same.
  for (const taxonomy of Object.values(taxonomies)) {
    if (!taxonomy || taxonomy.address === null) continue;
    const folder = taxonomy.address.slice(0, taxonomy.address.indexOf('{'));
    if (folder === '/' || address === folder || !address.startsWith(folder)) continue;
    if (taxonomy.address.endsWith('/{path}/') || !address.slice(folder.length, -1).includes('/')) {
      problems.push(`taxonomies.${taxonomy.name}.address: ${taxonomy.address} can give a term the search page's address, ${address}; give the search page an address outside ${folder}`);
    }
  }
  return { address };
}


// A type's address, or null for a type without one: one address, or on a
// site with several languages one may be given for each language, as an
// object of the address by locale. A hierarchical type's ends in `{path}`,
// the post's ancestors' slugs and its own, any other's in `{slug}`
// (format/addresses.js). No two types share one in a language; two types
// whose addresses can give one address, as `/{path}/` and `/{slug}/` can,
// leave it to the posts.
function addressOf(name, address, hierarchical, path, addresses, problems) {
  if (address === undefined) return null;
  const { languages } = addresses;
  const type = path.replace(/\.address$/, '');
  const form = { name, hierarchical };
  if (!isObject(address)) {
    if (!onePath(address, form, path, problems)) return null;
    for (const { locale } of languages.length > 0 ? languages : [{ locale: null }]) claim(address, locale, type, path, addresses, problems);
    return address;
  }
  if (languages.length < 2) {
    problems.push(`${path}: only a site with several languages gives a type an address in each language; give it one address`);
    return null;
  }
  for (const locale of Object.keys(address)) {
    if (!languages.some((language) => language.locale === locale)) problems.push(`${path}.${locale}: is not one of the site's languages`);
  }
  const read = {};
  for (const { locale } of languages) {
    if (!Object.hasOwn(address, locale)) {
      problems.push(`${path}: must give an address in each of the site's languages, and gives none in ${locale}`);
    } else if (onePath(address[locale], form, `${path}.${locale}`, problems)) {
      read[locale] = address[locale];
      claim(address[locale], locale, type, `${path}.${locale}`, addresses, problems);
    }
  }
  return read;
}

// Whether an address is one path from the site's root, ending in `{path}/`
// in a hierarchical type and in `{slug}/` in any other; a hierarchical
// taxonomy's (`kind`) may end in either. Each problem names the type or the
// taxonomy.
function onePath(address, { name, hierarchical, kind = 'type' }, path, problems) {
  const [own, other] = hierarchical ? ['{path}', '{slug}'] : ['{slug}', '{path}'];
  const shaped = typeof address === 'string' && /^(\/[a-z0-9_][a-z0-9_-]*)*\/\{(slug|path)\}\/$/.test(address);
  // A term's slug is its own in its taxonomy, so a hierarchical taxonomy's
  // terms may have their pages at their slugs alone too.
  const term = kind === 'taxonomy';
  if (shaped && (address.endsWith(`/${own}/`) || (term && hierarchical))) {
    if (!address.startsWith(RESERVED_PREFIX)) return true;
    problems.push(`${path}: ${address} lies below ${RESERVED_PREFIX}, where the site's services answer; give the ${kind} another address`);
    return false;
  }
  if (shaped) {
    const example = term ? '/category/{slug}/' : hierarchical ? '/pages/{path}/' : '/{slug}/';
    problems.push(`${path}: ${name} is ${hierarchical ? '' : 'not '}hierarchical, so its address ends in /${own}/, not /${other}/, such as "${example}"`);
  } else {
    const ends = term && hierarchical ? '/{slug}/ or /{path}/' : `/${own}/`;
    const examples = term ? '"/category/{slug}/"' : hierarchical ? '"/{path}/" or "/pages/{path}/"' : '"/{slug}/" or "/pages/{slug}/"';
    problems.push(`${path}: must be a path from the site's root that ends in ${ends}, such as ${examples}, in lowercase letters, digits, hyphens and underscores`);
  }
  return false;
}

// An address taken by a type in a language (null for a site with one), told
// once for each pair of types that share one.
function claim(address, locale, type, path, { languages, taken, told }, problems) {
  const key = `${locale}\n${address}`;
  const other = taken.get(key);
  if (other === undefined) {
    taken.set(key, type);
  } else if (!told.has(`${type}\n${other}`)) {
    told.add(`${type}\n${other}`);
    problems.push(`${path}: ${address} is also the address of ${other}${languages.length > 1 ? ` in ${locale}` : ''}`);
  }
}

function collectionOf(collection, path, collections, problems) {
  if (typeof collection !== 'string' || !/^[a-z][a-z0-9-]*$/.test(collection)) {
    problems.push(`${path}: must be lowercase letters, digits and hyphens, starting with a letter`);
    return collection;
  }
  if (collection === MEDIA_FOLDER) {
    problems.push(`${path}: ${MEDIA_FOLDER} is where the masters go; give the collection another name`);
    return collection;
  }
  if (Object.hasOwn(siteCollections, collection)) problems.push(`${path}: ${collection} is the collection of ${siteCollections[collection]}`);
  else if (collections.has(collection)) problems.push(`${path}: ${collection} is also the collection of ${collections.get(collection)}`);
  else collections.set(collection, path.replace(/\.collection$/, ''));
  return collection;
}

// The entries of an object of named declarations, such as the types.
function entries(value, path, problems, required) {
  if (value === undefined && !required) return [];
  if (!isObject(value) || (required && Object.keys(value).length === 0)) {
    problems.push(`${path}: must be an object${required ? ' that declares at least one' : ''}`);
    return [];
  }
  return Object.entries(value);
}

function onlyKeys(object, allowed, path, problems, whole = 'the site description') {
  checkedKeys(object, allowed, path, problems, whole);
}

function flag(value, path, problems) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') problems.push(`${path}: must be true or false`);
  return value === true;
}
