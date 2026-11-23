// The live preview's runs of the intake (ADR 0032): the source repository as it stands, and every
// draft someone is looking at over its saved version, as the site stands at a moment of its
// timeline, now or a later moment at which something goes out, each written into the preview's
// own content folder when its dev server is to show it. One run at a time, since a run reads what
// the last one at its moment left.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { pageLanguage } from '../astro/languages.js';
import { NOT_FOUND_FILE, NOT_FOUND_FOLDER } from '../format/not-found.js';
import { DRAFT, PUBLISHED, SCHEDULED } from '../format/post-status.js';
import { keyOf } from '../format/redirects.js';
import { POST_IDS_FILE } from '../format/write.js';
import { componentChecksOf } from '../intake/component-checks.js';
import { walk, writeContent } from '../intake/content-folder.js';
import { imagesFrom, namedOriginals } from '../intake/images.js';
import { intake } from '../intake/index.js';
import { readSiteDescription, SITE_DESCRIPTION_FILE, siteDescription } from '../site-description.js';
import { draftFile, keyOfPath, pathProblem, unsavedImage } from './draft.js';

// How long a draft nobody has touched stays on the preview.
const KEPT = 15 * 60 * 1000;
// How old a checkout may be when a draft names an image it does not hold: uploading one to the
// library commits it at once, and the draft that names it comes right after.
const JUST_UPLOADED = 1000;
const NAMED_IMAGE = /\/media\/([^\s)"'>?#\\]+)/g;

// A refusal as the pane and a page of the gate's show it: by its field or its block, with its
// name and values, which they show in the interface language.
const shownRefusal = ({ field = null, block, name, values, reason }) => ({ field, ...(block ? { block } : {}), ...(name ? { name, values } : {}), reason });

// A post's status as a page of the preview shows it, at whichever moment: a draft's, and else
// `scheduled` while its moment has not come now, `at`, whatever it says, and else `published`,
// where it is on its way to the public site by its own.
const statusOf = (status, at) => (status === DRAFT ? DRAFT : at ? SCHEDULED : PUBLISHED);

// Each page in the preview by its address, as a run at a moment left them: a post's, { kind:
// 'post', file, title, status, at, refusals }, and a term's, { kind: 'term', file, title,
// refusals }. A refused post is at the address its kept page has and at the one it would have,
// and a post shown there comes first. `notFound`: the post each 404 page is built from, by its
// content file. `waiting`: the moment each post waits for now, by its source file.
function pagesOf(result, waiting) {
  const pages = new Map();
  const notFound = new Map();
  const refusals = Object.groupBy(result.refusals.filter(({ file }) => file !== undefined), ({ file }) => file);
  for (const { file, title, address } of result.termPages) pages.set(keyOf(address), { kind: 'term', file, title, refusals: [] });
  const posts = [...result.posts].sort((a, b) => Number(a.state !== 'refused') - Number(b.state !== 'refused'));
  for (const post of posts) {
    const { file, title, state, address, wanted } = post;
    const status = statusOf(post.status, waiting.get(file) ?? null);
    const about = { kind: 'post', file, title, status, at: status === SCHEDULED ? waiting.get(file) : null, refusals: state === 'refused' ? (refusals[file] ?? []).map(shownRefusal) : [] };
    for (const at of state === 'refused' ? [address, wanted] : state === 'live' ? [address] : []) if (at) pages.set(keyOf(at), about);
    if (post.notFound) notFound.set(post.notFound, about);
  }
  return { pages, notFound };
}

// What each moment of the timeline is known by: now's, and a later one's, its moment.
const NOW = 'now';
const keyOfMoment = (moment) => moment ?? NOW;

// What a run writes, as one value: two runs that would write the same give the same.
const versionOf = (result) => {
  const hash = createHash('sha256');
  for (const { path, contents } of result.files) {
    if (path === POST_IDS_FILE) continue;
    hash.update(`${path}\n`).update(contents).update('\n');
  }
  hash.update(result.keep.join('\n'));
  return hash.digest('hex').slice(0, 16);
};

// The keys a path asked for may be known by: its own, and, for a list's later page,
// `<address>page/<n>/`, its post's or its term's. None for a path no page can be at.
const pageKeys = (path) => {
  let pathname;
  try {
    pathname = new URL(path, 'http://preview').pathname;
  } catch {
    return [];
  }
  const later = /^(.*\/)page\/\d+\/?$/.exec(pathname);
  return [keyOf(pathname), ...(later ? [keyOf(later[1])] : [])];
};

const decoded = (name) => {
  try {
    return decodeURI(name);
  } catch {
    return name;
  }
};

// Why a draft cannot be looked at on a site, `site` as siteDescription() gives it, or null: it
// asks only where the draft's file lies and what it is given, so a description read without the
// components it takes answers it too.
export function draftProblem(site, { path, fields, images: given = [] } = {}) {
  const about = pathProblem(path, site);
  if (about) return about;
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return 'a draft needs its fields';
  if (!Array.isArray(given)) return 'a draft\'s images are a list';
  return given.map(unsavedImage).find(({ reason }) => reason)?.reason ?? null;
}

// `site`: the site description. `source`: where the source files come from, as source.js
// gives it. `content`: the preview's content folder. `adminHost`: as the intake takes it.
// `components`: the site's check of what its components hold, as intake/component-checks.js
// gives it, or null. `warn`: where a run that broke is told of.
//
// A moment is null for now, or a later moment on the timeline, as the intake writes one.
export function previewRunner({ site: described, source, content, adminHost = null, now = () => new Date(), images: imagesOf = imagesFrom, components = null, warn = console.error }) {
  const site = siteDescription(described);
  const drafts = new Map();
  // How many times the drafts have changed, and what was last read, so that a run with nothing
  // new to read reads nothing.
  let changes = 0;
  let input = null;
  // Each moment's last run, by its key: what it was made from, the intake's result, its pages,
  // its version and the ledger its next run goes on from.
  const runs = new Map();
  // What the content folder holds: a moment's key and version, or null.
  let held = null;
  let images = { key: null, of: () => null };
  let queue = Promise.resolve();

  const imagesFor = async (originals, head) => {
    const key = `${head}\n${originals.map(({ path, unsaved: is }) => `${is ? '+' : ''}${path}`).sort().join('\n')}`;
    if (images.key === key) return images.of;
    const media = join(content, 'media');
    const masters = new Map(walk(media).map((path) => [relative(media, path), () => readFileSync(path)]));
    images = { key, of: await imagesOf(originals, masters) };
    return images.of;
  };

  // Whether a draft names an original that has not reached this checkout.
  const namesWhatIsNotHere = () => {
    const here = new Set([...source.originals(), ...[...drafts.values()].flatMap(({ images: own }) => own)].map(({ path }) => path));
    return [...drafts.values()].some(({ contents }) => [...contents.matchAll(NAMED_IMAGE)].some(([, name]) => !here.has(`media/${decoded(name)}`)));
  };

  // What is saved, and the drafts still kept, read once for each new commit or draft changed.
  const gather = async () => {
    await source.refresh();
    if (namesWhatIsNotHere()) await source.refresh({ within: JUST_UPLOADED });
    const moment = now();
    for (const [path, { touched }] of drafts) {
      if (moment - touched <= KEPT) continue;
      drafts.delete(path);
      changes += 1;
    }
    const from = `${source.head()}\n${changes}`;
    if (from === input?.from) return;
    const inDrafts = new Map([...drafts].map(([path, { contents }]) => [path, contents]));
    const files = [...source.files().filter(({ path }) => !inDrafts.has(path)), ...[...inDrafts].map(([path, contents]) => ({ path, contents }))];
    const unsaved = [...drafts.values()].flatMap(({ images: own }) => own.map((image) => ({ ...image, unsaved: true })));
    const named = new Set(unsaved.map(({ path }) => path));
    const originals = [...source.originals().filter(({ path }) => !named.has(path)), ...unsaved];
    input = { from, files, drafts: [...drafts.keys()], images: await imagesFor(namedOriginals(originals, files), source.head()) };
  };

  // The ledger a moment's run goes on from: its own last one, else now's, else the one the
  // content folder holds from before.
  const ledgerFor = (key) => {
    const last = runs.get(key) ?? runs.get(NOW);
    if (last) return last.result.ledger;
    const file = join(content, POST_IDS_FILE);
    return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
  };

  // The moment each post waits for now, by its source file.
  const waitingNow = () => new Map((runs.get(NOW)?.result.posts ?? []).filter(({ state, at }) => state === 'waiting' && at).map(({ file, at }) => [file, at]));

  // The run at `moment`, made again where what is read has changed since, or, now's, where a
  // moment it waited for has come.
  const runAt = (moment) => {
    const key = keyOfMoment(moment);
    const last = runs.get(key);
    const clock = moment === null ? now() : new Date(moment);
    if (last?.from === input.from && !(moment === null && last.result.next && new Date(last.result.next) <= clock)) return last;
    const given = { files: input.files, site, now: clock, ledger: ledgerFor(key), images: input.images, adminHost, components };
    // Every saved post, as it stands at this moment. Should its check break on one, the preview
    // goes on as it was before it showed them, with the drafts someone looks at alone.
    let result;
    try {
      result = intake({ ...given, preview: input.files.map(({ path }) => path) });
    } catch (error) {
      warn(`The preview could not show every saved post, and shows those published and the drafts being edited: ${error.message}`);
      result = intake({ ...given, preview: input.drafts });
    }
    const made = { from: input.from, result, version: versionOf(result) };
    runs.set(key, made);
    if (moment === null) {
      // Only the moments on the timeline are kept.
      const later = new Set(timelineOf(result).map(({ at }) => at));
      for (const one of runs.keys()) if (one !== NOW && !later.has(one)) runs.delete(one);
    }
    return made;
  };

  const pagesAt = (key) => {
    const made = runs.get(key);
    if (!made) return null;
    made.pages ??= pagesOf(made.result, waitingNow());
    return made.pages;
  };

  const prepared = async (moment) => {
    if (input === null) await gather();
    runAt(null);
    return moment === null ? runs.get(NOW) : runAt(moment);
  };

  const inTurn = (work) => {
    const turn = queue.then(work);
    queue = turn.catch(() => {});
    return turn;
  };

  // The later moments at which something goes out, from now's run, each with what goes out then.
  function timelineOf(result) {
    const waiting = result.posts.filter(({ state, at }) => state === 'waiting' && at);
    const moments = [...new Set(waiting.map(({ at }) => at))].sort();
    return moments.map((at) => ({ at, posts: waiting.filter((post) => post.at === at).map(({ title, file }) => ({ title, file })) }));
  }

  return {
    // Why this draft cannot be looked at, or null.
    problem: (draft) => draftProblem(site, draft),

    // Brings in what is saved, at most as often as the source asks, and makes now's run again
    // where it has changed. A run with no new commit and no draft changed reads nothing.
    refresh: () => inTurn(async () => {
      await gather();
      runAt(null);
    }),

    // The timeline: now, { at: null, posts: [] }, then each later moment at which something
    // goes out, { at, posts }, each post that goes out then by its title and its source file.
    timeline: () => [{ at: null, posts: [] }, ...(runs.has(NOW) ? timelineOf(runs.get(NOW).result) : [])],

    // The moment on the timeline that a moment asked for stands at: the last at or before it, now
    // for one passed, or for anything that is not a moment.
    moment(asked) {
      const time = typeof asked === 'string' ? Date.parse(asked) : Number.NaN;
      if (Number.isNaN(time) || time <= now().getTime() || !runs.has(NOW)) return null;
      let chosen = null;
      for (const { at } of timelineOf(runs.get(NOW).result)) if (Date.parse(at) <= time) chosen = at;
      return chosen;
    },

    // The run at `moment` brought up to what is read, without writing it, and its version: what
    // the content folder holds while it shows that moment.
    prepare: (moment) => inTurn(async () => (await prepared(moment)).version),

    // The last version made at `moment`, or null.
    version: (moment) => runs.get(keyOfMoment(moment))?.version ?? null,

    // Whether the content folder holds the last version made at `moment`.
    shows: (moment) => held !== null && held.key === keyOfMoment(moment) && held.version === runs.get(held.key)?.version,

    // The content folder made to show `moment`, from what was last read: { changed }, whether
    // any file a page is built from was written or removed. Every image another moment shows
    // stays, for a page of it that a browser still holds.
    show: (moment) => inTurn(async () => {
      const key = keyOfMoment(moment);
      const { result, version } = await prepared(moment);
      if (held?.version === version) {
        held = { key, version };
        return { changed: false };
      }
      const others = [...runs.values()].flatMap((one) => one.result.files.map(({ path }) => path).filter((path) => path.startsWith('media/')));
      const { written, removed } = writeContent(content, site, { ...result, keep: [...new Set([...result.keep, ...others])] });
      held = { key, version };
      return { changed: [...written, ...removed].some((path) => path !== POST_IDS_FILE) };
    }),

    // What the page at `path` in the preview is built from at `moment`, as its last run left
    // it, a list's later pages too: a post, { kind: 'post', file, title, status, at, refusals },
    // its status `published`, `draft` or `scheduled` while its moment `at` has not come now, and
    // each reason it cannot be published, as take() gives them; a term, { kind: 'term', file,
    // title, refusals }; or null, for a page built from many posts or from settings, or none.
    at: (path, moment = null) => {
      const pages = pagesAt(keyOfMoment(moment))?.pages;
      return pages ? pageKeys(path).map((key) => pages.get(key)).find(Boolean) ?? null : null;
    },

    // What the 404 page at `path` is built from at `moment`, a page that nothing else answers: the
    // post an Admin chose for it, in the language whose prefix `path` is below, the main
    // language's below none, as at() gives a post, or null where none serves.
    notFoundAt(path, moment = null) {
      const notFound = pagesAt(keyOfMoment(moment))?.notFound;
      if (!notFound) return null;
      const language = pageLanguage(path, site.languages);
      return notFound.get(language === null || language.main ? NOT_FOUND_FILE : `${NOT_FOUND_FOLDER}/${language.tag}.md`) ?? null;
    },

    // Takes one draft, and gives what its pane shows: { address, refusals, moment }, its page's
    // address, or null while it has none, and each reason it cannot be published, by its field
    // or its block, with its name and values, which the pane shows in the interface language, at
    // `moment`, the one it goes out at, or null, now, where it is out already or has none.
    take({ path, fields, images: given = [] }) {
      return inTurn(async () => {
        drafts.set(path, { contents: draftFile(fields), images: given.map(unsavedImage), touched: now() });
        changes += 1;
        await gather();
        const own = runAt(null).result.posts.find(({ file }) => file === path);
        const moment = own?.state === 'waiting' && own.at ? own.at : null;
        const { result } = moment === null ? runs.get(NOW) : runAt(moment);
        const refusals = result.refusals.filter(({ file }) => file === path).map(shownRefusal);
        return { address: result.ledger.posts[keyOfPath(path)]?.address ?? null, refusals, moment };
      });
    },
  };
}

// The runs of a preview whose gate stands before the site's code is prepared, as the preview's
// container does (bin/konzilo-preview.js). `described`: the site description as read at once, in
// the site's folder, without the components it takes, which that folder need not have installed
// (site-description.js, readSiteDescriptionWithoutTakenComponents()). `prepared`: settles once the
// site's code is in `folder`, with its packages installed, from where its description is read
// again, with the components it takes, and the check of what they hold, as the builder reads them,
// and the runs begin. The rest as previewRunner() takes it. Until then a draft's problem is
// answered by `described`, take() and refresh() wait, and at() and notFoundAt() know no page.
// `ready` gives the runs, or why there are none.
export function runnerOncePrepared({ described, prepared, folder, ...options }) {
  let runner = null;
  const ready = prepared.then(async () => {
    const site = readSiteDescription(join(folder, SITE_DESCRIPTION_FILE));
    runner = previewRunner({ ...options, site, components: await componentChecksOf(site, folder) });
    return runner;
  });
  return {
    ready,
    problem: (draft) => draftProblem(described, draft),
    take: async (draft) => (await ready).take(draft),
    refresh: async () => (await ready).refresh(),
    prepare: async (moment) => (await ready).prepare(moment),
    show: async (moment) => (await ready).show(moment),
    timeline: () => (runner === null ? [{ at: null, posts: [] }] : runner.timeline()),
    moment: (asked) => (runner === null ? null : runner.moment(asked)),
    version: (moment) => (runner === null ? null : runner.version(moment)),
    shows: (moment) => (runner === null ? false : runner.shows(moment)),
    at: (path, moment) => (runner === null ? null : runner.at(path, moment)),
    notFoundAt: (path, moment) => (runner === null ? null : runner.notFoundAt(path, moment)),
  };
}
