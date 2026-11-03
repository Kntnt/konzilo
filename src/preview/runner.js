// The live preview's runs of the intake (ADR 0032): the source repository as it stands, and
// every draft someone is looking at, into the preview's own content folder. One run at a
// time, since a run reads what the last one wrote.

import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { POST_IDS_FILE } from '../format/write.js';
import { walk, writeContent } from '../intake/content-folder.js';
import { imagesFrom } from '../intake/images.js';
import { intake } from '../intake/index.js';
import { siteDescription } from '../site-description.js';
import { draftFile, keyOfPath, pathProblem, unsavedImage } from './draft.js';

// How long a draft nobody has touched stays on the preview.
const KEPT = 15 * 60 * 1000;

// `site`: the site description. `source`: where the source files come from, as source.js
// gives it. `content`: the preview's content folder. `adminHost`: as the intake takes it.
export function previewRunner({ site: described, source, content, adminHost = null, now = () => new Date(), images: imagesOf = imagesFrom }) {
  const site = siteDescription(described);
  const drafts = new Map();
  let images = { key: null, of: () => null };
  let queue = Promise.resolve();

  const imagesFor = async (originals, head) => {
    const unsaved = originals.filter(({ unsaved: is }) => is).map(({ path }) => path).sort().join('\n');
    const key = `${head}\n${unsaved}`;
    if (images.key === key) return images.of;
    const media = join(content, 'media');
    const masters = new Map(walk(media).map((path) => [relative(media, path), () => readFileSync(path)]));
    images = { key, of: await imagesOf(originals, masters) };
    return images.of;
  };

  const once = async () => {
    await source.refresh();
    const moment = now();
    for (const [path, { touched }] of drafts) if (moment - touched > KEPT) drafts.delete(path);
    const inDrafts = new Map([...drafts].map(([path, { contents }]) => [path, contents]));
    const files = [...source.files().filter(({ path }) => !inDrafts.has(path)), ...[...inDrafts].map(([path, contents]) => ({ path, contents }))];
    const unsaved = [...drafts.values()].flatMap(({ images: own }) => own.map((image) => ({ ...image, unsaved: true })));
    const named = new Set(unsaved.map(({ path }) => path));
    const originals = [...source.originals().filter(({ path }) => !named.has(path)), ...unsaved];
    const ledgerFile = join(content, POST_IDS_FILE);
    const ledger = existsSync(ledgerFile) ? JSON.parse(readFileSync(ledgerFile, 'utf8')) : null;
    const result = intake({ files, site, now: moment, ledger, images: await imagesFor(originals, source.head()), adminHost, preview: [...drafts.keys()] });
    writeContent(content, site, result);
    return result;
  };

  const inTurn = (work) => {
    const turn = queue.then(work);
    queue = turn.catch(() => {});
    return turn;
  };

  return {
    // Why this draft cannot be looked at, or null.
    problem({ path, fields, images: given = [] } = {}) {
      const about = pathProblem(path, site);
      if (about) return about;
      if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) return 'a draft needs its fields';
      if (!Array.isArray(given)) return 'a draft\'s images are a list';
      return given.map(unsavedImage).find(({ reason }) => reason)?.reason ?? null;
    },

    // The content folder from the source alone, and any drafts still kept: a preview's first
    // run, before its dev server starts.
    refresh: () => inTurn(once),

    // Takes one draft, and gives what its pane shows: { address, refusals }, its page's
    // address, or null while it has none, and each reason it cannot be published, by its field.
    take({ path, fields, images: given = [] }) {
      return inTurn(async () => {
        drafts.set(path, { contents: draftFile(fields), images: given.map(unsavedImage), touched: now() });
        const result = await once();
        const refusals = result.refusals.filter(({ file }) => file === path).map(({ field = null, reason }) => ({ field, reason }));
        return { address: result.ledger.posts[keyOfPath(path)]?.address ?? null, refusals };
      });
    },
  };
}
