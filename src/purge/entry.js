// A purge of a deleted post, term or image library entry (ADR 0078): every revision of its source
// file goes from the source repository's history, and every content file the builds made from it
// from the content repository's, with the rules that led to it or from or to an address it had
// (ADR 0036), and, for an image library entry, its original, unless another entry or a file in the
// current source names the same one (ADR 0055), with the masters made of it. Each save after the
// oldest one rewritten gets a new identity: the content repository's commits name the source
// commit they publish by its new one, and the record of purges (record.js) names the push that
// brought each save as it was.
//
// It works on two clones it is handed, each a bare repository whose `origin` is Forgejo's, and
// pushes what it made with a lease on what it read, so that a save that came meanwhile turns the
// push away and the purge starts again from what is there now, and nothing of that save is lost.

import { createHash } from 'node:crypto';

import { parse as parseYaml } from 'yaml';

import { IMAGE_LIBRARY_FOLDER, MEDIA_FOLDER } from '../format/masters.js';
import { keyOf, REDIRECTS_FILE } from '../format/redirects.js';
import { slugFrom } from '../intake/post-file.js';
import { PURGES_BRANCH, PURGES_FILE, purgeRecord, recordFile } from './record.js';
import { rewriteHistory } from './rewrite.js';

const BRANCH = 'main';
const LEDGER = '.post-ids.json';
const IDENTITY = ['-c', 'user.name=Konzilo', '-c', 'user.email=konzilo@localhost.invalid'];
// A save that comes while a purge runs makes it start again, this many times at most.
const TRIES = 4;

// Why a purge is not made: `not-deleted`, the entry is in the source as it stands, and
// `not-found`, no commit of its history holds it.
export class PurgeRefusal extends Error {
  constructor(reason) {
    super(`the purge is refused: ${reason}`);
    this.reason = reason;
  }
}

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const readJson = (bytes) => {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    return null;
  }
};
const text = async (git, args, options) => (await git(args, options)).toString('utf8');

// The ID of the entry a source file is, and the language its folder names, or null.
const idOf = (path) => path.split('/').at(-1).replace(/\.[^.]*$/, '');
const tagOf = (path) => (path.split('/').length === 3 ? path.split('/')[1] : null);

// Each version a file has had on the branch, by its blob, oldest last.
async function versionsOf(git, path) {
  const raw = await text(git, ['log', '--format=', '--raw', '--no-abbrev', '--no-renames', BRANCH, '--', path]);
  return [...new Set(raw.split('\n').filter((line) => line.startsWith(':')).map((line) => line.split(/\s+/)[3]).filter((sha) => !/^0+$/.test(sha)))];
}

// Each version of every file below a folder on the branch, but `except`: [path, blob].
async function versionsBelow(git, folder, except) {
  const raw = await text(git, ['log', '--format=', '--raw', '--no-abbrev', '--no-renames', BRANCH, '--', `${folder}/`]);
  const found = new Map();
  for (const line of raw.split('\n').filter((one) => one.startsWith(':'))) {
    const [about, path] = line.split('\t');
    const blob = about.split(/\s+/)[3];
    if (path !== except && !/^0+$/.test(blob)) found.set(blob, path);
  }
  return [...found].map(([blob, path]) => [path, blob]);
}

// The bytes of each blob, by one `cat-file --batch`.
async function blobsOf(git, shas) {
  const found = new Map();
  if (shas.length === 0) return found;
  const out = await git(['cat-file', '--batch'], { input: `${shas.join('\n')}\n` });
  let at = 0;
  while (at < out.length) {
    const end = out.indexOf(10, at);
    const [sha, kind, size] = out.subarray(at, end).toString('utf8').split(' ');
    at = end + 1;
    if (kind === 'missing') continue;
    found.set(sha, out.subarray(at, at + Number(size)));
    at += Number(size) + 1;
  }
  return found;
}

const exists = async (git, object) => {
  try {
    await git(['cat-file', '-e', object]);
    return true;
  } catch {
    return false;
  }
};

