// What a post's fields and its body take of the site: a master for each image, terms by
// their IDs, and where a link leads.

import { AUTHORS } from '../format/built-in-types.js';
import { bodyHands, slugOf } from './post-file.js';
import { linkTarget } from './resolve.js';
import { say } from './words.js';

const hashDigits = (hash) => hash.slice(0, 10);

const fileFolders = (path) => path.split('/').length - 1;

// The address of a master from a file at `path`: climbing from its folder to the
// content folder's root.
export const climb = (path) => '../'.repeat(fileFolders(path));

// A master for an image a post names: { src, warning }, or { reason }.
export function masterFor(run, address, stem, from, { icon = false } = {}) {
  const name = mediaName(address);
  if (name === null) return { reason: say('refusal.image-outside', { address: String(address) }) };
  const facts = run.images(`media/${name}`);
  if (!facts) return { reason: say('refusal.image-gone', { name }) };
  if (facts.reason) return { reason: facts.reason };
  const { images: widths } = run.site;
  if (icon) {
    if (facts.width !== facts.height) return { reason: say('refusal.icon-square') };
    if (!facts.svg && facts.width < 512) return { reason: say('refusal.icon-small', { width: facts.width }) };
  } else if (!facts.svg && widths) {
    if (widths.smallestWidth !== null && facts.width < widths.smallestWidth) return { reason: say('refusal.image-small', { width: facts.width, smallest: widths.smallestWidth }) };
  }
  const warning = !icon && !facts.svg && widths?.displayWidth && facts.width < widths.displayWidth ? say('warning.image-narrow', { name, width: facts.width, display: widths.displayWidth }) : undefined;
  const master = `${stem}-${hashDigits(facts.hash)}.${facts.extension}`;
  return { src: `${from}media/${master}`, warning, master, contents: facts.contents };
}

// An original's name below `media/`, from an address the source gives it by: as the
// editing tool stores it, `/media/<name>`, or as a content file names it. Anything else
// is no original of this site's.
function mediaName(address) {
  if (typeof address !== 'string') return null;
  const match = /^(?:\/|(?:\.\.\/)*)media\/([^?#]+)$/.exec(address.trim());
  if (!match) return null;
  try {
    return decodeURI(match[1]);
  } catch {
    return null;
  }
}

// What a post's fields take of the site. `from` is how its file climbs to the root.
export function contextFor(post, run, from) {
  const slug = slugOf(post).slug ?? post.id;
  post.masters = new Map();
  post.termIds = new Set();
  return {
    images: (address) => {
      const master = masterFor(run, address, slug, from);
      if (master.master) post.masters.set(`media/${master.master}`, master.contents);
      return master;
    },
    terms: (field, value) => termField(field, value, post, run),
  };
}

// A terms field's slugs, each once: an article's authors in the order the source gives them,
// which says who wrote it first, and every other field's sorted.
function termField(field, value, post, run) {
  const given = value === undefined || value === null || value === '' ? [] : Array.isArray(value) ? value : [value];
  if (given.length === 0 && field.required) return { reason: say('refusal.field-required', { field: field.name }) };
  if (field.most !== null && new Set(given).size > field.most) return { reason: say('refusal.terms-most', { most: field.most, plural: { label: field.taxonomy.plural } }) };
  const slugs = [];
  const folder = run.several && post.tag ? `${post.tag}/` : '';
  for (const id of given) {
    const term = run.terms.get(`${field.taxonomy.collection}/${id}`);
    if (!term) return { reason: say('refusal.term-gone', { id: String(id), plural: { label: field.taxonomy.plural } }) };
    const [problem] = term.chain.flatMap((one) => one.problems);
    if (problem) return { reason: problem };
    for (const one of term.chain) post.termIds.add(one.key);
    slugs.push(`${folder}${term.slug}`);
  }
  const once = [...new Set(slugs)];
  return { yaml: JSON.stringify(field.taxonomy.builtIn === AUTHORS ? once : once.sort()) };
}

// A post list's terms, kept by ID in source and written as slugs. One no longer there is
// left out with a warning, and a group left without terms with it.
function listTermsOf(run) {
  return (value, warnings) => {
    if (typeof value !== 'string') return value;
    const groups = [];
    for (const group of value.split(' ').filter(Boolean)) {
      const [name, list] = group.split(':');
      const taxonomy = run.site.taxonomies[name];
      if (!taxonomy || list === undefined) {
        groups.push(group);
        continue;
      }
      const slugs = [];
      for (const given of list.split(',')) {
        const byId = run.terms.get(`${taxonomy.collection}/${given}`);
        const bySlug = [...run.terms.values()].find((term) => term.taxonomy === taxonomy && term.slug === given);
        if (byId || bySlug) slugs.push((byId ?? bySlug).slug);
        else warnings.push(say('warning.list-term-gone', { term: given, taxonomy: { label: taxonomy.label } }));
      }
      if (slugs.length > 0) groups.push(`${name}:${slugs.join(',')}`);
    }
    return groups.join(' ');
  };
}

export function handsFor(post, run, from) {
  const slug = slugOf(post).slug ?? post.id;
  return bodyHands(run.site, post, {
    reader: run.reader,
    adminHost: run.adminHost,
    components: run.components,
    listTerms: listTermsOf(run),
    link: (id, fragment) => linkTarget(run, post, id, fragment),
    image: (address) => {
      const master = masterFor(run, address, slug, from);
      if (master.master) post.masters.set(`media/${master.master}`, master.contents);
      return master;
    },
  });
}
