// The feed reader (ADR 0079): a timed duty of the service in its role for editors (ADR 0044),
// which alone has a way out, that reads each incoming feed an Admin has added at its interval, and
// makes, corrects and deletes the posts that mirror its items, each read one commit to the source
// repository by an account of its own, the feed reader's, so that the History and the build's role
// check name it. A site with no feeds reads nothing and reaches nothing. A feed that cannot be
// read, or whose answer is no feed, is tried again at its next interval, its failure kept until a
// read succeeds; so is one whose posts could not be saved, which changes nothing it knows.
//
// Removing a feed releases its posts first: one commit takes out of each what marks it as the
// feed's, so that it is a post like any other, and only then is the feed forgotten.

import { randomUUID } from 'node:crypto';
import { lookup as resolved } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

import { FEED_FAILURES } from '../feeds/failures.js';
import { saveAgain } from '../forgejo-saves.js';
import { readFeed } from '../feeds/read.js';
import { feedPostFile, freeSlug, postDate, releasedFile, slugHeld } from '../feeds/post.js';
import { reconcile } from '../feeds/reconcile.js';

// The branch the editor saves to, which the feed reader saves to as well.
const BRANCH = 'main';
// The most a feed's answer may be, and how long a read may take, its answer whole.
export const FEED_BYTES = 5 * 1024 * 1024;
export const FEED_WAIT = 30_000;

const ACCEPT = 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1';
const moment = (date) => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const encodedPath = (path) => path.split('/').map(encodeURIComponent).join('/');

// The text of an answer, decoded by the charset its type names, else the one its XML declaration
// names, else UTF-8.
function decoded(bytes, type) {
  const named = /charset\s*=\s*"?([\w.:-]+)/i.exec(type ?? '')?.[1] ?? /^<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)/.exec(bytes.subarray(0, 200).toString('latin1'))?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(named).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

// The addresses no feed is read from, unless a setting names its host (ADR 0079), since what the
// reader reaches is the service's own network, Forgejo and the site's other containers among it:
// the loopback, the private networks of RFC 1918, link-local and unique-local addresses, those of
// carrier-grade NAT (RFC 6598) and the unspecified address, an IPv4 address mapped into IPv6 too.
const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16]]) NOT_PUBLIC.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [['::', 128], ['::1', 128], ['fc00::', 7], ['fe80::', 10]]) NOT_PUBLIC.addSubnet(network, prefix, 'ipv6');

// The most redirects a read follows, and the statuses that redirect.
const REDIRECTS = 5;
const REDIRECTING = new Set([301, 302, 303, 307, 308]);

