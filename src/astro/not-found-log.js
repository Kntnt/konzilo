// The log of addresses not found on a local site. Online the web server writes
// the public host's 404 answers to a log of the site's own, with the time and
// the path alone, which the hosting folds into the site's counts. Locally
// Astro's dev server keeps the same counts itself, in the file KONZILO_NOT_FOUND
// names:
//
//   {"addresses": {"<path>": {"count": <requests>, "last": <unix time>}}}
//
// with `"hidden": true` on an address an Admin hid. It counts each 404 the
// dev server answers to a GET or a HEAD, by the path as the browser sent it
// without its query, but below /_konzilo/ and at a path of over 300
// characters; it keeps nothing else of the request. An address goes 30 days
// after it was last asked for, and once the dev server answers it with
// anything but an error, as a post or a rule now holds it; of more than 5,000,
// the least recently asked go first.

import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';

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

/** The counts a file holds, without what is no entry. */
function readCounts(file) {
  let addresses;
  try {
    addresses = JSON.parse(readFileSync(file, 'utf8')).addresses;
  } catch {
    return {};
  }
  const counts = {};
  if (addresses === null || typeof addresses !== 'object' || Array.isArray(addresses)) return counts;
  for (const [path, entry] of Object.entries(addresses)) {
    if (countedPath(path) !== path || entry === null || typeof entry !== 'object') continue;
    const { count, last } = entry;
    if (!Number.isInteger(count) || count < 1 || !Number.isInteger(last)) continue;
    counts[path] = { count, last, ...(entry.hidden === true ? { hidden: true } : {}) };
  }
  return counts;
}

/** The counts without the addresses last asked for over 30 days ago, and the least recent of more than 5,000. */
function kept(counts, now) {
  const left = Object.entries(counts).filter(([, entry]) => now - entry.last <= KEPT);
  left.sort(([a, x], [b, y]) => x.last - y.last || (a < b ? -1 : a > b ? 1 : 0));
  return Object.fromEntries(left.slice(Math.max(0, left.length - ADDRESSES)));
}

/** The counts written whole in place of the file's, so that no reader ever reads half of them. */
function writeCounts(file, counts) {
  const next = `${file}.konzilo-new`;
  writeFileSync(next, `${JSON.stringify({ addresses: counts })}\n`, { mode: 0o600 });
  renameSync(next, file);
}

/**
 * The dev server's step that keeps the counts: after each answer to a GET
 * or a HEAD, a 404 counts its address, and any answer but an error lets it
 * go. `file`: where the counts are, none without it; `now`: the clock, in
 * seconds.
 */
export function devNotFoundLog({ file = process.env.KONZILO_NOT_FOUND, now = () => Math.floor(Date.now() / 1000) } = {}) {
  // The counts as last read, by the file's time and size: the dev server
  // answers every module a page loads, and reads the file again only when
  // it changed.
  let read = { stamp: null, counts: {} };
  const load = () => {
    let stamp;
    try {
      const status = statSync(file);
      stamp = `${status.mtimeMs}:${status.size}`;
    } catch {
      stamp = 'none';
    }
    if (stamp !== read.stamp) read = { stamp, counts: stamp === 'none' ? {} : readCounts(file) };
    return read.counts;
  };
  return (request, response, next) => {
    const path = request.method === 'GET' || request.method === 'HEAD' ? countedPath(request.originalUrl ?? request.url) : null;
    if (file && path !== null) {
      response.on('finish', () => {
        const status = response.statusCode;
        if (status !== 404 && status >= 400 && status !== 410) return;
        try {
          if (status !== 404 && !(path in load())) return;
          const counts = readCounts(file);
          if (status === 404) {
            const known = counts[path] ?? { count: 0, last: 0 };
            counts[path] = { ...known, count: known.count + 1, last: Math.max(known.last, now()) };
          } else if (path in counts) {
            delete counts[path];
          } else {
            return;
          }
          writeCounts(file, kept(counts, now()));
        } catch {
          // The counts never stand in the way of an answer.
        }
      });
    }
    next();
  };
}
