// The live preview's runs of the intake (ADR 0032): the source repository as it stands, every
// saved post whatever its status and moment, and every draft someone is looking at over its
// saved version, into the preview's own content folder. One run at a time, since a run reads
// what the last one wrote.

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

// A post's status as a page of the preview shows it: `scheduled` while its moment has not come,
// whatever it says, and else `published` where it is on its way to the public site by its own.
const statusOf = ({ status, at }) => (at ? SCHEDULED : status === DRAFT ? DRAFT : PUBLISHED);

// Each page in the preview by its address, as a run left them: a post's, { kind: 'post', file,
// title, status, at, refusals }, and a term's, { kind: 'term', file, title, refusals }. A refused
// post is at the address its kept page has and at the one it would have, and a post shown there
// comes first. `notFound`: the post each 404 page is built from, by its content file.
function pagesOf(result) {
  const pages = new Map();
  const notFound = new Map();
  const refusals = Object.groupBy(result.refusals.filter(({ file }) => file !== undefined), ({ file }) => file);
  for (const { file, title, address } of result.termPages) pages.set(keyOf(address), { kind: 'term', file, title, refusals: [] });
  const posts = [...result.posts].sort((a, b) => Number(a.state !== 'refused') - Number(b.state !== 'refused'));
  for (const post of posts) {
    const { file, title, state, address, wanted } = post;
    const status = statusOf(post);
    const about = { kind: 'post', file, title, status, at: status === SCHEDULED ? post.at : null, refusals: state === 'refused' ? (refusals[file] ?? []).map(shownRefusal) : [] };
    for (const at of state === 'refused' ? [address, wanted] : state === 'live' ? [address] : []) if (at) pages.set(keyOf(at), about);
    if (post.notFound) notFound.set(post.notFound, about);
  }
  return { pages, notFound };
}

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
export function previewRunner({ site: described, source, content, adminHost = null, now = () => new Date(), images: imagesOf = imagesFrom, components = null, warn = console.error }) {
  const site = siteDescription(described);
  const drafts = new Map();
  // How many times the drafts have changed, and what the content folder was last made from, so
  // that a run with nothing new to read reads nothing.
  let changes = 0;
  let made = null;
  let pages = new Map();
  let notFound = new Map();
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

  const once = async () => {
    await source.refresh();
    if (namesWhatIsNotHere()) await source.refresh({ within: JUST_UPLOADED });
    const moment = now();
    for (const [path, { touched }] of drafts) {
      if (moment - touched <= KEPT) continue;
      drafts.delete(path);
      changes += 1;
    }
    const from = `${source.head()}\n${changes}`;
    if (from === made) return null;
    const inDrafts = new Map([...drafts].map(([path, { contents }]) => [path, contents]));
    const files = [...source.files().filter(({ path }) => !inDrafts.has(path)), ...[...inDrafts].map(([path, contents]) => ({ path, contents }))];
    const unsaved = [...drafts.values()].flatMap(({ images: own }) => own.map((image) => ({ ...image, unsaved: true })));
    const named = new Set(unsaved.map(({ path }) => path));
    const originals = [...source.originals().filter(({ path }) => !named.has(path)), ...unsaved];
    const ledgerFile = join(content, POST_IDS_FILE);
    const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : null;
    const given = { files, site, now: moment, ledger, images: await imagesFor(namedOriginals(originals, files), source.head()), adminHost, components };
    // Every saved post, whatever its status and moment. Should its check break on one, the
    // preview goes on as it was before it showed them, with the drafts someone looks at alone.
    let result;
    try {
      result = intake({ ...given, preview: files.map(({ path }) => path) });
    } catch (error) {
      warn(`The preview could not show every saved post, and shows those published and the drafts being edited: ${error.message}`);
      result = intake({ ...given, preview: [...drafts.keys()] });
    }
    writeContent(content, site, result);
    ({ pages, notFound } = pagesOf(result));
    made = from;
    return result;
  };

  const inTurn = (work) => {
    const turn = queue.then(work);
    queue = turn.catch(() => {});
    return turn;
  };

  return {
    // Why this draft cannot be looked at, or null.
    problem: (draft) => draftProblem(site, draft),

    // The content folder brought up to what is saved, with any drafts still kept: a preview's
    // first run, before its dev server starts, and the run before a page asked for in a tab of
    // its own. A run with no new commit and no draft changed reads nothing.
    refresh: () => inTurn(once),

    // What the page at `path` in the preview is built from, as the last run left it, a list's
    // later pages too: a post, { kind: 'post', file, title, status, at, refusals }, its status
    // `published`, `draft` or `scheduled` for the moment `at`, and each reason it cannot be
    // published, as take() gives them; a term, { kind: 'term', file, title, refusals }; or null,
    // for a page built from many posts or from settings, or none.
    at: (path) => pageKeys(path).map((key) => pages.get(key)).find(Boolean) ?? null,

    // What the 404 page at `path` is built from, a page that nothing else answers: the post an
    // Admin chose for it, in the language whose prefix `path` is below, the main language's below
    // none, as at() gives a post, or null where none serves.
    notFoundAt(path) {
      const language = pageLanguage(path, site.languages);
      return notFound.get(language === null || language.main ? NOT_FOUND_FILE : `${NOT_FOUND_FOLDER}/${language.tag}.md`) ?? null;
    },

    // Takes one draft, and gives what its pane shows: { address, refusals }, its page's
    // address, or null while it has none, and each reason it cannot be published, by its field
    // or its block, with its name and values, which the pane shows in the interface language.
    take({ path, fields, images: given = [] }) {
      return inTurn(async () => {
        drafts.set(path, { contents: draftFile(fields), images: given.map(unsavedImage), touched: now() });
        changes += 1;
        const result = await once();
        const refusals = result.refusals.filter(({ file }) => file === path).map(shownRefusal);
        return { address: result.ledger.posts[keyOfPath(path)]?.address ?? null, refusals };
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
    at: (path) => (runner === null ? null : runner.at(path)),
    notFoundAt: (path) => (runner === null ? null : runner.notFoundAt(path)),
  };
}
