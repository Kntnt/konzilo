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
import { blobsOf, BRANCH, purgeHistories, PurgeRefusal } from './histories.js';

export { PurgeRefusal };

const LEDGER = '.post-ids.json';

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

// What goes of the entry from both repositories, as purgeHistories() takes it: the rules each
// history is rewritten by, the files and LFS objects that go, and the addresses it had.
async function entryPlan({ source, content, entry, before }) {
  const id = idOf(entry.path);
  const tag = tagOf(entry.path);
  const plan = await sourcePlan(source.git, entry);
  const ledger = before.content === null ? { key: id, paths: new Set(), addresses: new Set() } : await ledgerPlan(content.git, entry);
  const addresses = new Set([...plan.addresses, ...ledger.addresses]);

  // An Admin's file's new hash by its old, which the content's ledger names.
  const files = new Map();
  const sourceRules = {
    drop: (path) => plan.drop.has(path),
    change: async (path, bytes) => {
      if (path !== REDIRECTS_FILE) return null;
      const made = rulesWithout(bytes, { id, kind: entry.kind, addresses });
      if (made !== null) files.set(sha256(bytes), sha256(Buffer.from(made)));
      return made;
    },
  };

  // The content repository: the entry's files where its ledger says they are its, a term's by
  // its slug where no other term of the source the commit publishes has it, and the masters made
  // of an original that goes; its ledgers and its rules without it.
  const ledgers = new Map();
  const ledgerAt = async (at) => {
    if (!ledgers.has(at.commit)) ledgers.set(at.commit, at.read(LEDGER).then((bytes) => (bytes === null ? null : readJson(bytes))));
    return ledgers.get(at.commit);
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
  const contentRules = ({ published }) => ({
    drop: async (path, at) => {
      if (masters?.test(path)) return true;
      if (entry.kind === 'post' && ledger.paths.has(path)) return (await ledgerAt(at))?.posts?.[ledger.key]?.path === path;
      if (entry.kind === 'term' && termPaths.has(path)) {
        const commit = published(at.message);
        return commit === null || !await otherTermsHave(commit, path.slice(termFolder.length, -'.json'.length));
      }
      return false;
    },
    change: (path, bytes) => {
      if (path === LEDGER) return ledgerWithout(bytes, { kind: entry.kind, key: ledger.key, id, files });
      if (path === REDIRECTS_FILE) return rulesWithout(bytes, { id, kind: entry.kind, addresses });
      return null;
    },
  });
  return { source: sourceRules, content: contentRules, outcome: { paths: [...plan.drop, ...ledger.paths], originals: plan.originals, addresses: [...addresses] } };
}

// Purges `entry`, { path, kind, collection }, `kind` one of `post`, `term` and `image`, as `by`,
// { login, name }, at `at`, as purgeHistories() does, which takes `tries`, `sleep` and `noted`.
// Gives { source, content, record, outcome, paths, originals, addresses }, the first four as
// purgeHistories() gives them, and in `outcome` and beside it `paths`, the files that went, of
// both repositories, `originals`, the LFS objects, { oid, size }, that no commit names now, and
// `addresses`, those the entry had, as rules match them, which the counts of addresses not found
// then forget (ADR 0040). Throws a PurgeRefusal where the entry is not to be purged.
export async function purgeEntry({ source, content, entry, by, at, pushedBy, tries, sleep, noted }) {
  const result = await purgeHistories({
    source,
    content,
    by,
    at,
    pushedBy,
    tries,
    sleep,
    noted,
    plan: ({ before }) => entryPlan({ source, content, entry, before }),
  });
  return { ...result, ...result.outcome };
}
