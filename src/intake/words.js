// A refusal and a warning: the same shape, data a program can show and a person can
// act on. What it is about, by what it names: a post by ID, type and title, the block
// by path and name, or the field; or a file with the entry or the setting in it. The
// reason by its name in the catalogues and the values that fill it, so that the editor
// shows it in its interface language (refusals.js); and the reason and a message that
// says the whole in British English, as the command line and the build log write them.

import { CATALOGUES, INTERFACE_LANGUAGES, labelInPhrase, SOURCE_LANGUAGE, text } from '../catalogues.js';
import { catalogueLabel } from '../format/built-in-types.js';
import { british, messageIn } from '../refusals.js';

// A reason by its name in the catalogues, `refusal.…` or `warning.…`, and the values
// that fill it (refusals.js). A name the catalogues lack is a fault in the core, so it
// throws, and the intake fails closed.
export function say(name, values = {}) {
  if (typeof CATALOGUES[SOURCE_LANGUAGE][name] !== 'string') throw new Error(`the catalogues have no words for ${name}`);
  return { name, values };
}

// Why a build made no release, shaped as a refusal is, with nothing to name but itself:
// its name in the catalogues, `failure.…`, its values, and its words in British English.
export function failure(name, values = {}) {
  const words = say(name, values);
  return Object.freeze({ ...words, reason: british(words) });
}

// A refusal or a warning for `{ post | file, block, field, entry, setting, line,
// reason }`, its reason given by say(), or in the site's own words.
export function named(about) {
  const clean = Object.fromEntries(Object.entries(about).filter(([key, value]) => key !== 'reason' && value !== undefined && value !== null));
  const words = about.reason;
  const said = words !== null && typeof words === 'object' ? { name: words.name, values: words.values ?? {} } : {};
  const refusal = { ...clean, ...said, reason: british(words) };
  return { ...refusal, message: messageIn(SOURCE_LANGUAGE, refusal) };
}

// The label of each of the core's fields, by its name in the catalogues, as the form shows it;
// and of each part of the teaser and of search, sharing and structured data, by its group's and
// its own (cms/config.js).
const CORE_LABELS = Object.freeze({
  slug: 'form.slug',
  status: 'form.status',
  parent: 'form.parent',
  date: 'form.date',
  excerpt: 'form.excerpt',
  image: 'form.image',
  breadcrumb: 'form.breadcrumb',
  eyebrow: 'form.eyebrow',
  headline: 'form.headline',
  subheadline: 'form.subheadline',
  standfirst: 'form.standfirst',
  teaser: 'form.teaser',
  seo: 'form.search',
  otherAddresses: 'form.inPhrase.otherAddresses',
});
const PART_LABELS = Object.freeze({
  'teaser.image': ['form.teaser', 'form.file'],
  'teaser.headline': ['form.teaser', 'form.teaserHeadline'],
  'teaser.text': ['form.teaser', 'form.teaserText'],
  'search.title': ['form.search', 'form.seoTitle'],
  'search.description': ['form.search', 'form.seoDescription'],
  'search.canonical': ['form.search', 'form.seoCanonical'],
  'search.noindex': ['form.search', 'form.seoNoindex'],
  'search.nofollow': ['form.search', 'form.seoNofollow'],
  'sharing.image': ['form.sharing', 'form.seoSocialImage'],
  'sharing.title': ['form.sharing', 'form.seoSocialTitle'],
  'sharing.description': ['form.sharing', 'form.seoSocialDescription'],
  'structured.schema': ['form.structured', 'form.seoSchema'],
  search: ['form.search'],
  sharing: ['form.sharing'],
  structured: ['form.structured'],
});

// A field of a post's type by its label, as the form shows it: the site's own label, one text or
// by language, or the core's in each language its interface comes in (ADR 0066). A refusal or a
// warning names a field so, and the editor reads it in its interface language, the command line
// and the build log in British English. A name the form shows no field for is given as it is.
export function fieldLabel(type, name) {
  if (name === 'title') return catalogueLabel(type.fields.some((field) => field.kind === 'headline') ? 'form.workingName' : 'form.title');
  if (Object.hasOwn(PART_LABELS, name)) {
    const [group, part] = PART_LABELS[name];
    if (part === undefined) return catalogueLabel(group);
    return Object.fromEntries(INTERFACE_LANGUAGES.map((language) => [language, text(language, 'about.part', { group: text(language, group), part: labelInPhrase(text(language, part), language) })]));
  }
  const field = type.fields.find((one) => one.name === name);
  if (field?.kind === 'meta') return field.label;
  if (field?.kind === 'terms' && field.taxonomy) return field.most === 1 ? field.taxonomy.label : field.taxonomy.plural;
  return Object.hasOwn(CORE_LABELS, name) ? catalogueLabel(CORE_LABELS[name]) : name;
}

// A field as a refusal or a warning names where it is: its name, and its label.
export const fieldNamed = (type, name) => ({ name, label: fieldLabel(type, name) });

// A field as a value of a refusal's or a warning's reason: its label, in the middle of a phrase.
export const fieldValued = (type, name) => ({ label: fieldLabel(type, name) });
