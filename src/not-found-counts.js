// The counts of the log of addresses not found (ADR 0040), as one file holds them, whoever keeps
// them: the service online, from the web server's log, and Astro's dev server on a local site:
//
//   {"addresses": {"<path>": {"count": <requests>, "last": <unix time>}}}
//
// with `"hidden": true` on an address an Admin hid, and whatever else the one keeping them keeps
// there beside. An address is a path as the browser sent it, without its query, of at most 300
// characters and never below /_konzilo/; it is kept 30 days after it was last asked for, and of
// more than 5,000 the least recently asked go first. Nothing else of a request is ever kept.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Seconds an address is kept after it was last asked for. */
export const KEPT = 30 * 86400;

/** The most addresses the counts keep. */
export const ADDRESSES = 5000;

/** The longest path counted, as the browser sent it. */
export const PATH_LIMIT = 300;

/** The address a request counts under, or null for one not counted. */
export function countedPath(target) {
  if (typeof target !== 'string') return null;
  const path = target.split('?', 1)[0];
  if (!path.startsWith('/') || path.length > PATH_LIMIT) return null;
  if (path === '/_konzilo' || path.startsWith('/_konzilo/')) return null;
  return path;
}

/** What a file holds: { addresses, ...the rest }, its counts without what is no entry. */
export function readCountsFile(file) {
  let given;
  try {
    given = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { addresses: {} };
  }
  if (given === null || typeof given !== 'object' || Array.isArray(given)) return { addresses: {} };
  const { addresses, ...rest } = given;
  const counts = {};
  if (addresses !== null && typeof addresses === 'object' && !Array.isArray(addresses)) {
    for (const [path, entry] of Object.entries(addresses)) {
      if (countedPath(path) !== path || entry === null || typeof entry !== 'object') continue;
      const { count, last } = entry;
      if (!Number.isInteger(count) || count < 1 || !Number.isInteger(last)) continue;
      counts[path] = { count, last, ...(entry.hidden === true ? { hidden: true } : {}) };
    }
  }
  return { ...rest, addresses: counts };
}

/** The counts a file holds, without what is no entry. */
export const readCounts = (file) => readCountsFile(file).addresses;

/** The counts without the addresses last asked for over 30 days ago, and the least recent of more than 5,000. */
export function kept(counts, now) {
  const left = Object.entries(counts).filter(([, entry]) => now - entry.last <= KEPT);
  left.sort(([a, x], [b, y]) => x.last - y.last || (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(left.slice(Math.max(0, left.length - ADDRESSES)));
}

/** The counts, and what else `rest` holds, written whole in place of the file's, so that no reader ever reads half of them. */
export function writeCounts(file, counts, rest = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const next = `${file}.konzilo-new`;
  writeFileSync(next, `${JSON.stringify({ ...rest, addresses: counts })}\n`, { mode: 0o600 });
  renameSync(next, file);
}

// An address with and without its last slash is one, as a rule's source is, and so is one with
// its characters percent-encoded and as they are.
const keyOf = (path) => {
  let plain = path;
  try {
    plain = decodeURI(path);
  } catch {
    // Not encoded as a browser encodes, so as it stands.
  }
  return plain.length > 1 && plain.endsWith('/') ? plain.slice(0, -1) : plain;
};

/**
 * Takes `addresses` out of the counts in `file`, each with and without its last slash, as a purge
 * does with a post's addresses, so that nothing on the page says it was ever asked for. Gives how
 * many entries went.
 */
export function forgetAddresses(file, addresses) {
  const gone = new Set([...addresses].filter((address) => typeof address === 'string').map(keyOf));
  const { addresses: counts, ...rest } = readCountsFile(file);
  const left = Object.fromEntries(Object.entries(counts).filter(([path]) => !gone.has(keyOf(path))));
  const forgotten = Object.keys(counts).length - Object.keys(left).length;
  if (forgotten > 0) writeCounts(file, left, rest);
  return forgotten;
}
