// The life of the purge's program (ADR 0078): it sleeps until the service asks for a purge, holds
// the builds back, waits for a build that runs to end, purges, says how it went, lets the builds
// go on and asks for one, so that the release in use is made anew from what is left. A purge of an
// entry that is done names the addresses the entry had, which the service takes out of its counts
// of addresses not found, and then writes the state again without them (ADR 0040); a purge of a
// passage changes no address, and names none. A purge that pushed the source and then stopped or
// broke is unfinished: the builds stay held back, as the history is half rewritten, no other purge
// is made, and once the service asks for it to be finished, by its name, it goes on from the first
// step it had not taken, as it was asked for. Between purges it answers the service's search for
// a passage, which holds no build back.

import { progressOf } from './control.js';
import { PurgeRefusal } from './histories.js';

// Whether a purge's progress, as control.js keeps it, says it is unfinished: its source pushed.
const unfinished = (progress) => progress !== null && progress.steps.includes('source');

// `control`: as build/record.js gives it, for the builds. `purgeControl`: as control.js gives it,
// for what the service asks. `purge(request, progress)`: the purge itself, `progress` as
// control.js's progressOf() gives it, which throws where it cannot be made, and gives, of an
// entry, { addresses } as entry.js does, and of a passage, { changed }, how much it changed.
// `search(request)`: the files and revisions that hold the passage a request names, as passage.js
// finds them.
export async function purgeOnRequest({ control, purgeControl, purge, search = async () => null, every = 1000, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), going = () => true, now = () => new Date(), warn = console.error }) {
  // A program stopped after its purge, before it let the builds go on, lets them go as it starts,
  // unless the purge is unfinished; one stopped while it purged purges again.
  if (purgeControl.purgeRequest() === null && !unfinished(purgeControl.progress())) control.releaseBuilds();
  // A search asked for, answered: whether there was one.
  const searched = async () => {
    const request = purgeControl.searchRequest();
    if (request === null) return false;
    purgeControl.takeSearchRequest();
    if (typeof request.id !== 'string' || typeof request.passage !== 'string') return true;
    try {
      purgeControl.answerSearch({ id: request.id, found: await search(request) });
    } catch (error) {
      warn(`A search for a passage broke: ${error.stack ?? error.message}`);
      purgeControl.answerSearch({ id: request.id, failed: true });
    }
    return true;
  };
  const say = (state) => purgeControl.writePurgeState({ ...state, at: now().toISOString() });
  while (going()) {
    const request = purgeControl.purgeRequest();
    if (request === null) {
      if (!await searched()) await sleep(every);
      continue;
    }
    control.holdBuilds();
    while (control.isBuilding() && going()) await sleep(every);
    const { id } = request;
    // The purge an unfinished one left, which is finished as it was asked for; another waits.
    const kept = purgeControl.progress();
    if ((unfinished(kept) && kept.id !== id) || (request.finish === true && kept?.id !== id)) {
      say({ id, state: 'failed', reason: unfinished(kept) ? 'unfinished' : 'broke' });
      purgeControl.takePurgeRequest(id);
      if (!unfinished(kept)) control.releaseBuilds();
      continue;
    }
    const progress = progressOf(purgeControl, kept?.id === id ? kept : { id, request, steps: [] });
    say({ id, state: 'running' });
    let left = false;
    try {
      const made = await purge(progress.request, progress);
      const addresses = Array.isArray(made?.addresses) ? made.addresses.filter((one) => typeof one === 'string') : [];
      say({ id, state: 'done', ...(made?.changed ? { changed: made.changed } : {}), ...(addresses.length > 0 ? { addresses } : {}) });
      purgeControl.takeProgress(id);
    } catch (error) {
      const what = progress.request.path ?? 'a passage';
      if (progress.has('source')) {
        left = true;
        warn(`The purge of ${what} is unfinished, its source pushed: ${error.stack ?? error.message}`);
        say({ id, state: 'unfinished' });
      } else {
        const reason = error instanceof PurgeRefusal ? error.reason : 'broke';
        warn(`The purge of ${what} was not made: ${error.stack ?? error.message}`);
        say({ id, state: 'failed', reason, ...(error.paths ? { paths: error.paths } : {}) });
        purgeControl.takeProgress(id);
      }
    } finally {
      purgeControl.takePurgeRequest(id);
      if (!left) {
        control.releaseBuilds();
        control.request();
      }
    }
  }
}
