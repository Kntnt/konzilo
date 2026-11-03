// The intake: the source files at one commit in, the content files or refusals out. One
// function with no input or output of its own, so that hundreds of cases run in a second
// and the command, the preview and a test all call the same thing. It sees every file,
// so it checks across them, and a post, its image and its terms move together.
//
// A refused post gets no new file and keeps the one it was last published with, by the
// ledger, even after its slug has changed; other posts are unaffected. When the check
// itself breaks it throws, and nothing is written.

import { isObject } from '../checks.js';
import { feedAt, feedName, listPageOwners, publicAddress, searchPages, unprefixedAddress } from '../format/addresses.js';
import { registryFile } from '../format/consent.js';
import { declaredServices } from '../format/declared-services.js';
import { keyOf, REDIRECTS_FILE, reservedBy } from '../format/redirects.js';
import { POST_IDS_FILE } from '../format/write.js';
import { siteDescription } from '../site-description.js';
import { emptyLedger, ledgerFile, nextLedger, normalLedger } from './ledger.js';
import { menuItems } from './menus.js';
import { bodyHands, bodyProblems, fieldsOf, fileText, momentOf, otherAddressesIn, publishedHash, slugFrom, slugOf, writtenBody } from './post-file.js';
import { reader as siteReader } from './reader.js';
import { readRules, ruleForFile } from './rules-file.js';
import { chosenIn, settingsFor } from './settings.js';
import { readSource, sha256 } from './source.js';
import { named, say } from './words.js';

const hashDigits = (hash) => hash.slice(0, 10);
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const MARKUP = /<\/?[a-zA-Z!?][^<>]*>/;
const TERM_SLUG = /^[a-z0-9_-]+$/;

// `files`: the source files, each { path, contents }. `site`: the site description, as
// declared or as checked. `now`: a Date or a function that gives one. `ledger`: the
// previous `.post-ids.json`, parsed, or null. `changes`: who last changed what, by a
// source file's path, { by, admin }; a path it does not name is not held to a role.
// `images(path)`: what an original below `media/` is, as images.js gives it. `adminHost`:
// the host no link may lead to, or null. `reader`: the Markdown reader, the site's own
// but in a test of what happens when it breaks.
//
// Returns { files, refusals, warnings, keep, ledger, next }: `keep`, the paths of the
// content files that stay though no file here writes them, a refused post's own and what
// it names; `next`, the next scheduled moment, or null.
export function intake({ files, site: described, now, ledger = null, changes = {}, images = () => null, adminHost = null, reader = siteReader }) {
  const site = siteDescription(described);
  const clock = typeof now === 'function' ? now() : now;
  const run = {
    site,
    now: clock,
    nowText: clock.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    several: site.languages.length > 1,
    ledger: ledger === null ? emptyLedger() : normalLedger(ledger),
    changes,
    images,
    adminHost,
    reader,
    refused: new Map(),
    warnings: [],
    refusals: [],
    source: readSource(files, site),
  };
  run.refusals.push(...run.source.refusals);
  run.posts = new Map(run.source.posts.map((post) => [post.key, post]));
  run.postsById = groupBy(run.source.posts, (post) => post.id);
  readTerms(run);
  readAdminFiles(run);
  for (const post of run.source.posts) stateOf(post, run);
  for (const post of run.source.posts) if (post.on) checkPost(post, run);
  settle(run);
  return assemble(run);
}