// Whether an address may be read: its host is one of `privateHosts`, or every address it leads to,
// by `lookup`, as DNS answers, is public. Throws where its host leads nowhere.
async function mayRead(url, { lookup, privateHosts }) {
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1').toLowerCase();
  if (privateHosts.includes(host)) return true;
  const found = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  return found.length > 0 && found.every(({ address }) => !NOT_PUBLIC.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4'));
}

// Each piece of `stream`, until `stopped` throws.
async function* untilStopped(stream, stopped) {
  const pieces = stream[Symbol.asyncIterator]();
  for (;;) {
    const { done, value } = await Promise.race([pieces.next(), stopped]);
    if (done) return;
    yield value;
  }
}

// A feed's answer: { text }, or { failure: { kind, status } }, `kind` one of `unreachable`,
// `timeout`, `status`, with the HTTP `status` it answered, `too-large`, and `not-public`, for an
// address, or one a redirect leads to, on the service's own network or another private one, of
// which nothing more is said. Redirects are followed by hand, at most five, each address checked
// before it is asked. `lookup`: what tells the addresses a host leads to, as DNS does.
// `privateHosts`: the hosts a feed may be read from despite a private address. `stop`: a signal
// that gives the read up before its time, as the feed's removal does.
export async function fetchFeed(address, { get = fetch, lookup = resolved, privateHosts = [], bytes = FEED_BYTES, waitAtMost = FEED_WAIT, stop = null } = {}) {
  const signal = stop ? AbortSignal.any([AbortSignal.timeout(waitAtMost), stop]) : AbortSignal.timeout(waitAtMost);
  const failed = (error) => ({ failure: { kind: error?.name === 'TimeoutError' || signal.aborted ? FEED_FAILURES.TIMEOUT : FEED_FAILURES.UNREACHABLE } });
  const unreachable = { failure: { kind: FEED_FAILURES.UNREACHABLE } };
  // What does not answer within the wait is given up, whether or not it heeds the signal.
  const givenUp = new Promise((_, giveUp) => signal.addEventListener('abort', () => giveUp(signal.reason), { once: true }));
  givenUp.catch(() => {});
  let url;
  try {
    url = new URL(address);
  } catch {
    return unreachable;
  }
  let answer;
  for (let followed = 0; ; followed += 1) {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return unreachable;
    try {
      if (!await Promise.race([mayRead(url, { lookup, privateHosts }), givenUp])) return { failure: { kind: FEED_FAILURES.NOT_PUBLIC } };
      answer = await Promise.race([get(url.href, { signal, redirect: 'manual', headers: { accept: ACCEPT, 'user-agent': 'Konzilo feed reader' } }), givenUp]);
    } catch (error) {
      return failed(error);
    }
    const location = REDIRECTING.has(answer.status) ? answer.headers.get('location') : null;
    if (location === null) break;
    await answer.body?.cancel().catch(() => {});
    if (followed >= REDIRECTS) return unreachable;
    try {
      url = new URL(location, url);
    } catch {
      return unreachable;
    }
  }
  if (!answer.ok) {
    await answer.body?.cancel().catch(() => {});
    return { failure: { kind: FEED_FAILURES.STATUS, status: answer.status } };
  }
  if (Number(answer.headers.get('content-length') ?? 0) > bytes) {
    await answer.body?.cancel().catch(() => {});
    return { failure: { kind: FEED_FAILURES.TOO_LARGE } };
  }
  const pieces = [];
  let length = 0;
  try {
    for await (const piece of untilStopped(answer.body ?? [], givenUp)) {
      length += piece.length;
      if (length > bytes) {
        await answer.body.cancel().catch(() => {});
        return { failure: { kind: FEED_FAILURES.TOO_LARGE } };
      }
      pieces.push(Buffer.from(piece));
    }
  } catch (error) {
    return failed(error);
  }
  return { text: decoded(Buffer.concat(pieces), answer.headers.get('content-type')) };
}

// `store`: the service's data, as store.js opens it. `site()`: the site description in use, as
// checked. `forgejo`, `repository`: where the source repository is. `token`: the feed reader's
// credential, which may write it, or null where the seed made none. `get`: what reaches the feeds
// and Forgejo, and `lookup`, `privateHosts`: as fetchFeed() takes them. `newId()`: a new post's ID,
// as the editor makes one.
//
// Gives { run(), read(id), release(id) }: `run` reads each feed whose interval has passed, one
// after another; `read` reads one now, whatever its interval; `release` releases a feed's posts
// and forgets it, or throws where they could not be saved, the feed then kept. What is asked of a
// feed waits for what was asked of it before, so that no two touch a feed at once, but for no
// other feed's; and a release gives up the feed's read under way, which then keeps nothing.
export function feedReader({ store, site, forgejo, repository, token, get = fetch, lookup = resolved, privateHosts = [], now = () => new Date(), warn = console.error, newId = () => randomUUID().replace(/-/g, '').slice(-12), bytes = FEED_BYTES, waitAtMost = FEED_WAIT, pause = (ms) => new Promise((go) => setTimeout(go, ms)) }) {
  const asked = (path, init = {}) => get(`${forgejo}/api/v1/repos/${repository}${path}`, { ...init, headers: { ...init.headers, authorization: `token ${token}` } });

  // A source file as the branch holds it: { text, sha }, or null where it holds none.
  const fileOf = async (path) => {
    const answer = await asked(`/contents/${encodedPath(path)}?ref=${BRANCH}`);
    if (!answer.ok) await answer.arrayBuffer().catch(() => {});
    if (answer.status === 404) return null;
    if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} for ${path}`);
    const { content, sha } = await answer.json();
    return { text: Buffer.from(content ?? '', 'base64').toString('utf8'), sha };
  };

  // One commit of `changes`, each { path, text } to write, or { path, gone: true } to delete, each
  // made against the file as the branch holds it, and tried again where another commit came first.
  const commit = async (changes, message) => {
    if (token === null) throw new Error('the feed reader has no credential');
    for (let tried = 1; ; tried += 1) {
      const files = [];
      for (const change of changes) {
        const held = await fileOf(change.path);
        if (change.gone) {
          if (held) files.push({ operation: 'delete', path: change.path, sha: held.sha });
        } else if (held === null) {
          files.push({ operation: 'create', path: change.path, content: Buffer.from(change.text).toString('base64') });
        } else if (held.text !== change.text) {
          files.push({ operation: 'update', path: change.path, sha: held.sha, content: Buffer.from(change.text).toString('base64') });
        }
      }
      if (files.length === 0) return;
      const answer = await asked('/contents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ branch: BRANCH, message, files }) });
      await answer.arrayBuffer().catch(() => {});
      if (answer.ok) return;
      if (!await saveAgain(answer.status, tried, pause)) throw new Error(`Forgejo answered ${answer.status} to the feed reader's save`);
    }
  };

  const typeOfPath = (path) => Object.values(site().types).find(({ collection }) => collection === path.split('/')[0]) ?? null;

  // The slugs the posts in a folder of the source hold, as the branch holds them, each file read
  // once for each version of it, which Forgejo's listing names.
  const slugsBy = new Map();
  const slugsIn = async (folder) => {
    const answer = await asked(`/contents/${encodedPath(folder)}?ref=${BRANCH}`);
    if (!answer.ok) await answer.arrayBuffer().catch(() => {});
    if (answer.status === 404) return new Set();
    if (!answer.ok) throw new Error(`Forgejo answered ${answer.status} for ${folder}`);
    const listed = await answer.json();
    const held = new Set();
    for (const { type, path, sha } of Array.isArray(listed) ? listed : []) {
      if (type !== 'file' || !path.endsWith('.md')) continue;
      if (!slugsBy.has(sha)) {
        const file = await fileOf(path);
        slugsBy.set(sha, file === null ? null : slugHeld(file.text));
      }
      if (slugsBy.get(sha)) held.add(slugsBy.get(sha));
    }
    return held;
  };
  const folderOf = (path) => path.slice(0, path.lastIndexOf('/'));

  const readOne = async (feed, stop) => {
    const at = now();
    const atText = moment(at);
    const failed = (failure) => store.feedRead(feed.id, { at, failure: { at: atText, ...failure } });
    const answer = await fetchFeed(feed.address, { get, lookup, privateHosts, bytes, waitAtMost, stop });
    if (stop.aborted) return undefined;
    if (answer.failure) return failed(answer.failure);
    const read = readFeed(answer.text, feed.address);
    if (read.problem) return failed({ kind: read.problem });
    const described = site();
    const type = Object.hasOwn(described.types, feed.type) ? described.types[feed.type] : null;
    if (type === null) return failed({ kind: FEED_FAILURES.NO_TYPE });
    const known = store.feedItems(feed.id);
    const done = reconcile({ known, first: !feed.firstRead, items: read.items, now: atText });
    const tag = described.languages.length > 1 ? feed.language : null;
    const changes = [];
    const kept = [];
    for (const item of done.hold) kept.push({ item: item.id, seen: atText, moment: postDate(item, { seen: atText, now: atText }), state: 'held' });
    // The slugs taken in each folder a post is made in, the source's and those this read gives. A
    // new post's slug is one no other post there holds, the oldest item's chosen first; one made
    // again takes its own where it is still free; a correction keeps its own.
    const taken = new Map();
    const takenIn = async (path) => {
      if (!taken.has(folderOf(path))) taken.set(folderOf(path), await slugsIn(folderOf(path)));
      return taken.get(folderOf(path));
    };
    const dateOf = ({ item }) => postDate(item, { seen: atText, now: atText });
    try {
      for (const { item } of [...done.make].sort((one, other) => (dateOf(one) < dateOf(other) ? -1 : dateOf(one) > dateOf(other) ? 1 : 0))) {
        const path = `${type.collection}/${tag ? `${tag}/` : ''}${newId()}.md`;
        const held = await takenIn(path);
        const file = feedPostFile(item, { site: described, type, seen: atText, now: atText, slug: freeSlug(item, held) });
        held.add(file.slug);
        changes.push({ path, text: file.text });
        kept.push({ item: item.id, seen: atText, moment: file.date, state: 'live', path, version: file.version, slug: file.slug });
      }
      for (const { item, known: held } of done.restore) {
        const slugs = await takenIn(held.path);
        const file = feedPostFile(item, { site: described, type: typeOfPath(held.path) ?? type, seen: held.seen, now: atText, slug: slugs.has(held.slug) ? freeSlug(item, slugs) : held.slug });
        slugs.add(file.slug);
        changes.push({ path: held.path, text: file.text });
        kept.push({ item: item.id, seen: held.seen, moment: file.date, state: 'live', path: held.path, version: file.version, slug: file.slug });
      }
    } catch (error) {
      warn(`The feed reader could not tell the slugs of ${type.collection} for ${feed.address}: ${error.message}`);
      return failed({ kind: FEED_FAILURES.NOT_SAVED });
    }
    for (const { item, known: held } of done.correct) {
      const file = feedPostFile(item, { site: described, type: typeOfPath(held.path) ?? type, seen: held.seen, now: atText, slug: held.slug });
      changes.push({ path: held.path, text: file.text });
      kept.push({ item: item.id, seen: held.seen, moment: file.date, state: 'live', path: held.path, version: file.version, slug: file.slug });
    }
    for (const { id, ...held } of done.withdraw) {
      changes.push({ path: held.path, gone: true });
      kept.push({ item: id, ...held, state: 'withdrawn' });
    }
    if (changes.length > 0) {
      try {
        await commit(changes, `Read the feed ${feed.address}`);
      } catch (error) {
        warn(`The feed reader could not save what it read of ${feed.address}: ${error.message}`);
        return failed({ kind: FEED_FAILURES.NOT_SAVED });
      }
    }
    return store.feedRead(feed.id, { at, items: kept });
  };

  // What is asked of a feed waits for what was asked of it before, each feed's in a queue of its
  // own, with the read under way, which a release stops.
  const turns = new Map();
  const inTurn = (id, work) => {
    const held = turns.get(id) ?? { queue: Promise.resolve(), reading: null };
    turns.set(id, held);
    const turn = held.queue.then(() => work(held));
    held.queue = turn.catch(() => {});
    return turn;
  };
  const feedOf = (id) => store.feeds().find((one) => one.id === id) ?? null;
  const readNow = async (held, feed) => {
    held.reading = new AbortController();
    try {
      await readOne(feed, held.reading.signal);
    } finally {
      held.reading = null;
    }
  };
  const due = (feed, at) => feed.readAt === null || at - new Date(feed.readAt).getTime() >= feed.every * 60_000 - 5000;

  // A run asked for while one is running is the one running.
  let running = null;
  return {
    run: () => (running ??= (async () => {
      for (const { id } of store.feeds()) {
        await inTurn(id, async (held) => {
          const feed = feedOf(id);
          if (feed === null || !due(feed, now().getTime())) return;
          try {
            await readNow(held, feed);
          } catch (error) {
            warn(`The feed reader broke on ${feed.address}: ${error.stack ?? error.message}`);
          }
        });
      }
    })().finally(() => {
      running = null;
    })),
    read: (id) => inTurn(id, async (held) => {
      const feed = feedOf(id);
      if (feed) await readNow(held, feed);
    }),
    release: (id) => {
      turns.get(id)?.reading?.abort();
      return inTurn(id, async () => {
        const feed = feedOf(id);
        if (!feed) {
          turns.delete(id);
          return 0;
        }
        const posts = store.feedPosts().filter((post) => post.feed === id);
        const changes = [];
        for (const { path } of posts) {
          const held = await fileOf(path);
          if (held) changes.push({ path, text: releasedFile(held.text) });
        }
        if (changes.length > 0) await commit(changes, `Release the posts of the feed ${feed.address}`);
        store.removeFeed(id);
        turns.delete(id);
        return posts.length;
      });
    },
  };
}
