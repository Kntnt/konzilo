// The intake: the source files at one commit in, the content files or refusals out. One
// function with no input or output of its own, so that hundreds of cases run in a second
// and the command, the preview and a test all call the same thing. It sees every file,
// so it checks across them, and a post, its image and its terms move together.
//
// A refused post gets no new file and keeps the one it was last published with, by the
// ledger, even after its slug has changed; other posts are unaffected. When the check
// itself breaks it throws, and nothing is written.

import { isObject, MARKUP } from '../checks.js';
import { DRAFT, POST_STATUSES, PUBLISHED, SCHEDULED } from '../format/post-status.js';
import { REDIRECTS_FILE } from '../format/redirects.js';
import { START_PAGE, startFile } from '../format/start-page.js';
import { POST_IDS_FILE } from '../format/write.js';
import { siteDescription } from '../site-description.js';
import { addressWanted, allOthers, earlier, holdAddresses, oldAddressesOf } from './addresses.js';
import { climb, contextFor, handsFor } from './hands.js';
import { emptyLedger, ledgerFile, nextLedger, normalLedger } from './ledger.js';
import { bodyProblems, fieldsOf, fileText, momentOf, otherAddressesIn, publishedHash, slugOf, writtenBody } from './post-file.js';
import { reader as siteReader } from './reader.js';
import { readRules } from './rules-file.js';
import { aboutPost, groupBy, inBody, ofPost, refuse } from './run.js';
import { chosenIn } from './settings.js';
import { consentFile, menuFiles, notFoundFiles, redirectsFile, settingsFiles } from './site-files.js';
import { readSource, sha256 } from './source.js';
import { readTerms, termFiles } from './terms.js';
import { fieldValued, named, say } from './words.js';

// A post's own statuses, of which it is a draft where it names none of them.
const STATUSES = new Set(POST_STATUSES);

// `files`: the source files, each { path, contents }. `site`: the site description, as
// declared or as checked. `now`: a Date or a function that gives one. `ledger`: the
// previous `.post-ids.json`, parsed, or null. `changes`: who last changed what, by a
// source file's path, { by, admin, reviewer }; a path it does not name is not held to a role.
// `images(path)`: what an original below `media/` is, as images.js gives it. `adminHost`:
// the host no link may lead to, or null. `reader`: the Markdown reader, the site's own
// but in a test of what happens when it breaks. `preview`: the paths of the source files
// a live preview shows, which are checked and written whatever their status and date,
// where every other draft stays nobody's business; one on its way for the preview alone
// gives way to a post on its own, as it would once published.
//
// Returns { files, refusals, warnings, keep, ledger, posts, termPages, next }: `keep`, the
// paths of the content files that stay though no file here writes them, a refused post's own
// and what it names, and what a refused settings file names; `posts`, what became of each
// source file of a post, `state` being `live`, `refused`, `waiting` for its moment `at`, or
// `off`, with its own `status`, `draft`, `scheduled` or `published`, a draft where it names
// none of them, its `address`, whether the site `shown` shows a version of it, and, while it
// is refused, the address its page would be at, `wanted`, where it can have one nothing else
// holds, or null; `termPages`, each term's page, by the term's source `file`, its name as
// `title` and its `address`; `next`, the next scheduled moment, or null.
export function intake({ files, site: described, now, ledger = null, changes = {}, images = () => null, adminHost = null, reader = siteReader, preview = [], components = null }) {
  const site = siteDescription(described);
  const clock = typeof now === 'function' ? now() : now;
  const run = {
    site,
    now: clock,
    nowText: clock.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    several: site.languages.length > 1,
    ledger: ledger === null ? emptyLedger() : normalLedger(ledger),
    changes,
    images: heldFromReviewers(images, changes),
    adminHost,
    reader,
    components,
    preview: new Set(preview),
    refused: new Map(),
    warnings: [],
    refusals: [],
    source: readSource(files, site),
  };
  run.refusals.push(...run.source.refusals);
  readTerms(run);
  readAdminFiles(run);
  holdPostsTaken(run);
  run.posts = new Map(run.source.posts.map((post) => [post.key, post]));
  run.postsById = groupBy(run.source.posts, (post) => post.id);
  for (const post of run.source.posts) stateOf(post, run);
  chooseStartPage(run);
  for (const post of run.source.posts) if (post.on) checkPost(post, run);
  settle(run);
  return assemble(run);
}

