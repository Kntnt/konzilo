// The log of addresses not found online (ADR 0040), as the service keeps it. The web server
// writes a line to its log for each 404 it answers a GET or a HEAD at a public address, of a
// path of at most 300 characters and none below /_konzilo/, holding the time and the path as the
// browser sent it without its query, and nothing else, `{"ts":<seconds>,"path":"<path>"}`; it
// rolls the file over to one older file beside it once it is large. The service folds those
// lines into its counts (src/not-found-counts.js), in a file of its own that no backup or
// archive holds, every five minutes and as an Admin opens the page: each line once, by where it
// last stopped reading, its file known by its inode, which a roll keeps.
//
// At each fold an address goes 30 days after it was last asked for, and once the release answers
// it otherwise: a file of the release holds it, or a rule of the release answers it with anything
// but 404. Of more than 5,000 the least recently asked go first. The page, *Addresses not found*,
// lists what is left, most asked first, but what an Admin hid, which goes on being counted, and
// what a rule holds, the release's or one in the source's `redirects.json`, which the Admin's
// save of a rule writes, so that the address leaves the page at once.

import { closeSync, fstatSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

import { compilePattern, isPattern } from '../format/patterns.js';
import { isSource, matcher, STATUSES } from '../format/redirects.js';
import { countedPath, forgetAddresses, kept, readCountsFile, writeCounts } from '../not-found-counts.js';

/** The web server's log, in the folder it writes it in; a roll leaves the older one beside it. */
export const LOG_FILE = 'not-found.log';
const ROLLED = /^not-found-.*\.log$/;

// The most of one file a fold reads, which is more than the web server writes before a roll.
const READ_AT_MOST = 64 * 1024 * 1024;

// A file's identity, which a roll keeps and a new file has another of.
const identityOf = (status) => `${status.dev}:${status.ino}`;

const statOf = (path) => {
  try {
    return statSync(path);
  } catch {
    return null;
  }
};

// The bytes of `path` from `from`, to the end of its last whole line: { text, next }, `next`
// where the next read starts.
function linesOf(path, from) {
  let descriptor;
  try {
    descriptor = openSync(path, 'r');
  } catch {
    return { text: '', next: from };
  }
  try {
    const size = Math.min(fstatSync(descriptor).size - from, READ_AT_MOST);
    if (size <= 0) return { text: '', next: from };
    const bytes = Buffer.alloc(size);
    const read = readSync(descriptor, bytes, 0, size, from);
    const end = bytes.subarray(0, read).lastIndexOf(0x0a) + 1;
    return { text: bytes.subarray(0, end).toString('utf8'), next: from + end };
  } finally {
    closeSync(descriptor);
  }
}

// What a line of the log says: { path, at }, or null for one that says nothing counted.
function lineOf(line) {
  let given;
  try {
    given = JSON.parse(line);
  } catch {
    return null;
  }
  if (given === null || typeof given !== 'object') return null;
  const path = countedPath(given.path);
  if (path === null || path !== given.path || typeof given.ts !== 'number' || !Number.isFinite(given.ts)) return null;
  return { path, at: Math.floor(given.ts) };
}

// A rule's status as a number, from a source file, which may hold it as text, or 301 where it
// holds none, as the intake reads it.
const statusOf = (rule) => {
  const status = /^\d+$/.test(String(rule.status)) ? Number(rule.status) : rule.status ?? 301;
  return STATUSES.includes(status) ? status : null;
};

/**
 * Which rule of `rules` holds an address, as a path the browser sent: `holding(path)` gives it,
 * { status }, or undefined. Each rule is { from, status }, or { pattern, status }, or { from }
 * that begins with `^`, as the source and `_redirects` hold them; one the site cannot read holds
 * nothing. An exact rule holds its path, and a source that ends in a slash the path without it
 * too; one with a query holds no path alone. A pattern holds every path it matches.
 */
export function rulesHolding(rules) {
  const exact = [];
  const patterns = [];
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule === null || typeof rule !== 'object') continue;
    const status = statusOf(rule);
    const source = rule.pattern ?? rule.from;
    if (status === null || typeof source !== 'string') continue;
    if (isPattern(source)) {
      const expression = compilePattern(source);
      if (expression !== null) patterns.push({ expression, status });
    } else if (isSource(source)) exact.push({ from: source, status });
  }
  const exactly = matcher(exact);
  return (path) => {
    const rule = isSource(path) ? exactly.answer(path, null) : undefined;
    if (rule) return rule;
    if (path === '/_konzilo' || path.startsWith('/_konzilo/')) return undefined;
    return patterns.find(({ expression }) => expression.test(path));
  };
}

// The rules of `_redirects`, as a build writes it: `<source> <target> <status>` or
// `<source> <status>`, a pattern's source beginning with `^`.
export function redirectsRules(text) {
  return String(text).split('\n').map((line) => line.split(' ')).filter((parts) => parts.length === 2 || parts.length === 3).map((parts) => ({ from: parts[0], status: parts.at(-1) }));
}