function groupBy(list, keyOf2) {
  const groups = new Map();
  for (const item of list) {
    const key = keyOf2(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

const aboutPost = (post) => ({ id: post.id, type: post.type.name, title: post.title ?? post.id });

function refuse(run, post, details) {
  const list = run.refused.get(post.key) ?? [];
  list.push(named({ post: aboutPost(post), file: post.path, ...details }));
  run.refused.set(post.key, list);
}

// A term's name, slug, parent and file in each language it has. A term with a problem
// refuses the posts that use it, naming the term.
function readTerms(run) {
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
    const term = { key, id: first.id, taxonomy: first.taxonomy, name, value, byTag: new Map(group.map((one) => [one.tag, one.value])), problems: [], parentId: null };
    term.label = name || first.id;
    if (group.some((one) => one.refusal)) term.problems.push(group.find((one) => one.refusal).refusal.reason);
    else if (!main && run.several) term.problems.push(say('term-main', { term: term.label, language: mainTag }));
    else if (name === '') term.problems.push(say('term-name', { term: first.id }));
    const description = typeof value?.description === 'string' ? value.description.trim() : '';
    term.description = description;
    if (MARKUP.test(name) || MARKUP.test(description)) term.problems.push(say('term-markup', { term: term.label }));
    const slug = value?.slug === undefined || value?.slug === null || value?.slug === '' ? slugFrom(name) : value.slug;
    term.slug = typeof slug === 'string' ? slug : '';
    if (!TERM_SLUG.test(term.slug) && name !== '') term.problems.push(say('term-slug', { term: term.label, slug: String(slug) }));
    if (first.taxonomy.hierarchical && typeof value?.parent === 'string' && value.parent !== '') term.parentId = value.parent;
    for (const one of group) {
      if (!run.several || one === main || !one.value) continue;
      const differs = (field) => (typeof one.value[field] === 'string' ? one.value[field].trim() : '') !== (typeof value?.[field] === 'string' ? value[field].trim() : '');
      if (one.language === null) term.problems.push(say('term-language', { term: term.label, folder: one.tag ?? '' }));
      else if (differs('description') || differs('parent')) term.problems.push(say('term-differs', { term: term.label, language: one.tag }));
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
        term.problems.push(say('term-parent', { term: term.label, parent: next.parentId }));
        break;
      }
      if (seen.has(parent.key)) {
        term.problems.push(say('term-loop', { term: term.label }));
        break;
      }
      seen.add(parent.key);
      term.chain.unshift(parent);
      next = parent;
    }
  }
}

const PROTECTED = (path) => path === 'settings.json' || path === 'redirects.json' || path === 'services.json' || (path.startsWith('menus/') && path.endsWith('.json'));

// Why a non-Admin's change to one of an Admin's files is refused, or null. A file back
// at what was last accepted is no change, whoever touched it last.
function adminProblem(run, path) {
  const change = run.changes?.[path];
  if (!change || change.admin !== false) return null;
  if (run.source.hashes.get(path) === run.ledger.files[path]) return null;
  return say('admin-file', { by: change.by ?? 'this person', file: path });
}

function readAdminFiles(run) {
  const { source } = run;
  run.gated = new Map();
  const paths = new Set([...source.hashes.keys(), ...Object.keys(run.changes ?? {}).filter(PROTECTED)]);
  for (const path of paths) {
    const reason = adminProblem(run, path);
    if (reason) {
      run.gated.set(path, reason);
      run.refusals.push(named({ file: path, reason }));
    }
  }
  run.settingsSource = source.settings?.value ?? {};
  const unusable = source.settings?.refused || run.gated.has('settings.json') || !isObject(run.settingsSource);
  if (source.settings && !source.settings.refused && !isObject(run.settingsSource)) run.refusals.push(named({ file: 'settings.json', reason: say('setting-shape') }));
  run.settingsRefused = Boolean(unusable);
  run.chosen = unusable ? run.ledger.chosen : chosenIn(run.settingsSource);
  // A file an Admin has not accepted says nothing here: the rules go on as they were.
  const rulesUsable = source.redirects && !source.redirects.refused && !run.gated.has('redirects.json');
  const read = readRules(rulesUsable ? source.redirects.value : { rules: [] });
  run.rules = read;
  run.rulesRefused = Boolean(source.redirects?.refused || run.gated.has('redirects.json') || read.problems.length > 0);
  for (const { entry, reason } of read.problems) run.refusals.push(named({ file: REDIRECTS_FILE, entry, reason }));
  for (const { entry, reason } of read.warnings) run.warnings.push(named({ file: REDIRECTS_FILE, entry, reason }));
  if (run.rulesRefused) run.rules = { exact: [], patterns: [], problems: [], warnings: [] };
}

// Whether a post is on the site's way: published, its date come. A draft is nobody's
// business but its editor's, and is not checked.
function stateOf(post, run) {
  const { status = 'draft' } = post.fields;
  post.on = false;
  if (post.unreadable) {
    post.on = true;
    refuse(run, post, { reason: post.unreadable.reason, line: post.unreadable.line });
    return;
  }
  if (status === 'draft' || status === null) return;
  if (status !== 'published' && status !== 'scheduled') {
    post.on = true;
    refuse(run, post, { field: 'status', reason: say('status', { status: String(status) }) });
    return;
  }
  const date = post.fields.date === undefined || post.fields.date === null || post.fields.date === '' ? undefined : momentOf(post.fields.date);
  if (status === 'scheduled' && !date) {
    post.on = true;
    refuse(run, post, { field: date === null ? 'date' : 'status', reason: date === null ? say('field-moment', { field: 'date', value: String(post.fields.date) }) : say('scheduled-date') });
    return;
  }
  if (date && new Date(date) > run.now) {
    post.waiting = date;
    return;
  }
  post.on = true;
  if (run.several && post.language === null) {
    refuse(run, post, { reason: say('language-folder', { folder: post.tag ?? 'the collection\'s own folder' }) });
    post.keepsNothing = true;
    return;
  }
  post.notFound = run.chosen.notFound === post.id;
  if (run.chosen.legalPages.includes(post.id)) {
    const change = run.changes?.[post.path];
    if (change && change.admin === false && post.hash !== run.ledger.posts[post.key]?.source) {
      refuse(run, post, { reason: say('admin-legal', { by: change.by ?? 'this person' }) });
    }
  }
}

// A post's own problems, what no other post can change.
function checkPost(post, run) {
  if (run.refused.has(post.key) && post.unreadable) return;
  if (post.title === null) refuse(run, post, { field: 'title', reason: say('title-empty') });
  else if (MARKUP.test(post.title)) refuse(run, post, { field: 'title', reason: say('title-markup') });
  const slug = slugOf(post);
  if (slug.reason) refuse(run, post, { field: 'slug', reason: slug.reason });
  const other = otherAddressesIn(post);
  if (other.reason) refuse(run, post, { field: 'otherAddresses', reason: other.reason });
  const { problems } = fieldsOf(post, contextFor(post, run, ''), {});
  for (const problem of problems) refuse(run, post, problem);
  const hands = handsFor(post, run, '');
  for (const { path, name, line, reason } of bodyProblems(post, hands)) {
    refuse(run, post, { block: { path, name }, line: line === null ? undefined : line + post.bodyLine - 1, reason });
  }
}

const fileFolders = (path) => path.split('/').length - 1;

// The address of a master from a file at `path`: climbing from its folder to the
// content folder's root.
const climb = (path) => '../'.repeat(fileFolders(path));

// A master for an image a post names: { src, warning }, or { reason }.
function masterFor(run, address, stem, from, { icon = false } = {}) {
  const name = mediaName(address);
  if (name === null) return { reason: say('image-outside', { address: String(address) }) };
  const facts = run.images(`media/${name}`);
  if (!facts) return { reason: say('image-gone', { name }) };
  if (facts.reason) return { reason: facts.reason };
  const { images: widths } = run.site;
  if (icon) {
    if (facts.width !== facts.height) return { reason: say('icon-square') };
    if (!facts.svg && facts.width < 512) return { reason: say('icon-small', { width: facts.width }) };
  } else if (!facts.svg && widths) {
    if (widths.smallestWidth !== null && facts.width < widths.smallestWidth) return { reason: say('image-small', { width: facts.width, smallest: widths.smallestWidth }) };
  }
  const warning = !icon && !facts.svg && widths?.displayWidth && facts.width < widths.displayWidth ? say('image-narrow', { name, width: facts.width, display: widths.displayWidth }) : undefined;
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
function contextFor(post, run, from) {
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

function termField(field, value, post, run) {
  const given = value === undefined || value === null || value === '' ? [] : Array.isArray(value) ? value : [value];
  if (given.length === 0 && field.required) return { reason: say('field-required', { field: field.name }) };
  const slugs = [];
  const folder = run.several && post.tag ? `${post.tag}/` : '';
  for (const id of given) {
    const term = run.terms.get(`${field.taxonomy.collection}/${id}`);
    if (!term) return { reason: say('term-gone', { id: String(id), plural: field.taxonomy.plural.toLowerCase() }) };
    const [problem] = term.chain.flatMap((one) => one.problems);
    if (problem) return { reason: problem };
    for (const one of term.chain) post.termIds.add(one.key);
    slugs.push(`${folder}${term.slug}`);
  }
  return { yaml: JSON.stringify([...new Set(slugs)].sort()) };
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
        else warnings.push(say('list-term-gone', { term: given, taxonomy: taxonomy.label.toLowerCase() }));
      }
      if (slugs.length > 0) groups.push(`${name}:${slugs.join(',')}`);
    }
    return groups.join(' ');
  };
}