const PROTECTED = (path) => path === 'settings.json' || path === 'redirects.json' || path === 'services.json' || (path.startsWith('menus/') && path.endsWith('.json'));

// A Reviewer reads the site and changes nothing in it (ADR 0008): the change a Reviewer was the
// last to make to a source file, whatever its kind, or null.
const reviewersChange = (run, path) => (run.changes?.[path]?.reviewer === true ? run.changes[path] : null);
const reviewerReason = (change, path) => say('refusal.reviewer', { by: change.by ?? say('about.someone'), file: path });

// An original a Reviewer changed is none the site takes: the posts and settings that show it are
// refused, naming it.
const heldFromReviewers = (images, changes) => (path) => (changes?.[path]?.reviewer === true ? { reason: reviewerReason(changes[path], path) } : images(path));

// Why a Reviewer's or a non-Admin's change to one of an Admin's files is refused, or null. A file
// back at what was last accepted is no change, whoever touched it last.
function adminProblem(run, path) {
  const change = run.changes?.[path];
  const reviewer = reviewersChange(run, path);
  if (!change || (change.admin !== false && !reviewer)) return null;
  if (run.source.hashes.get(path) === run.ledger.files[path]) return null;
  if (reviewer) return reviewerReason(reviewer, path);
  return say('refusal.admin-file', { by: change.by ?? say('about.someone'), file: path });
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
  if (source.settings && !source.settings.refused && !isObject(run.settingsSource)) run.refusals.push(named({ file: 'settings.json', reason: say('refusal.setting-shape') }));
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

// A post chosen as a legal page whose source a non-Admin was the last to change, which
// a file back at what was last accepted is not.
function legalChangedBy(post, run) {
  if (!run.chosen.legalPages.includes(post.id)) return null;
  const change = run.changes?.[post.path];
  if (!change || change.admin !== false || post.hash === run.ledger.posts[post.key]?.source) return null;
  return change;
}

// A post's source changed by a Reviewer, which is not back at what was last accepted: the
// change, or null.
function reviewersPost(post, run) {
  const change = reviewersChange(run, post.path);
  if (!change || post.hash === run.ledger.posts[post.key]?.source) return null;
  return change;
}

// A post on the site whose source file a Reviewer took away, or a non-Admin where it is a legal
// page, is held like any other change of theirs: what it stands on comes from the ledger, as it
// does for every refused post. An Admin who wants a legal page gone chooses another page
// first, which frees it.
function holdPostsTaken(run) {
  const { source, ledger, site } = run;
  const present = new Set(source.posts.map((post) => post.key));
  for (const [key, entry] of Object.entries(ledger.posts)) {
    const id = key.split('/').at(-1);
    if (!entry.path || present.has(key)) continue;
    // Its file is in its type's collection's folder, or, the start page's, named by its type.
    const type = Object.values(site.types).find((one) => entry.path === startFile(one) || one.collection === entry.path.split('/')[0]);
    if (!type) continue;
    const path = `${type.collection}/${key}.md`;
    const legal = run.chosen.legalPages.includes(id) && run.changes?.[path]?.admin === false;
    if (!legal && !reviewersChange(run, path)) continue;
    const tag = key.includes('/') ? key.split('/')[0] : null;
    source.posts.push({ key, id, tag, language: tag ? site.languages.find((one) => one.tag === tag) ?? null : site.languages[0] ?? null, type, path, hash: null, fields: {}, body: '', bodyLine: 1, title: entry.title, gone: true });
  }
  source.posts.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

// Whether a post is on the site's way: published, its date come, or shown by a live preview
// whatever its status and moment. A draft is otherwise nobody's business but its editor's,
// and is not checked.
function stateOf(post, run) {
  ownStateOf(post, run);
  if (post.on || !run.preview.has(post.path)) return;
  // On the preview alone, where it yields to every post on its own way, as it would once
  // published.
  post.on = true;
  post.forPreview = true;
  post.notFound = run.chosen.notFound === post.id;
  if (run.several && post.language === null) {
    refuse(run, post, { reason: say('refusal.language-folder', { folder: post.tag ?? say('about.collection-folder') }) });
    post.keepsNothing = true;
  }
}

// Whether a post is on the site's way by its own status and moment.
function ownStateOf(post, run) {
  const { status = DRAFT } = post.fields;
  post.on = false;
  // Nothing a Reviewer changed goes on the site, and nothing they took away leaves it, so this
  // comes first of all.
  const reviewer = reviewersPost(post, run);
  if (reviewer) {
    post.on = true;
    post.held = true;
    post.notFound = run.chosen.notFound === post.id;
    refuse(run, post, { reason: reviewerReason(reviewer, post.path) });
    return;
  }
  if (post.unreadable) {
    post.on = true;
    refuse(run, post, { reason: post.unreadable.reason, line: post.unreadable.line });
    return;
  }
  // A legal page on the site stays until an Admin says otherwise, so this comes before
  // anything that would take it off: a draft's status, a date ahead, a file gone.
  const taking = run.ledger.posts[post.key]?.path ? legalChangedBy(post, run) : null;
  if (taking) {
    post.on = true;
    post.notFound = run.chosen.notFound === post.id;
    refuse(run, post, { reason: say(post.gone ? 'refusal.admin-legal-gone' : 'refusal.admin-legal', { by: taking.by ?? say('about.someone') }) });
    return;
  }
  if (status === DRAFT || status === null) return;
  if (status !== PUBLISHED && status !== SCHEDULED) {
    post.on = true;
    refuse(run, post, { field: 'status', reason: say('refusal.status', { status: String(status) }) });
    return;
  }
  const date = post.fields.date === undefined || post.fields.date === null || post.fields.date === '' ? undefined : momentOf(post.fields.date);
  if (status === SCHEDULED && !date) {
    post.on = true;
    refuse(run, post, { field: date === null ? 'date' : 'status', reason: date === null ? say('refusal.field-moment', { field: fieldValued(post.type, 'date'), value: String(post.fields.date) }) : say('refusal.scheduled-date') });
    return;
  }
  // A scheduled post seen waiting for its moment is remembered with it, so that it goes
  // live at it with nothing to say. One whose moment had passed when it was first read
  // goes live at once, with that moment as its date, and says so (ADR 0069).
  if (status === SCHEDULED && (new Date(date) > run.now || run.ledger.awaited[post.key] === date)) post.awaited = date;
  if (date && new Date(date) > run.now) {
    post.waiting = date;
    return;
  }
  post.on = true;
  if (status === SCHEDULED && !post.awaited) post.passed = date;
  if (run.several && post.language === null) {
    refuse(run, post, { reason: say('refusal.language-folder', { folder: post.tag ?? say('about.collection-folder') }) });
    post.keepsNothing = true;
    return;
  }
  post.notFound = run.chosen.notFound === post.id;
  const change = legalChangedBy(post, run);
  if (change) refuse(run, post, { reason: say('refusal.admin-legal', { by: change.by ?? say('about.someone') }) });
}

// The start page an Admin chose, which is the site's start page where it is on the site's
// way, of a type with an address: `startPage` on the post. A site in several languages chooses
// none (ADR 0042), and the page for addresses not found, which has no address, is none; the
// settings page says so, as it says of a chosen post that cannot serve, and the site shows its
// own start page.
function chooseStartPage(run) {
  const id = run.chosen.startPage;
  if (id === null) return;
  const warn = (key) => run.warnings.push(named({ file: 'settings.json', setting: `${START_PAGE}.page`, reason: say(key) }));
  if (run.several) return warn('warning.start-page-languages');
  if (id === run.chosen.notFound) return warn('warning.start-page-not-found');
  const post = (run.postsById.get(id) ?? []).find((one) => one.on && !one.keepsNothing);
  if (!post || post.type.address === null) return warn('warning.start-page-none');
  post.startPage = true;
}

// A post's own problems, what no other post can change.
function checkPost(post, run) {
  if (post.unreadable || post.keepsNothing || post.gone || post.held) return;
  if (post.title === null) refuse(run, post, { field: 'title', reason: say('refusal.title-empty') });
  else if (MARKUP.test(post.title)) refuse(run, post, { field: 'title', reason: say('refusal.title-markup') });
  const slug = slugOf(post);
  if (slug.reason) refuse(run, post, { field: 'slug', reason: slug.reason });
  const other = otherAddressesIn(post);
  if (other.reason) refuse(run, post, { field: 'otherAddresses', reason: other.reason });
  const { problems } = fieldsOf(post, contextFor(post, run, ''), {});
  for (const problem of problems) refuse(run, post, problem);
  const hands = handsFor(post, run, '');
  for (const problem of bodyProblems(post, hands)) refuse(run, post, inBody(problem, post));
}

// A post's whole file, with its derived fields, or a body's problems as refusals.
function writePost(post, run) {
  const path = post.place.file;
  const from = climb(path);
  const previous = run.ledger.posts[post.key];
  const taken = previous?.taken ?? run.nowText;
  const context = contextFor(post, run, from);
  const hands = handsFor(post, run, from);
  const { body, problems, warnings, embeds } = writtenBody(post, hands);
  for (const problem of problems) refuse(run, post, inBody(problem, post));
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
  const modified = previous?.published === published ? previous.modified : first ? own ?? taken : run.nowText;
  const finished = lines.map(([key, value]) => [key, value === 'PENDING' ? modified : value]);
  post.written = {
    path,
    contents: fileText(finished, body),
    published,
    modified,
    taken,
    embeds,
    warnings: [
      ...(post.passed ? [{ field: 'date', reason: say('warning.scheduled-passed', { moment: { moment: post.passed } }) }] : []),
      ...warnings.map((warning) => inBody(warning, post)),
      ...fields.warnings,
    ],
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
    for (const post of rest) refuse(run, post, { reason: say('refusal.set-twice', { holder: first.title ?? first.id }) });
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
  // What an earlier round wrote of a post refused in a later one is no one's.
  for (const post of run.source.posts) if (run.refused.has(post.key)) delete post.written;
}

function assemble(run) {
  const { source, ledger } = run;
  run.warnings.push(...run.roundWarnings);
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
  termFiles(run, files);
  let settings = { refused: true, masters: new Map(), values: null };
  if (!run.settingsRefused) settings = settingsFiles(run, files);
  for (const [path, contents] of settings.masters) masters.set(path, contents);
  if (settings.refused) for (const path of ledger.settingsMedia) keep.add(path);
  menuFiles(run, files);
  redirectsFile(run, files);
  consentFile(run, files, settings, embeds);
  // Warnings of a post that is live, in the order of its blocks.
  for (const post of source.posts) {
    if (run.refused.has(post.key) || !post.written) continue;
    for (const warning of post.written.warnings) run.warnings.push(ofPost(post, warning));
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
    posts: source.posts.filter((post) => !post.gone).map((post) => ({
      file: post.path,
      id: post.id,
      type: post.type.name,
      title: post.title ?? post.id,
      state: run.refused.has(post.key) ? 'refused' : post.written ? 'live' : post.waiting ? 'waiting' : 'off',
      status: STATUSES.has(post.fields.status) ? post.fields.status : DRAFT,
      at: post.waiting ?? null,
      address: updated.posts[post.key]?.address ?? null,
      shown: Boolean(updated.posts[post.key]?.path),
      ...(run.refused.has(post.key) ? { wanted: addressWanted(post, run) } : {}),
      // The post the 404 page is written from, by its content file, in its language.
      ...(post.written?.notFound ? { notFound: post.written.path } : {}),
    })),
    termPages: [...(run.termPages ?? [])].map(([key, address]) => ({ file: run.terms.get(key).file, title: run.terms.get(key).label, address })),
    next,
  };
}

export { deletion } from './guard.js';
