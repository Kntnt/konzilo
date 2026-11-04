// The builder's life: it sleeps until a build is requested, takes the request, and builds. A
// request written during a build stays, and gives one more, however many there were (ADR 0031).

export async function buildOnRequest({ control, build, every = 1000, sleep = (ms) => new Promise((go) => setTimeout(go, ms)), going = () => true, built = () => {} }) {
  while (going()) {
    if (!control.requested()) {
      await sleep(every);
      continue;
    }
    control.takeRequest();
    await build();
    built();
  }
}