function handsFor(post, run, from) {
  const slug = slugOf(post).slug ?? post.id;
  return bodyHands(run.site, post, {
    reader: run.reader,
    adminHost: run.adminHost,
    listTerms: listTermsOf(run),
    link: (id, fragment) => linkTarget(run, post, id, fragment),
    image: (address) => {
      const master = masterFor(run, address, slug, from);
      if (master.master) post.masters.set(`media/${master.master}`, master.contents);
      return master;
    },
  });
}

// The page a post has now: where it is live this build, or, for a refused post that
// keeps its file, where that file answers, under the title it was published with.
function pageOf(post, run) {
  const live = run.live?.get(post.key);
  if (live) return post.type.address === null ? null : { address: live.address, title: post.title };
  if (run.refused.has(post.key) && !post.keepsNothing && !post.notFound) {
    const previous = run.ledger.posts[post.key];
    if (previous?.path && previous.address) return { address: previous.address, title: previous.title };
  }
  return null;
}

// What a reference by ID leads to now: { address, title }, or { none: <words> } for a
// target with no page now, or { reason } for what no page can show. `language` is the
// language of what refers; a reference may name another, `<tag>/<id>`. A post is looked
// for in that language, then in each of the site's.
function leadsTo(run, reference, language) {
  const parts = reference.split('/');
  const id = parts.at(-1);
  const tag = parts.length > 1 ? parts[0] : null;
  const posts = run.postsById.get(id);
  if (posts) {
    const [any] = posts;
    if (any.type.address === null) return { reason: say('reference-no-address', { title: any.title ?? id, plural: any.type.plural.toLowerCase() }) };
    const wanted = tag ?? language?.tag ?? null;
    const own = posts.find((post) => post.tag === wanted);
    const candidates = own ? [own] : tag ? [] : posts;
    for (const post of candidates) {
      const page = pageOf(post, run);
      if (page) return { ...page, otherLanguage: post.tag !== language?.tag ? post : null };
    }
    return { none: (own ?? any).title ?? id };
  }
  const term = run.termsById.get(id);
  if (term) {
    if (term.taxonomy.address === null) return { reason: say('reference-term', { term: term.label, plural: term.taxonomy.plural.toLowerCase() }) };
    const page = run.termPages?.get(term.key);
    return page ? { address: page, title: term.name } : { none: term.label };
  }
  return { none: null };
}

