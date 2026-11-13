// One holder per address: where each post goes live, who keeps an address two want, what
// of the site's own holds one, a post's other addresses and the rules that lead to it, and
// which of its old addresses still answer.

import { feedAt, feedWords, listPageOwners, publicAddress, searchPages, unprefixedAddress } from '../format/addresses.js';
import { keyOf, REDIRECTS_FILE, reservedBy, SHOW } from '../format/redirects.js';
import { START_ADDRESS, startFile } from '../format/start-page.js';
import { otherAddressesIn, slugOf } from './post-file.js';
import { refuse } from './run.js';
import { termPagesOf } from './terms.js';
import { named, say } from './words.js';

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
    if (!parent) return { reason: say('refusal.parent-missing', { parent: String(parentId) }) };
    if (parent.type !== post.type) return { reason: say('refusal.parent-type', { parent: parent.title ?? String(parentId), plural: { label: post.type.plural } }) };
    if (seen.has(key)) return { reason: say('refusal.parent-loop', { parent: parent.title ?? String(parentId) }) };
    if (run.refused.has(key)) return { reason: say('refusal.parent-refused', { parent: parent.title ?? String(parentId) }) };
    const own = slugOf(parent);
    if (own.reason) return { reason: say('refusal.parent-refused', { parent: parent.title ?? String(parentId) }) };
    seen.add(key);
    names.unshift(own.slug);
    next = parent;
  }
  return { name: names.join('/') };
}

// A post on its own way comes before one a live preview shows whatever its status and moment,
// which would find the other there once published.
const ownFirst = (a, b) => Number(Boolean(a.forPreview)) - Number(Boolean(b.forPreview));

export const earlier = (run, a, b) => {
  const own = ownFirst(a, b);
  if (own !== 0) return own;
  const [x, y] = [run.ledger.posts[a.key], run.ledger.posts[b.key]];
  if (x?.taken && y?.taken && x.taken !== y.taken) return x.taken < y.taken ? -1 : 1;
  if (x?.taken && !y?.taken) return -1;
  if (y?.taken && !x?.taken) return 1;
  return a.key < b.key ? -1 : 1;
};

