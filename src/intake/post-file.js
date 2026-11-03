// A post's published file: its fields read from its source file against what its type
// declares, typed and in the order declared, with its body in the exact form. Derived
// fields stay derived: nothing in source sets `modified`, `oldAddresses` or a master.

import { isObject } from '../checks.js';
import { checkBody, readBody } from '../format/body.js';
import { embedOf } from '../format/embeds.js';
import { ownValue } from '../format/frontmatter.js';
import { readPostList, SECOND_PAGED_LIST } from '../format/post-list.js';
import { isSource, OTHER_ANSWERS, SHOW } from '../format/redirects.js';
import rules from '../format/rules.json' with { type: 'json' };
import { declaredNames, postListModel, SCHEMA_TYPES, SEO_KEYS, SEO_PARTS } from '../site-description.js';
import { sha256 } from './source.js';
import { say } from './words.js';

// A title or a plain text holding what reads as HTML.
const MARKUP = /<\/?[a-zA-Z!?][^<>]*>/;

// A slug: its own, or made from the title, in lowercase letters, digits, hyphens and
// underscores; anything else given is refused.
const SLUG = /^[a-z0-9_-]+$/;

export function slugFrom(text) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// A post's slug, or { reason }.
export function slugOf(post) {
  const { slug } = post.fields;
  if (slug === undefined || slug === null || slug === '') {
    const made = slugFrom(post.title ?? '');
    return made === '' ? { reason: say('slug-empty') } : { slug: made };
  }
  return typeof slug === 'string' && SLUG.test(slug) ? { slug } : { reason: say('slug', { slug: String(slug) }) };
}

