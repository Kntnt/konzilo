// The life of the purge's program (ADR 0078): it sleeps until the service asks for a purge, holds
// the builds back, waits for a build that runs to end, purges, says how it went, lets the builds
// go on and asks for one, so that the release in use is made anew from what is left. Between
// purges it answers the service's search for a passage, which holds no build back.

import { PurgeRefusal } from './histories.js';

// `control`: as build/record.js gives it. `purge(request)`: the purge itself, which throws where
// it cannot be made, and gives, of a passage, { changed }, how much it changed. `search(request)`:
// the files and revisions that hold the passage a request names, as passage.js finds them.
export async function purgeOnRequest({ control, purge, search = async () => null, every = 1000, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), going = () => true, now = () => new Date(), warn = console.error }) {
  // A program stopped after its purge, before it let the builds go on, lets them go as it starts;
  // one stopped while it purged purges again.
  if (control.purgeRequest() === null) control.releaseBuilds();
  // A search asked for, answered: whether there was one.
  const searched = async () => {
    const request = control.searchRequest();
    if (request === null) return false;
    control.takeSearchRequest();
    if (typeof request.id !== 'string' || typeof request.passage !== 'string') return true;
    try {
      control.answerSearch({ id: request.id, found: await search(request) });
    } catch (error) {
      warn(`A search for a passage broke: ${error.stack ?? error.message}`);
      control.answerSearch({ id: request.id, failed: true });
    }
    return true;
  };
  while (going()) {
    const request = control.purgeRequest();
    if (request === null || typeof request.id !== 'string') {
      if (!await searched()) await sleep(every);
      continue;
    }
    control.holdBuilds();
    while (control.isBuilding() && going()) await sleep(every);
    const { id } = request;
    control.writePurgeState({ id, state: 'running', at: now().toISOString() });
    try {
      const made = await purge(request);
      control.writePurgeState({ id, state: 'done', ...(made?.changed ? { changed: made.changed } : {}), at: now().toISOString() });
    } catch (error) {
      const reason = error instanceof PurgeRefusal ? error.reason : 'broke';
      warn(`The purge of ${request.path ?? 'a passage'} was not made: ${error.stack ?? error.message}`);
      control.writePurgeState({ id, state: 'failed', reason, ...(error.paths ? { paths: error.paths } : {}), at: now().toISOString() });
    } finally {
      control.takePurgeRequest();
      control.releaseBuilds();
      control.request();
    }
  }
}