// One round of who holds what. Returns whether it refused anything, since a post that
// goes keeps its file, and what it holds changes.
export function holdAddresses(run) {
  const { site } = run;
  const before = run.refused.size;
  run.live = new Map();
  run.roundWarnings = [];
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
    // The start page an Admin chose is at the start page's address, its file at the content
    // folder's root, and its path stays its children's.
    post.place = {
      name: place.name,
      file: post.startPage ? startFile(post.type) : `${post.type.collection}/${post.tag ? `${post.tag}/` : ''}${place.name}.md`,
      address: post.startPage ? START_ADDRESS : publicAddress(post.type, place.name, post.language),
    };
    if (post.place.address) claim(keyOf(post.place.address), { post });
    claim(`file:${post.place.file}`, { post });
  }
  if (run.refused.size !== before) return true;
  // The post the current release shows there keeps it; otherwise the one the ledger took
  // first. The other is refused, naming it. In a live preview, whose release shows drafts
  // too, a post on its own way comes first.
  for (const [key, claims] of holders) {
    if (claims.length < 2) continue;
    const current = (entry) => entry.kept || run.ledger.posts[entry.post.key]?.address === entry.post.place?.address && run.ledger.posts[entry.post.key]?.path;
    const sorted = [...claims].sort((a, b) => ownFirst(a.post, b.post) || Number(Boolean(current(b))) - Number(Boolean(current(a))) || earlier(run, a.post, b.post));
    const [winner, ...losers] = sorted;
    for (const { post, kept } of losers) {
      if (kept || post === winner.post || run.refused.has(post.key)) continue;
      refuse(run, post, { field: 'slug', reason: say('refusal.address-held', { address: key.startsWith('file:') ? key.slice(5) : post.place.address, holder: winner.post.title ?? winner.post.id }) });
    }
  }
  if (run.refused.size !== before) return true;
  for (const post of candidates) {
    const { address } = post.place;
    if (!address || post.startPage) continue;
    const holder = siteHolder(address, site);
    if (holder) refuse(run, post, { field: 'slug', reason: holder });
  }
  if (run.refused.size !== before) return true;
  for (const post of candidates) run.live.set(post.key, post.place);
  // Who has a list with pages of its own holds every address below `<address>page/`.
  const pagers = new Map(candidates.filter((post) => post.place.address && pagedList(post)).map((post) => [post.place.address, post]));
  for (const post of candidates) {
    const owner = post.place.address && listPageOwners(post.place.address).map((one) => pagers.get(one)).find(Boolean);
    if (owner && owner !== post) refuse(run, post, { field: 'slug', reason: say('refusal.address-list', { address: post.place.address, holder: owner.title ?? owner.id }) });
  }
  if (run.refused.size !== before) return true;
  // A term has a page only while a post has it, or a term below it.
  run.termPages = termPagesOf(run, candidates);
  for (const post of candidates) {
    const term = post.place.address ? [...run.termPages].find(([, page]) => keyOf(page) === keyOf(post.place.address)) : null;
    if (term) refuse(run, post, { field: 'slug', reason: say('refusal.address-term', { address: post.place.address, term: run.terms.get(term[0]).label }) });
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
      else run.roundWarnings.push(named({ file: REDIRECTS_FILE, reason: say('warning.rule-post-off', { source: rule.from }) }));
      // A rule to the start page an Admin chose leads to /, as one typed so does.
      if (post?.startPage && run.live.has(post.key)) run.roundWarnings.push(named({ file: REDIRECTS_FILE, reason: say('warning.rule-start', { source: rule.from }) }));
    } else if (rule.term) {
      const page = run.termPages.get(`${run.termsById.get(rule.term)?.key}`);
      if (page) run.siteRules.push({ from: rule.from, to: page, status: rule.status });
      else run.roundWarnings.push(named({ file: REDIRECTS_FILE, reason: say('warning.rule-post-off', { source: rule.from }) }));
    } else {
      const toPost = typeof rule.to === 'string' ? byAddress.get(targetKey(rule.to)) : undefined;
      if (toPost) toPost.ruleOthers.push({ address: rule.from, answer: rule.status });
      else run.siteRules.push(rule);
    }
  }
  // An other address is one holder's alone.
  const others = new Map();
  const exact = new Map(run.siteRules.map((rule) => [keyOf(rule.from), rule]));
  for (const post of [...candidates].sort((a, b) => earlier(run, a, b))) {
    for (const { address, answer } of allOthers(post)) {
      const key = keyOf(address);
      const reserved = siteHolder(address, site);
      const own = byAddress.get(key) ?? holders.get(key)?.[0]?.post;
      const inFile = post.place.address !== null;
      if (!inFile) refuse(run, post, { field: 'otherAddresses', reason: say('refusal.other-no-address', { plural: { label: post.type.plural } }) });
      // The start page is at / alone; another address may lead there.
      else if (post.startPage && answer === SHOW) refuse(run, post, { field: 'otherAddresses', reason: say('refusal.other-start', { address }) });
      else if (reserved) refuse(run, post, { field: 'otherAddresses', reason: reserved });
      else if (own) refuse(run, post, { field: 'otherAddresses', reason: say('refusal.other-held', { address, holder: own.title ?? own.id }) });
      else if (others.has(key) && others.get(key) !== post) refuse(run, post, { field: 'otherAddresses', reason: say('refusal.other-held', { address, holder: others.get(key).title ?? others.get(key).id }) });
      else if (exact.has(key)) refuse(run, post, { field: 'otherAddresses', reason: say('refusal.other-rule', { address }) });
      else others.set(key, post);
    }
  }
  if (run.refused.size !== before) return true;
  run.held = { byAddress, others, exact };
  return false;
}

// Where a refused post's page would be were it not refused: its public address, by its slug
// and its parents', or null where it can have none, or another holds it.
export function addressWanted(post, run) {
  if (post.unreadable || post.keepsNothing || post.gone || post.notFound || post.startPage || post.type.address === null) return null;
  if (slugOf(post).reason) return null;
  const place = pathOf(post, run);
  if (place.reason) return null;
  const address = publicAddress(post.type, place.name, post.language);
  const key = keyOf(address);
  const held = run.held && (run.held.byAddress.has(key) || run.held.others.has(key) || run.held.exact.has(key));
  if (held || siteHolder(address, run.site) || [...(run.termPages?.values() ?? [])].some((page) => keyOf(page) === key)) return null;
  return address;
}

// The key of a rule's target, when it is a path on the site.
const targetKey = (to) => {
  const [path] = to.split('#');
  return path.startsWith('/') ? keyOf(path) : null;
};

const pagedList = (post) => /^::post-list\{[^}]*\bpages="true"/m.test(post.body);

export function allOthers(post) {
  const own = otherAddressesIn(post).list ?? [];
  const known = new Set(own.map(({ address }) => keyOf(address)));
  return [...own, ...(post.ruleOthers ?? []).filter(({ address }) => !known.has(keyOf(address)))];
}

// What of the site's own holds an address, in words, or null.
function siteHolder(address, site) {
  const reserved = reservedBy(address);
  if (reserved !== null) return say('refusal.address-reserved', { address });
  const feed = feedAt(address.split('?')[0], site);
  if (feed) return say('refusal.address-feed', { address, feed: feedWords(feed) });
  if (searchPages(site).some((page) => keyOf(page) === keyOf(address))) return say('refusal.address-search', { address });
  return null;
}

// A post's old addresses: where it was live before, but where something higher in the
// order holds the address now. The rule goes when another post goes live there.
export function oldAddressesOf(post, run) {
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
