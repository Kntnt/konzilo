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

import { readFeed } from '../feeds/read.js';
import { feedPostFile, postDate, releasedFile } from '../feeds/post.js';
import { reconcile } from '../feeds/reconcile.js';

// The branch the editor saves to, which the feed reader saves to as well.
const BRANCH = 'main';
// The most a feed's answer may be, and how long a read may take, its answer whole.
export const FEED_BYTES = 5 * 1024 * 1024;
export const FEED_WAIT = 30_000;
// A save Git turns away because another commit came first is tried again, as the editor's is.
const TRIES = 4;

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

// Each piece of `stream`, until `stopped` throws.
async function* race(stream, stopped) {
  const pieces = stream[Symbol.asyncIterator]();
  for (;;) {
    const { done, value } = await Promise.race([pieces.next(), stopped]);
    if (done) return;
    yield value;
  }
}

// A feed's answer: { text }, or { failure: { kind, status } }, `kind` one of `unreachable`,
// `timeout`, `status`, with the HTTP `status` it answered, and `too-large`.
export async function fetchFeed(address, { get = fetch, bytes = FEED_BYTES, waitAtMost = FEED_WAIT } = {}) {
  const signal = AbortSignal.timeout(waitAtMost);
  const failed = (error) => ({ failure: { kind: error?.name === 'TimeoutError' || signal.aborted ? 'timeout' : 'unreachable' } });
  // What does not answer within the wait is given up, whether or not it heeds the signal.
  const given = new Promise((_, giveUp) => signal.addEventListener('abort', () => giveUp(signal.reason), { once: true }));
  given.catch(() => {});
  let answer;
  try {
    answer = await Promise.race([get(address, { signal, redirect: 'follow', headers: { accept: ACCEPT, 'user-agent': 'Konzilo feed reader' } }), given]);
  } catch (error) {
    return failed(error);
  }
  if (!answer.ok) {
    await answer.body?.cancel().catch(() => {});
    return { failure: { kind: 'status', status: answer.status } };
  }
  if (Number(answer.headers.get('content-length') ?? 0) > bytes) {
    await answer.body?.cancel().catch(() => {});
    return { failure: { kind: 'too-large' } };
  }
  const pieces = [];
  let length = 0;
  try {
    for await (const piece of race(answer.body ?? [], given)) {
      length += piece.length;
      if (length > bytes) {
        await answer.body.cancel().catch(() => {});
        return { failure: { kind: 'too-large' } };
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
// and Forgejo. `newId()`: a new post's ID, as the editor makes one.
//
// Gives { run(), read(id), release(id) }: `run` reads each feed whose interval has passed, one
// after another; `read` reads one now, whatever its interval; `release` releases a feed's posts
// and forgets it, or throws where they could not be saved, the feed then kept. Each waits for the
// one before, so that no two touch a feed at once.
export function feedReader({ store, site, forgejo, repository, token, get = fetch, now = () => new Date(), warn = console.error, newId = () => randomUUID().replace(/-/g, '').slice(-12), bytes = FEED_BYTES, waitAtMost = FEED_WAIT, pause = (ms) => new Promise((go) => setTimeout(go, ms)) }) {
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
      const again = [409, 422, 423].includes(answer.status) || answer.status >= 500;
      if (!again || tried >= TRIES) throw new Error(`Forgejo answered ${answer.status} to the feed reader's save`);
      await pause(200 * tried);
    }
  };

  const typeOfPath = (path) => Object.values(site().types).find(({ collection }) => collection === path.split('/')[0]) ?? null;

  const readOne = async (feed) => {
    const at = now();
    const atText = moment(at);
    const failed = (failure) => store.feedRead(feed.id, { at, failure: { at: atText, ...failure } });
    const answer = await fetchFeed(feed.address, { get, bytes, waitAtMost });
    if (answer.failure) return failed(answer.failure);
    const read = readFeed(answer.text, feed.address);
    if (read.problem) return failed({ kind: read.problem });
    const described = site();
    const type = Object.hasOwn(described.types, feed.type) ? described.types[feed.type] : null;
    if (type === null) return failed({ kind: 'no-type' });
    const known = store.feedItems(feed.id);
    const done = reconcile({ known, first: !feed.firstRead, items: read.items, now: atText });
    const tag = described.languages.length > 1 ? feed.language : null;
    const changes = [];
    const kept = [];
    for (const item of done.hold) kept.push({ item: item.id, seen: atText, moment: postDate(item, { seen: atText, now: atText }), state: 'held' });
    for (const { item } of done.make) {
      const path = `${type.collection}/${tag ? `${tag}/` : ''}${newId()}.md`;
      const file = feedPostFile(item, { site: described, type, seen: atText, now: atText });
      changes.push({ path, text: file.text });
      kept.push({ item: item.id, seen: atText, moment: file.date, state: 'live', path, version: file.version, slug: file.slug });
    }
    for (const { item, known: held } of [...done.correct, ...done.restore]) {
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
        return failed({ kind: 'not-saved' });
      }
    }
    return store.feedRead(feed.id, { at, items: kept });
  };

  // What is asked of the reader waits for what was asked before.
  let queue = Promise.resolve();
  const inTurn = (work) => {
    const turn = queue.then(work);
    queue = turn.catch(() => {});
    return turn;
  };
  const due = (feed, at) => feed.readAt === null || at - new Date(feed.readAt).getTime() >= feed.every * 60_000 - 5000;

  // A run asked for while one is running is the one running.
  let running = null;
  return {
    run: () => (running ??= inTurn(async () => {
      for (const feed of store.feeds()) {
        if (!due(feed, now().getTime())) continue;
        try {
          await readOne(feed);
        } catch (error) {
          warn(`The feed reader broke on ${feed.address}: ${error.stack ?? error.message}`);
        }
      }
    }).finally(() => {
      running = null;
    })),
    read: (id) => inTurn(async () => {
      const feed = store.feeds().find((one) => one.id === id);
      if (feed) await readOne(feed);
    }),
    release: (id) => inTurn(async () => {
      const feed = store.feeds().find((one) => one.id === id);
      if (!feed) return 0;
      const posts = store.feedPosts().filter((post) => post.feed === id);
      const changes = [];
      for (const { path } of posts) {
        const held = await fileOf(path);
        if (held) changes.push({ path, text: releasedFile(held.text) });
      }
      if (changes.length > 0) await commit(changes, `Release the posts of the feed ${feed.address}`);
      store.removeFeed(id);
      return posts.length;
    }),
  };
}