function linkTarget(run, post, reference, fragment) {
  const target = leadsTo(run, reference, post.language);
  if (target.reason) return { reason: target.reason };
  if (target.none !== undefined) {
    return { text: true, warning: target.none === null ? say('link-gone', { text: '{text}' }) : say('link-no-page', { text: '{text}', title: target.none }) };
  }
  const explicit = reference.includes('/');
  const translated = explicit && target.otherLanguage && run.postsById.get(reference.split('/').at(-1)).some((one) => one.tag === post.tag && pageOf(one, run));
  return { href: `${target.address}${fragment ? `#${fragment}` : ''}`, warning: translated ? say('link-language', { text: '{text}' }) : undefined };
}

// Where each post that goes live has its file and its address: its path is its
// ancestors' slugs from the top and its own. An ancestor refused, missing or of another
// type refuses the post, naming it; a draft ancestor gives its slug.
function pathOf(post, run) {
  const slug = slugOf(post).slug;
  if (!post.type.hierarchical) return { name: slug };
  const names = [slug];
  const seen = new Set([post.key]);
  for (let next = post; ;) {
    const parentId = next.fields.parent;
    if (parentId === undefined || parentId === null || parentId === '') break;
    const key = post.tag ? `${post.tag}/${parentId}` : String(parentId);
    const parent = run.posts.get(key);
    if (!parent) return { reason: say('parent-missing', { parent: String(parentId) }) };
    if (parent.type !== post.type) return { reason: say('parent-type', { parent: parent.title ?? String(parentId), plural: post.type.plural.toLowerCase() }) };
    if (seen.has(key)) return { reason: say('parent-loop', { parent: parent.title ?? String(parentId) }) };
    if (run.refused.has(key)) return { reason: say('parent-refused', { parent: parent.title ?? String(parentId) }) };
    const own = slugOf(parent);
    if (own.reason) return { reason: say('parent-refused', { parent: parent.title ?? String(parentId) }) };
    seen.add(key);
    names.unshift(own.slug);
    next = parent;
  }
  return { name: names.join('/') };
}

const earlier = (run, a, b) => {
  const [x, y] = [run.ledger.posts[a.key], run.ledger.posts[b.key]];
  if (x?.taken && y?.taken && x.taken !== y.taken) return x.taken < y.taken ? -1 : 1;
  if (x?.taken && !y?.taken) return -1;
  if (y?.taken && !x?.taken) return 1;
  return a.key < b.key ? -1 : 1;
};

// One round of who holds what. Returns whether it refused anything, since a post that
// goes keeps its file, and what it holds changes.
function holdAddresses(run) {
  const { site } = run;
  const before = run.refused.size;
  run.live = new Map();
  const holders = new Map();
  const claim = (key, entry) => {
    if (!holders.has(key)) holders.set(key, []);
    holders.get(key).push(entry);
  };
  // A refused post's kept file holds what it held.
  for (const post of run.source.posts) {
    if (!post.on || !run.refused.has(post.key) || post.keepsNothing || post.notFound) continue;
    const previous = run.ledger.posts[post.key];
    if (!previous?.path) continue;
    if (previous.address) claim(keyOf(previous.address), { post, kept: true });
    claim(`file:${previous.path}`, { post, kept: true });
  }
  const candidates = run.source.posts.filter((post) => post.on && !run.refused.has(post.key) && !post.notFound);
  for (const post of candidates) {
    const place = pathOf(post, run);
    if (place.reason) {
      refuse(run, post, { field: 'parent', reason: place.reason });
      continue;
    }
    post.place = {
      name: place.name,
      file: `${post.type.collection}/${post.tag ? `${post.tag}/` : ''}${place.name}.md`,
      address: publicAddress(post.type, place.name, post.language),
    };
    if (post.place.address) claim(keyOf(post.place.address), { post });
    claim(`file:${post.place.file}`, { post });
  }
  if (run.refused.size !== before) return true;
  // The post the current release shows there keeps it; otherwise the one the ledger took
  // first. The other is refused, naming it.
  for (const [key, claims] of holders) {
    if (claims.length < 2) continue;
    const current = (entry) => entry.kept || run.ledger.posts[entry.post.key]?.address === entry.post.place?.address && run.ledger.posts[entry.post.key]?.path;
    const sorted = [...claims].sort((a, b) => Number(Boolean(current(b))) - Number(Boolean(current(a))) || earlier(run, a.post, b.post));
    const [winner, ...losers] = sorted;
    for (const { post, kept } of losers) {
      if (kept || post === winner.post) continue;
      refuse(run, post, { field: 'slug', reason: say('address-held', { address: key.startsWith('file:') ? key.slice(5) : post.place.address, holder: winner.post.title ?? winner.post.id }) });
    }
  }
  if (run.refused.size !== before) return true;
  for (const post of candidates) {
    const { address } = post.place;
    if (!address) continue;
    const site2 = siteHolder(address, site);
    if (site2) refuse(run, post, { field: 'slug', reason: site2 });
  }
  if (run.refused.size !== before) return true;
  for (const post of candidates) run.live.set(post.key, post.place);
  // Who has a list with pages of its own holds every address below `<address>page/`.
  const pagers = new Map(candidates.filter((post) => post.place.address && pagedList(post)).map((post) => [post.place.address, post]));
  for (const post of candidates) {
    const owner = post.place.address && listPageOwners(post.place.address).map((one) => pagers.get(one)).find(Boolean);
    if (owner && owner !== post) refuse(run, post, { field: 'slug', reason: say('address-list', { address: post.place.address, holder: owner.title ?? owner.id }) });
  }
  if (run.refused.size !== before) return true;
  // A term has a page only while a post has it, or a term below it.
  run.termPages = termPagesOf(run, candidates);
  for (const post of candidates) {
    const term = post.place.address ? [...run.termPages].find(([, page]) => keyOf(page) === keyOf(post.place.address)) : null;
    if (term) refuse(run, post, { field: 'slug', reason: say('address-term', { address: post.place.address, term: run.terms.get(term[0]).label }) });
  }
  if (run.refused.size !== before) return true;
  // Rules that lead to a post are the post's.
  const byAddress = new Map(candidates.filter((post) => post.place.address).map((post) => [keyOf(post.place.address), post]));
  for (const post of candidates) post.ruleOthers = [];
  run.siteRules = [];
  for (const rule of run.rules.exact) {
    if (rule.post) {
      const post = run.posts.get(rule.post) ?? run.postsById.get(rule.post)?.[0];
      if (post && run.live.has(post.key) && post.type.address !== null) post.ruleOthers.push({ address: rule.from, answer: rule.status });
      else run.warnings.push(named({ file: REDIRECTS_FILE, reason: say('rule-post-off', { source: rule.from }) }));
    } else if (rule.term) {
      const page = run.termPages.get(`${run.termsById.get(rule.term)?.key}`);
      if (page) run.siteRules.push({ from: rule.from, to: page, status: rule.status });
      else run.warnings.push(named({ file: REDIRECTS_FILE, reason: say('rule-post-off', { source: rule.from }) }));
    } else {
      const toPost = typeof rule.to === 'string' ? byAddress.get(keyOf2(rule.to)) : undefined;
      if (toPost) toPost.ruleOthers.push({ address: rule.from, answer: rule.status });
      else run.siteRules.push(rule);
    }
  }
  // An other address is one holder's alone.
  const others = new Map();
  const exact = new Map(run.siteRules.map((rule) => [keyOf(rule.from), rule]));
  for (const post of [...candidates].sort((a, b) => earlier(run, a, b))) {
    for (const { address } of allOthers(post)) {
      const key = keyOf(address);
      const reserved = siteHolder(address, site);
      const own = byAddress.get(key) ?? holders.get(key)?.[0]?.post;
      const inFile = post.place.address !== null;
      if (!inFile) refuse(run, post, { field: 'otherAddresses', reason: say('other-no-address', { plural: post.type.plural.toLowerCase() }) });
      else if (reserved) refuse(run, post, { field: 'otherAddresses', reason: reserved });
      else if (own) refuse(run, post, { field: 'otherAddresses', reason: say('other-held', { address, holder: own.title ?? own.id }) });
      else if (others.has(key) && others.get(key) !== post) refuse(run, post, { field: 'otherAddresses', reason: say('other-held', { address, holder: others.get(key).title ?? others.get(key).id }) });
      else if (exact.has(key)) refuse(run, post, { field: 'otherAddresses', reason: say('other-rule', { address }) });
      else others.set(key, post);
    }
  }
  if (run.refused.size !== before) return true;
  run.held = { byAddress, others, exact, kept: holders };
  return false;
}

const keyOf2 = (to) => {
  try {
    const [path] = to.split('#');
    return path.startsWith('/') ? keyOf(path) : null;
  } catch {
    return null;
  }
};

const pagedList = (post) => /^::post-list\{[^}]*\bpages="true"/m.test(post.body);

function allOthers(post) {
  const own = otherAddressesIn(post).list ?? [];
  const known = new Set(own.map(({ address }) => keyOf(address)));
  return [...own, ...(post.ruleOthers ?? []).filter(({ address }) => !known.has(keyOf(address)))];
}

// What of the site's own holds an address, in words, or null.
function siteHolder(address, site) {
  const reserved = reservedBy(address);
  if (reserved !== null) return say('address-reserved', { address });
  const feed = feedAt(address.split('?')[0], site);
  if (feed) return say('address-feed', { address, feed: feedName(feed) });
  if (searchPages(site).some((page) => keyOf(page) === keyOf(address))) return say('address-search', { address });
  return null;
}

// A term's page, where its taxonomy declares one. On a site in several languages the
// term's files are in the languages' folders, and only a file at its collection's root
// has a page.
function termPagesOf(run, candidates) {
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

// A post's old addresses: where it was live before, but where something higher in the
// order holds the address now. The rule goes when another post goes live there.
function oldAddressesOf(post, run) {
  const { address } = post.place;
  const live = new Set(run.ledger.posts[post.key]?.addresses ?? []);
  if (run.several && post.language?.main) {
    const bare = unprefixedAddress(post.type, post.place.name, post.language);
    if (bare) live.add(bare);
  }
  const own = keyOf(address);
  return [...live].filter((one) => {
    const key = keyOf(one);
    if (key === own) return false;
    if (siteHolder(one, run.site)) return false;
    if (run.held.byAddress.has(key) || run.held.others.has(key) || run.held.exact.has(key)) return false;
    return ![...run.termPages.values()].some((page) => keyOf(page) === key);
  }).sort();
}

const yamlDate = (moment) => moment;

// A post's whole file, with its derived fields, or a body's problems as refusals.
function writePost(post, run) {
  const path = post.place.file;
  const from = climb(path);
  const previous = run.ledger.posts[post.key];
  const taken = previous?.taken ?? run.nowText;
  const context = contextFor(post, run, from);
  const hands = handsFor(post, run, from);
  const { body, problems, warnings, embeds } = writtenBody(post, hands);
  for (const { path: at, name, line, reason } of problems) refuse(run, post, { block: { path: at, name }, line: line === null ? undefined : line + post.bodyLine - 1, reason });
  if (problems.length > 0) return;
  const own = momentOf(post.fields.date ?? '');
  const date = own ?? taken;
  const fields = fieldsOf(post, context, { date, modified: 'PENDING' });
  for (const problem of fields.problems) refuse(run, post, problem);
  if (fields.problems.length > 0) return;
  const lines = [['title', JSON.stringify(post.title)], ...fields.lines];
  if (run.several) {
    const key = translationKeyOf(post, run);
    if (key) lines.push(['translationKey', JSON.stringify(key)]);
  }
  if (post.place.address !== null) {
    const old = oldAddressesOf(post, run);
    if (old.length > 0) lines.push(['oldAddresses', JSON.stringify(old)]);
    const others = allOthers(post).sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0));
    if (others.length > 0) lines.push(['otherAddresses', JSON.stringify(others)]);
  }
  const published = publishedHash(lines, body);
  const first = !previous?.published;
  const modified = previous?.published === published ? previous.modified : first ? yamlDate(own ?? taken) : run.nowText;
  const finished = lines.map(([key, value]) => [key, value === 'PENDING' ? modified : value]);
  post.written = {
    path,
    contents: fileText(finished, body),
    published,
    modified,
    taken,
    embeds,
    warnings: [...warnings.map(({ path: at, name, line, reason }) => ({ block: { path: at, name }, line: line === null ? undefined : line + post.bodyLine - 1, reason })), ...fields.warnings],
    terms: [...post.termIds],
    masters: post.masters,
  };
}

