// Terms: each read once across the languages it has a file in, the page it has while a
// post names it, and its published file, written for each term a published post names and
// each term above it.

import { slugFrom } from './post-file.js';
import { groupBy } from './run.js';
import { named, say } from './words.js';

const MARKUP = /<\/?[a-zA-Z!?][^<>]*>/;
const TERM_SLUG = /^[a-z0-9_-]+$/;
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

// A term's name, slug, parent and file in each language it has. A term with a problem
// refuses the posts that use it, naming the term.
export function readTerms(run) {
  const { site, source } = run;
  const groups = groupBy(source.terms, (term) => `${term.taxonomy.collection}/${term.id}`);
  run.terms = new Map();
  run.termsById = new Map();
  for (const [key, group] of groups) {
    const [first] = group;
    const mainTag = run.several ? site.languages[0].tag : null;
    const main = group.find((one) => one.tag === mainTag);
    const value = main?.value;
    const name = typeof value?.name === 'string' ? value.name.trim() : '';
    const term = { key, id: first.id, file: (main ?? first).path, taxonomy: first.taxonomy, name, value, byTag: new Map(group.map((one) => [one.tag, one.value])), problems: [], parentId: null };
    term.label = name || first.id;
    // A term a Reviewer changed holds back the posts that use it (ADR 0008).
    const reviewer = group.find((one) => run.changes?.[one.path]?.reviewer === true);
    if (reviewer) term.problems.push(say('refusal.reviewer', { by: run.changes[reviewer.path].by ?? say('about.someone'), file: reviewer.path }));
    if (group.some((one) => one.refusal)) term.problems.push(group.find((one) => one.refusal).refusal.reason);
    else if (!main && run.several) term.problems.push(say('refusal.term-main', { term: term.label, language: mainTag }));
    else if (name === '') term.problems.push(say('refusal.term-name', { term: first.id }));
    const description = typeof value?.description === 'string' ? value.description.trim() : '';
    term.description = description;
    if (MARKUP.test(name) || MARKUP.test(description)) term.problems.push(say('refusal.term-markup', { term: term.label }));
    const slug = value?.slug === undefined || value?.slug === null || value?.slug === '' ? slugFrom(name) : value.slug;
    term.slug = typeof slug === 'string' ? slug : '';
    if (!TERM_SLUG.test(term.slug) && name !== '') term.problems.push(say('refusal.term-slug', { term: term.label, slug: String(slug) }));
    if (first.taxonomy.hierarchical && typeof value?.parent === 'string' && value.parent !== '') term.parentId = value.parent;
    for (const one of group) {
      if (!run.several || one === main || !one.value) continue;
      const differs = (field) => (typeof one.value[field] === 'string' ? one.value[field].trim() : '') !== (typeof value?.[field] === 'string' ? value[field].trim() : '');
      if (one.language === null) term.problems.push(say('refusal.term-language', { term: term.label, folder: one.tag ?? '' }));
      else if (differs('description') || differs('parent')) term.problems.push(say('refusal.term-differs', { term: term.label, language: one.tag }));
    }
    run.terms.set(key, term);
    run.termsById.set(first.id, term);
  }
  for (const term of run.terms.values()) {
    const seen = new Set([term.key]);
    term.chain = [term];
    for (let next = term; next.parentId !== null;) {
      const parent = run.terms.get(`${term.taxonomy.collection}/${next.parentId}`);
      if (!parent) {
        term.problems.push(say('refusal.term-parent', { term: term.label, parent: next.parentId }));
        break;
      }
      if (seen.has(parent.key)) {
        term.problems.push(say('refusal.term-loop', { term: term.label }));
        break;
      }
      seen.add(parent.key);
      term.chain.unshift(parent);
      next = parent;
    }
  }
}

// A term's page, where its taxonomy declares one. On a site in several languages the
// term's files are in the languages' folders, and only a file at its collection's root
// has a page.
export function termPagesOf(run, candidates) {
  const pages = new Map();
  if (run.several) return pages;
  const used = new Set();
  for (const post of candidates) for (const key of termIdsOf(post, run)) used.add(key);
  for (const post of run.source.posts) {
    if (!post.on || !run.refused.has(post.key) || post.keepsNothing) continue;
    for (const path of run.ledger.posts[post.key]?.names?.terms ?? []) {
      const term = [...run.terms.values()].find((one) => `${one.taxonomy.collection}/${one.slug}.json` === path);
      if (term) used.add(term.key);
    }
  }
  for (const key of used) {
    const term = run.terms.get(key);
    if (term?.taxonomy.address) {
      pages.set(key, term.taxonomy.address.replace('{slug}', term.slug).replace('{path}', term.chain.map((one) => one.slug).join('/')));
    }
  }
  return pages;
}

// The terms a post's fields name, with those above them, by key.
function termIdsOf(post, run) {
  const found = new Set();
  for (const field of post.type.fields) {
    if (field.kind !== 'terms') continue;
    const value = post.fields[field.name];
    for (const id of value === undefined || value === null || value === '' ? [] : Array.isArray(value) ? value : [value]) {
      for (const one of run.terms.get(`${field.taxonomy.collection}/${id}`)?.chain ?? []) found.add(one.key);
    }
  }
  return found;
}

// Each term's file, in each language a post names it in.
export function termFiles(run, files) {
  const wanted = new Map();
  for (const post of run.source.posts) {
    const written = post.written;
    if (!written || written.notFound) continue;
    for (const key of written.terms) {
      const at = `${key}\n${post.tag ?? ''}`;
      if (!wanted.has(at)) wanted.set(at, { term: run.terms.get(key), language: post.language, tag: post.tag });
    }
  }
  for (const { term, language, tag } of wanted.values()) {
    const folder = tag ? `${tag}/` : '';
    const inLanguage = term.byTag.get(tag);
    const own = typeof inLanguage?.name === 'string' && inLanguage.name.trim() !== '' ? inLanguage.name.trim() : null;
    if (tag && own === null) run.warnings.push(named({ file: `${term.taxonomy.collection}/${term.id}.json`, reason: say('warning.term-translation', { term: term.label, language: language?.tag ?? tag }) }));
    const parent = term.chain.length > 1 ? term.chain.at(-2) : null;
    files.set(`${term.taxonomy.collection}/${folder}${term.slug}.json`, json({
      name: own ?? term.name,
      ...(term.description ? { description: term.description } : {}),
      ...(parent ? { parent: `${folder}${parent.slug}` } : {}),
    }));
  }
}