// The original a library entry names, as its path in the source, or null (ADR 0063).
function originalOf(bytes) {
  const src = readJson(bytes)?.src;
  const [, name] = /^\/?media\/([^?#]+)$/.exec(typeof src === 'string' ? src : '') ?? [];
  if (name === undefined) return null;
  try {
    return `${MEDIA_FOLDER}/${decodeURI(name)}`;
  } catch {
    return `${MEDIA_FOLDER}/${name}`;
  }
}

// The LFS object a pointer names, { oid, size }, `oid` its SHA-256, or null.
const objectOf = (bytes) => {
  const text = Buffer.from(bytes).toString('utf8');
  const oid = /^oid sha256:([0-9a-f]{64})$/m.exec(text)?.[1];
  const size = /^size (\d+)$/m.exec(text)?.[1];
  return oid && size ? { oid, size: Number(size) } : null;
};

// The addresses a post's own file gives it beside its own, `otherAddresses`.
function otherAddressesOf(bytes) {
  const [, head] = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---/.exec(Buffer.from(bytes).toString('utf8')) ?? [];
  try {
    const given = parseYaml(head ?? '')?.otherAddresses;
    return Array.isArray(given) ? given.map((one) => one?.address).filter((one) => typeof one === 'string') : [];
  } catch {
    return [];
  }
}

// An address as rules are matched by, or null for one that is no address on the site.
const addressKey = (address) => {
  if (typeof address !== 'string' || !address.startsWith('/') || address.startsWith('//')) return null;
  try {
    return keyOf(address);
  } catch {
    return null;
  }
};

// Whether an original is named by another library entry, in any revision, deleted or not, or by
// a file of the source as it stands, but the entry purged.
async function namedElsewhere(git, original, entry) {
  const name = original.slice(MEDIA_FOLDER.length + 1);
  const forms = [...new Set([`${MEDIA_FOLDER}/${name}`, `${MEDIA_FOLDER}/${encodeURI(name)}`])];
  let current = '';
  try {
    current = await text(git, ['grep', '-F', '-l', ...forms.flatMap((form) => ['-e', form]), BRANCH, '--']);
  } catch {
    current = '';
  }
  if (current.split('\n').some((line) => line !== '' && !line.slice(BRANCH.length + 1).startsWith(`${MEDIA_FOLDER}/`))) return true;
  const others = await versionsBelow(git, IMAGE_LIBRARY_FOLDER, entry);
  const read = await blobsOf(git, others.map(([, blob]) => blob));
  return [...read.values()].some((bytes) => originalOf(bytes) === original);
}

// The rules of a redirects file without those that lead to the entry, `post` or `term` by its ID,
// or come from or lead to one of `addresses`: the file's new text, or null where none goes.
function rulesWithout(bytes, { id, kind, addresses }) {
  const read = readJson(bytes);
  if (!Array.isArray(read?.rules)) return null;
  const leads = (rule) => (kind === 'post' && String(rule?.post ?? '') === id)
    || (kind === 'term' && String(rule?.term ?? '') === id)
    || addresses.has(addressKey(rule?.from))
    || addresses.has(addressKey(rule?.to));
  const kept = read.rules.filter((rule) => !leads(rule));
  return kept.length === read.rules.length ? null : json({ ...read, rules: kept });
}

// What goes from the source: the entry's file, the originals only it names, the addresses its
// own file gave it, and the slugs a term had.
async function sourcePlan(git, entry) {
  const { path, kind } = entry;
  if (await exists(git, `${BRANCH}:${path}`)) throw new PurgeRefusal('not-deleted');
  const versions = await versionsOf(git, path);
  if (versions.length === 0) throw new PurgeRefusal('not-found');
  const read = [...(await blobsOf(git, versions)).values()];
  const drop = new Set([path]);
  const addresses = new Set();
  const slugs = new Set();
  const originals = [];
  if (kind === 'post') for (const bytes of read) for (const address of otherAddressesOf(bytes)) addresses.add(addressKey(address));
  if (kind === 'term') {
    for (const bytes of read) {
      const value = readJson(bytes);
      const slug = typeof value?.slug === 'string' && value.slug !== '' ? value.slug : typeof value?.name === 'string' ? slugFrom(value.name.trim()) : '';
      if (slug !== '') slugs.add(slug);
    }
  }
  if (kind === 'image') {
    for (const original of new Set(read.map(originalOf).filter(Boolean))) {
      if (await namedElsewhere(git, original, path)) continue;
      drop.add(original);
      const pointers = await blobsOf(git, await versionsOf(git, original));
      originals.push(...[...pointers.values()].map(objectOf).filter(Boolean));
    }
  }
  addresses.delete(null);
  return { drop, addresses, slugs, originals: [...new Map(originals.map((one) => [one.oid, one])).values()] };
}

// What the content repository's ledgers say of the entry: the paths of its files and the addresses
// it had, over every revision.
async function ledgerPlan(git, entry) {
  const id = idOf(entry.path);
  const tag = tagOf(entry.path);
  const key = entry.kind === 'post' && tag !== null ? `${tag}/${id}` : id;
  const paths = new Set();
  const addresses = new Set();
  const read = await blobsOf(git, await versionsOf(git, LEDGER));
  for (const bytes of read.values()) {
    const ledger = readJson(bytes);
    const held = entry.kind === 'post' ? ledger?.posts?.[key] : entry.kind === 'term' ? ledger?.terms?.[id] : null;
    if (!held) continue;
    for (const one of [held.path, ...(held.paths ?? [])]) if (typeof one === 'string') paths.add(one);
    for (const one of [held.address, ...(held.addresses ?? [])]) addresses.add(addressKey(one));
  }
  addresses.delete(null);
  return { key, paths, addresses };
}

// The ledger without the entry, and with an Admin's file named by its new version where the
// purge changed it: its new text, or null where nothing changes.
function ledgerWithout(bytes, { kind, key, id, files }) {
  const ledger = readJson(bytes);
  if (ledger === null || typeof ledger !== 'object') return null;
  let changed = false;
  const without = (part, name) => {
    if (ledger[part] && Object.hasOwn(ledger[part], name)) {
      ledger[part] = Object.fromEntries(Object.entries(ledger[part]).filter(([one]) => one !== name));
      changed = true;
    }
  };
  if (kind === 'post') for (const part of ['posts', 'awaited', 'released']) without(part, key);
  if (kind === 'term') without('terms', id);
  for (const [path, hash] of Object.entries(ledger.files ?? {})) {
    if (files.has(hash)) {
      ledger.files[path] = files.get(hash);
      changed = true;
    }
  }
  return changed ? json(ledger) : null;
}

const fetchAll = (git) => git(['fetch', '--quiet', '--force', '--prune', 'origin', '+refs/heads/*:refs/heads/*']);
const headOf = async (git, ref) => {
  try {
    return (await text(git, ['rev-parse', '--verify', '--quiet', `refs/heads/${ref}`])).trim();
  } catch {
    return null;
  }
};

// One attempt, from what the clones hold: the rewrites made in the clones, and what the pushes
// need.
async function attempt({ source, content, entry, by, at, pushedBy }) {
  const id = idOf(entry.path);
  const tag = tagOf(entry.path);
  const before = { source: await headOf(source.git, BRANCH), content: await headOf(content.git, BRANCH), record: await headOf(source.git, PURGES_BRANCH) };
  const plan = await sourcePlan(source.git, entry);
  const ledger = before.content === null ? { key: id, paths: new Set(), addresses: new Set() } : await ledgerPlan(content.git, entry);
  const addresses = new Set([...plan.addresses, ...ledger.addresses]);
  const record = purgeRecord(before.record === null ? null : (await source.git(['show', `${before.record}:${PURGES_FILE}`]).catch(() => null))?.toString('utf8'));
  const oldCommits = (await text(source.git, ['rev-list', BRANCH])).split('\n').filter(Boolean);
  const pushes = await pushedBy(oldCommits.filter((commit) => !Object.hasOwn(record.pushes, commit)));

  // The source, with an Admin's file's new hash by its old, which the content's ledger names.
  const files = new Map();
  const rewritten = await rewriteHistory({
    git: source.git,
    branch: BRANCH,
    drop: (path) => plan.drop.has(path),
    change: async (path, bytes) => {
      if (path !== REDIRECTS_FILE) return null;
      const made = rulesWithout(bytes, { id, kind: entry.kind, addresses });
      if (made !== null) files.set(sha256(bytes), sha256(Buffer.from(made)));
      return made;
    },
  });
  const newCommits = new Set((await text(source.git, ['rev-list', BRANCH])).split('\n').filter(Boolean));
  const shortly = new Map(oldCommits.map((commit) => [commit.slice(0, 12), rewritten.renamed.get(commit)?.slice(0, 12) ?? null]));

  // Who pushed each save as it was, by its new identity; a save that kept its own keeps what the
  // record held of it.
  const carried = {};
  for (const commit of oldCommits) {
    const now = rewritten.renamed.get(commit);
    if (rewritten.gone.has(commit) || now === null || !newCommits.has(now)) continue;
    const pusher = Object.hasOwn(record.pushes, commit) ? record.pushes[commit] : pushes[commit] ?? null;
    if (now !== commit || Object.hasOwn(record.pushes, commit)) carried[now] = pusher;
  }
  const noted = { purges: [...record.purges, { at, by: { login: by.login, name: by.name ?? by.login } }], pushes: carried };
  const blob = (await text(source.git, ['hash-object', '-w', '--stdin'], { input: recordFile(noted) })).trim();
  const tree = (await text(source.git, ['mktree'], { input: `100644 blob ${blob}\t${PURGES_FILE}\n` })).trim();
  const noteCommit = (await text(source.git, [...IDENTITY, 'commit-tree', tree, ...(before.record ? ['-p', before.record] : []), '-m', `Purge by ${by.login}`])).trim();

  // The content repository: the entry's files where its ledger says they are its, a term's by
  // its slug where no other term of the source the commit publishes has it, and the masters made
  // of an original that goes; its ledgers and its rules without it.
  const ledgers = new Map();
  const ledgerAt = async (at2) => {
    if (!ledgers.has(at2.commit)) ledgers.set(at2.commit, at2.read(LEDGER).then((bytes) => (bytes === null ? null : readJson(bytes))));
    return ledgers.get(at2.commit);
  };
  const masters = plan.originals.length === 0 ? null : new RegExp(`^${MEDIA_FOLDER}/.+-(?:${plan.originals.map(({ oid }) => oid.slice(0, 10)).join('|')})\\.(?:webp|svg)$`);
  const termFolder = `${entry.collection}/${tag === null ? '' : `${tag}/`}`;
  const termPaths = new Set([...plan.slugs].map((slug) => `${termFolder}${slug}.json`));
  const slugsAt = new Map();
  const otherTermsHave = async (commit, slug) => {
    if (!slugsAt.has(commit)) {
      slugsAt.set(commit, (async () => {
        const listed = (await text(source.git, ['ls-tree', '--name-only', commit, '--', termFolder]).catch(() => '')).split('\n').filter((one) => one.endsWith('.json') && one !== entry.path);
        const read = await blobsOf(source.git, listed.map((one) => `${commit}:${one}`));
        return new Set([...read.values()].map((bytes) => {
          const value = readJson(bytes);
          return typeof value?.slug === 'string' && value.slug !== '' ? value.slug : typeof value?.name === 'string' ? slugFrom(value.name.trim()) : '';
        }));
      })());
    }
    return (await slugsAt.get(commit)).has(slug);
  };
  const published = (message) => {
    const prefix = /^Publish ([0-9a-f]{12})\b/.exec(message)?.[1];
    return prefix === undefined ? null : oldCommits.find((commit) => commit.startsWith(prefix)) ?? null;
  };
  let contentHead = null;
  if (before.content !== null) {
    const done = await rewriteHistory({
      git: content.git,
      branch: BRANCH,
      drop: async (path, at2) => {
        if (masters?.test(path)) return true;
        if (entry.kind === 'post' && ledger.paths.has(path)) return (await ledgerAt(at2))?.posts?.[ledger.key]?.path === path;
        if (entry.kind === 'term' && termPaths.has(path)) {
          const commit = published(at2.message);
          return commit === null || !await otherTermsHave(commit, path.slice(termFolder.length, -'.json'.length));
        }
        return false;
      },
      change: (path, bytes) => {
        if (path === LEDGER) return ledgerWithout(bytes, { kind: entry.kind, key: ledger.key, id, files });
        if (path === REDIRECTS_FILE) return rulesWithout(bytes, { id, kind: entry.kind, addresses });
        return null;
      },
      message: (said) => said.replace(/^Publish ([0-9a-f]{12})\b/, (whole, prefix) => (shortly.get(prefix) ? `Publish ${shortly.get(prefix)}` : whole)),
    });
    contentHead = done.head;
  }
  return { before, source: rewritten, contentHead, noteCommit, paths: [...plan.drop, ...ledger.paths], originals: plan.originals, record: noted };
}

// Purges `entry`, { path, kind, collection }, `kind` one of `post`, `term` and `image`, as `by`,
// { login, name }, at `at`. `source` and `content`: { git }, each a bare clone whose `origin` is
// the repository. `pushedBy(commits)`: who pushed each commit as Forgejo's feed has it, { [sha]:
// { login, name, at } }, a commit it has none of left out. Gives { source: { before, after,
// renamed, gone, dropped }, content: { before, after }, paths, originals, record }, `gone` the
// source commits that are no more, `dropped` those of them that held nothing else, `paths` the
// files that went, of both repositories, and `originals` the LFS objects, { oid, size }, that no
// commit names now.
// Throws a PurgeRefusal where the entry is not to be purged.
export async function purgeEntry({ source, content, entry, by, at, pushedBy, tries = TRIES }) {
  for (let tried = 1; ; tried += 1) {
    await fetchAll(source.git);
    await fetchAll(content.git).catch(() => {});
    const made = await attempt({ source, content, entry, by, at, pushedBy });
    const { before } = made;
    try {
      await source.git(['push', '--quiet', '--atomic', 'origin',
        `--force-with-lease=refs/heads/${BRANCH}:${before.source}`,
        `--force-with-lease=refs/heads/${PURGES_BRANCH}:${before.record ?? ''}`,
        `refs/heads/${BRANCH}:refs/heads/${BRANCH}`,
        `${made.noteCommit}:refs/heads/${PURGES_BRANCH}`]);
    } catch (error) {
      if (tried >= tries) throw error;
      continue;
    }
    if (made.contentHead !== null && made.contentHead !== before.content) {
      for (let pushed = 1; ; pushed += 1) {
        try {
          await content.git(['push', '--quiet', 'origin', `--force-with-lease=refs/heads/${BRANCH}:${before.content}`, `refs/heads/${BRANCH}:refs/heads/${BRANCH}`]);
          break;
        } catch (error) {
          if (pushed >= tries) throw error;
          await new Promise((go) => setTimeout(go, 1000 * pushed));
        }
      }
    }
    return {
      source: { before: before.source, after: made.source.head, renamed: made.source.renamed, gone: [...made.source.renamed.keys()].filter((commit) => made.source.renamed.get(commit) !== commit), dropped: [...made.source.gone] },
      content: { before: before.content, after: made.contentHead },
      paths: made.paths,
      originals: made.originals,
      record: made.record,
    };
  }
}
