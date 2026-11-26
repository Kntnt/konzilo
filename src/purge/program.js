// The life of the purge's program (ADR 0078): it sleeps until the service asks for a purge, holds
// the builds back, waits for a build that runs to end, purges, says how it went, lets the builds
// go on and asks for one, so that the release in use is made anew from what is left. A purge that
// is done names the addresses the entry had, which the service takes out of its counts of
// addresses not found, and then writes the state again without them (ADR 0040).

import { PurgeRefusal } from './entry.js';

// `control`: as build/record.js gives it. `purge(request)`: the purge itself, which gives
// { addresses } as entry.js does, and throws where it cannot be made.
export async function purgeOnRequest({ control, purge, every = 1000, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), going = () => true, now = () => new Date(), warn = console.error }) {
  // A program stopped after its purge, before it let the builds go on, lets them go as it starts;
  // one stopped while it purged purges again.
  if (control.purgeRequest() === null) control.releaseBuilds();
  while (going()) {
    const request = control.purgeRequest();
    if (request === null || typeof request.id !== 'string') {
      await sleep(every);
      continue;
    }
    control.holdBuilds();
    while (control.isBuilding() && going()) await sleep(every);
    const { id } = request;
    control.writePurgeState({ id, state: 'running', at: now().toISOString() });
    try {
      const made = await purge(request);
      const addresses = Array.isArray(made?.addresses) ? made.addresses.filter((one) => typeof one === 'string') : [];
      control.writePurgeState({ id, state: 'done', at: now().toISOString(), ...(addresses.length > 0 ? { addresses } : {}) });
    } catch (error) {
      const reason = error instanceof PurgeRefusal ? error.reason : 'broke';
      warn(`The purge of ${request.path} was not made: ${error.stack ?? error.message}`);
      control.writePurgeState({ id, state: 'failed', reason, at: now().toISOString() });
    } finally {
      control.takePurgeRequest();
      control.releaseBuilds();
      control.request();
    }
  }
}