// A translation's key: 16 lowercase hexadecimal characters, written only when the release
// holds another member of the set. The same ID in each language is the set, or the key
// the source gives where the editing tool wrote one.
function setOf(post) {
  const given = post.fields.translationKey;
  return typeof given === 'string' && given !== '' ? given : post.id;
}

function translationKeyOf(post, run) {
  const set = setOf(post);
  const members = run.source.posts.filter((one) => one !== post && setOf(one) === set && (run.live.has(one.key) || (run.refused.has(one.key) && run.ledger.posts[one.key]?.path)));
  if (members.length === 0) return null;
  return /^[0-9a-f]{16}$/.test(set) ? set : sha256(set).slice(0, 16);
}

// Two posts of one set in one language: the later taken is refused.
function checkSets(run) {
  const before = run.refused.size;
  const live = run.source.posts.filter((post) => run.live.has(post.key));
  const groups = groupBy(live, (post) => `${setOf(post)}\n${post.tag}`);
  for (const group of groups.values()) {
    const [first, ...rest] = [...group].sort((a, b) => earlier(run, a, b));
    for (const post of rest) refuse(run, post, { field: 'translationKey', reason: say('set-twice', { holder: first.title ?? first.id }) });
  }
  return run.refused.size !== before;
}

// Round on round until nothing more is refused: a post that goes keeps its last file,
// which changes where a link to it leads and what a later post may hold.
function settle(run) {
  for (;;) {
    if (holdAddresses(run)) continue;
    if (run.several && checkSets(run)) continue;
    const before = run.refused.size;
    for (const post of run.source.posts) {
      if (run.live.has(post.key)) writePost(post, run);
    }
    if (run.refused.size !== before) continue;
    break;
  }
}

