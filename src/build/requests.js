// The builder's life: it sleeps until a build is requested, takes the request, and builds. A
// request written during a build stays, and gives one more, however many there were (ADR 0031).
// While a purge holds the builds back, it builds nothing, and the purge waits for a build that
// runs to end (ADR 0078): the builder says it builds, then looks whether a purge holds it back.

export async function buildOnRequest({ control, build, every = 1000, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), going = () => true, built = () => {} }) {
  control.building?.(false);
  while (going()) {
    if (!control.requested() || control.buildsHeld?.()) {
      await sleep(every);
      continue;
    }
    control.building?.(true);
    if (control.buildsHeld?.()) {
      control.building(false);
      continue;
    }
    try {
      control.takeRequest();
      await build();
    } finally {
      control.building?.(false);
    }
    built();
  }
}
