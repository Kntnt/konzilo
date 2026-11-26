// The life of the purge's program (ADR 0078): it sleeps until the service asks for a purge, holds
// the builds back, waits for a build that runs to end, purges, says how it went, lets the builds
// go on and asks for one, so that the release in use is made anew from what is left. A purge of an
// entry that is done names the addresses the entry had, which the service takes out of its counts
// of addresses not found, and then writes the state again without them (ADR 0040); a purge of a
// passage changes no address, and names none. Between purges it answers the service's search for
// a passage, which holds no build back.

import { PurgeRefusal } from './histories.js';

// `control`: as build/record.js gives it, for the builds. `purgeControl`: as control.js gives it,
// for what the service asks. `purge(request)`: the purge itself, which throws where
// it cannot be made, and gives, of an entry, { addresses } as entry.js does, and of a passage,
// { changed }, how much it changed. `search(request)`: the files and revisions that hold the
// passage a request names, as passage.js finds them.
export async function purgeOnRequest({ control, purgeControl, purge, search = async () => null, every = 1000, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), going = () => true, now = () => new Date(), warn = console.error }) {
  // A program stopped after its purge, before it let the builds go on, lets them go as it starts;
  // one stopped while it purged purges again.
  if (purgeControl.purgeRequest() === null) control.releaseBuilds();
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
  while (going()) {
    const request = purgeControl.purgeRequest();
    if (request === null) {
      if (!await searched()) await sleep(every);
      continue;
    }
    control.holdBuilds();
    while (control.isBuilding() && going()) await sleep(every);
    const { id } = request;
    purgeControl.writePurgeState({ id, state: 'running', at: now().toISOString() });
    try {
      const made = await purge(request);
      const addresses = Array.isArray(made?.addresses) ? made.addresses.filter((one) => typeof one === 'string') : [];
      purgeControl.writePurgeState({ id, state: 'done', ...(made?.changed ? { changed: made.changed } : {}), at: now().toISOString(), ...(addresses.length > 0 ? { addresses } : {}) });
    } catch (error) {
      const reason = error instanceof PurgeRefusal ? error.reason : 'broke';
      warn(`The purge of ${request.path ?? 'a passage'} was not made: ${error.stack ?? error.message}`);
      purgeControl.writePurgeState({ id, state: 'failed', reason, ...(error.paths ? { paths: error.paths } : {}), at: now().toISOString() });
    } finally {
      purgeControl.takePurgeRequest(id);
      control.releaseBuilds();
      control.request();
    }
  }
}