// The page for addresses not found: the chosen post's title and body alone, its images
// named from where the file is, in no collection and with no address of its own. A
// refused one keeps no version published before.
function notFoundFiles(run, files) {
  const chosen = run.chosen.notFound;
  if (chosen === null) return;
  const posts = run.postsById.get(chosen) ?? [];
  const main = run.several ? run.site.languages[0].tag : null;
  const usable = posts.filter((post) => post.on && !run.refused.has(post.key));
  if (!usable.some((post) => post.tag === main)) {
    run.warnings.push(named({ file: 'settings.json', setting: 'notFound.page', reason: say('not-found-none') }));
  }
  for (const post of usable) {
    const path = post.tag === main || !post.tag ? 'not-found.md' : `not-found/${post.tag}.md`;
    const from = climb(path);
    post.masters = new Map();
    const hands = handsFor(post, run, from);
    const { body, problems, warnings, embeds } = writtenBody(post, hands);
    if (problems.length > 0) {
      for (const { path: at, name, line, reason } of problems) refuse(run, post, { block: { path: at, name }, line: line === null ? undefined : line + post.bodyLine - 1, reason });
      continue;
    }
    files.set(path, fileText([['title', JSON.stringify(post.title)]], body));
    post.written = {
      path,
      contents: files.get(path),
      published: sha256(files.get(path)),
      modified: run.ledger.posts[post.key]?.modified ?? run.nowText,
      taken: run.ledger.posts[post.key]?.taken ?? run.nowText,
      embeds,
      warnings: warnings.map(({ path: at, name, line, reason }) => ({ block: { path: at, name }, line, reason })),
      terms: [],
      masters: post.masters,
      notFound: true,
    };
  }
}

