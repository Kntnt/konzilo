// The log of addresses not found on a local site. Online the web server writes
// the public host's 404 answers to a log of the site's own, with the time and
// the path alone, which the service folds into the site's counts
// (src/service/not-found.js). Locally Astro's dev server keeps the same counts
// itself, in the file KONZILO_NOT_FOUND names, in the same form
// (src/not-found-counts.js). It counts each 404 the
// dev server answers to a GET or a HEAD, by the path as the browser sent it
// without its query, but below /_konzilo/ and at a path of over 300
// characters; it keeps nothing else of the request. An address goes 30 days
// after it was last asked for, and once the dev server answers it with
// anything but an error, as a post or a rule now holds it; of more than 5,000,
// the least recently asked go first.

import { statSync } from 'node:fs';

import { countedPath, kept, readCounts, writeCounts } from '../not-found-counts.js';

export { ADDRESSES, KEPT, PATH_LIMIT, countedPath } from '../not-found-counts.js';

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