// Whether a file of the release's pages holds a path, as the web server answers it: the file at
// the path, or a folder's index page or feed there. A path that would lead outside the pages holds
// nothing.
function fileHolding(pages, path) {
  let plain;
  try {
    plain = decodeURIComponent(path);
  } catch {
    return false;
  }
  if (plain.includes('\0') || plain.split('/').some((segment) => segment === '..' || segment === '.')) return false;
  const at = resolve(pages, `.${plain}`);
  const inside = relative(pages, at);
  if (inside.startsWith('..') || inside.split(sep).includes('..')) return false;
  const status = statOf(at);
  if (status === null) return false;
  if (status.isFile()) return true;
  return status.isDirectory() && ['index.html', 'index.rss'].some((index) => statOf(join(at, index))?.isFile());
}

/**
 * The log of addresses not found. `log`: the folder the web server writes its log in. `counts`:
 * the file the counts are kept in. `release`: the release visitors get, its pages in `pages`.
 * `now`: the clock, in seconds.
 */
export function notFoundLog({ log, counts, release, now = () => Math.floor(Date.now() / 1000) }) {
  // The lines written since the last fold, from where it stopped, in the file it stopped in, which
  // a roll may have moved beside the one written now: { lines, position }.
  const unread = (position) => {
    const current = join(log, LOG_FILE);
    const status = statOf(current);
    if (status === null) return { lines: [], position };
    const here = identityOf(status);
    const texts = [];
    let from = 0;
    if (position?.file === here) {
      from = status.size < position.at ? 0 : position.at;
    } else if (position) {
      const rolled = readdirSync(log).filter((name) => ROLLED.test(name)).find((name) => {
        const other = statOf(join(log, name));
        return other !== null && identityOf(other) === position.file;
      });
      if (rolled) texts.push(linesOf(join(log, rolled), position.at).text);
    }
    const read = linesOf(current, from);
    texts.push(read.text);
    return { lines: texts.join('').split('\n').filter((line) => line !== ''), position: { file: here, at: read.next } };
  };

  // The rules of the release, from its `_redirects`, which the build keeps beside its pages.
  const releaseRules = () => {
    try {
      return redirectsRules(readFileSync(join(release, '_redirects'), 'utf8'));
    } catch {
      return [];
    }
  };

  // Folds the lines written since the last fold into the counts, and lets go what is kept no
  // longer: an address the release answers, by a file or a rule's answer but 404.
  const fold = () => {
    const { addresses, log: position, ...rest } = readCountsFile(counts);
    const { lines, position: next } = unread(position);
    for (const line of lines) {
      const asked = lineOf(line);
      if (asked === null) continue;
      const known = addresses[asked.path] ?? { count: 0, last: 0 };
      addresses[asked.path] = { ...known, count: known.count + 1, last: Math.max(known.last, asked.at) };
    }
    const pages = join(release, 'pages');
    const holding = rulesHolding(releaseRules());
    for (const path of Object.keys(addresses)) {
      if (fileHolding(pages, path) || (holding(path) && holding(path).status !== 404)) delete addresses[path];
    }
    const left = kept(addresses, now());
    writeCounts(counts, left, { ...rest, ...(next ? { log: next } : {}) });
    return left;
  };

  return {
    /** Folds what the web server has written since the last fold into the counts. */
    fold,

    /**
     * The addresses the page shows, after a fold: each { address, count, last }, `last` the moment
     * it was last asked for, most asked first, but those an Admin hid and those a rule holds, of
     * the release or of the source, `sourceRules`, as its `redirects.json` lists them.
     */
    listed({ sourceRules = [] } = {}) {
      const left = fold();
      const byRelease = rulesHolding(releaseRules());
      const bySource = rulesHolding(sourceRules);
      return Object.entries(left)
        .filter(([path, entry]) => !entry.hidden && !byRelease(path) && !bySource(path))
        .sort(([a, x], [b, y]) => y.count - x.count || y.last - x.last || (a < b ? -1 : a > b ? 1 : 0))
        .map(([address, { count, last }]) => ({ address, count, last: new Date(last * 1000).toISOString() }));
    },

    /** Takes an address off the page, while it goes on being counted, after a fold. Whether it was counted. */
    hide(address) {
      fold();
      const { addresses, ...rest } = readCountsFile(counts);
      if (!Object.hasOwn(addresses, address)) return false;
      addresses[address] = { ...addresses[address], hidden: true };
      writeCounts(counts, addresses, rest);
      return true;
    },

    /**
     * Takes addresses out of the counts, each with and without its last slash, as a purge does,
     * after a fold, so that nothing asked for before is counted at the next. How many went.
     */
    forget(addresses) {
      fold();
      return forgetAddresses(counts, addresses);
    },
  };
}