function termFiles(run, files, keep) {
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
    if (tag && own === null) run.warnings.push(named({ file: `${term.taxonomy.collection}/${term.id}.json`, reason: say('term-translation', { term: term.label, language: language?.tag ?? tag }) }));
    const parent = term.chain.length > 1 ? term.chain.at(-2) : null;
    files.set(`${term.taxonomy.collection}/${folder}${term.slug}.json`, json({
      name: own ?? term.name,
      ...(term.description ? { description: term.description } : {}),
      ...(parent ? { parent: `${folder}${parent.slug}` } : {}),
    }));
  }
  void keep;
}

// The settings of each language, and what a choice of a post and an image lead to.
function settingsFiles(run, files) {
  const { site } = run;
  const languages = run.several ? site.languages : [site.languages[0] ?? null];
  const results = [];
  const masters = new Map();
  const settingsPath = (language) => (run.several ? `settings/${language.tag}.json` : 'settings.json');
  let title;
  for (const language of languages) {
    const from = climb(settingsPath(language ?? {}));
    const hands = {
      title,
      choice(id, path) {
        const target = leadsTo(run, String(id), language);
        if (target.reason) return { reason: target.reason };
        if (target.none !== undefined) return { warning: say('setting-no-page', { title: target.none ?? String(id), setting: path }) };
        const translated = run.several && target.otherLanguage ? say('setting-translation', { title: target.title, language: language.tag }) : undefined;
        return { value: { title: target.title, url: target.address }, warning: translated };
      },
      image(value, stem, options = {}) {
        const given = isObject(value) ? value : { src: value };
        const master = masterFor(run, given.src, stem, from, options);
        if (master.reason) return { reason: master.reason };
        masters.set(`media/${master.master}`, master.contents);
        const alt = typeof given.alt === 'string' ? given.alt.trim() : '';
        return { value: { src: master.src, ...(alt ? { alt } : {}) }, warning: master.warning };
      },
    };
    const read = settingsFor(site, run.settingsSource, language, hands);
    if (language === languages[0]) title = read.values.title;
    results.push({ language, ...read });
  }
  const problems = results.flatMap((result) => result.problems);
  for (const { setting, reason } of problems) run.refusals.push(named({ file: 'settings.json', setting, reason }));
  if (problems.length > 0) return { refused: true, masters: new Map(), values: null };
  for (const { warnings } of results) for (const { setting, reason } of warnings) run.warnings.push(named({ file: 'settings.json', setting, reason }));
  for (const { language, values } of results) files.set(settingsPath(language ?? {}), json(values));
  return { refused: false, masters, values: results[0].values };
}

function menuFiles(run, files) {
  const { site } = run;
  const languages = run.several ? site.languages : [site.languages[0] ?? null];
  for (const menu of Object.values(site.menus)) {
    for (const language of languages) {
      const name = run.several ? `${language.tag}/${menu.name}` : menu.name;
      const path = `menus/${name}.json`;
      if (run.gated.has(path)) continue;
      const source = run.source.menus.get(name);
      if (source?.refused) continue;
      const read = menuItems(source?.value ?? { items: [] }, (id) => {
        const target = leadsTo(run, id, language);
        return target.reason ? target : target.none !== undefined ? { none: target.none ?? '' } : target;
      });
      if (read.problems.length > 0) {
        for (const { entry, reason } of read.problems) run.refusals.push(named({ file: path, entry, reason }));
        continue;
      }
      for (const { entry, reason } of read.warnings) run.warnings.push(named({ file: path, entry, reason }));
      files.set(path, json({ items: read.items }));
    }
  }
}