// A moment as a file writes it, to the second in UTC, or null for what is none. A
// moment with no zone is read as UTC, since a server's zone must make no difference.
export function momentOf(value) {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value.toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return null;
  const zoned = text.length === 10 ? `${text}T00:00:00Z` : /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text.replace(' ', 'T') : `${text.replace(' ', 'T')}Z`;
  const moment = new Date(zoned);
  return Number.isNaN(moment.valueOf()) ? null : moment.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

const text = (value) => (value === undefined || value === null ? '' : typeof value === 'object' ? null : String(value));

// One frontmatter field's value: { yaml } to write it, {} to leave it out, or
// { reason }. `images(address, field)` gives a master's address, or { reason }.
function fieldValue(field, value, { images, terms }) {
  switch (field.kind) {
    case 'excerpt': {
      const written = text(value)?.trim();
      if (written === undefined || written === null) return { reason: say('field-text', { field: field.name }) };
      if (MARKUP.test(written)) return { reason: say('field-markup', { field: field.name }) };
      if (written === '') return field.required ? { reason: say('field-required', { field: field.name }) } : {};
      return { yaml: JSON.stringify(written) };
    }
    case 'image':
      return featuredImage(field, value, images);
    case 'seo':
      return seoValue(field, value, images);
    case 'terms':
      return terms(field, value);
    case 'meta':
      return ownField(field, value);
    default:
      return {};
  }
}

function ownField(field, value) {
  const stored = text(value);
  if (stored === null) return { reason: `the site cannot publish this as ${field.name}` };
  const read = ownValue(stored, field);
  if (read.reason) return { reason: read.reason };
  if (read.value === undefined) return field.required ? { reason: say('field-required', { field: field.name }) } : {};
  return { yaml: read.yaml };
}

function featuredImage(field, value, images) {
  const given = isObject(value) ? value : value ? { src: value } : {};
  if (!given.src) return field.required ? { reason: say('image-required') } : {};
  const alt = text(given.alt)?.trim() ?? '';
  if (alt === '') return { reason: say('image-alt') };
  const master = images(given.src, field.name);
  if (master.reason) return master;
  return { yaml: JSON.stringify({ src: master.src, alt }), warning: master.warning };
}

function seoValue(field, value, images) {
  if (value === undefined || value === null) return {};
  if (!isObject(value) || SEO_KEYS.some((key) => Object.hasOwn(value, key))) return { reason: say('seo-shape') };
  const given = {};
  const placeOf = {};
  for (const [part, keys] of Object.entries(SEO_PARTS)) {
    const inPart = value[part];
    if (inPart === undefined || inPart === null) continue;
    if (!isObject(inPart)) return { reason: say('seo-shape'), part: `seo.${part}` };
    for (const key of keys) {
      given[key] = inPart[key];
      placeOf[key] = `seo.${part}.${key}`;
    }
  }
  const written = {};
  let warning;
  for (const key of SEO_KEYS) {
    const one = given[key];
    if (one === undefined || one === null || one === '' || one === false) continue;
    if (key === 'noindex' || key === 'nofollow') {
      if (one !== true) return { reason: say('seo-flag', { key }), part: placeOf[key] };
      written[key] = true;
    } else if (key === 'socialImage') {
      const master = images(one, placeOf[key]);
      if (master.reason) return { ...master, part: placeOf[key] };
      written[key] = master.src;
      warning = master.warning;
    } else {
      const trimmed = text(one)?.trim();
      if (!trimmed) return { reason: say('seo-text', { key }), part: placeOf[key] };
      if (key === 'schema' && !SCHEMA_TYPES.includes(trimmed)) return { reason: say('seo-schema', { value: trimmed, types: SCHEMA_TYPES.join(', ') }), part: placeOf[key] };
      written[key] = trimmed;
    }
  }
  if ((written.socialImage === undefined) !== (written.socialImageAlt === undefined)) return { reason: say('seo-image-alt'), part: 'seo.sharing.socialImageAlt' };
  return Object.keys(written).length === 0 ? {} : { yaml: JSON.stringify(written), warning };
}

// A post's other addresses as its source gives them, or { reason }.
export function otherAddressesIn(post) {
  const given = post.fields.otherAddresses;
  if (given === undefined || given === null) return { list: [] };
  if (!Array.isArray(given)) return { reason: say('other-shape') };
  const list = [];
  for (const entry of given) {
    const answer = /^\d+$/.test(String(entry?.answer)) ? Number(entry.answer) : entry?.answer ?? 301;
    if (!isSource(entry?.address)) return { reason: say('other-address', { address: String(entry?.address) }) };
    if (!OTHER_ANSWERS.includes(answer)) return { reason: say('other-answer', { address: entry.address, answer: String(answer) }) };
    if (answer === SHOW && entry.address.includes('?')) return { reason: say('other-show-query', { address: entry.address }) };
    list.push({ address: entry.address, answer });
  }
  return { list };
}

// The problems of a post's fields, and its lines of frontmatter, by a context
// `{ images(address, field), terms(field, value) }`. The derived ones, the date when
// the post has none of its own and `modified`, are handed in `derived` or left out.
export function fieldsOf(post, context, derived = {}) {
  const lines = [];
  const problems = [];
  const warnings = [];
  for (const field of post.type.fields) {
    const given = post.fields[field.name];
    if (field.kind === 'date') {
      const moment = given === undefined || given === null || given === '' ? derived.date : momentOf(given);
      if (moment === null) problems.push({ field: field.name, reason: say('field-moment', { field: field.name, value: String(given) }) });
      else lines.push([field.name, moment ?? '']);
      continue;
    }
    if (field.kind === 'modified') {
      lines.push([field.name, derived.modified ?? '']);
      continue;
    }
    const value = fieldValue(field, given, context);
    if (value.reason) problems.push({ field: value.part ?? field.name, reason: value.reason });
    else if (value.yaml !== undefined) lines.push([field.name, value.yaml]);
    if (value.warning) warnings.push({ field: field.name, reason: value.warning });
  }
  return { lines, problems, warnings };
}

// What a body takes of the site: the reader, the rule data and the site's own checks.
// `list` is a post's own state: a second list with pages of its own is refused.
export function bodyHands(site, post, { reader, adminHost, listTerms, link, image }) {
  const lists = postListModel(site);
  const attributes = rules.elements['post-list'].directive.attributes;
  let paged = 0;
  return {
    reader,
    rules,
    embedOf,
    adminHost,
    elements: post.type.elements,
    declared: declaredNames(site),
    link,
    image,
    directive(name, values) {
      if (name !== 'post-list') return { reasons: [], warnings: [], values };
      const warnings = [];
      const given = { ...values };
      for (const key of ['include', 'exclude']) {
        if (given[key] === undefined) continue;
        const read = listTerms(given[key], warnings);
        if (read === '') delete given[key];
        else given[key] = read;
      }
      const { problems, settings } = readPostList(given, lists, { attributes });
      if (values.pages === true && (paged += 1) > 1) problems.push(SECOND_PAGED_LIST);
      const options = lists.presentations[values.presentation]?.options ?? [];
      const ordered = {};
      for (const key of Object.keys(attributes)) if (Object.hasOwn(settings, key)) ordered[key] = settings[key];
      for (const { name: option } of options) if (Object.hasOwn(settings, option) && settings[option] !== false) ordered[option] = settings[option];
      return { reasons: problems, warnings, values: ordered };
    },
  };
}

// A body's problems before anything is resolved.
export function bodyProblems(post, hands) {
  return readBody(post.body, hands).problems;
}

// A body in the exact form: { body, problems, warnings, embeds }.
export function writtenBody(post, hands) {
  return checkBody(post.body, hands);
}

// The bytes of a post's file: `---`, one key to a line, `---`, a blank line, the body
// and one final newline; the frontmatter alone when the body is empty.
export function fileText(lines, body) {
  const head = lines.map(([key, value]) => `${key}: ${value}`).join('\n');
  return body === '' ? `---\n${head}\n---\n` : `---\n${head}\n---\n\n${body}\n`;
}

// What says that a post's published version has not changed: the file without its
// `modified`, which a change of the file sets.
export function publishedHash(lines, body) {
  return sha256(fileText(lines.filter(([key]) => key !== 'modified'), body));
}