function redirectsFile(run, files) {
  if (run.rulesRefused) return;
  const exact = [];
  for (const rule of run.held.exact.values()) {
    const key = keyOf(rule.from);
    if (run.held.byAddress.has(key) || [...run.termPages.values()].some((page) => keyOf(page) === key)) {
      run.warnings.push(named({ file: REDIRECTS_FILE, reason: say('rule-shadowed', { source: rule.from }) }));
    } else exact.push(ruleForFile(rule));
  }
  // A term's page answers its old addresses, the site's rules, with its current address.
  for (const [key, page] of run.termPages) {
    const term = run.terms.get(key);
    for (const from of run.ledger.terms[term.id]?.addresses ?? []) {
      if (keyOf(from) === keyOf(page) || run.held.byAddress.has(keyOf(from)) || run.held.exact.has(keyOf(from)) || run.held.others.has(keyOf(from))) continue;
      exact.push({ from, to: page, status: 301 });
    }
  }
  exact.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  files.set(REDIRECTS_FILE, json({ rules: [...exact, ...run.rules.patterns] }));
}

function consentFile(run, files, settings, embeds) {
  if (settings.refused || run.gated.has('services.json') || run.source.services?.refused) return;
  const given = run.source.services?.value;
  const list = isObject(given) ? given.services ?? [] : Array.isArray(given) ? given : [];
  const { services, problems } = declaredServices(list, { adminHost: run.adminHost });
  if (problems.length > 0) {
    for (const { service, field, reason } of problems) run.refusals.push(named({ file: 'services.json', setting: `${service.id ?? service.name ?? 'a service'}.${field}`, reason }));
    return;
  }
  const previous = run.ledger.consent;
  const { file, warnings, asksConsent } = registryFile({ site: run.site, settings: settings.values, embeds: [...embeds].sort(), previous, now: run.now, declared: services });
  for (const { consent, reason } of warnings) run.warnings.push(named({ file: 'site-description.json', setting: consent, reason }));
  files.set(file.path, file.contents);
  const registry = JSON.parse(file.contents);
  run.consentRecord = { revision: registry.revision, revised: registry.revised };
  const legal = settings.values.legalPages ?? {};
  if (asksConsent && !legal.privacyPolicy) run.warnings.push(named({ file: 'settings.json', setting: 'legalPages.privacyPolicy', reason: say('legal-missing', { page: 'privacy policy' }) }));
  if (asksConsent && !legal.cookiePolicy) run.warnings.push(named({ file: 'settings.json', setting: 'legalPages.cookiePolicy', reason: say('legal-missing', { page: 'cookie policy' }) }));
}

function assemble(run) {
  const { source, ledger } = run;
  const files = new Map();
  const keep = new Set();
  const masters = new Map();
  const embeds = new Set();
  notFoundFiles(run, files);
  for (const post of source.posts) {
    if (run.refused.has(post.key)) {
      const previous = ledger.posts[post.key];
      if (post.keepsNothing || post.notFound || !previous?.path) continue;
      keep.add(previous.path);
      for (const path of previous.names?.terms ?? []) keep.add(path);
      for (const name of previous.names?.media ?? []) keep.add(`media/${name}`);
      for (const service of previous.names?.embeds ?? []) embeds.add(service);
      continue;
    }
    if (!post.written) continue;
    if (!post.written.notFound) files.set(post.written.path, post.written.contents);
    for (const [path, contents] of post.written.masters) masters.set(path, contents);
    for (const service of post.written.embeds ?? []) embeds.add(service);
  }
  termFiles(run, files, keep);
  let settings = { refused: true, masters: new Map(), values: null };
  if (!run.settingsRefused) settings = settingsFiles(run, files);
  for (const [path, contents] of settings.masters) masters.set(path, contents);
  menuFiles(run, files);
  redirectsFile(run, files);
  consentFile(run, files, settings, embeds);
  // Warnings of a post that is live, in the order of its blocks.
  for (const post of source.posts) {
    if (run.refused.has(post.key) || !post.written) continue;
    for (const warning of post.written.warnings) run.warnings.push(named({ post: aboutPost(post), file: post.path, ...warning }));
  }
  const next = source.posts.map((post) => post.waiting).filter(Boolean).sort()[0] ?? null;
  const updated = nextLedger(run, settings);
  for (const [path, contents] of masters) if (contents !== undefined) files.set(path, contents);
  files.set(POST_IDS_FILE, ledgerFile(updated));
  const refusals = [...run.refusals, ...source.posts.flatMap((post) => run.refused.get(post.key) ?? [])];
  return {
    files: [...files].map(([path, contents]) => ({ path, contents })).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    refusals,
    warnings: run.warnings,
    keep: [...keep].sort(),
    ledger: updated,
    next,
  };
}

export { deletion } from './guard.js';
